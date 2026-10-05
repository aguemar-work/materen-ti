// Dominio portal (staff, migración 109): emitir, revocar y consultar el enlace
// del portal del empleado. Las dos escrituras corren por RPC (guard módulo
// `empleados`, 42501 sin permiso, rechazos de negocio P0001 en español); la
// lectura es la tabla `empleado_enlaces` con RLS y SOLO sus columnas no secretas
// (token_hash y ultimo_ip no se conceden al rol authenticated: un `select *`
// fallaría con 42501). Los errores se relanzan crudos: los traduce quien los
// muestra (api/erroresDb.js).
//
// El token se devuelve UNA sola vez, al emitir; nunca se vuelve a poder leer.
import { getClient } from '../client.js';

const COLUMNAS_ENLACE = 'id, empleado_id, alcance, expires_at, created_at, revocado_at, usos, ultimo_uso_at';

export const portalApi = {
  // Enlace sin revocar del empleado (vigente o vencido) o null. Quien lo muestra
  // compara `expires_at` con la fecha actual.
  async enlacePortalActivo(empleadoId) {
    const { data, error } = await getClient().database
      .from('empleado_enlaces')
      .select(COLUMNAS_ENLACE)
      .eq('empleado_id', empleadoId)
      .is('revocado_at', null)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  },

  // Emite el enlace (revoca el anterior). `alcance`: arreglo de ver_accesos,
  // ver_equipos, ver_tickets, confirmar_equipo (null = todos); `dias`: 1 a 30
  // (null = el parámetro portal_vigencia_dias, 7). Devuelve el token UNA vez.
  async emitirEnlacePortal(empleadoId, { alcance = null, dias = null } = {}) {
    const { data, error } = await getClient().database.rpc('portal_emitir_enlace', {
      p_empleado_id: empleadoId,
      p_alcance: alcance && alcance.length ? alcance : null,
      p_dias: dias ?? null,
    });
    if (error) throw error;
    return {
      id: data.id,
      token: data.token,
      expiraEn: data.expires_at,
      alcance: data.alcance || [],
      dias: data.dias,
    };
  },

  // Revoca el enlace sin revocar. true si había uno.
  async revocarEnlacePortal(empleadoId) {
    const { data, error } = await getClient().database.rpc('portal_revocar_enlace', {
      p_empleado_id: empleadoId,
    });
    if (error) throw error;
    return data === true;
  },
};
