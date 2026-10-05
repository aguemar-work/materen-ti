<script setup>
// Fila de un equipo en "En custodia". El código abre su hoja de vida
// (`/equipos/:id`); debajo va el estado del acta de entrega: "acta firmada ✓"
// o el enlace "Adjuntar acta" a la ruta imprimible (`/equipos/:id/acta/
// :asignacionId?tipo=entrega`, donde se imprime y se sube la firmada).
import { computed } from 'vue';
import { formatFechaLibro } from '../../core/formatters.js';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';

const props = defineProps({
  equipo: { type: Object, required: true },
  // Acta de entrega firmada de esta asignación, o null si aún no se adjuntó.
  acta: { type: Object, default: null },
  acciones: { type: Array, required: true },
});

const descripcion = computed(() => [props.equipo.tipo, props.equipo.marca, props.equipo.modelo].filter(Boolean).join(' '));
const rutaActa = computed(() => `/equipos/${props.equipo.equipo_id}/acta/${props.equipo.asignacion_id}?tipo=entrega`);
const desde = computed(() => formatFechaLibro(props.equipo.fecha_inicio).fecha);
</script>

<template>
  <tr class="border-b border-gray-100 align-top" data-custodia="equipo">
    <td class="px-3 py-2 text-xs text-gray-500">Equipo</td>

    <td class="px-3 py-2">
      <RouterLink
        :to="`/equipos/${equipo.equipo_id}`"
        class="rounded-sm text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      ><AppCodigo :valor="equipo.codigo" titulo="Código del equipo" /></RouterLink>
      <p class="mt-1 text-xs text-gray-500 sm:hidden">{{ descripcion }} · desde {{ desde }}</p>
      <p class="mt-1 text-xs">
        <RouterLink
          v-if="acta"
          :to="rutaActa"
          class="rounded-sm text-gray-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >acta firmada ✓</RouterLink>
        <RouterLink
          v-else
          data-no-print
          :to="rutaActa"
          class="rounded-sm text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >Adjuntar acta</RouterLink>
      </p>
    </td>

    <td class="hidden px-3 py-2 sm:table-cell">
      <div class="text-gray-900">{{ descripcion }}</div>
      <div v-if="equipo.estado && equipo.estado !== 'operativo'" class="mt-1">
        <BadgeEstado tipo="situacion" :valor="equipo.situacion" />
      </div>
    </td>

    <td class="hidden px-3 py-2 text-xs tabular-nums text-gray-500 sm:table-cell">{{ desde }}</td>

    <td class="px-3 py-2 text-right" data-no-print>
      <MenuAcciones :acciones="acciones" :label="`Acciones del equipo ${equipo.codigo}`" />
    </td>
  </tr>
</template>
