<script setup>
// «Mis accesos» del portal del empleado (migración 109): plataforma y usuario de
// las cuentas que tiene asignadas. NUNCA la contraseña ni la URL: la contraseña
// se entrega aparte, por el enlace de entrega de un solo uso. El servidor tampoco
// las envía; este texto solo se lo aclara a quien mira.
import { useId } from 'vue';

defineProps({
  accesos: { type: Array, default: () => [] },
});

const idTitulo = useId();
</script>

<template>
  <section :aria-labelledby="idTitulo">
    <h2 :id="idTitulo" class="text-sm font-semibold text-gray-900">Mis accesos</h2>

    <p v-if="!accesos.length" class="mt-2 text-sm text-gray-500">No tiene cuentas asignadas.</p>

    <ul v-else class="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
      <li v-for="(a, i) in accesos" :key="i" class="px-4 py-3">
        <p class="text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">{{ a.plataforma }}</p>
        <p class="cred__valor mt-0.5">{{ a.usuario }}</p>
      </li>
    </ul>

    <p class="mt-3 text-xs text-gray-500">
      Aquí se muestran el servicio y el usuario. La contraseña no aparece en esta página: TI se la entrega
      aparte, por el enlace de entrega de un solo uso.
    </p>
  </section>
</template>
