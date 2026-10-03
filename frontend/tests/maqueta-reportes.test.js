// Maqueta de Reportes (migración 115): la RPC simulada aplica las MISMAS
// definiciones que el SQL sobre un fixture pequeño con resultados conocidos
// (los mismos casos que tests/db/triggers.test.sql, bloques 115a-115f), y
// rechaza como el servidor (42501 / P0001). La paridad maqueta ↔ PGlite sobre
// el fixture completo la hace scripts/sql-local/verificar-migraciones.mjs (S17).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLAS, RPC } from '../src/maqueta/datos.js';
import { reporteTicketsDe, satisfaccionConsolidadaDe, hechosDeTickets, VERSION_DEFINICIONES } from '../src/maqueta/rpc-reportes.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/115_reportes.sql', import.meta.url)), 'utf8');
const rechazo = (fn) => { try { fn(); } catch (e) { return e; } return null; };

// Fixture mínimo (zona de Lima explícita en cada marca de tiempo).
const JEFE = 'j1', ASIS = 'a1', SINMOD = 's1';
function base() {
  return {
    staff: [
      { user_id: JEFE, nombre: 'Jefe', rol: 'JEFE', activo: true },
      { user_id: ASIS, nombre: 'Asistente', rol: 'ASISTENTE', activo: true },
      { user_id: SINMOD, nombre: 'Sin módulo', rol: 'ASISTENTE', activo: true },
    ],
    staff_modulos_permisos: [{ staff_user_id: ASIS, modulo: 'tickets' }],
    config_parametros: [{ clave: 'csat_muestra_minima', valor: 5 }, { clave: 'dias_corte_reapertura', valor: 30 }],
    categorias_ticket: [{ id: 'red', nombre: 'Red' }],
    subcategorias_ticket: [],
    empleados: [{ id: 'e1', nombres: 'Ana', apellidos: 'Prueba', area_obra_id: 'ao1', ubicacion_id: null }],
    areas_obras: [{ id: 'ao1', nombre: 'Obra Uno' }],
    ubicaciones: [],
    tickets: [], ticket_eventos: [], ticket_comentarios: [], ticket_satisfaccion: [],
  };
}
let n = 0;
function ticket(db, { estado, created, resuelto = null, prioridad = 'media', empleado = 'e1', asignado = null }) {
  const id = `t${++n}`;
  db.tickets.push({ id, codigo: `TCK-${String(n).padStart(4, '0')}`, titulo: `Ticket ${n}`, estado, prioridad, tipo: 'incidente', nivel_atencion: 'N1', categoria_id: 'red', subcategoria_id: null, empleado_id: empleado, vinculado: !!empleado, asignado_a: asignado, created_at: created, resuelto_at: resuelto });
  return id;
}
function evento(db, ticket_id, detalle, at, user_id = JEFE) {
  db.ticket_eventos.push({ id: `e${db.ticket_eventos.length + 1}`, ticket_id, evento: 'estado_cambiado', detalle, created_at: at, user_id });
}
const AHORA = new Date('2026-10-03T15:00:00-05:00');
const reporte = (db, desde, hasta, extra = {}) => reporteTicketsDe(db, { user: JEFE, desde, hasta, ahora: AHORA, ...extra });

