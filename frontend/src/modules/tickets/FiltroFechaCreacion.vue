<script setup>
// Filtro secundario "Fecha de creación" de la bandeja de Tickets.
//
// Existe como componente y no como bloque en el template porque se pinta en
// DOS contenedores distintos: el nav lateral (escritorio) y la barra de
// filtros (móvil, donde no hay nav — ver `v-if="!esMovil"` en TicketsView).
// Antes eran 20 líneas duplicadas palabra por palabra salvo los `id`, que
// tienen que diferir para que cada <label for> apunte a su propio input
// cuando los dos bloques existen en el mismo documento. Esa duplicación es
// justo la que ya causó desincronizaciones entre Tabla y Triage (ver el
// modelo de Vistas, PASO 1): un solo componente, dos montajes.
//
// El `v-model` es doble (desde/hasta) porque el rango es UN filtro, no dos:
// el consumidor lo limpia de una sola vez y el chip removible de la lista
// también lo trata como uno solo.
defineProps({
  desde: { type: String, default: '' },
  hasta: { type: String, default: '' },
  // Prefijo de los `id` — distinto por montaje (nav vs. barra móvil).
  idPrefijo: { type: String, required: true },
});
defineEmits(['update:desde', 'update:hasta']);
</script>

<template>
  <div class="tk-filtro-grupo">
    <span :id="`${idPrefijo}-label`" class="tk-filtro-titulo">Fecha de creación</span>
    <div class="tk-filtro-fecha-campo" role="group" :aria-labelledby="`${idPrefijo}-label`">
      <label :for="`${idPrefijo}-desde`">Desde</label>
      <input
        :id="`${idPrefijo}-desde`"
        :value="desde"
        type="date"
        @input="$emit('update:desde', $event.target.value)"
      >
    </div>
    <div class="tk-filtro-fecha-campo" role="group" :aria-labelledby="`${idPrefijo}-label`">
      <label :for="`${idPrefijo}-hasta`">Hasta</label>
      <input
        :id="`${idPrefijo}-hasta`"
        :value="hasta"
        type="date"
        @input="$emit('update:hasta', $event.target.value)"
      >
    </div>
  </div>
</template>


