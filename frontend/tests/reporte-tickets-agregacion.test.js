// Tests de la agregación del reporte de tickets contra un cliente simulado.
// Fijan los criterios que la auditoría del 2026-08-05 dejó establecidos:
//   1. 'rechazado' NO es una resolución (migración 017: terminal alterno, sin
//      encuesta) — columna propia, y resueltos + rechazados + sin resolver = total.
//   2. Las resoluciones salen de los eventos 'estado_cambiado' leyendo el estado
//      destino del detalle, no de un ilike sobre ese texto: un ticket resuelto
//      varias veces cuenta una vez, para el último técnico que lo marcó.
//   3. La tasa de respuesta va sobre las encuestas generadas al cerrar, y
//      "respondida" se decide SIEMPRE por fecha_envio.
//   4. La tasa de reapertura lleva como denominador los tickets resueltos.
//   5. Los filtros `in` se trocean: no puede haber una sola petición gigante.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const respuestas = {};
const llamadas = [];

// Las cuatro consultas de `tickets`/`ticket_satisfaccion` se distinguen por la
// columna del filtro `in` (creados vs backlog vs resueltos), y las de
// `ticket_eventos` por el evento pedido.
vi.mock('../src/api/client.js', () => ({
  getClient: () => ({
    database: {
      from(tabla) {
        const est = { tabla, in: null, evento: null };
        const qb = {};
        for (const m of ['select', 'ilike', 'gte', 'lte', 'order', 'is', 'limit']) qb[m] = () => qb;
        qb.in = (col, valores) => { est.in = col; est.valores = valores; return qb; };
        qb.eq = (col, val) => { if (col === 'evento') est.evento = val; return qb; };
        qb.then = (res, rej) => {
          const clave = claveDe(est);
          llamadas.push({ clave, cantidad: est.valores?.length ?? null });
          return Promise.resolve({ data: respuestas[clave] ?? [], error: null }).then(res, rej);
        };
        return qb;
      },
    },
  }),
}));

function claveDe(est) {
  if (est.tabla === 'ticket_eventos') return est.evento || 'ticket_eventos';
  if (est.tabla === 'ticket_satisfaccion') return est.in === 'ticket_id' ? 'sat_por_ticket' : 'ticket_satisfaccion';
  if (est.in === 'estado') return 'backlog';
  if (est.in === 'id') return 'tickets_resueltos';
  return 'tickets';
}

const { reportesTicketsApi } = await import('../src/api/domains/reportesTickets.js');

const PERIODO = { desde: '2026-08-03T00:00:00.000Z', hasta: '2026-08-09T23:59:59.999Z' };
const ana = { nombres: 'Ana', apellidos: 'Perez' };
const resuelto = (ticketId, userId, fecha) => ({ ticket_id: ticketId, user_id: userId, detalle: 'De "en_progreso" a "resuelto"', created_at: fecha });
const reabierto = (ticketId, fecha) => ({ ticket_id: ticketId, user_id: 'jefe', detalle: 'De "cerrado" a "reabierto"', created_at: fecha });

beforeEach(() => {
  for (const k of Object.keys(respuestas)) delete respuestas[k];
  llamadas.length = 0;
  respuestas.tickets = [];
});

describe('estado actual por solicitante', () => {
  it('no cuenta un ticket rechazado como resuelto y la suma cierra contra el total', async () => {
    respuestas.tickets = [
      { id: 't1', estado: 'cerrado', prioridad: 'alta', vinculado: true, empleados: ana },
      { id: 't2', estado: 'rechazado', prioridad: 'baja', vinculado: true, empleados: ana },
      { id: 't3', estado: 'abierto', prioridad: 'media', vinculado: true, empleados: ana },
    ];

    const { porSolicitante } = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    const fila = porSolicitante.find((s) => s.solicitante === 'Ana Perez');

    expect(fila).toMatchObject({ total: 3, resueltos: 1, rechazados: 1, sinResolver: 1 });
    expect(fila.resueltos + fila.rechazados + fila.sinResolver).toBe(fila.total);
  });

  it('cuenta "resuelto" y "cerrado" como resueltos, y reabierto como sin resolver', async () => {
    respuestas.tickets = [
      { id: 't1', estado: 'resuelto', vinculado: true, empleados: ana },
      { id: 't2', estado: 'cerrado', vinculado: true, empleados: ana },
      { id: 't3', estado: 'reabierto', vinculado: true, empleados: ana },
      { id: 't4', estado: 'en_progreso', vinculado: true, empleados: ana },
    ];

    const { porSolicitante } = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(porSolicitante[0]).toMatchObject({ total: 4, resueltos: 2, rechazados: 0, sinResolver: 2 });
  });

  it('agrupa como "Sin vincular" los tickets sin empleado', async () => {
    respuestas.tickets = [{ id: 't1', estado: 'abierto', vinculado: false, contacto_ingresado: 'x@y.com' }];
    const { porSolicitante } = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(porSolicitante[0].solicitante).toBe('Sin vincular');
  });
});

