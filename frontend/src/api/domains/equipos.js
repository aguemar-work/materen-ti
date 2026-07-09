// Dominio equipos: inventario, asignaciones a personas/ubicaciones,
// devoluciones, fotos y hoja de vida (eventos).
import { getClient } from '../client.js';
import { toTitleCase, trimText } from '../../core/formatters.js';

export const equiposApi = {
  async listEquipos() {
    const { data, error } = await getClient().database
      .from('equipos')
      .select(`
        id, codigo, tipo_id, marca, modelo, serie, empresa_id, estado,
        fecha_compra, costo, moneda, garantia_hasta, specs, accesorios, fotos, notas,
        tipos_equipo(nombre),
        empresas(nombre),
        asignaciones_equipo(id, fecha_fin, fecha_inicio, empleado_id, ubicacion_id, condicion_entrega, empleados(nombres, apellidos, estado), ubicaciones(nombre))
      `)
      .is('deleted_at', null)
      .order('codigo', { ascending: true });
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
        .update({ fecha_fin: new Date().toISOString().split('T')[0], motivo_cierre: 'movimiento' })
        .eq('id', activa.id);
      if (e1) throw e1;
    }
    const { error: e2 } = await db
      .from('asignaciones_equipo')
      .insert([{ equipo_id: equipoId, ubicacion_id: ubicacionId }]);
    if (e2) throw e2;
  },

  async createEquipo(datos) {
    const { error } = await getClient().database
      .from('equipos')
      .insert([equipoToRow(datos)]);
    if (error) throw error;
  },

  async updateEquipo(id, datos) {
    const { error } = await getClient().database
      .from('equipos')
      .update(equipoToRow(datos))
      .eq('id', id);
    if (error) throw error;
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
        .update({ fecha_fin: new Date().toISOString().split('T')[0], motivo_cierre: 'entrega a empleado' })
        .eq('id', activa.id);
      if (e0) throw e0;
    }
    const { error } = await db
      .from('asignaciones_equipo')
      .insert([{
        equipo_id: equipoId,
        empleado_id: empleadoId,
        fecha_inicio: new Date().toISOString().split('T')[0],
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
        fecha_fin: new Date().toISOString().split('T')[0],
        condicion_devolucion: trimText(condicion),
        motivo_cierre: motivo || 'devolucion',
      })
      .eq('id', asignacionId)
      .is('fecha_fin', null);
    if (e1) throw e1;

    if (aReparacion) {
      const { error: e2 } = await db
        .from('equipos')
        .update({ estado: 'en_reparacion' })
        .eq('id', equipoId);
      if (e2) throw e2;
    }
  },

  // Fotos: se suben comprimidas al bucket público "equipos-fotos".
  // Guardar SIEMPRE {url, key}: la key hace posible eliminarlas después.
  async subirFotoEquipo(file) {
    const { data, error } = await getClient().storage
      .from('equipos-fotos')
      .uploadAuto(file);
    if (error) throw error;
    return { url: data.url, key: data.key };
  },

  async eliminarFotoEquipo(key) {
    const { error } = await getClient().storage
      .from('equipos-fotos')
      .remove(key);
    if (error) throw error;
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
    id: row.id,
    codigo: row.codigo,
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
    accesorios: row.accesorios || [],
    fotos: row.fotos || [],
    notas: row.notas || '',
    fecha_asignacion: activa?.fecha_inicio || null,
    condicion_entrega: activa?.condicion_entrega || '',
  };
}

function equipoToRow(datos) {
  return {
    codigo: trimText(datos.codigo)?.toUpperCase(),
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
    accesorios: datos.accesorios || [],
    fotos: datos.fotos || [],
    notas: trimText(datos.notas),
  };
}
