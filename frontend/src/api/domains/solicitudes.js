// Dominio solicitudes de servicio (migración 108): trámites con pasos (alta,
// baja, cambio de puesto, acceso, equipo, licencia). Reemplaza a
// `empleadosApi.altasIncompletas()` y al checklist cosmético de la baja.
//
// LECTURA directa con RLS: `solicitudes`, `solicitud_pasos`, `solicitud_tipos`
// (todas con el módulo `empleados`). ESCRITURA solo por RPC (el cliente no
// tiene privilegios de INSERT/UPDATE): crear_solicitud, completar_paso_solicitud,
// omitir_paso_solicitud, cancelar_solicitud y convertir_ticket_en_solicitud.
// Las RPC rechazan con 42501 (sin permiso) o P0001 (regla de negocio, texto en
// español); los errores se relanzan crudos y los traduce quien los muestra
// (api/erroresDb.js).
import { getClient } from '../client.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { trimText } from '../../core/formatters.js';
import { empleadoToRow } from '../empleadoFila.js';

// Columnas ordenables del listado. `avance` y el empleado vienen de embeds:
// no se ordenan en servidor.
const ORDEN_COLUMNAS = ['codigo', 'created_at', 'estado'];
const ORDEN_DEFECTO = { columna: 'created_at', ascending: false };

const SELECT_LISTA = '*, solicitud_tipos(id, nombre, modulo_responsable), empleados(id, nombres, apellidos, estado), solicitud_pasos(id, estado, obligatorio, orden, label, clave)';
const SELECT_DETALLE = '*, solicitud_tipos(id, nombre, modulo_responsable), empleados(id, nombres, apellidos, estado, cargo), solicitud_pasos(*), tickets(id, codigo, titulo, estado)';

// Claves de la persona nueva que crear_solicitud acepta en `p_empleado`.
const CLAVES_PERSONA = [
  'nombres', 'apellidos', 'dni', 'empresa_id', 'area_obra_id', 'ubicacion_id',
  'cargo', 'fecha_alta', 'telefono', 'whatsapp', 'correo_personal', 'notas',
];

function mapPaso(p) {
  return {
    id: p.id,
    solicitud_id: p.solicitud_id,
    orden: p.orden,
    clave: p.clave,
    label: p.label,
    obligatorio: !!p.obligatorio,
    modulo: p.modulo || null,
    referencia_tipo: p.referencia_tipo || null,
    objetivo_id: p.objetivo_id || null,
    autocompleta: !!p.autocompleta,
    estado: p.estado,
    referencia_id: p.referencia_id || null,
    automatico: !!p.automatico,
    hecho_por: p.hecho_por || null,
    hecho_at: p.hecho_at || null,
    nota: p.nota || '',
    motivo_omision: p.motivo_omision || '',
  };
}

const porOrden = (a, b) => a.orden - b.orden || String(a.label).localeCompare(String(b.label));

function mapSolicitud(row) {
  const tipo = row.solicitud_tipos || {};
  const emp = row.empleados || {};
  const pasos = (row.solicitud_pasos || []).map(mapPaso).sort(porOrden);
  return {
    id: row.id,
    codigo: row.codigo,
    tipo_id: row.tipo_id,
    tipo_nombre: tipo.nombre || '',
    modulo_responsable: tipo.modulo_responsable || null,
    empleado_id: row.empleado_id,
    empleado_nombre: `${emp.nombres || ''} ${emp.apellidos || ''}`.trim(),
    empleado_estado: emp.estado || null,
    empleado_cargo: emp.cargo || '',
    estado: row.estado,
    origen: row.origen,
    nota: row.nota || '',
    datos: row.datos || {},
    ticket_id: row.ticket_id || null,
    ticket: row.tickets || null,
    creada_por: row.creada_por || null,
    completada_at: row.completada_at || null,
    cancelada_at: row.cancelada_at || null,
    cancelada_por: row.cancelada_por || null,
    motivo_cancelacion: row.motivo_cancelacion || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    pasos,
  };
}

