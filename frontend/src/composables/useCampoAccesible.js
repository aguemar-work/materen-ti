// Cableado accesible de un campo de formulario — lógica pura, sin componente
// ni markup. Extraída de components/carbon/CarbonCampo.vue al retirar esa
// librería (reinicio de diseño, 2026-09-05).
//
// A propósito NO incluye lo que ese componente resolvía por ser un
// WRAPPER (inheritAttrs/v-bind="$attrs", defineExpose({focus})): sin
// componente envoltorio esos problemas no existen — el `<input>` de la
// vista recibe sus atributos directo, y una template ref sobre él ya es el
// elemento nativo. Lo único que seguía siendo lógica real (no un efecto
// secundario de envolver) es el id estable + el cableado aria-describedby +
// cuándo el campo cuenta como inválido — eso es lo que queda acá.
//
// USO
//   const { id, idAyuda, invalido, describedBy } = useCampoAccesible({
//     error: () => errores.value.nombre,
//     ayuda: () => 'Como aparece en el DNI',
//   });
// y la vista pinta su propio <label :for="id">/<input :id :aria-describedby="describedBy">/
// <p :id="idAyuda" role="alert si invalido">.
import { computed, useId, toValue } from 'vue';

export function useCampoAccesible({ error = () => '', ayuda = () => '' } = {}) {
  // useId(): estable entre el render del servidor y el del cliente, y único
  // aunque el mismo campo se monte dos veces (tabla + tarjeta móvil renderizan
  // el mismo formulario en algunas vistas).
  const id = useId();
  const idAyuda = computed(() => `${id}-ayuda`);
  const invalido = computed(() => Boolean(toValue(error)));

  // Un solo id de descripción para ayuda y error, y el error gana: dos líneas
  // debajo del campo (una explicando cómo llenarlo y otra diciendo que está
  // mal) compiten justo cuando hay que corregir algo.
  const describedBy = computed(() => (
    (toValue(ayuda) || toValue(error)) ? idAyuda.value : undefined
  ));

  return { id, idAyuda, invalido, describedBy };
}
