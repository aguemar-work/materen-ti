// Dominio equipos: inventario, asignaciones a personas/ubicaciones,
// devoluciones, fotos y hoja de vida (eventos).
import { getClient } from '../client.js';
import { entregarQuery } from '../entregarQuery.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { toTitleCase, trimText, fechaLocalISO } from '../../core/formatters.js';
import { archivoABase64 } from '../../core/imagenes.js';

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

async function idsEquiposConAsignacionActiva(filtro = {}) {
  let q = getClient().database
    .from('asignaciones_equipo')
    .select('equipo_id')
    .is('fecha_fin', null);
  if (filtro.empleado_id) q = q.not('empleado_id', 'is', null);
  if (filtro.ubicacion_id) q = q.not('ubicacion_id', 'is', null);
  const { data, error } = await q;
  if (error) throw error;
  return [...new Set((data || []).map((a) => a.equipo_id))];
}

function aplicarFiltroSituacion(query, situacion) {
  if (!situacion) return query;
  if (['en_reparacion', 'de_baja', 'perdido'].includes(situacion)) {
    return query.eq('estado', situacion);
  }
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

async function queryEquipos({ q = '', tipoId = '', situacion = '', orden } = {}, { conteo = false } = {}) {
  let query = getClient().database
    .from('equipos')
    .select(SELECT_EQUIPO, conteo ? { count: 'exact' } : undefined)
    .is('deleted_at', null);
  if (tipoId) query = query.eq('tipo_id', tipoId);
  const filtrado = aplicarFiltroSituacion(query, situacion);
  if (filtrado !== null) {
    query = filtrado;
  } else if (situacion === 'disponible') {
    const ocupados = await idsEquiposConAsignacionActiva();
    query = query.eq('estado', 'operativo');
    if (ocupados.length) query = query.not('id', 'in', `(${ocupados.join(',')})`);
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
  async listEquiposPage({ pagina = 1, tamPagina = 20, q = '', tipoId = '', situacion = '', orden } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const { qb } = await queryEquipos({ q, tipoId, situacion, orden }, { conteo: true });
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

  // Mover a una ubicación. Solo si está libre o en otra ubicación:
  // si lo tiene una PERSONA, se exige registrar la devolución primero.
  async moverEquipo(equipoId, ubicacionId) {
    const db = getClient().database;
    // Antes `this.asignacionActivaEquipo`: se referencia el propio objeto del dominio.
    const activa = await equiposApi.asignacionActivaEquipo(equipoId);
    if (activa?.empleado_id) {
      throw new Error('El equipo lo tiene una persona. Registra la devolución antes de moverlo.');
    }
    if (activa) {
      const { error: e1 } = await db
        .from('asignaciones_equipo')
        .update({ fecha_fin: fechaLocalISO(), motivo_cierre: 'movimiento' })
        .eq('id', activa.id);
      if (e1) throw e1;
    }
    const { error: e2 } = await db
      .from('asignaciones_equipo')
      // fecha_inicio explícito: el default `current_date` de la columna
      // corre en el servidor (GMT) y sufre el mismo corte de T-01 pasadas
      // las 19:00 hora Perú si se deja implícito.
      .insert([{ equipo_id: equipoId, ubicacion_id: ubicacionId, fecha_inicio: fechaLocalISO() }]);
    if (e2) throw e2;
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

  async asignarEquipo(equipoId, empleadoId, condicionEntrega) {
    const db = getClient().database;
    // Si está en una ubicación (almacén, área...), se retira de ahí
    // automáticamente. Si lo tiene otra persona, el trigger lo bloquea.
    // Antes `this.asignacionActivaEquipo`: se referencia el propio objeto del dominio.
    const activa = await equiposApi.asignacionActivaEquipo(equipoId);
    if (activa?.ubicacion_id) {
      const { error: e0 } = await db
        .from('asignaciones_equipo')
        .update({ fecha_fin: fechaLocalISO(), motivo_cierre: 'entrega a empleado' })
        .eq('id', activa.id);
      if (e0) throw e0;
    }
    const { error } = await db
      .from('asignaciones_equipo')
      .insert([{
        equipo_id: equipoId,
        empleado_id: empleadoId,
        fecha_inicio: fechaLocalISO(),
        condicion_entrega: trimText(condicionEntrega),
      }]);
    if (error) throw error;
  },

  // Devolución física: cierra la asignación y, si volvió dañado,
  // pasa el equipo a reparación en el mismo acto
  async devolverEquipo(asignacionId, equipoId, { condicion, motivo, aReparacion }) {
    const db = getClient().database;
    const { error: e1 } = await db
      .from('asignaciones_equipo')
      .update({
        fecha_fin: fechaLocalISO(),
        condicion_devolucion: trimText(condicion),
        motivo_cierre: motivo || 'devolucion',
      })
      .eq('id', asignacionId)
      .is('fecha_fin', null);
    if (e1) throw e1;

    // Pérdida/robo prevalece sobre "volvió dañado": si el equipo ya no está
    // en posesión de la empresa, no tiene sentido marcarlo en reparación.
    if (motivo === 'perdida') {
      const { error: e2 } = await db
        .from('equipos')
        .update({ estado: 'perdido' })
        .eq('id', equipoId);
      if (e2) throw e2;
    } else if (aReparacion) {
      const { error: e2 } = await db
        .from('equipos')
        .update({ estado: 'en_reparacion' })
        .eq('id', equipoId);
      if (e2) throw e2;
    }
  },

  // Fotos: se suben comprimidas al bucket público "equipos-fotos", pero ya
  // no directo desde el navegador — pasan por la edge function
  // "equipos-fotos" (2026-08-17, verificación de auditoría externa), que
  // valida el contenido real (magic bytes) y el tamaño en servidor antes
  // de subir. `comprimirImagen()` (core/imagenes.js) sigue siendo la
  // primera línea de defensa en cliente, no la única.
  // Guardar SIEMPRE {url, key}: la key hace posible eliminarlas después.
  async subirFotoEquipo(file) {
    const contenidoBase64 = await archivoABase64(file);
    const { data, error } = await getClient().functions.invoke('equipos-fotos', {
      body: { action: 'subirFoto', contenidoBase64 },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(`No se pudo subir la foto (${data?.code || 'error'})`);
    return { url: data.url, key: data.key };
  },

  async eliminarFotoEquipo(key) {
    const { data, error } = await getClient().functions.invoke('equipos-fotos', {
      body: { action: 'eliminarFoto', key },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(`No se pudo eliminar la foto (${data?.code || 'error'})`);
  },

  async eventosEquipo(equipoId) {
    const { data, error } = await getClient().database
      .from('eventos_equipo')
      .select('id, evento, detalle, user_email, created_at')
      .eq('equipo_id', equipoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
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
