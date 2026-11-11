<script setup>
// Feed de pendientes del Inicio: lista de libro agrupada CRÍTICO / ATENCIÓN.
// Columna de antigüedad a la izquierda ("3 d", "hoy", "—"), identificador con
// AppCodigo (regla 14) y, bajo cada asunto, una línea de contexto en gris. La
// fila entera es el enlace al lugar donde se resuelve.
//
// El orden y los niveles ya vienen resueltos (pendientesFeed.js); acá solo se
// agrupan y se corta a LIMITE filas con "Ver N más". Los vacíos y los fallos
// son filas del libro (regla 21): nada de círculos ni ilustraciones.
import { ref, computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import PanelInicio from './PanelInicio.vue';
import FilaAviso from './FilaAviso.vue';

const LIMITE = 10;

const props = defineProps({
  /** Ítems ya filtrados por la vista activa. */
  items: { type: Array, default: () => [] },
  /** Avisos de sección con error: [{ seccion, texto }]. */
  avisos: { type: Array, default: () => [] },
  /** Texto de la fila vacía; `''` = no mostrar (hay un aviso que lo explica). */
  vacio: { type: String, default: '' },
  titulo: { type: String, default: 'Pendientes' },
});
defineEmits(['reintentar']);

const expandido = ref(false);
const nivel = ref('todos');
// Al cambiar de vista el corte vuelve a empezar.
watch(() => props.titulo, () => { expandido.value = false; nivel.value = 'todos'; });
watch(nivel, () => { expandido.value = false; });

const opcionesNivel = computed(() => [
  { valor: 'todos', label: 'Todos' },
  { valor: 'criticos', label: 'Críticos', conteo: props.items.filter((i) => i.tier === 1).length },
  { valor: 'atencion', label: 'Atención', conteo: props.items.filter((i) => i.tier !== 1).length },
]);
const filtrados = computed(() => props.items.filter((i) =>
  nivel.value === 'todos' || (nivel.value === 'criticos' ? i.tier === 1 : i.tier !== 1)));
const mostrados = computed(() => (expandido.value ? filtrados.value : filtrados.value.slice(0, LIMITE)));
const bloques = computed(() => [
  { tier: 1, rotulo: 'Crítico', items: mostrados.value.filter((i) => i.tier === 1) },
  { tier: 2, rotulo: 'Atención', items: mostrados.value.filter((i) => i.tier !== 1) },
].filter((b) => b.items.length));
const restantes = computed(() => filtrados.value.length - LIMITE);

const CLASE_FILA = 'grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 border-b border-gray-100 px-4 py-3 transition-colors duration-150 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500';
</script>

<template>
  <PanelInicio :titulo="titulo" :conteo="filtrados.length">
    <template v-if="items.length" #acciones>
      <AppSegmentado v-model="nivel" :opciones="opcionesNivel" label="Nivel de atención de los pendientes" />
    </template>
    <FilaAviso
      v-for="a in avisos"
      :key="a.seccion"
      :texto="a.texto"
      @reintentar="$emit('reintentar')"
    />

    <template v-if="filtrados.length">
      <div v-for="bloque in bloques" :key="bloque.tier" data-bloque>
        <h3 class="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">
          <span title="Días desde que se abrió o venció">Antig.</span>
          <span :class="bloque.tier === 1 ? 'text-red-800' : ''">{{ bloque.rotulo }}</span>
        </h3>
        <ul>
          <li v-for="item in bloque.items" :key="item.key" data-pendiente>
            <RouterLink :to="item.destino" :class="CLASE_FILA">
              <span class="pt-0.5 text-xs tabular-nums text-gray-500" data-antiguedad>{{ item.antiguedad }}</span>
              <span class="min-w-0">
                <span class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                  <AppCodigo v-if="item.codigo" :valor="item.codigo" :titulo="item.codigoTitulo" class="max-w-full break-words" />
                  <span class="min-w-0 break-words font-medium text-gray-900">{{ item.titulo }}</span>
                  <span v-if="item.sujeto" class="min-w-0 break-words text-gray-600">{{ item.sujeto }}</span>
                </span>
                <span class="mt-1 block break-words text-xs leading-relaxed text-gray-600">{{ item.contexto }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </div>
      <div v-if="restantes > 0" class="px-2 py-1.5">
        <AppButton
          size="sm"
          variant="text"
          block
          :icon="expandido ? 'ti ti-chevron-up' : 'ti ti-chevron-down'"
          :label="expandido ? 'Ver menos' : `Ver ${restantes} más`"
          :aria-expanded="expandido"
          @click="expandido = !expandido"
        />
      </div>
    </template>
    <p v-else-if="nivel !== 'todos'" class="px-4 py-6 text-sm text-gray-600" role="status">Sin pendientes en este nivel. Seleccione «Todos» para ver los demás asuntos.</p>
    <p v-else-if="vacio" class="min-h-10 px-4 py-4 text-sm text-gray-500" data-vacio>— {{ vacio }}</p>
  </PanelInicio>
</template>
