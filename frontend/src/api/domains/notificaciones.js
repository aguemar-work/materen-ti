import { getClient } from '../client.js';

const LIMITE = 30;

export const notificacionesApi = {
  // Últimas notificaciones de los 4 eventos (migración 045). Sin paginación:
  // es una campana, no una vista de lista — alcanza con las más recientes.
  async listNotificaciones() {
    const { data, error } = await getClient().database
      .from('notificaciones')
      .select('id, tipo, titulo, url_destino, creado_en')
      .order('creado_en', { ascending: false })
      .limit(LIMITE);
    if (error) throw error;
    return data || [];
  },

  // Estado de lectura del usuario logueado sobre esas notificaciones.
  async listLecturas(usuarioId) {
    const { data, error } = await getClient().database
      .from('notificaciones_lecturas')
      .select('notificacion_id')
      .eq('usuario_id', usuarioId);
    if (error) throw error;
    return (data || []).map((r) => r.notificacion_id);
  },

  // Idempotente: 23505 = ya estaba marcada como leída, no es un error real.
  async marcarLeida(notificacionId, usuarioId) {
    const { error } = await getClient().database
      .from('notificaciones_lecturas')
      .insert([{ notificacion_id: notificacionId, usuario_id: usuarioId }]);
    if (error && error.code !== '23505') throw error;
  },

  async marcarVariasLeidas(notificacionIds, usuarioId) {
    if (!notificacionIds.length) return;
    const filas = notificacionIds.map((id) => ({ notificacion_id: id, usuario_id: usuarioId }));
    const { error } = await getClient().database
      .from('notificaciones_lecturas')
      .insert(filas);
    if (error && error.code !== '23505') throw error;
  },
};
