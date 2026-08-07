<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { useAuthStore } from '../../stores/auth.js';
import { useProblemaDetalleStore } from '../../stores/problemaDetalle.js';
import { useVolverContextual } from '../../composables/useVolverContextual.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, formatFechaHora, fechaLocalISO } from '../../core/formatters.js';
import { OPCIONES_SEVERIDAD_PROBLEMA, OPCIONES_ESTADO_ACCION } from '../../core/dominio-problemas.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useProblemaDetalleStore();
const { volver } = useVolverContextual();

const { problema, ticketsVinculados, accionesCorrectivas, staffActivo, staffPorId, cargando } = storeToRefs(store);

const guardandoCampo = ref(false);

async function cargar() {
  try {
    await store.cargar(route.params.id);
    if (!problema.value) {
      showToast('Problema no encontrado', 'error');
      router.replace('/problemas');
    }
  } catch (e) {
    showToast(e?.message || 'Error al cargar el problema', 'error');
  }
}

// ── Edición de título/descripción/causa raíz ─────────────────────────────
const editando = ref(false);
const guardandoEdicion = ref(false);
const formEdicion = ref({ titulo: '', descripcion: '', causa_raiz: '' });

function abrirEdicion() {
  formEdicion.value = {
    titulo: problema.value.titulo,
    descripcion: problema.value.descripcion,
    causa_raiz: problema.value.causa_raiz || '',
  };
  editando.value = true;
}

async function guardarEdicion() {
  guardandoEdicion.value = true;
  try {
    await store.actualizarCampos({
      titulo: formEdicion.value.titulo,
      descripcion: formEdicion.value.descripcion,
      causa_raiz: formEdicion.value.causa_raiz,
    });
    editando.value = false;
    showToast('Problema actualizado');
  } catch (e) {
    showToast(e?.message || 'No se pudo guardar', 'error');
  } finally {
    guardandoEdicion.value = false;
  }
}

// ── Severidad / responsable: cambio inmediato (igual que prioridad/
// asignado en TicketDetalleView) ────────────────────────────────────────
async function cambiarSeveridad(valor) {
  guardandoCampo.value = true;
  try {
    await store.actualizarCampos({ severidad: valor });
  } catch (e) {
    showToast(e?.message || 'Error al cambiar la severidad', 'error');
  } finally {
    guardandoCampo.value = false;
  }
}

async function cambiarResponsable(staffId) {
  guardandoCampo.value = true;
  try {
    await store.actualizarCampos({ responsable_id: staffId || null });
    showToast(staffId ? 'Problema asignado' : 'Asignación quitada');
  } catch (e) {
    showToast(e?.message || 'Error al asignar', 'error');
  } finally {
    guardandoCampo.value = false;
  }
}

// ── Transición de estado: un solo botón según el estado actual. El
// bloqueo de "cerrado con acciones pendientes/en_progreso" lo aplica el
// trigger check_problema_cierre (migración 033) — acá solo se muestra el
// mensaje de error que llega de la BD. ───────────────────────────────────
const SIGUIENTE_ESTADO = { abierto: 'diagnostico', diagnostico: 'acciones', acciones: 'cerrado' };
const LABEL_TRANSICION = {
  abierto: 'Pasar a diagnóstico',
  diagnostico: 'Pasar a acciones correctivas',
  acciones: 'Cerrar problema',
};
const cambiandoEstado = ref(false);

async function avanzarEstado() {
  const siguiente = SIGUIENTE_ESTADO[problema.value.estado];
  if (!siguiente) return;
  cambiandoEstado.value = true;
  try {
    await store.actualizarCampos({ estado: siguiente });
    showToast(siguiente === 'cerrado' ? 'Problema cerrado' : 'Estado actualizado');
  } catch (e) {
    showToast(e?.message || 'No se pudo cambiar el estado', 'error');
  } finally {
    cambiandoEstado.value = false;
  }
}

async function reabrirProblema() {
  cambiandoEstado.value = true;
  try {
    await store.actualizarCampos({ estado: 'abierto' });
    showToast('Problema reabierto');
  } catch (e) {
    showToast(e?.message || 'No se pudo reabrir el problema', 'error');
  } finally {
    cambiandoEstado.value = false;
  }
}

// ── Tickets vinculados ────────────────────────────────────────────────
const codigoNuevoTicket = ref('');
const vinculandoTicket = ref(false);

