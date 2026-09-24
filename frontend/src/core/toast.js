// Cola reactiva de toasts — reemplaza la manipulación directa del DOM
// (innerHTML + estilos inline sobre un único `#toast`) por un array reactivo
// que pinta `components/shared/AppNotifications.vue` (también los avisos
// realtime: antes eran dos implementaciones del mismo concepto).
//
// La firma pública `showToast(msg, tipo)` NO cambió a propósito: la llaman
// ~30 archivos y ninguno necesita saber que el mecanismo cambió por dentro.
import { reactive } from 'vue';

const TIEMPO_MS = 2400;
let seq = 0;

/** Cola de toasts activos: { id, msg, tipo }. Consumida por AppNotifications.vue. */
export const toasts = reactive([]);

export function showToast(msg, tipo = 'success') {
  const id = ++seq;
  toasts.push({ id, msg, tipo });
  setTimeout(() => descartarToast(id), TIEMPO_MS);
}

export function descartarToast(id) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
}
