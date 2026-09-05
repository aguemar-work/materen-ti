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

<style scoped>
/* Estas reglas venían del <style scoped> de TicketsView.vue y se mudan acá
   con el markup, no por prolijidad sino porque si no dejan de aplicar: el
   scoped del padre solo alcanza el ELEMENTO RAÍZ de un hijo, nunca su
   interior — .tk-filtro-grupo seguiría estilado desde el padre, pero
   .tk-filtro-titulo y .tk-filtro-fecha-campo quedarían sin estilo. */
.tk-filtro-grupo { padding: 4px 0; }

.tk-filtro-titulo {
  display: block;
  margin-bottom: 8px;
  font-size: var(--fs-label-01);
  font-weight: 600;
  color: var(--color-text-tertiary);
}

/* Desde/Hasta apilados verticalmente, cada uno con su propia mini-etiqueta
   — antes iban lado a lado sin label visible (solo aria-label), separados
   por un guion, apretados en un ancho pensado para 5 filtros que ahora es
   solo 1. Un campo por línea se lee mejor en los 200px del nav. */
.tk-filtro-fecha-campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tk-filtro-fecha-campo + .tk-filtro-fecha-campo {
  margin-top: 8px;
}

.tk-filtro-fecha-campo label {
  font-size: var(--fs-label-01);
  color: var(--color-text-tertiary);
}

.tk-filtro-fecha-campo input[type="date"] {
  width: 100%;
}
</style>
