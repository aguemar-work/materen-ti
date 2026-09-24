<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterLink, useRouter } from 'vue-router';
import { useEncuestasStore } from '../../stores/encuestas.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import EncuestaForm from './EncuestaForm.vue';

const router = useRouter();
const store = useEncuestasStore();
const auth = useAuthStore();
const { lista, cargando, error } = storeToRefs(store);
const { esMovil } = useEsMovil();

const mostrarForm = ref(false);
const encuestaEditar = ref(null);

function abrirNueva() {
  encuestaEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(encuesta) {
  encuestaEditar.value = encuesta;
  mostrarForm.value = true;
}

function onFormCerrado() {
  mostrarForm.value = false;
  encuestaEditar.value = null;
}

const porEliminar = ref(null);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

async function confirmarEliminar() {
  const e = porEliminar.value;
  if (!e) return;
  eliminando.value = true;
  try {
    await store.softDelete(e.id);
    showToast('Encuesta eliminada');
    dialogoEliminar.value?.cerrar();
  } catch (err) {
    showToast(err?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
  }
}

onMounted(async () => {
  try {
    await store.cargar();
  } catch {
    showToast(error.value || 'Error al cargar las encuestas', 'error');
  }
});

const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(lista);

// ── Presentación (rediseño 2026-09-23) ──────────────────────────────────
const subtitulo = computed(() =>
  `${totalItems.value} ${totalItems.value === 1 ? 'plantilla' : 'plantillas'} · clima, feedback puntual y rondas anónimas`,
);

function verResultados(encuesta) {
  router.push(`/encuestas/${encuesta.id}`);
}

function nPreguntas(encuesta) {
  return encuesta.preguntas?.length || 0;
}

// Acciones por fila en un menú ⋮ (antes 3 íconos sueltos). Editar y
// eliminar siguen siendo solo del JEFE, igual que antes.
function accionesDe(encuesta) {
  return [
    { icono: 'ti-chart-bar', label: 'Ver rondas y resultados', onClick: () => verResultados(encuesta) },
    { icono: 'ti-pencil', label: 'Editar', visible: auth.esJefe, onClick: () => abrirEditar(encuesta) },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, visible: auth.esJefe, onClick: () => { porEliminar.value = encuesta; } },
  ];
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Encuestas" :subtitulo="subtitulo">
      <template v-if="auth.esJefe" #acciones>
        <AppButton icon="ti ti-plus" label="Nueva encuesta" @click="abrirNueva" />
      </template>
    </AppEncabezado>

    <!-- Aclaración de alcance: se confunde seguido con la encuesta de tickets -->
    <div class="px-4 pb-4 sm:px-6">
      <p class="flex items-start gap-2 text-sm text-gray-500">
        <i class="ti ti-info-circle mt-0.5 text-gray-500" aria-hidden="true"></i>
        <span>
          ¿Busca la satisfacción de un ticket puntual? Eso vive en
          <RouterLink class="font-medium text-primary-700 hover:underline" to="/tickets/satisfaccion">Tickets → Satisfacción</RouterLink>.
          Esta pantalla es para encuestas propias: clima, feedback puntual y rondas anónimas.
        </span>
      </p>
    </div>

    <!-- ══ Contenido ═══════════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && totalItems === 0"
        icono="ti ti-clipboard-list"
        titulo="Sin encuestas todavía"
        :mensaje="auth.esJefe ? 'Cree una plantilla de encuesta para lanzar la primera ronda.' : 'Todavía no hay ninguna encuesta creada.'"
      >
        <AppButton v-if="auth.esJefe" variant="outline" severity="secondary" icon="ti ti-plus" label="Crear encuesta" @click="abrirNueva" />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando encuestas…</p>

        <!-- ── Tabla (escritorio): la fila abre las rondas y resultados ── -->
        <div
          v-if="!esMovil"
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
        >
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="listaPaginada"
              :loading="cargando"
              :total-records="totalItems"
              :rows="tamPagina"
              :row-class="() => 'cursor-pointer'"
              aria-label="Encuestas"
              @row-click="({ data }) => verResultados(data)"
            >
              <AppColumn field="titulo" header="Encuesta">
                <template #body="{ data: fila }">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-50 text-base text-gray-500">
                      <i class="ti ti-clipboard-list" aria-hidden="true"></i>
                    </span>
                    <div class="min-w-0">
                      <RouterLink
                        class="block truncate font-medium text-gray-900 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        :to="`/encuestas/${fila.id}`"
                        @click.stop
                      >{{ fila.titulo }}</RouterLink>
                      <div v-if="fila.descripcion" class="truncate text-xs text-gray-500">{{ fila.descripcion }}</div>
                    </div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="preguntas" header="Preguntas">
                <template #body="{ data: fila }">
                  <span
                    class="inline-flex items-center gap-1 tabular-nums"
                    :class="nPreguntas(fila) ? 'text-gray-700' : 'text-gray-300'"
                    :aria-label="`${nPreguntas(fila)} pregunta(s)`"
                  ><i class="ti ti-list-details" aria-hidden="true"></i>{{ nPreguntas(fila) }}</span>
                </template>
              </AppColumn>

              <AppColumn field="created_at" header="Creada">
                <template #body="{ data: fila }">
                  <span class="whitespace-nowrap text-gray-600 tabular-nums" :title="formatFechaHora(fila.created_at)">{{ formatAntiguedad(fila.created_at) }}</span>
                </template>
              </AppColumn>

              <AppColumn field="acciones" header="Acciones">
                <template #body="{ data: fila }">
                  <div class="flex justify-end" @click.stop>
                    <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.titulo}`" />
                  </div>
                </template>
              </AppColumn>
            </AppTable>
          </div>

          <AppPaginacion
            v-if="!cargando && totalItems > 0"
            :pagina="paginaActual"
            :tam-pagina="tamPagina"
            :total="totalItems"
            @update:pagina="paginaActual = $event"
            @update:tam-pagina="cambiarTamPagina"
          />
        </div>

        <!-- ── Tarjetas (móvil) ── -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando encuestas...</p>
          <ul v-else class="grid gap-3 sm:grid-cols-2" aria-label="Encuestas">
            <li
              v-for="fila in listaPaginada"
              :key="fila.id"
              class="flex cursor-pointer flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors duration-150 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              tabindex="0"
              @keydown.enter.self="verResultados(fila)"
              @click="verResultados(fila)"
            >
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <RouterLink class="font-medium text-gray-900 hover:text-primary-700" :to="`/encuestas/${fila.id}`" @click.stop>{{ fila.titulo }}</RouterLink>
                  <p v-if="fila.descripcion" class="mt-1 line-clamp-2 text-sm text-gray-600">{{ fila.descripcion }}</p>
                </div>
                <div class="-mr-1 -mt-1" @click.stop>
                  <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.titulo}`" />
                </div>
              </div>
              <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500 tabular-nums">
                <span>{{ nPreguntas(fila) }} {{ nPreguntas(fila) === 1 ? 'pregunta' : 'preguntas' }}</span>
                <span :title="formatFechaHora(fila.created_at)">Creada {{ formatAntiguedad(fila.created_at) }}</span>
              </div>
            </li>
          </ul>
          <AppPaginacion
            v-if="!cargando"
            variante="compacta"
            :pagina="paginaActual"
            :tam-pagina="tamPagina"
            :total="totalItems"
            @update:pagina="paginaActual = $event"
          />
        </div>
      </template>
    </div>

    <EncuestaForm v-if="mostrarForm" :encuesta="encuestaEditar" @cerrar="onFormCerrado" />

    <ConfirmDialog
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar encuesta"
      :mensaje="`¿Eliminar la encuesta “${porEliminar.titulo}”? Sus rondas y respuestas quedan fuera del listado.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cerrado="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>
