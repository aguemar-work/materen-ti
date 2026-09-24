<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { useVolverContextual } from '../../composables/useVolverContextual.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora } from '../../core/formatters.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppListaDatos from '../../components/ui/AppListaDatos.vue';
import AppTag from '../../components/ui/AppTag.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { volver } = useVolverContextual();

const cargando = ref(true);
const articulo = ref(null);
const categorias = ref([]);
const staffLista = ref([]);

const staffPorId = computed(() => {
  const mapa = {};
  for (const s of staffLista.value) mapa[s.user_id] = s.nombre;
  return mapa;
});

const autorNombre = computed(() => {
  if (!articulo.value?.created_by) return 'Sistema';
  return staffPorId.value[articulo.value.created_by] || 'Staff';
});

// El autor solo edita mientras siga en borrador/en_revision (igual que la
// RLS de la migración 031); el JEFE, en cualquier estado.
const puedeEditar = computed(() => {
  if (!articulo.value) return false;
  if (auth.esJefe) return true;
  return articulo.value.created_by === auth.user?.id
    && ['borrador', 'en_revision'].includes(articulo.value.estado);
});

const puedeVotar = computed(() =>
  articulo.value && ['publicado', 'obsoleto'].includes(articulo.value.estado),
);

async function cargar() {
  cargando.value = true;
  try {
    articulo.value = await insforgeApi.getKbArticulo(route.params.id);
    if (!articulo.value) {
      showToast('Artículo no encontrado', 'error');
      router.replace('/base-conocimiento');
      return;
    }
  } catch (e) {
    showToast(e?.message || 'Error al cargar el artículo', 'error');
  } finally {
    cargando.value = false;
  }
}

// ── Edición inline ───────────────────────────────────────────────────────
const editando = ref(false);
const guardandoEdicion = ref(false);
const formEdicion = ref({ titulo: '', categoria_id: '', sintoma: '', solucion: '' });

const campoTituloEdicion = useCampoAccesible();
const campoCategoriaEdicion = useCampoAccesible();
const campoSintomaEdicion = useCampoAccesible();
const campoSolucionEdicion = useCampoAccesible();

function abrirEdicion() {
  formEdicion.value = {
    titulo: articulo.value.titulo,
    categoria_id: articulo.value.categoria_id || '',
    sintoma: articulo.value.sintoma || '',
    solucion: articulo.value.solucion || '',
  };
  editando.value = true;
}

async function guardarEdicion() {
  guardandoEdicion.value = true;
  try {
    articulo.value = await insforgeApi.actualizarKbArticulo(articulo.value.id, {
      titulo: formEdicion.value.titulo,
      categoria_id: formEdicion.value.categoria_id || null,
      sintoma: formEdicion.value.sintoma,
      solucion: formEdicion.value.solucion,
    });
    editando.value = false;
    showToast('Artículo actualizado');
  } catch (e) {
    showToast(e?.message || 'No se pudo guardar', 'error');
  } finally {
    guardandoEdicion.value = false;
  }
}

// ── Transiciones de estado ───────────────────────────────────────────────
const cambiandoEstado = ref(false);

async function cambiarEstado(nuevoEstado) {
  cambiandoEstado.value = true;
  try {
    articulo.value = await insforgeApi.actualizarKbArticulo(articulo.value.id, { estado: nuevoEstado });
    showToast(
      nuevoEstado === 'en_revision' ? 'Enviado a revisión'
      : nuevoEstado === 'publicado' ? 'Artículo publicado'
      : nuevoEstado === 'obsoleto' ? 'Artículo marcado como obsoleto'
      : 'Estado actualizado',
    );
  } catch (e) {
    showToast(e?.message || 'No se pudo cambiar el estado', 'error');
  } finally {
    cambiandoEstado.value = false;
  }
}

// ── Feedback "¿Te sirvió?" ────────────────────────────────────────────────
const votando = ref(false);

async function votar(util) {
  votando.value = true;
  try {
    articulo.value = await insforgeApi.votarKbArticulo(articulo.value.id, util);
    showToast('Gracias por la respuesta');
  } catch (e) {
    showToast(e?.message || 'No se pudo registrar el voto', 'error');
  } finally {
    votando.value = false;
  }
}

