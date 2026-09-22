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
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import ProblemaForm from '../problemas/ProblemaForm.vue';
import TicketCamposGestion from './TicketCamposGestion.vue';
import TicketComposer from './TicketComposer.vue';
import TicketTimelineUnificado from './TicketTimelineUnificado.vue';
import { rolDeTag } from '../../core/tagRol.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

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

const campoMotivoRechazo = useCampoAccesible();
const campoMotivoReabrir = useCampoAccesible();
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
            <span class="tag" :class="`tag--${rolDeTag(badgeInfo('ticket_sin_vincular').clase)}`"><i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}</span>
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
              <AppButton severity="danger" icon="ti ti-x" label="Rechazar" block :disabled="iniciando" @click="abrirRechazar" />
              <AppButton
                severity="primary"
                icon="ti ti-player-play"
                :label="iniciando ? 'Iniciando...' : 'Iniciar atención'"
                :loading="iniciando"
                block
                @click="confirmarIniciar"
              />
            </div>

            <!-- Formulario: Rechazar -->
            <div v-if="mostrarRechazar" class="tk-form-inline">
              <div class="campo" :class="{ 'campo--inerte': rechazando }">
                <label class="campo__etiqueta" :for="campoMotivoRechazo.id">
                  Motivo del rechazo<span aria-hidden="true"> *</span>
                </label>
                <div class="campo__caja">
                  <textarea
                    :id="campoMotivoRechazo.id"
                    v-model="motivoRechazo"
                    class="campo__control campo__control--area"
                    :rows="3"
                    required
                    placeholder="El empleado verá este motivo en su seguimiento"
                    :disabled="rechazando"
                  ></textarea>
                </div>
              </div>
              <div class="modal-actions">
                <AppButton variant="text" severity="secondary" label="Cancelar" :disabled="rechazando" @click="mostrarRechazar = false" />
                <AppButton
                  severity="danger"
                  :label="rechazando ? 'Rechazando...' : 'Confirmar rechazo'"
                  :loading="rechazando"
                  @click="confirmarRechazar"
                />
              </div>
            </div>

            <!-- en curso: guardar en KB + Marcar como resuelto -->
            <template v-if="ESTADOS_EN_CURSO.includes(ticket.estado)">
              <label class="check-inline">
                <input v-model="guardarComoKb" type="checkbox" :disabled="resolviendo">
                ¿Guardar esta solución en la Base de Conocimiento?
              </label>
              <AppButton
                severity="primary"
                icon="ti ti-circle-check"
                label="Marcar como resuelto"
                block
                class="tk-btn-resolver"
                @click="mostrarConfirmarResolver = true"
              />
            </template>

            <!-- terminal: Reabrir (solo jefe) -->
            <template v-if="ESTADOS_TERMINALES.includes(ticket.estado) && !mostrarReabrir">
              <AppButton
                v-if="auth.esJefe"
                severity="secondary"
                icon="ti ti-refresh"
                :label="reabriendo ? 'Reabriendo...' : 'Reabrir ticket'"
                :loading="reabriendo"
                block
                class="tk-btn-reabrir"
                @click="abrirReabrir"
              />
              <p v-else class="tk-nota">Solo el jefe puede reabrir este ticket.</p>
            </template>

            <!-- Formulario: Reabrir (motivo obligatorio, queda como nota interna) -->
            <div v-if="mostrarReabrir" class="tk-form-inline">
              <div class="campo" :class="{ 'campo--inerte': reabriendo }">
                <label class="campo__etiqueta" :for="campoMotivoReabrir.id">
                  Motivo para reabrir<span aria-hidden="true"> *</span>
                </label>
                <div class="campo__caja">
                  <textarea
                    :id="campoMotivoReabrir.id"
                    v-model="motivoReabrir"
                    class="campo__control campo__control--area"
                    :rows="3"
                    required
                    placeholder="Queda como nota interna, no visible para el empleado"
                    :disabled="reabriendo"
                  ></textarea>
                </div>
              </div>
              <div class="modal-actions">
                <AppButton variant="text" severity="secondary" label="Cancelar" :disabled="reabriendo" @click="mostrarReabrir = false" />
                <AppButton
                  severity="primary"
                  :label="reabriendo ? 'Reabriendo...' : 'Confirmar reabrir'"
                  :loading="reabriendo"
                  @click="confirmarReabrir"
                />
              </div>
            </div>

            <div class="tk-problema-vinculado">
              <RouterLink v-if="problemaVinculado" :to="`/problemas/${problemaVinculado.id}`" class="tk-problema-link">
                <span class="tag badge-inline" :class="`tag--${rolDeTag('danger')}`">
                  <i class="ti ti-alert-hexagon" aria-hidden="true"></i> Problema abierto: {{ problemaVinculado.titulo }}
                </span>
              </RouterLink>
              <AppButton v-else severity="secondary" icon="ti ti-alert-hexagon" label="Marcar como problema" @click="mostrarProblemaForm = true" />
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
              <AppButton
                severity="secondary"
                icon="ti ti-brand-whatsapp"
                label="Copiar mensaje de WhatsApp"
                block
                class="tk-btn-satisfaccion"
                @click="copiarMensajeSatisfaccion"
              />
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


