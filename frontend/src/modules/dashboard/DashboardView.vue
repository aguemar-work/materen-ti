<script setup>
// Inicio: la mesa del día (Versión Expediente, plan Ciclo 21 §3.3 pantalla 1).
//
// Una sola llamada: todo sale de `dashboard_resumen` (migración 103) a través
// de stores/dashboard.js, el MISMO store que alimenta el contador de tickets
// del menú. La pantalla no calcula umbrales ni consulta tablas.
//
//   · Encabezado: saludo con el nombre (hora de Lima) y, debajo, la fecha y el
//     total de asuntos / críticos del feed. Una sola acción sólida.
//   · Fila de vistas (AppVistas) con conteo: filtra el feed EN EL LUGAR. Solo
//     aparecen las vistas con alguna sección que el servidor entregó.
//   · Feed en libro, CRÍTICO / ATENCIÓN, y a su lado Mis tickets, Vence esta
//     semana y Hoy en custodia.
//   · La carga es una línea de 2 px arriba; el contenido anterior se queda
//     mientras recarga (stale-while-revalidate). Sin esqueletos.
//   · Un fallo de sección es una fila con "Reintentar"; un fallo de la RPC
//     entera es UN aviso con "Reintentar". "Al día" es una línea de texto y
//     solo se escribe con la respuesta completa y sin errores.
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '../../stores/auth.js';
import { useDashboardStore } from '../../stores/dashboard.js';
import { showToast } from '../../core/toast.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppButton from '../../components/ui/AppButton.vue';
import FeedPendientes from './FeedPendientes.vue';
import PanelMisTickets from './PanelMisTickets.vue';
import PanelVencimientos from './PanelVencimientos.vue';
import PanelCustodiaHoy from './PanelCustodiaHoy.vue';
import PanelInicio from './PanelInicio.vue';
import FilaAviso from './FilaAviso.vue';
import { construirFeedPendientes, GRUPOS_INICIO } from './pendientesFeed.js';
import {
  vistasDisponibles, erroresDelFeed, erroresDe, hayAlguna, vencimientosDeLaSemana,
  ETIQUETA_SECCION, SECCIONES_LATERALES,
} from './vistasInicio.js';
import { tramoDelDia, fechaLarga } from './tiempoLima.js';

// El formulario es el del módulo Tickets; se carga solo al abrirlo (como el
// formulario de nombre del menú) para no sumarlo al chunk del Inicio.
const TicketInternoForm = defineAsyncComponent(() => import('../tickets/TicketInternoForm.vue'));

const auth = useAuthStore();
const store = useDashboardStore();
const { resumen, cargando, error, errores } = storeToRefs(store);

// "Ahora" se fija al montar: el saludo y la fecha no deben cambiar bajo los
// pies de quien lee. Hora y día en Lima (tiempoLima.js), no del navegador.
const ahora = ref(new Date());

const saludo = computed(() => {
  const tramo = tramoDelDia(ahora.value);
  const nombre = (auth.nombre || '').trim().split(/\s+/)[0];
  return nombre ? `${tramo}, ${nombre}` : tramo;
});

const feed = computed(() => construirFeedPendientes(resumen.value, { ahora: ahora.value }));
const totalCriticos = computed(() => feed.value.filter((i) => i.tier === 1).length);

const subtitulo = computed(() => {
  const fecha = fechaLarga(ahora.value);
  if (!resumen.value) return fecha;
  const n = feed.value.length;
  if (!n) return errores.value.length || error.value ? fecha : `${fecha} · al día`;
  const asuntos = `${n} ${n === 1 ? 'asunto pendiente' : 'asuntos pendientes'}`;
  const c = totalCriticos.value;
  const criticos = c ? `, ${c} ${c === 1 ? 'crítico' : 'críticos'}` : '';
  return `${fecha} · ${asuntos}${criticos}`;
});

// ── Vistas ───────────────────────────────────────────────────────────────
const vista = ref('todos');
const opcionesVistas = computed(() => [
  { valor: 'todos', label: 'Todos', conteo: resumen.value ? feed.value.length : undefined },
  ...vistasDisponibles(resumen.value).map((id) => ({
    valor: id,
    label: GRUPOS_INICIO[id].label,
    conteo: feed.value.filter((i) => i.grupo === id).length,
  })),
]);
// Si tras recargar la vista elegida ya no existe, se vuelve a "Todos".
watch(opcionesVistas, (ops) => {
  if (!ops.some((o) => o.valor === vista.value)) vista.value = 'todos';
});

const feedVista = computed(() => (vista.value === 'todos' ? feed.value : feed.value.filter((i) => i.grupo === vista.value)));
const textoAviso = (seccion) => `No se pudo calcular ${ETIQUETA_SECCION[seccion] || seccion}.`;
const avisosFeed = computed(() =>
  erroresDelFeed(resumen.value, vista.value).map((seccion) => ({ seccion, texto: textoAviso(seccion) })),
);
// "Al día" solo con la respuesta completa y sin errores en ninguna sección ni
// al actualizar: en cualquier otro caso se dice "ningún asunto pendiente"
// (lo calculado) y el aviso de la sección que falló explica el resto.
const vacioFeed = computed(() => {
  if (!resumen.value || avisosFeed.value.length) return '';
  if (vista.value !== 'todos') return `Sin pendientes en ${GRUPOS_INICIO[vista.value].label.toLowerCase()}.`;
  return errores.value.length || error.value ? 'Ningún asunto pendiente.' : 'Al día. Ningún asunto pendiente.';
});
const tituloFeed = computed(() => (vista.value === 'todos' ? 'Pendientes' : `Pendientes · ${GRUPOS_INICIO[vista.value].label}`));

