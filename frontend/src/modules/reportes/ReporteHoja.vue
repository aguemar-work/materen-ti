<script setup>
// Hoja común de TODOS los reportes (regla 23: imprimir es la misma hoja):
// carátula con el sello «Período en curso» cuando corresponde, acciones CSV e
// Imprimir (fuera del papel), controles del reporte en el slot `controles`
// (cada reporte pone los suyos, siempre dentro de `data-no-print`), el
// contenido en el slot por defecto y el glosario al pie, una línea por
// término, con la versión de definiciones que trajo el servidor. Imprimir =
// window.print() con styles/impresion.css; el CSV lo arma quien escucha `csv`
// con el mismo jsonb de la hoja.
import { computed } from 'vue';
import AppCaratula from '../../components/ui/AppCaratula.vue';
import AppSello from '../../components/ui/AppSello.vue';
import AppButton from '../../components/ui/AppButton.vue';

const props = defineProps({
  rotulo: { type: String, default: '' },
  titulo: { type: String, required: true },
  datos: { type: Array, default: () => [] },
  enCurso: { type: Boolean, default: false },
  cargando: { type: Boolean, default: false },
  error: { type: String, default: '' },
  listo: { type: Boolean, default: false },
  glosario: { type: Array, default: () => [] },
  version: { type: String, default: '' },
  versionEsperada: { type: String, default: '' },
});
const emit = defineEmits(['csv']);

const versionDistinta = computed(() => props.listo && !!props.versionEsperada && props.version !== props.versionEsperada);

function imprimir() {
  window.print();
}
</script>

<template>
  <div class="w-full pb-10">
    <AppCaratula :rotulo="rotulo" :titulo="titulo" :datos="datos">
      <template #sello>
        <AppSello v-if="enCurso" tono="neutro">Período en curso</AppSello>
      </template>
      <template #acciones>
        <AppButton label="CSV" icon="ti ti-download" variant="outline" severity="secondary" :disabled="!listo || cargando" @click="emit('csv')" />
        <AppButton label="Imprimir / Guardar PDF" icon="ti ti-printer" :disabled="!listo || cargando" @click="imprimir" />
      </template>
    </AppCaratula>

    <slot name="controles" />

    <p data-no-print class="px-4 pt-3 text-xs text-gray-500 sm:hidden">Esta pantalla está pensada para escritorio.</p>

    <div class="space-y-8 px-4 pt-6 sm:px-6">
      <p v-if="cargando" class="text-sm text-gray-500" role="status">Generando el reporte…</p>

      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <template v-if="listo && !cargando">
        <slot />

        <p v-if="versionDistinta" class="text-sm text-gray-700" role="status">
          El servidor calculó con las definiciones «{{ version }}» y este glosario describe «{{ versionEsperada }}»: lea las notas al pie con cautela.
        </p>

        <section v-if="glosario.length" class="border-t border-gray-200 pt-4" aria-labelledby="reporte-glosario-titulo">
          <h2 id="reporte-glosario-titulo" class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Definiciones ({{ version }})</h2>
          <dl class="mt-2 space-y-1 text-xs text-gray-700">
            <div v-for="g in glosario" :key="g.termino" class="flex gap-2">
              <dt class="shrink-0 font-medium text-gray-900">{{ g.termino }}:</dt>
              <dd>{{ g.definicion }}</dd>
            </div>
          </dl>
        </section>
      </template>
    </div>
  </div>
</template>
