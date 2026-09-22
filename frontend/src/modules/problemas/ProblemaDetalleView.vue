<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
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
import { rolDeTag } from '../../core/tagRol.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useProblemaDetalleStore();
const { volver } = useVolverContextual();

const { problema, ticketsVinculados, accionesCorrectivas, staffActivo, staffPorId, cargando } = storeToRefs(store);

const guardandoCampo = ref(false);
const campoSeveridadDetalle = useCampoAccesible();
const campoResponsableDetalle = useCampoAccesible();

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
const campoTituloEdicion = useCampoAccesible();
const campoDescripcionEdicion = useCampoAccesible();
const campoCausaRaizEdicion = useCampoAccesible();

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
    showToast('Escriba una descripción y una fecha límite', 'error');
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
        <button class="icon-btn btn-volver" type="button" title="Volver" aria-label="Volver" @click="volver('/problemas')">
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

            <div v-if="!editando" class="problema-encabezado-acciones">
              <button
                v-if="problema.estado !== 'cerrado'"
                type="button"
                class="btn btn--primary"
                :disabled="cambiandoEstado"
                @click="avanzarEstado"
              >
                {{ LABEL_TRANSICION[problema.estado] }}
                <i v-if="cambiandoEstado" class="ti ti-loader-2" aria-hidden="true"></i>
                <i v-else class="ti ti-arrow-right" aria-hidden="true"></i>
              </button>
              <button v-else type="button" class="btn btn--secondary" :disabled="cambiandoEstado" @click="reabrirProblema">
                Reabrir
                <i v-if="cambiandoEstado" class="ti ti-loader-2" aria-hidden="true"></i>
                <i v-else class="ti ti-refresh" aria-hidden="true"></i>
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
              <button type="button" class="btn btn--secondary" @click="abrirEdicion">
                Editar
                <i class="ti ti-pencil" aria-hidden="true"></i>
              </button>
              <button v-if="auth.esJefe" type="button" class="btn btn--danger" @click="confirmarEliminar = true">
                Eliminar
                <i class="ti ti-trash" aria-hidden="true"></i>
              </button>
            </div>
          </template>

          <form v-else class="problema-form-edicion" @submit.prevent="guardarEdicion">
            <div class="campo" :class="{ 'campo--inerte': guardandoEdicion }">
              <label class="campo__etiqueta" :for="campoTituloEdicion.id">Título<span aria-hidden="true"> *</span></label>
              <div class="campo__caja">
                <input
                  :id="campoTituloEdicion.id"
                  v-model="formEdicion.titulo"
                  class="campo__control"
                  type="text"
                  required
                  :disabled="guardandoEdicion"
                >
              </div>
            </div>
            <div class="campo" :class="{ 'campo--inerte': guardandoEdicion }">
              <label class="campo__etiqueta" :for="campoDescripcionEdicion.id">Descripción<span aria-hidden="true"> *</span></label>
              <div class="campo__caja">
                <textarea
                  :id="campoDescripcionEdicion.id"
                  v-model="formEdicion.descripcion"
                  class="campo__control campo__control--area"
                  :rows="5"
                  required
                  :disabled="guardandoEdicion"
                ></textarea>
              </div>
            </div>
            <div class="campo" :class="{ 'campo--inerte': guardandoEdicion }">
              <label class="campo__etiqueta" :for="campoCausaRaizEdicion.id">Causa raíz</label>
              <div class="campo__caja">
                <textarea
                  :id="campoCausaRaizEdicion.id"
                  v-model="formEdicion.causa_raiz"
                  class="campo__control campo__control--area"
                  :rows="4"
                  placeholder="Se completa durante el diagnóstico"
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

          <div class="tk-seccion">
            <div class="datos-title"><i class="ti ti-list-check" aria-hidden="true"></i> Acciones correctivas</div>

            <div v-if="accionesCorrectivas.length" class="acciones-lista">
              <div v-for="a in accionesCorrectivas" :key="a.id" class="accion-item">
                <div class="accion-info">
                  <p class="accion-descripcion">{{ a.descripcion }}</p>
                  <p class="accion-meta">
                    <span v-if="a.responsable_id">{{ staffPorId[a.responsable_id] || 'Staff' }} · </span>
                    Vence {{ formatFecha(a.fecha_limite) }}
                    <span v-if="accionVencida(a)" class="tag badge-inline" :class="`tag--${rolDeTag('danger')}`">Vencida</span>
                  </p>
                </div>
                <select :value="a.estado" @change="cambiarEstadoAccion(a.id, $event.target.value)">
                  <option v-for="e in OPCIONES_ESTADO_ACCION" :key="e.valor" :value="e.valor">{{ e.label }}</option>
                </select>
                <button class="icon-btn" type="button" title="Eliminar acción" aria-label="Eliminar acción" @click="eliminarAccion(a.id)">
                  <i class="ti ti-trash" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <p v-else class="tk-nota">Sin acciones correctivas todavía.</p>

            <form class="accion-form-nueva" @submit.prevent="crearAccion">
              <input v-model="nuevaAccion.descripcion" aria-label="Nueva acción correctiva" placeholder="ej: Reemplazar switch del piso 3" :disabled="creandoAccion">
              <select v-model="nuevaAccion.responsable_id" aria-label="Responsable de la acción correctiva" :disabled="creandoAccion">
                <option value="">Sin asignar</option>
                <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
              </select>
              <input v-model="nuevaAccion.fecha_limite" type="date" aria-label="Fecha límite de la acción correctiva" :disabled="creandoAccion">
              <button
                type="submit"
                class="btn btn--secondary btn--solo-icono"
                :disabled="creandoAccion"
                title="Agregar acción correctiva"
                aria-label="Agregar acción correctiva"
              >
                <i v-if="creandoAccion" class="ti ti-loader-2" aria-hidden="true"></i>
                <i v-else class="ti ti-plus" aria-hidden="true"></i>
              </button>
            </form>
          </div>
        </div>

        <div class="card col-4 problema-meta">
          <div class="datos-title"><i class="ti ti-info-circle"></i> Detalle</div>

          <div class="campo" :class="{ 'campo--inerte': guardandoCampo }">
            <label class="campo__etiqueta" :for="campoSeveridadDetalle.id">Severidad</label>
            <div class="campo__caja">
              <select
                :id="campoSeveridadDetalle.id"
                class="campo__control campo__control--select"
                :value="problema.severidad"
                :disabled="guardandoCampo"
                @change="cambiarSeveridad($event.target.value)"
              >
                <option v-for="s in OPCIONES_SEVERIDAD_PROBLEMA" :key="s.valor" :value="s.valor">{{ s.label }}</option>
              </select>
              <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
            </div>
          </div>

          <div class="campo" :class="{ 'campo--inerte': guardandoCampo }">
            <label class="campo__etiqueta" :for="campoResponsableDetalle.id">Responsable</label>
            <div class="campo__caja">
              <select
                :id="campoResponsableDetalle.id"
                class="campo__control campo__control--select"
                :value="problema.responsable_id || ''"
                :disabled="guardandoCampo"
                @change="cambiarResponsable($event.target.value)"
              >
                <option value="">Sin asignar</option>
                <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
              </select>
              <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
            </div>
          </div>
          <p class="tk-detalle">Creado {{ formatFechaHora(problema.created_at) }}</p>

          <div class="tk-seccion">
            <div class="datos-title"><i class="ti ti-ticket" aria-hidden="true"></i> Tickets vinculados</div>
            <div v-if="ticketsVinculados.length" class="tickets-vinculados-lista">
              <div v-for="t in ticketsVinculados" :key="t.vinculo_id" class="ticket-vinculado-item">
                <RouterLink class="tk-kb-relacionado" :to="`/tickets/${t.ticket_id}`">{{ t.codigo }} — {{ t.titulo }}</RouterLink>
                <button class="icon-btn" type="button" title="Desvincular" aria-label="Desvincular" @click="desvincular(t.vinculo_id)">
                  <i class="ti ti-x" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <p v-else class="tk-nota">Sin tickets vinculados todavía.</p>

            <form class="vincular-ticket-form" @submit.prevent="vincularTicketPorCodigo">
              <input v-model="codigoNuevoTicket" aria-label="Código de ticket a vincular" placeholder="ej: TCK-0001" :disabled="vinculandoTicket">
              <button
                type="button"
                class="btn btn--secondary"
                :disabled="vinculandoTicket || !codigoNuevoTicket.trim()"
                @click="vincularTicketPorCodigo"
              >
                Vincular
                <i v-if="vinculandoTicket" class="ti ti-loader-2" aria-hidden="true"></i>
                <i v-else class="ti ti-link" aria-hidden="true"></i>
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


