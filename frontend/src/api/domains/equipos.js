// Dominio equipos: inventario, asignaciones a personas/ubicaciones,
// devoluciones, fotos y hoja de vida (eventos).
import { getClient } from '../client.js';
import { crearInvocador } from '../invocarFuncion.js';
import { entregarQuery } from '../entregarQuery.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { toTitleCase, trimText } from '../../core/formatters.js';
import { archivoABase64 } from '../../core/imagenes.js';
import { anotarErrorDb } from '../erroresDb.js';

// Fotos: única vía a la edge function "equipos-fotos", por crearInvocador
// (api/invocarFuncion.js) igual que passwords.js/ticketsPublicos.js/
// encuestaPublica.js — antes este archivo llamaba functions.invoke() a mano y
// se quedaba sin el reintento tras el fallback de "sin conexión" y sin mapa
// de códigos → mensaje. Lo propio del dominio es solo ese mapa.
const invocarFotos = crearInvocador('equipos-fotos', mensajeErrorFotos);

function mensajeErrorFotos(code) {
  const mensajes = {
    no_autenticado: 'Sesión expirada — vuelva a iniciar sesión',
    no_es_staff: 'Sin permisos para esta acción',
    no_autorizado: 'Sin permiso sobre el módulo Equipos',
    archivo_requerido: 'Seleccione una imagen',
    archivo_invalido: 'El archivo no es válido: use una imagen JPG, PNG, GIF o WebP (las actas, solo PDF)',
    // Actas firmadas (acciones subirActa / urlActa, migración 110)
    archivo_muy_grande: 'El acta supera el tope de 10 MB. Escanéela con menor resolución.',
    asignacion_invalida: 'La asignación no admite esta acta (debe ser a una persona y, para la devolución, estar cerrada)',
    fecha_invalida: 'La fecha de firma no es válida o es futura',
    no_existe: 'El registro no existe o ya no está vigente',
    error_url: 'No se pudo generar el enlace al acta. Intente de nuevo.',
    // limite_fotos: el tope real lo aplica el servidor sobre las fotos YA
    // guardadas del equipo. La segunda frase cubre el único caso en que el
    // contador del formulario y el del servidor pueden discrepar: quitar
    // fotos y agregar otras sin guardar en medio (ver el comentario de
    // MAX_FOTOS_POR_EQUIPO en functions/equipos-fotos.ts).
    limite_fotos: 'Máximo 4 fotos por equipo. Si acaba de quitar fotos, guarde los cambios antes de agregar otras.',
    key_invalida: 'Referencia de foto inválida',
    error_subiendo: 'No se pudo subir la foto',
    error_eliminando: 'No se pudo eliminar la foto',
    demasiados_intentos: 'Demasiadas operaciones con fotos en poco tiempo. Espere unos minutos e intente de nuevo.',
  };
  return mensajes[code] || `Error de fotos de equipo (${code || 'desconocido'})`;
}

// Columnas de "equipos" ordenables desde la tabla (excluye tipo/empresa,
// que vienen de joins, y situación/asignado a, que son calculados).
const ORDEN_COLUMNAS = ['codigo', 'codigo_almacen', 'marca', 'modelo', 'serie', 'estado'];
const ORDEN_DEFECTO = { columna: 'codigo', ascending: true };

const SELECT_EQUIPO = `
  id, codigo, codigo_almacen, tipo_id, marca, modelo, serie, empresa_id, estado,
  fecha_compra, costo, moneda, garantia_hasta, specs, accesorios, fotos, notas,
  tipos_equipo(nombre),
  empresas(nombre),
  equipo_accesorios(id, catalogo_id, codigo, descripcion, cantidad, orden),
  asignaciones_equipo(id, fecha_fin, fecha_inicio, empleado_id, ubicacion_id, condicion_entrega, empleados(nombres, apellidos, estado), ubicaciones(nombre))
`;

