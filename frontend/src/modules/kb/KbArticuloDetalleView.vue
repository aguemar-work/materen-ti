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
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';

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
                <CarbonTag variante="warning">Pendiente</CarbonTag> Todavía sin completar.
              </p>
            </div>

            <div class="kb-acciones">
              <CarbonButton v-if="puedeEditar" variante="secondary" icono="ti-pencil" @click="abrirEdicion">
                Editar
              </CarbonButton>
              <CarbonButton
                v-if="puedeEditar && articulo.estado === 'borrador'"
                variante="secondary"
                icono="ti-send"
                :deshabilitado="cambiandoEstado"
                @click="cambiarEstado('en_revision')"
              >
                Enviar a revisión
              </CarbonButton>
              <CarbonButton
                v-if="auth.esJefe && ['borrador', 'en_revision'].includes(articulo.estado)"
                variante="primary"
                icono="ti-circle-check"
                :deshabilitado="cambiandoEstado"
                @click="cambiarEstado('publicado')"
              >
                Publicar
              </CarbonButton>
              <CarbonButton
                v-if="auth.esJefe && articulo.estado === 'publicado'"
                variante="secondary"
                icono="ti-archive"
                :deshabilitado="cambiandoEstado"
                @click="cambiarEstado('obsoleto')"
              >
                Marcar obsoleto
              </CarbonButton>
              <CarbonButton v-if="puedeEditar" variante="danger" icono="ti-trash" @click="confirmarEliminar = true">
                Eliminar
              </CarbonButton>
            </div>

            <div v-if="puedeVotar" class="kb-feedback-bloque">
              <span class="kb-feedback-label">¿Te sirvió este artículo?</span>
              <CarbonButton variante="ghost" icono="ti-thumb-up" :deshabilitado="votando" @click="votar(true)">
                Sí ({{ articulo.util_si }})
              </CarbonButton>
              <CarbonButton variante="ghost" icono="ti-thumb-down" :deshabilitado="votando" @click="votar(false)">
                No ({{ articulo.util_no }})
              </CarbonButton>
            </div>
          </template>

          <form v-else class="kb-form-edicion" @submit.prevent="guardarEdicion">
            <CarbonCampo v-model="formEdicion.titulo" etiqueta="Título" requerido :deshabilitado="guardandoEdicion" />

            <CarbonCampo v-model="formEdicion.categoria_id" etiqueta="Categoría" tipo="select" :deshabilitado="guardandoEdicion">
              <template #opciones>
                <option value="">Sin categoría</option>
                <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
              </template>
            </CarbonCampo>

            <CarbonCampo v-model="formEdicion.sintoma" etiqueta="Síntoma" :deshabilitado="guardandoEdicion" />

            <CarbonCampo
              v-model="formEdicion.solucion"
              etiqueta="Solución"
              tipo="textarea"
              :filas="8"
              placeholder="Pasos para resolverlos..."
              :deshabilitado="guardandoEdicion"
            />
            <div class="modal-actions">
              <CarbonButton variante="secondary" :deshabilitado="guardandoEdicion" @click="editando = false">Cancelar</CarbonButton>
              <CarbonButton variante="primary" tipo="submit" :cargando="guardandoEdicion">
                {{ guardandoEdicion ? 'Guardando...' : 'Guardar' }}
              </CarbonButton>
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

<style scoped>
.header-emp h1 {
  font-size: var(--fs-heading-02);
  font-weight: 600;
  margin: 0;
}

.header-sub {
  font-size: var(--fs-label-01);
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
  font-size: var(--fs-label-01);
  color: var(--color-text-tertiary);
}

.kb-bloque { margin-bottom: 20px; }

.kb-texto {
  font-size: var(--fs-body-01);
  color: var(--color-text-primary);
  white-space: pre-wrap;
  margin: 6px 0 0;
}

.kb-solucion {
  background: var(--color-bg-subtle);
  border-radius: var(--radius-base);
  padding: 10px 12px;
}

/* A diferencia de un "sin datos" neutro (.tk-nota), este vacío requiere
   acción: es el borrador que el sistema crea solo al cerrar un ticket. */
.kb-solucion-pendiente {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-label-01);
  color: var(--color-warning-text);
  margin: 6px 0 0;
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
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.kb-form-edicion {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Mismo patrón que TicketDetalleView (columna de datos): título de sección
   con ícono, bloques separados por borde superior sutil, texto secundario
   para el detalle y terciario/itálica para las notas vacías. */
.tk-kb-relacionado {
  display: block;
  font-size: var(--fs-label-01);
  color: var(--color-accent-text);
  text-decoration: none;
}
.tk-kb-relacionado:hover { text-decoration: underline; }
</style>
