// Mecánica compartida de los popovers teletransportados a <body>
// (MenuAcciones.vue, NotificacionesCampana.vue): abrir/cerrar, posicionar
// contra el trigger, cerrar al puntear afuera, al presionar Escape
// (devolviendo el foco al trigger) y al redimensionar.
//
// Hasta ago 2026 los dos componentes tenían su propia copia de todo esto,
// idéntica salvo la política de alineación — un fix de accesibilidad o de
// posicionamiento había que aplicarlo dos veces (ARQ-08, ver
// docs/HISTORIAL-AUDITORIAS.md). No alcanzaba con lo que usan los modales
// (`Modal.vue`, foco atrapado en un diálogo), porque acá es un popover
// anclado a un botón, no un diálogo.
//
// Lo que NO absorbe, por ser propio de cada uno: dónde se ancla el panel
// (`alinear`) y qué otras teclas maneja (`alTeclear` — ej. las flechas de
// un `role="menu"`).
import { ref, nextTick, onBeforeUnmount } from 'vue';

// alinear(rectTrigger, rectPanel) → { top, left } en coordenadas de
//   viewport (el panel se posiciona con position: fixed).
// cerrarConScroll: cerrar cuando la página scrollea (el popover se
//   desancla); el scroll interno del propio panel nunca cierra.
// alTeclear(evento): teclas además de Escape, ya con el popover abierto.
// alAbrir(): efecto tras posicionar (ej. mover el foco al primer ítem).
export function usePopoverFlotante({ alinear, cerrarConScroll = false, alTeclear = null, alAbrir = null } = {}) {
  const abierto = ref(false);
  const trigger = ref(null);
  const panel = ref(null);
  const coords = ref({ top: 0, left: 0 });

  function posicionar() {
    if (!trigger.value || !panel.value) return;
    coords.value = alinear(trigger.value.getBoundingClientRect(), panel.value.getBoundingClientRect());
  }

  function onDocPointer(e) {
    if (trigger.value?.contains(e.target) || panel.value?.contains(e.target)) return;
    cerrar();
  }

  function onScroll(e) {
    // El scroll de la página desancla el popover; el scroll interno no.
    if (panel.value?.contains(e.target)) return;
    cerrar();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      // stopPropagation: si el popover vive dentro de un modal, Escape lo
      // cierra a él primero, no al modal entero.
      e.stopPropagation();
      cerrar();
      trigger.value?.focus();
      return;
    }
    alTeclear?.(e);
  }

  async function abrir() {
    abierto.value = true;
    await nextTick(); // el panel recién existe tras el v-if
    posicionar();
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKeydown, true);
    if (cerrarConScroll) window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', cerrar);
    alAbrir?.();
  }

  function cerrar() {
    if (!abierto.value) return;
    abierto.value = false;
    document.removeEventListener('pointerdown', onDocPointer, true);
    document.removeEventListener('keydown', onKeydown, true);
    if (cerrarConScroll) window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', cerrar);
  }

  function alternar() {
    if (abierto.value) cerrar();
    else abrir();
  }

  onBeforeUnmount(cerrar);

  return { abierto, trigger, panel, coords, abrir, cerrar, alternar, posicionar };
}
