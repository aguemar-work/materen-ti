// Dominio cambios y servicios (migración 107) sobre un cliente falso: las RPC reciben
// argumentos NOMBRADOS, los textos viajan limpios (los de varias líneas conservan sus
// saltos), los filtros del listado llegan al servidor, los errores del servidor
// llegan crudos (los traduce quien los muestra) y el store los entrega en español.
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

import { cambiosApi } from '../src/api/domains/cambios.js';
import { serviciosApi } from '../src/api/domains/servicios.js';
import { ticketsApi } from '../src/api/domains/tickets.js';
import { useCambiosStore } from '../src/stores/cambios.js';
import { MENSAJE_SIN_PERMISO } from '../src/api/erroresDb.js';

const filaCambio = (extra = {}) => ({
  id: 'c1', codigo: 'CHG-0004', titulo: 'Cambio del router', tipo: 'normal', riesgo: 'medio', servicio_id: 'red',
  descripcion: 'Linea 1\nLinea 2', plan_retroceso: 'Volver al anterior', ventana_inicio: '2026-10-03T08:00:00Z', ventana_fin: '2026-10-03T10:00:00Z',
  estado: 'solicitado', solicitado_por: 'u1', solicitado_at: '2026-10-02T09:00:00Z', aprobado_por: null, aprobado_at: null,
  aprobacion_pendiente_hasta: null, inicio_real_at: null, fin_real_at: null, resultado: null,
  created_at: '2026-10-02T08:00:00Z', updated_at: '2026-10-02T09:00:00Z',
  servicios: { id: 'red', nombre: 'Internet y red', criticidad: 'critica', horario: '24 x 7', dueno_user_id: 'u2' },
  ...extra,
});

beforeEach(() => {
  llamadas.length = 0;
  consultas.length = 0;
  respuestaRpc = () => ({ data: null, error: null });
  respuestaTabla = () => ({ data: [], error: null, count: 0 });
  setActivePinia(createPinia());
});

