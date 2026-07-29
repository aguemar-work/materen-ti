<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { showToast } from '../../core/toast.js';
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import { estadoInfo, prioridadInfo, OPCIONES_PRIORIDAD as PRIORIDADES, NIVELES_ATENCION, ESTADOS_EN_CURSO, ESTADOS_TERMINALES, HITO_LABELS, EVENTO_LABELS } from '../../core/dominio-tickets.js';
import { useAuthStore } from '../../stores/auth.js';
import { useTicketDetalleStore } from '../../stores/ticketDetalle.js';
import { useVolverContextual } from '../../composables/useVolverContextual.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useTicketDetalleStore();
const { volver } = useVolverContextual();

const { ticket, comentarios, eventos, satisfaccion, equiposEmpleado, articulosRelacionados, cargando, staffActivo, staffPorId } = storeToRefs(store);

const guardandoCampo = ref(false);

const nuevoComentario = ref('');
const comentarioInterno = ref(true);
const enviandoComentario = ref(false);

// Auto-crece con el texto hasta un tope (igual que un chat); pasado ese
// tope, scrollea adentro en vez de seguir empujando el layout de la página.
const comentarioTextarea = ref(null);
const ALTURA_MAX_TEXTAREA = 160;

function autoCrecerTextarea() {
  const el = comentarioTextarea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAX_TEXTAREA)}px`;
}

function autorDe(autorId) {
  return autorId ? (staffPorId.value[autorId] || 'Staff') : 'Sistema';
}

// El color de cada hito viene del MISMO estadoInfo() que pintan los badges
// de estado en el resto de la app — un estado siempre significa el mismo
// color, nunca un mapeo de color aparte solo para esta lista.
function colorDeEstado(estado) {
  return estadoInfo(estado).clase.replace('badge--', '');
}

// Historial: hitos del ciclo de vida (creado → inicio de atención/asignado
// → resuelto → cerrado) más los eventos auxiliares de ticket_eventos que
// antes se descartaban en silencio (reasignaciones, cambios de prioridad,
// avisos de correo fallido, encuesta) — ver GUIA-UX-UI / análisis de
// tickets: nadie se enteraba si el correo de confirmación/encuesta fallaba.
const historialEsencial = computed(() => {
  const hitos = [];
  for (const ev of eventos.value) {
    if (ev.evento === 'creado') {
      hitos.push({ id: ev.id, label: 'Ticket creado', fecha: ev.created_at, color: colorDeEstado('abierto') });
    } else if (ev.evento === 'estado_cambiado') {
      const nuevoEstado = /a "(\w+)"/.exec(ev.detalle || '')?.[1];
      const label = HITO_LABELS[nuevoEstado];
      if (!label) continue;
      const asignado = nuevoEstado === 'en_progreso' && ticket.value?.asignado_a
        ? ` · Asignado a ${staffPorId.value[ticket.value.asignado_a] || 'Staff'}`
        : '';
      hitos.push({ id: ev.id, label: label + asignado, fecha: ev.created_at, color: colorDeEstado(nuevoEstado) });
    } else if (ev.evento === 'reasignado') {
      hitos.push({ id: ev.id, label: EVENTO_LABELS.reasignado, fecha: ev.created_at, color: 'neutral' });
    } else if (ev.evento === 'prioridad_cambiada') {
      const nuevaPrioridad = /a "(\w+)"/.exec(ev.detalle || '')?.[1];
      hitos.push({ id: ev.id, label: `Prioridad cambiada a ${prioridadInfo(nuevaPrioridad).label}`, fecha: ev.created_at, color: 'info' });
    } else if (ev.evento === 'correo_fallido') {
      hitos.push({ id: ev.id, label: EVENTO_LABELS.correo_fallido, detalle: ev.detalle, fecha: ev.created_at, color: 'warning' });
    } else if (ev.evento === 'encuesta_enviada') {
      hitos.push({ id: ev.id, label: EVENTO_LABELS.encuesta_enviada, fecha: ev.created_at, color: 'neutral' });
    } else if (ev.evento === 'encuesta_respondida') {
      hitos.push({ id: ev.id, label: EVENTO_LABELS.encuesta_respondida, fecha: ev.created_at, color: 'success' });
    }
  }
  return hitos;
});

// ── Iniciar atención (abierto -> en_progreso): los campos (prioridad,
// nivel, asignado) se ven directo al entrar — no detrás de un botón que
// primero "revela" el formulario. Rechazar sigue sin pedir nada de esto.
const atencionForm = ref({ prioridad: 'media', nivelAtencion: 'N1', asignadoA: '' });
const iniciando = ref(false);

async function cargar() {
  try {
    await store.cargar(route.params.id);
    if (!ticket.value) {
      showToast('Ticket no encontrado', 'error');
      router.replace('/tickets');
      return;
    }
    // Precarga los 3 campos de una vez (sin un paso de "revelar" el
    // formulario aparte): al entrar al ticket ya se ven, listos para
    // ajustar y confirmar en un solo clic con "Iniciar atención".
    if (ticket.value.estado === 'abierto') {
      atencionForm.value = {
        prioridad: ticket.value.prioridad || 'media',
        nivelAtencion: 'N1',
        asignadoA: auth.user?.id || '',
      };
    }
  } catch (e) {
    showToast(e?.message || 'Error al cargar el ticket', 'error');
  }
}

async function confirmarIniciar() {
  if (!atencionForm.value.asignadoA) {
    showToast('Selecciona a quién se asigna el ticket', 'error');
    return;
  }
  iniciando.value = true;
  try {
    await store.actualizarCampos({
      estado: 'en_progreso',
      prioridad: atencionForm.value.prioridad,
      nivel_atencion: atencionForm.value.nivelAtencion,
      asignado_a: atencionForm.value.asignadoA,
    });
    showToast('Ticket en atención');
  } catch (e) {
    showToast(e?.message || 'No se pudo iniciar el ticket', 'error');
  } finally {
    iniciando.value = false;
  }
}

// ── Rechazar (abierto -> rechazado, terminal): exige un motivo, que queda
// como comentario visible para el empleado ──────────────────────────────
const mostrarRechazar = ref(false);
const motivoRechazo = ref('');
const rechazando = ref(false);

function abrirRechazar() {
  motivoRechazo.value = '';
  mostrarRechazar.value = true;
}

async function confirmarRechazar() {
  const motivo = motivoRechazo.value.trim();
  if (!motivo) {
    showToast('Escribe el motivo del rechazo', 'error');
    return;
  }
  rechazando.value = true;
  try {
    await store.comentar(motivo, false);
    await store.actualizarCampos({ estado: 'rechazado' });
    mostrarRechazar.value = false;
    showToast('Ticket rechazado');
  } catch (e) {
    showToast(e?.message || 'No se pudo rechazar el ticket', 'error');
  } finally {
    rechazando.value = false;
  }
}

// ── Marcar como resuelto: encadena resuelto -> cerrado en un solo clic
// (queda igual registrado en la hoja de vida) y dispara la encuesta ─────
const resolviendo = ref(false);
const guardarComoKb = ref(false);

async function marcarResuelto() {
  resolviendo.value = true;
  try {
    await store.actualizarCampos({ estado: 'resuelto' });
    await store.actualizarCampos({ estado: 'cerrado' });
    showToast('Ticket resuelto y cerrado');
    try {
      const data = await store.enviarEncuesta();
      if (data?.enviado) showToast('Encuesta de satisfacción enviada al correo del empleado');
    } catch { /* mejor esfuerzo: no bloquea el cierre del ticket */ }
    await store.recargarSatisfaccion();
    if (guardarComoKb.value) {
      try {
        await store.guardarComoBorradorKb();
        showToast('Solución guardada como borrador en la Base de Conocimiento');
      } catch { /* mejor esfuerzo: no bloquea el cierre del ticket */ }
    }
  } catch (e) {
    showToast(e?.message || 'No se pudo marcar como resuelto', 'error');
  } finally {
    resolviendo.value = false;
  }
}

// ── Reabrir: solo JEFE (reforzado también por trigger en BD) ────────────
const reabriendo = ref(false);

async function reabrirTicket() {
  reabriendo.value = true;
  try {
    await store.actualizarCampos({ estado: 'reabierto' });
    showToast('Ticket reabierto');
  } catch (e) {
    showToast(e?.message || 'No se pudo reabrir el ticket', 'error');
  } finally {
    reabriendo.value = false;
  }
}

async function cambiarNivelAtencion(valor) {
  guardandoCampo.value = true;
  try {
    await store.actualizarCampos({ nivel_atencion: valor || null });
  } catch (e) {
    showToast(e?.message || 'Error al cambiar el nivel de atención', 'error');
  } finally {
    guardandoCampo.value = false;
  }
}

async function cambiarPrioridad(nuevaPrioridad) {
  guardandoCampo.value = true;
  try {
    await store.actualizarCampos({ prioridad: nuevaPrioridad });
  } catch (e) {
    showToast(e?.message || 'Error al cambiar la prioridad', 'error');
  } finally {
    guardandoCampo.value = false;
  }
}

async function cambiarAsignado(staffId) {
  guardandoCampo.value = true;
  try {
    await store.actualizarCampos({ asignado_a: staffId || null });
    showToast(staffId ? 'Ticket asignado' : 'Asignación quitada');
  } catch (e) {
    showToast(e?.message || 'Error al asignar', 'error');
  } finally {
    guardandoCampo.value = false;
  }
}

async function toggleFlag(campo) {
  guardandoCampo.value = true;
  try {
    await store.actualizarCampos({ [campo]: !ticket.value[campo] });
  } catch (e) {
    showToast(e?.message || 'Error al guardar', 'error');
  } finally {
    guardandoCampo.value = false;
  }
}

async function enviarComentario() {
  const mensaje = nuevoComentario.value.trim();
  if (!mensaje) return;
  enviandoComentario.value = true;
  try {
    await store.comentar(mensaje, comentarioInterno.value);
    nuevoComentario.value = '';
    await nextTick();
    autoCrecerTextarea();
  } catch (e) {
    showToast(e?.message || 'Error al comentar', 'error');
  } finally {
    enviandoComentario.value = false;
  }
}

onMounted(cargar);
onUnmounted(() => store.limpiar());
</script>

<template>
  <div class="ticket-detalle-page vista-modulo">
    <PageHeader>
      <template #izquierda>
        <button class="icon-btn btn-volver" type="button" title="Volver" @click="volver('/tickets')">
          <i class="ti ti-arrow-left"></i>
        </button>
        <div v-if="ticket" class="header-emp">
          <h1>
            <span class="tk-codigo">{{ ticket.codigo }}</span>
            {{ ticket.titulo }}
          </h1>
          <span class="header-sub">{{ ticket.categoria_nombre }}{{ ticket.subcategoria_nombre ? ` · ${ticket.subcategoria_nombre}` : '' }}</span>
        </div>
      </template>
    </PageHeader>

    <main class="page page--padded">
      <div v-if="cargando" class="no-results">Cargando ticket...</div>

      <div v-else-if="ticket" class="grid-12">
        <!-- Columna de datos -->
        <div class="card col-3 tk-datos">
          <div class="datos-title"><i class="ti ti-info-circle"></i> Solicitante</div>
          <div v-if="ticket.vinculado && ticket.empleado_nombre" class="tk-solicitante">
            <RouterLink class="tk-nombre empleado-link" :to="`/empleados/${ticket.empleado_id}`">{{ ticket.empleado_nombre }}</RouterLink>
            <span class="tk-detalle">DNI {{ ticket.empleado_dni }}</span>
            <span v-if="ticket.empleado_correo" class="tk-detalle">{{ ticket.empleado_correo }}</span>
          </div>
          <div v-else class="tk-sin-vincular">
            <span class="badge badge--danger"><i class="ti ti-alert-triangle"></i> Sin vincular</span>
            <p v-if="ticket.contacto_ingresado" class="tk-detalle">Contacto ingresado: {{ ticket.contacto_ingresado }}</p>
            <p class="tk-nota">Revisa manualmente quién es y, si corresponde, vincúlalo desde comentarios.</p>
          </div>

          <div v-if="equiposEmpleado.length" class="tk-seccion">
            <div class="datos-title"><i class="ti ti-devices"></i> Equipos asignados</div>
            <p v-for="eq in equiposEmpleado" :key="eq.equipo_id" class="tk-detalle">
              <i class="ti ti-device-desktop"></i> {{ eq.codigo }} — {{ eq.marca }} {{ eq.modelo }}
              <BadgeEstado tipo="situacion" :valor="eq.situacion" class="badge-inline" />
            </p>
          </div>

          <div v-if="ticket.equipo_desc || ticket.cuenta_desc || ticket.licencia_desc" class="tk-seccion">
            <div class="datos-title"><i class="ti ti-link"></i> Enlazado a</div>
            <p v-if="ticket.equipo_desc" class="tk-detalle"><i class="ti ti-devices"></i> {{ ticket.equipo_desc }}</p>
            <p v-if="ticket.cuenta_desc" class="tk-detalle"><i class="ti ti-key"></i> {{ ticket.cuenta_desc }}</p>
            <p v-if="ticket.licencia_desc" class="tk-detalle"><i class="ti ti-license"></i> {{ ticket.licencia_desc }}</p>
          </div>

          <div v-if="ticket.adjunto_url" class="tk-seccion">
            <div class="datos-title"><i class="ti ti-camera"></i> Captura adjunta</div>
            <a :href="ticket.adjunto_url" target="_blank" rel="noopener noreferrer">
              <img class="tk-adjunto" :src="ticket.adjunto_url" alt="Captura adjunta al ticket">
            </a>
          </div>

          <div v-if="ticket.categoria_id" class="tk-seccion">
            <div class="datos-title"><i class="ti ti-books"></i> Artículos relacionados</div>
            <template v-if="articulosRelacionados.length">
              <RouterLink
                v-for="a in articulosRelacionados"
                :key="a.id"
                class="tk-kb-relacionado"
                :to="`/base-conocimiento/${a.id}`"
              >
                {{ a.titulo }}
              </RouterLink>
            </template>
            <p v-else class="tk-nota">Sin artículos publicados en esta categoría todavía.</p>
          </div>

          <div class="tk-seccion">
            <div class="datos-title">
              <i class="ti ti-adjustments"></i> Gestión
              <BadgeEstado tipo="ticket" :valor="ticket.estado" class="tk-estado-badge" />
            </div>

            <!-- abierto: campos de atención visibles directo (sin paso de
                 "revelar" el formulario) + Rechazar / Iniciar atención -->
            <template v-if="ticket.estado === 'abierto' && !mostrarRechazar">
              <div class="form-group">
                <label for="in-prioridad">Prioridad</label>
                <select id="in-prioridad" v-model="atencionForm.prioridad" :disabled="iniciando">
                  <option v-for="p in PRIORIDADES" :key="p.valor" :value="p.valor">{{ p.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="in-nivel">Nivel de atención</label>
                <select id="in-nivel" v-model="atencionForm.nivelAtencion" :disabled="iniciando">
                  <option v-for="n in NIVELES_ATENCION" :key="n.valor" :value="n.valor">{{ n.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="in-asignado">Asignado a</label>
                <select id="in-asignado" v-model="atencionForm.asignadoA" :disabled="iniciando">
                  <option value="" disabled>Seleccionar</option>
                  <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">
                    {{ s.user_id === auth.user?.id ? `${s.nombre} (yo)` : s.nombre }}
                  </option>
                </select>
              </div>
              <div class="tk-acciones-estado">
                <button class="btn btn-danger" type="button" :disabled="iniciando" @click="abrirRechazar">
                  <i class="ti ti-x" aria-hidden="true"></i> Rechazar
                </button>
                <button class="btn btn-primary" type="button" :disabled="iniciando" @click="confirmarIniciar">
                  <i :class="iniciando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-player-play'" aria-hidden="true"></i>
                  {{ iniciando ? 'Iniciando...' : 'Iniciar atención' }}
                </button>
              </div>
            </template>

            <!-- Formulario: Rechazar -->
            <div v-if="mostrarRechazar" class="tk-form-inline">
              <div class="form-group">
                <label for="re-motivo">Motivo del rechazo *</label>
                <textarea id="re-motivo" v-model="motivoRechazo" rows="3" placeholder="El empleado verá este motivo en su seguimiento" :disabled="rechazando"></textarea>
              </div>
              <div class="modal-actions">
                <button class="btn" type="button" :disabled="rechazando" @click="mostrarRechazar = false">Cancelar</button>
                <button class="btn btn-danger" type="button" :disabled="rechazando" @click="confirmarRechazar">
                  <i v-if="rechazando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
                  {{ rechazando ? 'Rechazando...' : 'Confirmar rechazo' }}
                </button>
              </div>
            </div>

            <!-- en curso: campos editables + Marcar como resuelto -->
            <template v-if="ESTADOS_EN_CURSO.includes(ticket.estado)">
              <div class="form-group">
                <label for="tk-prioridad">Prioridad</label>
                <select id="tk-prioridad" :value="ticket.prioridad" :disabled="guardandoCampo" @change="cambiarPrioridad($event.target.value)">
                  <option v-for="p in PRIORIDADES" :key="p.valor" :value="p.valor">{{ p.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="tk-nivel">Nivel de atención</label>
                <select id="tk-nivel" :value="ticket.nivel_atencion || ''" :disabled="guardandoCampo" @change="cambiarNivelAtencion($event.target.value)">
                  <option value="" disabled>Sin definir</option>
                  <option v-for="n in NIVELES_ATENCION" :key="n.valor" :value="n.valor">{{ n.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="tk-asignado">Asignado a</label>
                <select id="tk-asignado" :value="ticket.asignado_a || ''" :disabled="guardandoCampo" @change="cambiarAsignado($event.target.value)">
                  <option value="">Sin asignar</option>
                  <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
                </select>
              </div>
              <label class="check-inline">
                <input v-model="guardarComoKb" type="checkbox" :disabled="resolviendo">
                ¿Guardar esta solución en la Base de Conocimiento?
              </label>
              <button class="btn btn-primary tk-btn-resolver" type="button" :disabled="resolviendo" @click="marcarResuelto">
                <i :class="resolviendo ? 'ti ti-loader-2 spinner-icon' : 'ti ti-circle-check'" aria-hidden="true"></i>
                {{ resolviendo ? 'Cerrando...' : 'Marcar como resuelto' }}
              </button>
            </template>

            <!-- terminal: solo lectura + Reabrir (jefe) -->
            <template v-if="ESTADOS_TERMINALES.includes(ticket.estado)">
              <p class="tk-detalle">Prioridad: {{ PRIORIDADES.find((p) => p.valor === ticket.prioridad)?.label || ticket.prioridad }}</p>
              <p class="tk-detalle">Nivel de atención: {{ NIVELES_ATENCION.find((n) => n.valor === ticket.nivel_atencion)?.label || 'Sin definir' }}</p>
              <p class="tk-detalle">Asignado a: {{ staffPorId[ticket.asignado_a] || 'Sin asignar' }}</p>
              <button v-if="auth.esJefe" class="btn tk-btn-reabrir" type="button" :disabled="reabriendo" @click="reabrirTicket">
                <i :class="reabriendo ? 'ti ti-loader-2 spinner-icon' : 'ti ti-refresh'" aria-hidden="true"></i> {{ reabriendo ? 'Reabriendo...' : 'Reabrir ticket' }}
              </button>
              <p v-else class="tk-nota">Solo el jefe puede reabrir este ticket.</p>
            </template>

            <label class="check-inline">
              <input type="checkbox" :checked="ticket.es_leccion_aprendida" :disabled="guardandoCampo" @change="toggleFlag('es_leccion_aprendida')">
              Es lección aprendida
            </label>
          </div>

          <div v-if="satisfaccion" class="tk-seccion">
            <div class="datos-title"><i class="ti ti-mood-smile"></i> Satisfacción</div>
            <p v-if="satisfaccion.fecha_envio" class="tk-detalle">
              Nivel {{ satisfaccion.nivel }}/5 — {{ formatFecha(satisfaccion.fecha_envio) }}
            </p>
            <p v-if="satisfaccion.comentario" class="tk-nota">"{{ satisfaccion.comentario }}"</p>
            <p v-if="!satisfaccion.fecha_envio" class="tk-nota">Encuesta enviada, sin respuesta todavía.</p>
          </div>
        </div>

        <!-- Conversación -->
        <div class="card col-6 tk-conversacion">
          <div class="datos-title"><i class="ti ti-message-circle"></i> Conversación</div>
          <p class="tk-descripcion">{{ ticket.descripcion }}</p>

          <div v-if="comentarios.length" class="timeline tk-timeline">
            <div v-for="c in comentarios" :key="c.id" class="timeline-item">
              <span class="timeline-dot" :class="c.interno ? 'timeline-dot--closed' : 'timeline-dot--active'"></span>
              <div class="timeline-content tk-comentario-bubble" :class="c.interno ? 'tk-comentario-bubble--interno' : 'tk-comentario-bubble--visible'">
                <div class="timeline-title">
                  {{ autorDe(c.autor_id) }}
                  <span class="badge badge-inline" :class="c.interno ? 'badge--neutral' : 'badge--success'">
                    {{ c.interno ? 'Nota interna' : 'Visible para el empleado' }}
                  </span>
                </div>
                <div class="timeline-meta">{{ formatFechaHora(c.created_at) }}</div>
                <p class="tk-mensaje">{{ c.mensaje }}</p>
              </div>
            </div>
          </div>
          <p v-else class="tk-nota">Sin comentarios todavía.</p>

          <div v-if="!ESTADOS_TERMINALES.includes(ticket.estado)" class="tk-nuevo-comentario">
            <textarea
              ref="comentarioTextarea"
              v-model="nuevoComentario"
              rows="1"
              class="tk-comentario-input"
              placeholder="Escribe una nota interna o una respuesta para el empleado..."
              :disabled="enviandoComentario"
              @input="autoCrecerTextarea"
            ></textarea>
            <div class="tk-comentario-acciones">
              <label class="check-inline">
                <input v-model="comentarioInterno" type="checkbox" :disabled="enviandoComentario">
                Nota interna (no visible para el empleado)
              </label>
              <button class="btn btn-primary" type="button" :disabled="enviandoComentario || !nuevoComentario.trim()" @click="enviarComentario">
                <i v-if="enviandoComentario" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
                {{ enviandoComentario ? 'Enviando...' : 'Comentar' }}
              </button>
            </div>
          </div>
          <p v-else class="tk-nota">
            Ticket {{ estadoInfo(ticket.estado).label.toLowerCase() }} — {{ auth.esJefe ? 'reábrelo para seguir comentando.' : 'solo el jefe puede reabrirlo para seguir comentando.' }}
          </p>
        </div>

        <!-- Historial (hoja de vida): esencial, siempre visible, sin modal -->
        <div class="card col-3 tk-historial">
          <div class="datos-title"><i class="ti ti-history"></i> Historial</div>
          <div v-if="historialEsencial.length" class="timeline tk-historial-timeline">
            <div v-for="h in historialEsencial" :key="h.id" class="timeline-item">
              <span class="timeline-dot" :class="`timeline-dot--${h.color}`"></span>
              <div class="timeline-content">
                <div class="timeline-title">{{ h.label }}</div>
                <div class="timeline-meta">{{ formatFechaHora(h.fecha) }}</div>
                <div v-if="h.detalle" class="timeline-detalle">{{ h.detalle }}</div>
              </div>
            </div>
          </div>
          <p v-else class="tk-nota">Sin hitos todavía.</p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* .header-left/.header-inner se estilan en main.css (shell de PageHeader) */
.btn-volver { flex-shrink: 0; }

.header-emp h1 {
  font-size: var(--fs-xl);
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tk-codigo {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}

.header-sub {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}

.tk-datos, .tk-conversacion, .tk-historial {
  padding: 16px 20px 20px;
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

.tk-estado-badge {
  margin-left: auto;
}

.tk-acciones-estado {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.tk-acciones-estado .btn {
  flex: 1;
  justify-content: center;
}

.tk-form-inline {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tk-form-inline textarea {
  width: 100%;
}

.tk-btn-resolver {
  width: 100%;
  justify-content: center;
  margin-top: 6px;
}

.tk-btn-reabrir {
  width: 100%;
  justify-content: center;
  margin-top: 6px;
}

.tk-solicitante, .tk-sin-vincular {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tk-kb-relacionado {
  display: block;
  font-size: var(--fs-sm);
  color: var(--color-accent-text);
  text-decoration: none;
  margin-bottom: 6px;
}
.tk-kb-relacionado:hover { text-decoration: underline; }

.tk-nombre { font-size: var(--fs-base); font-weight: 600; color: var(--color-text-primary); }
.tk-detalle { font-size: var(--fs-sm); color: var(--color-text-secondary); margin: 2px 0; }
.tk-nota { font-size: var(--fs-sm); color: var(--color-text-tertiary); font-style: italic; margin: 4px 0 0; }

.tk-adjunto {
  max-width: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.check-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-base);
  color: var(--color-text-primary);
  cursor: pointer;
  margin-top: 10px;
}

.tk-descripcion {
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  background: var(--color-bg-subtle);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin-bottom: 16px;
  white-space: pre-wrap;
}

.tk-timeline { margin-bottom: 16px; }

/* Mismo par de colores que sus badges (--success = visible, --neutral =
   interna): un vistazo a la burbuja ya dice qué vio el empleado, sin
   depender de leer el badge de texto. */
.tk-comentario-bubble {
  border-radius: var(--radius-md);
  padding: 8px 10px;
}

.tk-comentario-bubble--interno { background: var(--color-neutral-bg); }
.tk-comentario-bubble--visible { background: var(--color-success-bg); }

.tk-mensaje {
  margin: 4px 0 0;
  font-size: var(--fs-base);
  color: var(--color-text-primary);
  white-space: pre-wrap;
}

.tk-nuevo-comentario {
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Crece con el texto (como un chat) hasta un tope, luego scrollea
   adentro — nunca se arrastra a mano ni sigue empujando la página. */
.tk-comentario-input {
  width: 100%;
  min-height: 40px;
  max-height: 160px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--fs-base);
  font-family: var(--font-sans);
  line-height: 1.4;
  color: var(--color-text-primary);
  background: var(--color-bg-elevated);
  resize: none;
  overflow-y: auto;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.tk-comentario-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--mat-ring);
}

.tk-comentario-acciones {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.tk-comentario-acciones .check-inline { margin-top: 0; }

/* Historial: misma .timeline global (main.css), más compacta por ser
   una columna angosta — título más chico, menos separación entre hitos. */
.tk-historial-timeline .timeline-item { padding-bottom: 12px; }
.tk-historial-timeline .timeline-title { font-size: var(--fs-sm); font-weight: 600; }
.tk-historial-timeline .timeline-meta { font-size: 11px; margin-top: 1px; }
.tk-historial-timeline .timeline-detalle { font-size: 11px; color: var(--color-warning-text); margin-top: 2px; }
</style>
