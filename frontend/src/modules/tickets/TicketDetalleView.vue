<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatFecha, formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { estadoInfo, ESTADOS_EN_CURSO, ESTADOS_TERMINALES, OPCIONES_TIPO } from '../../core/dominio-tickets.js';
import { useTicketDetalleLogica } from '../../composables/useTicketDetalleLogica.js';
import { useVolverContextual } from '../../composables/useVolverContextual.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import ProblemaForm from '../problemas/ProblemaForm.vue';
import TicketCamposGestion from './TicketCamposGestion.vue';
import TicketComposer from './TicketComposer.vue';
import TicketTimelineUnificado from './TicketTimelineUnificado.vue';
import TicketSolicitante from './TicketSolicitante.vue';
import TicketContexto from './TicketContexto.vue';
import PrioridadTicket from './PrioridadTicket.vue';
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

// ── Presentación (rediseño 2026-09-23) ──
const esTerminal = computed(() => !!ticket.value && ESTADOS_TERMINALES.includes(ticket.value.estado));
const enCurso = computed(() => !!ticket.value && ESTADOS_EN_CURSO.includes(ticket.value.estado));
const tipoLabel = computed(() => OPCIONES_TIPO.find((t) => t.valor === ticket.value?.tipo)?.label || '');
const comentariosTotal = computed(() => timelineUnificado.value.filter((f) => f.tipo === 'comentario').length);
</script>