describe('resoluciones y reaperturas del periodo', () => {
  it('lee el estado destino del detalle del evento, sin depender de un ilike', async () => {
    respuestas.estado_cambiado = [
      resuelto('t1', 'staff-1', '2026-08-03T10:00:00Z'),
      { ticket_id: 't1', user_id: 'staff-1', detalle: 'De "resuelto" a "cerrado"', created_at: '2026-08-03T10:00:05Z' },
      { ticket_id: 't2', user_id: 'staff-2', detalle: 'De "abierto" a "en_progreso"', created_at: '2026-08-04T09:00:00Z' },
    ];

    const r = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(r.totalResueltos).toBe(1);
    expect(r.porTecnico).toEqual({ 'staff-1': 1 });
  });

  it('cuenta una vez el ticket resuelto dos veces y lo atribuye al último técnico', async () => {
    respuestas.estado_cambiado = [
      resuelto('t1', 'staff-1', '2026-08-03T10:00:00Z'),
      reabierto('t1', '2026-08-04T08:00:00Z'),
      resuelto('t1', 'staff-2', '2026-08-05T10:00:00Z'),
    ];

    const r = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(r.totalResueltos).toBe(1);
    expect(r.porTecnico).toEqual({ 'staff-2': 1 });
  });

  it('agrupa como "sin_asignar" los eventos sin user_id', async () => {
    respuestas.estado_cambiado = [resuelto('t9', null, '2026-08-04T10:00:00Z')];
    const r = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(r.porTecnico).toEqual({ sin_asignar: 1 });
  });

  it('calcula la tasa de reapertura sobre los tickets resueltos, no sobre los creados', async () => {
    respuestas.tickets = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, estado: 'abierto', vinculado: false }));
    respuestas.estado_cambiado = [
      resuelto('t1', 'staff-1', '2026-08-03T10:00:00Z'),
      resuelto('t2', 'staff-1', '2026-08-03T11:00:00Z'),
      resuelto('t3', 'staff-1', '2026-08-03T12:00:00Z'),
      resuelto('t4', 'staff-1', '2026-08-03T13:00:00Z'),
      reabierto('t1', '2026-08-05T08:00:00Z'),
    ];

    const r = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(r.totalResueltos).toBe(4);
    expect(r.reaperturas).toBe(1);
    expect(r.tasaReapertura).toBe(25);   // 1/4, no 1/10
  });

  it('deja la tasa de reapertura en null si no hubo resoluciones', async () => {
    const r = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(r.tasaReapertura).toBeNull();
  });
});

describe('tiempos de resolución', () => {
  beforeEach(() => {
    // t1: 2 h, t2: 4 h, t3: 24 h  → promedio 10 h, mediana 4 h
    respuestas.estado_cambiado = [
      resuelto('t1', 'staff-1', '2026-08-03T12:00:00Z'),
      resuelto('t2', 'staff-1', '2026-08-04T14:00:00Z'),
      resuelto('t3', 'staff-2', '2026-08-06T10:00:00Z'),
    ];
    respuestas.tickets_resueltos = [
      { id: 't1', created_at: '2026-08-03T10:00:00Z', prioridad: 'alta' },
      { id: 't2', created_at: '2026-08-04T10:00:00Z', prioridad: 'alta' },
      { id: 't3', created_at: '2026-08-05T10:00:00Z', prioridad: 'baja' },
    ];
  });

  it('informa promedio, mediana y tamaño de muestra en horas', async () => {
    const { tiempoResolucion } = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(tiempoResolucion).toEqual({ promedio: 10, mediana: 4, muestra: 3 });
  });

  it('desglosa por prioridad y por técnico', async () => {
    const r = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(r.tiempoPorPrioridad.alta).toEqual({ promedio: 3, mediana: 3, muestra: 2 });
    expect(r.tiempoPorPrioridad.baja).toEqual({ promedio: 24, mediana: 24, muestra: 1 });
    expect(r.tiempoPorTecnico['staff-1']).toEqual({ promedio: 3, mediana: 3, muestra: 2 });
    expect(r.tiempoPorTecnico['staff-2'].promedio).toBe(24);
  });

  it('ignora resoluciones sin el ticket correspondiente en vez de fallar', async () => {
    respuestas.tickets_resueltos = [{ id: 't1', created_at: '2026-08-03T10:00:00Z', prioridad: 'alta' }];
    const { tiempoResolucion } = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(tiempoResolucion).toEqual({ promedio: 2, mediana: 2, muestra: 1 });
  });
});

