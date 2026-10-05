// Dominios empleados y cuentas sobre las RPC de las migraciones 101 y 102:
// argumentos NOMBRADOS, el motivo que viaja, la contraseña que llega YA cifrada
// y el rechazo 42501 que el store entrega traducido.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const llamadas = [];
const actualizaciones = [];
let respuestaRpc = () => ({ data: null, error: null });
let filaEmpleado = { id: 'e1', nombres: 'Rosa', apellidos: 'Quispe', estado: 'Suspendido', empresas: { nombre: 'Materen' } };

function consulta(tabla) {
  const q = { tabla, filtros: [] };
  const qb = {
    select() { return qb; },
    update(payload) { actualizaciones.push({ tabla, payload }); return qb; },
    eq(c, v) { q.filtros.push([c, v]); return qb; },
    is() { return qb; }, in() { return qb; }, order() { return qb; }, limit() { return qb; },
    maybeSingle: async () => ({ data: tabla === 'empleados' ? filaEmpleado : null, error: null }),
    single: async () => ({
      data: tabla === 'asignaciones_cuenta'
        ? { id: 'asig-1', cuenta_id: 'cu-1', empleado_id: 'e1', fecha_inicio: '2026-10-01', notas: null, cuentas: { id: 'cu-1', usuario: 'rquispe', tipo_cuenta: 'personal', plataformas: { nombre: 'Gmail' } } }
        : filaEmpleado,
      error: null,
    }),
    then(res) { return Promise.resolve({ data: [], error: null }).then(res); },
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

import { empleadosApi } from '../src/api/domains/empleados.js';
import { cuentasApi } from '../src/api/domains/cuentas.js';
import { useEmpleadosStore } from '../src/stores/empleados.js';
import { useCuentasStore } from '../src/stores/cuentas.js';
import { MENSAJE_SIN_PERMISO } from '../src/api/erroresDb.js';

beforeEach(() => {
  llamadas.length = 0;
  actualizaciones.length = 0;
  respuestaRpc = () => ({ data: null, error: null });
  setActivePinia(createPinia());
});

const SIN_PERMISO = { code: '42501', message: 'No autorizado' };

describe('empleadosApi — ciclo de vida por RPC (migración 102)', () => {
  it('suspenderEmpleado manda motivo y devuelve la ficha releída', async () => {
    const emp = await empleadosApi.suspenderEmpleado('e1', '  Investigación interna ');
    expect(llamadas).toEqual([{ nombre: 'suspender_empleado', args: { p_empleado_id: 'e1', p_motivo: 'Investigación interna' } }]);
    expect(emp).toMatchObject({ id: 'e1', empresa_nombre: 'Materen' });
  });

  it('reactivarEmpleado usa la RPC (ya no un UPDATE) con motivo opcional', async () => {
    await empleadosApi.reactivarEmpleado('e1');
    await empleadosApi.reactivarEmpleado('e1', 'Caso cerrado');
    expect(llamadas.map((l) => l.nombre)).toEqual(['reactivar_empleado', 'reactivar_empleado']);
    expect(llamadas[0].args).toEqual({ p_empleado_id: 'e1', p_motivo: null });
    expect(llamadas[1].args).toEqual({ p_empleado_id: 'e1', p_motivo: 'Caso cerrado' });
  });

  it('reingresarEmpleado solo manda las claves permitidas y respeta las vacías', async () => {
    await empleadosApi.reingresarEmpleado('e1', {
      area_obra_id: '', cargo: 'Jefe de Almacén', empresa_id: 'emp-2', dni: '99999999', estado: 'Activo',
    });
    expect(llamadas[0]).toEqual({
      nombre: 'reingresar_empleado',
      args: { p_empleado_id: 'e1', p_datos: { area_obra_id: '', cargo: 'Jefe de Almacén', empresa_id: 'emp-2' } },
    });
  });

  it('reingresarEmpleado sin cambios manda un objeto vacío (conserva todo)', async () => {
    await empleadosApi.reingresarEmpleado('e1');
    expect(llamadas[0].args.p_datos).toEqual({});
  });

  it('bajaEmpleado manda el motivo (null si no hay) a dar_baja_empleado', async () => {
    await empleadosApi.bajaEmpleado('e1', 'Término de contrato');
    await empleadosApi.bajaEmpleado('e1');
    const bajas = llamadas.filter((l) => l.nombre === 'dar_baja_empleado');
    expect(bajas.map((b) => b.args)).toEqual([
      { p_empleado_id: 'e1', p_motivo: 'Término de contrato' },
      { p_empleado_id: 'e1', p_motivo: null },
    ]);
  });

  it('registrarRevisionAccesos manda resultado y nota y devuelve la fila de la revisión', async () => {
    respuestaRpc = () => ({ data: { id: 'rev1' }, error: null });
    const fila = await empleadosApi.registrarRevisionAccesos('e1', { cuentas: 2 }, ' sin observaciones ');
    expect(llamadas[0]).toEqual({
      nombre: 'registrar_revision_accesos',
      args: { p_empleado_id: 'e1', p_resultado: { cuentas: 2 }, p_nota: 'sin observaciones' },
    });
    expect(fila).toEqual({ id: 'rev1' });
  });

  it('un 42501 sale crudo del dominio (lo traduce quien lo muestra)', async () => {
    respuestaRpc = () => ({ data: null, error: SIN_PERMISO });
    await expect(empleadosApi.suspenderEmpleado('e1', 'x')).rejects.toMatchObject({ code: '42501' });
  });

  it('updateEmpleado no manda el estado: editar no cambia de estado', async () => {
    await empleadosApi.updateEmpleado('e1', {
      nombres: 'Rosa', apellidos: 'Quispe', dni: '12345678', empresa_id: 'emp', estado: 'Inactivo', fecha_alta: '2026-01-01',
    });
    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0].tabla).toBe('empleados');
    expect(actualizaciones[0].payload).not.toHaveProperty('estado');
    expect(actualizaciones[0].payload).toMatchObject({ nombres: 'Rosa', dni: '12345678' });
  });
});