// ── Eliminar ──────────────────────────────────────────────────────────────
const confirmarEliminar = ref(false);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

async function eliminar() {
  eliminando.value = true;
  try {
    await insforgeApi.softDeleteKbArticulo(articulo.value.id);
    showToast('Artículo eliminado');
    router.push('/base-conocimiento');
  } catch (e) {
    showToast(e?.message || 'No se pudo eliminar', 'error');
    eliminando.value = false;
  }
}

// ── Presentación (rediseño 2026-09-23) ───────────────────────────────────
// Una sola acción sólida por pantalla: el siguiente paso del flujo de
// publicación (Publicar para el JEFE; Enviar a revisión para el autor).
// Lo menos frecuente (obsoleto, eliminar) va al menú ⋮.
const puedePublicar = computed(() =>
  !!articulo.value && auth.esJefe && ['borrador', 'en_revision'].includes(articulo.value.estado),
);
const puedeEnviarRevision = computed(() =>
  !!articulo.value && puedeEditar.value && articulo.value.estado === 'borrador',
);
const accionesMas = computed(() => {
  if (!articulo.value) return [];
  return [
    {
      icono: 'ti-archive',
      label: 'Marcar obsoleto',
      visible: auth.esJefe && articulo.value.estado === 'publicado',
      disabled: cambiandoEstado.value,
      onClick: () => cambiarEstado('obsoleto'),
    },
    {
      icono: 'ti-trash',
      label: 'Eliminar',
      danger: true,
      visible: puedeEditar.value,
      onClick: () => { confirmarEliminar.value = true; },
    },
  ];
});
const hayAccionesMas = computed(() => accionesMas.value.some((a) => a.visible !== false));

const totalVotos = computed(() => (articulo.value ? articulo.value.util_si + articulo.value.util_no : 0));
const porcentajeUtil = computed(() => (totalVotos.value ? Math.round((articulo.value.util_si / totalVotos.value) * 100) : 0));

const datosDetalle = computed(() => (articulo.value ? [
  { label: 'Autor', valor: autorNombre.value },
  { label: 'Categoría', valor: articulo.value.categoria_nombre || '' },
  { label: 'Creado', valor: formatFechaHora(articulo.value.created_at), mono: true },
  { label: 'Actualizado', valor: formatFechaHora(articulo.value.updated_at), mono: true },
] : []));

