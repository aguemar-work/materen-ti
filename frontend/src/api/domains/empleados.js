// Dominio empleados: fichas, altas/ediciones y el ciclo de vida del empleado
// (baja, suspensión, reactivación, reingreso y revisión de accesos), más las
// lecturas del expediente (hoja de vida, tickets, entregas, actas).
//
// El ciclo de vida corre por RPC de la migración 102 (guard módulo
// `empleados`, 42501 sin permiso, rechazos de negocio P0001 en español): el
// cliente ya no escribe `estado` a mano. Las RPC devuelven la fila cruda de
// `empleados`; acá se relee con los embeds para devolver la forma de siempre
// (`mapEmpleado`). Los errores se relanzan crudos: los traduce quien los
// muestra (api/erroresDb.js).
import { getClient } from '../client.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { trimText } from '../../core/formatters.js';
import { empleadoToRow } from '../empleadoFila.js';
import { equiposApi } from './equipos.js';
import { solicitudesApi } from './solicitudes.js';

// Columnas de "empleados" ordenables desde la tabla (excluye empresa/área,
// que vienen de un join, y los conteos de vínculos, que son calculados).
const ORDEN_COLUMNAS = ['dni', 'apellidos', 'cargo', 'estado', 'fecha_alta'];
const ORDEN_DEFECTO = { columna: 'apellidos', ascending: true };

// area_obra (función/asignación laboral) y ubicacion (lugar físico) son dos
// ejes independientes desde la migración 059 — cada uno su propio embed,
// sin relación entre sí (antes la ubicación salía de areas_obras.ubicacion_id).
const SELECT_EMPLEADO = '*, empresas(nombre), areas_obras(nombre), ubicaciones(nombre)';

// Claves que reingresar_empleado acepta en `p_datos` (migración 102).
const DATOS_REINGRESO = ['area_obra_id', 'ubicacion_id', 'cargo', 'empresa_id'];

// Query base del listado con filtros en servidor. La búsqueda "juan perez"
// se trocea por tokens y cada token debe matchear nombre, apellido o DNI
// (igual que el antiguo filtro en cliente sobre el nombre concatenado).
// OJO: PostgREST NO acepta dos parámetros or= repetidos (PGRST100); el
// AND-de-ORs va anidado en UN solo or=(and(or(...),or(...))) — verificado
// contra el backend real.
//
// Filtros por dimensión (V2, chips de AppFiltros): cada una acepta VARIOS
// valores — `.in()`, O entre valores de la misma dimensión, Y entre
// dimensiones. Todas son columnas propias de `empleados` (sin joins).
function queryEmpleados({
  q = '', estado = '', empresaIds = [], ubicacionIds = [], areaIds = [], orden,
} = {}, { conteo = false, soloConteo = false } = {}) {
  let query = getClient().database
    .from('empleados')
    .select(soloConteo ? 'id' : SELECT_EMPLEADO, conteo || soloConteo ? { count: 'exact' } : undefined)
    .is('deleted_at', null);
  if (estado) query = query.eq('estado', estado);
  if (empresaIds.length) query = query.in('empresa_id', empresaIds);
  if (ubicacionIds.length) query = query.in('ubicacion_id', ubicacionIds);
  if (areaIds.length) query = query.in('area_obra_id', areaIds);
  const qSafe = sanitizarTermino(q);
  if (qSafe.length >= 2) {
    const tokens = qSafe.split(' ');
    const porToken = tokens.map(
      (t) => `or(nombres.ilike.%${t}%,apellidos.ilike.%${t}%,dni.ilike.%${t}%)`,
    );
    query = query.or(tokens.length === 1
      ? `nombres.ilike.%${qSafe}%,apellidos.ilike.%${qSafe}%,dni.ilike.%${qSafe}%`
      : `and(${porToken.join(',')})`);
  }
  const { columna, ascending } = ordenValido(orden, ORDEN_COLUMNAS, ORDEN_DEFECTO);
  return query.order(columna, { ascending });
}

