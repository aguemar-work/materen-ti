<script setup>
// Badge semántico por dominio. Resuelve QUÉ tono le toca a un valor
// ("ticket cerrado" → neutral) y delega el render en components/ui/AppTag.vue.
//
// La división es a propósito y es la misma de toda la capa de diseño: acá
// vive el conocimiento de DOMINIO (vía core/badges.js → core/dominio-*.js),
// en AppTag el de PRESENTACIÓN. Por eso este componente no tiene ni una
// regla de estilo: si un tag tiene que verse distinto, se cambia en AppTag y
// cambia en todos lados (BadgeEstado y los tags sueltos de cada vista); si
// un estado tiene que significar otro color, se cambia en su
// core/dominio-*.js.
//
// Historia corta: hasta el 2026-09-24 pintaba clases heredadas de Carbon
// (`.cds-tag--<rol>`) definidas en styles/componentes.css — un segundo
// sistema de tags en paralelo a AppTag, con los mismos colores escritos dos
// veces. Ahora hay uno solo. API pública sin cambios (`tipo`, `valor`,
// `status`, fallthrough de `class`).
//
//   · `status` es el `punto` de AppTag (estado "vivo": Activo/Inactivo...).
//   · Un valor que su dominio no conoce (los fallbacks `clase: ''` de
//     dominio-equipos y dominio-accesos-sensibles) cae a `neutral`: un
//     estado desconocido tiene que seguir viéndose como un estado.
import { computed } from 'vue';
import AppTag from '../ui/AppTag.vue';
import { badgeInfo } from '../../core/badges.js';
import { rolDeTag } from '../../core/tagRol.js';

const props = defineProps({
  /** empleado | ticket | prioridad | situacion | tipo_cuenta | tipo_ubicacion |
   *  categoria_acceso_sensible | kb_estado | problema_estado |
   *  problema_severidad | accion_estado | activo_staff | ticket_sin_vincular */
  tipo: { type: String, required: true },
  valor: { type: [String, Boolean], default: '' },
  /** Punto de estado "vivo" (Activo/Inactivo/Suspendido, requiere rotación). */
  status: { type: Boolean, default: false },
});

// Rol del dominio (`badge--success` → 'success') → tono de AppTag. Los
// nombres coinciden 1:1; `accent` era un alias histórico de `info` (mismos
// colores) y cualquier rol que AppTag no conozca degrada a `neutral` en vez
// de disparar el validador del prop.
const TONOS_APPTAG = new Set(['neutral', 'success', 'warning', 'danger', 'info', 'purple', 'sky', 'teal']);
const ALIAS = { accent: 'info' };

const info = computed(() => badgeInfo(props.tipo, props.valor));
const tono = computed(() => {
  const rol = rolDeTag(info.value.clase);
  const normalizado = ALIAS[rol] ?? rol;
  return TONOS_APPTAG.has(normalizado) ? normalizado : 'neutral';
});
</script>

<template>
  <AppTag :tono="tono" :punto="status">{{ info.label }}</AppTag>
</template>
