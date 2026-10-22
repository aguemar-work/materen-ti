// Maqueta del cierre de tickets según el procedimiento (migración 120): la RPC
// simulada sigue el mismo ciclo que el SQL (resolver con la solución visible →
// encuesta de esa resolución → calificar cierra como 'usuario'; sin solicitante
// se cierra al resolver; una calificación de 1 o 2 se revisa una sola vez) y
// rechaza con el MISMO texto que la migración.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLAS, RPC } from '../src/maqueta/datos.js';
import { MENSAJES_CIERRE, definirActorCierreTickets, responderEncuesta, estadoEncuesta } from '../src/maqueta/rpc-cierre-tickets.js';
import { plazoRevisionCalificacion } from '../src/core/dominio-tickets.js';
import { diaHabilSiguiente } from '../src/maqueta/rpc-reportes.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/120_cierre_tickets_procedimiento.sql', import.meta.url)), 'utf8');
const JEFE = { id: 'u-jefe', esJefe: true, moduloTickets: true, email: 'jefe@materen.pe' };
const ASISTENTE = { id: 'u-asis-1', esJefe: false, moduloTickets: true, email: 'dhuaman@materen.pe' };
const clonar = (v) => JSON.parse(JSON.stringify(v));

function rechazo(fn) {
  try { fn(); } catch (e) { return { code: e.code, message: e.message }; }
  return null;
}

afterEach(() => definirActorCierreTickets(JEFE));

describe('rpc-cierre-tickets: mismos mensajes que la migración 120', () => {
  it('cada rechazo de negocio está, letra por letra, en el SQL', () => {
    for (const clave of ['sinSolucion', 'sinMotivo', 'sinDesenlace', 'sinNota', 'noBaja', 'yaRevisada', 'noReabrible']) {
      expect(SQL, clave).toContain(MENSAJES_CIERRE[clave]);
    }
    expect(SQL).toContain('Solo se resuelve un ticket en progreso o reabierto (estado actual: %).');
  });
});

describe('rpc-cierre-tickets: el ciclo del procedimiento', () => {
  it('resolver exige la solución, la deja visible y abre la encuesta; calificar cierra como usuario', () => {
    const db = clonar(TABLAS);
    definirActorCierreTickets(ASISTENTE);
    expect(rechazo(() => RPC.resolver_ticket(db, { p_ticket_id: 't114', p_nota: '  ' }))).toEqual({ code: 'P0001', message: MENSAJES_CIERRE.sinSolucion });
    const t = RPC.resolver_ticket(db, { p_ticket_id: 't114', p_nota: 'Se reemplazó el router 4G' });
    expect(t.estado).toBe('resuelto');
    expect(db.ticket_comentarios.some((c) => c.ticket_id === 't114' && !c.interno && c.mensaje === 'Solución aplicada: Se reemplazó el router 4G')).toBe(true);
    expect(estadoEncuesta(db, 'tok-maqueta-114')).toEqual({ ok: true, respondida: false });

    expect(responderEncuesta(db, { token: 'tok-maqueta-114', nivel: 2, comentario: 'Volvió a fallar' })).toMatchObject({ ok: true, cerrado: true });
    const cerrado = db.tickets.find((x) => x.id === 't114');
    expect(cerrado).toMatchObject({ estado: 'cerrado', cerrado_por: 'usuario' });
    expect(responderEncuesta(db, { token: 'tok-maqueta-114', nivel: 5 })).toEqual({ ok: false, code: 'ya_respondida' });

    // Revisión: el asistente reabre sin ser JEFE, una sola vez.
    const enc = db.ticket_satisfaccion.find((s) => s.ticket_id === 't114');
    expect(rechazo(() => RPC.reabrir_ticket(db, { p_ticket_id: 't114', p_motivo: 'x' }))).toMatchObject({ code: '42501' });
    expect(RPC.revisar_calificacion_baja(db, { p_encuesta_id: enc.id, p_desenlace: 'reabierto', p_nota: 'Se cambia la antena' }))
      .toEqual({ ok: true, desenlace: 'reabierto', estado: 'reabierto' });
    expect(rechazo(() => RPC.revisar_calificacion_baja(db, { p_encuesta_id: enc.id, p_desenlace: 'nota', p_nota: 'otra' })))
      .toEqual({ code: 'P0001', message: MENSAJES_CIERRE.yaRevisada });
  });

  it('sin solicitante, resolver cierra en el acto; el jefe reabre un resuelto y anula su encuesta', () => {
    const db = clonar(TABLAS);
    db.tickets.find((x) => x.id === 't113').empleado_id = null;
    expect(RPC.resolver_ticket(db, { p_ticket_id: 't113', p_nota: 'Licencia instalada' })).toMatchObject({ estado: 'cerrado', cerrado_por: 'sin_solicitante' });

    RPC.resolver_ticket(db, { p_ticket_id: 't112', p_nota: 'Se cambió la pasta térmica' });
    RPC.reabrir_ticket(db, { p_ticket_id: 't112', p_motivo: 'Se resolvió el ticket equivocado' });
    expect(estadoEncuesta(db, 'tok-maqueta-112')).toEqual({ ok: false, code: 'no_vigente' });
  });
});

describe('plazo de revisión: día hábil siguiente (lunes a viernes)', () => {
  it('la ficha y la maqueta de reportes calculan lo mismo que public.dia_habil_siguiente', () => {
    // 2026-10-23 es viernes; las respuestas son a las 15:00 de Lima.
    for (const [dia, esperado] of [['2026-10-23', '2026-10-26'], ['2026-10-24', '2026-10-26'], ['2026-10-25', '2026-10-26'], ['2026-10-26', '2026-10-27']]) {
      expect(plazoRevisionCalificacion(`${dia}T15:00:00-05:00`)).toBe(esperado);
      expect(diaHabilSiguiente(dia)).toBe(esperado);
    }
  });
});