describe('distribuciones', () => {
  it('agrupa por tipo y marca los sin clasificar', async () => {
    respuestas.tickets = [
      { id: 't1', estado: 'abierto', tipo: 'incidente', vinculado: false },
      { id: 't2', estado: 'abierto', tipo: 'incidente', vinculado: false },
      { id: 't3', estado: 'abierto', tipo: 'solicitud', vinculado: false },
      { id: 't4', estado: 'abierto', tipo: null, vinculado: false },
    ];
    const { porTipo } = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(porTipo).toEqual([
      { clave: 'incidente', cantidad: 2 },
      { clave: 'solicitud', cantidad: 1 },
      { clave: 'sin_clasificar', cantidad: 1 },
    ]);
  });

  it('cuenta el volumen por día en orden cronológico', async () => {
    respuestas.tickets = [
      { id: 't1', estado: 'abierto', vinculado: false, created_at: '2026-08-05T12:00:00' },
      { id: 't2', estado: 'abierto', vinculado: false, created_at: '2026-08-03T09:00:00' },
      { id: 't3', estado: 'abierto', vinculado: false, created_at: '2026-08-05T18:00:00' },
    ];
    const { porDia } = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(porDia).toEqual([
      { fecha: '2026-08-03', cantidad: 1 },
      { fecha: '2026-08-05', cantidad: 2 },
    ]);
  });

  it('agrupa sin categoría y ordena por cantidad', async () => {
    respuestas.tickets = [
      { id: 't1', estado: 'abierto', prioridad: 'alta', vinculado: false, categorias_ticket: null },
      { id: 't2', estado: 'abierto', prioridad: 'alta', vinculado: false, categorias_ticket: { nombre: 'Redes' } },
      { id: 't3', estado: 'cerrado', prioridad: 'alta', vinculado: false, categorias_ticket: { nombre: 'Redes' } },
    ];
    const r = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(r.totalCreados).toBe(3);
    expect(r.porCategoria).toEqual([
      { clave: 'Redes', cantidad: 2 },
      { clave: 'Sin categoría', cantidad: 1 },
    ]);
  });
});

describe('backlog', () => {
  it('agrupa los pendientes por antigüedad y reporta el más viejo', async () => {
    const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
    respuestas.backlog = [
      { created_at: hace(0), prioridad: 'alta' },
      { created_at: hace(2), prioridad: 'alta' },
      { created_at: hace(5), prioridad: 'media' },
      { created_at: hace(20), prioridad: 'baja' },
      { created_at: hace(45), prioridad: 'baja' },
    ];

    const { backlog } = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(backlog.total).toBe(5);
    expect(backlog.tramos.map((t) => t.cantidad)).toEqual([2, 1, 1, 1]);
    expect(backlog.diasMasAntiguo).toBe(45);
  });

  it('sin pendientes devuelve total 0 y sin antigüedad', async () => {
    const { backlog } = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(backlog.total).toBe(0);
    expect(backlog.diasMasAntiguo).toBeNull();
  });
});

