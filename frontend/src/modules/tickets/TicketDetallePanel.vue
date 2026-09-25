<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { estadoInfo, ESTADOS_EN_CURSO, ESTADOS_TERMINALES } from '../../core/dominio-tickets.js';
import { useTicketDetalleLogica } from '../../composables/useTicketDetalleLogica.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import ProblemaForm from '../problemas/ProblemaForm.vue';
import TicketCamposGestion from './TicketCamposGestion.vue';
import TicketComposer from './TicketComposer.vue';
import TicketTimelineUnificado from './TicketTimelineUnificado.vue';
import TicketSolicitante from './TicketSolicitante.vue';
import TicketContexto from './TicketContexto.vue';
import TicketResumen from './TicketResumen.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';

// Panel de detalle para el split-view de Tickets — montado por
// TicketsView.vue (y por TicketPanelPreviewView.vue, preview aislado
// solo-DEV). Mismo composable que TicketDetalleView.vue (misma lógica de
// negocio, mismo store) y mismos componentes de contenido
// (TicketCamposGestion/TicketComposer/TicketTimelineUnificado); lo que
// cambia es el contenedor. Rediseño 2026-09-23: la conversación es la
// columna principal (lo que el técnico lee y responde todo el día) y los
// datos del ticket + contexto del solicitante van en una columna lateral de
// 288px; bajo 1280px las dos se apilan en un solo scroll. Sin encabezado
// de página: un botón "cerrar panel", porque el panel no navega.
//
// Historial + Conversación → Actividad y conversación (2026-09-04): las
// dos superficies del ticket (este panel y TicketDetalleView.vue) usan el
// mismo TicketTimelineUnificado.vue — un solo feed cronológico en vez de
// Historial/Conversación separados.
const props = defineProps({
  ticketId: { type: String, required: true },
});
const emit = defineEmits(['cerrar']);

const {
  auth,
  ticket, satisfaccion, equiposEmpleado, articulosRelacionados, problemaVinculado, cargando, staffActivo, staffPorId,
  guardandoCampo,
  nuevoComentario, comentarioInterno, enviandoComentario,
  autorDe, timelineUnificado, resolucion,
  atencionForm, iniciando, tipoAmbiguoSinClasificar,
  cargar: cargarTicket, confirmarIniciar,
  mostrarRechazar, motivoRechazo, rechazando, abrirRechazar, confirmarRechazar,
  resolviendo, guardarComoKb, mostrarConfirmarResolver, dialogoResolver, cancelarResolver, confirmarResolver,
  mostrarReabrir, motivoReabrir, reabriendo, abrirReabrir, confirmarReabrir,
  cambiarNivelAtencion, cambiarPrioridad,
  mostrarConfirmarDesasignar, dialogoDesasignar, desasignando, cambiarAsignado, cancelarDesasignar, confirmarDesasignar,
  cambiarTipo,
  mostrarProblemaForm, onProblemaFormCerrado,
  copiarMensajeSatisfaccion, copiarMensajeSolicitarInfo,
  enviarComentario,
} = useTicketDetalleLogica();

// Mismo feed que la página completa (ver TicketDetalleView.vue): actividad
// y conversación juntas, con "Mensajes" para leer solo lo escrito. Arranca
// abajo (lo último que pasó) y vuelve abajo con cada mensaje nuevo.
const verFeed = ref('todo');
const filasFeed = computed(() => (verFeed.value === 'mensajes'
  ? timelineUnificado.value.filter((f) => f.tipo === 'comentario')
  : timelineUnificado.value));
const OPCIONES_FEED = computed(() => [
  { valor: 'todo', label: 'Todo', titulo: 'Mensajes y cambios del ticket (asignación, estado, prioridad…) en orden' },
  { valor: 'mensajes', label: 'Mensajes', titulo: 'Solo lo que escribieron el equipo y el solicitante', conteo: timelineUnificado.value.filter((f) => f.tipo === 'comentario').length },
]);
const refFeed = ref(null);
watch(() => [cargando.value, filasFeed.value.length], async () => {
  await nextTick();
  if (refFeed.value) refFeed.value.scrollTop = refFeed.value.scrollHeight;
});

