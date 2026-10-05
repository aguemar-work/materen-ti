// Alta de licencia con el correo "al vuelo" sobre la RPC crear_licencia_con_cuenta
// (migración 101): argumentos NOMBRADOS, secretos que viajan YA cifrados (invariante
// 2), el store que decide entre el insert directo y la RPC, y la maqueta que la
// simula con los mismos rechazos (SQLSTATE y texto) que el servidor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const llamadas = [];
const inserciones = [];
let respuestaRpc = () => ({ data: { id: 'lic-1' }, error: null });

function consulta(tabla) {
  const qb = {
    insert(filas) { inserciones.push({ tabla, filas }); return qb; },
    select() { return qb; },
    is() { return qb; }, eq() { return qb; }, in() { return qb; }, or() { return qb; },
    neq() { return qb; }, not() { return qb; }, lt() { return qb; }, gte() { return qb; }, lte() { return qb; },
    order() { return qb; }, range() { return qb; },
    single: async () => ({ data: { id: 'lic-directa' }, error: null }),
    then(res) { return Promise.resolve({ data: [], count: 0, error: null }).then(res); },
  };
  return qb;
}

vi.mock('../src/api/client.js', () => ({
  getClient: () => ({
    database: {
      from: (tabla) => consulta(tabla),
      rpc: async (nombre, args) => {
        llamadas.push({ nombre, args });
        return respuestaRpc(nombre, args);
      },
    },
  }),
}));
vi.mock('../src/api/passwords.js', () => ({
  cifrarPassword: vi.fn(async (v) => (v ? `enc2:AAAA:${btoa(v)}` : null)),
}));

import { licenciasApi } from '../src/api/domains/licencias.js';
import { useLicenciasStore } from '../src/stores/licencias.js';
import { traducirErrorDb } from '../src/api/erroresDb.js';
import { TABLAS } from '../src/maqueta/datos.js';
import { RPC_LICENCIAS } from '../src/maqueta/rpc-licencias.js';

beforeEach(() => {
  llamadas.length = 0;
  inserciones.length = 0;
  respuestaRpc = () => ({ data: { id: 'lic-1' }, error: null });
  setActivePinia(createPinia());
});

const DATOS = {
  software: ' AutoCAD ', tipo: 'suscripcion', cantidad: 3, empresa_id: '', proveedor: 'Autodesk',
  fecha_vencimiento: '2027-01-31', renovacion_meses: '12', costo: '6240', moneda: 'USD',
  cuenta_id: 'cuenta-vieja', clave: 'SERIAL-123', notas: '',
};
const CUENTA = { plataforma_id: 'autodesk', usuario: ' Autodesk@Materen.PE ', password: 'Secreta#1', tipo_cuenta: 'compartida' };