export const empleadosApi = {
  // ── Listado paginado en servidor (la tabla principal) ─────────
  // listEmpleados() (completo) sigue existiendo para selects de formularios.
  async listEmpleadosPage({ pagina = 1, tamPagina = 20, orden, ...filtros } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const { data, count, error } = await queryEmpleados({ ...filtros, orden }, { conteo: true })
      .range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapEmpleado), total: count ?? 0 };
  },

  // Conteo de cada vista (Activos/Inactivos/Suspendidos/Todos) con el RESTO
  // de los filtros aplicados (búsqueda y chips): el número de cada pestaña
  // dice exactamente cuántas filas va a mostrar al elegirla. Solo `count`
  // exacto, cero filas de datos.
  async conteosEmpleadosPorEstado(filtros = {}) {
    const estados = ['Activo', 'Inactivo', 'Suspendido', ''];
    const counts = await Promise.all(estados.map(async (estado) => {
      const { count, error } = await queryEmpleados({ ...filtros, estado }, { soloConteo: true }).range(0, 0);
      if (error) throw error;
      return count ?? 0;
    }));
    return { Activo: counts[0], Inactivo: counts[1], Suspendido: counts[2], todos: counts[3] };
  },

  async listEmpleados() {
    const { data, error } = await getClient().database
      .from('empleados')
      .select(SELECT_EMPLEADO)
      .is('deleted_at', null)
      .order('apellidos', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapEmpleado);
  },

  async getEmpleado(id) {
    const { data, error } = await getClient().database
      .from('empleados')
      .select(SELECT_EMPLEADO)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapEmpleado(data) : null;
  },

  // Sin filtro de deleted_at a propósito: el unique de `dni` (migración
  // 002) es global, no parcial, así que un empleado dado de baja también
  // debe detectarse como coincidencia (ej. migración de pre-registro).
  async buscarPorDni(dni) {
    const { data, error } = await getClient().database
      .from('empleados')
      .select(SELECT_EMPLEADO)
      .eq('dni', dni)
      .maybeSingle();
    if (error) throw error;
    return data ? mapEmpleado(data) : null;
  },

  async createEmpleado(datos) {
    const { data, error } = await getClient().database
      .from('empleados')
      .insert([empleadoToRow(datos)])
      .select(SELECT_EMPLEADO)
      .single();
    if (error) throw error;
    return mapEmpleado(data);
  },

  async updateEmpleado(id, datos) {
    // Editar no cambia el estado: eso es suspender/reactivar/reingresar/dar de
    // baja (RPC, migración 102). Mandarlo acá chocaría con la máquina de
    // estados en cuanto se exija el contexto de RPC.
    const fila = empleadoToRow(datos);
    delete fila.estado;
    const { data, error } = await getClient().database
      .from('empleados')
      .update(fila)
      .eq('id', id)
      .select(SELECT_EMPLEADO)
      .single();
    if (error) throw error;
    return mapEmpleado(data);
  },

  async softDeleteEmpleado(id) {
    const { error } = await getClient().database
      .from('empleados')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // Conteo de vínculos activos (cuentas, equipos y licencias) para una página
  // de empleados — queries batch, se ignoran entidades borradas.
  async conteosVinculos(empleadoIds) {
    if (!empleadoIds.length) return {};
    const db = getClient().database;
    const [cuentasRes, equiposRes, licenciasRes] = await Promise.all([
      db.from('asignaciones_cuenta')
        .select('empleado_id, cuentas(deleted_at)')
        .in('empleado_id', empleadoIds)
        .is('fecha_fin', null),
      db.from('asignaciones_equipo')
        .select('empleado_id, equipos(deleted_at)')
        .in('empleado_id', empleadoIds)
        .is('fecha_fin', null),
      db.from('asignaciones_licencia')
        .select('empleado_id, licencias(deleted_at)')
        .in('empleado_id', empleadoIds)
        .is('fecha_fin', null),
    ]);
    if (cuentasRes.error) throw cuentasRes.error;
    if (equiposRes.error) throw equiposRes.error;
    if (licenciasRes.error) throw licenciasRes.error;
    const conteos = Object.fromEntries(
      empleadoIds.map((id) => [id, { cuentas: 0, equipos: 0, licencias: 0 }]),
    );
    for (const a of cuentasRes.data || []) {
      if (a.cuentas && !a.cuentas.deleted_at && conteos[a.empleado_id]) conteos[a.empleado_id].cuentas += 1;
    }
    for (const a of equiposRes.data || []) {
      if (a.equipos && !a.equipos.deleted_at && conteos[a.empleado_id]) conteos[a.empleado_id].equipos += 1;
    }
    for (const a of licenciasRes.data || []) {
      if (a.licencias && !a.licencias.deleted_at && conteos[a.empleado_id]) conteos[a.empleado_id].licencias += 1;
    }
    return conteos;
  },

  // Accesos activos del empleado (cuentas + licencias directas),
  // clasificados para el resumen previo a la baja
  async resumenBaja(empleadoId) {
    const db = getClient().database;
    const [cuentasRes, licenciasRes, equipos] = await Promise.all([
      db.from('asignaciones_cuenta')
        .select('id, cuentas(id, usuario, tipo_cuenta, deleted_at, plataformas(nombre))')
        .eq('empleado_id', empleadoId)
        .is('fecha_fin', null),
      db.from('asignaciones_licencia')
        .select('id, licencias(id, software, deleted_at)')
        .eq('empleado_id', empleadoId)
        .is('fecha_fin', null),
      // Antes `this.equiposPorEmpleado`: el método vive ahora en el dominio equipos.
      equiposApi.equiposPorEmpleado(empleadoId),
    ]);
    if (cuentasRes.error) throw cuentasRes.error;
    if (licenciasRes.error) throw licenciasRes.error;
    return {
      equipos,
      cuentas: (cuentasRes.data || [])
        .filter((a) => a.cuentas && !a.cuentas.deleted_at)
        .map((a) => ({
          asignacion_id: a.id,
          cuenta_id: a.cuentas.id,
          usuario: a.cuentas.usuario,
          tipo_cuenta: a.cuentas.tipo_cuenta || 'personal',
          plataforma: a.cuentas.plataformas?.nombre || '',
        })),
      licencias: (licenciasRes.data || [])
        .filter((a) => a.licencias && !a.licencias.deleted_at)
        .map((a) => ({
          asignacion_id: a.id,
          licencia_id: a.licencias.id,
          software: a.licencias.software,
        })),
    };
  },

  // Baja de empleado (regla de negocio):
  //   - cierra todas sus asignaciones activas
  //   - cuentas personales → se dan de baja junto con el empleado
  //   - reutilizables/compartidas → quedan marcadas "rotar contraseña"
  //     por el trigger de BD al cerrarse la asignación
  //
  // Las 4 escrituras corren atómicas en el servidor vía RPC
  // (dar_baja_empleado, migración 038): antes eran 4 updates secuenciales
  // desde el cliente sin transacción — si el 3.º fallaba (red, pestaña
  // cerrada), el empleado quedaba con asignaciones cerradas pero ACTIVO y
  // con cuentas personales vivas, sin rastro de que la operación quedó a
  // medias (auditoría integral 2026-08-05, hallazgo A-01).
  //
  // `motivo` (opcional, ≤ 500; migración 102) queda en el evento
  // `baja_ejecutada` de la hoja de vida del empleado.
  //
  // Desde la migración 108 la baja crea además la SOLICITUD de baja con sus
  // pasos reales (rotar cada contraseña, recuperar cada equipo): se relee y
  // se devuelve como `solicitud` para que la UI muestre lo que de verdad
  // quedó pendiente en lugar de un checklist de presentación. Si la lectura
  // falla (sin la 108, o sin permiso) `solicitud` es null: la baja ya ocurrió.
  async bajaEmpleado(empleadoId, motivo = null) {
    // Antes `this.resumenBaja`: se referencia el propio objeto del dominio.
    // Se lee ANTES de la baja (foto de qué tenía el empleado al momento de
    // dar de baja, para el resumen que muestra la UI).
    const resumen = await empleadosApi.resumenBaja(empleadoId);

    const { error } = await getClient().database.rpc('dar_baja_empleado', {
      p_empleado_id: empleadoId,
      p_motivo: trimText(motivo),
    });
    if (error) throw error;

    const empleado = await empleadosApi.getEmpleado(empleadoId);
    let solicitud = null;
    try {
      solicitud = await solicitudesApi.solicitudDeBaja(empleadoId);
    } catch {
      /* la baja ya ocurrió; sin la solicitud la UI cae al resumen previo */
    }
    return { empleado, resumen, solicitud };
  },

  // ── Ciclo de vida (migración 102) ─────────────────────────────
  // Suspender: motivo OBLIGATORIO (≤ 500), solo desde Activo. Marca "Rotar
  // contraseña" en las cuentas compartidas/reutilizables sin cerrar nada.
  async suspenderEmpleado(empleadoId, motivo) {
    const { error } = await getClient().database.rpc('suspender_empleado', {
      p_empleado_id: empleadoId,
      p_motivo: trimText(motivo),
    });
    if (error) throw error;
    return empleadosApi.getEmpleado(empleadoId);
  },

  // Reactivar: desde Suspendido o Inactivo (también restaura a un eliminado).
  // No toca fecha_alta. Reemplaza al UPDATE directo de antes.
  async reactivarEmpleado(empleadoId, motivo = null) {
    const { error } = await getClient().database.rpc('reactivar_empleado', {
      p_empleado_id: empleadoId,
      p_motivo: trimText(motivo),
    });
    if (error) throw error;
    return empleadosApi.getEmpleado(empleadoId);
  },

  // Reingresar: solo desde Inactivo. Vuelve a Activo con fecha_alta = hoy.
  // `datos` acepta SOLO area_obra_id, ubicacion_id, cargo y empresa_id: una
  // clave presente con '' limpia el valor (salvo la empresa, obligatoria) y
  // una ausente lo conserva.
  async reingresarEmpleado(empleadoId, datos = {}) {
    const pDatos = {};
    for (const clave of DATOS_REINGRESO) {
      if (datos[clave] !== undefined) pDatos[clave] = datos[clave] ?? '';
    }
    const { error } = await getClient().database.rpc('reingresar_empleado', {
      p_empleado_id: empleadoId,
      p_datos: pDatos,
    });
    if (error) throw error;
    return empleadosApi.getEmpleado(empleadoId);
  },

  // Control periódico de accesos: escribe la fila de `empleado_revisiones_acceso`
  // y el evento `accesos_revisados`. Devuelve la fila de la revisión.
  // `resultado` es un objeto libre (hoy: conteos de lo revisado).
  async registrarRevisionAccesos(empleadoId, resultado = {}, nota = null) {
    const { data, error } = await getClient().database.rpc('registrar_revision_accesos', {
      p_empleado_id: empleadoId,
      p_resultado: resultado || {},
      p_nota: trimText(nota),
    });
    if (error) throw error;
    return data;
  },

  // Última revisión de accesos del empleado, o null si nunca se hizo (vista
  // security_invoker: exige el módulo `empleados`).
  async ultimaRevisionAccesos(empleadoId) {
    const { data, error } = await getClient().database
      .from('v_empleado_ultima_revision_acceso')
      .select('revision_id, revisado_por, revisado_at, resultado, nota')
      .eq('empleado_id', empleadoId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  },

  // ── Lecturas del expediente ───────────────────────────────────
  // Hoja de vida append-only (migración 102). Nunca trae DNI ni valores de
  // contacto. Lo más reciente primero.
  async listEventosEmpleado(empleadoId, limite = 200) {
    const { data, error } = await getClient().database
      .from('empleado_eventos')
      .select('id, empleado_id, evento, campo, valor_anterior, valor_nuevo, user_id, user_email, rol_actor, detalle, created_at')
      .eq('empleado_id', empleadoId)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data || [];
  },

  // Últimos tickets del empleado (módulo `tickets`). Lectura limitada: el
  // expediente muestra un resumen, el listado completo vive en Tickets.
  async ticketsDeEmpleado(empleadoId, limite = 20) {
    const { data, error } = await getClient().database
      .from('tickets')
      .select('id, codigo, titulo, estado, tipo, prioridad, origen, created_at, updated_at')
      .eq('empleado_id', empleadoId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data || [];
  },

  // Entregas de credenciales del empleado (módulo `correos`). El estado
  // (enviada / abierta / vencida) se deriva de viewed_at y expires_at.
  async entregasDeEmpleado(empleadoId, limite = 50) {
    const { data, error } = await getClient().database
      .from('entregas')
      .select('id, created_at, expires_at, viewed_at, created_by')
      .eq('empleado_id', empleadoId)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data || [];
  },

  // Actas firmadas vigentes del empleado (módulo `equipos`, migración 110).
  async actasDeEmpleado(empleadoId) {
    const { data, error } = await getClient().database
      .from('actas')
      .select('id, asignacion_equipo_id, tipo, empleado_id, equipo_id, firmado_at, created_at, deleted_at')
      .eq('empleado_id', empleadoId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Todas las asignaciones de cuenta del empleado, también las cerradas
  // (módulo `correos`): alimentan el libro con "Cuenta asignada/cerrada".
  async historialCuentasEmpleado(empleadoId) {
    const { data, error } = await getClient().database
      .from('asignaciones_cuenta')
      .select('id, cuenta_id, fecha_inicio, fecha_fin, notas, cuentas(usuario, tipo_cuenta, plataformas(nombre))')
      .eq('empleado_id', empleadoId)
      .order('fecha_inicio', { ascending: false });
    if (error) throw error;
    return (data || []).map((a) => ({
      id: a.id,
      cuenta_id: a.cuenta_id,
      fecha_inicio: a.fecha_inicio,
      fecha_fin: a.fecha_fin,
      notas: a.notas || '',
      usuario: a.cuentas?.usuario || '',
      tipo_cuenta: a.cuentas?.tipo_cuenta || 'personal',
      plataforma: a.cuentas?.plataformas?.nombre || '',
    }));
  },

  // Ídem para las licencias directas (módulo `licencias`).
  async historialLicenciasEmpleado(empleadoId) {
    const { data, error } = await getClient().database
      .from('asignaciones_licencia')
      .select('id, licencia_id, fecha_inicio, fecha_fin, licencias(software)')
      .eq('empleado_id', empleadoId)
      .order('fecha_inicio', { ascending: false });
    if (error) throw error;
    return (data || []).map((a) => ({
      id: a.id,
      licencia_id: a.licencia_id,
      fecha_inicio: a.fecha_inicio,
      fecha_fin: a.fecha_fin,
      software: a.licencias?.software || '',
    }));
  },

  // Equipos que pasaron por el empleado (también los ya devueltos) con los
  // eventos de la hoja de vida de CADA equipo (módulo `equipos`). Quedarse con
  // lo ocurrido mientras el equipo estuvo con este empleado lo hace
  // `armarLibroEmpleado` (modules/empleados/libroEmpleado.js), que conoce las
  // fechas de cada asignación.
  async historialEquiposEmpleado(empleadoId) {
    const db = getClient().database;
    const { data: asigs, error } = await db
      .from('asignaciones_equipo')
      .select('id, equipo_id, fecha_inicio, fecha_fin, created_at, motivo_cierre, equipos(codigo, marca, modelo)')
      .eq('empleado_id', empleadoId)
      .order('fecha_inicio', { ascending: false });
    if (error) throw error;
    const asignaciones = (asigs || []).map((a) => ({
      id: a.id,
      equipo_id: a.equipo_id,
      fecha_inicio: a.fecha_inicio,
      fecha_fin: a.fecha_fin,
      created_at: a.created_at,
      motivo_cierre: a.motivo_cierre || null,
      codigo: a.equipos?.codigo || '',
      descripcion: [a.equipos?.marca, a.equipos?.modelo].filter(Boolean).join(' '),
    }));
    const equipoIds = [...new Set(asignaciones.map((a) => a.equipo_id))];
    if (!equipoIds.length) return { asignaciones, eventos: [] };
    const { data: evs, error: e2 } = await db
      .from('eventos_equipo')
      .select('id, equipo_id, evento, detalle, user_email, created_at')
      .in('equipo_id', equipoIds)
      .order('created_at', { ascending: false });
    if (e2) throw e2;
    return { asignaciones, eventos: evs || [] };
  },
};

function mapEmpleado(row) {
  const empresa = row.empresas || {};
  const areaObra = row.areas_obras || {};
  return {
    id: row.id,
    nombres: row.nombres,
    apellidos: row.apellidos,
    dni: row.dni,
    telefono: row.telefono || '',
    whatsapp: row.whatsapp || '',
    correo_personal: row.correo_personal || '',
    cargo: row.cargo || '',
    empresa_id: row.empresa_id,
    empresa_nombre: empresa.nombre || '',
    area_obra_id: row.area_obra_id || '',
    area_obra_nombre: areaObra.nombre || '',
    ubicacion_id: row.ubicacion_id || '',
    ubicacion_nombre: row.ubicaciones?.nombre || '',
    estado: row.estado,
    fecha_alta: row.fecha_alta || '',
    notas: row.notas || '',
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