function aplicarFiltroSituacion(query, situacion) {
  if (!situacion) return query;
  if (['en_reparacion', 'de_baja', 'perdido'].includes(situacion)) {
    return query.eq('estado', situacion);
  }
  // Vista "Fuera de servicio" (V2): dados de baja + robados/perdidos juntos —
  // los dos significan "este equipo ya no se puede entregar".
  if (situacion === 'fuera') return query.in('estado', ['de_baja', 'perdido']);
  if (situacion === 'asignado') {
    return query
      .eq('estado', 'operativo')
      .not('asignaciones_equipo.empleado_id', 'is', null)
      .is('asignaciones_equipo.fecha_fin', null);
  }
  if (situacion === 'en_ubicacion') {
    return query
      .eq('estado', 'operativo')
      .not('asignaciones_equipo.ubicacion_id', 'is', null)
      .is('asignaciones_equipo.fecha_fin', null);
  }
  return null;
}

// Dimensiones (V2, chips de AppFiltros): varios valores por dimensión con
// `.in()` — O dentro de la dimensión, Y entre dimensiones.
async function queryEquipos({
  q = '', tipoIds = [], empresaIds = [], situacion = '', orden,
} = {}, { conteo = false } = {}) {
  let query = getClient().database
    .from('equipos')
    .select(SELECT_EQUIPO, conteo ? { count: 'exact' } : undefined)
    .is('deleted_at', null);
  if (tipoIds.length) query = query.in('tipo_id', tipoIds);
  if (empresaIds.length) query = query.in('empresa_id', empresaIds);
  const filtrado = aplicarFiltroSituacion(query, situacion);
  if (filtrado !== null) {
    query = filtrado;
  } else if (situacion === 'disponible') {
    // Antes: traer a JS el equipo_id de TODA asignación activa y armar un
    // filtro `not.in.(uuid,uuid,...)` — con inventario suficiente (medido:
    // 197 equipos ocupados en producción) la URL supera el límite de
    // PostgREST y responde 414 URI Too Long. equipos.tiene_asignacion_activa
    // (migración 085) es la relación directa con asignaciones_equipo ya
    // resuelta en el servidor por trigger — nunca por el cliente, sigue
    // siendo derivada, no un estado que este archivo decida — así que el
    // filtro es una sola columna real, sin lista de IDs en la URL.
    query = query.eq('estado', 'operativo').eq('tiene_asignacion_activa', false);
  }
  const qSafe = sanitizarTermino(q);
  if (qSafe.length >= 2) {
    const db = getClient().database;
    let idClause = '';
    const { data: emps } = await db.from('empleados').select('id')
      .or(`nombres.ilike.%${qSafe}%,apellidos.ilike.%${qSafe}%`)
      .limit(50);
    if (emps?.length) {
      const { data: asigs } = await db.from('asignaciones_equipo').select('equipo_id')
        .in('empleado_id', emps.map((e) => e.id))
        .is('fecha_fin', null);
      if (asigs?.length) {
        const ids = [...new Set(asigs.map((a) => a.equipo_id))];
        idClause += `,id.in.(${ids.join(',')})`;
      }
    }
    const { data: ubs } = await db.from('ubicaciones').select('id')
      .ilike('nombre', `%${qSafe}%`)
      .limit(30);
    if (ubs?.length) {
      const { data: asigsUb } = await db.from('asignaciones_equipo').select('equipo_id')
        .in('ubicacion_id', ubs.map((u) => u.id))
        .is('fecha_fin', null);
      if (asigsUb?.length) {
        const idsUb = [...new Set(asigsUb.map((a) => a.equipo_id))];
        idClause += `,id.in.(${idsUb.join(',')})`;
      }
    }
    query = query.or(`codigo.ilike.%${qSafe}%,codigo_almacen.ilike.%${qSafe}%,marca.ilike.%${qSafe}%,modelo.ilike.%${qSafe}%,serie.ilike.%${qSafe}%${idClause}`);
  }
  const { columna, ascending } = ordenValido(orden, ORDEN_COLUMNAS, ORDEN_DEFECTO);
  return entregarQuery(query.order(columna, { ascending }));
}