describe('licenciasApi.createLicenciaConCuenta — RPC de la migración 101', () => {
  it('manda licencia y cuenta a crear_licencia_con_cuenta con argumentos nombrados y devuelve el id', async () => {
    const id = await licenciasApi.createLicenciaConCuenta(DATOS, CUENTA);
    expect(id).toBe('lic-1');
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].nombre).toBe('crear_licencia_con_cuenta');
    const { p_licencia, p_cuenta } = llamadas[0].args;
    expect(p_licencia).toMatchObject({
      software: 'AutoCAD', tipo: 'suscripcion', cantidad: 3, proveedor: 'Autodesk',
      fecha_vencimiento: '2027-01-31', renovacion_meses: 12, costo: 6240, moneda: 'USD', notas: null,
    });
    expect(p_cuenta).toMatchObject({
      plataforma_id: 'autodesk', usuario: 'autodesk@materen.pe', tipo_cuenta: 'compartida', url: null, notas: null,
    });
  });

  it('no escribe nada fuera de la RPC (ni el correo ni la licencia por separado)', async () => {
    await licenciasApi.createLicenciaConCuenta(DATOS, CUENTA);
    expect(inserciones).toEqual([]);
  });

  it('la RPC rechaza cuenta existente y nueva a la vez: cuenta_id se manda siempre nulo', async () => {
    await licenciasApi.createLicenciaConCuenta(DATOS, CUENTA);
    expect(llamadas[0].args.p_licencia.cuenta_id).toBeNull();
  });

  it('la clave de la licencia y la contraseña del correo viajan cifradas, nunca en claro', async () => {
    await licenciasApi.createLicenciaConCuenta(DATOS, CUENTA);
    const { p_licencia, p_cuenta } = llamadas[0].args;
    expect(p_licencia.clave).toMatch(/^enc2:/);
    expect(p_cuenta.password).toMatch(/^enc2:/);
    const json = JSON.stringify(llamadas[0].args);
    expect(json).not.toContain('SERIAL-123');
    expect(json).not.toContain('Secreta#1');
  });

  it('sin contraseña del correo ni clave manda nulos', async () => {
    await licenciasApi.createLicenciaConCuenta({ ...DATOS, clave: '' }, { ...CUENTA, password: '' });
    const { p_licencia, p_cuenta } = llamadas[0].args;
    expect(p_licencia.clave).toBeNull();
    expect(p_cuenta.password).toBeNull();
  });

  it('un usuario duplicado (23505) llega crudo y se traduce al mostrarlo', async () => {
    respuestaRpc = () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_cuentas_usuario_plataforma"' } });
    const error = await licenciasApi.createLicenciaConCuenta(DATOS, CUENTA).catch((e) => e);
    expect(error.code).toBe('23505');
    expect(traducirErrorDb(error).mensaje).toMatch(/Ya existe una cuenta registrada con este usuario/);
  });

  it('el rechazo por permiso (42501) llega con su código', async () => {
    respuestaRpc = () => ({ data: null, error: { code: '42501', message: 'No autorizado' } });
    await expect(licenciasApi.createLicenciaConCuenta(DATOS, CUENTA)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('store de licencias — crear', () => {
  it('con cuenta nueva usa la RPC; sin ella, el insert directo de siempre', async () => {
    const store = useLicenciasStore();
    expect(await store.crear(DATOS, CUENTA)).toBe('lic-1');
    expect(llamadas.map((l) => l.nombre)).toEqual(['crear_licencia_con_cuenta']);

    llamadas.length = 0;
    expect(await store.crear({ ...DATOS, cuenta_id: 'cuenta-vieja' })).toBe('lic-directa');
    expect(llamadas).toEqual([]);
    expect(inserciones.map((i) => i.tabla)).toEqual(['licencias']);
  });
});

// ── Maqueta ─────────────────────────────────────────────────────────────────
function baseNueva() {
  return JSON.parse(JSON.stringify(TABLAS));
}
const rechazo = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const CIFRADO = 'enc2:AAAA:BBBB';

describe('maqueta — crear_licencia_con_cuenta', () => {
  it('crea la cuenta nueva y la licencia vinculada, con la cuenta sin asignar', () => {
    const db = baseNueva();
    const antes = { cuentas: db.cuentas.length, licencias: db.licencias.length, asignaciones: db.asignaciones_cuenta.length };
    const lic = RPC_LICENCIAS.crear_licencia_con_cuenta(db, {
      p_licencia: { software: '  Revit  ', tipo: 'suscripcion', cantidad: 0, costo: 100, clave: CIFRADO, cuenta_id: null },
      p_cuenta: { plataforma_id: 'gmail', usuario: 'Revit.Materen@Materen.pe', password: CIFRADO },
    });
    expect(lic).toMatchObject({ software: 'Revit', cantidad: 1, moneda: 'PEN', tiene_clave: true });
    const cuenta = db.cuentas.find((c) => c.id === lic.cuenta_id);
    expect(cuenta).toMatchObject({ usuario: 'revit.materen@materen.pe', tipo_cuenta: 'compartida' });
    expect(db.cuentas).toHaveLength(antes.cuentas + 1);
    expect(db.licencias).toHaveLength(antes.licencias + 1);
    expect(db.asignaciones_cuenta).toHaveLength(antes.asignaciones);
  });

  it('una perpetua queda sin vencimiento ni renovación', () => {
    const db = baseNueva();
    const lic = RPC_LICENCIAS.crear_licencia_con_cuenta(db, {
      p_licencia: { software: 'WinRAR', tipo: 'perpetua', fecha_vencimiento: '2030-01-01', renovacion_meses: 12 },
    });
    expect(lic).toMatchObject({ fecha_vencimiento: null, renovacion_meses: null, cuenta_id: null });
  });

  it('los rechazos de negocio llevan el SQLSTATE y el texto del servidor', () => {
    const db = baseNueva();
    const lic = (extra = {}) => ({ software: 'X', ...extra });
    expect(rechazo(() => RPC_LICENCIAS.crear_licencia_con_cuenta(db, { p_licencia: lic({ software: ' ' }) })))
      .toMatchObject({ code: 'P0001', message: 'El nombre del software es obligatorio.' });
    expect(rechazo(() => RPC_LICENCIAS.crear_licencia_con_cuenta(db, { p_licencia: lic({ clave: 'texto plano' }) })).message).toMatch(/cifrada/);
    expect(rechazo(() => RPC_LICENCIAS.crear_licencia_con_cuenta(db, { p_licencia: lic({ cuenta_id: 'c10' }), p_cuenta: { plataforma_id: 'gmail', usuario: 'a@b.pe' } })).message)
      .toMatch(/no ambas/);
    expect(rechazo(() => RPC_LICENCIAS.crear_licencia_con_cuenta(db, { p_licencia: lic({ cuenta_id: 'no-existe' }) })))
      .toMatchObject({ code: 'P0002' });
    expect(rechazo(() => RPC_LICENCIAS.crear_licencia_con_cuenta(db, { p_licencia: lic(), p_cuenta: { plataforma_id: 'no-existe', usuario: 'a@b.pe' } })))
      .toMatchObject({ code: 'P0002', message: 'La plataforma no existe.' });
  });

  it('un usuario duplicado (23505) no deja ni cuenta ni licencia a medias', () => {
    const db = baseNueva();
    const existente = db.cuentas.find((c) => !c.deleted_at);
    const antes = { cuentas: db.cuentas.length, licencias: db.licencias.length };
    const error = rechazo(() => RPC_LICENCIAS.crear_licencia_con_cuenta(db, {
      p_licencia: { software: 'Duplicada' },
      p_cuenta: { plataforma_id: existente.plataforma_id, usuario: existente.usuario.toUpperCase() },
    }));
    expect(error.code).toBe('23505');
    expect(db.cuentas).toHaveLength(antes.cuentas);
    expect(db.licencias).toHaveLength(antes.licencias);
  });
});