<template>
  <div class="mx-auto w-full max-w-7xl px-4 pb-10 pt-5 sm:px-6">
    <button
      type="button"
      class="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      @click="volver('/tickets')"
    >
      <i class="ti ti-arrow-left" aria-hidden="true"></i>
      Tickets
    </button>

    <p v-if="cargando" class="py-16 text-center text-sm text-gray-500" role="status">Cargando ticket...</p>

    <p v-else-if="!ticket" class="py-16 text-center text-sm text-gray-500">No se encontró el ticket.</p>

    <template v-else>
      <!-- ══ Encabezado: qué se pidió, en qué estado está, quién lo tiene y
           la acción que corresponde ahora (una sola sólida por estado). -->
      <header class="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start">
        <div class="min-w-0 flex-1">
          <p class="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-gray-500">
            <span class="font-medium tabular-nums text-gray-600">{{ ticket.codigo }}</span>
            <template v-if="ticket.categoria_nombre">
              <span aria-hidden="true">·</span>
              <span>{{ ticket.categoria_nombre }}{{ ticket.subcategoria_nombre ? ` › ${ticket.subcategoria_nombre}` : '' }}</span>
            </template>
          </p>
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 class="text-2xl font-semibold tracking-tight text-gray-900">{{ ticket.titulo }}</h1>
            <BadgeEstado tipo="ticket" :valor="ticket.estado" />
          </div>
          <ul class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-gray-500">
            <li><PrioridadTicket :valor="ticket.prioridad" /></li>
            <li class="inline-flex items-center gap-1.5">
              <i class="ti ti-user" aria-hidden="true"></i>
              <span v-if="ticket.vinculado && ticket.empleado_nombre" class="text-gray-700">{{ ticket.empleado_nombre }}</span>
              <span v-else class="text-red-700">Solicitante sin vincular</span>
            </li>
            <li class="inline-flex items-center gap-1.5">
              <i class="ti ti-user-check" aria-hidden="true"></i>
              <span v-if="ticket.asignado_a" class="text-gray-700">{{ staffPorId[ticket.asignado_a] || 'Staff' }}</span>
              <span v-else :class="esTerminal ? 'text-gray-400' : 'text-amber-700'">Sin asignar</span>
            </li>
            <li v-if="ticket.created_at" class="inline-flex items-center gap-1.5 tabular-nums" :title="formatFechaHora(ticket.created_at)">
              <i class="ti ti-clock" aria-hidden="true"></i>Creado {{ formatAntiguedad(ticket.created_at) }}
            </li>
            <li v-if="tipoLabel" class="inline-flex items-center gap-1.5">
              <i class="ti ti-tag" aria-hidden="true"></i>{{ tipoLabel }}<template v-if="ticket.nivel_atencion"> · {{ ticket.nivel_atencion }}</template>
            </li>
            <li v-if="problemaVinculado">
              <RouterLink
                :to="`/problemas/${problemaVinculado.id}`"
                class="inline-flex items-center gap-1.5 rounded text-red-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <i class="ti ti-alert-hexagon" aria-hidden="true"></i>Problema abierto: {{ problemaVinculado.titulo }}
              </RouterLink>
            </li>
          </ul>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <AppButton
            v-if="!problemaVinculado"
            variant="outline"
            severity="secondary"
            icon="ti ti-alert-hexagon"
            label="Marcar como problema"
            @click="mostrarProblemaForm = true"
          />

          <template v-if="ticket.estado === 'abierto' && !mostrarRechazar">
            <AppButton variant="outline" severity="danger" icon="ti ti-x" label="Rechazar" :disabled="iniciando" @click="abrirRechazar" />
            <AppButton
              icon="ti ti-player-play"
              :label="iniciando ? 'Iniciando...' : 'Iniciar atención'"
              :loading="iniciando"
              @click="confirmarIniciar"
            />
          </template>

          <AppButton
            v-if="enCurso"
            icon="ti ti-circle-check"
            label="Marcar como resuelto"
            @click="mostrarConfirmarResolver = true"
          />

          <template v-if="esTerminal && !mostrarReabrir">
            <AppButton
              v-if="auth.esJefe"
              variant="outline"
              severity="secondary"
              icon="ti ti-refresh"
              :label="reabriendo ? 'Reabriendo...' : 'Reabrir ticket'"
              :loading="reabriendo"
              @click="abrirReabrir"
            />
            <p v-else class="text-sm text-gray-500">Solo el jefe puede reabrir este ticket.</p>
          </template>
        </div>
      </header>

      <!-- ══ Formularios inline (rechazar / reabrir): aparecen donde se
           decidió la acción, antes de la conversación. -->
      <section
        v-if="mostrarRechazar"
        class="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-[inset_2px_0_0_var(--color-red-500)]"
        aria-labelledby="rechazo-titulo"
      >
        <h2 id="rechazo-titulo" class="text-sm font-semibold text-gray-900">Rechazar ticket</h2>
        <p class="mt-0.5 text-xs text-gray-500">El empleado verá este motivo en su seguimiento.</p>
        <div class="campo mt-3" :class="{ 'campo--inerte': rechazando }">
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
              placeholder="Explique por qué no se atenderá el pedido"
              :disabled="rechazando"
            ></textarea>
          </div>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <AppButton variant="text" severity="secondary" label="Cancelar" :disabled="rechazando" @click="mostrarRechazar = false" />
          <AppButton
            severity="danger"
            :label="rechazando ? 'Rechazando...' : 'Confirmar rechazo'"
            :loading="rechazando"
            @click="confirmarRechazar"
          />
        </div>
      </section>

      <section
        v-if="mostrarReabrir"
        class="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-[inset_2px_0_0_var(--color-primary-500)]"
        aria-labelledby="reabrir-titulo"
      >
        <h2 id="reabrir-titulo" class="text-sm font-semibold text-gray-900">Reabrir ticket</h2>
        <p class="mt-0.5 text-xs text-gray-500">El motivo queda como nota interna, no visible para el empleado.</p>
        <div class="campo mt-3" :class="{ 'campo--inerte': reabriendo }">
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
              placeholder="Qué volvió a fallar o qué quedó pendiente"
              :disabled="reabriendo"
            ></textarea>
          </div>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <AppButton variant="text" severity="secondary" label="Cancelar" :disabled="reabriendo" @click="mostrarReabrir = false" />
          <AppButton
            :label="reabriendo ? 'Reabriendo...' : 'Confirmar reabrir'"
            :loading="reabriendo"
            @click="confirmarReabrir"
          />
        </div>
      </section>

      <!-- ══ Cuerpo: conversación (principal) + gestión y contexto (lateral).
           Mismo feed y mismo composer que el panel del split-view. -->
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <AppSeccion titulo="Actividad y conversación" :conteo="comentariosTotal || null" sin-padding>
          <div class="px-5 py-5">
            <TicketTimelineUnificado :descripcion="ticket.descripcion" :filas="timelineUnificado" :autor-de="autorDe" />
          </div>
          <div class="border-t border-gray-100 px-5 py-4">
            <TicketComposer
              v-if="!esTerminal"
              v-model:mensaje="nuevoComentario"
              v-model:interno="comentarioInterno"
              :enviando="enviandoComentario"
              @enviar="enviarComentario"
            />
            <p v-else class="flex items-center gap-2 text-sm text-gray-500">
              <i class="ti ti-lock" aria-hidden="true"></i>
              Ticket {{ estadoInfo(ticket.estado).label.toLowerCase() }} — {{ auth.esJefe ? 'reábralo para seguir comentando.' : 'solo el jefe puede reabrirlo para seguir comentando.' }}
            </p>
          </div>
        </AppSeccion>

        <!-- En abierto, lo primero es triar (prioridad, responsable): en móvil
             la gestión sube antes de la conversación. -->
        <aside class="space-y-6 lg:sticky lg:top-6" :class="{ 'order-first lg:order-none': ticket.estado === 'abierto' }">
          <!-- Campos según el estado (abierto / en curso / terminal) —
               compartidos con TicketDetallePanel.vue. Se ocultan mientras un
               formulario inline está abierto: rechazar solo ocurre en
               abierto y reabrir solo en terminal. -->
          <AppSeccion
            titulo="Gestión"
            :descripcion="ticket.estado === 'abierto' ? 'Se aplican al iniciar la atención.' : enCurso ? 'Cada cambio se guarda al momento.' : ''"
          >
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
            <p v-else class="text-sm text-gray-500">Complete el formulario de arriba para continuar.</p>

            <label v-if="enCurso" class="mt-4 flex cursor-pointer items-start gap-2 border-t border-gray-100 pt-3 text-sm text-gray-700">
              <input v-model="guardarComoKb" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary-500" :disabled="resolviendo">
              Al resolver, guardar esta solución en la Base de Conocimiento
            </label>
          </AppSeccion>

          <AppSeccion titulo="Solicitante">
            <TicketSolicitante :ticket="ticket" miniatura />
          </AppSeccion>

          <AppSeccion v-if="equiposEmpleado.length || ticket.categoria_id" titulo="Contexto">
            <TicketContexto
              :equipos="equiposEmpleado"
              :articulos="articulosRelacionados"
              :categoria-id="ticket.categoria_id"
              mostrar-vacios
            />
          </AppSeccion>

          <AppSeccion v-if="satisfaccion" titulo="Satisfacción">
            <template v-if="satisfaccion.fecha_envio">
              <p class="flex items-baseline gap-2">
                <span class="text-2xl font-semibold tabular-nums text-gray-900">{{ satisfaccion.nivel }}/5</span>
                <span class="text-xs text-gray-500">{{ formatFecha(satisfaccion.fecha_envio) }}</span>
              </p>
              <p v-if="satisfaccion.comentario" class="mt-2 text-sm text-gray-700">“{{ satisfaccion.comentario }}”</p>
            </template>
            <template v-else>
              <p class="text-sm text-gray-500">Encuesta enviada, sin respuesta todavía.</p>
              <AppButton
                class="mt-3"
                size="sm"
                variant="outline"
                severity="secondary"
                icon="ti ti-brand-whatsapp"
                label="Copiar mensaje de WhatsApp"
                @click="copiarMensajeSatisfaccion"
              />
            </template>
          </AppSeccion>
        </aside>
      </div>
    </template>

    <ProblemaForm
      v-if="mostrarProblemaForm"
      :ticket-disparador="{ id: ticket.id, codigo: ticket.codigo, titulo: ticket.titulo, descripcion: ticket.descripcion }"
      @cerrar="onProblemaFormCerrado"
    />

    <!-- Confirmación no destructiva: desasignar un ticket en curso, para no
         dejarlo sin responsable por error -->
    <ConfirmDialog
      v-if="mostrarConfirmarDesasignar"
      ref="dialogoDesasignar"
      titulo="Quitar asignación"
      mensaje="¿Quitar la asignación de este ticket en curso? Quedará sin responsable hasta que alguien lo tome."
      confirmar-label="Quitar asignación"
      :cargando="desasignando"
      @cerrado="cancelarDesasignar"
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
      @cerrado="cancelarResolver"
      @confirm="confirmarResolver"
    />
  </div>
</template>