export const equiposApi = {
  // KPI de disponibilidad (Plan Maestro v2, Frente 4): cuántos equipos hay
  // en cada situación AHORA MISMO, sobre todo el inventario — independiente
  // de los filtros del toolbar (la pregunta es "¿qué tengo listo para
  // entregar?", no "¿qué estoy viendo en esta página?"). Reusa la misma
  // `queryEquipos()` y el mismo filtro por situación que ya arma el
  // `<select>` del toolbar; `.range(0, 0)` pide 0 filas de datos y se queda
  // solo con el `count` exacto de PostgREST.
  //
  // V2: una cifra por VISTA de la lista (Todos, Libres, Con personas, En
  // ubicaciones, En reparación, Fuera de servicio), con el RESTO de los
  // filtros aplicados (búsqueda y chips) — el número de cada pestaña dice
  // cuántas filas va a mostrar al elegirla. Reemplaza a las 3 tarjetas KPI,
  // que filtraban la misma "situación" que el select del toolbar: ahora hay
  // una sola forma de hacerlo.
  async conteosEquiposPorSituacion(filtros = {}) {
    const situaciones = ['', 'disponible', 'asignado', 'en_ubicacion', 'en_reparacion', 'fuera'];
    const resultados = await Promise.all(
      situaciones.map(async (situacion) => {
        const { qb } = await queryEquipos({ ...filtros, situacion }, { conteo: true });
        const { count, error } = await qb.range(0, 0);
        if (error) throw error;
        return [situacion || 'todos', count ?? 0];
      }),
    );
    return Object.fromEntries(resultados);
  },

  async listEquiposPage({ pagina = 1, tamPagina = 20, orden, ...filtros } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const { qb } = await queryEquipos({ ...filtros, orden }, { conteo: true });
    const { data, count, error } = await qb.range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapEquipo), total: count ?? 0 };
  },

  async listEquiposFiltrados(filtros = {}) {
    const { qb } = await queryEquipos(filtros);
    const { data, error } = await qb;
    if (error) throw error;
    return (data || []).map(mapEquipo);
  },

  async listEquipos() {
    const { qb } = await queryEquipos();
    const { data, error } = await qb;
    if (error) throw error;
    return (data || []).map(mapEquipo);
  },

  // Asignación activa de un equipo (persona o ubicación), o null
  async asignacionActivaEquipo(equipoId) {
    const { data, error } = await getClient().database
      .from('asignaciones_equipo')
      .select('id, empleado_id, ubicacion_id')
      .eq('equipo_id', equipoId)
      .is('fecha_fin', null)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // Mover a una ubicación: RPC mover_equipo (migración 101). Todo en una
  // transacción en el servidor: si lo tiene una PERSONA se rechaza (P0001,
  // "registre la devolución antes de moverlo"); si estaba en otra ubicación,
  // esa asignación se cierra con motivo 'movimiento'. Devuelve la asignación
  // nueva (la de ubicación). Un error sale ya traducido (api/erroresDb.js).
  async moverEquipo(equipoId, ubicacionId) {
    const { data, error } = await getClient().database.rpc('mover_equipo', {
      p_equipo_id: equipoId,
      p_ubicacion_id: ubicacionId,
    });
    if (error) throw anotarErrorDb(error, { entidad: 'equipo' });
    return data;
  },

  async createEquipo(datos) {
    const lineas = normalizarLineasAccesorios(datos.accesorios_lineas ?? datos.accesorios);
    const { data, error } = await getClient().database
      .from('equipos')
      .insert([{ ...equipoToRow(datos), accesorios: etiquetasDesdeLineas(lineas) }])
      .select('id')
      .single();
    if (error) throw error;
    await reemplazarAccesoriosEquipo(data.id, lineas);
    return data;
  },

  async updateEquipo(id, datos) {
    const lineas = normalizarLineasAccesorios(datos.accesorios_lineas ?? datos.accesorios);
    const { error } = await getClient().database
      .from('equipos')
      .update({ ...equipoToRow(datos), accesorios: etiquetasDesdeLineas(lineas) })
      .eq('id', id);
    if (error) throw error;
    await reemplazarAccesoriosEquipo(id, lineas);
  },

  // Cambio de estado físico (el trigger registra el evento en la hoja de vida)
  async cambiarEstadoEquipo(id, estado) {
    const { error } = await getClient().database
      .from('equipos')
      .update({ estado })
      .eq('id', id);
    if (error) throw error;
  },

  async softDeleteEquipo(id) {
    const { error } = await getClient().database
      .from('equipos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // Entrega a una persona: RPC asignar_equipo (migración 101). Si estaba en
  // una ubicación se retira de allí; si lo tiene otra persona o no está
  // operativo, el servidor rechaza con P0001 (mensaje en español). Devuelve la
  // fila de asignaciones_equipo creada (su `id` es lo que necesita el acta).
  async asignarEquipo(equipoId, empleadoId, condicionEntrega) {
    const { data, error } = await getClient().database.rpc('asignar_equipo', {
      p_equipo_id: equipoId,
      p_empleado_id: empleadoId,
      p_condicion_entrega: trimText(condicionEntrega) || null,
    });
    if (error) throw anotarErrorDb(error, { entidad: 'equipo' });
    return data;
  },

  // Devolución física: RPC devolver_equipo (migración 101). Cierra la
  // asignación y, según el motivo (pérdida/robo → 'perdido') o `aReparacion`,
  // cambia el estado del equipo, todo en una transacción. `_equipoId` se
  // conserva en la firma por los llamadores existentes; el servidor lo deduce
  // de la asignación. Devuelve la fila de `equipos` ya actualizada.
  async devolverEquipo(asignacionId, _equipoId, { condicion, motivo, aReparacion } = {}) {
    const { data, error } = await getClient().database.rpc('devolver_equipo', {
      p_asignacion_id: asignacionId,
      p_condicion: trimText(condicion) || null,
      p_motivo: motivo || 'devolucion',
      p_a_reparacion: !!aReparacion,
    });
    if (error) throw anotarErrorDb(error, { entidad: 'equipo' });
    return data;
  },

  // Conciliación física (plan §3.6): deja el evento `verificado` en el kardex
  // con actor y fecha. No mueve ni cambia nada del equipo. `ubicacionId` =
  // dónde se encontró (opcional). Devuelve la fila de eventos_equipo.
  async verificarEquipo(equipoId, { ubicacionId = null, nota = '' } = {}) {
    const { data, error } = await getClient().database.rpc('verificar_equipo', {
      p_equipo_id: equipoId,
      p_ubicacion_id: ubicacionId || null,
      p_nota: trimText(nota) || null,
    });
    if (error) throw anotarErrorDb(error, { entidad: 'equipo' });
    return data;
  },

  // Un equipo por id con el mismo shape que las filas del listado, o `null`
  // si no existe o está eliminado (la vista distingue "no encontrado" de un
  // error de red porque este último SÍ lanza).
  async getEquipo(id) {
    const { data, error } = await getClient().database
      .from('equipos')
      .select(SELECT_EQUIPO)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? mapEquipo(data) : null;
  },

  // Resuelve un código de inventario (el que codifica el QR de la etiqueta) a
  // {id, codigo}. La RLS decide qué ve cada sesión; `null` si no hay
  // coincidencia visible. Los códigos se guardan en mayúsculas.
  async buscarEquipoPorCodigo(codigo) {
    const limpio = String(codigo || '').trim().toUpperCase();
    if (!limpio) return null;
    const { data, error } = await getClient().database
      .from('equipos')
      .select('id, codigo')
      .eq('codigo', limpio)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  },

  // Varios equipos por id (hoja de etiquetas). En tandas: una lista larga de
  // uuid en la URL de PostgREST revienta con 414 (mismo límite que documenta
  // queryEquipos). Conserva el orden pedido.
  async listEquiposPorIds(ids) {
    const unicos = [...new Set((ids || []).filter(Boolean))];
    const TANDA = 40;
    const filas = [];
    for (let i = 0; i < unicos.length; i += TANDA) {
      const { data, error } = await getClient().database
        .from('equipos')
        .select(SELECT_EQUIPO)
        .in('id', unicos.slice(i, i + TANDA))
        .is('deleted_at', null);
      if (error) throw error;
      filas.push(...(data || []).map(mapEquipo));
    }
    const porId = new Map(filas.map((e) => [e.id, e]));
    return unicos.map((id) => porId.get(id)).filter(Boolean);
  },

  // Persiste SOLO la lista de fotos ({url, key}) de un equipo ya guardado: la
  // hoja de vida sube y quita fotos sin pasar por el formulario completo.
  async guardarFotosEquipo(id, fotos) {
    const { error } = await getClient().database
      .from('equipos')
      .update({ fotos: fotos || [] })
      .eq('id', id);
    if (error) throw error;
  },

  // Fotos: se suben comprimidas al bucket público "equipos-fotos", pero ya
  // no directo desde el navegador — pasan por la edge function
  // "equipos-fotos" (2026-08-17, verificación de auditoría externa), que
  // valida el contenido real (magic bytes) y el tamaño en servidor antes
  // de subir. `comprimirImagen()` (core/imagenes.js) sigue siendo la
  // primera línea de defensa en cliente, no la única.
  // Guardar SIEMPRE {url, key}: la key hace posible eliminarlas después.
  //
  // equipoId (solo en edición; en un equipo nuevo todavía no existe): lo usa
  // el tope de cantidad server-side de la edge function (MAX_FOTOS_POR_EQUIPO,
  // 2026-08-31) para contar las fotos ya guardadas en `equipos.fotos`. El
  // `MAX_FOTOS` de EquipoForm.vue sigue siendo lo que oculta el botón; esto
  // es lo que hace que el tope no sea solo de cliente.
  async subirFotoEquipo(file, equipoId = null) {
    const contenidoBase64 = await archivoABase64(file);
    const data = await invocarFotos({ action: 'subirFoto', contenidoBase64, equipoId });
    return { url: data.url, key: data.key };
  },

  async eliminarFotoEquipo(key) {
    await invocarFotos({ action: 'eliminarFoto', key });
  },

  async eventosEquipo(equipoId) {
    const { data, error } = await getClient().database
      .from('eventos_equipo')
      .select('id, evento, detalle, user_id, user_email, created_at')
      .eq('equipo_id', equipoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Asignaciones (a personas y a ubicaciones) de UN equipo, la más reciente
  // primero: con ellas el kardex enlaza cada entrega/devolución a su acta.
  async asignacionesDeEquipo(equipoId) {
    const { data, error } = await getClient().database
      .from('asignaciones_equipo')
      .select('id, empleado_id, ubicacion_id, fecha_inicio, fecha_fin, condicion_entrega, condicion_devolucion, motivo_cierre, created_at, empleados(nombres, apellidos), ubicaciones(nombre)')
      .eq('equipo_id', equipoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Actas firmadas VIGENTES de un equipo (tabla `actas`, migración 110;
  // PostgREST nunca devuelve la key del PDF). Una por (asignación, tipo).
  async listActasEquipo(equipoId) {
    const { data, error } = await getClient().database
      .from('actas')
      .select('id, asignacion_equipo_id, tipo, empleado_id, equipo_id, tamano_bytes, firmado_at, subido_por, created_at')
      .eq('equipo_id', equipoId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapActa);
  },

  // Sube el acta firmada (PDF) de una asignación: edge function equipos-fotos,
  // acción `subirActa`. `archivo` es un File/Blob PDF (una foto se convierte a
  // PDF en el navegador antes: core/pdfActa.js). Devuelve el acta creada.
  async subirActa({ asignacionId, tipo, archivo, nombre, firmadoAt }) {
    const contenido = await archivoABase64(archivo);
    const data = await invocarFotos({
      action: 'subirActa',
      asignacionId,
      tipo,
      archivo: contenido,
      nombre: nombre || undefined,
      firmadoAt: firmadoAt || undefined,
    });
    // La function no devuelve la asignación (la conoce quien llama): se completa
    // para que la acta nueva reemplace a la anterior de la MISMA asignación y tipo.
    return mapActa({ ...data.acta, asignacionId });
  },

  // URL firmada de corta vida (120 s) para abrir el PDF de un acta. El bucket
  // es privado: solo la function emite la URL, tras comprobar sesión y módulo.
  async urlActa(actaId) {
    const data = await invocarFotos({ action: 'urlActa', actaId });
    return data.url;
  },

  // Últimos movimientos de TODO el inventario (para el reporte PDF, sección
  // "Últimas asignaciones y devoluciones") — a diferencia de eventosEquipo()
  // de arriba, que es la hoja de vida de UN equipo. `detalle` ya trae el
  // texto legible completo (a quién se entregó, de quién se devolvió, motivo)
  // porque lo arma el trigger evento_asignacion_equipo() en el momento del
  // evento (migraciones 013/014) — acá no hay que resolver nada más.
  //
  // Se pide de más (limite * MARGEN) porque algunos eventos pueden ser de
  // equipos ya eliminados (soft-delete) — se descartan después de traerlos,
  // ya que filtrar por una columna de una tabla embebida (equipos.deleted_at)
  // no es una operación confiable de mandar directo en el WHERE de esta
  // consulta. Si el margen no alcanza (muy eliminación reciente y masiva),
  // devuelve menos de `limite` filas — no es crítico, es una lista de
  // actividad reciente, no un total auditado.
  async ultimosMovimientos(limite = 20) {
    const MARGEN = 3;
    const { data, error } = await getClient().database
      .from('eventos_equipo')
      .select('evento, detalle, created_at, equipos(codigo, deleted_at, tipos_equipo(nombre))')
      .in('evento', ['asignado', 'devuelto'])
      .order('created_at', { ascending: false })
      .limit(limite * MARGEN);
    if (error) throw error;
    return (data || [])
      .filter((e) => e.equipos && !e.equipos.deleted_at)
      .slice(0, limite)
      .map((e) => ({
        fecha: e.created_at,
        evento: e.evento,
        detalle: e.detalle || '',
        codigo: e.equipos.codigo,
        tipo: e.equipos.tipos_equipo?.nombre || '',
      }));
  },

  // Equipos que porta un empleado (para la ficha y el resumen de baja)
  async equiposPorEmpleado(empleadoId) {
    const { data, error } = await getClient().database
      .from('asignaciones_equipo')
      .select('id, fecha_inicio, equipos(id, codigo, marca, modelo, estado, deleted_at, tipos_equipo(nombre))')
      .eq('empleado_id', empleadoId)
      .is('fecha_fin', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || [])
      .filter((a) => a.equipos && !a.equipos.deleted_at)
      .map((a) => ({
        asignacion_id: a.id,
        equipo_id: a.equipos.id,
        codigo: a.equipos.codigo,
        tipo: a.equipos.tipos_equipo?.nombre || '',
        marca: a.equipos.marca || '',
        modelo: a.equipos.modelo || '',
        estado: a.equipos.estado,
        // Situación derivada (misma regla que mapEquipo): acá la consulta ya
        // filtra por asignación activa de ESTE empleado, así que operativo
        // solo puede significar "asignado" (no aplica ubicación).
        situacion: a.equipos.estado === 'operativo' ? 'asignado' : a.equipos.estado,
        fecha_inicio: a.fecha_inicio,
      }));
  },
};

// Acta firmada: la tabla (snake_case) y la respuesta de la function
// (camelCase) llegan a la UI con la misma forma.
function mapActa(row) {
  return {
    id: row.id,
    asignacionId: row.asignacion_equipo_id ?? row.asignacionId ?? null,
    tipo: row.tipo,
    empleadoId: row.empleado_id ?? row.empleadoId ?? null,
    equipoId: row.equipo_id ?? row.equipoId ?? null,
    tamanoBytes: row.tamano_bytes ?? row.tamanoBytes ?? null,
    firmadoAt: row.firmado_at ?? row.firmadoAt ?? null,
    creadaEn: row.created_at ?? row.creadaEn ?? null,
  };
}

function mapEquipo(row) {
  const activa = (row.asignaciones_equipo || []).find((a) => !a.fecha_fin);
  const portador = activa?.empleados
    ? `${activa.empleados.nombres} ${activa.empleados.apellidos}`.trim()
    : '';
  const ubicacion = activa?.ubicaciones?.nombre || '';
  // Situación derivada: nunca se guarda, nunca se desincroniza
  let situacion;
  if (row.estado !== 'operativo') situacion = row.estado;
  else if (activa?.empleado_id) situacion = 'asignado';
  else if (activa?.ubicacion_id) situacion = 'en_ubicacion';
  else situacion = 'disponible';
  return {
    ubicacion_nombre: ubicacion,
    ubicacion_id: activa?.ubicacion_id || null,
    id: row.id,
    codigo: row.codigo,
    codigo_almacen: row.codigo_almacen || '',
    tipo_id: row.tipo_id,
    tipo_nombre: row.tipos_equipo?.nombre || row.tipo_id,
    marca: row.marca || '',
    modelo: row.modelo || '',
    serie: row.serie || '',
    empresa_id: row.empresa_id,
    empresa_nombre: row.empresas?.nombre || '',
    estado: row.estado,
    situacion,
    asignacion_id: activa?.id || null,
    empleado_id: activa?.empleado_id || null,
    portador,
    portador_inactivo: activa?.empleados?.estado === 'Inactivo',
    fecha_compra: row.fecha_compra,
    costo: row.costo,
    moneda: row.moneda || '',
    garantia_hasta: row.garantia_hasta,
    specs: row.specs || {},
    ...accesoriosDesdeRow(row),
    fotos: row.fotos || [],
    notas: row.notas || '',
    fecha_asignacion: activa?.fecha_inicio || null,
    condicion_entrega: activa?.condicion_entrega || '',
  };
}

// Fuente de verdad: equipo_accesorios. accesorios[] se mantiene como etiquetas.
function accesoriosDesdeRow(row) {
  const lineas = mapLineasAccesorios(row.equipo_accesorios);
  const final = lineas.length
    ? lineas
    : (row.accesorios || []).map((d) => ({
        catalogo_id: null, codigo: '', descripcion: d, cantidad: 1,
      }));
  return {
    accesorios_lineas: final,
    accesorios: etiquetasDesdeLineas(final),
  };
}

function mapLineasAccesorios(rows) {
  return (rows || [])
    .slice()
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((r) => ({
      id: r.id,
      catalogo_id: r.catalogo_id || null,
      codigo: r.codigo || '',
      descripcion: r.descripcion || '',
      cantidad: r.cantidad ?? 1,
    }));
}

function normalizarLineasAccesorios(raw) {
  if (!Array.isArray(raw)) return [];
  // Compat: array de strings antiguos → líneas sin código
  if (raw.length && typeof raw[0] === 'string') {
    return raw
      .map((d) => String(d || '').trim())
      .filter(Boolean)
      .map((descripcion) => ({
        catalogo_id: null,
        codigo: '',
        descripcion,
        cantidad: 1,
      }));
  }
  return raw
    .map((l) => ({
      catalogo_id: l.catalogo_id || null,
      codigo: trimText(l.codigo)?.toUpperCase() || null,
      descripcion: trimText(l.descripcion) || '',
      cantidad: Math.min(999, Math.max(1, Number(l.cantidad) || 1)),
    }))
    .filter((l) => l.descripcion);
}

function etiquetasDesdeLineas(lineas) {
  return (lineas || []).map((l) => {
    const base = l.descripcion;
    if ((l.cantidad || 1) > 1) return `${base} ×${l.cantidad}`;
    return base;
  });
}

async function reemplazarAccesoriosEquipo(equipoId, lineas) {
  const db = getClient().database;
  const { error: eDel } = await db
    .from('equipo_accesorios')
    .delete()
    .eq('equipo_id', equipoId);
  if (eDel) throw eDel;
  if (!lineas.length) return;
  const { error: eIns } = await db
    .from('equipo_accesorios')
    .insert(lineas.map((l, i) => ({
      equipo_id: equipoId,
      catalogo_id: l.catalogo_id,
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      orden: i,
    })));
  if (eIns) throw eIns;
}

function equipoToRow(datos) {
  return {
    codigo: trimText(datos.codigo)?.toUpperCase(),
    codigo_almacen: trimText(datos.codigo_almacen)?.toUpperCase() || null,
    tipo_id: datos.tipo_id,
    marca: toTitleCase(datos.marca),
    modelo: trimText(datos.modelo),
    serie: trimText(datos.serie),
    empresa_id: datos.empresa_id || null,
    fecha_compra: datos.fecha_compra || null,
    costo: datos.costo === '' || datos.costo == null ? null : Number(datos.costo),
    moneda: datos.costo ? (datos.moneda || 'PEN') : null,
    garantia_hasta: datos.garantia_hasta || null,
    specs: datos.specs || {},
    fotos: datos.fotos || [],
    notas: trimText(datos.notas),
  };
}
