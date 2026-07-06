<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { getClient } from '../../api/insforge.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';

const route = useRoute();
const router = useRouter();

const ticket = ref(null);
const comentarios = ref([]);
const eventos = ref([]);
const satisfaccion = ref(null);
const staffLista = ref([]);
const cargando = ref(true);
const guardandoCampo = ref(false);

const nuevoComentario = ref('');
const comentarioInterno = ref(true);
const enviandoComentario = ref(false);

const mostrarHoja = ref(false);
const cargandoHoja = ref(false);

const ESTADOS = [
  { valor: 'abierto', label: 'Abierto' },
  { valor: 'en_progreso', label: 'En progreso' },
  { valor: 'resuelto', label: 'Resuelto' },
  { valor: 'cerrado', label: 'Cerrado' },
  { valor: 'reabierto', label: 'Reabierto' },
];

const PRIORIDADES = [
  { valor: 'baja', label: 'Baja' },
  { valor: 'media', label: 'Media' },
  { valor: 'alta', label: 'Alta' },
  { valor: 'urgente', label: 'Urgente' },
];

const staffPorId = computed(() => {
  const mapa = {};
  for (const s of staffLista.value) mapa[s.user_id] = s.nombre;
  return mapa;
});

function autorDe(autorId) {
  return autorId ? (staffPorId.value[autorId] || 'Staff') : 'Sistema';
}

