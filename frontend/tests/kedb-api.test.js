// KEDB (migración 106) sobre un cliente falso: las RPC reciben argumentos
// NOMBRADOS, los textos viajan limpios (el de varias líneas conserva sus saltos),
// los errores del servidor llegan crudos al dominio y los stores los entregan ya
// en español. Cubre también el mapeo de tipo/problema en la KB y de
// workaround/error conocido en Problemas, y el reemplazo de la lógica de
// cliente de `guardarComoBorradorKb` por `crear_kb_desde_ticket`.
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

import { kbApi } from '../src/api/domains/kb.js';
import { problemasApi } from '../src/api/domains/problemas.js';
import { insforgeApi } from '../src/api/insforge.js';
import { useTicketDetalleStore } from '../src/stores/ticketDetalle.js';
import { useProblemaDetalleStore } from '../src/stores/problemaDetalle.js';
import { MENSAJE_SIN_PERMISO } from '../src/api/erroresDb.js';

const filaKb = (extra = {}) => ({
  id: 'k1', titulo: 'Workaround: Caídas', categoria_id: 'red', sintoma: 'Cortes', solucion: 'Reiniciar', estado: 'en_revision',
  tipo: 'workaround', problema_id: 'p1', util_si: 0, util_no: 0, ticket_origen_id: 't1', created_by: 'u1',
  created_at: '2026-10-02T09:00:00', updated_at: '2026-10-02T09:00:00', ...extra,
});

beforeEach(() => {
  llamadas.length = 0;
  consultas.length = 0;
  respuestaRpc = () => ({ data: null, error: null });
  respuestaTabla = () => ({ data: [], error: null, count: 0 });
  setActivePinia(createPinia());
});

describe('kbApi — KEDB: RPC', () => {
  it('publicarWorkaroundProblema manda argumentos nombrados, conserva los saltos de línea y devuelve el artículo mapeado', async () => {
    respuestaRpc = () => ({ data: filaKb(), error: null });
    const a = await kbApi.publicarWorkaroundProblema('p1', { workaround: '  Paso 1\nPaso 2  ', titulo: '  Título   propio ', sintoma: '' });
    expect(llamadas).toEqual([{
      nombre: 'publicar_workaround_problema',
      args: { p_problema_id: 'p1', p_workaround: 'Paso 1\nPaso 2', p_titulo: 'Título propio', p_sintoma: null },
    }]);
    expect(a).toMatchObject({ id: 'k1', tipo: 'workaround', problema_id: 'p1', estado: 'en_revision', solucion: 'Reiniciar' });
  });

  it('sin opciones, todo viaja como null (el servidor usa el workaround ya guardado)', async () => {
    respuestaRpc = () => ({ data: filaKb(), error: null });
    await kbApi.publicarWorkaroundProblema('p1');
    expect(llamadas[0].args).toEqual({ p_problema_id: 'p1', p_workaround: null, p_titulo: null, p_sintoma: null });
  });

  it('crearKbDesdeTicket manda la solución (o null) y los textos limpios', async () => {
    respuestaRpc = () => ({ data: filaKb({ tipo: 'solucion', problema_id: null, estado: 'borrador' }), error: null });
    const a = await kbApi.crearKbDesdeTicket('t1', { solucion: 'Paso\nSiguiente', titulo: ' Impresora ' });
    expect(llamadas[0]).toEqual({
      nombre: 'crear_kb_desde_ticket',
      args: { p_ticket_id: 't1', p_solucion: 'Paso\nSiguiente', p_titulo: 'Impresora', p_sintoma: null },
    });
    expect(a).toMatchObject({ tipo: 'solucion', estado: 'borrador', problema_id: null });
    await kbApi.crearKbDesdeTicket('t2');
    expect(llamadas[1].args).toEqual({ p_ticket_id: 't2', p_solucion: null, p_titulo: null, p_sintoma: null });
  });

  it('registrarUsoKbTicket devuelve la fila del uso', async () => {
    respuestaRpc = () => ({ data: { ticket_id: 't1', kb_articulo_id: 'k1', usado_por: 'u1' }, error: null });
    const uso = await kbApi.registrarUsoKbTicket('t1', 'k1');
    expect(llamadas[0]).toEqual({ nombre: 'registrar_uso_kb_ticket', args: { p_ticket_id: 't1', p_kb_articulo_id: 'k1' } });
    expect(uso.kb_articulo_id).toBe('k1');
  });

  it('los errores del servidor llegan crudos (los traduce quien los muestra)', async () => {
    const e = { code: '42501', message: 'No autorizado' };
    respuestaRpc = () => ({ data: null, error: e });
    await expect(kbApi.publicarWorkaroundProblema('p1')).rejects.toBe(e);
    await expect(kbApi.crearKbDesdeTicket('t1')).rejects.toBe(e);
    await expect(kbApi.registrarUsoKbTicket('t1', 'k1')).rejects.toBe(e);
  });
});

