<script setup>
// Paso 1 de la importación: pegar el rango copiado de Excel (con la fila de
// encabezados). Crea la bandeja de trabajo en el paso siguiente.
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppButton from '../../components/ui/AppButton.vue';

const props = defineProps({
  // Objeto reactivo de useImportacionEquipos(): textoPegado, continuarAMapeo.
  imp: { type: Object, required: true },
});
const imp = props.imp;
const campoTexto = useCampoAccesible();
</script>

<template>
  <section class="max-w-3xl rounded-lg border border-gray-200 bg-white p-5" aria-labelledby="paso-pegar">
    <h2 id="paso-pegar" class="text-base font-semibold text-gray-900">Pegar los datos</h2>
    <p class="mt-1 text-sm text-gray-500">
      En Excel, seleccione el rango con la fila de encabezados incluida, cópielo (Ctrl+C) y péguelo aquí abajo.
      Esto crea la bandeja de trabajo: desde ahí se corrige cada equipo y se migra a Equipos cuando esté listo.
    </p>
    <div class="campo mt-4">
      <label class="campo__etiqueta" :for="campoTexto.id">Datos pegados desde Excel</label>
      <div class="campo__caja">
        <textarea
          :id="campoTexto.id"
          v-model="imp.textoPegado"
          class="campo__control campo__control--area text-xs"
          :rows="12"
          placeholder="Pegue aquí las filas copiadas de Excel..."
        ></textarea>
      </div>
    </div>
    <div class="mt-5 flex justify-end border-t border-gray-100 pt-4">
      <AppButton icon="ti ti-arrow-right" icon-pos="right" label="Continuar" :disabled="!imp.textoPegado.trim()" @click="imp.continuarAMapeo()" />
    </div>
  </section>
</template>
