<script setup>
import { onMounted } from 'vue';
import { formatFechaHora } from '../../core/formatters.js';
import { estadoInfo, OPCIONES_PRIORIDAD as PRIORIDADES, OPCIONES_TIPO as TIPOS, NIVELES_ATENCION, ESTADOS_EN_CURSO, ESTADOS_TERMINALES } from '../../core/dominio-tickets.js';
import { badgeInfo } from '../../core/badges.js';
import { useTicketDetalleLogica } from '../../composables/useTicketDetalleLogica.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import ProblemaForm from '../problemas/ProblemaForm.vue';

// Panel de detalle para el split-view de Tickets — standalone todavía (no
// integrado en TicketsView.vue). Mismo composable que TicketDetalleView.vue
// (misma lógica de negocio, mismo store); lo que cambia es el contenedor:
// una sola columna apilada en vez del grid de 3 columnas de la página
// completa, y sin PageHeader (acá un botón "cerrar panel" simple, porque no
// hay a dónde "volver" — el panel no navega, vive al lado de la lista).
const props = defineProps({
  ticketId: { type: String, required: true },
});
const emit = defineEmits(['cerrar']);

const {
  auth,
  ticket, comentarios, equiposEmpleado, articulosRelacionados, problemaVinculado, cargando, staffActivo, staffPorId,
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
  enviarComentario,
} = useTicketDetalleLogica();

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

// Iniciales del avatar del solicitante en la banda horizontal — mismo
// criterio que TicketsView.vue (lista angosta del split-view): primera
// letra de las dos primeras palabras del nombre completo (acá también es
// un solo string, "Nombres Apellidos", no nombres/apellidos separados).
function inicialesDe(nombre) {
  if (!nombre) return '';
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase();
}
</script>