describe('kbApi — KEDB: lectura', () => {
  it('listUsosKbTicket consulta ticket_kb_usos por ticket', async () => {
    respuestaTabla = () => ({ data: [{ kb_articulo_id: 'k1', usado_por: 'u1', created_at: 'x' }], error: null });
    const usos = await kbApi.listUsosKbTicket('t1');
    expect(usos).toHaveLength(1);
    expect(consultas[0].tabla).toBe('ticket_kb_usos');
    expect(consultas[0].op.find(([m]) => m === 'eq')).toEqual(['eq', 'ticket_id', 't1']);
  });

  it('kpiKbArticulo lee v_kpi_kb y devuelve ceros si el artículo no es visible', async () => {
    respuestaTabla = () => ({ data: { usos_90d: 2, usos_total: 5, ultimo_uso_at: '2026-10-01T10:00:00' }, error: null });
    expect(await kbApi.kpiKbArticulo('k1')).toEqual({ usos_90d: 2, usos_total: 5, ultimo_uso_at: '2026-10-01T10:00:00' });
    expect(consultas[0].tabla).toBe('v_kpi_kb');
    respuestaTabla = () => ({ data: null, error: null });
    expect(await kbApi.kpiKbArticulo('k9')).toEqual({ usos_90d: 0, usos_total: 0, ultimo_uso_at: null });
  });

  it('el listado y el detalle traen tipo y problema_id; un artículo anterior a la 106 es "solucion"', async () => {
    respuestaTabla = () => ({ data: [filaKb(), filaKb({ id: 'k2', tipo: undefined, problema_id: undefined })], error: null, count: 2 });
    const { items } = await kbApi.listKbPage({});
    expect(items[0]).toMatchObject({ tipo: 'workaround', problema_id: 'p1' });
    expect(items[1]).toMatchObject({ tipo: 'solucion', problema_id: null });
    const select = consultas[0].op.find(([m]) => m === 'select')[1];
    expect(select).toContain('tipo');
    expect(select).toContain('problema_id');
  });

  it('crearKbArticulo manda el tipo elegido (solucion por defecto)', async () => {
    respuestaTabla = () => ({ data: filaKb(), error: null });
    await kbApi.crearKbArticulo({ titulo: 'A', tipo: 'procedimiento' });
    await kbApi.crearKbArticulo({ titulo: 'B' });
    const filas = consultas.map((q) => q.op.find(([m]) => m === 'insert')[1][0]);
    expect(filas.map((f) => f.tipo)).toEqual(['procedimiento', 'solucion']);
  });

  it('getProblema trae workaround, error_conocido y kb_articulo_id con valores por defecto', async () => {
    respuestaTabla = () => ({ data: { id: 'p1', titulo: 'T', severidad: 'alta', estado: 'abierto', descripcion: 'd', created_at: 'x', updated_at: 'x' }, error: null });
    expect(await problemasApi.getProblema('p1')).toMatchObject({ workaround: '', error_conocido: false, kb_articulo_id: null });
    respuestaTabla = () => ({ data: { id: 'p1', titulo: 'T', severidad: 'alta', estado: 'abierto', descripcion: 'd', workaround: 'Reiniciar', error_conocido: true, kb_articulo_id: 'k1', created_at: 'x', updated_at: 'x' }, error: null });
    expect(await problemasApi.getProblema('p1')).toMatchObject({ workaround: 'Reiniciar', error_conocido: true, kb_articulo_id: 'k1' });
    expect(consultas.at(-1).op.find(([m]) => m === 'select')[1]).toContain('error_conocido');
  });
});

