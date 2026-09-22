// Revelado auditado de una credencial cifrada — lógica pura, sin componente.
// Extraída de components/carbon/CarbonPasswordReveal.vue al retirar esa
// librería (reinicio de diseño, 2026-09-05): la vista pinta su propio HTML
// (<span>/<button> nativos) y usa esto para el comportamiento.
//
// QUÉ RESUELVE — historia, para no perderla al mover el archivo
// El patrón "•••••••• [ojo] [copiar]" estaba escrito a mano en cuatro sitios,
// cada uno con su propio `passwordVisibles[id]` y su propio manejo de error.
// Ninguno ocultaba la credencial solo: una vez revelada quedaba en pantalla
// hasta recargar, en un panel que se usa compartiendo pantalla con el
// empleado al que se le entrega la cuenta. `crearRevelado()` agrega cuenta
// regresiva y ocultado automático (visible, no de golpe), oculta también al
// cambiar de pestaña y borra el valor del estado al ocultar (no solo deja de
// pintarlo — mientras siga en memoria de la pestaña sigue expuesto).
//
// DÓNDE ESTÁ LA BARRERA REAL
// Acá en ninguna parte. El descifrado ocurre en la edge function
// `credenciales` (functions/credenciales.ts): la clave AES-256-GCM vive en
// el servidor, la function verifica sesión, rol y permiso por fila, y
// escribe la fila de auditoría en `accesos_log` con el motivo
// ('ver' | 'copiar'). Esto solo pide y muestra.
//
// POR QUÉ `revelar` ES UNA FUNCIÓN Y NO UN `tipo`
// Hay tres acciones distintas en la edge function (`revelar`,
// `revelarClaveLicencia`, `revelarAccesoSensible`), cada una con su propia
// clave de cifrado y su propio control de acceso. Quien llama pasa una línea
// (`(motivo) => revelarPassword(id, motivo)`) y esta función no sabe nada de
// dominio. El `motivo` se propaga porque es lo que queda auditado.
//
// CÓMO USARLO POR FILA (tabla con una credencial por fila)
// No es un composable de Vue clásico (no usa onBeforeUnmount/watch por sí
// mismo) a propósito: así se puede crear uno por fila dentro de un Map
// reactivo, sin las restricciones de dónde puede llamarse un composable.
// La vista que lo usa es responsable de:
//   1. Guardar cada instancia en un Map/objeto keyed por id de fila.
//   2. Llamar UNA vez `escucharOcultamientoPorCambioDePestana(...)` en su
//      propio onMounted, y a la función que devuelve en onBeforeUnmount.
//   3. Si el permiso se cae en caliente (prop `bloqueado` pasa a true),
//      llamar `.ocultar()` de esa instancia — no hay watch automático acá,
//      porque `bloqueado` es de la vista, no de este archivo.
import { ref } from 'vue';
import { showToast } from '../core/toast.js';

export function crearRevelado({ revelar, etiqueta = 'contraseña', segundos = 8 }) {
  const valor = ref(null);
  const restante = ref(0);
  const pidiendo = ref(false);
  let cronometro = null;

  function ocultar() {
    clearInterval(cronometro);
    cronometro = null;
    // Se borra el valor, no solo se deja de renderizar.
    valor.value = null;
    restante.value = 0;
  }

  async function mostrar() {
    if (valor.value) { ocultar(); return; }
    if (pidiendo.value) return;
    pidiendo.value = true;
    try {
      valor.value = await revelar('ver');
      restante.value = segundos;
      cronometro = setInterval(() => {
        restante.value -= 1;
        if (restante.value <= 0) ocultar();
      }, 1000);
    } catch (e) {
      showToast(e?.message || `Error al revelar la ${etiqueta}`, 'error');
    } finally {
      pidiendo.value = false;
    }
  }

  // Copiar pide su PROPIO revelado con motivo 'copiar' en vez de reusar el
  // valor ya visible: son dos accesos distintos y la auditoría tiene que
  // poder distinguirlos (quién solo la miró y quién se la llevó al
  // portapapeles).
  async function copiar() {
    if (pidiendo.value) return;
    pidiendo.value = true;
    try {
      const secreto = await revelar('copiar');
      await navigator.clipboard.writeText(secreto);
      showToast(`${etiqueta.charAt(0).toUpperCase()}${etiqueta.slice(1)} copiada`);
    } catch (e) {
      showToast(e?.message || 'No se pudo copiar', 'error');
    } finally {
      pidiendo.value = false;
    }
  }

  return { valor, restante, pidiendo, segundos, mostrar, copiar, ocultar };
}

// Cambiar de pestaña oculta cualquier credencial visible. No es paranoia de
// manual: este panel se usa con la pantalla compartida, y una pestaña de
// fondo con una clave en claro es una captura esperando a pasar.
//
// `obtenerRevelados()` debe devolver el array de instancias VIGENTES en ese
// momento (ej. `() => [...mapa.value.values()]`), para cubrir filas que se
// crearon después de montar la vista. Llamar una sola vez por vista.
export function escucharOcultamientoPorCambioDePestana(obtenerRevelados) {
  function alOcultarsePestana() {
    if (document.hidden) obtenerRevelados().forEach((r) => r.ocultar());
  }
  document.addEventListener('visibilitychange', alOcultarsePestana);
  return () => document.removeEventListener('visibilitychange', alOcultarsePestana);
}