// ── Columna de contexto (Plan Maestro v2, Frente 2, 2026-09-04) ──
// Equipos/KB/Problema vinculado tenían solo un conteo en la banda de
// solicitante ("empecemos simple", ronda anterior) — ahora ganan su propia
// columna con lista expandida. Sin columna si no hay ningún dato de
// contexto: no tiene sentido reservarle espacio a una columna vacía.
const mostrarContexto = computed(() =>
  equiposEmpleado.value.length > 0 || articulosRelacionados.value.length > 0 || !!problemaVinculado.value,
);
// Colapsable, no persistido: es para esta sesión de trabajo, no una
// preferencia a recordar entre visitas (a diferencia de `vista`, que sí se
// guarda en localStorage vía useVistaModulo).
const contextoAbierto = ref(true);

// A diferencia de la página completa: si el ticket no existe, el panel NO
// navega a ningún lado (no tiene ruta propia) — se queda mostrando su
// propio estado vacío (ver template, `v-else-if="!ticket"`). El valor de
// retorno de cargar() (true = no encontrado) se ignora a propósito acá.
onMounted(() => cargarTicket(props.ticketId));

// Rechazar/Reabrir pasan de formulario inline a ConfirmDialog (misma
// pregunta que hiciste esta ronda: con el botón ahora en el head
// compacto, expandir un textarea ahí adentro rompía el criterio de
// "banda angosta"; ConfirmDialog ya existe en este archivo para
// Desasignar/Resolver y ya soporta requiere-motivo — documentado en el
// propio componente como "formaliza el patrón de rechazar ticket").
// ConfirmDialog maneja su propio textarea y emite el string final en
// @confirm; el composable expone motivoRechazo/motivoReabrir como refs
// separados (pensados para el v-model del textarea inline de antes) —
// estos dos wrappers solo trasladan ese string al ref antes de llamar a
// la función del composable. Ninguna de las dos (confirmarRechazar/
// confirmarReabrir) cambió.
function onConfirmarRechazo(motivo) {
  motivoRechazo.value = motivo;
  confirmarRechazar();
}
function onConfirmarReabrir(motivo) {
  motivoReabrir.value = motivo;
  confirmarReabrir();
}
</script>