describe('stores — reemplazan la lógica de cliente', () => {
  it('ticketDetalle.guardarComoBorradorKb llama a crear_kb_desde_ticket (ya no inserta el borrador desde el cliente)', async () => {
    respuestaRpc = () => ({ data: filaKb({ tipo: 'solucion', estado: 'borrador' }), error: null });
    const store = useTicketDetalleStore();
    store.ticket = { id: 't1', titulo: 'No imprime', categoria_id: 'equipos' };
    const a = await store.guardarComoBorradorKb({ solucion: 'Reiniciar el spooler' });
    expect(llamadas.map((l) => l.nombre)).toEqual(['crear_kb_desde_ticket']);
    expect(llamadas[0].args).toMatchObject({ p_ticket_id: 't1', p_solucion: 'Reiniciar el spooler' });
    expect(consultas).toHaveLength(0);
    expect(a.estado).toBe('borrador');
  });

  it('ticketDetalle.guardarComoBorradorKb entrega el rechazo del servidor en español (sin solución, sin permiso)', async () => {
    const store = useTicketDetalleStore();
    store.ticket = { id: 't1' };
    respuestaRpc = () => ({ data: null, error: { code: 'P0001', message: 'El ticket no tiene nota de resolución. Escriba la solución para crear el artículo.' } });
    await expect(store.guardarComoBorradorKb()).rejects.toMatchObject({ message: 'El ticket no tiene nota de resolución. Escriba la solución para crear el artículo.', tipo: 'validacion' });
    respuestaRpc = () => ({ data: null, error: { code: '42501', message: 'No autorizado' } });
    await expect(store.guardarComoBorradorKb()).rejects.toMatchObject({ message: MENSAJE_SIN_PERMISO, tipo: 'permiso' });
  });

  it('problemaDetalle.publicarWorkaround llama a la RPC, recarga el problema y devuelve el artículo', async () => {
    const store = useProblemaDetalleStore();
    store.problema = { id: 'p1', error_conocido: false, workaround: '' };
    respuestaRpc = () => ({ data: filaKb(), error: null });
    respuestaTabla = () => ({
      data: { id: 'p1', titulo: 'T', severidad: 'alta', estado: 'abierto', descripcion: 'd', workaround: 'Reiniciar', error_conocido: true, kb_articulo_id: 'k1', created_at: 'x', updated_at: 'x' },
      error: null,
    });
    const a = await store.publicarWorkaround({ workaround: 'Reiniciar' });
    expect(llamadas[0]).toMatchObject({ nombre: 'publicar_workaround_problema', args: { p_problema_id: 'p1', p_workaround: 'Reiniciar' } });
    expect(a.id).toBe('k1');
    expect(store.problema).toMatchObject({ error_conocido: true, kb_articulo_id: 'k1', workaround: 'Reiniciar' });
  });

  it('problemaDetalle.publicarWorkaround traduce el rechazo y deja el problema como estaba', async () => {
    const store = useProblemaDetalleStore();
    store.problema = { id: 'p1', error_conocido: false };
    respuestaRpc = () => ({ data: null, error: { code: 'P0001', message: 'Escriba el workaround antes de publicarlo en la base de conocimiento.' } });
    await expect(store.publicarWorkaround()).rejects.toMatchObject({ message: 'Escriba el workaround antes de publicarlo en la base de conocimiento.' });
    expect(store.problema).toEqual({ id: 'p1', error_conocido: false });
  });
});

describe('barrel', () => {
  it('insforgeApi expone los métodos de la KEDB', () => {
    for (const m of ['publicarWorkaroundProblema', 'crearKbDesdeTicket', 'registrarUsoKbTicket', 'listUsosKbTicket', 'kpiKbArticulo']) {
      expect(typeof insforgeApi[m]).toBe('function');
    }
  });
});
