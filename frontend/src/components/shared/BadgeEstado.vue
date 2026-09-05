<script setup>
// Badge semántico por dominio. Resuelve QUÉ color le toca a un valor
// ("ticket cerrado" → neutral) y delega el render en CarbonTag.
//
// La división es a propósito y es la misma de toda la capa de diseño: acá
// vive el conocimiento de DOMINIO (vía core/badges.js → core/dominio-*.js),
// allá el de PRESENTACIÓN. Por eso este componente no tiene ni una regla de
// estilo: si un tag tiene que verse distinto, se cambia en CarbonTag y
// cambia en todos lados; si un estado tiene que significar otro color, se
// cambia en su core/dominio-*.js.
//
// Delegó a CarbonTag el 2026-09-02 (antes escribía `.badge` de main.css).
// Dos cambios que trae:
//   · `status` pasa a ser el `punto` de CarbonTag, que usa el color SÓLIDO
//     de soporte de Carbon en vez del `currentColor` de `.status` — el
//     punto pesa más que el texto y se ve antes en una tabla densa.
//   · Un valor que su dominio no conoce (los fallbacks `clase: ''` de
//     dominio-equipos y dominio-accesos-sensibles) ahora cae a `neutral` en
//     vez de renderizar un badge sin fondo. Un estado desconocido era el
//     único que no se veía como un estado.
import { computed } from 'vue';
import { badgeInfo } from '../../core/badges.js';
import CarbonTag from '../carbon/CarbonTag.vue';

const props = defineProps({
  /** empleado | ticket | prioridad | situacion | tipo_cuenta | tipo_ubicacion |
   *  categoria_acceso_sensible | kb_estado | problema_estado |
   *  problema_severidad | accion_estado | activo_staff | ticket_sin_vincular */
  tipo: { type: String, required: true },
  valor: { type: [String, Boolean], default: '' },
  /** Punto de estado "vivo" (Activo/Inactivo/Suspendido, requiere rotación). */
  status: { type: Boolean, default: false },
  // El prop `inline` se retiró el 2026-09-02: no lo usaba NADIE (los 8 sitios
  // que quieren el tag dentro de una línea de texto escriben
  // `class="badge-inline"` directo, que ahora sí existe en main.css). Un prop
  // sin un solo consumidor es API que hay que mantener sin que nadie la pida.
});

const info = computed(() => badgeInfo(props.tipo, props.valor));
</script>

<template>
  <CarbonTag :variante="info.clase" :punto="status">{{ info.label }}</CarbonTag>
</template>
