// Dominio Base de Conocimiento (kb_articulos): soluciones reutilizables
// para agilizar la atención de tickets. Visibilidad por estado/autoría
// resuelta enteramente por RLS (migración 031) — este archivo no repite
// esa lógica, solo arma las queries y confía en lo que el servidor deje ver.
import { getClient } from '../client.js';
import { entregarQuery } from '../entregarQuery.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { trimText } from '../../core/formatters.js';

const SELECT_RESUMEN = `
  id, titulo, categoria_id, sintoma, estado, util_si, util_no,
  ticket_origen_id, created_by, created_at, updated_at,
  categorias_ticket(nombre)
`;

const SELECT_DETALLE = `${SELECT_RESUMEN}, solucion`;

// Columnas de "kb_articulos" ordenables desde la tabla (excluye categoría,
// que viene de un join).
const ORDEN_COLUMNAS = ['titulo', 'estado', 'created_at', 'updated_at'];
const ORDEN_DEFECTO = { columna: 'updated_at', ascending: false };

async function queryKb({ q = '', categoriaId = '', estado = '', orden } = {}, { conteo = false } = {}) {
  let query = getClient().database
    .from('kb_articulos')
    .select(SELECT_RESUMEN, conteo ? { count: 'exact' } : undefined)
    .is('deleted_at', null);
  if (categoriaId) query = query.eq('categoria_id', categoriaId);
  if (estado) query = query.eq('estado', estado);
  const qSafe = sanitizarTermino(q);
  if (qSafe.length >= 2) {
    query = query.or(`titulo.ilike.%${qSafe}%,sintoma.ilike.%${qSafe}%`);
  }
  const { columna, ascending } = ordenValido(orden, ORDEN_COLUMNAS, ORDEN_DEFECTO);
  return entregarQuery(query.order(columna, { ascending }));
}

export const kbApi = {
  async listKbPage({ pagina = 1, tamPagina = 20, ...filtros } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const { qb } = await queryKb(filtros, { conteo: true });
    const { data, count, error } = await qb.range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapKbResumen), total: count ?? 0 };
  },

  async getKbArticulo(id) {
    const { data, error } = await getClient().database
      .from('kb_articulos')
      .select(SELECT_DETALLE)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? mapKbDetalle(data) : null;
  },

  // Sugerencias para el panel "Artículos relacionados" de un ticket: solo
  // publicados (RLS ya lo exigiría igual para un no-autor), misma
  // categoría. Tope bajo — es un panel lateral, no un buscador. Sin
  // filtro de texto a propósito: un "q" (ej. el título del ticket) como
  // AND obligatorio contra titulo/sintoma del artículo descarta
  // coincidencias reales de categoría solo porque el texto no calza
  // literalmente — ya pasó (ver conversación del 2026-07-29).
  async listArticulosRelacionados({ categoriaId, limite = 5 } = {}) {
    if (!categoriaId) return [];
    const { data, error } = await getClient().database
      .from('kb_articulos')
      .select(SELECT_RESUMEN)
      .is('deleted_at', null)
      .eq('categoria_id', categoriaId)
      .eq('estado', 'publicado')
      .order('util_si', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return (data || []).map(mapKbResumen);
  },

  async crearKbArticulo(datos) {
    const { data, error } = await getClient().database
      .from('kb_articulos')
      .insert([{
        titulo: trimText(datos.titulo),
        categoria_id: datos.categoria_id || null,
        sintoma: trimText(datos.sintoma),
        solucion: trimText(datos.solucion),
        ticket_origen_id: datos.ticket_origen_id || null,
        estado: datos.estado || 'borrador',
      }])
      .select(SELECT_DETALLE)
      .single();
    if (error) throw error;
    return mapKbDetalle(data);
  },

  async actualizarKbArticulo(id, datos) {
    const { data, error } = await getClient().database
      .from('kb_articulos')
      .update(datos)
      .eq('id', id)
      .select(SELECT_DETALLE)
      .single();
    if (error) throw error;
    return mapKbDetalle(data);
  },

  async softDeleteKbArticulo(id) {
    const { error } = await getClient().database
      .from('kb_articulos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // "¿Te sirvió?": función SECURITY DEFINER angosta (migración 032) que
  // solo incrementa util_si/util_no, atómico en el servidor — reemplaza
  // la política RLS amplia que dejaba editar toda la fila. Primer .rpc()
  // del cliente en el proyecto (justificado: es la única forma de acotar
  // el UPDATE a esas dos columnas sin abrir el resto del artículo).
  async votarKbArticulo(id, util) {
    const { error } = await getClient().database
      .rpc('kb_registrar_feedback', { p_articulo_id: id, p_util: util });
    if (error) throw error;
    return this.getKbArticulo(id);
  },
};

function mapKbResumen(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    categoria_id: row.categoria_id,
    categoria_nombre: row.categorias_ticket?.nombre || '',
    sintoma: row.sintoma || '',
    estado: row.estado,
    util_si: row.util_si || 0,
    util_no: row.util_no || 0,
    ticket_origen_id: row.ticket_origen_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapKbDetalle(row) {
  return {
    ...mapKbResumen(row),
    solucion: row.solucion || '',
  };
}
