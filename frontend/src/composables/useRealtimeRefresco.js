import { onMounted, onUnmounted } from 'vue';
import { getClient } from '../api/client.js';

// Ventana de coalescencia para los canales "*:list" (ver crearRefrescoDebounced):
// una escritura masiva (ej. importar equipos) puede disparar el trigger
// de BD decenas de veces en segundos y cada evento antes relanzaba el
// fetch pesado de la lista sin ninguna guardia (P-02, HISTORIAL-AUDITORIAS.md).
export const REFRESCO_LISTA_DEBOUNCE_MS = 500;

// Envuelve `fn` (una función de refresco que puede devolver una promesa)
// para que una ráfaga de llamadas se colapse en, como máximo, dos
// ejecuciones: una inmediata (leading, para que un cambio aislado se
// sienta instantáneo) y una de "alcance" al final de la ráfaga (trailing),
// con el último payload recibido. Mientras `fn` esté en curso no se
// superpone una segunda ejecución: si llegan eventos durante ese tiempo,
// se dispara una sola pasada más apenas la anterior termine.
export function crearRefrescoDebounced(fn, { delayMs = REFRESCO_LISTA_DEBOUNCE_MS } = {}) {
  let timer = null;
  let enCurso = false;
  let huboEventoPendiente = false;
  let ultimoPayload;

  function ejecutar() {
    huboEventoPendiente = false;
    enCurso = true;
    Promise.resolve(fn(ultimoPayload)).finally(() => {
      enCurso = false;
      if (huboEventoPendiente) ejecutar();
    });
  }

  return function refrescoDebounced(payload) {
    ultimoPayload = payload;
    if (timer == null && !enCurso) {
      ejecutar();
    } else {
      huboEventoPendiente = true;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (huboEventoPendiente && !enCurso) ejecutar();
    }, delayMs);
  };
}

// Suscribe la vista a un canal de InsForge Realtime y ejecuta `callback`
// cuando otra sesión modifica la tabla asociada. Si realtime no conecta
// (red, backend caído) falla en silencio: la vista sigue funcionando con
// la carga inicial, solo sin auto-refresco.
//
// `opciones.debounceMs`: si se define, coalesce ráfagas de eventos con
// `crearRefrescoDebounced` antes de invocar `callback` (ver esa función).
// Sin esta opción el comportamiento es idéntico al de antes — necesario
// para canales que reaccionan a cada evento individual (ej. notificaciones).
export function useRealtimeRefresco(canal, callback, opciones = {}) {
  let activo = true;
  const alRefrescar = opciones.debounceMs != null
    ? crearRefrescoDebounced(callback, { delayMs: opciones.debounceMs })
    : callback;

  function alCambiar(payload) {
    // El SDK entrega meta.channel con prefijo "realtime:" (ej.
    // "realtime:ticket:<token>"); se acepta con y sin prefijo.
    const ch = payload?.meta?.channel;
    if (ch !== canal && ch !== `realtime:${canal}`) return;
    alRefrescar(payload);
  }

  onMounted(async () => {
    try {
      const rt = getClient().realtime;
      if (!rt.isConnected) await rt.connect();
      const res = await rt.subscribe(canal);
      if (!activo) return;
      if (!res.ok) {
        console.warn(`[realtime] no se pudo suscribir a "${canal}":`, res.error);
        return;
      }
      console.info(`[realtime] suscrito a "${canal}"`);
      rt.on('changed', alCambiar);
    } catch (e) {
      // Sin auto-refresco; la vista sigue operando con carga inicial.
      console.warn(`[realtime] error al conectar/suscribir a "${canal}":`, e);
    }
  });

  onUnmounted(() => {
    activo = false;
    const rt = getClient().realtime;
    rt.off('changed', alCambiar);
    rt.unsubscribe(canal);
  });
}
