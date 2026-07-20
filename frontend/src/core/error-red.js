// Fallback global de error de red: cuando una llamada ni siquiera llega
// al servidor (sin conexión, DNS caído, timeout), los wrappers de la API
// (ticketsPublicos.js, passwords.js) muestran una única pantalla de
// reintento (ErrorRedView) en vez de duplicar la detección en cada vista.
// Un error de negocio de la API (4xx/5xx con { ok:false, code }) NO pasa
// por acá: eso lo sigue manejando cada vista con su propio catch.
import { ref } from 'vue';

export const MENSAJE_ERROR_RED =
  'No se pudo conectar con el servidor. Verifique su conexión e intente nuevamente';

// true → App.vue superpone ErrorRedView a la vista actual
export const errorRedActivo = ref(false);

let pendientes = [];

// El SDK (@insforge/sdk) envuelve las fallas de transporte en InsForgeError
// con code NETWORK_ERROR (statusCode 0) o REQUEST_TIMEOUT (408); un error
// de negocio de la API nunca llega con esos códigos. El regex cubre el
// TypeError crudo de fetch por si un error escapa sin envolver.
export function esErrorRed(err) {
  return (
    err?.error === 'NETWORK_ERROR' ||
    err?.error === 'REQUEST_TIMEOUT' ||
    err?.statusCode === 0 ||
    /failed to fetch|networkerror|load failed/i.test(err?.message || '')
  );
}

// Muestra el fallback y espera a que el usuario pulse "Reintentar": el
// wrapper que llamó repite entonces la MISMA petición, así la vista no
// pierde su estado (ej. un formulario ya completado). Si el usuario navega
// a otra ruta mientras tanto, la promesa se rechaza (cancelarErrorRed) y
// la vista muestra su propio mensaje de error.
export function esperarReintento() {
  errorRedActivo.value = true;
  return new Promise((resolve, reject) => {
    pendientes.push({ resolve, reject });
  });
}

export function reintentarErrorRed() {
  errorRedActivo.value = false;
  const lista = pendientes;
  pendientes = [];
  for (const p of lista) p.resolve();
}

export function cancelarErrorRed() {
  if (!errorRedActivo.value && !pendientes.length) return;
  errorRedActivo.value = false;
  const lista = pendientes;
  pendientes = [];
  for (const p of lista) p.reject(new Error(MENSAJE_ERROR_RED));
}
