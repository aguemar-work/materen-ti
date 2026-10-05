// Dominio dashboard/actividad: búsqueda global, resumen del Inicio y log de
// auditoría.
//
// El Inicio y el contador del menú leen TODO de `getResumen()` (RPC
// `dashboard_resumen`, migración 103): una sola llamada. Los métodos
// `getEstadisticas`, `listPendientes`, `pendientesTickets` y `misTickets`
// (origen de las ≈25 requests del Inicio) se retiraron el 2026-10-03 junto con
// el modal de reporte: sus cifras viven en `dashboard_resumen` y en las vistas
// KPI de la migración 115.
import { getClient } from '../client.js';
import { sanitizarTermino } from '../sanitizar.js';
import { anotarErrorDb } from '../erroresDb.js';
import { normalizarResumen } from '../../core/resumen-inicio.js';

export const dashboardApi = {
  // Resumen del Inicio: una sola RPC (`dashboard_resumen`, migración 103) con
  // kpis, pendientes, "mis tickets" y custodia de hoy. Cada sección llega
  // `null` si la persona no tiene el módulo (no es un error) o si su cálculo
  // falló en el servidor (entonces su nombre está en `errores`). Si la RPC
  // falla ENTERA (backend sin la 103, red) lanza un error ya traducido: el
  // Inicio muestra UN aviso con reintento, nunca "al día".
  async getResumen() {
    const { data, error } = await getClient().database.rpc('dashboard_resumen');
    if (error) throw anotarErrorDb(error, { porDefecto: 'No se pudo cargar el resumen del Inicio.' });
    const resumen = Array.isArray(data) ? data[0] : data;
    if (!resumen || typeof resumen !== 'object') {
      throw new Error('El servidor devolvió un resumen vacío.');
    }
    return normalizarResumen(resumen);
  },

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