// Ids de empleados cuyo nombre o DNI coinciden con la búsqueda (tokens: cada
// uno debe aparecer en nombre, apellido o DNI). Sirve para buscar solicitudes
// "por persona" sin un embed con filtro, que PostgREST resuelve mal.
async function empleadoIdsPorTexto(q) {
  const tokens = sanitizarTermino(q).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const porToken = tokens.map((t) => `or(nombres.ilike.%${t}%,apellidos.ilike.%${t}%,dni.ilike.%${t}%)`);
  const { data, error } = await getClient().database
    .from('empleados')
    .select('id')
    .is('deleted_at', null)
    .or(tokens.length === 1
      ? `nombres.ilike.%${tokens[0]}%,apellidos.ilike.%${tokens[0]}%,dni.ilike.%${tokens[0]}%`
      : `and(${porToken.join(',')})`)
    .limit(200);
  if (error) throw error;
  return (data || []).map((e) => e.id);
}

// Ids que resuelve la búsqueda de texto (null = sin búsqueda). Se calcula UNA
// vez por llamada y se reutiliza en cada consulta (el listado y sus cuatro
// conteos). Es una función aparte porque `queryLista` devuelve un query
// builder, que es "thenable": si una `async function` lo devolviera, el
// `await` lo ejecutaría antes de poder encadenarle `.range()`.
async function idsDeBusqueda(q = '') {
  const qSafe = sanitizarTermino(q);
  return qSafe.length >= 2 ? { qSafe, ids: await empleadoIdsPorTexto(qSafe) } : null;
}

function queryLista({ estado = '', tipos = [], orden } = {}, busqueda = null, { conteo = false, soloConteo = false } = {}) {
  let query = getClient().database
    .from('solicitudes')
    .select(soloConteo ? 'id' : SELECT_LISTA, conteo || soloConteo ? { count: 'exact' } : undefined);
  if (estado) query = query.eq('estado', estado);
  if (tipos.length) query = query.in('tipo_id', tipos);
  if (busqueda) {
    const partes = [`codigo.ilike.%${busqueda.qSafe}%`];
    if (busqueda.ids.length) partes.push(`empleado_id.in.(${busqueda.ids.join(',')})`);
    query = query.or(partes.join(','));
  }
  const { columna, ascending } = ordenValido(orden, ORDEN_COLUMNAS, ORDEN_DEFECTO);
  return query.order(columna, { ascending });
}

