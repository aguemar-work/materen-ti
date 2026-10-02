<script setup>
// Tarjeta móvil de un equipo en el listado (< 768 px): toda la tarjeta abre la
// hoja de vida; la acción contextual y el ⋮ quedan a mano. Misma información
// que la fila de la tabla (EquiposTabla.vue), apilada.
import { situacionInfo, nombreEquipo } from '../../core/dominio-equipos.js';
import { rolDeTag } from '../../core/tagRol.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import EquipoAsignacion from './EquipoAsignacion.vue';

defineProps({
  equipo: { type: Object, required: true },
  acciones: { type: Object, required: true },
});
defineEmits(['abrir']);

function estadoFisico(eq) {
  if (eq.estado === 'operativo') return { label: 'Operativo', clase: 'badge--success' };
  return situacionInfo(eq.estado);
}

function etiquetaCorta(accion) {
  return accion.label.replace(' a un empleado', '').replace(' (operativo)', '').replace('Registrar devolución', 'Devolución');
}
</script>

<template>
  <li
    class="flex cursor-pointer flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    tabindex="0"
    @keydown.enter.self="$emit('abrir', equipo)"
    @click="$emit('abrir', equipo)"
  >
    <div class="flex items-start gap-3">
      <a
        v-if="equipo.fotos.length"
        class="block h-12 w-12 shrink-0 overflow-hidden rounded-md bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :href="equipo.fotos[0].url"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="`Ver foto de ${equipo.codigo}`"
        @click.stop
      >
        <img :src="equipo.fotos[0].url" alt="" class="h-full w-full object-cover">
      </a>
      <div class="min-w-0 flex-1">
        <div class="truncate font-medium text-gray-900" :title="nombreEquipo(equipo)">{{ nombreEquipo(equipo) }}</div>
        <div class="truncate text-xs text-gray-500 tabular-nums">
          <AppCodigo :valor="equipo.codigo" titulo="Código de equipo" />
          <template v-if="equipo.serie"> · S/N {{ equipo.serie }}</template>
        </div>
        <div v-if="equipo.empresa_nombre || equipo.codigo_almacen" class="truncate text-xs text-gray-500 tabular-nums">
          {{ [equipo.codigo_almacen ? `Alm. ${equipo.codigo_almacen}` : '', equipo.empresa_nombre].filter(Boolean).join(' · ') }}
        </div>
      </div>
      <div class="-mr-1 -mt-1" @click.stop>
        <MenuAcciones :acciones="acciones.accionesDe(equipo)" :label="`Acciones de ${equipo.codigo}`" />
      </div>
    </div>

    <div class="mt-3 flex min-h-8 items-center gap-2 text-sm" @click.stop>
      <EquipoAsignacion :equipo="equipo" :acciones="acciones" tarjeta />
    </div>

    <div class="mt-3 flex min-h-8 items-center justify-between gap-2 border-t border-gray-100 pt-3">
      <AppTag :tono="rolDeTag(estadoFisico(equipo).clase)" punto>{{ estadoFisico(equipo).label }}</AppTag>
      <div class="-my-1 -mr-2" @click.stop>
        <AppButton
          v-if="acciones.accionPrincipalDe(equipo)"
          size="sm"
          variant="text"
          severity="secondary"
          :icon="`ti ${acciones.accionPrincipalDe(equipo).icono}`"
          :label="etiquetaCorta(acciones.accionPrincipalDe(equipo))"
          :aria-label="`${acciones.accionPrincipalDe(equipo).label} — ${equipo.codigo}`"
          @click="acciones.accionPrincipalDe(equipo).onClick()"
        />
      </div>
    </div>
  </li>
</template>
