// RPC simuladas de la maqueta para la KEDB (migración 106): publicar el
// workaround de un problema, crear un artículo desde un ticket y registrar el
// uso de un artículo. Cada función recibe la base en memoria y los argumentos
// NOMBRADOS (`p_...`), muta la base y devuelve la fila, igual que la RPC real.
// Los rechazos de negocio se lanzan con el mismo SQLSTATE y el MISMO texto en
// español que `publicar_workaround_problema_nucleo` y compañía (P0001 regla de
// negocio, P0002 no existe), así la UI puede probarse con sus mensajes reales.
//
// `v_kpi_kb` se recalcula con cada escritura (`calcularKpiKb`), como si fuera
// la vista. Todo es inventado: nada sale de esta sesión.

function rechazar(code, message) {
  throw Object.assign(new Error(message), { code });
}

let secuencia = 0;
const idNuevo = () => `maq-kb-${Date.now().toString(36)}-${(secuencia += 1)}`;
const ahora = () => new Date().toISOString();

// Quién actúa: el JEFE ficticio, o Diego Huamán (ASISTENTE) con ?maqueta=asistente.
// datos.js lo fija al importar (este archivo no puede importar datos.js).
let actor = { id: 'u-jefe', esJefe: true };
export function definirActorKb(nuevo) {
  actor = { ...actor, ...nuevo };
}

const DIA_MS = 86400000;

// Texto de varias líneas: se recortan los extremos, no se colapsan los saltos.
const conTexto = (v) => String(v ?? '').trim();
const limpio = (v) => String(v ?? '').replace(/\s+/g, ' ').trim() || null;

/** Lo que devuelve la vista v_kpi_kb: una fila por artículo vivo. */
export function calcularKpiKb(articulos, usos) {
  const desde = Date.now() - 90 * DIA_MS;
  return articulos.filter((a) => !a.deleted_at).map((a) => {
    const propios = usos.filter((u) => u.kb_articulo_id === a.id);
    const recientes = propios.filter((u) => new Date(u.created_at).getTime() >= desde);
    const ultimo = propios.map((u) => u.created_at).sort().at(-1) || null;
    return {
      kb_articulo_id: a.id, titulo: a.titulo, tipo: a.tipo || 'solucion', estado: a.estado,
      categoria_id: a.categoria_id || null, util_si: a.util_si || 0, util_no: a.util_no || 0,
      usos_90d: recientes.length, usos_total: propios.length, ultimo_uso_at: ultimo,
    };
  });
}

function recalcular(db) {
  db.v_kpi_kb.length = 0;
  db.v_kpi_kb.push(...calcularKpiKb(db.kb_articulos, db.ticket_kb_usos));
}

function articuloDelProblema(db, problemaId) {
  return db.kb_articulos.find((a) => a.problema_id === problemaId && a.tipo === 'workaround' && !a.deleted_at) || null;
}