export const solicitudesApi = {
  // ── Listado paginado en servidor ──────────────────────────────
  async listSolicitudesPage({ pagina = 1, tamPagina = 20, orden, ...filtros } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const busqueda = await idsDeBusqueda(filtros.q);
    const { data, count, error } = await queryLista({ ...filtros, orden }, busqueda, { conteo: true })
      .range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapSolicitud), total: count ?? 0 };
  },

  // Conteo de cada vista (Abiertas/Completadas/Canceladas/Todas) con el RESTO
  // de los filtros aplicados: el número de cada pestaña dice cuántas filas
  // mostrará al elegirla. Solo `count` exacto, cero filas de datos.
  async conteosSolicitudesPorEstado(filtros = {}) {
    const estados = ['abierta', 'completada', 'cancelada', ''];
    const busqueda = await idsDeBusqueda(filtros.q);
    const counts = await Promise.all(estados.map(async (estado) => {
      const { count, error } = await queryLista({ ...filtros, estado }, busqueda, { soloConteo: true }).range(0, 0);
      if (error) throw error;
      return count ?? 0;
    }));
    return { abierta: counts[0], completada: counts[1], cancelada: counts[2], todas: counts[3] };
  },

  // ── Una solicitud con sus pasos ───────────────────────────────
  async getSolicitud(id) {
    const { data, error } = await getClient().database
      .from('solicitudes')
      .select(SELECT_DETALLE)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapSolicitud(data) : null;
  },

  // Solicitudes de una persona (expediente), la más reciente primero, con sus
  // pasos para calcular el avance.
  async solicitudesDeEmpleado(empleadoId, limite = 20) {
    const { data, error } = await getClient().database
      .from('solicitudes')
      .select(SELECT_DETALLE)
      .eq('empleado_id', empleadoId)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return (data || []).map(mapSolicitud);
  },

  // La solicitud de baja más reciente de una persona (la que acaba de crear
  // `dar_baja_empleado`), o null.
  async solicitudDeBaja(empleadoId) {
    const { data, error } = await getClient().database
      .from('solicitudes')
      .select(SELECT_DETALLE)
      .eq('empleado_id', empleadoId)
      .eq('tipo_id', 'baja_empleado')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0] ? mapSolicitud(data[0]) : null;
  },

  // Sobre QUÉ actúa cada paso con `objetivo_id`: la cuenta a rotar (usuario) o
  // el equipo a recuperar (su hoja de vida). Devuelve { [objetivo_id]: {...} };
  // lo que el rol no puede leer (módulo correos / equipos) simplemente falta.
  async objetivosDePasosSolicitud(pasos = []) {
    const db = getClient().database;
    const cuentas = pasos.filter((p) => p.objetivo_id && p.referencia_tipo === 'cuenta').map((p) => p.objetivo_id);
    const equipos = pasos.filter((p) => p.objetivo_id && p.referencia_tipo === 'equipo').map((p) => p.objetivo_id);
    const [rc, re] = await Promise.all([
      cuentas.length ? db.from('cuentas').select('id, usuario').in('id', cuentas) : { data: [], error: null },
      equipos.length ? db.from('asignaciones_equipo').select('id, equipo_id, equipos(codigo)').in('id', equipos) : { data: [], error: null },
    ]);
    if (rc.error) throw rc.error;
    if (re.error) throw re.error;
    const mapa = {};
    for (const c of rc.data || []) mapa[c.id] = { usuario: c.usuario };
    for (const a of re.data || []) mapa[a.id] = { equipo_id: a.equipo_id, codigo: a.equipos?.codigo || '' };
    return mapa;
  },

  // ── Escritura (RPC de la migración 108) ───────────────────────
  // `empleado`: datos de la persona NUEVA (solo alta); `empleadoId`: una ya
  // registrada. Uno de los dos, no ambos. `datos`: parámetros del pedido,
  // nunca datos personales. Devuelve la fila de `solicitudes`.
  async crearSolicitud({ tipo, empleadoId = null, empleado = null, datos = {}, nota = null, origen = 'otro', ticketId = null }) {
    let persona = null;
    if (empleado) {
      const fila = empleadoToRow(empleado);
      persona = Object.fromEntries(CLAVES_PERSONA.map((k) => [k, fila[k]]).filter(([, v]) => v != null && v !== ''));
    }
    const { data, error } = await getClient().database.rpc('crear_solicitud', {
      p_tipo: tipo,
      p_empleado_id: empleadoId,
      p_empleado: persona,
      p_datos: datos || {},
      p_nota: trimText(nota),
      p_origen: origen,
      p_ticket_id: ticketId,
    });
    if (error) throw error;
    return data;
  },

  // `referenciaId` (opcional): la asignación / entrega que resultó del paso;
  // el servidor valida que sea de esta persona.
  async completarPasoSolicitud(pasoId, { referenciaId = null, nota = null } = {}) {
    const { data, error } = await getClient().database.rpc('completar_paso_solicitud', {
      p_paso_id: pasoId,
      p_referencia_id: referenciaId,
      p_nota: trimText(nota),
    });
    if (error) throw error;
    return data;
  },

  // Motivo OBLIGATORIO (≤ 500). Un paso obligatorio solo lo omite un jefe.
  async omitirPasoSolicitud(pasoId, motivo) {
    const { data, error } = await getClient().database.rpc('omitir_paso_solicitud', {
      p_paso_id: pasoId,
      p_motivo: trimText(motivo),
    });
    if (error) throw error;
    return data;
  },

  // Motivo OBLIGATORIO (≤ 500). Solo desde 'abierta'.
  async cancelarSolicitud(solicitudId, motivo) {
    const { data, error } = await getClient().database.rpc('cancelar_solicitud', {
      p_solicitud_id: solicitudId,
      p_motivo: trimText(motivo),
    });
    if (error) throw error;
    return data;
  },

  // El ticket debe tener empleado vinculado. No cambia el estado del ticket.
  async convertirTicketEnSolicitud(ticketId, tipo, nota = null) {
    const { data, error } = await getClient().database.rpc('convertir_ticket_en_solicitud', {
      p_ticket_id: ticketId,
      p_tipo: tipo,
      p_nota: trimText(nota),
    });
    if (error) throw error;
    return data;
  },
};
