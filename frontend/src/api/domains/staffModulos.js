// Dominio "permisos de módulos": qué módulos operativos ve cada integrante
// en el sidebar (migración 056). JEFE siempre ve todos los módulos — se
// resuelve en auth.puedeVerModulo, no acá. Esta tabla solo importa para
// ASISTENTE.
import { getClient } from '../client.js';

export const staffModulosApi = {
  // Módulos habilitados para el usuario logueado (para armar su propio
  // sidebar al iniciar sesión).
  async misModulos(userId) {
    const { data, error } = await getClient().database
      .from('staff_modulos_permisos')
      .select('modulo')
      .eq('staff_user_id', userId);
    if (error) throw error;
    return (data || []).map((p) => p.modulo);
  },

  // Módulos habilitados de un integrante puntual (para precargar el
  // checklist al gestionarlo desde Configuración·Staff).
  async modulosDeStaff(userId) {
    return staffModulosApi.misModulos(userId);
  },

  // Reconcilia: agrega los módulos nuevos, quita los destildados. Mismo
  // patrón que actualizarAccesoSensible (domains/accesosSensibles.js).
  async guardarModulos(userId, modulosIds) {
    const db = getClient().database;
    const actuales = new Set(await staffModulosApi.misModulos(userId));
    const deseados = new Set(modulosIds || []);
    const aAgregar = [...deseados].filter((m) => !actuales.has(m));
    const aQuitar = [...actuales].filter((m) => !deseados.has(m));

    if (aAgregar.length) {
      const { error } = await db
        .from('staff_modulos_permisos')
        .insert(aAgregar.map((modulo) => ({ staff_user_id: userId, modulo })));
      if (error) throw error;
    }
    if (aQuitar.length) {
      const { error } = await db
        .from('staff_modulos_permisos')
        .delete()
        .eq('staff_user_id', userId)
        .in('modulo', aQuitar);
      if (error) throw error;
    }
  },
};
