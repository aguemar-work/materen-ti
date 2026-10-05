// RPC simulada de la maqueta para el catálogo de tickets v2 (migración 116):
// `reclasificar_ticket` y la vista `v_tickets_por_reclasificar`. Misma regla y
// mismos rechazos que el SQL (42501 sin JEFE, P0001 motivo vacío o largo, P0002
// ticket o subcategoría inexistentes), con el MISMO texto en español:
// tests/maqueta-catalogo-tickets.test.js lo compara con la migración.
// Todo es inventado: nada sale de esta sesión (recargar devuelve los datos iniciales).

// Quién actúa: el JEFE ficticio, o Diego Huamán (ASISTENTE) con ?maqueta=asistente.
// datos.js lo fija al importar (este archivo no puede importar datos.js).
let actor = { id: 'u-jefe', esJefe: true, email: 'jefe@materen.pe' };
export function definirActorCatalogoTickets(nuevo) {
  actor = { ...actor, ...nuevo };
}

export const MENSAJES_RECLASIFICAR = {
  sinPermiso: 'No autorizado',
  sinMotivo: 'Indique el motivo de la reclasificación.',
  motivoLargo: 'El motivo no puede superar los 500 caracteres.',
  sinTicket: 'El ticket no existe.',
  sinSubcategoria: 'La subcategoría no existe o fue eliminada.',
};
const MOTIVO_MAX = 500;

function rechazar(code, message) {
  throw Object.assign(new Error(message), { code });
}

// texto_multilinea (107): recorta los extremos, conserva los saltos; vacío = null.
const multilinea = (v) => String(v ?? '').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '') || null;

let secuencia = 0;

/**
 * v_tickets_por_reclasificar: tickets creados antes de la marca
 * (config_parametros.catalogo_tickets_v2) sin subcategoría, en «Otro (no
 * clasificado)» o en «Virus o malware sospechoso», que ningún JEFE reclasificó
 * o confirmó después. Solo para el JEFE (la vista real exige rol:jefe).
 */
export function calcularPorReclasificar(db) {
  if (!actor.esJefe) return [];
  const marca = (db.config_parametros || []).find((p) => p.clave === 'catalogo_tickets_v2')?.valor;
  if (!marca) return [];
  const desde = Date.parse(marca.aplicada_at);
  const revisados = new Set((db.ticket_eventos || [])
    .filter((e) => e.evento === 'categoria_cambiada' && e.user_id && Date.parse(e.created_at) >= desde)
    .map((e) => e.ticket_id));
  const nombre = (tabla, id) => (db[tabla] || []).find((x) => x.id === id)?.nombre ?? null;
  return (db.tickets || [])
    .filter((t) => Date.parse(t.created_at) < desde && !revisados.has(t.id)
      && (!t.subcategoria_id || t.subcategoria_id === marca.subcategoria_no_clasificado || t.subcategoria_id === marca.subcategoria_seguridad_legado))
    .map((t) => ({
      ticket_id: t.id, codigo: t.codigo, titulo: t.titulo, descripcion: (t.descripcion || '').slice(0, 300) || null,
      estado: t.estado, prioridad: t.prioridad, tipo: t.tipo ?? null, created_at: t.created_at,
      categoria_id: t.categoria_id ?? null, categoria: nombre('categorias_ticket', t.categoria_id),
      subcategoria_id: t.subcategoria_id ?? null, subcategoria: nombre('subcategorias_ticket', t.subcategoria_id),
      motivo: !t.subcategoria_id ? 'sin_subcategoria' : t.subcategoria_id === marca.subcategoria_no_clasificado ? 'no_clasificado' : 'seguridad_legado',
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export const RPC_CATALOGO_TICKETS = {
  reclasificar_ticket: (db, args = {}) => {
    if (!actor.esJefe) rechazar('42501', MENSAJES_RECLASIFICAR.sinPermiso);
    const motivo = multilinea(args.p_motivo);
    if (!motivo) rechazar('P0001', MENSAJES_RECLASIFICAR.sinMotivo);
    if (motivo.length > MOTIVO_MAX) rechazar('P0001', MENSAJES_RECLASIFICAR.motivoLargo);
    const t = db.tickets.find((x) => x.id === args.p_ticket_id);
    if (!t) rechazar('P0002', MENSAJES_RECLASIFICAR.sinTicket);
    const sub = db.subcategorias_ticket.find((x) => x.id === args.p_subcategoria_id && !x.deleted_at);
    const cat = sub && db.categorias_ticket.find((x) => x.id === sub.categoria_id && !x.deleted_at);
    if (!sub || !cat) rechazar('P0002', MENSAJES_RECLASIFICAR.sinSubcategoria);

    const catAnt = db.categorias_ticket.find((x) => x.id === t.categoria_id)?.nombre;
    const subAnt = db.subcategorias_ticket.find((x) => x.id === t.subcategoria_id)?.nombre;
    const cambio = t.categoria_id !== cat.id || t.subcategoria_id !== sub.id;
    const ahora = new Date().toISOString();
    let detalle;
    if (cambio) {
      detalle = `De "${catAnt || 'Sin categoría'}${subAnt ? ` › ${subAnt}` : ' › sin subcategoría'}" a "${cat.nombre} › ${sub.nombre}". Motivo: ${motivo}`;
      // Solo categoría y subcategoría: tipo, prioridad y estado no se tocan.
      t.categoria_id = cat.id;
      t.subcategoria_id = sub.id;
      t.updated_at = ahora;
    } else {
      detalle = `Clasificación confirmada: "${cat.nombre} › ${sub.nombre}". Motivo: ${motivo}`;
    }
    db.ticket_eventos.push({
      id: `maq-rcl-${Date.now().toString(36)}-${(secuencia += 1)}`, ticket_id: t.id, evento: 'categoria_cambiada',
      detalle, user_id: actor.id, user_email: actor.email, created_at: ahora,
    });
    db.v_tickets_por_reclasificar = calcularPorReclasificar(db);
    return { ticket_id: t.id, codigo: t.codigo, categoria_id: cat.id, subcategoria_id: sub.id, cambio };
  },
};
