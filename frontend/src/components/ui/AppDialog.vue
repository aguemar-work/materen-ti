<script>
// Estado compartido por TODAS las instancias abiertas: el scroll del fondo se
// libera solo cuando se cierra el último diálogo (uno sobre otro no debe
// devolverle el scroll al fondo cuando se cierra el de arriba).
// Contador propio para los ids: useId() repite valores entre apps montadas por
// separado (tests, microfrontends) y el id tiene que ser único en el documento.
let secuenciaId = 0;
function siguienteId() {
  secuenciaId += 1;
  return `ad-${secuenciaId}`;
}
let bloqueosScroll = 0;
function bloquearScroll() {
  bloqueosScroll += 1;
  document.body.style.overflow = 'hidden';
}
function liberarScroll() {
  bloqueosScroll = Math.max(0, bloqueosScroll - 1);
  if (bloqueosScroll === 0) document.body.style.overflow = '';
}
</script>

<script setup>
// Diálogo único del sistema para formularios y paneles (centrado o lateral),
// sobre primevue/dialog Unstyled + Tailwind (preset buildFormDialogPT en
// pt/dialog.pt.js). Unifica a components/shared/Modal.vue (decisión del dueño,
// 2026-10-01): es un SUPERCONJUNTO de su API, así que migrar un consumidor es
// cambiar la etiqueta `<Modal>` por `<AppDialog>`. Las confirmaciones sí/no
// siguen en ConfirmDialog.vue (mismo Dialog, preset más angosto).
//
// Contrato (idéntico al de Modal, para useFormularioModal.js):
//   - `cerrar()` (expuesto) cierra SIN preguntar: es el camino del éxito
//     ("guardó y cierra") y el que usa `descartarCambios()`.
//   - Escape, la X, el clic en el fondo y cualquier otra salida del usuario
//     pasan por `confirmarCierre`; si devuelve `false` el diálogo NO se cierra
//     (el padre muestra su propio "cambios sin guardar").
//   - `cancelar()` de useFormularioModal ya consulta `confirmarCierre()` antes
//     de llamar a `cerrar()`, así que `cerrar()` no lo vuelve a consultar.
//   - `close` y `cerrado` se emiten UNA vez, en todo cierre (éxito o
//     cancelación), al terminar la animación de salida: el padre desmonta
//     con v-if recién ahí (@cerrado="..." es el nombre del contrato de
//     ConfirmDialog; @close se conserva por compatibilidad con Modal). Un
//     temporizador de respaldo evita que el padre quede esperando si el
//     navegador pausa la animación (pestaña en segundo plano).
//
// Diferencias deliberadas con Modal:
//   - El foco atrapado, role="dialog" y aria-modal los resuelve PrimeVue.
//   - Escape lo atiende solo el diálogo de más arriba (antes un Modal debajo de
//     otro también se cerraba) y NO lo atiende si un componente interno ya lo
//     consumió con stopPropagation (popovers, listas desplegables).
//   - El panel va en z-50 (como Modal), no en el z-index 1100 automático de
//     PrimeVue: las listas flotantes (BuscadorCombo, z-60) quedaban DEBAJO.
//   - Un solo `:visible` de una vía: con v-model, el veto de confirmarCierre
//     llegaba tarde (la ref ya se había puesto en false).
// Los slots `titulo`, `default` y `acciones` (alias `pie` y `footer`) son los
// de Modal. El foco inicial va al primer control del cuerpo (o del pie) que no
// sea la X; un `autofocus` puesto por el formulario manda sobre eso. Los slots
// se leen al montar (el pie no puede aparecer o desaparecer después).
import { computed, onBeforeUnmount, onMounted, ref, useSlots } from 'vue';
import Dialog from 'primevue/dialog';
import { buildFormDialogPT } from './pt/dialog.pt.js';

const props = defineProps({
  // Título simple; para uno compuesto (ícono + texto) usar el slot #titulo.
  titulo: { type: String, default: '' },
  // Nombre accesible cuando NO hay título visible.
  ariaLabel: { type: String, default: '' },
  // '' | 'sm' | 'md' | 'lg' | 'detail' — mismos anchos que .modal-<size>.
  size: { type: String, default: '' },
  cerrarEnBackdrop: { type: Boolean, default: true },
  mostrarCerrar: { type: Boolean, default: true },
  // 'modal-anim' (estándar) | 'modal-anim-rapida' (diálogos sobre otro
  // diálogo). Con `lateral` se ignora: el panel siempre entra por la derecha.
  transicion: { type: String, default: 'modal-anim' },
  // Guard de Escape / X / fondo: si devuelve `false`, el diálogo no se cierra.
  confirmarCierre: { type: Function, default: null },
  // Drawer: panel acoplado al borde derecho, alto completo. `size` controla
  // el ancho (`detail`, 620px, es el uso típico); en pantallas de 480px o
  // menos ocupa todo el ancho.
  lateral: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'cerrado']);

