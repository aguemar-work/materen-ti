<script setup>
// Subcategorías de UNA categoría de ticket, dentro de su fila desplegada en
// Configuración › Categorías: la lista (tipo, prioridad sugerida y «Con
// aviso») y el alta rápida inline. Salió de CategoriasTicketPanel.vue con el
// catálogo v2 (migración 116) para que el panel no pase de 400 líneas.
// Editar y eliminar los resuelve el panel (diálogos compartidos); el alta la
// hace este componente y emite `agregada` con la fila creada.
import { ref } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import { OPCIONES_TIPO as TIPOS, OPCIONES_PRIORIDAD, PRIORIDAD_POR_DEFECTO, prioridadSugeridaDe } from '../../core/dominio-tickets.js';
import AppButton from '../../components/ui/AppButton.vue';
import PrioridadTicket from '../tickets/PrioridadTicket.vue';

const props = defineProps({
  categoria: { type: Object, required: true },
  subcategorias: { type: Array, default: () => [] },
  puedeEditar: { type: Boolean, default: false },
});
const emit = defineEmits(['editar', 'eliminar', 'agregada']);

// Alta rápida: tipo obligatorio (a diferencia de los 3 casos históricos
// ambiguos); prioridad sugerida con «Media» por defecto (116).
const nombre = ref('');
const tipo = ref('');
const prioridad = ref(PRIORIDAD_POR_DEFECTO);
const agregando = ref(false);

function tipoLabel(valor) {
  return TIPOS.find((t) => t.valor === valor)?.label || '';
}

async function agregar() {
  const limpio = nombre.value.trim();
  if (!limpio) return;
  if (!tipo.value) {
    showToast('Seleccione si es Incidente o Solicitud', 'error');
    return;
  }
  agregando.value = true;
  try {
    const nueva = await insforgeApi.createSubcategoriaTicket(props.categoria.id, limpio, tipo.value, prioridad.value);
    emit('agregada', nueva);
    nombre.value = '';
    tipo.value = '';
    prioridad.value = PRIORIDAD_POR_DEFECTO;
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'la subcategoría', porDefecto: 'No se pudo agregar la subcategoría' }).mensaje, 'error');
  } finally {
    agregando.value = false;
  }
}
</script>

<template>
  <div>
    <ul v-if="subcategorias.length" class="mb-3 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white" :aria-label="`Subcategorías de ${categoria.nombre}`">
      <li v-for="sub in subcategorias" :key="sub.id" class="flex items-center gap-3 py-1.5 pl-3 pr-1.5">
        <span class="min-w-0 flex-1 truncate text-sm text-gray-900">{{ sub.nombre }}</span>
        <span v-if="sub.aviso" class="shrink-0 text-xs text-gray-500">Con aviso</span>
        <span v-if="tipoLabel(sub.tipo_sugerido)" class="shrink-0 text-xs text-gray-500">{{ tipoLabel(sub.tipo_sugerido) }}</span>
        <span class="shrink-0" :title="sub.prioridad_sugerida ? 'Prioridad sugerida' : 'Prioridad sugerida (por defecto)'" data-prioridad-sugerida>
          <PrioridadTicket :valor="prioridadSugeridaDe(sub)" />
        </span>
        <template v-if="puedeEditar">
          <button
            class="icon-btn"
            type="button"
            title="Editar subcategoría"
            :aria-label="`Editar la subcategoría ${sub.nombre}`"
            @click="emit('editar', sub)"
          >
            <i class="ti ti-pencil" aria-hidden="true"></i>
          </button>
          <button
            class="icon-btn danger"
            type="button"
            title="Eliminar subcategoría"
            :aria-label="`Eliminar la subcategoría ${sub.nombre}`"
            @click="emit('eliminar', sub)"
          >
            <i class="ti ti-trash" aria-hidden="true"></i>
          </button>
        </template>
      </li>
    </ul>
    <p v-else class="mb-3 text-sm text-gray-500">{{ puedeEditar ? 'Sin subcategorías. Agregue la primera abajo.' : 'Sin subcategorías.' }}</p>

    <!-- Alta rápida de subcategoría (inline, sin modal) -->
    <div v-if="puedeEditar" class="flex flex-wrap items-center gap-2">
      <div class="campo min-w-0 flex-1 basis-48">
        <div class="campo__caja">
          <input
            v-model="nombre"
            class="campo__control"
            type="text"
            placeholder="Nueva subcategoría..."
            aria-label="Nombre de la subcategoría"
            :disabled="agregando"
            @keydown.enter.prevent="agregar"
          >
        </div>
      </div>
      <div class="campo w-36">
        <div class="campo__caja">
          <select v-model="tipo" class="campo__control campo__control--select" aria-label="Tipo sugerido" :disabled="agregando">
            <option value="" disabled>Tipo</option>
            <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>
      <div class="campo w-32">
        <div class="campo__caja">
          <select v-model="prioridad" class="campo__control campo__control--select" aria-label="Prioridad sugerida" :disabled="agregando">
            <option v-for="p in OPCIONES_PRIORIDAD" :key="p.valor" :value="p.valor">{{ p.label }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>
      <AppButton variant="outline" severity="secondary" icon="ti ti-plus" label="Agregar" :loading="agregando" @click="agregar" />
    </div>
  </div>
</template>