async function vincularTicketPorCodigo() {
  const codigo = codigoNuevoTicket.value.trim();
  if (!codigo) return;
  vinculandoTicket.value = true;
  try {
    const { items } = await insforgeApi.listTicketsPage({ q: codigo, tamPagina: 5 });
    const match = items.find((t) => t.codigo.toLowerCase() === codigo.toLowerCase());
    if (!match) {
      showToast(`No se encontró ningún ticket con código "${codigo}"`, 'error');
      return;
    }
    await store.vincularTicket(match.id);
    codigoNuevoTicket.value = '';
    showToast('Ticket vinculado');
  } catch (e) {
    showToast(e?.message || 'No se pudo vincular el ticket', 'error');
  } finally {
    vinculandoTicket.value = false;
  }
}

async function desvincular(vinculoId) {
  try {
    await store.desvincularTicket(vinculoId);
    showToast('Ticket desvinculado');
  } catch (e) {
    showToast(e?.message || 'No se pudo desvincular el ticket', 'error');
  }
}

// ── Acciones correctivas ─────────────────────────────────────────────────
const nuevaAccion = ref({ descripcion: '', responsable_id: '', fecha_limite: '' });
const creandoAccion = ref(false);

async function crearAccion() {
  if (!nuevaAccion.value.descripcion.trim() || !nuevaAccion.value.fecha_limite) {
    showToast('Escribe una descripción y una fecha límite', 'error');
    return;
  }
  creandoAccion.value = true;
  try {
    await store.crearAccion({
      descripcion: nuevaAccion.value.descripcion,
      responsable_id: nuevaAccion.value.responsable_id || null,
      fecha_limite: nuevaAccion.value.fecha_limite,
    });
    nuevaAccion.value = { descripcion: '', responsable_id: '', fecha_limite: '' };
    showToast('Acción correctiva creada');
  } catch (e) {
    showToast(e?.message || 'No se pudo crear la acción correctiva', 'error');
  } finally {
    creandoAccion.value = false;
  }
}

async function cambiarEstadoAccion(id, estado) {
  try {
    await store.actualizarAccion(id, { estado });
  } catch (e) {
    showToast(e?.message || 'No se pudo actualizar la acción correctiva', 'error');
  }
}

async function eliminarAccion(id) {
  try {
    await store.eliminarAccion(id);
    showToast('Acción correctiva eliminada');
  } catch (e) {
    showToast(e?.message || 'No se pudo eliminar la acción correctiva', 'error');
  }
}

function accionVencida(accion) {
  return accion.estado !== 'completada' && accion.fecha_limite < fechaLocalISO();
}

// ── Eliminar problema (solo JEFE, ver RLS de la migración 033) ──────────
const confirmarEliminar = ref(false);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

async function eliminar() {
  eliminando.value = true;
  try {
    await store.eliminarProblema();
    showToast('Problema eliminado');
    router.push('/problemas');
  } catch (e) {
    showToast(e?.message || 'No se pudo eliminar', 'error');
    eliminando.value = false;
  }
}

onMounted(cargar);
onUnmounted(() => store.limpiar());
</script>

