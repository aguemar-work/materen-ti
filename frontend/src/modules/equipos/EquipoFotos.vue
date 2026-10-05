<script setup>
// Fotos de un equipo: hasta MAX_FOTOS, comprimidas en el navegador y subidas por
// la edge function `equipos-fotos` (que valida contenido real y tamaño). Se
// extrajo de EquipoForm.vue para que la hoja de vida (EquipoDetalleView) suba y
// quite fotos con la MISMA lógica que el formulario de edición.
//
// v-model = la lista [{ url, key }]. Este componente sube y borra el objeto en
// el storage; quien lo usa decide cuándo guardar la lista en `equipos.fotos`
// (el formulario al pulsar Guardar, la hoja de vida al instante).
//
// ⚠️ MAX_FOTOS_EQUIPO (core/dominio-equipos.js) está duplicado a propósito como
// MAX_FOTOS_POR_EQUIPO en functions/equipos-fotos.ts: acá oculta el botón y
// avisa antes de subir, allá es el tope real. Los dos valores se mueven JUNTOS
// (AGENTS.md raíz).
import { ref } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { comprimirImagen } from '../../core/imagenes.js';
import { MAX_FOTOS_EQUIPO as MAX_FOTOS } from '../../core/dominio-equipos.js';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // Equipo ya guardado: lo usa el tope de cantidad del servidor. En un alta no
  // hay equipo todavía y el servidor no aplica el tope.
  equipoId: { type: String, default: null },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue', 'error']);

const subiendo = ref(false);
const input = ref(null);

async function alElegir(e) {
  const archivos = Array.from(e.target.files || []);
  e.target.value = '';
  if (!archivos.length) return;
  const libres = MAX_FOTOS - props.modelValue.length;
  if (libres <= 0) {
    emit('error', `Máximo ${MAX_FOTOS} fotos por equipo`);
    return;
  }
  subiendo.value = true;
  emit('error', '');
  const lista = [...props.modelValue];
  try {
    for (const archivo of archivos.slice(0, libres)) {
      const comprimida = await comprimirImagen(archivo);
      lista.push(await insforgeApi.subirFotoEquipo(comprimida, props.equipoId));
      emit('update:modelValue', [...lista]);
    }
  } catch (err) {
    emit('error', traducirErrorDb(err, { porDefecto: 'No se pudo subir la foto' }).mensaje);
  } finally {
    subiendo.value = false;
  }
}

async function quitar(foto) {
  emit('update:modelValue', props.modelValue.filter((f) => f.key !== foto.key));
  try {
    await insforgeApi.eliminarFotoEquipo(foto.key);
  } catch {
    // Si falla, la referencia igual ya no se guardará.
  }
}
</script>

<template>
  <div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div
        v-for="foto in modelValue"
        :key="foto.key"
        class="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
      >
        <a
          :href="foto.url"
          target="_blank"
          rel="noopener noreferrer"
          class="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
        >
          <img :src="foto.url" alt="Foto del equipo" class="h-full w-full object-cover">
        </a>
        <button
          class="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-gray-600 ring-1 ring-gray-200 transition-colors hover:bg-white hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
          type="button"
          title="Quitar foto"
          aria-label="Quitar foto"
          data-no-print
          :disabled="disabled"
          @click="quitar(foto)"
        >
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>
      <button
        v-if="modelValue.length < MAX_FOTOS"
        class="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        data-no-print
        :disabled="disabled || subiendo"
        @click="input?.click()"
      >
        <i class="text-2xl" :class="subiendo ? 'ti ti-loader-2 animate-spin' : 'ti ti-camera-plus'" aria-hidden="true"></i>
        <span>{{ subiendo ? 'Subiendo...' : 'Agregar foto' }}</span>
      </button>
    </div>
    <input
      ref="input"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      aria-label="Elegir fotos del equipo"
      @change="alElegir"
    >
    <p class="mt-2 text-xs text-gray-500" data-no-print>Se comprimen automáticamente (unos 200 KB cada una) para no llenar el almacenamiento.</p>
  </div>
</template>
