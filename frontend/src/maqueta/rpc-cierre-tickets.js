// RPC simulada de la maqueta para el cierre de tickets según el procedimiento
// (migración 120): `resolver_ticket`, `reabrir_ticket` y
// `revisar_calificacion_baja`, y la calificación pública (`responderEncuesta`)
// que usa rpc-tickets.js. Misma regla y mismos rechazos que el SQL (42501 sin
// el módulo o sin ser JEFE, P0001 con el mismo texto en español): la solución
// es obligatoria y queda como comentario visible; resolver abre la encuesta de
// esa resolución; calificar cierra (cerrado_por 'usuario'); sin solicitante se
// cierra al resolver; una calificación de 1 o 2 se revisa una sola vez.
// Todo es inventado: nada sale de esta sesión (recargar devuelve los datos iniciales).

// Quién actúa: el JEFE ficticio, o Diego Huamán (ASISTENTE, con el módulo
// tickets) con ?maqueta=asistente. datos.js lo fija al importar.
let actor = { id: 'u-jefe', esJefe: true, moduloTickets: true, email: 'jefe@materen.pe' };
export function definirActorCierreTickets(nuevo) {
  actor = { ...actor, ...nuevo };
}

export const MENSAJES_CIERRE = {
  sinPermiso: 'No autorizado',
  sinSolucion: 'Escriba la solución aplicada: el solicitante la verá en su seguimiento.',
  noResoluble: (estado) => `Solo se resuelve un ticket en progreso o reabierto (estado actual: ${estado}).`,
  sinMotivo: 'Para reabrir el ticket escriba el motivo.',
  sinDesenlace: 'Elija si se reabre el ticket o se deja una nota.',
  sinNota: 'Escriba qué se revisó con el solicitante.',
  noBaja: 'Solo se revisa una calificación de 1 o 2.',
  yaRevisada: 'Esta calificación ya fue revisada.',
  noReabrible: 'El ticket ya no está cerrado con esta calificación: revísela con una nota.',
};

function rechazar(code, message) {
  throw Object.assign(new Error(message), { code });
}
const ahora = () => new Date().toISOString();
let secuencia = 0;
const nuevoId = (prefijo) => `${prefijo}-maq-${++secuencia}`;

function ticketDe(db, id) {
  const t = (db.tickets || []).find((x) => x.id === id);
  if (!t) rechazar('P0001', 'Ticket no encontrado.');
  return t;
}
function evento(db, ticketId, evento, detalle, conActor = true) {
  db.ticket_eventos.push({
    id: nuevoId('te'), ticket_id: ticketId, evento, detalle,
    user_id: conActor ? actor.id : null, user_email: conActor ? actor.email : null, created_at: ahora(),
  });
}
const vigente = (db, ticketId) => (db.ticket_satisfaccion || [])
  .filter((s) => s.ticket_id === ticketId)
  .sort((a, b) => (b.resolucion_numero ?? 1) - (a.resolucion_numero ?? 1))[0] || null;

function cerrar(db, t, por) {
  evento(db, t.id, 'estado_cambiado', `De "${t.estado}" a "cerrado"`, por !== 'usuario');
  Object.assign(t, { estado: 'cerrado', cerrado_por: por, cerrado_at: ahora(), updated_at: ahora() });
}

