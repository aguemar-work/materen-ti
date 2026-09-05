<script setup>
// Revelado de una credencial cifrada — primitiva única del sistema.
//
// QUÉ RESUELVE
// El patrón "••••••••  [ojo] [copiar]" estaba escrito a mano en cuatro
// sitios (CuentasPanel.vue en tabla y en tarjeta, CorreosView.vue,
// LicenciasView.vue, AccesosSensiblesView.vue), cada uno con su propio
// `passwordVisibles[id]`, su propio manejo de error y su propio markup. Las
// cuatro copias hacían lo mismo salvo en un detalle importante: NINGUNA
// ocultaba la credencial sola. Una vez revelada quedaba en pantalla hasta
// que alguien volvía a hacer clic en el ojo, o hasta recargar — en un panel
// que se usa compartiendo pantalla con el empleado al que se le entrega la
// cuenta.
//
// QUÉ AGREGA (2026-09-02)
//   · Cuenta regresiva de 8 segundos y ocultado automático. El número es
//     visible: quien lee la clave sabe cuánto le queda, no se la borran de
//     golpe. Se puede volver a revelar, y cada revelado se audita de nuevo
//     (que es lo correcto: son dos accesos, no uno).
//   · Se oculta también al cambiar de pestaña (`visibilitychange`) y al
//     desmontarse el componente (navegar, cerrar el modal). Sin esto, la
//     clave sobrevivía en el DOM de una pestaña de fondo.
//   · El valor revelado se borra del estado del componente al ocultar, no
//     solo se deja de mostrar.
//
// DÓNDE ESTÁ LA BARRERA REAL
// Acá en ninguna parte. El descifrado ocurre en la edge function
// `credenciales` (functions/credenciales.ts): la clave AES-256-GCM vive en
// el servidor, la function verifica sesión, rol y permiso por fila, y
// escribe la fila de auditoría en `accesos_log` con el motivo
// ('ver' | 'copiar'). Este componente solo pide y muestra. `bloqueado` es
// un gate COSMÉTICO —esconde el botón cuando ya se sabe que no hay
// permiso— y quitarlo no daría acceso a nada.
//
// POR QUÉ `revelar` ES UNA FUNCIÓN Y NO UN `tipo`
// Hay tres acciones distintas en la edge function (`revelar`,
// `revelarClaveLicencia`, `revelarAccesoSensible`), cada una con su propia
// clave de cifrado y su propio control de acceso — la de accesos sensibles
// usa CRED_KEY_SENSIBLE y permiso por fila. Con un prop `tipo` este
// componente tendría que conocer los tres dominios y crecer con el cuarto.
// Recibiendo la función, cada sitio pasa una línea
// (`(motivo) => revelarPassword(id, motivo)`) y el componente no sabe
// nada de dominio. El `motivo` se propaga porque es lo que queda auditado.
import { ref, onBeforeUnmount, watch } from 'vue';
import { showToast } from '../../core/toast.js';

const props = defineProps({
  /**
   * `async (motivo: 'ver' | 'copiar') => string`. Devuelve la credencial en
   * claro o lanza. El motivo llega tal cual a `accesos_log`.
   */
  revelar: { type: Function, required: true },
  /**
   * Gate cosmético: sin permiso se muestra un candado en vez de los
   * botones. La barrera real está en la edge function.
   */
  bloqueado: { type: Boolean, default: false },
  /** Texto del candado y del title cuando `bloqueado`. */
  motivoBloqueo: { type: String, default: 'Sin permiso para ver esta credencial' },
  /**
   * Qué es lo que se revela, en minúscula y singular. Solo alimenta los
   * nombres accesibles ("Mostrar contraseña", "Clave copiada"): el mismo
   * componente sirve para una contraseña de cuenta y para el serial de una
   * licencia, y un aria-label que diga "contraseña" en el segundo caso es
   * una etiqueta incorrecta, no un detalle.
   */
  etiqueta: { type: String, default: 'contraseña' },
  /**
   * Segundos que la credencial queda visible. 8 por defecto — alcanza para
   * leerla en voz alta o transcribirla, y no para olvidarse de que está en
   * pantalla.
   */
  segundos: { type: Number, default: 8 },
});

const valor = ref(null);
const restante = ref(0);
const pidiendo = ref(false);
let cronometro = null;

function ocultar() {
  clearInterval(cronometro);
  cronometro = null;
  // Se borra el valor, no solo se deja de renderizar: mientras siga en el
  // estado del componente sigue estando en memoria de la pestaña.
  valor.value = null;
  restante.value = 0;
}

async function mostrar() {
  if (valor.value) { ocultar(); return; }
  if (pidiendo.value) return;
  pidiendo.value = true;
  try {
    valor.value = await props.revelar('ver');
    restante.value = props.segundos;
    cronometro = setInterval(() => {
      restante.value -= 1;
      if (restante.value <= 0) ocultar();
    }, 1000);
  } catch (e) {
    showToast(e?.message || `Error al revelar la ${props.etiqueta}`, 'error');
  } finally {
    pidiendo.value = false;
  }
}

