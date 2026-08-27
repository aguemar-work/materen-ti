<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import { estadoInfo, OPCIONES_PRIORIDAD as PRIORIDADES, OPCIONES_TIPO as TIPOS, NIVELES_ATENCION, ESTADOS_EN_CURSO, ESTADOS_TERMINALES } from '../../core/dominio-tickets.js';
import { badgeInfo } from '../../core/badges.js';
import { useTicketDetalleLogica } from '../../composables/useTicketDetalleLogica.js';
import { useVolverContextual } from '../../composables/useVolverContextual.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import ProblemaForm from '../problemas/ProblemaForm.vue';

const route = useRoute();
const router = useRouter();
const { volver } = useVolverContextual();

// Toda la lógica de negocio (store, transiciones de estado, historial,
// comentarios) vive en el composable — compartida con TicketDetallePanel.vue
// (split-view). Lo único que queda acá es lo específico de ser una página
// completa: leer route.params.id y redirigir a /tickets si el ticket no
// existe (el panel embebido no navega, ver comentario de cargar() abajo).
const {
  auth,
  ticket, comentarios, satisfaccion, equiposEmpleado, articulosRelacionados, problemaVinculado, cargando, staffActivo, staffPorId,
  guardandoCampo,
  nuevoComentario, comentarioInterno, enviandoComentario, comentarioTextarea, autoCrecerTextarea,
  autorDe, historialEsencial,
  atencionForm, iniciando, tipoAmbiguoSinClasificar,
  cargar: cargarTicket, confirmarIniciar,
  mostrarRechazar, motivoRechazo, rechazando, abrirRechazar, confirmarRechazar,
  resolviendo, guardarComoKb, mostrarConfirmarResolver, dialogoResolver, cancelarResolver, confirmarResolver,
  mostrarReabrir, motivoReabrir, reabriendo, abrirReabrir, confirmarReabrir,
  cambiarNivelAtencion, cambiarPrioridad,
  mostrarConfirmarDesasignar, dialogoDesasignar, desasignando, cambiarAsignado, cancelarDesasignar, confirmarDesasignar,
  cambiarTipo,
  mostrarProblemaForm, onProblemaFormCerrado,
  copiarMensajeSatisfaccion,
  enviarComentario,
} = useTicketDetalleLogica();

async function cargar() {
  const noEncontrado = await cargarTicket(route.params.id);
  if (noEncontrado) router.replace('/tickets');
}

