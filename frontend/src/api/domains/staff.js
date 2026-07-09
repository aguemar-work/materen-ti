// Dominio staff: usuarios del panel (roles JEFE/ASISTENTE y activación).
import { getClient } from '../client.js';

// ── Staff ────────────────────────────────────────────────────────────────────

export const staffApi = {
  async listStaff() {
    const { data, error } = await getClient().database
      .from('staff')
      .select('user_id, nombre, rol, activo')
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async updateStaff(userId, datos) {
    const { data, error } = await getClient().database
      .from('staff')
      .update({ rol: datos.rol, activo: datos.activo })
      .eq('user_id', userId)
      .select('user_id, nombre, rol, activo')
      .single();
    if (error) throw error;
    return data;
  },
};
