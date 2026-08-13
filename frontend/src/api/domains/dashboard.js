// Dominio dashboard/actividad: búsqueda global, estadísticas, pendientes
// accionables (cuentas, licencias, equipos, tickets) y log de auditoría.
import { getClient } from '../client.js';
import { sanitizarTermino } from '../sanitizar.js';
import { fechaLocalISO } from '../../core/formatters.js';

export const dashboardApi = {
  // Búsqueda global del panel: empleados, cuentas, equipos, tickets y
  // licencias en una sola consulta
  async buscarGlobal(query) {
    const VACIO = { empleados: [], cuentas: [], equipos: [], tickets: [], licencias: [] };
    if (!query || query.trim().length < 2) return VACIO;
    const qSafe = sanitizarTermino(query); // H-07: saneado centralizado en api/sanitizar.js
    if (qSafe.length < 2) return VACIO;
    const db = getClient().database;
    const [empRes, cuentasRes, equiposRes, ticketsRes, licenciasRes] = await Promise.all([
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
      // Tickets: TODOS los estados — el caso dominante de buscar "TCK-####"
      // es un ticket ya cerrado; el estado se muestra en el resultado.
      // (tickets no maneja deleted_at)
      db.from('tickets')
        .select('id, codigo, titulo, estado')
        .or(`codigo.ilike.%${qSafe}%,titulo.ilike.%${qSafe}%`)
        .order('created_at', { ascending: false })
        .limit(6),
      db.from('licencias')
        .select('id, software, proveedor')
        .is('deleted_at', null)
        .or(`software.ilike.%${qSafe}%,proveedor.ilike.%${qSafe}%`)
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
      tickets: (ticketsRes.data || []).map((t) => ({
        id: t.id, codigo: t.codigo, titulo: t.titulo, estado: t.estado,
      })),
      licencias: (licenciasRes.data || []).map((l) => ({
        id: l.id, software: l.software, proveedor: l.proveedor || '',
      })),
    };
  },

  async getEstadisticas() {
    const db = getClient().database;
    // count+head (Supabase-style, soportado por @insforge/sdk): solo pide
    // el número de filas al backend, sin descargarlas — antes cada query
    // traía la tabla completa solo para medir .length (P-01).
    const CONTEO = { count: 'exact', head: true };
    // empleadosActivos necesita el estado real: única query que sigue
    // trayendo filas (mínimas: solo la columna que se filtra).
    const [empRes, asigRes, compartidaRes, rotacionRes, licVencenRes, equiposRes, ticketsRes] = await Promise.all([
      db.from('empleados').select('id, estado').is('deleted_at', null),
      db.from('asignaciones_cuenta').select('id', CONTEO).is('fecha_fin', null),
      db.from('cuentas').select('id', CONTEO).eq('tipo_cuenta', 'compartida').is('deleted_at', null),
      db.from('cuentas').select('id', CONTEO).eq('requiere_rotacion', true).is('deleted_at', null),
      db.from('licencias').select('id', CONTEO)
        .lte('fecha_vencimiento', fechaEnDias(30))
        .is('deleted_at', null),
      db.from('equipos').select('id', CONTEO).is('deleted_at', null),
      db.from('tickets').select('id', CONTEO).not('estado', 'in', '("resuelto","cerrado","rechazado")'),
    ]);

    return {
      empleadosActivos: (empRes.data || []).filter((e) => e.estado === 'Activo').length,
      empleadosTotal: (empRes.data || []).length,
      cuentasAsignadas: asigRes.count || 0,
      correosCompartidos: compartidaRes.count || 0,
      cuentasPorRotar: rotacionRes.count || 0,
      licenciasPorVencer: licVencenRes.count || 0,
      equiposTotal: equiposRes.count || 0,
      ticketsAbiertos: ticketsRes.count || 0,
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
        vencida: l.fecha_vencimiento < fechaLocalISO(),
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
        vencida: e.garantia_hasta < fechaLocalISO(),
      })),
    };
  },

  // Pendientes accionables de tickets, para el Dashboard.
  // Antes: 3 round-trips a "tickets" repitiendo el mismo filtro base
  // (estado abierto) — P-04. Ahora: 1 query trae los tickets abiertos una
  // sola vez, con las columnas que las 3 listas necesitan para clasificar
  // en memoria; un ticket que califica en más de un bucket (ej. viejo Y
  // sin asignar) sigue apareciendo en ambos, igual que antes.
  async pendientesTickets() {
    const db = getClient().database;
    const { data, error } = await db.from('tickets')
      .select('id, codigo, titulo, created_at, asignado_a, vinculado')
      .not('estado', 'in', '("resuelto","cerrado","rechazado")')
      .order('created_at', { ascending: true });
    if (error) throw error;
    const abiertos = data || [];
    const cortesViejos = fechaEnDias(-3);
    const aItem = (t) => ({ ticket_id: t.id, codigo: t.codigo, titulo: t.titulo, desde: t.created_at });
    return {
      sinAsignar: abiertos.filter((t) => !t.asignado_a).map(aItem),
      // === false explícito (no !t.vinculado): igual que el .eq('vinculado',
      // false) original, un valor null no debe contar como "sin vincular".
      sinVincular: abiertos.filter((t) => t.vinculado === false).map(aItem),
      abiertosViejos: abiertos.filter((t) => t.created_at <= cortesViejos).map(aItem),
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

// Fecha de hoy + N días en formato YYYY-MM-DD local (para filtros de vencimiento)
function fechaEnDias(dias) {
  return fechaLocalISO(dias);
}