describe('store de empleados — errores traducidos', () => {
  it('suspender con 42501 lanza el mensaje de "sin permiso"', async () => {
    respuestaRpc = () => ({ data: null, error: SIN_PERMISO });
    const store = useEmpleadosStore();
    await expect(store.suspender('e1', 'x')).rejects.toMatchObject({ message: MENSAJE_SIN_PERMISO, code: '42501' });
  });

  it('un rechazo de negocio (P0001) conserva su texto en español', async () => {
    respuestaRpc = () => ({ data: null, error: { code: 'P0001', message: 'Solo se puede suspender a un empleado Activo (estado actual: Inactivo).' } });
    const store = useEmpleadosStore();
    await expect(store.suspender('e1', 'x')).rejects.toThrow('Solo se puede suspender a un empleado Activo');
  });

  it('reactivar y reingresar pasan por la RPC y devuelven la ficha', async () => {
    const store = useEmpleadosStore();
    expect(await store.reactivar('e1', 'ok')).toMatchObject({ id: 'e1' });
    expect(await store.reingresar('e1', { cargo: 'X' })).toMatchObject({ id: 'e1' });
    expect(llamadas.map((l) => l.nombre)).toEqual(['reactivar_empleado', 'reingresar_empleado']);
  });
});

describe('cuentasApi — RPC de la migración 101', () => {
  it('createCuenta cifra primero y manda todo a crear_cuenta_asignada con argumentos nombrados', async () => {
    respuestaRpc = () => ({ data: { id: 'asig-1' }, error: null });
    const asignacion = await cuentasApi.createCuenta({
      plataforma_id: 'gmail', usuario: ' RQuispe@Materen.pe ', password: 'Secreta#1', url: 'https://mail.google.com ',
      notas: '', tipo_cuenta: 'personal', empleado_id: 'e1',
    });
    const args = llamadas[0].args;
    expect(llamadas[0].nombre).toBe('crear_cuenta_asignada');
    expect(args).toMatchObject({
      p_plataforma_id: 'gmail', p_usuario: 'rquispe@materen.pe', p_empleado_id: 'e1',
      p_url: 'https://mail.google.com', p_notas: null, p_tipo_cuenta: 'personal',
    });
    // La contraseña NUNCA viaja en claro.
    expect(args.p_password_cifrada).toMatch(/^enc2:/);
    expect(JSON.stringify(args)).not.toContain('Secreta#1');
    // Y se conserva la forma de retorno (mapAsignacion con embeds).
    expect(asignacion).toMatchObject({ asignacion_id: 'asig-1', usuario: 'rquispe', plataforma_nombre: 'Gmail' });
  });

  it('createCuenta sin contraseña manda p_password_cifrada null', async () => {
    respuestaRpc = () => ({ data: { id: 'asig-1' }, error: null });
    await cuentasApi.createCuenta({ plataforma_id: 'gmail', usuario: 'x', empleado_id: 'e1' });
    expect(llamadas[0].args.p_password_cifrada).toBeNull();
  });

  it('un usuario duplicado (23505) llega crudo para que se traduzca', async () => {
    respuestaRpc = () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_cuentas_usuario_plataforma"' } });
    const store = useCuentasStore();
    await expect(store.crear('e1', { plataforma_id: 'gmail', usuario: 'x' })).rejects.toThrow(/Ya existe una cuenta registrada con este usuario/);
  });

  it('traspasarCuenta usa la RPC con la contraseña ya cifrada', async () => {
    respuestaRpc = () => ({ data: { id: 'nueva' }, error: null });
    const nueva = await cuentasApi.traspasarCuenta('asig-1', 'e2', 'Traspaso: cambio de puesto', 'Nueva#2');
    expect(llamadas[0].nombre).toBe('traspasar_cuenta');
    expect(llamadas[0].args).toMatchObject({ p_asignacion_id: 'asig-1', p_nuevo_empleado_id: 'e2', p_notas: 'Traspaso: cambio de puesto' });
    expect(llamadas[0].args.p_password_cifrada).toMatch(/^enc2:/);
    expect(JSON.stringify(llamadas[0].args)).not.toContain('Nueva#2');
    expect(nueva).toEqual({ id: 'nueva' });
  });

  it('cerrarAsignacion y la revocación usan las RPC', async () => {
    await cuentasApi.cerrarAsignacion('asig-1');
    await cuentasApi.cerrarAsignacion('asig-2', 'Revocada');
    await cuentasApi.revocarCuentaPersonal('asig-3');
    expect(llamadas).toEqual([
      { nombre: 'cerrar_asignacion_cuenta', args: { p_asignacion_id: 'asig-1', p_notas: null } },
      { nombre: 'cerrar_asignacion_cuenta', args: { p_asignacion_id: 'asig-2', p_notas: 'Revocada' } },
      { nombre: 'revocar_cuenta_personal', args: { p_asignacion_id: 'asig-3' } },
    ]);
  });

  it('el store de cuentas traduce el rechazo del servidor (cuenta personal no se traspasa)', async () => {
    respuestaRpc = () => ({ data: null, error: { code: 'P0001', message: 'Una cuenta personal no se traspasa: revóquela y cree una nueva para el otro empleado.' } });
    const store = useCuentasStore();
    store.lista = [{ asignacion_id: 'asig-1' }];
    await expect(store.traspasar('asig-1', 'e2', null)).rejects.toThrow('Una cuenta personal no se traspasa');
    expect(store.lista).toHaveLength(1); // no se quitó de la lista
  });

  it('42501 en una mutación de cuentas llega como "sin permiso"', async () => {
    respuestaRpc = () => ({ data: null, error: SIN_PERMISO });
    const store = useCuentasStore();
    await expect(store.revocarAsignacion('asig-1')).rejects.toMatchObject({ message: MENSAJE_SIN_PERMISO });
  });
});
