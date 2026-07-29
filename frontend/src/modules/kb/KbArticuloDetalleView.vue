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
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { volver } = useVolverContextual();

const cargando = ref(true);
const articulo = ref(null);
const categorias = ref([]);

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
    showToast('Gracias por tu respuesta');
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
    categorias.value = await insforgeApi.listCategoriasTicket();
  } catch { /* el select de categoría queda vacío, no bloquea la vista */ }
});
</script>

<template>
  <div class="kb-detalle-page vista-modulo">
    <PageHeader>
      <template #izquierda>
        <button class="icon-btn btn-volver" type="button" title="Volver" @click="volver('/base-conocimiento')">
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
        <div class="card col-9 kb-contenido">
          <div class="kb-encabezado">
            <BadgeEstado tipo="kb_estado" :valor="articulo.estado" />
            <span class="kb-fecha">Actualizado {{ formatFechaHora(articulo.updated_at) }}</span>
            <RouterLink v-if="articulo.ticket_origen_id" class="kb-ticket-origen" :to="`/tickets/${articulo.ticket_origen_id}`">
              <i class="ti ti-ticket" aria-hidden="true"></i> Ver ticket de origen
            </RouterLink>
          </div>

          <template v-if="!editando">
            <div v-if="articulo.sintoma" class="kb-bloque">
              <div class="datos-title">Síntoma</div>
              <p class="kb-texto">{{ articulo.sintoma }}</p>
            </div>
            <div class="kb-bloque">
              <div class="datos-title">Solución</div>
              <p v-if="articulo.solucion" class="kb-texto kb-solucion">{{ articulo.solucion }}</p>
              <p v-else class="tk-nota">Todavía sin completar.</p>
            </div>

            <div class="kb-acciones">
              <button v-if="puedeEditar" class="btn" type="button" @click="abrirEdicion">
                <i class="ti ti-pencil" aria-hidden="true"></i> Editar
              </button>
              <button
                v-if="puedeEditar && articulo.estado === 'borrador'"
                class="btn"
                type="button"
                :disabled="cambiandoEstado"
                @click="cambiarEstado('en_revision')"
              >
                <i class="ti ti-send" aria-hidden="true"></i> Enviar a revisión
              </button>
              <button
                v-if="auth.esJefe && ['borrador', 'en_revision'].includes(articulo.estado)"
                class="btn btn-primary"
                type="button"
                :disabled="cambiandoEstado"
                @click="cambiarEstado('publicado')"
              >
                <i class="ti ti-circle-check" aria-hidden="true"></i> Publicar
              </button>
              <button
                v-if="auth.esJefe && articulo.estado === 'publicado'"
                class="btn"
                type="button"
                :disabled="cambiandoEstado"
                @click="cambiarEstado('obsoleto')"
              >
                <i class="ti ti-archive" aria-hidden="true"></i> Marcar obsoleto
              </button>
              <button v-if="puedeEditar" class="btn btn-danger" type="button" @click="confirmarEliminar = true">
                <i class="ti ti-trash" aria-hidden="true"></i> Eliminar
              </button>
            </div>

            <div v-if="puedeVotar" class="kb-feedback-bloque">
              <span class="kb-feedback-label">¿Te sirvió este artículo?</span>
              <button class="btn" type="button" :disabled="votando" @click="votar(true)">
                <i class="ti ti-thumb-up" aria-hidden="true"></i> Sí ({{ articulo.util_si }})
              </button>
              <button class="btn" type="button" :disabled="votando" @click="votar(false)">
                <i class="ti ti-thumb-down" aria-hidden="true"></i> No ({{ articulo.util_no }})
              </button>
            </div>
          </template>

          <form v-else class="kb-form-edicion" @submit.prevent="guardarEdicion">
            <div class="form-group">
              <label for="kbe-titulo">Título</label>
              <input id="kbe-titulo" v-model="formEdicion.titulo" required :disabled="guardandoEdicion">
            </div>
            <div class="form-group">
              <label for="kbe-categoria">Categoría</label>
              <select id="kbe-categoria" v-model="formEdicion.categoria_id" :disabled="guardandoEdicion">
                <option value="">Sin categoría</option>
                <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
              </select>
            </div>
            <div class="form-group">
              <label for="kbe-sintoma">Síntoma</label>
              <input id="kbe-sintoma" v-model="formEdicion.sintoma" :disabled="guardandoEdicion">
            </div>
            <div class="form-group">
              <label for="kbe-solucion">Solución</label>
              <textarea id="kbe-solucion" v-model="formEdicion.solucion" rows="8" :disabled="guardandoEdicion"></textarea>
            </div>
            <div class="modal-actions">
              <button class="btn" type="button" :disabled="guardandoEdicion" @click="editando = false">Cancelar</button>
              <button class="btn btn-primary" type="submit" :disabled="guardandoEdicion">
                <i v-if="guardandoEdicion" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
                {{ guardandoEdicion ? 'Guardando...' : 'Guardar' }}
              </button>
            </div>
          </form>
        </div>

        <div class="card col-3 kb-meta">
          <div class="datos-title"><i class="ti ti-info-circle"></i> Detalle</div>
          <p class="tk-detalle">Estado: {{ articulo.estado }}</p>
          <p class="tk-detalle">Creado {{ formatFechaHora(articulo.created_at) }}</p>
          <p class="tk-detalle">Actualizado {{ formatFechaHora(articulo.updated_at) }}</p>
          <p v-if="!puedeEditar && articulo.estado !== 'publicado' && articulo.estado !== 'obsoleto'" class="tk-nota">
            Solo el autor o el JEFE pueden ver/editar este artículo mientras no esté publicado.
          </p>
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

<style scoped>
.header-emp h1 {
  font-size: var(--fs-xl);
  font-weight: 600;
  margin: 0;
}

.header-sub {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}

.btn-volver { flex-shrink: 0; }

.kb-contenido, .kb-meta { padding: 16px 20px 20px; }

.kb-encabezado {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.kb-fecha {
  font-size: var(--fs-sm);
  color: var(--color-text-tertiary);
}

.kb-ticket-origen {
  margin-left: auto;
  font-size: var(--fs-sm);
  color: var(--color-accent-text);
  text-decoration: none;
}
.kb-ticket-origen:hover { text-decoration: underline; }

.kb-bloque { margin-bottom: 20px; }

.kb-texto {
  font-size: var(--fs-base);
  color: var(--color-text-primary);
  white-space: pre-wrap;
  margin: 6px 0 0;
}

.kb-solucion {
  background: var(--color-bg-subtle);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.kb-acciones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
}

.kb-feedback-bloque {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.kb-feedback-label {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}

.kb-form-edicion {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
