// Foco atrapado para modales hand-rolled (Fase 4, hallazgo MOD-1 de la
// auditoría; los modales sobre <Modal> compartido ya lo traen resuelto).
//
// Al activar: guarda el elemento que tenía el foco (normalmente el botón que
// abrió el modal), mueve el foco al primer foco-able del panel que no sea la
// "X" de cerrar (respaldo: el propio panel, que debe tener tabindex="-1"), y
// cicla Tab/Shift+Tab entre el primero y el último foco-able.
// Al desactivar: quita el listener y devuelve el foco al elemento guardado.
//
// Uso:
//   useFocoAtrapado(panelRef)          → atrapa durante toda la vida del
//     componente (modales-componente montados con v-if en el padre).
//   useFocoAtrapado(panelRef, flagRef) → sigue el flag reactivo (modales
//     inline que abren/cierran con v-if dentro de una vista).
import { onMounted, onBeforeUnmount, watch, nextTick, unref } from 'vue';

export function useFocoAtrapado(contenedor, activo = null) {
  let focoPrevio = null;
  let atrapando = false;

  function focoables() {
    const raiz = unref(contenedor);
    if (!raiz) return [];
    return Array.from(
      raiz.querySelectorAll(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);
  }

  // Igual que en Modal.vue: solo interviene en los bordes del ciclo, así un
  // diálogo apilado encima (ConfirmDialog) maneja su propio Tab sin choques.
  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const f = focoables();
    if (!f.length) {
      e.preventDefault();
      unref(contenedor)?.focus();
      return;
    }
    const primero = f[0];
    const ultimo = f[f.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  async function activar() {
    if (atrapando) return;
    atrapando = true;
    focoPrevio = document.activeElement;
    document.addEventListener('keydown', onKeydown, true);
    // nextTick: en modales inline el panel recién se renderiza tras el flag
    await nextTick();
    const f = focoables();
    // El foco inicial evita la "X" (aria-label="Cerrar"): en un form cae en
    // el primer campo y en una confirmación destructiva cae en Cancelar.
    const inicial = f.find((el) => el.getAttribute('aria-label') !== 'Cerrar') || f[0] || unref(contenedor);
    inicial?.focus();
  }

  function desactivar() {
    if (!atrapando) return;
    atrapando = false;
    document.removeEventListener('keydown', onKeydown, true);
    if (focoPrevio && typeof focoPrevio.focus === 'function') focoPrevio.focus();
    focoPrevio = null;
  }

  if (activo) {
    watch(activo, (v) => (v ? activar() : desactivar()));
  } else {
    onMounted(activar);
  }
  onBeforeUnmount(desactivar);

  return { activar, desactivar };
}