const slots = useSlots();
const dialogId = siguienteId();
const tituloId = `${dialogId}-titulo`;

const visible = ref(true);
const conCabecera = computed(() => !!(props.titulo || slots.titulo));
const conPie = !!(slots.acciones || slots.pie || slots.footer);

const pt = computed(() =>
  buildFormDialogPT({
    size: props.size,
    lateral: props.lateral,
    conCabecera: conCabecera.value,
    conPie,
    saliendo: !visible.value,
    rapida: props.transicion === 'modal-anim-rapida',
  }),
);

// ── Cierre ──────────────────────────────────────────────────────────────────
let emitido = false;
let respaldo = null;
let bloqueado = false;

function emitirCerrado() {
  if (emitido) return;
  emitido = true;
  clearTimeout(respaldo);
  emit('close');
  emit('cerrado');
}

function soltarScroll() {
  if (!bloqueado) return;
  bloqueado = false;
  liberarScroll();
}

// Cierre incondicional (flujo de éxito). No pasa por confirmarCierre.
function cerrar() {
  if (!visible.value) return;
  visible.value = false;
  soltarScroll();
  respaldo = setTimeout(emitirCerrado, 400);
}

function intentarCerrar() {
  if (props.confirmarCierre && props.confirmarCierre() === false) return;
  cerrar();
}

// PrimeVue avisa `update:visible(false)` con la X, el clic en el fondo y
// Escape (este último desactivado: lo atiende onKeydown). Como `visible` es
// de una vía, si el guard veta, Dialog simplemente sigue recibiendo `true`.
function onUpdateVisible(v) {
  if (!v) intentarCerrar();
}

defineExpose({ cerrar });

// ── Teclado ─────────────────────────────────────────────────────────────────
function onKeydown(e) {
  if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || !visible.value) return;
  // Solo el diálogo de más arriba: otro (ConfirmDialog de descarte, otro
  // AppDialog) puede estar encima y es ese el que debe atender la tecla.
  const abiertos = document.querySelectorAll('[role="dialog"]');
  const ultimo = abiertos[abiertos.length - 1];
  if (ultimo && ultimo.id !== dialogId) return;
  intentarCerrar();
}

// ── Foco ────────────────────────────────────────────────────────────────────
const SELECTOR_FOCO =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const prevActivo = typeof document !== 'undefined' ? document.activeElement : null;

function esVisible(el) {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

// Dialog enfoca el primer `[autofocus]` que encuentre (pie, cabecera,
// cuerpo) y, si no hay ninguno, la X. Aquí se marca el primer control útil
// del cuerpo (o, si no hay, del pie): así en un formulario cae en el primer
// campo y no en la X, igual que Modal.
function onShow() {
  const raiz = document.getElementById(dialogId);
  if (!raiz || raiz.querySelector('[autofocus]')) return;
  for (const seccion of ['content', 'footer']) {
    const zona = raiz.querySelector(`[data-pc-section="${seccion}"]`);
    const el = zona && [...zona.querySelectorAll(SELECTOR_FOCO)].find(esVisible);
    if (el) {
      el.setAttribute('autofocus', '');
      return;
    }
  }
  // Nada enfocable: el panel mismo (tabindex -1) conserva el foco dentro.
  raiz.focus();
}

onMounted(() => {
  bloqueado = true;
  bloquearScroll();
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  clearTimeout(respaldo);
  soltarScroll();
  // Dialog devuelve el foco en su animación de salida; si el padre desmontó
  // antes de que corriera (v-if inmediato), se hace aquí.
  const activo = document.activeElement;
  const raiz = document.getElementById(dialogId);
  const sinDestino = !activo || activo === document.body || (raiz && raiz.contains(activo));
  if (sinDestino && prevActivo?.isConnected && typeof prevActivo.focus === 'function') prevActivo.focus();
});
</script>

<template>
  <Dialog
    :id="dialogId"
    :visible="visible"
    modal
    :draggable="false"
    :auto-z-index="false"
    :close-on-escape="false"
    :position="lateral ? 'right' : 'center'"
    :dismissable-mask="cerrarEnBackdrop"
    :closable="mostrarCerrar"
    :show-header="conCabecera"
    :aria-labelledby="conCabecera ? tituloId : undefined"
    :aria-label="conCabecera ? undefined : ariaLabel || undefined"
    :pt="pt"
    @update:visible="onUpdateVisible"
    @show="onShow"
    @after-hide="emitirCerrado"
  >
    <template #header>
      <span :id="tituloId" class="text-base font-semibold text-gray-900"><slot name="titulo">{{ titulo }}</slot></span>
    </template>
    <template #closebutton>
      <button class="icon-btn" type="button" aria-label="Cerrar" @click="intentarCerrar">
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </template>

    <slot />

    <template v-if="conPie" #footer>
      <slot name="acciones"><slot name="pie"><slot name="footer" /></slot></slot>
    </template>
  </Dialog>
</template>
