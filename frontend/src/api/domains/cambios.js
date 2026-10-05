// Dominio cambios (migración 107): registro mínimo de cambios en producción
// (estándar, normal, emergencia) sobre el catálogo de servicios.
//
// LECTURA directa con RLS (módulo `tickets`): `cambios`, `cambio_eventos`,
// `cambio_tickets` y las vistas `v_kpi_cambios` / `v_cambios_aprobacion_vencida`
// (security_invoker). ESCRITURA solo por RPC (el cliente no tiene privilegios de
// INSERT/UPDATE/DELETE): crear_cambio, actualizar_cambio, transicionar_cambio,
// aprobar_cambio, rechazar_cambio, vincular_cambio_ticket y desvincular_cambio_ticket.
// Las RPC rechazan con 42501 (sin permiso) o P0001 (regla de negocio, texto en
// español); los errores se relanzan crudos y los traduce quien los muestra
// (api/erroresDb.js).
import { getClient } from '../client.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { trimText } from '../../core/formatters.js';
import { ESTADOS_DE_VISTA } from '../../core/dominio-cambios.js';

// Columnas ordenables del listado; el servicio viene de un embed y no se ordena en servidor.
const ORDEN_COLUMNAS = ['codigo', 'created_at', 'estado', 'ventana_inicio'];
const ORDEN_DEFECTO = { columna: 'created_at', ascending: false };

const SELECT_LISTA = '*, servicios(id, nombre, criticidad)';
const SELECT_DETALLE = '*, servicios(id, nombre, criticidad, horario, dueno_user_id)';