onMounted(cargar);
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
            <span class="badge" :class="badgeInfo('ticket_sin_vincular').clase"><i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}</span>
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
              <div class="form-group">
                <label for="in-tipo">Tipo</label>
                <select id="in-tipo" v-model="atencionForm.tipo" :disabled="iniciando">
                  <option value="" disabled>Seleccionar</option>
                  <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
                </select>
                <p v-if="tipoAmbiguoSinClasificar" class="tk-nota">Esta subcategoría no tiene un tipo por defecto (puede ser incidente o solicitud según el caso) — elígelo manualmente antes de iniciar.</p>
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
                <select id="tk-asignado" :value="ticket.asignado_a || ''" :disabled="guardandoCampo" @change="cambiarAsignado($event.target.value, $event)">
                  <option value="">Sin asignar</option>
                  <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="tk-tipo">Tipo</label>
                <select id="tk-tipo" :value="ticket.tipo" :disabled="guardandoCampo" @change="cambiarTipo($event.target.value)">
                  <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
                </select>
              </div>
              <label class="check-inline">
                <input v-model="guardarComoKb" type="checkbox" :disabled="resolviendo">
                ¿Guardar esta solución en la Base de Conocimiento?
              </label>
              <button class="btn btn-primary tk-btn-resolver" type="button" @click="mostrarConfirmarResolver = true">
                <i class="ti ti-circle-check" aria-hidden="true"></i> Marcar como resuelto
              </button>
            </template>

            <!-- terminal: solo lectura + Reabrir (jefe) -->
            <template v-if="ESTADOS_TERMINALES.includes(ticket.estado) && !mostrarReabrir">
              <p class="tk-detalle">Prioridad: {{ PRIORIDADES.find((p) => p.valor === ticket.prioridad)?.label || ticket.prioridad }}</p>
              <p class="tk-detalle">Nivel de atención: <TextoVacio :valor="NIVELES_ATENCION.find((n) => n.valor === ticket.nivel_atencion)?.label" placeholder="Sin definir" /></p>
              <p class="tk-detalle">Asignado a: <TextoVacio :valor="staffPorId[ticket.asignado_a]" placeholder="Sin asignar" /></p>
              <button v-if="auth.esJefe" class="btn tk-btn-reabrir" type="button" :disabled="reabriendo" @click="abrirReabrir">
                <i :class="reabriendo ? 'ti ti-loader-2 spinner-icon' : 'ti ti-refresh'" aria-hidden="true"></i> {{ reabriendo ? 'Reabriendo...' : 'Reabrir ticket' }}
              </button>
              <p v-else class="tk-nota">Solo el jefe puede reabrir este ticket.</p>
            </template>

            <!-- Formulario: Reabrir (motivo obligatorio, queda como nota interna) -->
            <div v-if="mostrarReabrir" class="tk-form-inline">
              <div class="form-group">
                <label for="re-motivo-reabrir">Motivo para reabrir *</label>
                <textarea id="re-motivo-reabrir" v-model="motivoReabrir" rows="3" placeholder="Queda como nota interna, no visible para el empleado" :disabled="reabriendo"></textarea>
              </div>
              <div class="modal-actions">
                <button class="btn" type="button" :disabled="reabriendo" @click="mostrarReabrir = false">Cancelar</button>
                <button class="btn btn-primary" type="button" :disabled="reabriendo" @click="confirmarReabrir">
                  <i v-if="reabriendo" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
                  {{ reabriendo ? 'Reabriendo...' : 'Confirmar reabrir' }}
                </button>
              </div>
            </div>

            <div class="tk-problema-vinculado">
              <RouterLink v-if="problemaVinculado" :to="`/problemas/${problemaVinculado.id}`" class="badge badge--danger badge-inline">
                <i class="ti ti-alert-hexagon" aria-hidden="true"></i> Problema abierto: {{ problemaVinculado.titulo }}
              </RouterLink>
              <button v-else class="btn" type="button" @click="mostrarProblemaForm = true">
                <i class="ti ti-alert-hexagon" aria-hidden="true"></i> Marcar como problema
              </button>
            </div>
          </div>

          <div v-if="satisfaccion" class="tk-seccion">
            <div class="datos-title"><i class="ti ti-mood-smile"></i> Satisfacción</div>
            <p v-if="satisfaccion.fecha_envio" class="tk-detalle">
              Nivel {{ satisfaccion.nivel }}/5 — {{ formatFecha(satisfaccion.fecha_envio) }}
            </p>
            <p v-if="satisfaccion.comentario" class="tk-nota">"{{ satisfaccion.comentario }}"</p>
            <template v-if="!satisfaccion.fecha_envio">
              <p class="tk-nota">Encuesta enviada, sin respuesta todavía.</p>
              <button class="btn tk-btn-satisfaccion" type="button" @click="copiarMensajeSatisfaccion">
                <i class="ti ti-brand-whatsapp" aria-hidden="true"></i> Copiar mensaje de WhatsApp
              </button>
            </template>
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
              <button class="btn" type="button" :disabled="enviandoComentario || !nuevoComentario.trim()" @click="enviarComentario">
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

    <ProblemaForm
      v-if="mostrarProblemaForm"
      :ticket-disparador="{ id: ticket.id, codigo: ticket.codigo, titulo: ticket.titulo, descripcion: ticket.descripcion }"
      @cerrar="onProblemaFormCerrado"
    />

    <!-- Confirmación no destructiva (ConfirmDialog compartido): desasignar
         un ticket en curso, para no dejarlo sin responsable por error -->
    <ConfirmDialog
      v-if="mostrarConfirmarDesasignar"
      ref="dialogoDesasignar"
      titulo="Quitar asignación"
      mensaje="¿Quitar la asignación de este ticket en curso? Quedará sin responsable hasta que alguien lo tome."
      confirmar-label="Quitar asignación"
      :cargando="desasignando"
      @cancel="cancelarDesasignar"
      @confirm="confirmarDesasignar"
    />

    <!-- Confirmación no destructiva: marcar resuelto cierra el ticket de
         inmediato, sin paso intermedio para revisar antes de cerrar -->
    <ConfirmDialog
      v-if="mostrarConfirmarResolver"
      ref="dialogoResolver"
      titulo="Marcar como resuelto"
      mensaje="Esto cierra el ticket de inmediato — no hay un paso intermedio para revisar antes de cerrar. ¿Confirmas que el problema quedó resuelto?"
      confirmar-label="Marcar como resuelto"
      :cargando="resolviendo"
      @cancel="cancelarResolver"
      @confirm="confirmarResolver"
    />
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

.tk-btn-satisfaccion {
  width: 100%;
  justify-content: center;
  margin-top: 8px;
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

.tk-problema-vinculado { margin-top: 10px; }

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
