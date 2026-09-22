// Mapeo tipo → ícono/rol de una notificación — función pura, sin componente.
// Extraída de components/carbon/CarbonNotification.vue (reinicio de diseño,
// 2026-09-05).
const TIPOS = {
  error:   { icono: 'ti-alert-circle-filled', rol: 'danger' },
  success: { icono: 'ti-circle-check-filled', rol: 'success' },
  warning: { icono: 'ti-alert-triangle-filled', rol: 'warning' },
  info:    { icono: 'ti-info-circle-filled', rol: 'info' },
};

/**
 * `tipo` es 'error' | 'success' | 'warning' | 'info'. Devuelve
 * `{ icono, rol, rolAria }` — `rolAria` es 'alert' (interrumpe al lector de
 * pantalla) para error, 'status' (espera) para el resto: un error merece lo
 * primero, una confirmación no.
 */
export function infoNotificacion(tipo) {
  const info = TIPOS[tipo] ?? TIPOS.info;
  return { ...info, rolAria: tipo === 'error' ? 'alert' : 'status' };
}
