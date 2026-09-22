<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { useVolverContextual } from '../../composables/useVolverContextual.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora } from '../../core/formatters.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import { rolDeTag } from '../../core/tagRol.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

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
  <div class="kb-detalle-page vista-modulo">
    <PageHeader>
      <template #izquierda>
        <button class="icon-btn btn-volver" type="button" title="Volver" aria-label="Volver" @click="volver('/base-conocimiento')">
          <i class="ti ti-arrow-left"></i>
        </button>
        <div v-if="articulo" class="header-emp">
          <h1>{{ articulo.titulo }}</h1>
          <span v-if="articulo.categoria_nombre" class="header-sub">{{ articulo.categoria_nombre }}</span>
        </div>
      </template>
    </PageHeader>

    <main class="page page--padded">
      <div v-if="cargando" class="no-results">Cargando artículo...</div>

      <div v-else-if="articulo" class="grid-12">
        <div class="card col-8 kb-contenido">
          <div class="kb-encabezado">
            <BadgeEstado tipo="kb_estado" :valor="articulo.estado" />
            <span class="kb-fecha">Actualizado {{ formatFechaHora(articulo.updated_at) }}</span>
          </div>

          <template v-if="!editando">
            <div v-if="articulo.sintoma" class="kb-bloque">
              <div class="datos-title">Síntoma</div>
              <p class="kb-texto">{{ articulo.sintoma }}</p>
            </div>
            <div class="kb-bloque">
              <div class="datos-title">Solución</div>
              <p v-if="articulo.solucion" class="kb-texto kb-solucion">{{ articulo.solucion }}</p>
              <p v-else class="kb-solucion-pendiente">
                <span class="tag" :class="`tag--${rolDeTag('warning')}`">Pendiente</span> Todavía sin completar.
              </p>
            </div>

            <div class="kb-acciones">
              <button v-if="puedeEditar" type="button" class="btn btn--secondary" @click="abrirEdicion">
                Editar
                <i class="ti ti-pencil" aria-hidden="true"></i>
              </button>
              <button
                v-if="puedeEditar && articulo.estado === 'borrador'"
                type="button"
                class="btn btn--secondary"
                :disabled="cambiandoEstado"
                @click="cambiarEstado('en_revision')"
              >
                Enviar a revisión
                <i class="ti ti-send" aria-hidden="true"></i>
              </button>
              <button
                v-if="auth.esJefe && ['borrador', 'en_revision'].includes(articulo.estado)"
                type="button"
                class="btn btn--primary"
                :disabled="cambiandoEstado"
                @click="cambiarEstado('publicado')"
              >
                Publicar
                <i class="ti ti-circle-check" aria-hidden="true"></i>
              </button>
              <button
                v-if="auth.esJefe && articulo.estado === 'publicado'"
                type="button"
                class="btn btn--secondary"
                :disabled="cambiandoEstado"
                @click="cambiarEstado('obsoleto')"
              >
                Marcar obsoleto
                <i class="ti ti-archive" aria-hidden="true"></i>
              </button>
              <button v-if="puedeEditar" type="button" class="btn btn--danger" @click="confirmarEliminar = true">
                Eliminar
                <i class="ti ti-trash" aria-hidden="true"></i>
              </button>
            </div>

            <div v-if="puedeVotar" class="kb-feedback-bloque">
              <span class="kb-feedback-label">¿Te sirvió este artículo?</span>
              <button type="button" class="btn btn--ghost" :disabled="votando" @click="votar(true)">
                Sí ({{ articulo.util_si }})
                <i class="ti ti-thumb-up" aria-hidden="true"></i>
              </button>
              <button type="button" class="btn btn--ghost" :disabled="votando" @click="votar(false)">
                No ({{ articulo.util_no }})
                <i class="ti ti-thumb-down" aria-hidden="true"></i>
              </button>
            </div>
          </template>

          <form v-else class="kb-form-edicion" @submit.prevent="guardarEdicion">
            <div class="campo" :class="{ 'campo--inerte': guardandoEdicion }">
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

            <div class="campo" :class="{ 'campo--inerte': guardandoEdicion }">
              <label class="campo__etiqueta" :for="campoSolucionEdicion.id">Solución</label>
              <div class="campo__caja">
                <textarea
                  :id="campoSolucionEdicion.id"
                  v-model="formEdicion.solucion"
                  class="campo__control campo__control--area"
                  :rows="8"
                  placeholder="Pasos para resolverlos..."
                  :disabled="guardandoEdicion"
                ></textarea>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn--secondary" :disabled="guardandoEdicion" @click="editando = false">Cancelar</button>
              <button type="submit" class="btn btn--primary" :disabled="guardandoEdicion">
                {{ guardandoEdicion ? 'Guardando...' : 'Guardar' }}
                <i v-if="guardandoEdicion" class="ti ti-loader-2" aria-hidden="true"></i>
              </button>
            </div>
          </form>
        </div>

        <div class="card col-4 kb-meta">
          <div class="datos-title"><i class="ti ti-info-circle"></i> Detalle</div>
          <p class="tk-detalle">Autor: {{ autorNombre }}</p>
          <p v-if="articulo.categoria_nombre" class="tk-detalle">Categoría: {{ articulo.categoria_nombre }}</p>
          <p class="tk-detalle">Creado {{ formatFechaHora(articulo.created_at) }}</p>
          <p class="tk-detalle">Actualizado {{ formatFechaHora(articulo.updated_at) }}</p>
          <p v-if="!puedeEditar && !['publicado', 'obsoleto'].includes(articulo.estado)" class="tk-nota">
            Solo el autor o el JEFE pueden ver/editar este artículo mientras no esté publicado.
          </p>

          <div class="tk-seccion">
            <div class="datos-title"><i class="ti ti-thumb-up" aria-hidden="true"></i> Feedback</div>
            <p v-if="articulo.util_si + articulo.util_no > 0" class="tk-detalle">
              {{ articulo.util_si }} de {{ articulo.util_si + articulo.util_no }} lo encontraron útil
            </p>
            <p v-else class="tk-nota">Todavía sin votos.</p>
          </div>

          <div v-if="articulo.ticket_origen_id" class="tk-seccion">
            <div class="datos-title"><i class="ti ti-ticket" aria-hidden="true"></i> Origen</div>
            <RouterLink class="tk-kb-relacionado" :to="`/tickets/${articulo.ticket_origen_id}`">
              Ver ticket de origen
            </RouterLink>
          </div>
        </div>
      </div>
    </main>

    <ConfirmDialog
      v-if="confirmarEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar artículo"
      :mensaje="`¿Eliminar el artículo “${articulo?.titulo}”? No se podrá deshacer desde la interfaz.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="confirmarEliminar = false"
      @confirm="eliminar"
    />
  </div>
</template>


