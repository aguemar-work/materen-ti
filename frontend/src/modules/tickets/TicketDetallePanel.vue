<script setup>
import { ref, computed, onMounted } from 'vue';
import { estadoInfo, ESTADOS_EN_CURSO, ESTADOS_TERMINALES } from '../../core/dominio-tickets.js';
import { estadoProblemaInfo } from '../../core/dominio-problemas.js';
import { badgeInfo } from '../../core/badges.js';
import { tonoAvatar, inicialesDe } from '../../core/avatar.js';
import { useTicketDetalleLogica } from '../../composables/useTicketDetalleLogica.js';
import { rolDeTag } from '../../core/tagRol.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import ProblemaForm from '../problemas/ProblemaForm.vue';
import TicketCamposGestion from './TicketCamposGestion.vue';
import TicketComposer from './TicketComposer.vue';
import TicketTimelineUnificado from './TicketTimelineUnificado.vue';

// Panel de detalle para el split-view de Tickets — montado por
// TicketsView.vue (y por TicketPanelPreviewView.vue, preview aislado
// solo-DEV). Mismo composable que TicketDetalleView.vue (misma lógica de
// negocio, mismo store) y mismos componentes de contenido
// (TicketCamposGestion/TicketComposer/TicketTimelineUnificado); lo que
// cambia es el contenedor: split de 2 columnas (300px/1fr) dentro de una
// sola card en vez del grid de 12 columnas (col-3/col-9) de la página
// completa, y sin PageHeader (acá un botón "cerrar panel" simple, porque
// no hay a dónde "volver" — el panel no navega, vive al lado de la lista).
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
  copiarMensajeSatisfaccion, copiarMensajeSolicitarInfo,
  enviarComentario,
} = useTicketDetalleLogica();

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
  <aside class="ticket-detalle-panel card">
    <div class="tdp-header">
      <div v-if="ticket" class="tdp-header-info">
        <div class="tdp-titulo-row">
          <h2 class="tdp-titulo"><span class="tk-codigo">{{ ticket.codigo }}</span> {{ ticket.titulo }}</h2>
          <BadgeEstado tipo="ticket" :valor="ticket.estado" />
        </div>
        <span class="header-sub">{{ ticket.categoria_nombre }}{{ ticket.subcategoria_nombre ? ` · ${ticket.subcategoria_nombre}` : '' }}</span>
      </div>
      <span v-else class="tdp-titulo">Detalle del ticket</span>

      <!-- CTAs compactos — el botón principal cambia según el estado
           (misma lógica de siempre, solo reubicada); Rechazar no estaba en
           el mockup pero sigue siendo la otra mitad real de "abierto"
           (Iniciar/Rechazar son un par, no una sola acción) — lo agregué
           chico al lado de Iniciar atención en vez de sacarlo del panel. -->
      <!-- Orden esta ronda: KB → Problema → acción principal AL FINAL
           (antes: principal primero, KB/Problema después). Rechazar no
           es "la principal" de "abierto" (esa es Iniciar atención) —
           sigue yendo justo antes de su par, no suelto en otro lugar. -->
      <div v-if="ticket" class="tdp-head-cta">
        <!-- Toggle de estado (no un CRUD action puro): "activo" se expresa
             reusando severity/variant de AppButton (solid+primary = ON,
             outline+secondary = OFF) — no inventamos una prop `pressed`
             nueva para un solo botón. aria-pressed sigue viajando (fallthrough
             de AppButton) porque no es visual, es semántica real. -->
        <AppButton
          v-if="ESTADOS_EN_CURSO.includes(ticket.estado)"
          size="sm"
          :variant="guardarComoKb ? 'solid' : 'outline'"
          :severity="guardarComoKb ? 'primary' : 'secondary'"
          icon="ti ti-books"
          label="KB"
          :disabled="resolviendo"
          :aria-pressed="guardarComoKb"
          title="Guardar esta solución en la Base de Conocimiento al resolver"
          @click="guardarComoKb = !guardarComoKb"
        />

        <RouterLink v-if="problemaVinculado" :to="`/problemas/${problemaVinculado.id}`" class="btn tdp-btn-cta tdp-btn-problema-activo">
          <i class="ti ti-alert-hexagon" aria-hidden="true"></i> Problema
        </RouterLink>
        <AppButton v-else size="sm" severity="secondary" icon="ti ti-alert-hexagon" label="Problema" @click="mostrarProblemaForm = true" />

        <template v-if="ticket.estado === 'abierto'">
          <AppButton size="sm" severity="danger" icon="ti ti-x" label="Rechazar" :disabled="iniciando" @click="abrirRechazar" />
          <AppButton
            size="sm"
            severity="primary"
            icon="ti ti-player-play"
            :label="iniciando ? 'Iniciando...' : 'Iniciar atención'"
            :loading="iniciando"
            @click="confirmarIniciar"
          />
        </template>

        <AppButton
          v-if="ESTADOS_EN_CURSO.includes(ticket.estado)"
          size="sm"
          severity="primary"
          icon="ti ti-circle-check"
          label="Marcar resuelto"
          @click="mostrarConfirmarResolver = true"
        />

        <AppButton
          v-if="ESTADOS_TERMINALES.includes(ticket.estado) && auth.esJefe"
          size="sm"
          severity="primary"
          icon="ti ti-refresh"
          :label="reabriendo ? 'Reabriendo...' : 'Reabrir'"
          :loading="reabriendo"
          @click="abrirReabrir"
        />
      </div>

      <button
        v-if="mostrarContexto"
        class="icon-btn tdp-btn-contexto"
        type="button"
        :class="{ 'tdp-btn-contexto--activo': contextoAbierto }"
        :aria-pressed="contextoAbierto"
        :title="contextoAbierto ? 'Ocultar contexto' : 'Mostrar contexto'"
        :aria-label="contextoAbierto ? 'Ocultar columna de contexto' : 'Mostrar columna de contexto'"
        @click="contextoAbierto = !contextoAbierto"
      >
        <i class="ti ti-layout-sidebar-right" aria-hidden="true"></i>
      </button>

      <button class="icon-btn tdp-btn-cerrar" type="button" title="Cerrar panel" aria-label="Cerrar panel" @click="emit('cerrar')">
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>

    <div class="tdp-body">
      <div v-if="cargando" class="no-results">Cargando ticket...</div>
      <div v-else-if="!ticket" class="no-results">Ticket no encontrado.</div>

      <template v-else>
      <!-- Banda de solicitante — horizontal, ancho completo. Equipos/
           Artículos relacionados y Problema vinculado ya NO viven acá como
           chip de conteo (Plan Maestro v2, Frente 2, 2026-09-04): tienen su
           propia columna de contexto más abajo, con lista expandida.
           Enlazado a/Captura adjunta siguen acá como chips cortos — son
           datos del TICKET, no del empleado, y no cambiaron de lugar. -->
      <div class="tdp-seccion tdp-solicitante-banda">
        <div v-if="ticket.vinculado && ticket.empleado_nombre" class="tdp-solicitante-linea">
          <span class="avatar sm" :class="tonoAvatar(ticket.empleado_nombre)" :title="ticket.empleado_nombre">{{ inicialesDe(ticket.empleado_nombre) }}</span>
          <div class="tdp-solicitante-datos">
            <RouterLink class="tk-nombre empleado-link" :to="`/empleados/${ticket.empleado_id}`">{{ ticket.empleado_nombre }}</RouterLink>
            <span class="tk-detalle">DNI {{ ticket.empleado_dni }}{{ ticket.empleado_correo ? ` · ${ticket.empleado_correo}` : '' }}</span>
          </div>
        </div>
        <div v-else class="tdp-solicitante-linea">
          <span class="avatar sm avatar--neutro" title="Sin vincular"><i class="ti ti-user" aria-hidden="true"></i></span>
          <div class="tdp-solicitante-datos">
            <span class="tag" :class="`tag--${rolDeTag(badgeInfo('ticket_sin_vincular').clase)}`"><i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}</span>
            <span v-if="ticket.contacto_ingresado" class="tk-detalle">Contacto ingresado: {{ ticket.contacto_ingresado }}</span>
          </div>
        </div>

        <div class="tdp-solicitante-chips">
          <span v-if="ticket.equipo_desc" class="tag tag--neutral"><i class="ti ti-devices" aria-hidden="true"></i> {{ ticket.equipo_desc }}</span>
          <span v-if="ticket.cuenta_desc" class="tag tag--neutral"><i class="ti ti-key" aria-hidden="true"></i> {{ ticket.cuenta_desc }}</span>
          <span v-if="ticket.licencia_desc" class="tag tag--neutral"><i class="ti ti-license" aria-hidden="true"></i> {{ ticket.licencia_desc }}</span>
          <a v-if="ticket.adjunto_url" class="tdp-adjunto-link" :href="ticket.adjunto_url" target="_blank" rel="noopener noreferrer">
            <span class="tag tag--neutral"><i class="ti ti-camera" aria-hidden="true"></i> Captura adjunta</span>
          </a>
        </div>
      </div>

      <!-- Satisfacción se había sacado del panel por completo en una ronda
           anterior (rompía el ritmo visual: una fila entera de forma
           despareja, mezclada con la banda de solicitante). El botón de
           copiar mensaje (copiarMensajeSatisfaccion) vuelve ahora en su
           propio lugar — la sección "Acciones rápidas" de la columna de
           contexto (Plan Maestro v2, Frente 2), no en la banda. -->

      <div class="tdp-grid tk-seccion" :class="{ 'tdp-grid--con-contexto': mostrarContexto && contextoAbierto }">
        <!-- ═══ Columna izquierda (angosta) ═══ -->
        <div class="tdp-col-izq">

          <!-- Datos del ticket — ya no depende de !mostrarRechazar/
               !mostrarReabrir: esos formularios ahora son ConfirmDialog
               (overlay), no reemplazan este contenido en el lugar como
               antes, así que no hace falta ocultarlo mientras están
               abiertos. -->
          <div class="tdp-seccion">
            <div class="datos-title"><i class="ti ti-list-details"></i> Datos del ticket</div>

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
          </div>
        </div>

        <!-- ═══ Columna derecha (ancha) ═══ -->
        <div class="tdp-col-der">
          <!-- Conversación — a toda la altura disponible esta ronda (antes
               crecía con su contenido, ver .tdp-conversacion/.tdp-col-der
               en el estilo para el mecanismo). El scroll ya no es
               .tdp-body (que ahora NO scrollea más — es el layout el que
               queda acotado a la altura del panel); el scroll vive en
               .tdp-conversacion-scroll, adentro de esta card. El composer
               sigue fijo abajo, pero por flujo normal (último hijo,
               flex-shrink:0), no por position:sticky — con la card ahora
               de alto acotado, sticky ya no hacía falta. Probado con
               overflow real (13 mensajes) en un repro aislado antes de
               aplicarlo acá. -->
          <div class="tdp-seccion tdp-conversacion">
            <div class="datos-title"><i class="ti ti-activity"></i> Actividad y conversación</div>

            <!-- Orden del encabezado de cada burbuja acá: Nombre → Fecha →
                 badge (fecha-inline); la página completa la deja en una
                 línea aparte debajo. -->
            <div class="tdp-conversacion-scroll">
              <TicketTimelineUnificado
                :descripcion="ticket.descripcion"
                :filas="timelineUnificado"
                :autor-de="autorDe"
                fecha-inline
              />
            </div>

            <TicketComposer
              v-if="!ESTADOS_TERMINALES.includes(ticket.estado)"
              v-model:mensaje="nuevoComentario"
              v-model:interno="comentarioInterno"
              :enviando="enviandoComentario"
              class="tdp-composer"
              @enviar="enviarComentario"
            />
            <p v-else class="tk-nota">
              Ticket {{ estadoInfo(ticket.estado).label.toLowerCase() }} — {{ auth.esJefe ? 'reábrelo para seguir comentando.' : 'solo el jefe puede reabrirlo para seguir comentando.' }}
            </p>
          </div>
        </div>

        <!-- ═══ Columna de contexto (Plan Maestro v2, Frente 2) ═══
             Equipos/KB/Problema — mismos refs del composable, ya
             reactivos al ticket cargado, sin ninguna consulta nueva. Cada
             sección es su propio `v-if`: nunca se muestra una sección
             vacía. -->
        <div v-if="mostrarContexto && contextoAbierto" class="tdp-col-contexto">
          <div v-if="equiposEmpleado.length" class="tdp-seccion">
            <div class="datos-title"><i class="ti ti-devices"></i> Equipos del solicitante</div>
            <ul class="tdp-contexto-lista">
              <li v-for="eq in equiposEmpleado" :key="eq.asignacion_id">
                <span class="mono">{{ eq.codigo }}</span>
                <span class="tdp-contexto-sub">{{ [eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' ') }}</span>
              </li>
            </ul>
          </div>

          <div v-if="articulosRelacionados.length" class="tdp-seccion">
            <div class="datos-title"><i class="ti ti-books"></i> Artículos de KB relacionados</div>
            <ul class="tdp-contexto-lista">
              <li v-for="a in articulosRelacionados" :key="a.id">
                <RouterLink class="tdp-contexto-enlace" :to="`/base-conocimiento/${a.id}`">{{ a.titulo }}</RouterLink>
              </li>
            </ul>
          </div>

          <!-- Sin problemaVinculado no se ofrece nada acá: el botón
               "Problema" del header sigue siendo la única vía para
               vincular uno — no se duplica esa acción en dos lugares. -->
          <div v-if="problemaVinculado" class="tdp-seccion">
            <div class="datos-title"><i class="ti ti-alert-hexagon"></i> Problema vinculado</div>
            <RouterLink :to="`/problemas/${problemaVinculado.id}`" class="tdp-adjunto-link">
              <span class="tag" :class="`tag--${rolDeTag(estadoProblemaInfo(problemaVinculado.estado).clase)}`">
                <i class="ti ti-alert-hexagon" aria-hidden="true"></i> {{ problemaVinculado.titulo }}
              </span>
            </RouterLink>
          </div>

          <!-- Macros de WhatsApp (Frente 2, Paso 3): clipboard + toast, sin
               abrir wa.me — el staff decide por qué canal reenviarlo,
               mismo criterio que ya regía copiarMensajeSatisfaccion. -->
          <div class="tdp-seccion">
            <div class="datos-title"><i class="ti ti-brand-whatsapp"></i> Acciones rápidas</div>
            <div class="tdp-contexto-acciones">
              <AppButton
                v-if="!ESTADOS_TERMINALES.includes(ticket.estado)"
                size="sm"
                severity="secondary"
                icon="ti ti-copy"
                label="Pedir más información"
                @click="copiarMensajeSolicitarInfo"
              />
              <AppButton
                v-if="satisfaccion && !satisfaccion.fecha_envio"
                size="sm"
                severity="secondary"
                icon="ti ti-copy"
                label="Resuelto + encuesta"
                @click="copiarMensajeSatisfaccion"
              />
            </div>
          </div>
        </div>
      </div>
      </template>
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
      @cancel="cancelarDesasignar"
      @confirm="confirmarDesasignar"
    />

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

    <!-- Rechazar/Reabrir — antes formulario inline junto a su botón,
         ahora ConfirmDialog (ver nota en el script). motivo-min:1 a
         propósito, no el default de 10: la validación original solo
         exigía "no vacío" (motivo.trim()), no un mínimo de caracteres —
         no quise endurecerla de más solo por cambiar de componente. -->
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
      @cancel="mostrarRechazar = false"
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
      @cancel="mostrarReabrir = false"
      @confirm="onConfirmarReabrir"
    />
  </aside>
</template>