// Copiar pide su PROPIO revelado con motivo 'copiar' en vez de reusar el
// valor ya visible: son dos accesos distintos y la auditoría tiene que
// poder distinguirlos (quién solo la miró y quién se la llevó al
// portapapeles). Cuesta una llamada más y es el punto de todo el módulo.
async function copiar() {
  if (pidiendo.value) return;
  pidiendo.value = true;
  try {
    const secreto = await props.revelar('copiar');
    await navigator.clipboard.writeText(secreto);
    showToast(`${props.etiqueta.charAt(0).toUpperCase()}${props.etiqueta.slice(1)} copiada`);
  } catch (e) {
    showToast(e?.message || 'No se pudo copiar', 'error');
  } finally {
    pidiendo.value = false;
  }
}

// Cambiar de pestaña oculta la credencial. No es paranoia de manual: este
// panel se usa con la pantalla compartida, y una pestaña de fondo con una
// clave en claro es una captura esperando a pasar.
function alOcultarsePestana() {
  if (document.hidden) ocultar();
}
document.addEventListener('visibilitychange', alOcultarsePestana);

// Si el permiso se cae mientras la credencial está a la vista (el JEFE
// revoca `credenciales.ver` y el store se recarga en la navegación
// siguiente), se oculta.
watch(() => props.bloqueado, (bloqueado) => { if (bloqueado) ocultar(); });

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', alOcultarsePestana);
  ocultar();
});
</script>

<template>
  <div class="cds-cred">
    <span v-if="valor" class="cds-cred__valor">{{ valor }}</span>
    <span v-else class="cds-cred__oculto" aria-hidden="true">••••••••</span>

    <template v-if="!bloqueado">
      <button
        class="cds-cred__accion"
        type="button"
        :disabled="pidiendo"
        :title="valor ? `Ocultar ${etiqueta}` : `Mostrar ${etiqueta}`"
        :aria-label="valor ? `Ocultar ${etiqueta}` : `Mostrar ${etiqueta}`"
        @click="mostrar"
      >
        <i :class="valor ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
      </button>
      <button
        class="cds-cred__accion"
        type="button"
        :disabled="pidiendo"
        :title="`Copiar ${etiqueta}`"
        :aria-label="`Copiar ${etiqueta}`"
        @click="copiar"
      >
        <i class="ti ti-copy" aria-hidden="true"></i>
      </button>

      <!-- Cuenta regresiva. `aria-live="off"`: un contador que cambia cada
           segundo en un lector de pantalla es ruido continuo que tapa todo
           lo demás. El aviso útil va una sola vez, en el título del botón,
           cuando la credencial ya está visible. -->
      <span v-if="valor" class="cds-cred__cuenta" aria-live="off">
        <span class="cds-cred__segundos">{{ restante }}s</span>
        <span
          class="cds-cred__barra"
          :style="{ transform: `scaleX(${restante / segundos})` }"
          aria-hidden="true"
        ></span>
      </span>
    </template>

    <span
      v-else
      class="cds-cred__candado"
      role="img"
      :aria-label="motivoBloqueo"
      :title="motivoBloqueo"
    >
      <i class="ti ti-lock" aria-hidden="true"></i>
    </span>
  </div>
</template>

<style scoped>
.cds-cred {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

/* La credencial en claro va en IBM Plex Mono: es una cadena que se
   transcribe carácter por carácter, y la diferencia entre l/1/I o O/0 en
   una proporcional es exactamente el error que se paga después.
   `user-select: all` para poder tomarla completa con un clic; `break-all`
   porque una clave larga no debe estirar la celda. */
.cds-cred__valor {
  font-family: var(--font-mono);
  font-size: var(--fs-label-01);
  color: var(--color-text-primary);
  user-select: all;
  word-break: break-all;
  min-width: 0;
}

.cds-cred__oculto {
  font-family: var(--font-mono);
  font-size: var(--fs-label-01);
  color: var(--color-text-tertiary);
  letter-spacing: 0.16px;
}

/* Botón de ícono del sistema (mismas medidas que .icon-btn de main.css,
   con la geometría de Carbon). No reusa .icon-btn porque esta familia sí
   necesita el estado :disabled mientras la petición está en vuelo. */
.cds-cred__accion {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--space-9);
  height: var(--space-9);
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-base);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: var(--icon-sm);
  transition: background 0.11s, color 0.11s;
}

.cds-cred__accion:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.cds-cred__accion:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

.cds-cred__accion:disabled {
  color: var(--color-text-disabled);
  cursor: default;
}

/* ── Cuenta regresiva ─────────────────────────────────────────
   Número + barra de 2px que se vacía. La barra sola no dice cuánto falta
   en segundos y el número solo no se percibe de reojo; juntas, una mirada
   periférica alcanza. */
.cds-cred__cuenta {
  display: inline-flex;
  flex-direction: column;
  gap: var(--space-1);
  flex-shrink: 0;
  width: var(--space-10);
}

.cds-cred__segundos {
  font-family: var(--font-mono);
  font-size: var(--fs-label-01);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
  text-align: center;
}

.cds-cred__barra {
  height: 2px;
  background: var(--color-accent);
  transform-origin: left;
  transition: transform 1s linear;
}

.cds-cred__candado {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 var(--space-3);
  color: var(--color-text-tertiary);
  font-size: var(--icon-sm);
}

@media (prefers-reduced-motion: reduce) {
  .cds-cred__barra {
    transition: none;
  }
}
</style>