function publicarWorkaround(db, args = {}) {
  const prob = db.problemas.find((p) => p.id === args.p_problema_id && !p.deleted_at);
  if (!prob) rechazar('P0002', 'El problema no existe.');
  const texto = conTexto(args.p_workaround) || conTexto(prob.workaround);
  if (!texto) rechazar('P0001', 'Escriba el workaround antes de publicarlo en la base de conocimiento.');
  if (texto.length > 5000) rechazar('P0001', 'El workaround no puede superar los 5000 caracteres.');
  const titulo = limpio(args.p_titulo);
  const sintoma = limpio(args.p_sintoma);
  if (titulo && titulo.length > 200) rechazar('P0001', 'El título no puede superar los 200 caracteres.');
  if (sintoma && sintoma.length > 1000) rechazar('P0001', 'El síntoma no puede superar los 1000 caracteres.');

  // Categoría: la del ticket disparador (la maqueta no cuenta la más frecuente).
  const disparador = db.tickets.find((t) => t.id === prob.ticket_disparador_id);
  let art = articuloDelProblema(db, prob.id);
  if (art) {
    // Publicar es del jefe; un no-jefe que no cambia nada no despublica.
    const cambia = art.solucion !== texto || !!titulo || !!sintoma;
    art.estado = actor.esJefe ? 'publicado' : (cambia ? 'en_revision' : art.estado);
    art.solucion = texto;
    art.titulo = titulo || art.titulo;
    art.sintoma = sintoma || art.sintoma;
    art.categoria_id = art.categoria_id || disparador?.categoria_id || null;
    art.updated_at = ahora();
  } else {
    art = {
      id: idNuevo(), titulo: titulo || `Workaround: ${prob.titulo}`.slice(0, 200),
      categoria_id: disparador?.categoria_id || null,
      sintoma: sintoma || String(prob.descripcion || '').trim().slice(0, 1000),
      solucion: texto, ticket_origen_id: prob.ticket_disparador_id || null,
      estado: actor.esJefe ? 'publicado' : 'en_revision', tipo: 'workaround', problema_id: prob.id,
      util_si: 0, util_no: 0, created_by: actor.id, created_at: ahora(), updated_at: ahora(), deleted_at: null,
    };
    db.kb_articulos.push(art);
  }
  Object.assign(prob, { workaround: texto, error_conocido: true, kb_articulo_id: art.id, updated_at: ahora() });
  recalcular(db);
  return art;
}

function crearDesdeTicket(db, args = {}) {
  const t = db.tickets.find((x) => x.id === args.p_ticket_id);
  if (!t) rechazar('P0002', 'El ticket no existe.');
  if (!['resuelto', 'cerrado'].includes(t.estado)) {
    rechazar('P0001', 'Solo se puede crear un artículo desde un ticket resuelto o cerrado.');
  }
  const solucion = conTexto(args.p_solucion) || conTexto(t.nota_resolucion);
  if (!solucion) rechazar('P0001', 'El ticket no tiene nota de resolución. Escriba la solución para crear el artículo.');
  const titulo = limpio(args.p_titulo);
  const sintoma = limpio(args.p_sintoma);
  if (titulo && titulo.length > 200) rechazar('P0001', 'El título no puede superar los 200 caracteres.');
  if (sintoma && sintoma.length > 1000) rechazar('P0001', 'El síntoma no puede superar los 1000 caracteres.');
  if (db.kb_articulos.some((a) => a.ticket_origen_id === t.id && (a.tipo || 'solucion') === 'solucion' && !a.deleted_at)) {
    rechazar('P0001', 'Este ticket ya tiene un artículo en la base de conocimiento. Complételo desde allí.');
  }
  const art = {
    id: idNuevo(), titulo: titulo || t.titulo, categoria_id: t.categoria_id || null,
    sintoma: sintoma || String(t.descripcion || '').trim().slice(0, 1000), solucion,
    ticket_origen_id: t.id, estado: 'borrador', tipo: 'solucion', problema_id: null,
    util_si: 0, util_no: 0, created_by: actor.id, created_at: ahora(), updated_at: ahora(), deleted_at: null,
  };
  db.kb_articulos.push(art);
  recalcular(db);
  return art;
}

function registrarUso(db, args = {}) {
  if (!db.tickets.some((t) => t.id === args.p_ticket_id)) rechazar('P0002', 'El ticket no existe.');
  const art = db.kb_articulos.find((a) => a.id === args.p_kb_articulo_id && !a.deleted_at);
  if (!art) rechazar('P0002', 'El artículo no existe.');
  if (art.estado !== 'publicado') rechazar('P0001', 'Solo se registra el uso de artículos publicados.');
  let uso = db.ticket_kb_usos.find((u) => u.ticket_id === args.p_ticket_id && u.kb_articulo_id === art.id);
  if (!uso) {
    uso = { ticket_id: args.p_ticket_id, kb_articulo_id: art.id, usado_por: actor.id, created_at: ahora() };
    db.ticket_kb_usos.push(uso);
    recalcular(db);
  }
  return uso;
}

export const RPC_KB = {
  publicar_workaround_problema: publicarWorkaround,
  crear_kb_desde_ticket: crearDesdeTicket,
  registrar_uso_kb_ticket: registrarUso,
};
