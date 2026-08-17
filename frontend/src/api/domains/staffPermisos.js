// Dominio "permisos individuales": capacidades por integrante fuera del rol
// JEFE/ASISTENTE fijo (migración 060). Hoy un solo permiso: credenciales.ver.
// Mismo patrón que staffModulos.js (056), pero para capacidades, no módulos
// de UI. JEFE siempre lo tiene — se resuelve en auth.puedeVerCredenciales,
// no acá.
//
// Gate cosmético: el frontend solo oculta/deshabilita botones para dar buen
// feedback. La barrera real vive en functions/credenciales.ts (consulta
// directa a staff_permisos) — si algo falla, que sea el gate del servidor el
// que bloquee, nunca el del cliente.
import { getClient } from '../client.js';

const PERMISO_CREDENCIALES = 'credenciales.ver';

export const staffPermisosApi = {
  // Permisos del usuario logueado (para armar su propio estado al iniciar sesión).
  async misPermisos(userId) {
    const { data, error } = await getClient().database
      .from('staff_permisos')
      .select('permiso')
      .eq('staff_user_id', userId);
    if (error) throw error;
    return (data || []).map((p) => p.permiso);
  },

  // Otorga/revoca "credenciales.ver" para un integrante puntual (toggle en
  // Configuración·Staff, solo JEFE por RLS).
  async setCredencialesVer(userId, otorgar) {
    const db = getClient().database;
    if (otorgar) {
      const { error } = await db
        .from('staff_permisos')
        .insert([{ staff_user_id: userId, permiso: PERMISO_CREDENCIALES }]);
      if (error) throw error;
    } else {
      const { error } = await db
        .from('staff_permisos')
        .delete()
        .eq('staff_user_id', userId)
        .eq('permiso', PERMISO_CREDENCIALES);
      if (error) throw error;
    }
  },
};