describe('cambiosApi — lectura', () => {
  it('getCambio aplana el servicio y da valor por defecto a lo que viene vacío', async () => {
    respuestaTabla = () => ({ data: filaCambio(), error: null });
    const c = await cambiosApi.getCambio('c1');
    expect(c).toMatchObject({
      id: 'c1', codigo: 'CHG-0004', servicio_nombre: 'Internet y red', servicio_criticidad: 'critica', servicio_horario: '24 x 7',
      servicio_dueno: 'u2', aprobado_por: null, aprobacion_pendiente_hasta: null, resultado: '',
    });
    expect(c.descripcion).toBe('Linea 1\nLinea 2');
    expect(consultas[0].tabla).toBe('cambios');
    expect(consultas[0].op.find(([m]) => m === 'eq')).toEqual(['eq', 'id', 'c1']);
  });

  it('un cambio inexistente devuelve null', async () => {
    respuestaTabla = () => ({ data: null, error: null });
    expect(await cambiosApi.getCambio('x')).toBeNull();
  });

  it('el listado pagina en servidor y filtra por estados, tipos y servicios', async () => {
    respuestaTabla = () => ({ data: [filaCambio()], error: null, count: 41 });
    const r = await cambiosApi.listCambiosPage({ pagina: 3, tamPagina: 20, estados: ['solicitado', 'aprobado'], tipos: ['normal'], servicios: ['red', 'erp'] });
    expect(r.total).toBe(41);
    expect(r.items[0].servicio_nombre).toBe('Internet y red');
    const ops = consultas[0].op;
    expect(ops.find(([m]) => m === 'range')).toEqual(['range', 40, 59]);
    expect(ops.filter(([m]) => m === 'in')).toEqual([
      ['in', 'estado', ['solicitado', 'aprobado']],
      ['in', 'tipo', ['normal']],
      ['in', 'servicio_id', ['red', 'erp']],
    ]);
  });

  it('una vista sin estados (Todos) no filtra por estado', async () => {
    await cambiosApi.listCambiosPage({ estados: [] });
    expect(consultas[0].op.some(([m]) => m === 'in')).toBe(false);
  });

  it('buscar por texto usa el código y el título; menos de 2 letras no busca', async () => {
    await cambiosApi.listCambiosPage({ q: 'router' });
    expect(consultas[0].op.find(([m]) => m === 'or')[1]).toBe('codigo.ilike.%router%,titulo.ilike.%router%');
    consultas.length = 0;
    await cambiosApi.listCambiosPage({ q: 'r' });
    expect(consultas[0].op.some(([m]) => m === 'or')).toBe(false);
  });

  it('el orden se valida contra una lista; una columna ajena cae al orden por defecto', async () => {
    await cambiosApi.listCambiosPage({ orden: { columna: 'resultado', direccion: 'asc' } });
    expect(consultas[0].op.find(([m]) => m === 'order')).toEqual(['order', 'created_at', { ascending: false }]);
    consultas.length = 0;
    await cambiosApi.listCambiosPage({ orden: { columna: 'ventana_inicio', direccion: 'asc' } });
    expect(consultas[0].op.find(([m]) => m === 'order')).toEqual(['order', 'ventana_inicio', { ascending: true }]);
  });

  it('los conteos por vista usan los estados de cada vista y el resto de los filtros', async () => {
    respuestaTabla = (_t, q) => {
      const e = q.op.find(([m, col]) => m === 'in' && col === 'estado');
      return { data: [], error: null, count: e ? e[2].length * 10 : 99 };
    };
    const c = await cambiosApi.conteosCambiosPorVista({ q: 'router', tipos: ['normal'] });
    expect(c).toEqual({ activos: 50, por_aprobar: 10, en_ejecucion: 10, cerrados: 40, todos: 99 });
    expect(consultas).toHaveLength(5);
    for (const q of consultas) {
      expect(q.op.find(([m]) => m === 'or')[1]).toContain('router');
      expect(q.op.find(([m, col]) => m === 'in' && col === 'tipo')[2]).toEqual(['normal']);
    }
  });

  it('el libro se pide lo más reciente primero, con `orden` para desempatar', async () => {
    respuestaTabla = () => ({ data: [{ id: 'e1' }], error: null });
    expect(await cambiosApi.listEventosCambio('c1')).toEqual([{ id: 'e1' }]);
    expect(consultas[0].tabla).toBe('cambio_eventos');
    expect(consultas[0].op.filter(([m]) => m === 'order')).toEqual([['order', 'created_at', { ascending: false }], ['order', 'orden', { ascending: false }]]);
  });

  it('ticketsDeCambio aplana el ticket enlazado', async () => {
    respuestaTabla = () => ({
      data: [{ ticket_id: 't1', created_at: '2026-10-02T09:00:00Z', vinculado_por: 'u1', tickets: { id: 't1', codigo: 'TCK-0007', titulo: 'Sin internet', estado: 'abierto' } }],
      error: null,
    });
    expect(await cambiosApi.ticketsDeCambio('c1')).toEqual([{ id: 't1', codigo: 'TCK-0007', titulo: 'Sin internet', estado: 'abierto', vinculado_at: '2026-10-02T09:00:00Z' }]);
    expect(consultas[0].tabla).toBe('cambio_tickets');
  });

  it('buscarTicketPorCodigo normaliza el código y devuelve null si no existe', async () => {
    respuestaTabla = () => ({ data: { id: 't1', codigo: 'TCK-0007' }, error: null });
    expect((await cambiosApi.buscarTicketPorCodigo('  tck-0007 ')).id).toBe('t1');
    expect(consultas[0].op.find(([m]) => m === 'eq')).toEqual(['eq', 'codigo', 'TCK-0007']);
    respuestaTabla = () => ({ data: null, error: null });
    expect(await cambiosApi.buscarTicketPorCodigo('TCK-9999')).toBeNull();
  });

  it('los indicadores salen de las dos vistas', async () => {
    respuestaTabla = (tabla) => ({ data: [{ tipo: tabla }], error: null });
    expect(await cambiosApi.kpiCambios()).toEqual([{ tipo: 'v_kpi_cambios' }]);
    expect(await cambiosApi.cambiosAprobacionVencida()).toEqual([{ tipo: 'v_cambios_aprobacion_vencida' }]);
  });

  it('un error de lectura se relanza', async () => {
    respuestaTabla = () => ({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(cambiosApi.getCambio('c1')).rejects.toMatchObject({ code: '42501' });
    await expect(cambiosApi.kpiCambios()).rejects.toMatchObject({ code: '42501' });
  });
});

describe('cambiosApi — escritura por RPC (argumentos nombrados)', () => {
  it('crearCambio limpia el título, conserva los saltos de línea y manda null en lo opcional', async () => {
    respuestaRpc = () => ({ data: { id: 'c9', codigo: 'CHG-0009' }, error: null });
    const r = await cambiosApi.crearCambio({
      titulo: '  Cambio   del router ', tipo: 'normal', riesgo: 'alto', servicioId: 'red',
      descripcion: '  Linea 1\nLinea 2  ', planRetroceso: '', ventanaInicio: '2026-10-03T08:00:00Z', ventanaFin: '2026-10-03T10:00:00Z', enviar: true,
    });
    expect(r.codigo).toBe('CHG-0009');
    expect(llamadas).toEqual([{
      nombre: 'crear_cambio',
      args: {
        p_titulo: 'Cambio del router', p_tipo: 'normal', p_riesgo: 'alto', p_servicio_id: 'red', p_descripcion: 'Linea 1\nLinea 2',
        p_plan_retroceso: null, p_ventana_inicio: '2026-10-03T08:00:00Z', p_ventana_fin: '2026-10-03T10:00:00Z', p_enviar: true,
      },
    }]);
  });

  it('crearCambio sin enviar manda p_enviar en false', async () => {
    await cambiosApi.crearCambio({ titulo: 'Titulo', tipo: 'estandar', riesgo: 'bajo', servicioId: 'equipos', descripcion: 'd' });
    expect(llamadas[0].args).toMatchObject({ p_enviar: false, p_plan_retroceso: null, p_ventana_inicio: null, p_ventana_fin: null });
  });

  it('actualizarCambio manda el id del borrador y los mismos campos', async () => {
    await cambiosApi.actualizarCambio('c1', { titulo: 'Nuevo titulo', tipo: 'emergencia', riesgo: 'medio', servicioId: 'vpn', descripcion: 'd', planRetroceso: 'Plan' });
    expect(llamadas[0]).toEqual({
      nombre: 'actualizar_cambio',
      args: {
        p_cambio_id: 'c1', p_titulo: 'Nuevo titulo', p_tipo: 'emergencia', p_riesgo: 'medio', p_servicio_id: 'vpn', p_descripcion: 'd',
        p_plan_retroceso: 'Plan', p_ventana_inicio: null, p_ventana_fin: null,
      },
    });
  });

  it('transicionar, aprobar, rechazar, vincular y desvincular mandan sus argumentos', async () => {
    await cambiosApi.transicionarCambio('c1', 'en_ejecucion');
    await cambiosApi.transicionarCambio('c1', 'revertido', '  Degrado la red ');
    await cambiosApi.aprobarCambio('c1');
    await cambiosApi.aprobarCambio('c1', 'Autorizado');
    await cambiosApi.rechazarCambio('c1', 'Ventana en cierre contable');
    await cambiosApi.vincularCambioTicket('c1', 't1');
    await cambiosApi.desvincularCambioTicket('c1', 't1');
    expect(llamadas).toEqual([
      { nombre: 'transicionar_cambio', args: { p_cambio_id: 'c1', p_destino: 'en_ejecucion', p_nota: null } },
      { nombre: 'transicionar_cambio', args: { p_cambio_id: 'c1', p_destino: 'revertido', p_nota: 'Degrado la red' } },
      { nombre: 'aprobar_cambio', args: { p_cambio_id: 'c1', p_nota: null } },
      { nombre: 'aprobar_cambio', args: { p_cambio_id: 'c1', p_nota: 'Autorizado' } },
      { nombre: 'rechazar_cambio', args: { p_cambio_id: 'c1', p_motivo: 'Ventana en cierre contable' } },
      { nombre: 'vincular_cambio_ticket', args: { p_cambio_id: 'c1', p_ticket_id: 't1' } },
      { nombre: 'desvincular_cambio_ticket', args: { p_cambio_id: 'c1', p_ticket_id: 't1' } },
    ]);
  });

  it('un error de la RPC se relanza crudo (código y mensaje del servidor)', async () => {
    respuestaRpc = () => ({ data: null, error: { code: 'P0001', message: 'Solo un jefe puede aprobar o rechazar un cambio.' } });
    await expect(cambiosApi.transicionarCambio('c1', 'aprobado')).rejects.toMatchObject({ code: 'P0001' });
    await expect(cambiosApi.aprobarCambio('c1')).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('store de cambios — errores ya traducidos y detalle', () => {
  it('un 42501 sale como "sin permiso" y una regla de negocio conserva su texto en español', async () => {
    const store = useCambiosStore();
    respuestaRpc = () => ({ data: null, error: { code: '42501', message: 'No autorizado' } });
    await expect(store.aprobar('c1')).rejects.toThrow(MENSAJE_SIN_PERMISO);
    respuestaRpc = () => ({ data: null, error: { code: 'P0001', message: 'Un cambio normal necesita un plan de retroceso.' } });
    await expect(store.transicionar('c1', 'solicitado')).rejects.toThrow('plan de retroceso');
    await expect(store.actualizarBorrador('c1', { titulo: 'x' })).rejects.toThrow('plan de retroceso');
  });

  it('cargarDetalle trae el cambio, su libro y sus tickets; si el libro falla, el cambio se muestra igual', async () => {
    const store = useCambiosStore();
    respuestaTabla = (tabla) => {
      if (tabla === 'cambios') return { data: filaCambio(), error: null };
      if (tabla === 'cambio_eventos') return { data: [{ id: 'e1', evento: 'creado', created_at: '2026-10-02T08:00:00Z' }], error: null };
      return { data: [], error: null };
    };
    const c = await store.cargarDetalle('c1');
    expect(c.codigo).toBe('CHG-0004');
    expect(store.eventos).toHaveLength(1);
    expect(store.tickets).toEqual([]);
    expect(store.errorDetalle).toBe('');

    respuestaTabla = (tabla) => (tabla === 'cambios' ? { data: filaCambio(), error: null } : { data: null, error: { code: '42501', message: 'x' } });
    store.limpiarDetalle();
    expect((await store.cargarDetalle('c1')).codigo).toBe('CHG-0004');
    expect(store.eventos).toEqual([]);
  });

  it('un fallo al cargar deja el error en español y sin detalle', async () => {
    const store = useCambiosStore();
    respuestaTabla = () => ({ data: null, error: { code: '42501', message: 'permission denied' } });
    expect(await store.cargarDetalle('c1')).toBeNull();
    expect(store.detalle).toBeNull();
    expect(store.errorDetalle).toBe(MENSAJE_SIN_PERMISO);
  });

  it('una mutación vuelve a leer el detalle; recarga la lista solo si ya tenía filas y no al enlazar tickets', async () => {
    const store = useCambiosStore();
    store.lista = [{ id: 'c1' }];
    let estado = 'solicitado';
    respuestaTabla = (tabla) => (tabla === 'cambios' ? { data: filaCambio({ estado }), error: null, count: 1 } : { data: [], error: null });
    respuestaRpc = () => { estado = 'aprobado'; return { data: { id: 'c1' }, error: null }; };
    await store.aprobar('c1', 'Autorizado');
    expect(llamadas[0]).toEqual({ nombre: 'aprobar_cambio', args: { p_cambio_id: 'c1', p_nota: 'Autorizado' } });
    expect(store.detalle.estado).toBe('aprobado');
    expect(consultas.some((c) => c.op.some(([m]) => m === 'range'))).toBe(true);

    consultas.length = 0;
    await store.vincularTicket('c1', 't1');
    expect(llamadas.at(-1)).toEqual({ nombre: 'vincular_cambio_ticket', args: { p_cambio_id: 'c1', p_ticket_id: 't1' } });
    expect(consultas.some((c) => c.op.some(([m]) => m === 'range'))).toBe(false);

    const sinLista = useCambiosStore();
    sinLista.lista = [];
    consultas.length = 0;
    await sinLista.rechazar('c1', 'No');
    expect(consultas.some((c) => c.op.some(([m]) => m === 'range'))).toBe(false);
  });

  it('el filtro inicial es la vista «En curso», sin tipo ni servicio', () => {
    const store = useCambiosStore();
    expect(store.filtros).toEqual({ q: '', estados: ['borrador', 'solicitado', 'aprobado', 'en_ejecucion', 'implementado'], tipos: [], servicios: [] });
  });
});

describe('serviciosApi y servicio_id de las categorías', () => {
  it('listServicios pide solo los vivos, ordenados por nombre', async () => {
    respuestaTabla = () => ({ data: [{ id: 'red', nombre: 'Internet y red' }], error: null });
    expect(await serviciosApi.listServicios()).toHaveLength(1);
    expect(consultas[0].tabla).toBe('servicios');
    expect(consultas[0].op.find(([m]) => m === 'is')).toEqual(['is', 'deleted_at', null]);
    expect(consultas[0].op.find(([m]) => m === 'order')).toEqual(['order', 'nombre', { ascending: true }]);
  });

  it('createServicio y updateServicio limpian los textos y mandan null en lo vacío', async () => {
    respuestaTabla = () => ({ data: { id: 'correo' }, error: null });
    await serviciosApi.createServicio({ id: 'correo', nombre: '  Correo   corporativo ', descripcion: '', dueno_user_id: '', criticidad: 'alta', horario: ' 24 x 7 ' });
    expect(consultas[0].op.find(([m]) => m === 'insert')[1]).toEqual([{
      id: 'correo', nombre: 'Correo corporativo', descripcion: null, dueno_user_id: null, criticidad: 'alta', horario: '24 x 7',
    }]);
    await serviciosApi.updateServicio('correo', { nombre: 'Correo', criticidad: '', dueno_user_id: 'u1' });
    expect(consultas[1].op.find(([m]) => m === 'update')[1]).toEqual({
      nombre: 'Correo', descripcion: null, dueno_user_id: 'u1', criticidad: 'media', horario: null,
    });
    expect(consultas[1].op.find(([m]) => m === 'eq')).toEqual(['eq', 'id', 'correo']);
  });

  it('softDeleteServicio marca deleted_at (no borra la fila)', async () => {
    await serviciosApi.softDeleteServicio('correo');
    const [, datos] = consultas[0].op.find(([m]) => m === 'update');
    expect(Object.keys(datos)).toEqual(['deleted_at']);
    expect(typeof datos.deleted_at).toBe('string');
    expect(consultas[0].op.some(([m]) => m === 'delete')).toBe(false);
  });

  it('las categorías de ticket leen y guardan su servicio opcional', async () => {
    respuestaTabla = () => ({ data: [{ id: 'red', nombre: 'Redes', servicio_id: 'red' }], error: null });
    expect((await ticketsApi.listCategoriasTicket())[0].servicio_id).toBe('red');
    expect(JSON.stringify(consultas[0].op.find(([m]) => m === 'select'))).toContain('servicio_id');

    respuestaTabla = () => ({ data: { id: 'x' }, error: null });
    consultas.length = 0;
    await ticketsApi.createCategoriaTicket({ id: 'x', nombre: ' Nueva ', servicio_id: '' });
    expect(consultas[0].op.find(([m]) => m === 'insert')[1]).toEqual([{ id: 'x', nombre: 'Nueva', servicio_id: null }]);
    await ticketsApi.updateCategoriaTicket('x', { nombre: 'Nueva', servicio_id: 'erp' });
    expect(consultas[1].op.find(([m]) => m === 'update')[1]).toEqual({ nombre: 'Nueva', servicio_id: 'erp' });
    // sin la clave, la actualización no toca el servicio (renombrar no lo borra)
    await ticketsApi.updateCategoriaTicket('x', { nombre: 'Solo nombre' });
    expect(consultas[2].op.find(([m]) => m === 'update')[1]).toEqual({ nombre: 'Solo nombre' });
  });
});
