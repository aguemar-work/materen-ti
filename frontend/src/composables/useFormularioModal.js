// Andamiaje común de los formularios que viven en un <Modal>: la referencia
// al modal, la detección de cambios sin guardar y el flujo de descarte con
// confirmación.
//
// Los 7 formularios sobre <Modal> (AccesoSensible, Correo, Cuenta, Empleado,
// Encuesta, KbArticulo, Problema) tenían este bloque copiado byte a byte
// (ARQ-07, ver docs/HISTORIAL-AUDITORIAS.md). EquipoForm.vue, LicenciaForm.vue
// y TicketInternoForm.vue lo usan también desde su migración a <Modal>
// (auditoría ago 2026, hallazgo UX6-03 en docs/HISTORIAL-AUDITORIAS.md).
//
// Uso:
//   const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte,
//           confirmarCierre, cancelar, descartarCambios } =
//     useFormularioModal(() => form.value);
//
// `fuente` es la misma que recibiría useDetectorDeCambios: una función que
// devuelve lo que hay que vigilar (el form, o un objeto con el form más
// otros controles del formulario).
import { ref } from 'vue';
import { useDetectorDeCambios } from './useDetectorDeCambios.js';

export function useFormularioModal(fuente) {
  const modal = ref(null);
  const { estaSucio, tomarSnapshot } = useDetectorDeCambios(fuente);
  const confirmarDescarte = ref(false);
  const dialogoDescarte = ref(null);

  // Todas las salidas del modal (Cancelar, la X, Escape, backdrop) pasan por
  // acá — se pasa como `:confirmar-cierre` a <Modal>: con cambios sin
  // guardar pide confirmación antes de descartar; limpio cierra directo.
  function confirmarCierre() {
    if (estaSucio.value) {
      confirmarDescarte.value = true;
      return false;
    }
    return true;
  }

  function cancelar() {
    if (confirmarCierre()) modal.value?.cerrar();
  }

  function descartarCambios() {
    dialogoDescarte.value?.cerrar();
    modal.value?.cerrar();
  }

  return { modal, estaSucio, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios };
}