<template>
  <div class="problema-detalle-page vista-modulo">
    <PageHeader>
      <template #izquierda>
        <button class="icon-btn btn-volver" type="button" title="Volver" @click="volver('/problemas')">
          <i class="ti ti-arrow-left"></i>
        </button>
        <div v-if="problema" class="header-emp">
          <h1>{{ problema.titulo }}</h1>
          <span class="header-sub">Actualizado {{ formatFechaHora(problema.updated_at) }}</span>
        </div>
      </template>
    </PageHeader>

    <main class="page page--padded">
      <div v-if="cargando" class="no-results">Cargando problema...</div>

      <div v-else-if="problema" class="grid-12">
        <div class="card col-8 problema-contenido">
          <div class="problema-encabezado">
            <BadgeEstado tipo="problema_estado" :valor="problema.estado" />
            <BadgeEstado tipo="problema_severidad" :valor="problema.severidad" />

            <div class="problema-encabezado-acciones">
              <button
                v-if="problema.estado !== 'cerrado'"
                class="btn btn-primary"
                type="button"
                :disabled="cambiandoEstado"
                @click="avanzarEstado"
              >
                <i :class="cambiandoEstado ? 'ti ti-loader-2 spinner-icon' : 'ti ti-arrow-right'" aria-hidden="true"></i>
                {{ LABEL_TRANSICION[problema.estado] }}
              </button>
              <button v-else class="btn" type="button" :disabled="cambiandoEstado" @click="reabrirProblema">
                <i :class="cambiandoEstado ? 'ti ti-loader-2 spinner-icon' : 'ti ti-refresh'" aria-hidden="true"></i> Reabrir
              </button>
            </div>
          </div>

          <template v-if="!editando">
            <div class="problema-bloque">
              <div class="datos-title">Descripción</div>
              <p class="problema-texto">{{ problema.descripcion }}</p>
            </div>
            <div class="problema-bloque">
              <div class="datos-title">Causa raíz</div>
              <p v-if="problema.causa_raiz" class="problema-texto">{{ problema.causa_raiz }}</p>
              <p v-else class="tk-nota">Todavía sin diagnosticar.</p>
            </div>

            <div class="problema-acciones">
              <button class="btn" type="button" @click="abrirEdicion">
                <i class="ti ti-pencil" aria-hidden="true"></i> Editar
              </button>
              <button v-if="auth.esJefe" class="btn btn-danger" type="button" @click="confirmarEliminar = true">
                <i class="ti ti-trash" aria-hidden="true"></i> Eliminar
              </button>
            </div>
          </template>

          <form v-else class="problema-form-edicion" @submit.prevent="guardarEdicion">
            <div class="form-group">
              <label for="pe-titulo">Título</label>
              <input id="pe-titulo" v-model="formEdicion.titulo" required :disabled="guardandoEdicion">
            </div>
            <div class="form-group">
              <label for="pe-descripcion">Descripción</label>
              <textarea id="pe-descripcion" v-model="formEdicion.descripcion" rows="5" required :disabled="guardandoEdicion"></textarea>
            </div>
            <div class="form-group">
              <label for="pe-causa">Causa raíz</label>
              <textarea id="pe-causa" v-model="formEdicion.causa_raiz" rows="4" :disabled="guardandoEdicion" placeholder="Se completa durante el diagnóstico"></textarea>
            </div>
            <div class="modal-actions">
              <button class="btn" type="button" :disabled="guardandoEdicion" @click="editando = false">Cancelar</button>
              <button class="btn btn-primary" type="submit" :disabled="guardandoEdicion">
                <i v-if="guardandoEdicion" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
                {{ guardandoEdicion ? 'Guardando...' : 'Guardar' }}
              </button>
            </div>
          </form>

          <div class="tk-seccion">
            <div class="datos-title"><i class="ti ti-list-check" aria-hidden="true"></i> Acciones correctivas</div>

            <div v-if="accionesCorrectivas.length" class="acciones-lista">
              <div v-for="a in accionesCorrectivas" :key="a.id" class="accion-item" :class="{ 'accion-item--vencida': accionVencida(a) }">
                <div class="accion-info">
                  <p class="accion-descripcion">{{ a.descripcion }}</p>
                  <p class="accion-meta">
                    <span v-if="a.responsable_id">{{ staffPorId[a.responsable_id] || 'Staff' }} · </span>
                    Vence {{ formatFecha(a.fecha_limite) }}
                    <span v-if="accionVencida(a)" class="accion-vencida-tag">VENCIDA</span>
                  </p>
                </div>
                <select :value="a.estado" @change="cambiarEstadoAccion(a.id, $event.target.value)">
                  <option v-for="e in OPCIONES_ESTADO_ACCION" :key="e.valor" :value="e.valor">{{ e.label }}</option>
                </select>
                <button class="icon-btn" type="button" title="Eliminar acción" @click="eliminarAccion(a.id)">
                  <i class="ti ti-trash" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <p v-else class="tk-nota">Sin acciones correctivas todavía.</p>

            <form class="accion-form-nueva" @submit.prevent="crearAccion">
              <input v-model="nuevaAccion.descripcion" placeholder="Nueva acción correctiva..." :disabled="creandoAccion">
              <select v-model="nuevaAccion.responsable_id" :disabled="creandoAccion">
                <option value="">Sin asignar</option>
                <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
              </select>
              <input v-model="nuevaAccion.fecha_limite" type="date" :disabled="creandoAccion">
              <button class="btn btn-primary" type="submit" :disabled="creandoAccion">
                <i :class="creandoAccion ? 'ti ti-loader-2 spinner-icon' : 'ti ti-plus'" aria-hidden="true"></i>
              </button>
            </form>
          </div>
        </div>

        <div class="card col-4 problema-meta">
          <div class="datos-title"><i class="ti ti-info-circle"></i> Detalle</div>

          <div class="form-group">
            <label for="pm-severidad">Severidad</label>
            <select id="pm-severidad" :value="problema.severidad" :disabled="guardandoCampo" @change="cambiarSeveridad($event.target.value)">
              <option v-for="s in OPCIONES_SEVERIDAD_PROBLEMA" :key="s.valor" :value="s.valor">{{ s.label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label for="pm-responsable">Responsable</label>
            <select id="pm-responsable" :value="problema.responsable_id || ''" :disabled="guardandoCampo" @change="cambiarResponsable($event.target.value)">
              <option value="">Sin asignar</option>
              <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
            </select>
          </div>
          <p class="tk-detalle">Creado {{ formatFechaHora(problema.created_at) }}</p>

          <div class="tk-seccion">
            <div class="datos-title"><i class="ti ti-ticket" aria-hidden="true"></i> Tickets vinculados</div>
            <div v-if="ticketsVinculados.length" class="tickets-vinculados-lista">
              <div v-for="t in ticketsVinculados" :key="t.vinculo_id" class="ticket-vinculado-item">
                <RouterLink class="tk-kb-relacionado" :to="`/tickets/${t.ticket_id}`">{{ t.codigo }} — {{ t.titulo }}</RouterLink>
                <button class="icon-btn" type="button" title="Desvincular" @click="desvincular(t.vinculo_id)">
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <p v-else class="tk-nota">Sin tickets vinculados todavía.</p>

            <form class="vincular-ticket-form" @submit.prevent="vincularTicketPorCodigo">
              <input v-model="codigoNuevoTicket" placeholder="Código de ticket (TCK-0001)" :disabled="vinculandoTicket">
              <button class="btn" type="button" :disabled="vinculandoTicket || !codigoNuevoTicket.trim()" @click="vincularTicketPorCodigo">
                <i :class="vinculandoTicket ? 'ti ti-loader-2 spinner-icon' : 'ti ti-link'" aria-hidden="true"></i> Vincular
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>

    <ConfirmDialog
      v-if="confirmarEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar problema"
      :mensaje="`¿Eliminar el problema “${problema?.titulo}”? No se podrá deshacer desde la interfaz.`"
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

.problema-contenido, .problema-meta { padding: 16px 20px 20px; }

.problema-encabezado {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.problema-encabezado-acciones { margin-left: auto; }

.problema-bloque { margin-bottom: 20px; }

.problema-texto {
  font-size: var(--fs-base);
  color: var(--color-text-primary);
  white-space: pre-wrap;
  margin: 6px 0 0;
}

.problema-acciones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
}

.problema-form-edicion {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.datos-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 10px;
}

.tk-seccion {
  margin-top: 16px;
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
}

.tk-detalle { font-size: var(--fs-sm); color: var(--color-text-secondary); margin: 2px 0; }
.tk-nota { font-size: var(--fs-sm); color: var(--color-text-tertiary); font-style: italic; margin: 4px 0 0; }

.tk-kb-relacionado {
  font-size: var(--fs-sm);
  color: var(--color-accent-text);
  text-decoration: none;
}
.tk-kb-relacionado:hover { text-decoration: underline; }

/* ── Acciones correctivas ────────────────────────────────────────────── */
.acciones-lista { display: flex; flex-direction: column; gap: 8px; }

.accion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--color-bg-subtle);
  border-left: 3px solid transparent;
}

.accion-item--vencida { border-left-color: var(--color-danger); }

.accion-info { flex: 1; min-width: 0; }

.accion-descripcion {
  font-size: var(--fs-base);
  color: var(--color-text-primary);
  margin: 0;
}

.accion-meta {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  margin: 2px 0 0;
}

.accion-vencida-tag {
  color: var(--color-danger);
  font-weight: 600;
  margin-left: 4px;
}

.accion-form-nueva {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 8px;
  margin-top: 12px;
}

/* ── Tickets vinculados ────────────────────────────────────────────────── */
.tickets-vinculados-lista { display: flex; flex-direction: column; gap: 6px; }

.ticket-vinculado-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.vincular-ticket-form {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.vincular-ticket-form input { flex: 1; }
</style>