describe('encuestas y comentarios', () => {
  it('usa fecha_envio como único criterio de respondida', async () => {
    respuestas.ticket_satisfaccion = [
      { nivel: 5, comentario: 'Bien', fecha_envio: '2026-08-04T12:00:00Z' },
      { nivel: 3, comentario: null, fecha_envio: '2026-08-05T09:00:00Z' },
      { nivel: null, comentario: null, fecha_envio: null },
    ];

    const r = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(r.encuestasGeneradas).toBe(3);
    expect(r.encuestasRespondidas).toBe(2);
    expect(r.promedioSatisfaccion).toBe(4);
  });

  it('marca contestada/pendiente por solicitante con el mismo criterio', async () => {
    respuestas.tickets = [
      { id: 't1', estado: 'cerrado', vinculado: true, empleados: ana },
      { id: 't2', estado: 'cerrado', vinculado: true, empleados: ana },
      { id: 't3', estado: 'rechazado', vinculado: true, empleados: ana },
    ];
    respuestas.sat_por_ticket = [
      { ticket_id: 't1', fecha_envio: '2026-08-04T12:00:00Z' },
      { ticket_id: 't2', fecha_envio: null },
    ];

    const { porSolicitante } = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(porSolicitante[0]).toMatchObject({ encuestasContestadas: 1, encuestasPendientes: 1 });
  });

  it('recorta los comentarios a 20 pero informa el total', async () => {
    respuestas.ticket_satisfaccion = Array.from({ length: 32 }, (_, i) => ({
      nivel: 4,
      comentario: `Comentario ${i}`,
      fecha_envio: `2026-08-0${(i % 7) + 3}T1${i % 10}:00:00Z`,
    }));

    const r = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(r.comentarios).toHaveLength(20);
    expect(r.comentariosTotal).toBe(32);
    // Ordenados del más reciente al más antiguo.
    const fechas = r.comentarios.map((c) => c.fecha);
    expect([...fechas].sort().reverse()).toEqual(fechas);
  });

  it('sin respuestas el promedio es null y no un 0', async () => {
    respuestas.ticket_satisfaccion = [{ nivel: null, comentario: null, fecha_envio: null }];
    const r = await reportesTicketsApi.obtenerReporteTickets(PERIODO);
    expect(r.encuestasRespondidas).toBe(0);
    expect(r.promedioSatisfaccion).toBeNull();
  });
});

describe('troceo de los filtros in', () => {
  it('parte la consulta de encuestas por ticket en lotes de 100', async () => {
    respuestas.tickets = Array.from({ length: 250 }, (_, i) => ({
      id: `t${i}`, estado: 'abierto', vinculado: false,
    }));

    await reportesTicketsApi.obtenerReporteTickets(PERIODO);

    const lotesSat = llamadas.filter((l) => l.clave === 'sat_por_ticket');
    expect(lotesSat).toHaveLength(3);
    expect(lotesSat.map((l) => l.cantidad)).toEqual([100, 100, 50]);
  });

  it('parte también la consulta de tickets resueltos', async () => {
    respuestas.estado_cambiado = Array.from({ length: 150 }, (_, i) =>
      resuelto(`r${i}`, 'staff-1', '2026-08-04T10:00:00Z'));

    await reportesTicketsApi.obtenerReporteTickets(PERIODO);

    const lotesResueltos = llamadas.filter((l) => l.clave === 'tickets_resueltos');
    expect(lotesResueltos.map((l) => l.cantidad)).toEqual([100, 50]);
  });
});

describe('obtenerResumenTickets (comparativa)', () => {
  it('devuelve solo los cuatro números del periodo anterior', async () => {
    respuestas.tickets = [{ id: 'a' }, { id: 'b' }];
    respuestas.estado_cambiado = [
      resuelto('a', 'staff-1', '2026-07-10T10:00:00Z'),
      { ticket_id: 'b', user_id: 'staff-1', detalle: 'De "abierto" a "en_progreso"', created_at: '2026-07-11T10:00:00Z' },
    ];
    respuestas.ticket_satisfaccion = [
      { nivel: 4, fecha_envio: '2026-07-12T10:00:00Z' },
      { nivel: null, fecha_envio: null },
    ];

    const r = await reportesTicketsApi.obtenerResumenTickets({ desde: '2026-07-01T00:00:00Z', hasta: '2026-07-31T23:59:59Z' });
    expect(r).toEqual({ totalCreados: 2, totalResueltos: 1, promedioSatisfaccion: 4, tasaRespuesta: 50 });
  });

  it('devuelve null en satisfacción y tasa cuando no hubo encuestas', async () => {
    const r = await reportesTicketsApi.obtenerResumenTickets({ desde: '2026-07-01T00:00:00Z', hasta: '2026-07-31T23:59:59Z' });
    expect(r).toMatchObject({ totalCreados: 0, totalResueltos: 0, promedioSatisfaccion: null, tasaRespuesta: null });
  });
});