function mapCambio(row) {
  const s = row.servicios || {};
  return {
    id: row.id,
    codigo: row.codigo,
    titulo: row.titulo,
    tipo: row.tipo,
    riesgo: row.riesgo,
    servicio_id: row.servicio_id,
    servicio_nombre: s.nombre || '',
    servicio_criticidad: s.criticidad || null,
    servicio_horario: s.horario || '',
    servicio_dueno: s.dueno_user_id || null,
    descripcion: row.descripcion || '',
    plan_retroceso: row.plan_retroceso || '',
    ventana_inicio: row.ventana_inicio || null,
    ventana_fin: row.ventana_fin || null,
    estado: row.estado,
    solicitado_por: row.solicitado_por || null,
    solicitado_at: row.solicitado_at || null,
    aprobado_por: row.aprobado_por || null,
    aprobado_at: row.aprobado_at || null,
    aprobacion_pendiente_hasta: row.aprobacion_pendiente_hasta || null,
    inicio_real_at: row.inicio_real_at || null,
    fin_real_at: row.fin_real_at || null,
    resultado: row.resultado || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function queryLista({ estados = [], tipos = [], servicios = [], q = '', orden } = {}, { conteo = false, soloConteo = false } = {}) {
  let query = getClient().database
    .from('cambios')
    .select(soloConteo ? 'id' : SELECT_LISTA, conteo || soloConteo ? { count: 'exact' } : undefined);
  if (estados.length) query = query.in('estado', estados);
  if (tipos.length) query = query.in('tipo', tipos);
  if (servicios.length) query = query.in('servicio_id', servicios);
  const qSafe = sanitizarTermino(q);
  if (qSafe.length >= 2) query = query.or(`codigo.ilike.%${qSafe}%,titulo.ilike.%${qSafe}%`);
  const { columna, ascending } = ordenValido(orden, ORDEN_COLUMNAS, ORDEN_DEFECTO);
  return query.order(columna, { ascending });
}

const nulo = (v) => (v == null || v === '' ? null : v);
// Texto de varias líneas (descripción, plan, notas): se recorta pero NO se colapsan los saltos de línea.
const largo = (v) => nulo(typeof v === 'string' ? v.trim() : v);

export const cambiosApi = {
  // ── Listado paginado en servidor ──────────────────────────────
  async listCambiosPage({ pagina = 1, tamPagina = 20, orden, ...filtros } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const { data, count, error } = await queryLista({ ...filtros, orden }, { conteo: true })
      .range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapCambio), total: count ?? 0 };
  },

  // Conteo de cada vista (En curso, Por aprobar, ...) con el RESTO de los filtros
  // aplicados: el número de cada pestaña dice cuántas filas mostrará.
  async conteosCambiosPorVista(filtros = {}) {
    const vistas = Object.keys(ESTADOS_DE_VISTA);
    const cuentas = await Promise.all(vistas.map(async (vista) => {
      const { count, error } = await queryLista({ ...filtros, estados: ESTADOS_DE_VISTA[vista] }, { soloConteo: true }).range(0, 0);
      if (error) throw error;
      return count ?? 0;
    }));
    return Object.fromEntries(vistas.map((v, i) => [v, cuentas[i]]));
  },

  // ── Un cambio con su libro y sus tickets ──────────────────────
  async getCambio(id) {
    const { data, error } = await getClient().database
      .from('cambios')
      .select(SELECT_DETALLE)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapCambio(data) : null;
  },

  // Libro de movimientos, lo más reciente primero (`orden` desempata eventos del mismo instante).
  async listEventosCambio(cambioId) {
    const { data, error } = await getClient().database
      .from('cambio_eventos')
      .select('*')
      .eq('cambio_id', cambioId)
      .order('created_at', { ascending: false })
      .order('orden', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async ticketsDeCambio(cambioId) {
    const { data, error } = await getClient().database
      .from('cambio_tickets')
      .select('ticket_id, created_at, vinculado_por, tickets(id, codigo, titulo, estado)')
      .eq('cambio_id', cambioId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((f) => ({
      id: f.ticket_id,
      codigo: f.tickets?.codigo || '',
      titulo: f.tickets?.titulo || '',
      estado: f.tickets?.estado || null,
      vinculado_at: f.created_at,
    }));
  },

  // Para enlazar un ticket escribiendo su código (TCK-0123). null si no existe.
  async buscarTicketPorCodigo(codigo) {
    const { data, error } = await getClient().database
      .from('tickets')
      .select('id, codigo, titulo, estado')
      .eq('codigo', String(codigo || '').trim().toUpperCase())
      .maybeSingle();
    if (error) throw error;
    return data || null;
  },

  // ── Indicadores (vistas security_invoker) ─────────────────────
  async kpiCambios() {
    const { data, error } = await getClient().database
      .from('v_kpi_cambios')
      .select('*');
    if (error) throw error;
    return data || [];
  },

  async cambiosAprobacionVencida() {
    const { data, error } = await getClient().database
      .from('v_cambios_aprobacion_vencida')
      .select('*')
      .order('aprobacion_pendiente_hasta', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // ── Escritura (RPC de la migración 107) ───────────────────────
  // `enviar`: lo manda a aprobación en la misma transacción (estándar queda aprobado).
  async crearCambio({ titulo, tipo, riesgo, servicioId, descripcion, planRetroceso = null, ventanaInicio = null, ventanaFin = null, enviar = false }) {
    const { data, error } = await getClient().database.rpc('crear_cambio', {
      p_titulo: trimText(titulo),
      p_tipo: tipo,
      p_riesgo: riesgo,
      p_servicio_id: servicioId,
      p_descripcion: largo(descripcion),
      p_plan_retroceso: largo(planRetroceso),
      p_ventana_inicio: nulo(ventanaInicio),
      p_ventana_fin: nulo(ventanaFin),
      p_enviar: !!enviar,
    });
    if (error) throw error;
    return data;
  },

  // Solo borradores; los mismos campos que crearCambio.
  async actualizarCambio(id, { titulo, tipo, riesgo, servicioId, descripcion, planRetroceso = null, ventanaInicio = null, ventanaFin = null }) {
    const { data, error } = await getClient().database.rpc('actualizar_cambio', {
      p_cambio_id: id,
      p_titulo: trimText(titulo),
      p_tipo: tipo,
      p_riesgo: riesgo,
      p_servicio_id: servicioId,
      p_descripcion: largo(descripcion),
      p_plan_retroceso: largo(planRetroceso),
      p_ventana_inicio: nulo(ventanaInicio),
      p_ventana_fin: nulo(ventanaFin),
    });
    if (error) throw error;
    return data;
  },

  // `nota` obligatoria para rechazar, revertir y cancelar (salvo desde borrador); el servidor lo repite.
  async transicionarCambio(id, destino, nota = null) {
    const { data, error } = await getClient().database.rpc('transicionar_cambio', {
      p_cambio_id: id,
      p_destino: destino,
      p_nota: largo(nota),
    });
    if (error) throw error;
    return data;
  },

  // Solo un jefe. También registra la aprobación a posteriori de una emergencia ya ejecutada.
  async aprobarCambio(id, nota = null) {
    const { data, error } = await getClient().database.rpc('aprobar_cambio', {
      p_cambio_id: id,
      p_nota: largo(nota),
    });
    if (error) throw error;
    return data;
  },

  // Solo un jefe; motivo obligatorio.
  async rechazarCambio(id, motivo) {
    const { data, error } = await getClient().database.rpc('rechazar_cambio', {
      p_cambio_id: id,
      p_motivo: largo(motivo),
    });
    if (error) throw error;
    return data;
  },

  async vincularCambioTicket(cambioId, ticketId) {
    const { data, error } = await getClient().database.rpc('vincular_cambio_ticket', {
      p_cambio_id: cambioId,
      p_ticket_id: ticketId,
    });
    if (error) throw error;
    return data;
  },

  async desvincularCambioTicket(cambioId, ticketId) {
    const { data, error } = await getClient().database.rpc('desvincular_cambio_ticket', {
      p_cambio_id: cambioId,
      p_ticket_id: ticketId,
    });
    if (error) throw error;
    return data;
  },
};
