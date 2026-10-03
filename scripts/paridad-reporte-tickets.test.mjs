// node --test scripts/paridad-reporte-tickets.test.mjs
// El script de paridad en modo --maqueta (sin red): la copia congelada del
// cálculo del modal, la comparación y las causas que explican cada diferencia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { correr, compararPeriodo, mesesCerrados, rangoModal } from './paridad-reporte-tickets.mjs';
import { resumenModalLegado } from './lib/calculo-modal-legado.mjs';

test('mesesCerrados: los N meses de calendario anteriores a hoy, el más reciente primero', () => {
  assert.deepEqual(mesesCerrados(3, '2026-10-03'), [
    { desde: '2026-09-01', hasta: '2026-09-30' },
    { desde: '2026-08-01', hasta: '2026-08-31' },
    { desde: '2026-07-01', hasta: '2026-07-31' },
  ]);
  assert.deepEqual(mesesCerrados(1, '2026-01-15'), [{ desde: '2025-12-01', hasta: '2025-12-31' }]);
});

test('rangoModal: el período como lo mandaba el modal (día local de Lima a UTC, 23:59:59.999)', () => {
  assert.deepEqual(rangoModal({ desde: '2026-08-01', hasta: '2026-08-31' }), {
    desde: '2026-08-01T05:00:00.000Z', hasta: '2026-09-01T04:59:59.999Z',
  });
});

test('resumenModalLegado reproduce la doble cuenta y la tasa de reapertura del modal', () => {
  const eventos = [
    { ticket_id: 'A', evento: 'estado_cambiado', detalle: 'De "en_progreso" a "resuelto"', created_at: '2026-08-12T15:00:00.000Z' },
    { ticket_id: 'A', evento: 'estado_cambiado', detalle: 'De "cerrado" a "reabierto"', created_at: '2026-08-20T15:00:00.000Z' },
    { ticket_id: 'A', evento: 'estado_cambiado', detalle: 'De "reabierto" a "resuelto"', created_at: '2026-09-03T14:00:00.000Z' },
    { ticket_id: 'R', evento: 'estado_cambiado', detalle: 'De "rechazado" a "reabierto"', created_at: '2026-08-06T17:00:00.000Z' },
  ];
  const tickets = [
    { id: 'A', created_at: '2026-08-10T15:00:00.000Z', estado: 'cerrado' },
    { id: 'R', created_at: '2026-08-05T15:00:00.000Z', estado: 'reabierto' },
  ];
  const ago = resumenModalLegado({ tickets, eventos, encuestas: [] }, rangoModal({ desde: '2026-08-01', hasta: '2026-08-31' }));
  const sep = resumenModalLegado({ tickets, eventos, encuestas: [] }, rangoModal({ desde: '2026-09-01', hasta: '2026-09-30' }));
  assert.equal(ago.totalResueltos, 1, 'A cuenta en agosto');
  assert.equal(sep.totalResueltos, 1, 'y OTRA vez en septiembre (doble cuenta)');
  assert.equal(ago.reaperturas, 2, 'cuenta la reapertura desde rechazado');
  assert.equal(ago.tasaReapertura, 200, 'la tasa podía superar el 100 %');
});

test('compararPeriodo explica cada diferencia con su causa', () => {
  const periodo = { desde: '2026-08-01', hasta: '2026-08-31' };
  const nuevo = {
    volumen: { creados: 2, resueltos: 0 },
    tickets: [{ codigo: 'TCK-0001', en_periodo: 'creado' }],
    atencion: { resolucion: { n: 0, mediana_horas: null, promedio_horas: null } },
    calidad: { reaperturas: { eventos: 1, tasa_pct: 50 }, csat: { n: 1, promedio: null, insuficiente: true } },
  };
  const legado = { totalCreados: 2, totalResueltos: 1, resueltosIds: ['A'], tiempoResolucion: { muestra: 1, mediana: 48, promedio: 48 }, reaperturas: 2, tasaReapertura: 200, muestraSatisfaccion: 1, promedioSatisfaccion: 5 };
  const hechos = { porId: new Map([['A', { codigo: 'TCK-0001', estado: 'cerrado', n_resoluciones: 2, dia_resuelto: '2026-09-03' }]]) };
  const diffs = compararPeriodo(periodo, nuevo, legado, hechos);
  const porMetrica = Object.fromEntries(diffs.map((d) => [d.metrica + (d.detalle ? ':' + d.detalle : ''), d.causa]));
  assert.equal(porMetrica['resuelto:TCK-0001'], 'doble_cuenta');
  assert.equal(porMetrica.reaperturas_eventos, 'rechazado');
  assert.equal(porMetrica.tasa_reapertura_pct, 'corte');
  assert.match(porMetrica.csat_promedio, /encuesta_fecha/);
  assert.equal(porMetrica.creados, undefined, 'sin diferencia no hay fila');
});

test('--maqueta corre sin red sobre los datos de la maqueta y toda diferencia trae una causa', async () => {
  const r = await correr({ maqueta: true, meses: 3 });
  assert.equal(r.periodos.length, 3);
  for (const p of r.periodos) {
    assert.ok(Number.isInteger(p.nuevo.resueltos), 'la RPC de la maqueta devolvió resueltos');
    for (const d of p.diferencias) assert.ok(d.causa && d.causa !== 'desconocida', `${d.metrica} sin causa`);
  }
});
