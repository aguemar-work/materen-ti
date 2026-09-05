<script setup>
import { ref, computed, onMounted } from 'vue';
import { estadoInfo, ESTADOS_EN_CURSO, ESTADOS_TERMINALES } from '../../core/dominio-tickets.js';
import { estadoProblemaInfo } from '../../core/dominio-problemas.js';
import { badgeInfo } from '../../core/badges.js';
import { tonoAvatar, inicialesDe } from '../../core/avatar.js';
import { useTicketDetalleLogica } from '../../composables/useTicketDetalleLogica.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
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
        <button
          v-if="ESTADOS_EN_CURSO.includes(ticket.estado)"
          class="btn tdp-btn-cta tdp-btn-kb"
          type="button"
          :class="{ 'tdp-btn-kb--activo': guardarComoKb }"
          :disabled="resolviendo"
          :aria-pressed="guardarComoKb"
          title="Guardar esta solución en la Base de Conocimiento al resolver"
          @click="guardarComoKb = !guardarComoKb"
        >
          <i class="ti ti-books" aria-hidden="true"></i> KB
        </button>

        <RouterLink v-if="problemaVinculado" :to="`/problemas/${problemaVinculado.id}`" class="btn tdp-btn-cta tdp-btn-problema-activo">
          <i class="ti ti-alert-hexagon" aria-hidden="true"></i> Problema
        </RouterLink>
        <button v-else class="btn tdp-btn-cta" type="button" @click="mostrarProblemaForm = true">
          <i class="ti ti-alert-hexagon" aria-hidden="true"></i> Problema
        </button>

        <template v-if="ticket.estado === 'abierto'">
          <button class="btn btn-danger tdp-btn-cta" type="button" :disabled="iniciando" @click="abrirRechazar">
            <i class="ti ti-x" aria-hidden="true"></i> Rechazar
          </button>
          <button class="btn btn-primary tdp-btn-cta" type="button" :disabled="iniciando" @click="confirmarIniciar">
            <i :class="iniciando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-player-play'" aria-hidden="true"></i>
            {{ iniciando ? 'Iniciando...' : 'Iniciar atención' }}
          </button>
        </template>

        <button
          v-if="ESTADOS_EN_CURSO.includes(ticket.estado)"
          class="btn btn-primary tdp-btn-cta"
          type="button"
          @click="mostrarConfirmarResolver = true"
        >
          <i class="ti ti-circle-check" aria-hidden="true"></i> Marcar resuelto
        </button>

        <button
          v-if="ESTADOS_TERMINALES.includes(ticket.estado) && auth.esJefe"
          class="btn btn-primary tdp-btn-cta"
          type="button"
          :disabled="reabriendo"
          @click="abrirReabrir"
        >
          <i :class="reabriendo ? 'ti ti-loader-2 spinner-icon' : 'ti ti-refresh'" aria-hidden="true"></i> {{ reabriendo ? 'Reabriendo...' : 'Reabrir' }}
        </button>
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
            <CarbonTag :variante="badgeInfo('ticket_sin_vincular').clase"><i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}</CarbonTag>
            <span v-if="ticket.contacto_ingresado" class="tk-detalle">Contacto ingresado: {{ ticket.contacto_ingresado }}</span>
          </div>
        </div>

        <div class="tdp-solicitante-chips">
          <CarbonTag v-if="ticket.equipo_desc" variante="neutral"><i class="ti ti-devices" aria-hidden="true"></i> {{ ticket.equipo_desc }}</CarbonTag>
          <CarbonTag v-if="ticket.cuenta_desc" variante="neutral"><i class="ti ti-key" aria-hidden="true"></i> {{ ticket.cuenta_desc }}</CarbonTag>
          <CarbonTag v-if="ticket.licencia_desc" variante="neutral"><i class="ti ti-license" aria-hidden="true"></i> {{ ticket.licencia_desc }}</CarbonTag>
          <a v-if="ticket.adjunto_url" class="tdp-adjunto-link" :href="ticket.adjunto_url" target="_blank" rel="noopener noreferrer">
            <CarbonTag variante="neutral"><i class="ti ti-camera" aria-hidden="true"></i> Captura adjunta</CarbonTag>
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
              <CarbonTag :variante="estadoProblemaInfo(problemaVinculado.estado).clase">
                <i class="ti ti-alert-hexagon" aria-hidden="true"></i> {{ problemaVinculado.titulo }}
              </CarbonTag>
            </RouterLink>
          </div>

          <!-- Macros de WhatsApp (Frente 2, Paso 3): clipboard + toast, sin
               abrir wa.me — el staff decide por qué canal reenviarlo,
               mismo criterio que ya regía copiarMensajeSatisfaccion. -->
          <div class="tdp-seccion">
            <div class="datos-title"><i class="ti ti-brand-whatsapp"></i> Acciones rápidas</div>
            <div class="tdp-contexto-acciones">
              <button
                v-if="!ESTADOS_TERMINALES.includes(ticket.estado)"
                class="btn tdp-btn-cta"
                type="button"
                @click="copiarMensajeSolicitarInfo"
              >
                <i class="ti ti-copy" aria-hidden="true"></i> Pedir más información
              </button>
              <button
                v-if="satisfaccion && !satisfaccion.fecha_envio"
                class="btn tdp-btn-cta"
                type="button"
                @click="copiarMensajeSatisfaccion"
              >
                <i class="ti ti-copy" aria-hidden="true"></i> Resuelto + encuesta
              </button>
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