onMounted(async () => {
  await cargar();
  try {
    [categorias.value, staffLista.value] = await Promise.all([
      insforgeApi.listCategoriasTicket(),
      insforgeApi.nombresStaff(),
    ]);
  } catch { /* el select de categoría y el nombre del autor quedan vacíos, no bloquea la vista */ }
});
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 pb-10 pt-5 sm:px-6">
    <button
      type="button"
      class="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      @click="volver('/base-conocimiento')"
    >
      <i class="ti ti-arrow-left" aria-hidden="true"></i>
      Base de conocimiento
    </button>

    <p v-if="cargando" class="py-16 text-center text-sm text-gray-500" role="status">Cargando artículo...</p>

    <template v-else-if="articulo">
      <!-- ══ Cabecera: qué artículo es, en qué estado y qué sigue ══════ -->
      <header class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <BadgeEstado tipo="kb_estado" :valor="articulo.estado" />
            <span v-if="articulo.categoria_nombre" class="inline-flex items-center gap-1"><i class="ti ti-folder" aria-hidden="true"></i>{{ articulo.categoria_nombre }}</span>
            <span class="inline-flex items-center gap-1 tabular-nums"><i class="ti ti-clock" aria-hidden="true"></i>Actualizado {{ formatFechaHora(articulo.updated_at) }}</span>
          </div>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-gray-900 text-pretty">{{ articulo.titulo }}</h1>
          <p class="mt-1 text-sm text-gray-500">Por {{ autorNombre }}</p>
        </div>
        <div v-if="!editando" class="flex shrink-0 flex-wrap items-center gap-2">
          <AppButton v-if="puedeEditar" variant="outline" severity="secondary" icon="ti ti-pencil" label="Editar" @click="abrirEdicion" />
          <AppButton
            v-if="puedePublicar"
            icon="ti ti-circle-check"
            label="Publicar"
            :loading="cambiandoEstado"
            :disabled="cambiandoEstado"
            @click="cambiarEstado('publicado')"
          />
          <AppButton
            v-if="puedeEnviarRevision"
            :variant="puedePublicar ? 'outline' : 'solid'"
            :severity="puedePublicar ? 'secondary' : 'primary'"
            icon="ti ti-send"
            label="Enviar a revisión"
            :disabled="cambiandoEstado"
            @click="cambiarEstado('en_revision')"
          />
          <MenuAcciones v-if="hayAccionesMas" :acciones="accionesMas" label="Más acciones del artículo" />
        </div>
      </header>

      <div
        v-if="!puedeEditar && !['publicado', 'obsoleto'].includes(articulo.estado)"
        class="notif notif--info mt-5"
        role="note"
      >
        <i class="ti ti-lock" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">Solo el autor o el JEFE pueden ver y editar este artículo mientras no esté publicado.</p>
        </div>
      </div>

      <div class="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <!-- ══ Lectura ═══════════════════════════════════════════════ -->
        <article class="min-w-0 rounded-lg border border-gray-200 bg-white">
          <div v-if="!editando" class="px-5 py-6 sm:px-8 sm:py-8">
            <div class="max-w-[70ch] space-y-8">
              <section v-if="articulo.sintoma" aria-labelledby="kb-sintoma">
                <h2 id="kb-sintoma" class="flex items-center gap-2 text-base font-semibold text-gray-900">
                  <i class="ti ti-alert-circle text-gray-500" aria-hidden="true"></i>
                  Síntoma
                </h2>
                <p class="mt-2 whitespace-pre-line text-[15px] leading-7 text-gray-700">{{ articulo.sintoma }}</p>
              </section>

              <section aria-labelledby="kb-solucion">
                <h2 id="kb-solucion" class="flex items-center gap-2 text-base font-semibold text-gray-900">
                  <i class="ti ti-tool text-gray-500" aria-hidden="true"></i>
                  Solución
                </h2>
                <!-- pre-wrap: conserva sangrías y saltos de los pasos y
                     comandos tal como se escribieron. -->
                <p v-if="articulo.solucion" class="mt-2 whitespace-pre-wrap break-words text-[15px] leading-7 text-gray-800">{{ articulo.solucion }}</p>
                <p v-else class="mt-2 flex items-center gap-2 text-sm text-gray-500">
                  <AppTag tono="warning">Pendiente</AppTag>
                  Todavía sin completar.
                </p>
              </section>
            </div>
          </div>

          <!-- ── ¿Sirvió? (solo en artículos publicados u obsoletos) ── -->
          <div
            v-if="!editando && puedeVotar"
            class="flex flex-wrap items-center gap-3 border-t border-gray-100 px-5 py-4 sm:px-8"
          >
            <span class="text-sm font-medium text-gray-700">¿Le sirvió este artículo?</span>
            <div class="flex gap-2">
              <AppButton size="sm" variant="outline" severity="secondary" icon="ti ti-thumb-up" :label="`Sí · ${articulo.util_si}`" :disabled="votando" @click="votar(true)" />
              <AppButton size="sm" variant="outline" severity="secondary" icon="ti ti-thumb-down" :label="`No · ${articulo.util_no}`" :disabled="votando" @click="votar(false)" />
            </div>
          </div>

          <!-- ── Edición en el lugar ── -->
          <form v-if="editando" class="space-y-4 p-5 sm:p-8" @submit.prevent="guardarEdicion">
            <h2 class="text-base font-semibold text-gray-900">Editar artículo</h2>
            <div class="form-grid">
              <div class="campo full" :class="{ 'campo--inerte': guardandoEdicion }">
                <label class="campo__etiqueta" :for="campoTituloEdicion.id">Título<span aria-hidden="true"> *</span></label>
                <div class="campo__caja">
                  <input :id="campoTituloEdicion.id" v-model="formEdicion.titulo" class="campo__control" type="text" required :disabled="guardandoEdicion">
                </div>
              </div>

              <div class="campo" :class="{ 'campo--inerte': guardandoEdicion }">
                <label class="campo__etiqueta" :for="campoCategoriaEdicion.id">Categoría</label>
                <div class="campo__caja">
                  <select
                    :id="campoCategoriaEdicion.id"
                    class="campo__control campo__control--select"
                    :value="formEdicion.categoria_id"
                    :disabled="guardandoEdicion"
                    @change="formEdicion.categoria_id = $event.target.value"
                  >
                    <option value="">Sin categoría</option>
                    <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
                  </select>
                  <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
                </div>
              </div>

              <div class="campo" :class="{ 'campo--inerte': guardandoEdicion }">
                <label class="campo__etiqueta" :for="campoSintomaEdicion.id">Síntoma</label>
                <div class="campo__caja">
                  <input :id="campoSintomaEdicion.id" v-model="formEdicion.sintoma" class="campo__control" type="text" :disabled="guardandoEdicion">
                </div>
              </div>

              <div class="campo full" :class="{ 'campo--inerte': guardandoEdicion }">
                <label class="campo__etiqueta" :for="campoSolucionEdicion.id">Solución</label>
                <div class="campo__caja">
                  <textarea
                    :id="campoSolucionEdicion.id"
                    v-model="formEdicion.solucion"
                    class="campo__control campo__control--area"
                    :rows="12"
                    placeholder="Pasos para resolverlo..."
                    :disabled="guardandoEdicion"
                  ></textarea>
                </div>
              </div>
            </div>
            <div class="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardandoEdicion" @click="editando = false" />
              <AppButton type="submit" :label="guardandoEdicion ? 'Guardando...' : 'Guardar'" :loading="guardandoEdicion" :disabled="guardandoEdicion" />
            </div>
          </form>
        </article>

        <!-- ══ Lateral ═══════════════════════════════════════════════ -->
        <aside class="min-w-0 space-y-6 lg:sticky lg:top-6">
          <AppSeccion titulo="Utilidad">
            <template v-if="totalVotos > 0">
              <p class="text-sm text-gray-700">
                <span class="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{{ porcentajeUtil }}%</span>
                lo encontró útil
              </p>
              <div class="mt-3 flex h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                <div class="h-full bg-green-500" :style="{ width: `${porcentajeUtil}%` }"></div>
                <div class="h-full bg-red-300" :style="{ width: `${100 - porcentajeUtil}%` }"></div>
              </div>
              <p class="mt-2 text-xs text-gray-500 tabular-nums">{{ articulo.util_si }} de {{ totalVotos }} {{ totalVotos === 1 ? 'voto' : 'votos' }}</p>
            </template>
            <p v-else class="text-sm text-gray-500">Todavía sin votos.</p>
          </AppSeccion>

          <AppSeccion titulo="Detalle">
            <AppListaDatos :datos="datosDetalle" />
          </AppSeccion>

          <AppSeccion v-if="articulo.ticket_origen_id" titulo="Origen" sin-padding>
            <RouterLink
              :to="`/tickets/${articulo.ticket_origen_id}`"
              class="flex items-center gap-3 px-4 py-3 text-sm text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
            >
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-50 text-base text-gray-500">
                <i class="ti ti-ticket" aria-hidden="true"></i>
              </span>
              <span class="flex-1">Ver ticket de origen</span>
              <i class="ti ti-arrow-up-right text-gray-500" aria-hidden="true"></i>
            </RouterLink>
          </AppSeccion>
        </aside>
      </div>
    </template>

    <ConfirmDialog
      v-if="confirmarEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar artículo"
      :mensaje="`¿Eliminar el artículo “${articulo?.titulo}”? No se podrá deshacer desde la interfaz.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cerrado="confirmarEliminar = false"
      @confirm="eliminar"
    />
  </div>
</template>
