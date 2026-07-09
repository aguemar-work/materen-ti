// Dominio dashboard/actividad: búsqueda global, estadísticas, pendientes
// accionables (cuentas, licencias, equipos, tickets) y log de auditoría.
import { getClient } from '../client.js';

export const dashboardApi = {
  // Búsqueda global del panel: empleados, cuentas y equipos en una sola consulta
  async buscarGlobal(query) {
    if (!query || query.trim().length < 2) return { empleados: [], cuentas: [], equipos: [] };
    const q = query.trim().toLowerCase();
    // PostgREST interpreta , . ( ) * : % como sintaxis dentro del string de
    // .or()/.ilike(); se neutralizan para que un término con esos caracteres
    // no pueda alterar el filtro (auditoría H-07). Un buscador de nombres/
    // códigos/DNI no los necesita.
    const qSafe = q.replace(/[,.()*:%\\"]/g, ' ').trim();
    if (qSafe.length < 2) return { empleados: [], cuentas: [], equipos: [] };
    const db = getClient().database;
    const [empRes, cuentasRes, equiposRes] = await Promise.all([
      db.from('empleados')
        .select('id, nombres, apellidos, dni, cargo, estado, empresas(nombre)')
        .is('deleted_at', null)
        .or(`nombres.ilike.%${qSafe}%,apellidos.ilike.%${qSafe}%,dni.ilike.%${qSafe}%`)
        .limit(6),
      db.from('cuentas')
        .select('id, usuario, plataforma_id, tipo_cuenta, plataformas(nombre), asignaciones_cuenta(fecha_fin, empleado_id)')
        .is('deleted_at', null)
        .ilike('usuario', `%${qSafe}%`)
        .limit(6),
      db.from('equipos')
        .select('id, codigo, marca, modelo, serie, tipos_equipo(nombre)')
        .is('deleted_at', null)
        .or(`codigo.ilike.%${qSafe}%,marca.ilike.%${qSafe}%,modelo.ilike.%${qSafe}%,serie.ilike.%${qSafe}%`)
        .limit(6),
    ]);
    return {
      empleados: (empRes.data || []).map((e) => ({
        id: e.id, nombres: e.nombres, apellidos: e.apellidos,
        dni: e.dni, cargo: e.cargo, estado: e.estado,
        empresa_nombre: e.empresas?.nombre || '',
      })),
      cuentas: (cuentasRes.data || []).map((c) => ({
        id: c.id, usuario: c.usuario,
        plataforma_nombre: c.plataformas?.nombre || c.plataforma_id,
        tipo_cuenta: c.tipo_cuenta,
        // titular activo: para llevar a su ficha desde el resultado
        titular_id: (c.asignaciones_cuenta || []).find((a) => !a.fecha_fin)?.empleado_id || null,
      })),
      equipos: (equiposRes.data || []).map((e) => ({
        id: e.id, codigo: e.codigo,
        descripcion: `${e.tipos_equipo?.nombre || ''} ${e.marca || ''} ${e.modelo || ''}`.trim(),
        serie: e.serie || '',
      })),
    };
  },

  async getEstadisticas() {
    const db = getClient().database;
    const [empRes, asigRes, compartidaRes, reutilizableRes, sinPwRes, rotacionRes, licVencenRes] = await Promise.all([
      db.from('empleados').select('id, estado').is('deleted_at', null),
      db.from('asignaciones_cuenta').select('id, cuenta_id').is('fecha_fin', null),
      db.from('cuentas').select('id').eq('tipo_cuenta', 'compartida').is('deleted_at', null),
      db.from('cuentas').select('id').eq('tipo_cuenta', 'reutilizable').is('deleted_at', null),
      db.from('cuentas').select('id').is('password', null).is('deleted_at', null),
      db.from('cuentas').select('id').eq('requiere_rotacion', true).is('deleted_at', null),
      db.from('licencias').select('id')
        .lte('fecha_vencimiento', fechaEnDias(30))
        .is('deleted_at', null),
    ]);

    const ocupadas = new Set((asigRes.data || []).map((a) => a.cuenta_id));
    const reutilizablesLibres = (reutilizableRes.data || []).filter((c) => !ocupadas.has(c.id)).length;

    return {
      empleadosActivos: (empRes.data || []).filter((e) => e.estado === 'Activo').length,
      empleadosTotal: (empRes.data || []).length,
      cuentasAsignadas: (asigRes.data || []).length,
      correosCompartidos: (compartidaRes.data || []).length,
      reutilizablesLibres,
      cuentasSinPassword: (sinPwRes.data || []).length,
      cuentasPorRotar: (rotacionRes.data || []).length,
      licenciasPorVencer: (licVencenRes.data || []).length,
    };
  },

  // Pendientes accionables del dashboard: cuentas por rotar, sin contraseña
  // y licencias que vencen en los próximos 30 días
  async listPendientes() {
    const db = getClient().database;
    const select = 'id, usuario, tipo_cuenta, plataformas(nombre), asignaciones_cuenta(fecha_fin, empleado_id, empleados(nombres, apellidos))';
    const [rotarRes, sinPwRes, licRes, equiposRes, garantiaRes] = await Promise.all([
      db.from('cuentas').select(select).eq('requiere_rotacion', true).is('deleted_at', null),
      db.from('cuentas').select(select).is('password', null).is('deleted_at', null),
      db.from('licencias')
        .select('id, software, cantidad, fecha_vencimiento, empresas(nombre)')
        .lte('fecha_vencimiento', fechaEnDias(30))
        .is('deleted_at', null)
        .order('fecha_vencimiento', { ascending: true }),
      db.from('asignaciones_equipo')
        .select('id, equipos(id, codigo, marca, modelo, deleted_at), empleados(id, nombres, apellidos, estado)')
        .is('fecha_fin', null),
      db.from('equipos')
        .select('id, codigo, marca, modelo, garantia_hasta')
        .lte('garantia_hasta', fechaEnDias(30))
        .is('deleted_at', null)
        .in('estado', ['operativo', 'en_reparacion'])
        .order('garantia_hasta', { ascending: true }),
    ]);
    if (rotarRes.error) throw rotarRes.error;
    if (sinPwRes.error) throw sinPwRes.error;
    if (licRes.error) throw licRes.error;
    if (equiposRes.error) throw equiposRes.error;
    if (garantiaRes.error) throw garantiaRes.error;

    const mapItem = (c) => {
      const titulares = (c.asignaciones_cuenta || [])
        .filter((a) => !a.fecha_fin && a.empleados)
        .map((a) => ({
          id: a.empleado_id,
          nombre: `${a.empleados.nombres} ${a.empleados.apellidos}`.trim(),
        }));
      return {
        cuenta_id: c.id,
        usuario: c.usuario,
        tipo_cuenta: c.tipo_cuenta || 'personal',
        plataforma: c.plataformas?.nombre || '',
        titulares,
      };
    };

    return {
      porRotar: (rotarRes.data || []).map(mapItem),
      sinPassword: (sinPwRes.data || []).map(mapItem),
      licenciasPorVencer: (licRes.data || []).map((l) => ({
        licencia_id: l.id,
        software: l.software,
        cantidad: l.cantidad,
        fecha_vencimiento: l.fecha_vencimiento,
        empresa: l.empresas?.nombre || '',
        vencida: l.fecha_vencimiento < new Date().toISOString().split('T')[0],
      })),
      // Lo más urgente: equipos que siguen en manos de empleados dados de baja
      equiposSinDevolver: (equiposRes.data || [])
        .filter((a) => a.empleados?.estado === 'Inactivo' && a.equipos && !a.equipos.deleted_at)
        .map((a) => ({
          asignacion_id: a.id,
          codigo: a.equipos.codigo,
          equipo: `${a.equipos.marca || ''} ${a.equipos.modelo || ''}`.trim(),
          empleado: `${a.empleados.nombres} ${a.empleados.apellidos}`.trim(),
          empleado_id: a.empleados.id,
        })),
      garantiasPorVencer: (garantiaRes.data || []).map((e) => ({
        equipo_id: e.id,
        codigo: e.codigo,
        equipo: `${e.marca || ''} ${e.modelo || ''}`.trim(),
        garantia_hasta: e.garantia_hasta,
        vencida: e.garantia_hasta < new Date().toISOString().split('T')[0],
      })),
    };
  },

  // Pendientes accionables de tickets, para el Dashboard
  async pendientesTickets() {
    const db = getClient().database;
    const [sinAsignarRes, sinVincularRes, viejosRes] = await Promise.all([
      db.from('tickets')
        .select('id, codigo, titulo')
        .is('asignado_a', null)
        .not('estado', 'in', '("resuelto","cerrado","rechazado")')
        .order('created_at', { ascending: true }),
      db.from('tickets')
        .select('id, codigo, titulo')
        .eq('vinculado', false)
        .not('estado', 'in', '("resuelto","cerrado","rechazado")')
        .order('created_at', { ascending: true }),
      db.from('tickets')
        .select('id, codigo, titulo, created_at')
        .not('estado', 'in', '("resuelto","cerrado","rechazado")')
        .lte('created_at', fechaEnDias(-3))
        .order('created_at', { ascending: true }),
    ]);
    return {
      sinAsignar: (sinAsignarRes.data || []).map((t) => ({ ticket_id: t.id, codigo: t.codigo, titulo: t.titulo })),
      sinVincular: (sinVincularRes.data || []).map((t) => ({ ticket_id: t.id, codigo: t.codigo, titulo: t.titulo })),
      abiertosViejos: (viejosRes.data || []).map((t) => ({ ticket_id: t.id, codigo: t.codigo, titulo: t.titulo, desde: t.created_at })),
    };
  },

  // ── Auditoría (solo JEFE por RLS) ────────────────────────────────────────────

  async listActividad(limit = 200) {
    const { data, error } = await getClient().database
      .from('accesos_log')
      .select('id, user_email, cuenta_usuario, plataforma, accion, detalle, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },
};

// Fecha de hoy + N días en formato YYYY-MM-DD (para filtros de vencimiento)
function fechaEnDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}
