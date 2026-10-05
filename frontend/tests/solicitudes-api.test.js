// Dominio solicitudes (migración 108) sobre un cliente falso: las RPC reciben
// argumentos NOMBRADOS, los textos viajan limpios, la persona nueva del alta se
// normaliza igual que en EmpleadoForm, los errores del servidor llegan crudos
// (los traduce quien los muestra) y el store los entrega ya en español.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const llamadas = [];
const consultas = [];
let respuestaRpc = () => ({ data: null, error: null });
let respuestaTabla = () => ({ data: [], error: null, count: 0 });

function consulta(tabla) {
  const q = { tabla, op: [] };
  consultas.push(q);
  const qb = new Proxy({}, {
    get(_, metodo) {
      if (metodo === 'then') return (res, rej) => Promise.resolve(respuestaTabla(tabla, q)).then(res, rej);
      return (...args) => { q.op.push([metodo, ...args]); return qb; };
    },
  });
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

import { solicitudesApi } from '../src/api/domains/solicitudes.js';
import { useSolicitudesStore } from '../src/stores/solicitudes.js';
import { MENSAJE_SIN_PERMISO } from '../src/api/erroresDb.js';

const filaSolicitud = (extra = {}) => ({
  id: 's1', codigo: 'SOL-0012', tipo_id: 'alta_empleado', empleado_id: 'e1', estado: 'abierta', origen: 'rrhh_correo',
  nota: null, datos: {}, ticket_id: null, creada_por: 'u1', created_at: '2026-10-01T09:00:00', updated_at: '2026-10-01T09:00:00',
  solicitud_tipos: { id: 'alta_empleado', nombre: 'Alta de empleado', modulo_responsable: 'empleados' },
  empleados: { id: 'e1', nombres: 'Rosa', apellidos: 'Quispe', estado: 'Activo', cargo: 'Asistente' },
  tickets: null,
  solicitud_pasos: [
    { id: 'p2', solicitud_id: 's1', orden: 2, clave: 'crear_cuenta', label: 'Crear la cuenta de correo', obligatorio: true, estado: 'pendiente' },
    { id: 'p1', solicitud_id: 's1', orden: 1, clave: 'registrar_empleado', label: 'Registrar a la persona', obligatorio: true, estado: 'hecho', automatico: true, autocompleta: true },
  ],
  ...extra,
});

beforeEach(() => {
  llamadas.length = 0;
  consultas.length = 0;
  respuestaRpc = () => ({ data: null, error: null });
  respuestaTabla = () => ({ data: [], error: null, count: 0 });
  setActivePinia(createPinia());
});

describe('solicitudesApi — lectura', () => {
  it('getSolicitud arma la forma de siempre: tipo, persona, pasos ordenados y campos con valor por defecto', async () => {
    respuestaTabla = () => ({ data: filaSolicitud(), error: null });
    const s = await solicitudesApi.getSolicitud('s1');
    expect(s).toMatchObject({
      id: 's1', codigo: 'SOL-0012', tipo_nombre: 'Alta de empleado', modulo_responsable: 'empleados',
      empleado_nombre: 'Rosa Quispe', empleado_estado: 'Activo', nota: '', ticket: null, motivo_cancelacion: '',
    });
    expect(s.pasos.map((p) => p.orden)).toEqual([1, 2]);
    expect(s.pasos[0]).toMatchObject({ automatico: true, autocompleta: true, nota: '', motivo_omision: '' });
    expect(s.pasos[1]).toMatchObject({ automatico: false, autocompleta: false, referencia_id: null });
    expect(consultas[0].tabla).toBe('solicitudes');
    expect(consultas[0].op.find(([m]) => m === 'eq')).toEqual(['eq', 'id', 's1']);
  });

  it('una solicitud inexistente devuelve null', async () => {
    respuestaTabla = () => ({ data: null, error: null });
    expect(await solicitudesApi.getSolicitud('x')).toBeNull();
  });

  it('el listado pagina en servidor (range), filtra por estado y tipos y no pide DNI', async () => {
    respuestaTabla = () => ({ data: [filaSolicitud()], error: null, count: 41 });
    const r = await solicitudesApi.listSolicitudesPage({ pagina: 3, tamPagina: 20, estado: 'abierta', tipos: ['alta_empleado', 'licencia'] });
    expect(r.total).toBe(41);
    expect(r.items).toHaveLength(1);
    const ops = consultas[0].op;
    expect(ops.find(([m]) => m === 'range')).toEqual(['range', 40, 59]);
    expect(ops.find(([m]) => m === 'eq')).toEqual(['eq', 'estado', 'abierta']);
    expect(ops.find(([m]) => m === 'in')).toEqual(['in', 'tipo_id', ['alta_empleado', 'licencia']]);
    expect(JSON.stringify(ops.find(([m]) => m === 'select'))).not.toContain('dni');
  });

  it('el orden pedido se valida contra una lista; una columna ajena cae al orden por defecto', async () => {
    respuestaTabla = () => ({ data: [], error: null, count: 0 });
    await solicitudesApi.listSolicitudesPage({ orden: { columna: 'password', direccion: 'asc' } });
    expect(consultas[0].op.find(([m]) => m === 'order')).toEqual(['order', 'created_at', { ascending: false }]);
    consultas.length = 0;
    await solicitudesApi.listSolicitudesPage({ orden: { columna: 'codigo', direccion: 'asc' } });
    expect(consultas[0].op.find(([m]) => m === 'order')).toEqual(['order', 'codigo', { ascending: true }]);
  });

  it('buscar por texto busca el código y las personas que coinciden (dos consultas, el listado con or())', async () => {
    respuestaTabla = (tabla) => (tabla === 'empleados' ? { data: [{ id: 'e1' }, { id: 'e2' }], error: null } : { data: [], error: null, count: 0 });
    await solicitudesApi.listSolicitudesPage({ q: 'quispe' });
    expect(consultas.map((c) => c.tabla)).toEqual(['empleados', 'solicitudes']);
    const or = consultas[1].op.find(([m]) => m === 'or');
    expect(or[1]).toBe('codigo.ilike.%quispe%,empleado_id.in.(e1,e2)');
  });

  it('un término de menos de 2 letras no dispara la búsqueda de personas', async () => {
    await solicitudesApi.listSolicitudesPage({ q: 'q' });
    expect(consultas.map((c) => c.tabla)).toEqual(['solicitudes']);
    expect(consultas[0].op.some(([m]) => m === 'or')).toBe(false);
  });

  it('los conteos por vista usan cada estado y reutilizan la búsqueda', async () => {
    respuestaTabla = (tabla, q) => {
      if (tabla === 'empleados') return { data: [], error: null };
      const estado = q.op.find(([m]) => m === 'eq')?.[2] ?? '';
      return { data: [], error: null, count: { abierta: 3, completada: 5, cancelada: 1, '': 9 }[estado] };
    };
    const c = await solicitudesApi.conteosSolicitudesPorEstado({ q: 'rosa' });
    expect(c).toEqual({ abierta: 3, completada: 5, cancelada: 1, todas: 9 });
    expect(consultas.filter((x) => x.tabla === 'empleados')).toHaveLength(1);
  });

  it('solicitudDeBaja trae la más reciente de la persona o null', async () => {
    respuestaTabla = () => ({ data: [filaSolicitud({ tipo_id: 'baja_empleado' })], error: null });
    expect((await solicitudesApi.solicitudDeBaja('e1')).tipo_id).toBe('baja_empleado');
    expect(consultas[0].op.filter(([m]) => m === 'eq')).toEqual([['eq', 'empleado_id', 'e1'], ['eq', 'tipo_id', 'baja_empleado']]);
    respuestaTabla = () => ({ data: [], error: null });
    expect(await solicitudesApi.solicitudDeBaja('e1')).toBeNull();
  });

  it('objetivosDePasosSolicitud resuelve la cuenta (usuario) y el equipo (hoja de vida) a los que apunta cada paso', async () => {
    respuestaTabla = (tabla) => (tabla === 'cuentas'
      ? { data: [{ id: 'c1', usuario: 'soporte@materen.pe' }], error: null }
      : { data: [{ id: 'ae1', equipo_id: 'q1', equipos: { codigo: 'LAP-1' } }], error: null });
    const mapa = await solicitudesApi.objetivosDePasosSolicitud([
      { objetivo_id: 'c1', referencia_tipo: 'cuenta' },
      { objetivo_id: 'ae1', referencia_tipo: 'equipo' },
      { objetivo_id: null, referencia_tipo: 'licencia' },
    ]);
    expect(mapa).toEqual({ c1: { usuario: 'soporte@materen.pe' }, ae1: { equipo_id: 'q1', codigo: 'LAP-1' } });
  });

  it('sin pasos con objetivo no hace ninguna consulta', async () => {
    expect(await solicitudesApi.objetivosDePasosSolicitud([{ objetivo_id: null }])).toEqual({});
    expect(consultas).toHaveLength(0);
  });
});

describe('solicitudesApi — escritura por RPC (argumentos nombrados)', () => {
  it('crearSolicitud con una persona ya registrada', async () => {
    respuestaRpc = () => ({ data: { id: 's9', codigo: 'SOL-0009' }, error: null });
    const r = await solicitudesApi.crearSolicitud({ tipo: 'acceso_nuevo', empleadoId: 'e1', nota: '  pedido  del lunes ', origen: 'rrhh_correo' });
    expect(r.codigo).toBe('SOL-0009');
    expect(llamadas).toEqual([{
      nombre: 'crear_solicitud',
      args: { p_tipo: 'acceso_nuevo', p_empleado_id: 'e1', p_empleado: null, p_datos: {}, p_nota: 'pedido del lunes', p_origen: 'rrhh_correo', p_ticket_id: null },
    }]);
  });

  it('crearSolicitud con persona NUEVA normaliza como EmpleadoForm y solo manda las claves que acepta la RPC', async () => {
    await solicitudesApi.crearSolicitud({
      tipo: 'alta_empleado',
      empleado: {
        nombres: 'rosa maría', apellidos: 'QUISPE mamani', dni: '45.871.236', empresa_id: 'emp1', area_obra_id: '', ubicacion_id: 'ub1',
        cargo: 'asistente', whatsapp: '987654321', estado: 'Inactivo', correo_personal: '', fecha_alta: '2026-10-01',
      },
    });
    const { args } = llamadas[0];
    expect(args.p_empleado_id).toBeNull();
    expect(args.p_empleado).toEqual({
      nombres: 'Rosa María', apellidos: 'Quispe Mamani', dni: '45871236', empresa_id: 'emp1', ubicacion_id: 'ub1',
      cargo: 'Asistente', fecha_alta: '2026-10-01', whatsapp: '+51987654321',
    });
    // `estado` no viaja (lo decide la RPC) y lo vacío no se manda.
    expect(args.p_empleado).not.toHaveProperty('estado');
    expect(args.p_empleado).not.toHaveProperty('area_obra_id');
  });

  it('completarPasoSolicitud, omitirPasoSolicitud y cancelarSolicitud mandan sus argumentos', async () => {
    await solicitudesApi.completarPasoSolicitud('p1', { referenciaId: 'a1', nota: ' listo ' });
    await solicitudesApi.completarPasoSolicitud('p2');
    await solicitudesApi.omitirPasoSolicitud('p3', '  No corresponde ');
    await solicitudesApi.cancelarSolicitud('s1', 'Pedido duplicado');
    expect(llamadas).toEqual([
      { nombre: 'completar_paso_solicitud', args: { p_paso_id: 'p1', p_referencia_id: 'a1', p_nota: 'listo' } },
      { nombre: 'completar_paso_solicitud', args: { p_paso_id: 'p2', p_referencia_id: null, p_nota: null } },
      { nombre: 'omitir_paso_solicitud', args: { p_paso_id: 'p3', p_motivo: 'No corresponde' } },
      { nombre: 'cancelar_solicitud', args: { p_solicitud_id: 's1', p_motivo: 'Pedido duplicado' } },
    ]);
  });

  it('convertirTicketEnSolicitud manda el ticket, el tipo y la nota', async () => {
    await solicitudesApi.convertirTicketEnSolicitud('t1', 'licencia', 'AutoCAD');
    expect(llamadas[0]).toEqual({ nombre: 'convertir_ticket_en_solicitud', args: { p_ticket_id: 't1', p_tipo: 'licencia', p_nota: 'AutoCAD' } });
  });

  it('un error de la RPC se relanza crudo (código y mensaje del servidor)', async () => {
    respuestaRpc = () => ({ data: null, error: { code: 'P0001', message: 'El paso es obligatorio: solo un jefe puede omitirlo.' } });
    await expect(solicitudesApi.omitirPasoSolicitud('p1', 'x')).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('store de solicitudes — errores ya traducidos', () => {
  it('un 42501 sale como "sin permiso" y una regla de negocio conserva su texto en español', async () => {
    const store = useSolicitudesStore();
    respuestaRpc = () => ({ data: null, error: { code: '42501', message: 'No autorizado' } });
    await expect(store.crear({ tipo: 'licencia', empleadoId: 'e1' })).rejects.toThrow(MENSAJE_SIN_PERMISO);
    respuestaRpc = () => ({ data: null, error: { code: 'P0001', message: 'Ya hay una solicitud de alta de empleado abierta para esta persona (SOL-0003).' } });
    await expect(store.crear({ tipo: 'alta_empleado', empleadoId: 'e1' })).rejects.toThrow('SOL-0003');
  });

  it('cargarDetalle deja el detalle, sus objetivos y el error cuando falla', async () => {
    const store = useSolicitudesStore();
    respuestaTabla = (tabla) => (tabla === 'solicitudes' ? { data: filaSolicitud(), error: null } : { data: [], error: null });
    const s = await store.cargarDetalle('s1');
    expect(s.codigo).toBe('SOL-0012');
    expect(store.detalle.pasos).toHaveLength(2);
    expect(store.errorDetalle).toBe('');
    respuestaTabla = () => ({ data: null, error: { code: '42501', message: 'permission denied' } });
    expect(await store.cargarDetalle('s1')).toBeNull();
    expect(store.detalle).toBeNull();
    expect(store.errorDetalle).toBe(MENSAJE_SIN_PERMISO);
  });

  it('completar un paso vuelve a leer el detalle; si era el último, recarga la lista que ya estaba cargada', async () => {
    const store = useSolicitudesStore();
    store.lista = [{ id: 's1' }];
    let estado = 'abierta';
    respuestaTabla = (tabla) => (tabla === 'solicitudes' ? { data: filaSolicitud({ estado }), error: null, count: 1 } : { data: [], error: null });
    respuestaRpc = () => { estado = 'completada'; return { data: { id: 'p2', estado: 'hecho' }, error: null }; };
    await store.completarPaso('s1', 'p2');
    expect(llamadas.map((l) => l.nombre)).toEqual(['completar_paso_solicitud']);
    expect(store.detalle.estado).toBe('completada');
    // La lista se recargó (hubo una consulta de listado con range).
    expect(consultas.some((c) => c.op.some(([m]) => m === 'range'))).toBe(true);
  });

  it('cancelar sin lista cargada no recarga nada', async () => {
    const store = useSolicitudesStore();
    respuestaTabla = () => ({ data: filaSolicitud({ estado: 'cancelada' }), error: null });
    await store.cancelar('s1', 'Pedido duplicado');
    expect(llamadas[0]).toEqual({ nombre: 'cancelar_solicitud', args: { p_solicitud_id: 's1', p_motivo: 'Pedido duplicado' } });
    expect(consultas.some((c) => c.op.some(([m]) => m === 'range'))).toBe(false);
  });
});