<template>
  <aside class="ticket-detalle-panel">
    <div class="tdp-header card">
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

      <button class="icon-btn tdp-btn-cerrar" type="button" title="Cerrar panel" @click="emit('cerrar')">
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>

    <div class="tdp-body">
      <div v-if="cargando" class="no-results">Cargando ticket...</div>
      <div v-else-if="!ticket" class="no-results">Ticket no encontrado.</div>

      <template v-else>
      <!-- Banda de solicitante — horizontal, ancho completo. Equipos/
           Artículos quedan como conteo simple, no lista expandida (a
           pedido explícito: "empecemos simple"). Enlazado a/Captura
           adjunta como chips cortos, mismo criterio. -->
      <div class="card tdp-seccion tdp-solicitante-banda">
        <div v-if="ticket.vinculado && ticket.empleado_nombre" class="tdp-solicitante-linea">
          <span class="avatar sm" :title="ticket.empleado_nombre">{{ inicialesDe(ticket.empleado_nombre) }}</span>
          <div class="tdp-solicitante-datos">
            <RouterLink class="tk-nombre empleado-link" :to="`/empleados/${ticket.empleado_id}`">{{ ticket.empleado_nombre }}</RouterLink>
            <span class="tk-detalle">DNI {{ ticket.empleado_dni }}{{ ticket.empleado_correo ? ` · ${ticket.empleado_correo}` : '' }}</span>
          </div>
        </div>
        <div v-else class="tdp-solicitante-linea">
          <span class="avatar sm tfs-avatar-vacio" title="Sin vincular"><i class="ti ti-user" aria-hidden="true"></i></span>
          <div class="tdp-solicitante-datos">
            <span class="badge" :class="badgeInfo('ticket_sin_vincular').clase"><i class="ti ti-alert-triangle"></i> {{ badgeInfo('ticket_sin_vincular').label }}</span>
            <span v-if="ticket.contacto_ingresado" class="tk-detalle">Contacto ingresado: {{ ticket.contacto_ingresado }}</span>
          </div>
        </div>

        <div class="tdp-solicitante-chips">
          <span v-if="equiposEmpleado.length" class="badge badge--neutral">{{ equiposEmpleado.length }} equipo{{ equiposEmpleado.length === 1 ? '' : 's' }} asignado{{ equiposEmpleado.length === 1 ? '' : 's' }}</span>
          <span v-if="articulosRelacionados.length" class="badge badge--neutral">{{ articulosRelacionados.length }} artículo{{ articulosRelacionados.length === 1 ? '' : 's' }} relacionado{{ articulosRelacionados.length === 1 ? '' : 's' }}</span>
          <span v-if="ticket.equipo_desc" class="badge badge--neutral"><i class="ti ti-devices" aria-hidden="true"></i> {{ ticket.equipo_desc }}</span>
          <span v-if="ticket.cuenta_desc" class="badge badge--neutral"><i class="ti ti-key" aria-hidden="true"></i> {{ ticket.cuenta_desc }}</span>
          <span v-if="ticket.licencia_desc" class="badge badge--neutral"><i class="ti ti-license" aria-hidden="true"></i> {{ ticket.licencia_desc }}</span>
          <a v-if="ticket.adjunto_url" class="badge badge--neutral" :href="ticket.adjunto_url" target="_blank" rel="noopener noreferrer"><i class="ti ti-camera" aria-hidden="true"></i> Captura adjunta</a>
        </div>
      </div>

      <!-- Satisfacción se sacó del panel esta ronda por completo (rompía
           el ritmo visual: una fila entera de forma despareja). Los 2
           botones de copiar (WhatsApp/link) se van con ella — quedan
           disponibles en el composable (copiarMensajeSatisfaccion/
           copiarLinkSatisfaccion) por si se les busca otro lugar más
           adelante, no se borraron de ahí. -->

      <div class="tdp-grid">
        <!-- ═══ Columna izquierda (angosta) ═══ -->
        <div class="tdp-col-izq">

          <!-- Datos del ticket — ya no depende de !mostrarRechazar/
               !mostrarReabrir: esos formularios ahora son ConfirmDialog
               (overlay), no reemplazan este contenido en el lugar como
               antes, así que no hace falta ocultarlo mientras están
               abiertos. -->
          <div class="card tdp-seccion tdp-datos-ticket">
            <div class="datos-title"><i class="ti ti-list-details"></i> Datos del ticket</div>

            <template v-if="ticket.estado === 'abierto'">
              <div class="form-group">
                <label for="pnl-in-prioridad">Prioridad</label>
                <select id="pnl-in-prioridad" v-model="atencionForm.prioridad" :disabled="iniciando">
                  <option v-for="p in PRIORIDADES" :key="p.valor" :value="p.valor">{{ p.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="pnl-in-nivel">Nivel de atención</label>
                <select id="pnl-in-nivel" v-model="atencionForm.nivelAtencion" :disabled="iniciando">
                  <option v-for="n in NIVELES_ATENCION" :key="n.valor" :value="n.valor">{{ n.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="pnl-in-asignado">Técnico responsable</label>
                <select id="pnl-in-asignado" v-model="atencionForm.asignadoA" :disabled="iniciando">
                  <option value="" disabled>Seleccionar</option>
                  <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">
                    {{ s.user_id === auth.user?.id ? `${s.nombre} (yo)` : s.nombre }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label for="pnl-in-tipo">Tipo</label>
                <select id="pnl-in-tipo" v-model="atencionForm.tipo" :disabled="iniciando">
                  <option value="" disabled>Seleccionar</option>
                  <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
                </select>
                <p v-if="tipoAmbiguoSinClasificar" class="tk-nota">Esta subcategoría no tiene un tipo por defecto (puede ser incidente o solicitud según el caso) — elígelo manualmente antes de iniciar.</p>
              </div>
            </template>

            <template v-if="ESTADOS_EN_CURSO.includes(ticket.estado)">
              <div class="form-group">
                <label for="pnl-tk-prioridad">Prioridad</label>
                <select id="pnl-tk-prioridad" :value="ticket.prioridad" :disabled="guardandoCampo" @change="cambiarPrioridad($event.target.value)">
                  <option v-for="p in PRIORIDADES" :key="p.valor" :value="p.valor">{{ p.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="pnl-tk-nivel">Nivel de atención</label>
                <select id="pnl-tk-nivel" :value="ticket.nivel_atencion || ''" :disabled="guardandoCampo" @change="cambiarNivelAtencion($event.target.value)">
                  <option value="" disabled>Sin definir</option>
                  <option v-for="n in NIVELES_ATENCION" :key="n.valor" :value="n.valor">{{ n.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="pnl-tk-asignado">Técnico responsable</label>
                <select id="pnl-tk-asignado" :value="ticket.asignado_a || ''" :disabled="guardandoCampo" @change="cambiarAsignado($event.target.value, $event)">
                  <option value="">Sin asignar</option>
                  <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="pnl-tk-tipo">Tipo</label>
                <select id="pnl-tk-tipo" :value="ticket.tipo" :disabled="guardandoCampo" @change="cambiarTipo($event.target.value)">
                  <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
                </select>
              </div>
            </template>

            <template v-if="ESTADOS_TERMINALES.includes(ticket.estado)">
              <p class="tk-detalle">Prioridad: {{ PRIORIDADES.find((p) => p.valor === ticket.prioridad)?.label || ticket.prioridad }}</p>
              <p class="tk-detalle">Nivel de atención: <TextoVacio :valor="NIVELES_ATENCION.find((n) => n.valor === ticket.nivel_atencion)?.label" placeholder="Sin definir" /></p>
              <p class="tk-detalle">Técnico responsable: <TextoVacio :valor="staffPorId[ticket.asignado_a]" placeholder="Sin asignar" /></p>
            </template>
          </div>

          <!-- Historial -->
          <div class="card tdp-seccion tdp-historial">
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
          <div class="card tdp-seccion tdp-conversacion">
            <div class="datos-title"><i class="ti ti-message-circle"></i> Conversación</div>

            <div class="tdp-conversacion-scroll">
              <p class="tk-descripcion">{{ ticket.descripcion }}</p>

              <div v-if="comentarios.length" class="timeline tk-timeline">
                <div v-for="c in comentarios" :key="c.id" class="timeline-item">
                  <span class="timeline-dot" :class="c.interno ? 'timeline-dot--closed' : 'timeline-dot--active'"></span>
                  <div class="timeline-content tk-comentario-bubble" :class="c.interno ? 'tk-comentario-bubble--interno' : 'tk-comentario-bubble--visible'">
                    <!-- Orden: Nombre → Fecha → badge (ronda anterior). -->
                    <div class="timeline-title">
                      {{ autorDe(c.autor_id) }}
                      <span class="tk-comentario-fecha">{{ formatFechaHora(c.created_at) }}</span>
                      <span class="badge badge-inline" :class="c.interno ? 'badge--neutral' : 'badge--success'">
                        {{ c.interno ? 'Nota interna' : 'Visible para el empleado' }}
                      </span>
                    </div>
                    <p class="tk-mensaje">{{ c.mensaje }}</p>
                  </div>
                </div>
              </div>
              <p v-else class="tk-nota">Sin comentarios todavía.</p>
            </div>

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
      mensaje="Esto cierra el ticket de inmediato — no hay un paso intermedio para revisar antes de cerrar. ¿Confirmas que el problema quedó resuelto?"
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
/* ── Contenedor del panel — una sola columna apilada, sin PageHeader.
   Standalone por ahora: el ancho lo define quien lo monte (en el
   split-view futuro, el panel derecho de la lista). */
/* Fondo "island" (ronda de cierre de Tickets): --color-bg como telón de
   fondo del panel entero — antes era --color-bg-elevated (blanco), igual
   que .tdp-header/.tdp-seccion (también .card, blanco) que flotan
   encima, así que no había contraste entre "el panel" y "las cards
   adentro del panel". border-left → border completo + radio: el panel
   pasa a ser una isla más al lado de nav/lista en TicketsView.vue (que
   ahora también flotan sobre --color-bg con gap alrededor), no una
   franja pegada a sus vecinos. */
.ticket-detalle-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

/* Head "island" (esta ronda) — antes era una franja pegada al borde con
   border-bottom; ahora es su propia .card (bg/border/radio/overflow ya
   los da .card global), separada del body con margin en vez de estar
   cosida a él. */
.tdp-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin: 16px 20px 0;
  padding: 16px 20px;
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
  font-size: var(--fs-lg);
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
  font-size: var(--fs-sm);
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

.tdp-btn-problema-activo {
  background: var(--color-danger-bg);
  color: var(--color-danger-text);
  border-color: var(--color-danger-border);
}

.tdp-btn-cerrar { flex-shrink: 0; }

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
.tdp-seccion { padding: 16px 20px 20px; flex-shrink: 0; }

/* ── Grid de 2 columnas — izquierda angosta (Datos del ticket,
   Historial), derecha ancha (Conversación, sola ahora que Satisfacción
   se sacó del panel).
   Cambio de esta ronda: flex:1 + grid-template-rows:1fr hacen que
   .tdp-grid ocupe TODO el alto restante de .tdp-body (antes crecía con
   su contenido, .tdp-body scrolleaba todo). align-items:start sigue
   siendo el default para la izquierda (se queda a su alto natural,
   Datos del ticket + Historial no necesitan más) — .tdp-col-der pisa ese
   default con align-self:stretch para ser la excepción, la única que
   necesita ocupar el 100% del alto de la fila. Ya no hace falta sticky
   en ningún lado: ninguno de los dos "seguía" al otro con un truco de
   posición, ahora cada columna simplemente ocupa lo que le corresponde
   dentro de un layout acotado. Verificado con alturas computadas reales
   en un repro aislado antes de aplicarlo acá (no solo a ojo), igual que
   el fix de flex-shrink de una ronda anterior. */
.tdp-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  grid-template-rows: 1fr;
  gap: 16px;
  align-items: start;
  flex: 1;
  min-height: 0;
}

.tdp-col-izq, .tdp-col-der {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* Fallback de seguridad: si Datos del ticket + Historial llegaran a ser
   más altos que el espacio disponible (poco probable, Historial ya tiene
   su propio tope de 280px), scrollea internamente en vez de desbordar —
   ya no hay un .tdp-body más grande por detrás que lo resuelva solo. */
.tdp-col-izq { overflow-y: auto; }

.tdp-col-der {
  align-self: stretch;
  min-height: 0;
}

/* Panel angosto (ventana justo por encima de los 768px del split-view):
   2 columnas de 300px+resto no entran cómodas — cae a 1 columna apilada,
   mismo criterio de rondas anteriores. Acá SÍ se vuelve al modelo
   anterior (todo con alto natural, .tdp-body scrollea como una unidad):
   con las 2 columnas apiladas en el mismo eje, no hay "lo que sobra"
   para repartir — no tendría sentido acotar Conversación a un alto fijo
   ahí, la volvería innecesariamente chica en una ventana ya angosta. */
@media (max-width: 1100px) {
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
}

/* ── Resto: mismas reglas que TicketDetalleView.vue (contenido idéntico,
   solo cambia el contenedor exterior de grid-12/col-x a una columna). */
.header-sub {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}

.tk-codigo {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
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

.tk-nombre { font-size: var(--fs-base); font-weight: 600; color: var(--color-text-primary); }
.tk-detalle { font-size: var(--fs-sm); color: var(--color-text-secondary); margin: 2px 0; }
.tk-nota { font-size: var(--fs-sm); color: var(--color-text-tertiary); font-style: italic; margin: 4px 0 0; }

/* Banda de solicitante (esta ronda) — horizontal, ancho completo: avatar
   + datos a la izquierda, chips de conteo/enlaces a la derecha. Mismo
   avatar neutro que la lista angosta de TicketsView.vue (.tfs-avatar-vacio)
   para "sin vincular". */
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

.tk-comentario-bubble {
  border-radius: var(--radius-md);
  padding: 8px 10px;
}

.tk-comentario-bubble--interno { background: var(--color-neutral-bg); }
.tk-comentario-bubble--visible { background: var(--color-success-bg); }

/* Fecha inline dentro de .timeline-title (Nombre → Fecha → badge, esta
   ronda) — sin esto hereda font-weight:600/color primario de
   .timeline-title (main.css), que la haría ver como si fuera parte del
   nombre. Mismo tono/tamaño que .timeline-meta tenía cuando iba abajo
   aparte. */
.tk-comentario-fecha {
  font-weight: 400;
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}

.tk-mensaje {
  margin: 4px 0 0;
  font-size: var(--fs-base);
  color: var(--color-text-primary);
  white-space: pre-wrap;
}

/* Conversación a todo el alto disponible (esta ronda, reemplaza el truco
   de position:sticky de la ronda anterior): .tdp-conversacion es ahora
   un flex-column ACOTADO (flex:1 dentro de .tdp-col-der, que a su vez
   stretchea al alto de la fila del grid — ver .tdp-col-der arriba) en
   vez de crecer con su contenido. overflow:hidden vuelve al default de
   .card (ya no hace falta escaparlo con overflow:visible como la ronda
   pasada: el scroll ahora es interno — .tdp-conversacion-scroll —, no
   depende de que sticky encuentre a .tdp-body como ancestro). */
.tdp-conversacion {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* El scroll real vive acá — título y composer quedan afuera (fijos,
   arriba/abajo), esto es lo único que se mueve. */
.tdp-conversacion-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* El composer queda "fijo abajo" por flujo normal (último hijo,
   flex-shrink:0), no por position:sticky — con la card de alto acotado,
   ya no hacía falta el truco. Mismo resultado visual que la ronda
   anterior, mecanismo más simple. */
.tk-nuevo-comentario {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

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

/* Scroll interno propio si crece mucho — con la columna izquierda ahora
   sticky (ver .tdp-col-izq), un Historial largo la volvería más alta que
   la pantalla y "pegarse" perdería sentido (la parte de abajo nunca se
   vería). Tope razonable para ver varios hitos sin scrollear todavía. */
.tk-historial-timeline {
  max-height: 280px;
  overflow-y: auto;
}

.tk-historial-timeline .timeline-item { padding-bottom: 12px; }
.tk-historial-timeline .timeline-title { font-size: var(--fs-sm); font-weight: 600; }
.tk-historial-timeline .timeline-meta { font-size: 11px; margin-top: 1px; }
.tk-historial-timeline .timeline-detalle { font-size: 11px; color: var(--color-warning-text); margin-top: 2px; }
</style>
