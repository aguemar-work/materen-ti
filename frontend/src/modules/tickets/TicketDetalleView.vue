<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatFecha } from '../../core/formatters.js';
import { estadoInfo, ESTADOS_EN_CURSO, ESTADOS_TERMINALES } from '../../core/dominio-tickets.js';
import { badgeInfo } from '../../core/badges.js';
import { useTicketDetalleLogica } from '../../composables/useTicketDetalleLogica.js';
import { useVolverContextual } from '../../composables/useVolverContextual.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import ProblemaForm from '../problemas/ProblemaForm.vue';
import TicketCamposGestion from './TicketCamposGestion.vue';
import TicketComposer from './TicketComposer.vue';
import TicketTimelineUnificado from './TicketTimelineUnificado.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';

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
  ticket, satisfaccion, equiposEmpleado, articulosRelacionados, problemaVinculado, cargando, staffActivo, staffPorId,
  guardandoCampo,
  nuevoComentario, comentarioInterno, enviandoComentario,
  autorDe, timelineUnificado,
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
        <button class="icon-btn btn-volver" type="button" title="Volver" aria-label="Volver" @click="volver('/tickets')">
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
            <CarbonTag :variante="badgeInfo('ticket_sin_vincular').clase"><i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}</CarbonTag>
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

            <!-- Campos según el estado (abierto / en curso / terminal) —
                 compartidos con TicketDetallePanel.vue. Se ocultan mientras
                 un formulario inline los reemplaza en el lugar: rechazar
                 solo ocurre en abierto y reabrir solo en terminal, así que
                 basta con esconderlos en cualquiera de los dos casos. -->
            <TicketCamposGestion
              v-if="!mostrarRechazar && !mostrarReabrir"
              v-model:atencion-prioridad="atencionForm.prioridad"
              v-model:atencion-nivel="atencionForm.nivelAtencion"
              v-model:atencion-asignado="atencionForm.asignadoA"
              v-model:atencion-tipo="atencionForm.tipo"
              :ticket="ticket"
              :staff-activo="staffActivo"
              :staff-por-id="staffPorId"
              :usuario-id="auth.user?.id || ''"
              :iniciando="iniciando"
              :guardando-campo="guardandoCampo"
              :tipo-ambiguo-sin-clasificar="tipoAmbiguoSinClasificar"
              @cambiar-prioridad="cambiarPrioridad"
              @cambiar-nivel="cambiarNivelAtencion"
              @cambiar-asignado="cambiarAsignado"
              @cambiar-tipo="cambiarTipo"
            />

            <!-- abierto: Rechazar / Iniciar atención -->
            <div v-if="ticket.estado === 'abierto' && !mostrarRechazar" class="tk-acciones-estado">
              <CarbonButton variante="danger" ancho icono="ti-x" :deshabilitado="iniciando" @click="abrirRechazar">Rechazar</CarbonButton>
              <CarbonButton variante="primary" ancho icono="ti-player-play" :cargando="iniciando" @click="confirmarIniciar">
                {{ iniciando ? 'Iniciando...' : 'Iniciar atención' }}
              </CarbonButton>
            </div>

            <!-- Formulario: Rechazar -->
            <div v-if="mostrarRechazar" class="tk-form-inline">
              <CarbonCampo
                v-model="motivoRechazo"
                etiqueta="Motivo del rechazo"
                tipo="textarea"
                :filas="3"
                requerido
                placeholder="El empleado verá este motivo en su seguimiento"
                :deshabilitado="rechazando"
              />
              <div class="modal-actions">
                <CarbonButton variante="secondary" :deshabilitado="rechazando" @click="mostrarRechazar = false">Cancelar</CarbonButton>
                <CarbonButton variante="danger" :cargando="rechazando" @click="confirmarRechazar">
                  {{ rechazando ? 'Rechazando...' : 'Confirmar rechazo' }}
                </CarbonButton>
              </div>
            </div>

            <!-- en curso: guardar en KB + Marcar como resuelto -->
            <template v-if="ESTADOS_EN_CURSO.includes(ticket.estado)">
              <label class="check-inline">
                <input v-model="guardarComoKb" type="checkbox" :disabled="resolviendo">
                ¿Guardar esta solución en la Base de Conocimiento?
              </label>
              <CarbonButton variante="primary" ancho icono="ti-circle-check" class="tk-btn-resolver" @click="mostrarConfirmarResolver = true">Marcar como resuelto</CarbonButton>
            </template>

            <!-- terminal: Reabrir (solo jefe) -->
            <template v-if="ESTADOS_TERMINALES.includes(ticket.estado) && !mostrarReabrir">
              <CarbonButton v-if="auth.esJefe" variante="secondary" ancho icono="ti-refresh" class="tk-btn-reabrir" :cargando="reabriendo" @click="abrirReabrir">{{ reabriendo ? 'Reabriendo...' : 'Reabrir ticket' }}</CarbonButton>
              <p v-else class="tk-nota">Solo el jefe puede reabrir este ticket.</p>
            </template>

            <!-- Formulario: Reabrir (motivo obligatorio, queda como nota interna) -->
            <div v-if="mostrarReabrir" class="tk-form-inline">
              <CarbonCampo
                v-model="motivoReabrir"
                etiqueta="Motivo para reabrir"
                tipo="textarea"
                :filas="3"
                requerido
                placeholder="Queda como nota interna, no visible para el empleado"
                :deshabilitado="reabriendo"
              />
              <div class="modal-actions">
                <CarbonButton variante="secondary" :deshabilitado="reabriendo" @click="mostrarReabrir = false">Cancelar</CarbonButton>
                <CarbonButton variante="primary" :cargando="reabriendo" @click="confirmarReabrir">
                  {{ reabriendo ? 'Reabriendo...' : 'Confirmar reabrir' }}
                </CarbonButton>
              </div>
            </div>

            <div class="tk-problema-vinculado">
              <RouterLink v-if="problemaVinculado" :to="`/problemas/${problemaVinculado.id}`" class="tk-problema-link">
                <CarbonTag variante="danger" class="badge-inline">
                  <i class="ti ti-alert-hexagon" aria-hidden="true"></i> Problema abierto: {{ problemaVinculado.titulo }}
                </CarbonTag>
              </RouterLink>
              <CarbonButton v-else variante="secondary" icono="ti-alert-hexagon" @click="mostrarProblemaForm = true">Marcar como problema</CarbonButton>
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
              <CarbonButton variante="secondary" ancho icono="ti-brand-whatsapp" class="tk-btn-satisfaccion" @click="copiarMensajeSatisfaccion">Copiar mensaje de WhatsApp</CarbonButton>
            </template>
          </div>
        </div>

        <!-- Actividad y conversación: feed único de hitos + comentarios
             (revisión "Filas con foco", 2026-09-04) — reemplaza a las dos
             cards separadas (Conversación col-6 + Historial col-3) que
             tenía esta página. Mismo componente y mismos datos que ya usa
             TicketDetallePanel.vue (Triage), consistencia entre las dos
             superficies del ticket en vez de mantener una segunda
             variante con filtro por tipo. -->
        <div class="card col-9 tk-actividad">
          <div class="datos-title"><i class="ti ti-activity"></i> Actividad y conversación</div>

          <TicketTimelineUnificado :descripcion="ticket.descripcion" :filas="timelineUnificado" :autor-de="autorDe" />

          <TicketComposer
            v-if="!ESTADOS_TERMINALES.includes(ticket.estado)"
            v-model:mensaje="nuevoComentario"
            v-model:interno="comentarioInterno"
            :enviando="enviandoComentario"
            @enviar="enviarComentario"
          />
          <p v-else class="tk-nota">
            Ticket {{ estadoInfo(ticket.estado).label.toLowerCase() }} — {{ auth.esJefe ? 'reábrelo para seguir comentando.' : 'solo el jefe puede reabrirlo para seguir comentando.' }}
          </p>
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
      mensaje="Esto cierra el ticket de inmediato — no hay un paso intermedio para revisar antes de cerrar. ¿Confirma que el problema quedó resuelto?"
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
  font-size: var(--fs-heading-02);
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tk-codigo {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.header-sub {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.tk-datos, .tk-actividad {
  padding: 16px 20px 20px;
}

.tk-estado-badge {
  margin-left: auto;
}

.tk-acciones-estado {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.tk-form-inline {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tk-btn-resolver {
  margin-top: 6px;
}

.tk-btn-reabrir {
  margin-top: 6px;
}

.tk-btn-satisfaccion {
  margin-top: 8px;
}

.tk-solicitante, .tk-sin-vincular {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tk-kb-relacionado {
  display: block;
  font-size: var(--fs-label-01);
  color: var(--color-accent-text);
  text-decoration: none;
  margin-bottom: 6px;
}
.tk-kb-relacionado:hover { text-decoration: underline; }

.tk-nombre { font-size: var(--fs-body-01); font-weight: 600; color: var(--color-text-primary); }
.tk-adjunto {
  max-width: 100%;
  border-radius: var(--radius-base);
  border: 1px solid var(--color-border);
}

.tk-problema-vinculado { margin-top: 10px; }

.tk-problema-link {
  display: inline-block;
  text-decoration: none;
}

.check-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-body-01);
  color: var(--color-text-primary);
  cursor: pointer;
  margin-top: 10px;
}

/* Actividad y conversación (descripción, feed unificado, composer) vive en
   TicketTimelineUnificado.vue / TicketComposer.vue, con sus estilos
   adentro — compartidos con TicketDetallePanel.vue. */
</style>
