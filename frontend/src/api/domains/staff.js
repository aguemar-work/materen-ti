// Dominio staff: usuarios del panel (roles JEFE/ASISTENTE y activación).
import { getClient } from '../client.js';

// tecnico_mesa (migración 118): técnico de mesa de ayuda en los reportes de Tickets y Satisfacción.
const SELECT_STAFF = 'user_id, nombre, rol, activo, tecnico_mesa, staff_permisos(permiso)';

// credenciales_ver: derivado del embed de staff_permisos (migración 060) —
// JEFE no necesita fila ahí (siempre puede, se resuelve aparte en el getter
// auth.puedeVerCredenciales); acá solo se mapea la fila cruda para que el
// toggle de Configuración·Staff sepa su estado inicial.
function mapStaff(row) {
  return {
    user_id: row.user_id,
    nombre: row.nombre,
    rol: row.rol,
    activo: row.activo,
    tecnico_mesa: !!row.tecnico_mesa,
    credenciales_ver: (row.staff_permisos || []).some((p) => p.permiso === 'credenciales.ver'),
  };
}

// ── Staff ────────────────────────────────────────────────────────────────────

export const staffApi = {
  async listStaff() {
    const { data, error } = await getClient().database
      .from('staff')
      .select(SELECT_STAFF)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapStaff);
  },

  // id + nombre de staff activo, vía la función angosta staff_nombres()
  // (migración 061) — cualquier staff activo puede resolver nombres de
  // compañeros para mostrarlos (reporte, "Asignado a", Responsable, autor de
  // KB, etc.), sin el resto de la fila que la RLS de staff no le deja leer.
  async nombresStaff() {
    const { data, error } = await getClient().database.rpc('staff_nombres');
    if (error) throw error;
    return data || [];
  },

  // datos pasa tal cual al UPDATE: {rol, activo} o {tecnico_mesa} desde
  // Configuración·Staff (JEFE), o {nombre} desde la autoedición de nombre
  // (migración 061, cualquier staff sobre su propia fila). La RLS y los
  // triggers check_staff_autoedicion_solo_nombre y check_staff_tecnico_mesa
  // (118) deciden qué combinación es válida.
  async updateStaff(userId, datos) {
    const { data, error } = await getClient().database
      .from('staff')
      .update(datos)
      .eq('user_id', userId)
      .select(SELECT_STAFF)
      .single();
    if (error) throw error;
    return mapStaff(data);
  },
};
