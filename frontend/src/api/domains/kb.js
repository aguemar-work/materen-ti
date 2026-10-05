// Dominio Base de Conocimiento (kb_articulos): soluciones reutilizables
// para agilizar la atención de tickets. Visibilidad por estado/autoría
// resuelta enteramente por RLS (migración 031) — este archivo no repite
// esa lógica, solo arma las queries y confía en lo que el servidor deje ver.
import { getClient } from '../client.js';
import { entregarQuery } from '../entregarQuery.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { trimText } from '../../core/formatters.js';
import { TIPO_KB_POR_DEFECTO } from '../../core/dominio-kb.js';

const SELECT_RESUMEN = `
  id, titulo, categoria_id, sintoma, estado, tipo, problema_id, util_si, util_no,
  ticket_origen_id, created_by, created_at, updated_at,
  categorias_ticket(nombre)
`;

const SELECT_DETALLE = `${SELECT_RESUMEN}, solucion`;

// Columnas de "kb_articulos" ordenables desde la tabla (excluye categoría,
// que viene de un join).
const ORDEN_COLUMNAS = ['titulo', 'estado', 'created_at', 'updated_at'];
const ORDEN_DEFECTO = { columna: 'updated_at', ascending: false };

// categoriaIds / autorIds: chips de los filtros V2 (2026-09-25).
async function queryKb(
  { q = '', categoriaId = '', categoriaIds = [], autorIds = [], estado = '', orden } = {},
  { conteo = false, soloConteo = false } = {},
) {
  let query = getClient().database
    .from('kb_articulos')
    .select(soloConteo ? 'id' : SELECT_RESUMEN, conteo ? { count: 'exact' } : undefined)
    .is('deleted_at', null);
  if (categoriaId) query = query.eq('categoria_id', categoriaId);
  if (categoriaIds.length) query = query.in('categoria_id', categoriaIds);
  if (autorIds.length) query = query.in('created_by', autorIds);
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

  // Conteo de cada vista (estado) con la misma búsqueda y chips. RLS decide
  // qué borradores ajenos se cuentan, igual que en el listado.
  async conteosKbPorEstado(filtros = {}) {
    const estados = ['', 'publicado', 'en_revision', 'borrador', 'obsoleto'];
    const resultados = await Promise.all(estados.map(async (estado) => {
      const { qb } = await queryKb({ ...filtros, estado }, { conteo: true, soloConteo: true });
      const { count, error } = await qb.range(0, 0);
      if (error) throw error;
      return [estado || 'todos', count ?? 0];
    }));
    return Object.fromEntries(resultados);
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
        tipo: datos.tipo || TIPO_KB_POR_DEFECTO,
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

  // ── KEDB (migración 106) ──────────────────────────────────────────────
  // Escritura solo por RPC; los rechazos (42501 sin permiso, P0001 regla de
  // negocio en español, P0002 no existe) se relanzan crudos y los traduce
  // quien los muestra (api/erroresDb.js).

  // Crea o actualiza el artículo de tipo workaround del problema y lo deja
  // como error conocido. Lo publica un jefe; otro rol lo deja en revisión (el
  // estado del artículo devuelto lo dice). `workaround` omitido = el ya
  // guardado en el problema.
  async publicarWorkaroundProblema(problemaId, { workaround = null, titulo = null, sintoma = null } = {}) {
    const { data, error } = await getClient().database.rpc('publicar_workaround_problema', {
      p_problema_id: problemaId,
      p_workaround: textoLargo(workaround),
      p_titulo: trimText(titulo),
      p_sintoma: trimText(sintoma),
    });
    if (error) throw error;
    return mapKbDetalle(data);
  },

  // Borrador de KB desde un ticket resuelto o cerrado. La solución sale de
  // `solucion` o, si no llega, de la nota de resolución del ticket.
  async crearKbDesdeTicket(ticketId, { solucion = null, titulo = null, sintoma = null } = {}) {
    const { data, error } = await getClient().database.rpc('crear_kb_desde_ticket', {
      p_ticket_id: ticketId,
      p_solucion: textoLargo(solucion),
      p_titulo: trimText(titulo),
      p_sintoma: trimText(sintoma),
    });
    if (error) throw error;
    return mapKbDetalle(data);
  },

  // "Este artículo ayudó a resolver este ticket". Idempotente.
  async registrarUsoKbTicket(ticketId, articuloId) {
    const { data, error } = await getClient().database.rpc('registrar_uso_kb_ticket', {
      p_ticket_id: ticketId,
      p_kb_articulo_id: articuloId,
    });
    if (error) throw error;
    return data;
  },

  // Ids de los artículos ya marcados como usados en un ticket.
  async listUsosKbTicket(ticketId) {
    const { data, error } = await getClient().database
      .from('ticket_kb_usos')
      .select('kb_articulo_id, usado_por, created_at')
      .eq('ticket_id', ticketId);
    if (error) throw error;
    return data || [];
  },

  // Usos de un artículo (v_kpi_kb): { usos_90d, usos_total, ultimo_uso_at }.
  // Sin fila (artículo no visible) devuelve ceros.
  async kpiKbArticulo(articuloId) {
    const { data, error } = await getClient().database
      .from('v_kpi_kb')
      .select('usos_90d, usos_total, ultimo_uso_at')
      .eq('kb_articulo_id', articuloId)
      .maybeSingle();
    if (error) throw error;
    return {
      usos_90d: data?.usos_90d || 0,
      usos_total: data?.usos_total || 0,
      ultimo_uso_at: data?.ultimo_uso_at || null,
    };
  },
};

// Texto de varias líneas (pasos de un workaround o de una solución): se
// recortan los extremos pero se conservan los saltos de línea; vacío = null.
function textoLargo(valor) {
  const t = String(valor ?? '').trim();
  return t || null;
}

function mapKbResumen(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    categoria_id: row.categoria_id,
    categoria_nombre: row.categorias_ticket?.nombre || '',
    sintoma: row.sintoma || '',
    estado: row.estado,
    tipo: row.tipo || TIPO_KB_POR_DEFECTO,
    problema_id: row.problema_id || null,
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