function formatFechaHora(iso) {
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const EVENTO_LABELS = {
  creado: 'Ticket creado',
  reasignado: 'Reasignado',
  estado_cambiado: 'Cambio de estado',
  prioridad_cambiada: 'Cambio de prioridad',
  correo_fallido: 'No se pudo enviar el correo',
  encuesta_enviada: 'Encuesta enviada',
  encuesta_respondida: 'Encuesta respondida',
};

async function cargar() {
  cargando.value = true;
  try {
    const [t, coms, staff] = await Promise.all([
      insforgeApi.getTicket(route.params.id),
      insforgeApi.listComentariosTicket(route.params.id),
      insforgeApi.listStaff(),
    ]);
    if (!t) {
      showToast('Ticket no encontrado', 'error');
      router.replace('/tickets');
      return;
    }
    ticket.value = t;
    comentarios.value = coms;
    staffLista.value = staff.filter((s) => s.activo);
    if (t.estado === 'resuelto' || t.estado === 'cerrado') {
      satisfaccion.value = await insforgeApi.getSatisfaccionTicket(route.params.id);
    }
  } catch (e) {
    showToast(e?.message || 'Error al cargar el ticket', 'error');
  } finally {
    cargando.value = false;
  }
}

async function cambiarEstado(nuevoEstado) {
  const anterior = ticket.value.estado;
  if (nuevoEstado === anterior) return;
  guardandoCampo.value = true;
  try {
    await insforgeApi.actualizarTicket(ticket.value.id, { estado: nuevoEstado });
    ticket.value.estado = nuevoEstado;
    showToast(`Ticket ${ESTADOS.find((e) => e.valor === nuevoEstado)?.label.toLowerCase()}`);

    if (nuevoEstado === 'cerrado') {
      // Encuesta de satisfacción: mejor esfuerzo, la edge function decide
      // si aplica (ticket interno sin empleado → no envía nada).
      try {
        const { data } = await getClient().functions.invoke('tickets', {
          body: { action: 'enviarEncuesta', ticketId: ticket.value.id },
        });
        if (data?.enviado) showToast('Encuesta de satisfacción enviada al correo del empleado');
      } catch { /* mejor esfuerzo: no bloquea el cierre del ticket */ }
      satisfaccion.value = await insforgeApi.getSatisfaccionTicket(ticket.value.id);
    }
  } catch (e) {
    showToast(e?.message || 'Error al cambiar el estado', 'error');
  } finally {
    guardandoCampo.value = false;
  }
}

async function cambiarPrioridad(nuevaPrioridad) {
  guardandoCampo.value = true;
  try {
    await insforgeApi.actualizarTicket(ticket.value.id, { prioridad: nuevaPrioridad });
    ticket.value.prioridad = nuevaPrioridad;
  } catch (e) {
    showToast(e?.message || 'Error al cambiar la prioridad', 'error');
  } finally {
    guardandoCampo.value = false;
  }
}

async function cambiarAsignado(staffId) {
  guardandoCampo.value = true;
  try {
    await insforgeApi.actualizarTicket(ticket.value.id, { asignado_a: staffId || null });
    ticket.value.asignado_a = staffId || null;
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
    const valor = !ticket.value[campo];
    await insforgeApi.actualizarTicket(ticket.value.id, { [campo]: valor });
    ticket.value[campo] = valor;
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
    await insforgeApi.crearComentarioTicket(ticket.value.id, mensaje, comentarioInterno.value);
    nuevoComentario.value = '';
    comentarios.value = await insforgeApi.listComentariosTicket(ticket.value.id);
  } catch (e) {
    showToast(e?.message || 'Error al comentar', 'error');
  } finally {
    enviandoComentario.value = false;
  }
}

async function abrirHoja() {
  mostrarHoja.value = true;
  cargandoHoja.value = true;
  try {
    eventos.value = await insforgeApi.listEventosTicket(ticket.value.id);
  } catch (e) {
    showToast(e?.message || 'Error al cargar la hoja de vida', 'error');
  } finally {
    cargandoHoja.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="ticket-detalle-page">
    <header class="site-header">
      <div class="header-inner">
        <div class="header-left">
          <button class="icon-btn btn-volver" type="button" title="Volver a tickets" @click="router.push('/tickets')">
            <i class="ti ti-arrow-left"></i>
          </button>
          <template v-if="ticket">
            <div class="header-emp">
              <h1>
                <span class="tk-codigo">{{ ticket.codigo }}</span>
                {{ ticket.titulo }}
              </h1>
              <span class="header-sub">{{ ticket.categoria_nombre }}{{ ticket.subcategoria_nombre ? ` · ${ticket.subcategoria_nombre}` : '' }}</span>
            </div>
          </template>
        </div>
        <button v-if="ticket" class="btn" type="button" @click="abrirHoja">
          <i class="ti ti-history" aria-hidden="true"></i> Hoja de vida
        </button>
      </div>
    </header>

    <main class="page">
      <div v-if="cargando" class="no-results">Cargando ticket...</div>

      <div v-else-if="ticket" class="grid-12">
        <!-- Columna de datos -->
        <div class="card col-4 tk-datos">
          <div class="datos-title"><i class="ti ti-info-circle"></i> Solicitante</div>
          <div v-if="ticket.vinculado && ticket.empleado_nombre" class="tk-solicitante">
            <span class="tk-nombre">{{ ticket.empleado_nombre }}</span>
            <span class="tk-detalle">DNI {{ ticket.empleado_dni }}</span>
            <span v-if="ticket.empleado_correo" class="tk-detalle">{{ ticket.empleado_correo }}</span>
          </div>
          <div v-else class="tk-sin-vincular">
            <span class="badge badge--danger"><i class="ti ti-alert-triangle"></i> Sin vincular</span>
            <p v-if="ticket.contacto_ingresado" class="tk-detalle">Contacto ingresado: {{ ticket.contacto_ingresado }}</p>
            <p class="tk-nota">Revisa manualmente quién es y, si corresponde, vincúlalo desde comentarios.</p>
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

          <div class="tk-seccion">
            <div class="datos-title"><i class="ti ti-adjustments"></i> Gestión</div>

            <div class="form-group">
              <label for="tk-estado">Estado</label>
              <select id="tk-estado" :value="ticket.estado" :disabled="guardandoCampo" @change="cambiarEstado($event.target.value)">
                <option v-for="e in ESTADOS" :key="e.valor" :value="e.valor">{{ e.label }}</option>
              </select>
            </div>

            <div class="form-group">
              <label for="tk-prioridad">Prioridad</label>
              <select id="tk-prioridad" :value="ticket.prioridad" :disabled="guardandoCampo" @change="cambiarPrioridad($event.target.value)">
                <option v-for="p in PRIORIDADES" :key="p.valor" :value="p.valor">{{ p.label }}</option>
              </select>
            </div>

            <div class="form-group">
              <label for="tk-asignado">Asignado a</label>
              <select id="tk-asignado" :value="ticket.asignado_a || ''" :disabled="guardandoCampo" @change="cambiarAsignado($event.target.value)">
                <option value="">Sin asignar</option>
                <option v-for="s in staffLista" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
              </select>
            </div>

            <label class="check-inline">
              <input type="checkbox" :checked="ticket.es_base_conocimiento" :disabled="guardandoCampo" @change="toggleFlag('es_base_conocimiento')">
              Es base de conocimiento
            </label>
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
        <div class="card col-8 tk-conversacion">
          <div class="datos-title"><i class="ti ti-message-circle"></i> Conversación</div>
          <p class="tk-descripcion">{{ ticket.descripcion }}</p>

          <div v-if="comentarios.length" class="timeline tk-timeline">
            <div v-for="c in comentarios" :key="c.id" class="timeline-item">
              <span class="timeline-dot" :class="c.interno ? 'timeline-dot--closed' : 'timeline-dot--active'"></span>
              <div class="timeline-content">
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

          <div v-if="ticket.estado !== 'cerrado'" class="tk-nuevo-comentario">
            <textarea
              v-model="nuevoComentario"
              rows="3"
              placeholder="Escribe una nota interna o una respuesta para el empleado..."
              :disabled="enviandoComentario"
            ></textarea>
            <div class="tk-comentario-acciones">
              <label class="check-inline">
                <input v-model="comentarioInterno" type="checkbox" :disabled="enviandoComentario">
                Nota interna (no visible para el empleado)
              </label>
              <button class="btn btn-primary" type="button" :disabled="enviandoComentario || !nuevoComentario.trim()" @click="enviarComentario">
                {{ enviandoComentario ? 'Enviando...' : 'Comentar' }}
              </button>
            </div>
          </div>
          <p v-else class="tk-nota">Ticket cerrado — reábrelo para seguir comentando.</p>
        </div>
      </div>
    </main>

    <!-- Modal: hoja de vida -->
    <div v-if="mostrarHoja" class="modal-bg" @click.self="mostrarHoja = false">
      <div class="modal modal-hoja" role="dialog">
        <div class="modal-title">
          <span><i class="ti ti-history" aria-hidden="true"></i> Hoja de vida — {{ ticket?.codigo }}</span>
          <button class="icon-btn" type="button" @click="mostrarHoja = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <div v-if="cargandoHoja" class="no-results">Cargando...</div>
          <ul v-else class="hoja-lista">
            <li v-for="ev in eventos" :key="ev.id">
              <div class="hoja-info">
                <span class="hoja-detalle">{{ EVENTO_LABELS[ev.evento] || ev.evento }}{{ ev.detalle ? ` — ${ev.detalle}` : '' }}</span>
                <span class="hoja-meta">{{ formatFechaHora(ev.created_at) }}{{ ev.user_email ? ` · ${ev.user_email}` : '' }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

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

.tk-datos, .tk-conversacion {
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

.tk-solicitante, .tk-sin-vincular {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

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

.tk-comentario-acciones {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.tk-comentario-acciones .check-inline { margin-top: 0; }

.modal-hoja { width: 560px; max-width: 95vw; }
.modal-title { display: flex; align-items: center; justify-content: space-between; }
.modal-body { padding: 16px 24px 24px; }

.hoja-lista { list-style: none; margin: 0; padding: 0; }
.hoja-lista li { display: flex; padding: 9px 0; border-bottom: 1px solid var(--color-border); }
.hoja-lista li:last-child { border-bottom: none; }
.hoja-info { display: flex; flex-direction: column; }
.hoja-detalle { font-size: var(--fs-base); color: var(--color-text-primary); }
.hoja-meta { font-size: var(--fs-sm); color: var(--color-text-secondary); }
</style>
