import { onMounted, onUnmounted } from 'vue';
import { getClient } from '../api/client.js';

// Suscribe la vista a un canal de InsForge Realtime y ejecuta `callback`
// cuando otra sesión modifica la tabla asociada. Si realtime no conecta
// (red, backend caído) falla en silencio: la vista sigue funcionando con
// la carga inicial, solo sin auto-refresco.
export function useRealtimeRefresco(canal, callback) {
  let activo = true;

  function alCambiar(payload) {
    if (payload?.meta?.channel !== canal) return;
    callback(payload);
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
