// Dirty-tracking para formularios en modal (Fase 2 de la protección contra
// pérdida de datos; complementa useCerrarConEscape). Compara el estado actual
// del formulario contra un snapshot serializado del estado inicial.
//
// `obtenerEstado` debe devolver un objeto serializable con TODO lo que el
// usuario puede editar (form, toggles de modo, selecciones), excluyendo texto
// transitorio de buscadores. tomarSnapshot() se llama cuando el formulario
// queda poblado (al final de resetForm, tanto en creación como en edición —
// nunca antes de cargar los datos existentes) y tras un guardado exitoso,
// para que cerrar después de guardar no pida confirmación.
import { ref, computed } from 'vue';

export function useDetectorDeCambios(obtenerEstado) {
  const snapshot = ref(null);

  function tomarSnapshot() {
    snapshot.value = JSON.stringify(obtenerEstado());
  }

  // true solo ante una diferencia real: si el usuario cambia un campo y lo
  // vuelve a dejar como estaba, regresa a false.
  const estaSucio = computed(
    () => snapshot.value !== null && JSON.stringify(obtenerEstado()) !== snapshot.value,
  );

  return { estaSucio, tomarSnapshot };
}