export const RPC_CIERRE_TICKETS = {
  resolver_ticket: (db, args = {}) => {
    if (!actor.esJefe && !actor.moduloTickets) rechazar('42501', MENSAJES_CIERRE.sinPermiso);
    const t = ticketDe(db, args.p_ticket_id);
    if (!['en_progreso', 'reabierto'].includes(t.estado)) rechazar('P0001', MENSAJES_CIERRE.noResoluble(t.estado));
    const nota = String(args.p_nota ?? '').trim();
    if (!nota) rechazar('P0001', MENSAJES_CIERRE.sinSolucion);
    evento(db, t.id, 'estado_cambiado', `De "${t.estado}" a "resuelto"`);
    Object.assign(t, { estado: 'resuelto', nota_resolucion: nota, resuelto_at: ahora(), updated_at: ahora(), cerrado_por: null, cerrado_at: null });
    db.ticket_comentarios.push({ id: nuevoId('tc'), ticket_id: t.id, mensaje: `Solución aplicada: ${nota}`, interno: false, autor_id: actor.id, created_at: ahora() });
    if (t.empleado_id) {
      for (const s of db.ticket_satisfaccion.filter((x) => x.ticket_id === t.id && !x.fecha_envio && !x.anulada_at)) s.anulada_at = ahora();
      const numero = Math.max(0, ...db.ticket_satisfaccion.filter((x) => x.ticket_id === t.id).map((x) => x.resolucion_numero ?? 1)) + 1;
      db.ticket_satisfaccion.push({ id: nuevoId('ts'), ticket_id: t.id, resolucion_numero: numero, resuelto_at: t.resuelto_at, nivel: null, comentario: null, fecha_envio: null, created_at: ahora() });
    } else {
      cerrar(db, t, 'sin_solicitante');
    }
    return { ...t };
  },

  reabrir_ticket: (db, args = {}) => {
    if (!actor.esJefe) rechazar('42501', MENSAJES_CIERRE.sinPermiso);
    const motivo = String(args.p_motivo ?? '').trim();
    if (!motivo) rechazar('P0001', MENSAJES_CIERRE.sinMotivo);
    const t = ticketDe(db, args.p_ticket_id);
    if (!['resuelto', 'cerrado', 'rechazado'].includes(t.estado)) rechazar('P0001', `Transición de "${t.estado}" a "reabierto" no permitida.`);
    evento(db, t.id, 'estado_cambiado', `De "${t.estado}" a "reabierto"`);
    Object.assign(t, { estado: 'reabierto', motivo_reapertura: motivo, nota_resolucion: null, resuelto_at: null, cerrado_por: null, cerrado_at: null, updated_at: ahora() });
    for (const s of db.ticket_satisfaccion.filter((x) => x.ticket_id === t.id && !x.fecha_envio && !x.anulada_at)) s.anulada_at = ahora();
    db.ticket_comentarios.push({ id: nuevoId('tc'), ticket_id: t.id, mensaje: `Reabierto: ${motivo}`, interno: true, autor_id: actor.id, created_at: ahora() });
    return { ...t };
  },

  revisar_calificacion_baja: (db, args = {}) => {
    if (!actor.esJefe && !actor.moduloTickets) rechazar('42501', MENSAJES_CIERRE.sinPermiso);
    const desenlace = args.p_desenlace;
    if (!['reabierto', 'nota'].includes(desenlace)) rechazar('P0001', MENSAJES_CIERRE.sinDesenlace);
    const nota = String(args.p_nota ?? '').trim();
    if (!nota) rechazar('P0001', MENSAJES_CIERRE.sinNota);
    const s = (db.ticket_satisfaccion || []).find((x) => x.id === args.p_encuesta_id);
    if (!s) rechazar('P0001', 'Encuesta no encontrada.');
    if (!s.fecha_envio || s.nivel > 2) rechazar('P0001', MENSAJES_CIERRE.noBaja);
    if (s.revision_desenlace) rechazar('P0001', MENSAJES_CIERRE.yaRevisada);
    const t = ticketDe(db, s.ticket_id);
    if (desenlace === 'reabierto') {
      if (t.estado !== 'cerrado' || vigente(db, t.id)?.id !== s.id) rechazar('P0001', MENSAJES_CIERRE.noReabrible);
      evento(db, t.id, 'estado_cambiado', `De "cerrado" a "reabierto"`);
      Object.assign(t, { estado: 'reabierto', motivo_reapertura: `Calificación ${s.nivel}/5: ${nota}`, nota_resolucion: null, resuelto_at: null, cerrado_por: null, cerrado_at: null, updated_at: ahora() });
    }
    Object.assign(s, { revision_desenlace: desenlace, revision_nota: nota, revisado_por: actor.id, revisado_at: ahora() });
    evento(db, t.id, 'calificacion_revisada', `Calificación ${s.nivel}/5 · ${desenlace === 'reabierto' ? 'Reabierto' : 'Nota'}: ${nota}`);
    return { ok: true, desenlace, estado: t.estado };
  },
};

// Calificación pública por el token (edge function `tickets`, acción `encuesta`):
// guarda la respuesta y cierra el ticket resuelto (cerrado_por 'usuario').
export function responderEncuesta(db, { token, nivel, comentario }) {
  if (!Number.isInteger(Number(nivel)) || nivel < 1 || nivel > 5) return { ok: false, code: 'datos_invalidos' };
  const t = (db.tickets || []).find((x) => x.token === token);
  if (!t) return { ok: false, code: 'no_existe' };
  const s = vigente(db, t.id);
  if (!s) return { ok: false, code: 'no_disponible' };
  if (s.fecha_envio) return { ok: false, code: 'ya_respondida' };
  if (s.anulada_at || !['resuelto', 'cerrado'].includes(t.estado)) return { ok: false, code: 'no_vigente' };
  Object.assign(s, { nivel: Number(nivel), comentario: String(comentario ?? '').trim() || null, fecha_envio: ahora() });
  evento(db, t.id, 'encuesta_respondida', `Nivel ${nivel}`, false);
  const cerro = t.estado === 'resuelto';
  if (cerro) cerrar(db, t, 'usuario');
  return { ok: true, codigo: t.codigo, cerrado: cerro };
}

export function estadoEncuesta(db, token) {
  const t = (db.tickets || []).find((x) => x.token === token);
  if (!t) return { ok: false, code: 'no_existe' };
  const s = vigente(db, t.id);
  if (!s) return { ok: false, code: 'no_disponible' };
  if (!s.fecha_envio && s.anulada_at) return { ok: false, code: 'no_vigente' };
  return { ok: true, respondida: !!s.fecha_envio };
}
