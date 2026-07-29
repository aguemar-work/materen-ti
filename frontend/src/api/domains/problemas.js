// Dominio Gestión de Problemas (problemas / problema_tickets /
// acciones_correctivas). Las reglas de negocio (bloqueo de cierre con
// acciones pendientes, staff activo como responsable, autovínculo del
// ticket disparador) las resuelve la BD (migración 033) — este archivo
// solo arma las queries y deja que el error del trigger llegue a la vista.
import { getClient } from '../client.js';
import { entregarQuery } from '../entregarQuery.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { trimText } from '../../core/formatters.js';
import { ESTADOS_PROBLEMA_ABIERTOS } from '../../core/dominio-problemas.js';

const SELECT_RESUMEN = `
  id, titulo, severidad, estado, responsable_id, ticket_disparador_id,
  created_at, updated_at
`;

const SELECT_DETALLE = `${SELECT_RESUMEN}, descripcion, causa_raiz, created_by`;

const ORDEN_COLUMNAS = ['titulo', 'severidad', 'estado', 'created_at', 'updated_at'];
const ORDEN_DEFECTO = { columna: 'updated_at', ascending: false };

async function queryProblemas({ q = '', estado = '', severidad = '', orden } = {}, { conteo = false } = {}) {
  let query = getClient().database
    .from('problemas')
    .select(SELECT_RESUMEN, conteo ? { count: 'exact' } : undefined)
    .is('deleted_at', null);
  if (estado) query = query.eq('estado', estado);
  if (severidad) query = query.eq('severidad', severidad);
  const qSafe = sanitizarTermino(q);
  if (qSafe.length >= 2) query = query.ilike('titulo', `%${qSafe}%`);
  const { columna, ascending } = ordenValido(orden, ORDEN_COLUMNAS, ORDEN_DEFECTO);
  return entregarQuery(query.order(columna, { ascending }));
}

// Hoy en formato YYYY-MM-DD / N días atrás (mismo criterio que
// dashboard.js:fechaEnDias, pero solo hacia el pasado).
function fechaHaceDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().split('T')[0];
}