// ── Paneles laterales: solo con la sección entregada (o con su error) ────
const verMios = computed(() => hayAlguna(resumen.value, SECCIONES_LATERALES.mios));
const verVencimientos = computed(() => hayAlguna(resumen.value, SECCIONES_LATERALES.vencimientos));
const verCustodiaHoy = computed(() => hayAlguna(resumen.value, SECCIONES_LATERALES.custodiaHoy));
const avisoMios = computed(() => (erroresDe(resumen.value, SECCIONES_LATERALES.mios).length ? textoAviso('tickets') : ''));
const avisosVencimientos = computed(() =>
  erroresDe(resumen.value, SECCIONES_LATERALES.vencimientos).map(textoAviso),
);
const avisoCustodiaHoy = computed(() => (erroresDe(resumen.value, SECCIONES_LATERALES.custodiaHoy).length ? textoAviso('custodia_hoy') : ''));
const vencimientos = computed(() => vencimientosDeLaSemana(resumen.value, ahora.value));

// ── Carga ────────────────────────────────────────────────────────────────
const reintentar = () => store.cargar();
// Con un resumen ya cargado el fallo no lo borra: se avisa y se conserva.
const textoErrorTotal = computed(() => {
  const e = error.value;
  return /^No se pudo/.test(e) ? e : `No se pudo cargar el Inicio. ${e}`;
});

onMounted(() => {
  // El store comparte la carga en curso y respeta un intento reciente: si el
  // menú ya pidió el resumen al montarse (la ruta de esta vista es un chunk
  // diferido y llega después), no se repite la petición al servidor.
  store.cargarSiHaceFalta();
});

// ── Ticket interno ───────────────────────────────────────────────────────
const mostrarNuevo = ref(false);
function onNuevoCerrado(creado) {
  mostrarNuevo.value = false;
  if (creado) {
    showToast('Ticket interno creado');
    store.cargar({ silencioso: true });
  }
}
</script>

<template>
  <div class="w-full pb-10">
    <!-- Línea de carga: 2 px, siempre ocupa su lugar para que no salte nada. -->
    <div
      class="sticky top-0 z-10 h-0.5"
      :class="cargando ? 'bg-gray-400' : 'bg-transparent'"
      :role="cargando ? 'progressbar' : undefined"
      :aria-label="cargando ? 'Actualizando el Inicio' : undefined"
      data-carga
    ></div>

    <AppEncabezado :titulo="saludo" :subtitulo="subtitulo">
      <template v-if="auth.puedeVerModulo('tickets')" #acciones>
        <AppButton severity="primary" icon="ti ti-plus" label="Ticket interno" @click="mostrarNuevo = true" />
      </template>
    </AppEncabezado>

    <AppVistas v-model="vista" :opciones="opcionesVistas" label="Vista del Inicio" />

    <!-- Primera carga: sin resumen todavía. Texto discreto, sin esqueletos. -->
    <p v-if="!resumen && cargando" class="px-4 py-6 text-sm text-gray-500 sm:px-6" role="status">Cargando el Inicio…</p>

    <!-- La RPC falló entera y no hay nada que mostrar: UN aviso con reintento. -->
    <div v-else-if="!resumen" class="mt-6 px-4 sm:px-6" data-error-total>
      <PanelInicio titulo="Inicio">
        <FilaAviso :texto="textoErrorTotal" @reintentar="reintentar" />
      </PanelInicio>
    </div>

    <template v-else>
      <div v-if="error" class="mt-4 px-4 sm:px-6" data-error-actualizacion>
        <PanelInicio titulo="Actualización">
          <FilaAviso :texto="`No se pudo actualizar el Inicio. Se muestra la última carga. ${error}`" @reintentar="reintentar" />
        </PanelInicio>
      </div>

      <div class="mt-6 grid items-start gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <FeedPendientes
          :titulo="tituloFeed"
          :items="feedVista"
          :avisos="avisosFeed"
          :vacio="vacioFeed"
          @reintentar="reintentar"
        />

        <aside class="min-w-0 space-y-6" aria-label="Lo suyo y lo de hoy">
          <PanelMisTickets v-if="verMios" :tickets="resumen.tickets" :aviso="avisoMios" @reintentar="reintentar" />
          <PanelVencimientos
            v-if="verVencimientos"
            :items="vencimientos.items"
            :mas="vencimientos.mas"
            :avisos="avisosVencimientos"
            @reintentar="reintentar"
          />
          <PanelCustodiaHoy
            v-if="verCustodiaHoy"
            :movimientos="resumen.custodia_hoy || []"
            :aviso="avisoCustodiaHoy"
            @reintentar="reintentar"
          />
        </aside>
      </div>
    </template>

    <TicketInternoForm v-if="mostrarNuevo" @cerrar="onNuevoCerrado" />
  </div>
</template>