<style scoped>
/* ── Contenedor del panel — UNA sola tarjeta, no una tarjeta llena de
   tarjetas (corrección directa de uso, ago 2026, novena pasada).
   Hasta la octava pasada, el panel era una isla gris (--color-bg de telón)
   con 5 tarjetas blancas propias flotando adentro (.tdp-header +
   .tdp-solicitante-banda + .tdp-datos-ticket + .tdp-historial +
   .tdp-conversacion, cada una con su propio `.card`): 1 isla exterior + 5
   islas interiores. Detectado en uso, no en auditoría — el mismo principio
   que ya rige `.tickets-shell` desde la octava pasada (una sola tarjeta
   flotante por región) se estaba violando ACÁ ADENTRO, un nivel más abajo.
   Ahora el panel completo ES la tarjeta (clase `.card` en el template, no
   redeclarada acá — mismo criterio de "reusar, no inventar en paralelo" que
   ya sigue el resto del sistema): fondo, borde y radio los da esa clase
   global, no una copia local. Las 5 secciones de adentro dejan de ser
   `.card`; se separan con las mismas herramientas MÍNIMAS que ya usa
   `TicketDetalleView.vue` (título en negrita + `.tk-seccion` para un
   divisor horizontal, ver más abajo) en vez de un borde+radio+fondo propio
   cada una. */
/* container-type/-name: el split interno de 2 columnas tiene que decidirse
   por el ancho del PANEL, no por el de la ventana (ver .tdp-grid más abajo).
   Es seguro: `inline-size` contiene solo el eje inline —`height:100%` sigue
   funcionando— y convierte al panel en bloque contenedor de descendientes
   posicionados, pero acá no hay ninguno: los cuatro diálogos de este archivo
   salen por <Teleport to="body"> de Modal.vue, no viven en este subárbol. */