describe('rpc-reportes: definiciones del SQL en la maqueta', () => {
  it('la versión de definiciones es la del SQL', () => {
    expect(SQL).toContain(`c_version   constant text := '${VERSION_DEFINICIONES}'`);
  });

  it('un ticket cuenta como resuelto en UN solo período (el de su resolución vigente); el rechazado va aparte', () => {
    const db = base();
    // A: resuelto en agosto, reabierto, vuelto a resolver en septiembre
    const a = ticket(db, { estado: 'cerrado', created: '2026-08-10T10:00:00-05:00', resuelto: '2026-09-03T09:00:00-05:00' });
    evento(db, a, 'De "en_progreso" a "resuelto"', '2026-08-12T10:00:00-05:00');
    evento(db, a, 'De "cerrado" a "reabierto"', '2026-08-20T10:00:00-05:00', null);
    evento(db, a, 'De "reabierto" a "resuelto"', '2026-09-03T09:00:00-05:00', ASIS);
    const r = ticket(db, { estado: 'rechazado', created: '2026-08-05T10:00:00-05:00' });
    evento(db, r, 'De "abierto" a "rechazado"', '2026-08-05T12:00:00-05:00');
    const b = ticket(db, { estado: 'cerrado', created: '2026-08-15T08:00:00-05:00', resuelto: '2026-08-15T12:00:00-05:00' });
    evento(db, b, 'De "en_progreso" a "resuelto"', '2026-08-15T12:00:00-05:00', ASIS);
    db.ticket_comentarios.push({ id: 'c1', ticket_id: b, interno: false, autor_id: ASIS, created_at: '2026-08-15T08:30:00-05:00', mensaje: 'Hola' });

    const ago = reporte(db, '2026-08-01', '2026-08-31');
    expect(ago.volumen).toMatchObject({ creados: 3, rechazados: 1, resueltos: 1, resueltos_mismo_periodo: 1, resueltos_arrastrados: 0 });
    expect(ago.atencion.resolucion).toEqual({ n: 1, mediana_horas: 4, promedio_horas: 4 });
    expect(ago.atencion.primera_respuesta).toEqual({ n: 1, mediana_horas: 0.5, promedio_horas: 0.5 });
    const sep = reporte(db, '2026-09-01', '2026-09-30');
    expect(sep.volumen).toMatchObject({ creados: 0, resueltos: 1, resueltos_arrastrados: 1 });
    expect(sep.anexos.arrastrados[0]).toMatchObject({ codigo: 'TCK-0001', tecnico_id: ASIS, dias_abierto: 23 });
    expect(sep.por_tecnico.find((t) => t.tecnico_id === ASIS)).toMatchObject({ resueltos: 1, arrastrados: 1 });
    expect(ago.por.area).toEqual([{ clave: 'ao1', nombre: 'Obra Uno', creados: 3, resueltos: 1 }]);
    expect(ago.tickets.find((t) => t.codigo === 'TCK-0002').en_periodo).toBe('creado');
    expect(Object.keys(ago.tickets[0])).not.toContain('dni');
  });

  it('una reapertura desde rechazado no cuenta; la tasa usa la primera resolución y el corte de 30 días', () => {
    const db = base();
    const x = ticket(db, { estado: 'reabierto', created: '2026-08-02T10:00:00-05:00' });
    evento(db, x, 'De "abierto" a "rechazado"', '2026-08-02T12:00:00-05:00');
    evento(db, x, 'De "rechazado" a "reabierto"', '2026-08-03T12:00:00-05:00');
    const y = ticket(db, { estado: 'reabierto', created: '2026-08-04T10:00:00-05:00' });
    evento(db, y, 'De "en_progreso" a "resuelto"', '2026-08-04T15:00:00-05:00');
    evento(db, y, 'De "cerrado" a "reabierto"', '2026-08-09T10:00:00-05:00', null);
    const z = ticket(db, { estado: 'reabierto', created: '2026-08-05T10:00:00-05:00' });
    evento(db, z, 'De "en_progreso" a "resuelto"', '2026-08-05T15:00:00-05:00');
    evento(db, z, 'De "cerrado" a "reabierto"', '2026-09-14T10:00:00-05:00', null);
    const hechos = Object.fromEntries(hechosDeTickets(db).map((h) => [h.ticket_id, h]));
    expect(hechos[x]).toMatchObject({ n_reaperturas: 0, reabierto_en_corte: false });
    expect(hechos[y]).toMatchObject({ n_reaperturas: 1, reabierto_en_corte: true, resuelto_vigente: false });
    expect(hechos[z]).toMatchObject({ n_reaperturas: 1, reabierto_en_corte: false });
    const ago = reporte(db, '2026-08-01', '2026-08-31');
    expect(ago.calidad.reaperturas).toMatchObject({ base: 2, reabiertos: 1, tasa_pct: 50, eventos: 1, corte_dias: 30 });
    expect(ago.volumen.resueltos).toBe(0);
    const sep = reporte(db, '2026-09-01', '2026-09-30');
    expect(sep.calidad.reaperturas).toMatchObject({ base: 0, tasa_pct: null, eventos: 1 });
  });

  it('CSAT: con n < mínimo el promedio es null e insuficiente; insatisfecho es nivel ≤ 2; el mínimo es un parámetro', () => {
    const db = base();
    const niveles = [5, 4, 4, 3];
    niveles.forEach((nivel, i) => {
      const t = ticket(db, { estado: 'cerrado', created: `2026-08-0${i + 1}T08:00:00-05:00`, resuelto: `2026-08-0${i + 1}T10:00:00-05:00` });
      evento(db, t, 'De "en_progreso" a "resuelto"', `2026-08-0${i + 1}T10:00:00-05:00`);
      db.ticket_satisfaccion.push({ id: `s${i}`, ticket_id: t, nivel, comentario: null, fecha_envio: `2026-08-0${i + 2}T10:00:00-05:00`, created_at: `2026-08-0${i + 1}T10:00:01-05:00` });
    });
    const sin = ticket(db, { estado: 'cerrado', created: '2026-08-10T08:00:00-05:00', resuelto: '2026-08-10T10:00:00-05:00', empleado: null });
    evento(db, sin, 'De "en_progreso" a "resuelto"', '2026-08-10T10:00:00-05:00');
    let r = reporte(db, '2026-08-01', '2026-08-31');
    expect(r.calidad.csat).toMatchObject({ n: 4, promedio: null, insuficiente: true, minimo: 5, generadas: 4, respondidas: 4, tasa_respuesta_pct: 100, insatisfechos: 0 });
    expect(r.calidad.csat.niveles['3']).toBe(1);
    expect(r.volumen.cerrados_sin_encuesta).toBe(1);
    expect(r.anexos.cerrados_sin_encuesta[0].motivo).toBe('sin_solicitante');
    const t5 = ticket(db, { estado: 'cerrado', created: '2026-08-05T08:00:00-05:00', resuelto: '2026-08-05T10:00:00-05:00' });
    evento(db, t5, 'De "en_progreso" a "resuelto"', '2026-08-05T10:00:00-05:00');
    db.ticket_satisfaccion.push({ id: 's5', ticket_id: t5, nivel: 2, comentario: 'Tardaron', fecha_envio: '2026-08-06T10:00:00-05:00', created_at: '2026-08-05T10:00:01-05:00' });
    r = reporte(db, '2026-08-01', '2026-08-31');
    expect(r.calidad.csat).toMatchObject({ n: 5, promedio: 3.6, insuficiente: false, insatisfechos: 1 });
    expect(r.calidad.comentarios_bajos).toEqual([{ codigo: db.tickets.find((t) => t.id === t5).codigo, nivel: 2, comentario: 'Tardaron', fecha: '2026-08-06T10:00:00-05:00' }]);
    db.config_parametros.find((p) => p.clave === 'csat_muestra_minima').valor = 6;
    r = reporte(db, '2026-08-01', '2026-08-31');
    expect(r.calidad.csat.promedio).toBeNull();
    expect(r.parametros.csat_muestra_minima).toBe(6);
    const sat = satisfaccionConsolidadaDe(db, { user: JEFE });
    expect(sat.muestraMinima).toBe(6);
    expect(sat.resumen).toMatchObject({ muestra: 5, promedio: null, insuficiente: true, insatisfechos: 1 });
  });

  it('el período en curso no compara ni reconstruye el backlog; un mes completo compara con el mes anterior', () => {
    const db = base();
    const curso = reporte(db, '2026-10-01', '2026-10-31');
    expect(curso.periodo_completo).toBe(false);
    expect(curso.periodo.en_curso).toBe(true);
    expect(curso.comparacion).toBeNull();
    expect(curso.volumen.backlog.referencia).toBe('ahora');
    const mes = reporte(db, '2026-08-01', '2026-08-31');
    expect(mes.comparacion.periodo).toEqual({ desde: '2026-07-01', hasta: '2026-07-31' });
    expect(mes.volumen.backlog.referencia).toBe('cierre');
    expect(reporte(db, '2026-08-08', '2026-08-14').comparacion.periodo).toEqual({ desde: '2026-08-01', hasta: '2026-08-07' });
    expect(reporte(db, '2026-08-01', '2026-08-31', { tecnico: JEFE }).comparacion).toBeNull();
    expect(rechazo(() => reporte(db, '2026-08-31', '2026-08-01')).code).toBe('P0001');
    expect(rechazo(() => reporte(db, '2025-01-01', '2026-08-01')).code).toBe('P0001');
  });

  it('backlog al cierre reconstruido por eventos', () => {
    const db = base();
    const v = ticket(db, { estado: 'cerrado', created: '2026-08-20T08:00:00-05:00', resuelto: '2026-09-05T08:00:00-05:00' });
    evento(db, v, 'De "abierto" a "en_progreso"', '2026-08-20T09:00:00-05:00');
    evento(db, v, 'De "en_progreso" a "resuelto"', '2026-09-05T08:00:00-05:00');
    const r = ticket(db, { estado: 'rechazado', created: '2026-08-02T08:00:00-05:00' });
    evento(db, r, 'De "abierto" a "rechazado"', '2026-08-02T09:00:00-05:00');
    ticket(db, { estado: 'abierto', created: '2026-09-02T08:00:00-05:00' });
    const ago = reporte(db, '2026-08-01', '2026-08-31');
    expect(ago.volumen.backlog).toMatchObject({ referencia: 'cierre', total: 1, dias_mas_antiguo: 11 });
    expect(ago.volumen.backlog.tramos.find((t) => t.clave === 'de_8_a_30').cantidad).toBe(1);
  });

  it('autorización: sin módulo 42501; un asistente no recibe "por técnico" ni el alcance de otro; el jefe sí', () => {
    const db = base();
    expect(rechazo(() => reporteTicketsDe(db, { user: null, desde: '2026-08-01', hasta: '2026-08-31', ahora: AHORA })).code).toBe('42501');
    expect(rechazo(() => reporteTicketsDe(db, { user: SINMOD, desde: '2026-08-01', hasta: '2026-08-31', ahora: AHORA })).code).toBe('42501');
    expect(rechazo(() => reporteTicketsDe(db, { user: ASIS, desde: '2026-08-01', hasta: '2026-08-31', tecnico: JEFE, ahora: AHORA })).code).toBe('42501');
    expect(reporteTicketsDe(db, { user: ASIS, desde: '2026-08-01', hasta: '2026-08-31', ahora: AHORA }).por_tecnico).toBeNull();
    expect(reporteTicketsDe(db, { user: ASIS, desde: '2026-08-01', hasta: '2026-08-31', tecnico: ASIS, ahora: AHORA }).alcance).toMatchObject({ tipo: 'tecnico', tecnico_id: ASIS });
    expect(Array.isArray(reporte(db, '2026-08-01', '2026-08-31').por_tecnico)).toBe(true);
    expect(rechazo(() => satisfaccionConsolidadaDe(db, { user: SINMOD })).code).toBe('42501');
  });
});

describe('la maqueta completa', () => {
  it('expone las dos RPC y el reporte del mes pasado publica un CSAT con muestra suficiente', () => {
    const db = JSON.parse(JSON.stringify(TABLAS));
    const hoy = new Date();
    const mp = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() - 1, 1));
    const desde = mp.toISOString().slice(0, 10);
    const hasta = new Date(Date.UTC(mp.getUTCFullYear(), mp.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const r = RPC.reporte_tickets(db, { p_desde: desde, p_hasta: hasta, p_tecnico: null });
    expect(r.periodo_completo).toBe(true);
    expect(r.calidad.csat.n).toBeGreaterThanOrEqual(5);
    expect(r.calidad.csat.promedio).not.toBeNull();
    expect(r.calidad.reaperturas.reabiertos).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(r.por_tecnico)).toBe(true);
    const s = RPC.reporte_satisfaccion_consolidado(db);
    expect(s.muestraMinima).toBe(5);
    expect(s.porMes.length).toBeGreaterThanOrEqual(1);
    expect(TABLAS.config_parametros.find((p) => p.clave === 'csat_muestra_minima').valor).toBe(5);
  });
});