<template>
  <aside class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white" aria-label="Detalle del ticket">
    <!-- ══ Cabecera: qué ticket es + qué se puede hacer ahora ═══════ -->
    <header class="shrink-0 border-b border-gray-100 px-5 pb-4 pt-4">
      <div class="flex items-start gap-3">
        <div v-if="ticket" class="min-w-0 flex-1">
          <p class="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
            <RouterLink
              class="shrink-0 font-medium tabular-nums text-gray-600 hover:text-primary-700 hover:underline"
              :to="`/tickets/${ticket.id}`"
              title="Abrir en página completa"
            >{{ ticket.codigo }}</RouterLink>
            <template v-if="ticket.categoria_nombre">
              <span aria-hidden="true">·</span>
              <span class="truncate">{{ ticket.categoria_nombre }}{{ ticket.subcategoria_nombre ? ` › ${ticket.subcategoria_nombre}` : '' }}</span>
            </template>
          </p>
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 class="text-lg font-semibold leading-snug tracking-tight text-gray-900">{{ ticket.titulo }}</h2>
            <BadgeEstado tipo="ticket" :valor="ticket.estado" />
          </div>
          <TicketResumen
            class="mt-2"
            :ticket="ticket"
            :resolucion="resolucion"
            :satisfaccion="satisfaccion"
            @copiar-encuesta="copiarMensajeSatisfaccion"
          />
        </div>
        <h2 v-else class="min-w-0 flex-1 text-lg font-semibold text-gray-900">Detalle del ticket</h2>

        <div class="-mr-1 flex shrink-0 items-center gap-0.5">
          <button
            v-if="mostrarContexto"
            class="icon-btn"
            :class="{ 'bg-gray-100 text-gray-900': contextoAbierto }"
            type="button"
            :aria-pressed="contextoAbierto"
            :title="contextoAbierto ? 'Ocultar contexto' : 'Mostrar contexto'"
            :aria-label="contextoAbierto ? 'Ocultar columna de contexto' : 'Mostrar columna de contexto'"
            @click="contextoAbierto = !contextoAbierto"
          >
            <i class="ti ti-layout-sidebar-right" aria-hidden="true"></i>
          </button>
          <button class="icon-btn" type="button" title="Cerrar panel" aria-label="Cerrar panel" @click="emit('cerrar')">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <!-- Acciones: secundarias a la izquierda, la del estado actual (única
           sólida) al final. Iniciar/Rechazar son el par de "abierto". -->
      <div v-if="ticket" class="mt-3 flex flex-wrap items-center gap-2">
        <RouterLink
          v-if="problemaVinculado"
          :to="`/problemas/${problemaVinculado.id}`"
          class="inline-flex h-8 items-center gap-2 rounded-md bg-red-50 px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          :title="`Problema vinculado: ${problemaVinculado.titulo}`"
        >
          <i class="ti ti-alert-hexagon" aria-hidden="true"></i> Problema
        </RouterLink>
        <AppButton v-else size="sm" variant="outline" severity="secondary" icon="ti ti-alert-hexagon" label="Problema" title="Agrupar este ticket en un problema: registrar la causa raíz cuando el mismo incidente se repite" @click="mostrarProblemaForm = true" />

        <!-- Toggle "guardar en KB al resolver": el estado activo se expresa
             con la severidad de AppButton (outline primario = ON, outline
             neutro = OFF) — sin una prop `pressed` nueva, y sin sumar un
             segundo sólido junto a "Marcar resuelto". aria-pressed viaja por
             fallthrough: es semántica real, no visual. -->
        <AppButton
          v-if="ESTADOS_EN_CURSO.includes(ticket.estado)"
          size="sm"
          variant="outline"
          :severity="guardarComoKb ? 'primary' : 'secondary'"
          :icon="guardarComoKb ? 'ti ti-check' : 'ti ti-books'"
          label="KB"
          :class="guardarComoKb ? 'bg-primary-50' : ''"
          :disabled="resolviendo"
          :aria-pressed="guardarComoKb"
          title="Guardar esta solución en la Base de Conocimiento al resolver"
          @click="guardarComoKb = !guardarComoKb"
        />

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <template v-if="ticket.estado === 'abierto'">
            <AppButton size="sm" variant="outline" severity="danger" icon="ti ti-x" label="Rechazar" title="Descartar el ticket sin atenderlo. El empleado verá el motivo en su seguimiento" :disabled="iniciando" @click="abrirRechazar" />
            <AppButton
              size="sm"
              icon="ti ti-player-play"
              :label="iniciando ? 'Iniciando...' : 'Iniciar atención'"
              title="Tomar el ticket: pasa a En progreso con la prioridad, el nivel y el responsable elegidos"
              :loading="iniciando"
              @click="confirmarIniciar"
            />
          </template>

          <AppButton
            v-if="ESTADOS_EN_CURSO.includes(ticket.estado)"
            size="sm"
            icon="ti ti-circle-check"
            label="Marcar resuelto"
            title="Cerrar el ticket como resuelto y enviar la encuesta de satisfacción al empleado"
            @click="mostrarConfirmarResolver = true"
          />

          <AppButton
            v-if="ESTADOS_TERMINALES.includes(ticket.estado) && auth.esJefe"
            size="sm"
            variant="outline"
            severity="secondary"
            icon="ti ti-refresh"
            :label="reabriendo ? 'Reabriendo...' : 'Reabrir'"
            title="Volver a abrir el ticket (solo jefe): el motivo queda como nota interna"
            :loading="reabriendo"
            @click="abrirReabrir"
          />
        </div>
      </div>
    </header>

    <p v-if="cargando" class="py-16 text-center text-sm text-gray-500" role="status">Cargando ticket...</p>
    <p v-else-if="!ticket" class="py-16 text-center text-sm text-gray-500">Ticket no encontrado.</p>

    <!-- ══ Cuerpo: conversación (principal) + datos y contexto (lateral).
         Bajo xl se apilan en un solo scroll; desde xl cada columna scrollea
         por su cuenta y el composer queda fijo al pie de la conversación. -->
    <div v-else class="min-h-0 flex-1 overflow-y-auto xl:flex xl:overflow-hidden">
      <section class="flex min-w-0 flex-col xl:min-h-0 xl:flex-1" aria-label="Actividad y conversación">
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-5 py-2">
          <span class="text-xs font-medium text-gray-500">Actividad y conversación</span>
          <AppSegmentado v-model="verFeed" :opciones="OPCIONES_FEED" label="Qué mostrar en la conversación" />
        </div>
        <div ref="refFeed" class="px-5 py-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          <TicketTimelineUnificado
            :descripcion="ticket.descripcion"
            :filas="filasFeed"
            :autor-de="autorDe"
            fecha-inline
          />
        </div>

        <div class="shrink-0 border-t border-gray-100 px-5 py-3">
          <TicketComposer
            v-if="!ESTADOS_TERMINALES.includes(ticket.estado)"
            v-model:mensaje="nuevoComentario"
            v-model:interno="comentarioInterno"
            :enviando="enviandoComentario"
            @enviar="enviarComentario"
          />
          <p v-else class="flex items-center gap-2 py-1 text-sm text-gray-500">
            <i class="ti ti-lock" aria-hidden="true"></i>
            Ticket {{ estadoInfo(ticket.estado).label.toLowerCase() }} — {{ auth.esJefe ? 'reábralo para seguir comentando.' : 'solo el jefe puede reabrirlo para seguir comentando.' }}
          </p>
        </div>
      </section>

      <div class="space-y-5 border-t border-gray-100 bg-gray-50/60 px-5 py-4 xl:w-72 xl:shrink-0 xl:overflow-y-auto xl:border-l xl:border-t-0">
        <section aria-labelledby="pnl-solicitante">
          <h3 id="pnl-solicitante" class="mb-2 text-sm font-semibold text-gray-900">Solicitante</h3>
          <TicketSolicitante :ticket="ticket" />
        </section>

        <!-- Campos de gestión: no se ocultan mientras Rechazar/Reabrir están
             abiertos — acá esos formularios son ConfirmDialog (overlay). -->
        <section aria-labelledby="pnl-gestion">
          <h3 id="pnl-gestion" class="mb-2 text-sm font-semibold text-gray-900">Datos del ticket</h3>
          <TicketCamposGestion
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
            id-prefijo="pnl-"
            label-asignado="Técnico responsable"
            @cambiar-prioridad="cambiarPrioridad"
            @cambiar-nivel="cambiarNivelAtencion"
            @cambiar-asignado="cambiarAsignado"
            @cambiar-tipo="cambiarTipo"
          />
        </section>

        <section v-if="mostrarContexto && contextoAbierto" aria-labelledby="pnl-contexto">
          <h3 id="pnl-contexto" class="mb-2 text-sm font-semibold text-gray-900">Contexto</h3>
          <TicketContexto :equipos="equiposEmpleado" :articulos="articulosRelacionados" :problema="problemaVinculado" />
        </section>

        <!-- Macros de WhatsApp: clipboard + toast, sin abrir wa.me — el staff
             decide por qué canal reenviarlo. -->
        <section
          v-if="!ESTADOS_TERMINALES.includes(ticket.estado)"
          aria-labelledby="pnl-rapidas"
        >
          <h3 id="pnl-rapidas" class="mb-1 text-sm font-semibold text-gray-900">Mensajes rápidos</h3>
          <div class="-ml-3 flex flex-col items-start">
            <AppButton
              v-if="!ESTADOS_TERMINALES.includes(ticket.estado)"
              size="sm"
              variant="text"
              severity="secondary"
              icon="ti ti-brand-whatsapp"
              label="Pedir más información"
              title="Copia un mensaje de WhatsApp para el solicitante"
              @click="copiarMensajeSolicitarInfo"
            />
          </div>
        </section>
      </div>
    </div>

    <ProblemaForm
      v-if="mostrarProblemaForm"
      :ticket-disparador="{ id: ticket.id, codigo: ticket.codigo, titulo: ticket.titulo, descripcion: ticket.descripcion }"
      @cerrar="onProblemaFormCerrado"
    />

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

    <!-- Rechazar/Reabrir como ConfirmDialog con motivo (en el panel no hay
         lugar para un formulario inline). motivo-min:1 a propósito: la
         validación original solo exigía "no vacío". -->
    <ConfirmDialog
      v-if="mostrarRechazar"
      titulo="Rechazar ticket"
      mensaje="El motivo queda visible para el empleado en su seguimiento."
      requiere-motivo
      :motivo-min="1"
      motivo-label="Motivo del rechazo"
      confirmar-label="Confirmar rechazo"
      destructivo
      :cargando="rechazando"
      @cerrado="mostrarRechazar = false"
      @confirm="onConfirmarRechazo"
    />

    <ConfirmDialog
      v-if="mostrarReabrir"
      titulo="Reabrir ticket"
      mensaje="Queda como nota interna, no visible para el empleado."
      requiere-motivo
      :motivo-min="1"
      motivo-label="Motivo para reabrir"
      confirmar-label="Confirmar reabrir"
      :cargando="reabriendo"
      @cerrado="mostrarReabrir = false"
      @confirm="onConfirmarReabrir"
    />
  </aside>
</template>