.ticket-detalle-panel {
  container-type: inline-size;
  container-name: tdp;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* Head: vuelve a ser una franja cosida al borde superior de la tarjeta
   (novena pasada) — la versión "propia .card con margin" de la ronda
   anterior era justo una de las 5 tarjetas internas que se retiraron acá
   arriba. `border-bottom` en vez de fondo/borde propio: mismo lenguaje que
   `.card-toolbar` (main.css) usa en cualquier otro header dentro de una
   card del sistema, no uno inventado para este componente. */
.tdp-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.tdp-header-info { flex: 1; min-width: 160px; }

.tdp-titulo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.tdp-titulo {
  font-size: var(--fs-heading-02);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

/* CTAs del head — compactos a propósito (banda angosta, no la columna
   de página completa): botón principal según el estado (Iniciar
   atención/Marcar resuelto/Reabrir, misma lógica de siempre) + Rechazar
   (ver nota en el template) + KB + Problema. */
.tdp-head-cta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.tdp-btn-cta {
  height: 32px;
  padding: 0 10px;
  font-size: var(--fs-label-01);
  text-decoration: none;
}

/* KB como toggle (no checkbox) — mismo par tenue/acento que .chip-filtro
   activo en TicketsView.vue (fondo accent-subtle + texto accent cuando
   está presionado), para no inventar un segundo lenguaje de "activo". */
.tdp-btn-kb--activo {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
  border-color: transparent;
}

/* "Problema" con Problema vinculado es solo navegación, no una acción
   destructiva — no debe compartir el rojo con "Rechazar" (.btn-danger, el
   único rojo real de la vista). Mismo par tenue/acento no-destructivo que
   .tdp-btn-kb--activo, arriba (corrección de auditoría UX/UI, ago 2026). */
.tdp-btn-problema-activo {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
  border-color: transparent;
}

.tdp-btn-cerrar { flex-shrink: 0; }

/* Toggle de la columna de contexto (Frente 2) — mismo par tenue/acento de
   "activo" que .tdp-btn-kb--activo/.tdp-btn-problema-activo, no un tercer
   lenguaje visual para el mismo concepto de "presionado". */
.tdp-btn-contexto { flex-shrink: 0; }
.tdp-btn-contexto--activo {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
}

/* .tdp-body YA NO scrollea (cambio de esta ronda) — antes era el único
   scroll del panel (overflow-y:auto acá, todo lo de adentro crecía con
   su contenido). Ahora es un contenedor ACOTADO a la altura del panel: la
   banda de solicitante queda a su alto natural (flex-shrink:0, vía
   .tdp-seccion) y .tdp-grid se lleva el resto (flex:1) — así Conversación
   (.tdp-col-der) puede estirarse a esa altura y manejar su PROPIO scroll
   interno (.tdp-conversacion-scroll), en vez de que todo el panel
   scrollee como una sola unidad larga. */
.tdp-body {
  flex: 1;
  min-height: 0;
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* flex-shrink: 0 es el fix de una ronda anterior — sin esto, un
   contenedor flex-column reparte su altura disponible ENTRE sus hijos por
   partes iguales cuando no alcanza, encogiendo cada uno por debajo de su
   contenido natural en vez de dejar que el padre scrollee. Con
   .card{overflow:hidden} (global, main.css) ese encogimiento se ve como
   contenido cortado a mitad de camino. .tdp-conversacion es la EXCEPCIÓN
   deliberada esta ronda — ver su regla propia más abajo, necesita poder
   encogerse/estirarse porque ahora ocupa "lo que sobre". */
/* Sin padding propio (novena pasada): cuando cada sección era su propia
   `.card`, necesitaba repetir el padding de "borde de tarjeta a contenido".
   Ahora las 5 vivan en la MISMA superficie que ya trae ese padding una sola
   vez, en `.tdp-body` — repetirlo acá adentro habría dejado un padding
   doble en cada sección. */
.tdp-seccion { flex-shrink: 0; }

/* ── Grid de 2 columnas — izquierda angosta (Datos del ticket, sola desde
   la revisión "Filas con foco" que sacó Historial de acá), derecha ancha
   (Actividad y conversación: feed unificado de hitos + comentarios,
   TicketTimelineUnificado.vue, reemplaza a los antiguos Historial +
   Conversación separados — 2026-09-04).
   Cambio de una ronda anterior: flex:1 + grid-template-rows:1fr hacen que
   .tdp-grid ocupe TODO el alto restante de .tdp-body (antes crecía con
   su contenido, .tdp-body scrolleaba todo). align-items:start sigue
   siendo el default para la izquierda (se queda a su alto natural, Datos
   del ticket sola pesa aún menos que antes) — .tdp-col-der pisa ese
   default con align-self:stretch para ser la excepción, la única que
   necesita ocupar el 100% del alto de la fila. Ya no hace falta sticky
   en ningún lado: ninguno de los dos "seguía" al otro con un truco de
   posición, ahora cada columna simplemente ocupa lo que le corresponde
   dentro de un layout acotado. Verificado con alturas computadas reales
   en un repro aislado antes de aplicarlo acá (no solo a ojo), igual que
   el fix de flex-shrink de una ronda anterior.

   Clase `tk-seccion` agregada en el template (novena pasada): con
   Solicitante y el grid ya no siendo 2 tarjetas separadas, hacía falta ALGO
   que marque dónde termina una sección y empieza la otra — se reutiliza el
   mismo divisor horizontal que ya usa `TicketDetalleView.vue` para separar
   sub-bloques DENTRO de una card (`.tk-seccion`, definido más abajo), en vez
   de inventar una regla nueva para el mismo propósito. */
.tdp-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  grid-template-rows: 1fr;
  gap: 16px;
  align-items: start;
  flex: 1;
  min-height: 0;
}

/* 3ra columna de contexto (Frente 2) — mismo grid, una columna más, solo
   cuando hay dato de contexto Y el panel no se colapsó a mano. Sin esta
   clase, `.tdp-grid` queda exactamente como antes (300px 1fr), cero riesgo
   si el panel es angosto o no hay nada que mostrar. */
.tdp-grid--con-contexto {
  grid-template-columns: 300px 1fr 280px;
}

.tdp-col-izq, .tdp-col-der, .tdp-col-contexto {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* Fallback de seguridad: si Datos del ticket llegara a ser más alto que
   el espacio disponible, scrollea internamente en vez de desbordar — ya
   no hay un .tdp-body más grande por detrás que lo resuelva solo.

   border-right (novena pasada): con Datos del ticket y Conversación
   dejando de ser 2 tarjetas con borde propio cada una, el límite entre
   "la columna angosta" y "la ancha" desaparecía del todo — ninguna otra
   pista visual lo reemplazaba (el gap de 16px del grid, solo, se lee
   igual que cualquier otro espaciado interno). Un hairline decorativo
   (mismo nivel que `.tnav-separador`/`.card-toolbar`, sin umbral WCAG
   exigible) cierra ese hueco sin volver a envolver ninguna de las dos
   mitades en su propia caja. Se invierte a horizontal en el `@container`
   de abajo cuando las columnas se apilan. */
.tdp-col-izq {
  overflow-y: auto;
  border-right: 1px solid var(--color-border-subtle);
  padding-right: 16px;
}

.tdp-col-der {
  align-self: stretch;
  min-height: 0;
}

/* Mismo hairline que separa izq/der, ahora también entre Conversación y
   Contexto — no un borde propio distinto para la tercera columna. */
.tdp-col-contexto {
  overflow-y: auto;
  border-left: 1px solid var(--color-border-subtle);
  padding-left: 16px;
}

.tdp-contexto-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tdp-contexto-lista li {
  display: flex;
  flex-direction: column;
  font-size: var(--fs-body-01);
}

.tdp-contexto-sub {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.tdp-contexto-enlace {
  color: var(--color-primary);
  text-decoration: none;
  font-size: var(--fs-body-01);
}

.tdp-contexto-enlace:hover { text-decoration: underline; }

.tdp-contexto-acciones {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

/* Panel angosto: 2 columnas de 300px+resto no entran cómodas — cae a 1
   columna apilada, mismo criterio de rondas anteriores. Acá SÍ se vuelve al
   modelo anterior (todo con alto natural, .tdp-body scrollea como una
   unidad): con las 2 columnas apiladas en el mismo eje no hay "lo que
   sobra" para repartir, y acotar Conversación a un alto fijo solo la
   volvería innecesariamente chica.

   @container y no @media: el umbral tiene que medir el PANEL, no la
   ventana. Con el `@media (max-width: 1100px)` que había antes, este panel
   montado como tercera tarjeta de TicketsView.vue (grid de 200px + 25% +
   resto) mide ~650px en una pantalla de 1440px: el query nunca disparaba y
   el split se quedaba con 300px fijos + ~334px para Conversación, que es
   justo la columna que más ancho necesita. 800px es el piso real del
   split: 300 de la columna izquierda + 16 de gap + ~420 mínimos para el
   hilo de mensajes con avatar y composer + los 40 de padding lateral de
   .tdp-body.

   Tier nuevo (Frente 2): antes de llegar al colapso total de 800px, la
   columna de Contexto sola cede su lugar de "3ra columna" y pasa a ser una
   fila propia de ancho completo, DEBAJO de Datos del ticket/Conversación
   (que siguen siendo 2 columnas) — no un acordeón nuevo, el mismo grid con
   una fila más. Va ANTES del query de 800px a propósito: en un panel
   angosto (que dispara ambos a la vez) tiene que ganar el colapso total de
   abajo, y en CSS con la misma especificidad gana la regla que aparece
   último en el archivo. */
@container tdp (max-width: 1100px) {
  .tdp-grid--con-contexto { grid-template-columns: 300px 1fr; }
  .tdp-col-contexto {
    grid-column: 1 / -1;
    border-left: 0;
    padding-left: 0;
    border-top: 1px solid var(--color-border-subtle);
    padding-top: 16px;
  }
}

@container tdp (max-width: 800px) {
  .tdp-body { overflow-y: auto; }
  .tdp-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    flex: none;
    min-height: auto;
  }
  .tdp-col-der { align-self: auto; }
  .tdp-conversacion { flex: none; }
  .tdp-conversacion-scroll { flex: none; overflow-y: visible; }
  /* El divisor de .tdp-col-izq nace vertical porque ahí vive AL LADO de
     Actividad y conversación; apiladas (Datos del ticket arriba, feed
     abajo) una línea a la derecha no separa nada — gira a horizontal,
     mismo criterio que ya usa .tdp-col-izq en desktop, rotado 90°. */
  .tdp-col-izq {
    border-right: 0;
    padding-right: 0;
    border-bottom: 1px solid var(--color-border-subtle);
    padding-bottom: 16px;
  }
}

/* ── Resto: mismas reglas que TicketDetalleView.vue (contenido idéntico,
   solo cambia el contenedor exterior de grid-12/col-x a una columna). */
.header-sub {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.tk-codigo {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

/* Hasta la octava pasada esta regla no tenía consumidor en ESTE archivo
   (copiada junto con "el resto" de TicketDetalleView.vue, ver nota más
   abajo, pero nunca aplicada acá) — la novena pasada la usa de verdad, en
   `.tdp-grid` y `.tdp-historial` (ver el template), en vez de escribir un
   divisor nuevo para lo mismo que esta clase ya resuelve. */
.tk-nombre { font-size: var(--fs-body-01); font-weight: 600; color: var(--color-text-primary); }
/* Banda de solicitante (esta ronda) — horizontal, ancho completo: avatar
   + datos a la izquierda, chips de conteo/enlaces a la derecha. Mismo
   avatar neutro que la lista angosta de TicketsView.vue (.avatar--neutro,
   global en main.css) para "sin vincular". Hasta el rediseño Materen
   (Fase 1) esta afirmación era falsa: la clase se llamaba .tfs-avatar-vacio
   y estaba declarada en el <style scoped> de TicketsView.vue, que no
   alcanza el interior de un componente hijo — el avatar "Sin vincular" de
   acá caía al .avatar base y se veía con el azul de acento, no neutro. */
.tdp-solicitante-banda {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.tdp-solicitante-linea {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tdp-solicitante-datos {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tdp-solicitante-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tdp-adjunto-link {
  display: inline-flex;
  text-decoration: none;
}

/* Conversación a todo el alto disponible (reemplaza el truco de
   position:sticky de una ronda anterior): .tdp-conversacion es un
   flex-column ACOTADO (flex:1 dentro de .tdp-col-der, que a su vez
   stretchea al alto de la fila del grid — ver .tdp-col-der arriba) en vez
   de crecer con su contenido. El scroll real vive en
   .tdp-conversacion-scroll, adentro.
   `overflow: hidden` explícito (novena pasada): hasta la octava pasada
   este elemento era un `.card` y lo heredaba gratis de esa clase global;
   al dejar de serlo (ya no hay 5 tarjetas separadas acá adentro) hacía
   falta declararlo acá para no perder la contención de scroll que el
   propio diseño de esta ronda da por sentada. */
.tdp-conversacion {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* El scroll real vive acá — título y composer quedan afuera (fijos,
   arriba/abajo), esto es lo único que se mueve. */
.tdp-conversacion-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* El composer (TicketComposer.vue, compartido con TicketDetalleView.vue)
   queda "fijo abajo" por flujo normal — último hijo con flex-shrink:0, no
   por position:sticky: con la card de alto acotado el truco ya no hacía
   falta. Lo único que aporta el panel es ese flex-shrink; el resto del
   estilo del composer vive en el componente.
   El feed usa la variante `acotado` de TicketTimelineUnificado.vue (scroll
   propio a partir de 280px) porque comparte alto con el composer. */
.tdp-composer {
  flex-shrink: 0;
}
</style>
