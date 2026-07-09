// Dominio tickets (staff): catálogo de categorías, bandeja, detalle,
// comentarios, eventos, encuesta y actualizaciones vía RLS directo.
import { getClient } from '../client.js';
import { sanitizarTermino } from '../sanitizar.js';
import { trimText } from '../../core/formatters.js';

// ── Tickets (staff) ──────────────────────────────────────────────────────────
// La creación pública, el seguimiento y la encuesta viven en
// api/ticketsPublicos.js (edge function). Aquí solo lo que opera el staff
// vía RLS directo: catálogo, bandeja, detalle, comentarios, cambios de estado.

export const ticketsApi = {
  async listCategoriasTicket() {
    const { data, error } = await getClient().database
      .from('categorias_ticket')
      .select('id, nombre')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async listSubcategoriasTicket(categoriaId = null) {
    let query = getClient().database
      .from('subcategorias_ticket')
      .select('id, categoria_id, nombre')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (categoriaId) query = query.eq('categoria_id', categoriaId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async createCategoriaTicket(datos) {
    const { data, error } = await getClient().database
      .from('categorias_ticket')
      .insert([{ id: datos.id, nombre: trimText(datos.nombre) }])
      .select('id, nombre')
      .single();
    if (error) throw error;
    return data;
  },

  async updateCategoriaTicket(id, datos) {
    const { data, error } = await getClient().database
      .from('categorias_ticket')
      .update({ nombre: trimText(datos.nombre) })
      .eq('id', id)
      .select('id, nombre')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteCategoriaTicket(id) {
    const { error } = await getClient().database
      .from('categorias_ticket')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async createSubcategoriaTicket(categoriaId, nombre) {
    const { data, error } = await getClient().database
      .from('subcategorias_ticket')
      .insert([{ categoria_id: categoriaId, nombre: trimText(nombre) }])
      .select('id, categoria_id, nombre')
      .single();
    if (error) throw error;
    return data;
  },

  async updateSubcategoriaTicket(id, nombre) {
    const { data, error } = await getClient().database
      .from('subcategorias_ticket')
      .update({ nombre: trimText(nombre) })
      .eq('id', id)
      .select('id, categoria_id, nombre')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteSubcategoriaTicket(id) {
    const { error } = await getClient().database
      .from('subcategorias_ticket')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async listTickets() {
    const { data, error } = await getClient().database
      .from('tickets')
      .select(SELECT_RESUMEN)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapTicketResumen);
  },

  // ── Listado paginado en servidor (la tabla principal) ─────────
  async listTicketsPage({ pagina = 1, tamPagina = 20, ...filtros } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const query = await queryTickets(filtros, { conteo: true });
    const { data, count, error } = await query.range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapTicketResumen), total: count ?? 0 };
  },

  // Dataset filtrado completo, sin página — para exportar CSV
  async listTicketsFiltrados(filtros = {}) {
    const query = await queryTickets(filtros);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapTicketResumen);
  },

  async getTicket(id) {
    const { data, error } = await getClient().database
      .from('tickets')
      .select(`
        id, codigo, titulo, descripcion, estado, prioridad, nivel_atencion, origen, vinculado,
        contacto_ingresado, asignado_a, es_base_conocimiento, es_leccion_aprendida,
        adjunto_url, created_at, updated_at,
        empleado_id, empleados(nombres, apellidos, dni, correo_personal, whatsapp),
        categoria_id, categorias_ticket(nombre),
        subcategoria_id, subcategorias_ticket(nombre),
        equipo_id, equipos(codigo, marca, modelo),
        cuenta_id, cuentas(usuario, plataformas(nombre)),
        licencia_id, licencias(software)
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapTicketDetalle(data) : null;
  },

  async listComentariosTicket(ticketId) {
    const { data, error } = await getClient().database
      .from('ticket_comentarios')
      .select('id, mensaje, interno, created_at, autor_id')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async crearComentarioTicket(ticketId, mensaje, interno = true) {
    const { error } = await getClient().database
      .from('ticket_comentarios')
      .insert([{ ticket_id: ticketId, mensaje: trimText(mensaje), interno }]);
    if (error) throw error;
  },

  async listEventosTicket(ticketId) {
    const { data, error } = await getClient().database
      .from('ticket_eventos')
      .select('id, evento, detalle, user_email, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getSatisfaccionTicket(ticketId) {
    const { data, error } = await getClient().database
      .from('ticket_satisfaccion')
      .select('nivel, comentario, fecha_envio')
      .eq('ticket_id', ticketId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async actualizarTicket(id, datos) {
    const { error } = await getClient().database
      .from('tickets')
      .update(datos)
      .eq('id', id);
    if (error) throw error;
  },
};

const SELECT_RESUMEN = `
  id, codigo, titulo, estado, prioridad, vinculado, contacto_ingresado,
  created_at, updated_at, asignado_a,
  empleados(nombres, apellidos),
  categorias_ticket(nombre), subcategorias_ticket(nombre)
`;

// Query base del listado con filtros en servidor. El solicitante vive en
// la tabla empleados (embed) y un .or() top-level no puede filtrar columnas
// del embed: se preresuelven ids de empleados por nombre (cap 50 homónimos)
// y entran al or() como empleado_id.in.(...) — los UUID no llevan comas.
async function queryTickets(
  { q = '', estado = '', prioridad = '', sinAsignar = false, sinVincular = false } = {},
  { conteo = false } = {},
) {
  const db = getClient().database;
  let query = db.from('tickets').select(SELECT_RESUMEN, conteo ? { count: 'exact' } : undefined);
  if (estado) query = query.eq('estado', estado);
  if (prioridad) query = query.eq('prioridad', prioridad);
  if (sinAsignar) query = query.is('asignado_a', null);
  if (sinVincular) query = query.eq('vinculado', false);
  const qSafe = sanitizarTermino(q);
  if (qSafe.length >= 2) {
    let idsClause = '';
    const { data: emps } = await db.from('empleados').select('id')
      .or(`nombres.ilike.%${qSafe}%,apellidos.ilike.%${qSafe}%`)
      .limit(50);
    if (emps?.length) idsClause = `,empleado_id.in.(${emps.map((e) => e.id).join(',')})`;
    query = query.or(`codigo.ilike.%${qSafe}%,titulo.ilike.%${qSafe}%,contacto_ingresado.ilike.%${qSafe}%${idsClause}`);
  }
  return query.order('created_at', { ascending: false });
}

function mapTicketResumen(row) {
  const empleado = row.empleados;
  return {
    id: row.id,
    codigo: row.codigo,
    titulo: row.titulo,
    estado: row.estado,
    prioridad: row.prioridad,
    vinculado: row.vinculado,
    solicitante: empleado ? `${empleado.nombres} ${empleado.apellidos}`.trim() : (row.contacto_ingresado || ''),
    categoria: row.categorias_ticket?.nombre || '',
    subcategoria: row.subcategorias_ticket?.nombre || '',
    asignado_a: row.asignado_a,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapTicketDetalle(row) {
  const empleado = row.empleados;
  return {
    id: row.id,
    codigo: row.codigo,
    titulo: row.titulo,
    descripcion: row.descripcion,
    estado: row.estado,
    prioridad: row.prioridad,
    nivel_atencion: row.nivel_atencion,
    origen: row.origen,
    vinculado: row.vinculado,
    contacto_ingresado: row.contacto_ingresado || '',
    asignado_a: row.asignado_a,
    es_base_conocimiento: row.es_base_conocimiento,
    es_leccion_aprendida: row.es_leccion_aprendida,
    adjunto_url: row.adjunto_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    empleado_id: row.empleado_id,
    empleado_nombre: empleado ? `${empleado.nombres} ${empleado.apellidos}`.trim() : '',
    empleado_dni: empleado?.dni || '',
    empleado_correo: empleado?.correo_personal || '',
    empleado_whatsapp: empleado?.whatsapp || '',
    categoria_id: row.categoria_id,
    categoria_nombre: row.categorias_ticket?.nombre || '',
    subcategoria_id: row.subcategoria_id,
    subcategoria_nombre: row.subcategorias_ticket?.nombre || '',
    equipo_id: row.equipo_id,
    equipo_desc: row.equipos ? `${row.equipos.codigo} — ${row.equipos.marca || ''} ${row.equipos.modelo || ''}`.trim() : '',
    cuenta_id: row.cuenta_id,
    cuenta_desc: row.cuentas ? `${row.cuentas.usuario} (${row.cuentas.plataformas?.nombre || ''})` : '',
    licencia_id: row.licencia_id,
    licencia_desc: row.licencias?.software || '',
  };
}
