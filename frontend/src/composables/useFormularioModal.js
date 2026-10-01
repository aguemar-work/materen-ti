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
// Errores al guardar: `mensajeError(e, { entidad, porDefecto })` es la única
// forma de convertir el error de un `guardar()` en el texto del formulario
// (api/erroresDb.js: 42501, P0001, 23505…). Nunca `e?.message` a secas: un
// error de PostgREST llegaría en inglés. `ejecutarGuardado(accion, opciones)`
// envuelve el patrón completo (guardando/error/try/catch) para los
// formularios que no necesitan más lógica; devuelve el resultado de la
// acción, o `undefined` si falló (y deja el texto en `error`).
//
// `fuente` es la misma que recibiría useDetectorDeCambios: una función que
// devuelve lo que hay que vigilar (el form, o un objeto con el form más
// otros controles del formulario).
import { ref } from 'vue';
import { useDetectorDeCambios } from './useDetectorDeCambios.js';
import { traducirErrorDb } from '../api/erroresDb.js';

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

  const guardando = ref(false);
  const error = ref('');

  function mensajeError(e, opciones = {}) {
    return traducirErrorDb(e, opciones).mensaje;
  }

  async function ejecutarGuardado(accion, opciones = {}) {
    error.value = '';
    guardando.value = true;
    try {
      return await accion();
    } catch (e) {
      error.value = mensajeError(e, opciones);
      return undefined;
    } finally {
      guardando.value = false;
    }
  }

  return { guardando, error, mensajeError, ejecutarGuardado, modal, estaSucio, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios };
}