export const problemasApi = {
  async listProblemasPage({ pagina = 1, tamPagina = 20, ...filtros } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const { qb } = await queryProblemas(filtros, { conteo: true });
    const { data, count, error } = await qb.range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapProblemaResumen), total: count ?? 0 };
  },

  async getProblema(id) {
    const { data, error } = await getClient().database
      .from('problemas')
      .select(SELECT_DETALLE)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? mapProblemaDetalle(data) : null;
  },

  // Tickets vinculados: dos queries simples en vez de un embed filtrado
  // (el cliente no filtra por columnas de tabla embebida en este proyecto,
  // ver api/domains/dashboard.js para el mismo criterio de "resolver ids
  // primero, entrar por .in()").
  async listTicketsVinculados(problemaId) {
    const db = getClient().database;
    const { data: vinculos, error: e1 } = await db
      .from('problema_tickets')
      .select('id, ticket_id, created_at')
      .eq('problema_id', problemaId)
      .order('created_at', { ascending: true });
    if (e1) throw e1;
    if (!vinculos?.length) return [];
    const ids = vinculos.map((v) => v.ticket_id);
    const { data: tickets, error: e2 } = await db
      .from('tickets')
      .select('id, codigo, titulo, estado')
      .in('id', ids);
    if (e2) throw e2;
    const ticketPorId = Object.fromEntries((tickets || []).map((t) => [t.id, t]));
    return vinculos.map((v) => ({
      vinculo_id: v.id,
      ticket_id: v.ticket_id,
      codigo: ticketPorId[v.ticket_id]?.codigo || '',
      titulo: ticketPorId[v.ticket_id]?.titulo || '',
      estado: ticketPorId[v.ticket_id]?.estado || '',
    }));
  },

  async vincularTicket(problemaId, ticketId) {
    const { error } = await getClient().database
      .from('problema_tickets')
      .insert([{ problema_id: problemaId, ticket_id: ticketId }]);
    if (error) throw error;
  },

  async desvincularTicket(vinculoId) {
    const { error } = await getClient().database
      .from('problema_tickets')
      .delete()
      .eq('id', vinculoId);
    if (error) throw error;
  },

  async listAccionesCorrectivas(problemaId) {
    const { data, error } = await getClient().database
      .from('acciones_correctivas')
      .select('id, descripcion, responsable_id, fecha_limite, estado, fecha_completada, created_at')
      .eq('problema_id', problemaId)
      .is('deleted_at', null)
      .order('fecha_limite', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async crearAccionCorrectiva(problemaId, datos) {
    const { data, error } = await getClient().database
      .from('acciones_correctivas')
      .insert([{
        problema_id: problemaId,
        descripcion: trimText(datos.descripcion),
        responsable_id: datos.responsable_id || null,
        fecha_limite: datos.fecha_limite,
      }])
      .select('id, descripcion, responsable_id, fecha_limite, estado, fecha_completada, created_at')
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarAccionCorrectiva(id, datos) {
    const { data, error } = await getClient().database
      .from('acciones_correctivas')
      .update(datos)
      .eq('id', id)
      .select('id, descripcion, responsable_id, fecha_limite, estado, fecha_completada, created_at')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteAccionCorrectiva(id) {
    const { error } = await getClient().database
      .from('acciones_correctivas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async crearProblema(datos) {
    const { data, error } = await getClient().database
      .from('problemas')
      .insert([{
        titulo: trimText(datos.titulo),
        descripcion: trimText(datos.descripcion),
        severidad: datos.severidad || 'media',
        ticket_disparador_id: datos.ticket_disparador_id || null,
        responsable_id: datos.responsable_id || null,
      }])
      .select(SELECT_DETALLE)
      .single();
    if (error) throw error;
    return mapProblemaDetalle(data);
  },

  async actualizarProblema(id, datos) {
    const { data, error } = await getClient().database
      .from('problemas')
      .update(datos)
      .eq('id', id)
      .select(SELECT_DETALLE)
      .single();
    if (error) throw error;
    return mapProblemaDetalle(data);
  },

  async softDeleteProblema(id) {
    const { error } = await getClient().database
      .from('problemas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // Badge en la ficha de ticket: ¿este ticket está vinculado a un problema
  // todavía abierto? Mismo criterio de dos queries que listTicketsVinculados.
  async getProblemaAbiertoDeTicket(ticketId) {
    const db = getClient().database;
    const { data: vinculos, error: e1 } = await db
      .from('problema_tickets')
      .select('problema_id')
      .eq('ticket_id', ticketId);
    if (e1) throw e1;
    if (!vinculos?.length) return null;
    const { data: problemas, error: e2 } = await db
      .from('problemas')
      .select('id, titulo, estado')
      .in('id', vinculos.map((v) => v.problema_id))
      .in('estado', ESTADOS_PROBLEMA_ABIERTOS)
      .is('deleted_at', null)
      .limit(1);
    if (e2) throw e2;
    return problemas?.[0] || null;
  },

  // ── Pendientes del Dashboard (recurrencia + vencimiento) ────────────────
  // Mismo espíritu que dashboardApi.pendientesTickets(): se computa en vivo
  // en cada carga, sin tabla de notificaciones — ver migración 033.

  // Sugerencia de apertura de problema: 3+ tickets de la misma categoría en
  // los últimos 30 días que TODAVÍA no están vinculados a ningún problema
  // (una vez que un ticket entra a problema_tickets, ya no cuenta para la
  // sugerencia — se considera "ya atendido").
  async listCategoriasRecurrentes({ dias = 30, minimo = 3 } = {}) {
    const db = getClient().database;
    const [{ data: recientes, error: e1 }, { data: vinculados, error: e2 }] = await Promise.all([
      db.from('tickets')
        .select('id, codigo, titulo, categoria_id, categorias_ticket(nombre), created_at')
        .gte('created_at', fechaHaceDias(dias))
        .not('categoria_id', 'is', null),
      db.from('problema_tickets').select('ticket_id'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const yaVinculados = new Set((vinculados || []).map((v) => v.ticket_id));
    const sinAtender = (recientes || []).filter((t) => !yaVinculados.has(t.id));

    const porCategoria = new Map();
    for (const t of sinAtender) {
      const clave = t.categoria_id;
      if (!porCategoria.has(clave)) {
        porCategoria.set(clave, { categoria_id: clave, categoria_nombre: t.categorias_ticket?.nombre || '', tickets: [] });
      }
      porCategoria.get(clave).tickets.push({ ticket_id: t.id, codigo: t.codigo, titulo: t.titulo, desde: t.created_at });
    }
    return [...porCategoria.values()]
      .filter((c) => c.tickets.length >= minimo)
      .sort((a, b) => b.tickets.length - a.tickets.length);
  },

  async listAccionesCorrectivasVencidas() {
    const db = getClient().database;
    const { data: vencidas, error: e1 } = await db
      .from('acciones_correctivas')
      .select('id, descripcion, fecha_limite, problema_id')
      .in('estado', ['pendiente', 'en_progreso'])
      .is('deleted_at', null)
      .lt('fecha_limite', fechaHaceDias(0))
      .order('fecha_limite', { ascending: true });
    if (e1) throw e1;
    if (!vencidas?.length) return [];
    const { data: problemas, error: e2 } = await db
      .from('problemas')
      .select('id, titulo')
      .in('id', vencidas.map((a) => a.problema_id));
    if (e2) throw e2;
    const tituloPorProblema = Object.fromEntries((problemas || []).map((p) => [p.id, p.titulo]));
    return vencidas.map((a) => ({
      accion_id: a.id,
      descripcion: a.descripcion,
      fecha_limite: a.fecha_limite,
      problema_id: a.problema_id,
      problema_titulo: tituloPorProblema[a.problema_id] || '',
    }));
  },

  async pendientesProblemas() {
    const [categoriasRecurrentes, accionesVencidas] = await Promise.all([
      this.listCategoriasRecurrentes(),
      this.listAccionesCorrectivasVencidas(),
    ]);
    return { categoriasRecurrentes, accionesVencidas };
  },
};

function mapProblemaResumen(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    severidad: row.severidad,
    estado: row.estado,
    responsable_id: row.responsable_id,
    ticket_disparador_id: row.ticket_disparador_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapProblemaDetalle(row) {
  return {
    ...mapProblemaResumen(row),
    descripcion: row.descripcion,
    causa_raiz: row.causa_raiz || '',
    created_by: row.created_by,
  };
}
