<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useEquiposStore } from '../../stores/equipos.js';
import { insforgeApi } from '../../api/insforge.js';
import { useRealtimeRefresco } from '../../composables/useRealtimeRefresco.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora } from '../../core/formatters.js';
import { SITUACIONES_EQUIPO, situacionInfo } from '../../core/dominio-equipos.js';
import { generarActa } from './acta.js';
import { generarActaDevolucion } from './acta-devolucion.js';
import EquipoForm from './EquipoForm.vue';
import Pagination from '../../components/shared/Pagination.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorEmpleado from '../../components/shared/BuscadorEmpleado.vue';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';

const store = useEquiposStore();
const { lista, total, cargando, error } = storeToRefs(store);

useRealtimeRefresco('equipos:list', () => store.cargar());

// Deep-link desde la búsqueda global: /equipos?q=CODIGO precarga el buscador.
const route = useRoute();
const busqueda = ref(String(route.query.q ?? ''));
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const filtroTipo = ref('');
const filtroSituacion = ref('');
const mostrarForm = ref(false);
const equipoEditar = ref(null);

let debounceBusqueda = null;
watch(busqueda, (q) => {
  clearTimeout(debounceBusqueda);
  debounceBusqueda = setTimeout(() => store.aplicarFiltros({ q: q.trim() }), 300);
});
watch(filtroTipo, (tipoId) => store.aplicarFiltros({ tipoId }));
watch(filtroSituacion, (situacion) => store.aplicarFiltros({ situacion }));

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'equipos',
      ['Código equipo', 'Código almacén', 'Tipo', 'Marca', 'Modelo', 'Empresa', 'Serie', 'Situación', 'Asignado a'],
      filas.map((eq) => [
        eq.codigo,
        eq.codigo_almacen,
        eq.tipo_nombre,
        eq.marca,
        eq.modelo,
        eq.empresa_nombre,
        eq.serie,
        badgesSituacion(eq).map((b) => b.label).join(' · '),
        eq.portador || eq.ubicacion_nombre,
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// Un equipo tiene estado FÍSICO (operativo/en_reparacion/de_baja/perdido) y
// situación DERIVADA (Disponible/Asignado/En ubicación) simultáneos. Cuando
// está operativo Y en uso, mostrar ambos confirma de un vistazo que el
// equipo está sano *mientras* alguien lo tiene — con un solo badge no se ve.
// Si no está operativo, el estado físico ya lo dice todo (un solo badge).
function badgesSituacion(eq) {
  if (eq.estado === 'operativo' && (eq.situacion === 'asignado' || eq.situacion === 'en_ubicacion')) {
    const derivado = situacionInfo(eq.situacion);
    return [
      { label: 'Operativo', clase: 'badge--success', fisico: true },
      { label: derivado.label, clase: derivado.clase, fisico: false },
    ];
  }
  const info = situacionInfo(eq.situacion);
  return [{ label: info.label, clase: info.clase, fisico: false }];
}

// ── Formulario ────────────────────────────────────────────────
function abrirNuevo() {
  equipoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(equipo) {
  equipoEditar.value = equipo;
  mostrarForm.value = true;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!equipoEditar.value;
  mostrarForm.value = false;
  equipoEditar.value = null;
  if (guardado) showToast(fueEdicion ? 'Equipo actualizado' : 'Equipo registrado');
}

// ── Asignar ───────────────────────────────────────────────────
const mostrarAsignar = ref(false);
const equipoAsignar = ref(null);
const empleadosActivos = ref([]);
const empleadoSelId = ref('');
const condicionEntrega = ref('');
const procesando = ref(false);
const errorAsignar = ref('');

async function abrirAsignar(equipo) {
  equipoAsignar.value = equipo;
  empleadoSelId.value = '';
  condicionEntrega.value = '';
  errorAsignar.value = '';
  mostrarAsignar.value = true;
  if (!empleadosActivos.value.length) {
    try {
      const todos = await insforgeApi.listEmpleados();
      empleadosActivos.value = todos.filter((e) => e.estado === 'Activo');
    } catch (e) {
      showToast(e?.message || 'Error al cargar empleados', 'error');
      mostrarAsignar.value = false;
    }
  }
}

async function confirmarAsignar() {
  if (!empleadoSelId.value) return;
  errorAsignar.value = '';
  procesando.value = true;
  try {
    await store.asignar(equipoAsignar.value.id, empleadoSelId.value, condicionEntrega.value);
    mostrarAsignar.value = false;
    showToast(`${equipoAsignar.value.codigo} entregado`);
  } catch (e) {
    // Rechazo del trigger de asignación (portador activo o equipo no
    // operativo): se muestra dentro del modal, no solo en el toast.
    errorAsignar.value = e?.message || 'Error al asignar';
  } finally {
    procesando.value = false;
  }
}

// ── Devolver ──────────────────────────────────────────────────
const mostrarDevolver = ref(false);
const equipoDevolver = ref(null);
const condicionDevolucion = ref('');
const motivoCierre = ref('devolucion');
const aReparacion = ref(false);

// "Perdida/robo" y "volvió dañado" son contradictorios (el backend ya le da
// prioridad a perdida, pero mejor que el form ni permita capturar la mezcla):
// al elegir ese motivo, el checkbox se desmarca y se deshabilita solo.
watch(motivoCierre, (motivo) => {
  if (motivo === 'perdida') aReparacion.value = false;
});

function abrirDevolver(equipo) {
  equipoDevolver.value = equipo;
  condicionDevolucion.value = '';
  motivoCierre.value = equipo.portador_inactivo ? 'baja_empleado' : 'devolucion';
  aReparacion.value = false;
  mostrarDevolver.value = true;
}

async function confirmarDevolver() {
  procesando.value = true;
  try {
    const datosDevolucion = {
      condicion: condicionDevolucion.value,
      motivo: motivoCierre.value,
      aReparacion: aReparacion.value,
      fecha: new Date().toISOString(),
    };
    await store.devolver(equipoDevolver.value.asignacion_id, equipoDevolver.value.id, {
      condicion: datosDevolucion.condicion,
      motivo: datosDevolucion.motivo,
      aReparacion: datosDevolucion.aReparacion,
    });
    const equipoDevuelto = equipoDevolver.value;
    mostrarDevolver.value = false;
    showToast(`${equipoDevuelto.codigo} devuelto${aReparacion.value ? ' — enviado a reparación' : ''}`);
    try {
      const empleado = await insforgeApi.getEmpleado(equipoDevuelto.empleado_id);
      if (empleado) generarActaDevolucion(equipoDevuelto, empleado, datosDevolucion);
    } catch (e) {
      showToast(e?.message || 'No se pudo generar el acta de devolución', 'error');
    }
  } catch (e) {
    showToast(e?.message || 'Error al registrar devolución', 'error');
  } finally {
    procesando.value = false;
  }
}

// ── Mover a ubicación ─────────────────────────────────────────
const mostrarMover = ref(false);
const equipoMover = ref(null);
const ubicacionSelId = ref('');
const nuevaUbicacion = ref('');

function abrirMover(equipo) {
  equipoMover.value = equipo;
  ubicacionSelId.value = '';
  nuevaUbicacion.value = '';
  mostrarMover.value = true;
}

async function agregarUbicacion() {
  const nombre = nuevaUbicacion.value.trim();
  if (!nombre) return;
  try {
    const ub = await store.crearUbicacion(nombre);
    ubicacionSelId.value = ub.id;
    nuevaUbicacion.value = '';
    showToast(`Ubicación "${ub.nombre}" creada`);
  } catch (e) {
    showToast(e?.message || 'Error al crear ubicación', 'error');
  }
}

async function confirmarMover() {
  if (!ubicacionSelId.value) return;
  procesando.value = true;
  try {
    await store.mover(equipoMover.value.id, ubicacionSelId.value);
    mostrarMover.value = false;
    showToast(`${equipoMover.value.codigo} movido`);
  } catch (e) {
    showToast(e?.message || 'Error al mover', 'error');
  } finally {
    procesando.value = false;
  }
}

// Los modales de captura (entregar/devolver/mover) no se cierran con clic
// fuera para no perder lo escrito; Escape sí los cierra. El de hoja de
// impresión (informativo) conserva el cierre por clic en el fondo.
useCerrarConEscape(() => {
  if (procesando.value) return;
  if (mostrarAsignar.value) mostrarAsignar.value = false;
  else if (mostrarDevolver.value) mostrarDevolver.value = false;
  else if (mostrarMover.value) mostrarMover.value = false;
});

// ── Cambiar estado físico ─────────────────────────────────────
// Confirmación (ConfirmDialog compartido): una sola instancia para las 5
// transiciones (a reparación / reparado / de baja / reactivar / recuperar).
// Solo "de_baja" es destructiva (btn-danger); las demás (incluidas
// reactivar/recuperar, que devuelven el equipo a servicio) usan el botón
// primario, mismo criterio que "Renovar licencia"/"Reactivar empleado".
const accionPendiente = ref(null); // { equipo, estado, estadoLabel, titulo, mensaje, confirmarLabel, destructivo }
const procesandoAccion = ref(false);
const dialogoAccion = ref(null);

const tituloAccion = computed(() => accionPendiente.value?.titulo || '');
const mensajeAccion = computed(() => accionPendiente.value?.mensaje || '');
const destructivoAccion = computed(() => !!accionPendiente.value?.destructivo);
const confirmarLabelAccion = computed(() => accionPendiente.value?.confirmarLabel || 'Confirmar');

function pedirCambiarEstado(equipo, estado, label) {
  if (equipo.situacion === 'asignado' && (estado === 'de_baja' || estado === 'perdido')) {
    showToast('Registra primero la devolución (o ciérrala con motivo pérdida)', 'error');
    return;
  }
  accionPendiente.value = {
    equipo,
    estado,
    estadoLabel: label,
    titulo: `Marcar como “${label}”`,
    mensaje: `¿Marcar ${equipo.codigo} como “${label}”?`,
    confirmarLabel: label,
    destructivo: estado === 'de_baja',
  };
}

// Reactivar (de_baja → operativo) y recuperar (perdido → operativo): un
// equipo de_baja/perdido nunca tiene asignación activa a un empleado (todas
// las vías que llevan a esos estados cierran o bloquean esa asignación
// primero), así que no hace falta ninguna validación extra acá. Si el
// equipo conservaba una asignación activa a UBICACIÓN, vuelve a esa
// ubicación en vez de "disponible" — mismo comportamiento ya aceptado hoy
// para "Marcar reparado".
function pedirReactivar(equipo) {
  accionPendiente.value = {
    equipo,
    estado: 'operativo',
    estadoLabel: 'Operativo',
    titulo: 'Reactivar equipo',
    mensaje: '¿Reactivar este equipo? Volverá a estar disponible.',
    confirmarLabel: 'Reactivar',
    destructivo: false,
  };
}

function pedirRecuperar(equipo) {
  accionPendiente.value = {
    equipo,
    estado: 'operativo',
    estadoLabel: 'Operativo',
    titulo: 'Marcar como recuperado',
    mensaje: '¿Marcar este equipo como recuperado? Volverá a estar disponible.',
    confirmarLabel: 'Marcar recuperado',
    destructivo: false,
  };
}

async function confirmarAccionPendiente() {
  const a = accionPendiente.value;
  if (!a) return;
  procesandoAccion.value = true;
  try {
    await store.cambiarEstado(a.equipo.id, a.estado);
    showToast(`${a.equipo.codigo} → ${a.estadoLabel}`);
    dialogoAccion.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al cambiar estado', 'error');
  } finally {
    procesandoAccion.value = false;
  }
}

// ── Acta de entrega imprimible ────────────────────────────────
async function imprimirActa(equipo) {
  try {
    const empleado = await insforgeApi.getEmpleado(equipo.empleado_id);
    if (!empleado) throw new Error('No se encontró al empleado');
    generarActa(equipo, empleado);
  } catch (e) {
    showToast(e?.message || 'Error al generar el acta', 'error');
  }
}

// ── Hoja de vida ──────────────────────────────────────────────
const mostrarHoja = ref(false);
const equipoHoja = ref(null);
const eventos = ref([]);
const cargandoEventos = ref(false);

const EVENTO_ICONS = {
  registrado: 'ti ti-plus',
  asignado: 'ti ti-user-plus',
  devuelto: 'ti ti-arrow-back-up',
  estado_cambiado: 'ti ti-refresh',
};

// Foco atrapado por modal inline (Fase 4): cada uno sigue su flag de
// apertura; al cerrarse, el foco vuelve al botón que lo abrió
const panelAsignar = ref(null);
const panelDevolver = ref(null);
const panelMover = ref(null);
const panelHoja = ref(null);
useFocoAtrapado(panelAsignar, mostrarAsignar);
useFocoAtrapado(panelDevolver, mostrarDevolver);
useFocoAtrapado(panelMover, mostrarMover);
useFocoAtrapado(panelHoja, mostrarHoja);

async function verHoja(equipo) {
  equipoHoja.value = equipo;
  eventos.value = [];
  mostrarHoja.value = true;
  cargandoEventos.value = true;
  try {
    eventos.value = await insforgeApi.eventosEquipo(equipo.id);
  } catch (e) {
    showToast(e?.message || 'Error al cargar la hoja de vida', 'error');
    mostrarHoja.value = false;
  } finally {
    cargandoEventos.value = false;
  }
}

// ── Acciones por equipo ───────────────────────────────────────
// Fuente única de las acciones condicionales por fila: la tabla de
// escritorio las pinta como icon-btn y las tarjetas móviles como menú ⋮.
// Las condiciones `visible` replican el estado físico/derivado del equipo.
function accionesDe(eq) {
  const enAlmacen = eq.situacion === 'disponible' || eq.situacion === 'en_ubicacion';
  return [
    { icono: 'ti-user-plus', label: 'Entregar a un empleado', visible: enAlmacen, onClick: () => abrirAsignar(eq) },
    { icono: 'ti-map-pin', label: 'Mover a una ubicación', visible: enAlmacen, onClick: () => abrirMover(eq) },
    { icono: 'ti-printer', label: 'Imprimir acta de entrega', visible: eq.situacion === 'asignado', onClick: () => imprimirActa(eq) },
    { icono: 'ti-arrow-back-up', label: 'Registrar devolución', visible: eq.situacion === 'asignado', onClick: () => abrirDevolver(eq) },
    { icono: 'ti-tool', label: 'Enviar a reparación', visible: enAlmacen, onClick: () => pedirCambiarEstado(eq, 'en_reparacion', 'En reparación') },
    { icono: 'ti-circle-check', label: 'Marcar reparado (operativo)', visible: eq.situacion === 'en_reparacion', onClick: () => pedirCambiarEstado(eq, 'operativo', 'Operativo') },
    { icono: 'ti-history', label: 'Hoja de vida', onClick: () => verHoja(eq) },
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(eq) },
    {
      icono: 'ti-circle-off',
      label: 'Dar de baja el equipo',
      danger: true,
      visible: eq.situacion !== 'asignado' && eq.estado !== 'de_baja',
      onClick: () => pedirCambiarEstado(eq, 'de_baja', 'De baja'),
    },
    { icono: 'ti-refresh', label: 'Reactivar equipo', visible: eq.situacion === 'de_baja', onClick: () => pedirReactivar(eq) },
    { icono: 'ti-circle-check', label: 'Marcar como recuperado', visible: eq.situacion === 'perdido', onClick: () => pedirRecuperar(eq) },
  ];
}

function accionesVisibles(eq) {
  return accionesDe(eq).filter((a) => a.visible !== false);
}

onMounted(async () => {
  try {
    const q = busqueda.value.trim();
    if (q) {
      await store.aplicarFiltros({ q });
    } else {
      await store.cargar();
    }
  } catch {
    showToast(error.value || 'Error al cargar equipos', 'error');
  }
});
</script>

<template>
  <div class="equipos-page vista-modulo">
    <PageHeader titulo="Equipos" icono="ti ti-devices" :conteo="total">
      <template #acciones>
        <button class="btn" type="button" title="Exportar a Excel (CSV)" :disabled="exportando" @click="exportar">
          <i class="ti ti-table-export" aria-hidden="true"></i> Exportar
        </button>
        <button class="btn btn-primary" type="button" @click="abrirNuevo">
          <i class="ti ti-plus" aria-hidden="true"></i> Nuevo equipo
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input v-model="busqueda" type="text" placeholder="Buscar por código, marca, serie o portador...">
          </div>
          <select v-model="filtroTipo">
            <option value="">Todos los tipos</option>
            <option v-for="t in store.tipos" :key="t.id" :value="t.id">{{ t.nombre }}</option>
          </select>
          <select v-model="filtroSituacion">
            <option value="">Todas las situaciones</option>
            <option v-for="(s, k) in SITUACIONES_EQUIPO" :key="k" :value="k">{{ s.label }}</option>
          </select>
        </div>

        <div v-if="cargando" class="no-results">Cargando equipos...</div>
        <div v-else-if="error" class="no-results eq-error">{{ error }}</div>

        <EmptyState
          v-else-if="total === 0"
          icono="ti ti-devices"
          titulo="Sin equipos"
          :mensaje="busqueda || filtroTipo || filtroSituacion ? 'No hay resultados con los filtros aplicados.' : 'Registra el primer equipo del inventario.'"
        >
          <button v-if="!busqueda && !filtroTipo && !filtroSituacion" class="btn" type="button" @click="abrirNuevo">
            <i class="ti ti-plus"></i> Nuevo equipo
          </button>
        </EmptyState>

        <template v-else>
        <div class="table-wrap solo-escritorio">
          <table aria-label="Inventario de equipos">
            <thead>
              <tr>
                <th scope="col">Código equipo</th>
                <th scope="col">Código almacén</th>
                <th scope="col">Equipo</th>
                <th scope="col">Serie</th>
                <th scope="col" class="th-situacion">Situación</th>
                <th scope="col">Asignado a</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="eq in lista" :key="eq.id">
                <td><span class="eq-codigo">{{ eq.codigo }}</span></td>
                <td class="eq-codigo-almacen"><TextoVacio :valor="eq.codigo_almacen" /></td>
                <td>
                  <div class="eq-info">
                    <a v-if="eq.fotos.length" class="eq-foto" :href="eq.fotos[0].url" target="_blank" rel="noopener noreferrer" title="Ver foto" aria-label="Ver foto del equipo">
                      <img :src="eq.fotos[0].url" alt="">
                    </a>
                    <div>
                      <div class="user-name">{{ eq.tipo_nombre }} {{ eq.marca }}</div>
                      <span class="eq-modelo"><TextoVacio :valor="eq.modelo" />{{ eq.empresa_nombre ? ` · ${eq.empresa_nombre}` : '' }}</span>
                    </div>
                  </div>
                </td>
                <td class="eq-serie"><TextoVacio :valor="eq.serie" /></td>
                <td>
                  <span class="badge-group" :title="badgesSituacion(eq).map(b => b.label).join(' · ')">
                    <span
                      v-for="b in badgesSituacion(eq)"
                      :key="b.label"
                      class="badge"
                      :class="[b.clase, { 'badge-fisico': b.fisico }]"
                    >
                      {{ b.label }}
                    </span>
                  </span>
                </td>
                <td>
                  <template v-if="eq.portador">
                    <RouterLink class="empleado-link" :to="`/empleados/${eq.empleado_id}`">{{ eq.portador }}</RouterLink>
                    <span v-if="eq.portador_inactivo" class="badge badge--danger badge-sin-devolver" title="Este empleado fue dado de baja y no ha devuelto el equipo">
                      <i class="ti ti-alert-triangle"></i> Sin devolver
                    </span>
                  </template>
                  <span v-else-if="eq.ubicacion_nombre" class="ubicacion-nombre">
                    <i class="ti ti-map-pin"></i> {{ eq.ubicacion_nombre }}
                  </span>
                  <TextoVacio v-else />
                </td>
                <td>
                  <div class="actions">
                    <button
                      v-for="a in accionesVisibles(eq)"
                      :key="a.label"
                      class="icon-btn"
                      :class="{ danger: a.danger }"
                      type="button"
                      :title="a.label"
                      :aria-label="a.label"
                      @click="a.onClick"
                    >
                      <i class="ti" :class="a.icono"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Render móvil: misma lista paginada, como tarjetas apiladas -->
        <ul class="lista-tarjetas solo-movil" aria-label="Inventario de equipos">
          <li v-for="eq in lista" :key="eq.id" class="tarjeta-fila">
            <div class="tarjeta-fila__cab">
              <span class="eq-codigo">{{ eq.codigo }}</span>
              <a v-if="eq.fotos.length" class="eq-foto" :href="eq.fotos[0].url" target="_blank" rel="noopener noreferrer" title="Ver foto" aria-label="Ver foto del equipo">
                <img :src="eq.fotos[0].url" alt="">
              </a>
            </div>
            <div class="tarjeta-fila__principal user-name">{{ eq.tipo_nombre }} {{ eq.marca }}</div>
            <div class="tarjeta-fila__sec">
              <TextoVacio :valor="eq.modelo" />
              <template v-if="eq.empresa_nombre"><span aria-hidden="true">·</span><span>{{ eq.empresa_nombre }}</span></template>
              <template v-if="eq.serie"><span aria-hidden="true">·</span><span class="eq-serie">{{ eq.serie }}</span></template>
            </div>
            <div v-if="eq.portador || eq.ubicacion_nombre" class="tarjeta-fila__sec">
              <template v-if="eq.portador">
                <RouterLink class="empleado-link" :to="`/empleados/${eq.empleado_id}`">{{ eq.portador }}</RouterLink>
                <span v-if="eq.portador_inactivo" class="badge badge--danger badge-sin-devolver" title="Este empleado fue dado de baja y no ha devuelto el equipo">
                  <i class="ti ti-alert-triangle"></i> Sin devolver
                </span>
              </template>
              <span v-else class="ubicacion-nombre">
                <i class="ti ti-map-pin"></i> {{ eq.ubicacion_nombre }}
              </span>
            </div>
            <div class="tarjeta-fila__pie">
              <span class="badge-group" :title="badgesSituacion(eq).map(b => b.label).join(' · ')">
                <span
                  v-for="b in badgesSituacion(eq)"
                  :key="b.label"
                  class="badge"
                  :class="[b.clase, { 'badge-fisico': b.fisico }]"
                >
                  {{ b.label }}
                </span>
              </span>
              <MenuAcciones :acciones="accionesDe(eq)" :label="`Acciones de ${eq.codigo}`" />
            </div>
          </li>
        </ul>

        <Pagination v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </template>
      </div>
    </main>

    <EquipoForm v-if="mostrarForm" :equipo="equipoEditar" @cerrar="onFormCerrado" />

    <!-- Modal: entregar equipo -->
    <Transition name="modal-anim">
    <div v-if="mostrarAsignar" class="modal-bg">
      <div ref="panelAsignar" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="asignar-title" tabindex="-1">
        <div class="modal-title">
          <span id="asignar-title"><i class="ti ti-user-plus" aria-hidden="true"></i> Entregar {{ equipoAsignar?.codigo }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="mostrarAsignar = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p class="modal-info">{{ equipoAsignar?.tipo_nombre }} {{ equipoAsignar?.marca }} {{ equipoAsignar?.modelo }}</p>

          <div class="form-group">
            <label for="asig-emp">Empleado *</label>
            <BuscadorEmpleado id="asig-emp" v-model="empleadoSelId" :empleados="empleadosActivos" :disabled="procesando" />
          </div>

          <div class="form-group">
            <label for="asig-cond">Condición de entrega</label>
            <input id="asig-cond" v-model="condicionEntrega" placeholder="ej: nuevo, con cargador y mochila" :disabled="procesando">
          </div>

        </div>

        <p v-if="errorAsignar" class="form-error" role="alert">{{ errorAsignar }}</p>

        <div class="modal-actions">
          <button class="btn" type="button" :disabled="procesando" @click="mostrarAsignar = false">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="procesando || !empleadoSelId" @click="confirmarAsignar">
            {{ procesando ? 'Entregando...' : 'Entregar' }}
          </button>
        </div>
      </div>
    </div>
    </Transition>

    <!-- Modal: registrar devolución -->
    <Transition name="modal-anim">
    <div v-if="mostrarDevolver" class="modal-bg">
      <div ref="panelDevolver" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="devolver-title" tabindex="-1">
        <div class="modal-title">
          <span id="devolver-title"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Devolución de {{ equipoDevolver?.codigo }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="mostrarDevolver = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p class="modal-info">Lo tiene: <strong>{{ equipoDevolver?.portador }}</strong></p>

          <div class="form-group">
            <label for="dev-cond">Condición en que vuelve *</label>
            <input id="dev-cond" v-model="condicionDevolucion" required placeholder="ej: operativo / pantalla rota / sin cargador" :disabled="procesando">
          </div>

          <div class="form-group">
            <label for="dev-motivo">Motivo</label>
            <select id="dev-motivo" v-model="motivoCierre" :disabled="procesando">
              <option value="devolucion">Devolución normal</option>
              <option value="cambio_equipo">Cambio de equipo</option>
              <option value="baja_empleado">Baja del empleado</option>
              <option value="perdida">Pérdida / robo</option>
            </select>
          </div>

          <label class="check-reparacion" :class="{ 'check-reparacion--disabled': motivoCierre === 'perdida' }">
            <input v-model="aReparacion" type="checkbox" :disabled="procesando || motivoCierre === 'perdida'">
            Volvió dañado — enviarlo a reparación
          </label>
          <p v-if="motivoCierre === 'perdida'" class="check-reparacion-hint">
            No aplica si el equipo se reporta como perdido/robado.
          </p>

        </div>

        <div class="modal-actions">
          <button class="btn" type="button" :disabled="procesando" @click="mostrarDevolver = false">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="procesando || !condicionDevolucion.trim()" @click="confirmarDevolver">
            {{ procesando ? 'Registrando...' : 'Registrar devolución' }}
          </button>
        </div>
      </div>
    </div>
    </Transition>

    <!-- Modal: mover a ubicación -->
    <Transition name="modal-anim">
    <div v-if="mostrarMover" class="modal-bg">
      <div ref="panelMover" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="mover-title" tabindex="-1">
        <div class="modal-title">
          <span id="mover-title"><i class="ti ti-map-pin" aria-hidden="true"></i> Mover {{ equipoMover?.codigo }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="mostrarMover = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p class="modal-info">
            {{ equipoMover?.tipo_nombre }} {{ equipoMover?.marca }} {{ equipoMover?.modelo }}
            <template v-if="equipoMover?.ubicacion_nombre"> — hoy en <strong>{{ equipoMover?.ubicacion_nombre }}</strong></template>
          </p>

          <div class="form-group">
            <label for="mov-ubicacion">Ubicación destino *</label>
            <select id="mov-ubicacion" v-model="ubicacionSelId" :disabled="procesando">
              <option value="" disabled>Seleccionar ubicación</option>
              <option v-for="u in store.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
            </select>
          </div>

          <div class="form-group">
            <label for="mov-nueva">¿No existe? Créala aquí</label>
            <div class="nueva-ubicacion">
              <input
                id="mov-nueva"
                v-model="nuevaUbicacion"
                placeholder="ej: Oficina Contabilidad, Obra San Isidro..."
                :disabled="procesando"
                @keydown.enter.prevent="agregarUbicacion"
              >
              <button class="btn" type="button" :disabled="procesando || !nuevaUbicacion.trim()" @click="agregarUbicacion">
                Crear
              </button>
            </div>
          </div>

        </div>

        <div class="modal-actions">
          <button class="btn" type="button" :disabled="procesando" @click="mostrarMover = false">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="procesando || !ubicacionSelId" @click="confirmarMover">
            {{ procesando ? 'Moviendo...' : 'Mover' }}
          </button>
        </div>
      </div>
    </div>
    </Transition>

    <!-- Modal: hoja de vida -->
    <Transition name="modal-anim">
    <div v-if="mostrarHoja" class="modal-bg" @click.self="mostrarHoja = false">
      <div ref="panelHoja" class="modal modal-detail" role="dialog" aria-modal="true" aria-labelledby="hoja-title" tabindex="-1">
        <div class="modal-title">
          <span id="hoja-title"><i class="ti ti-history" aria-hidden="true"></i> Hoja de vida — {{ equipoHoja?.codigo }}</span>
          <button class="icon-btn" type="button" aria-label="Cerrar" @click="mostrarHoja = false"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p class="modal-info">{{ equipoHoja?.tipo_nombre }} {{ equipoHoja?.marca }} {{ equipoHoja?.modelo }}</p>
          <span
            v-if="equipoHoja"
            class="badge-group"
            :title="badgesSituacion(equipoHoja).map(b => b.label).join(' · ')"
          >
            <span
              v-for="b in badgesSituacion(equipoHoja)"
              :key="b.label"
              class="badge"
              :class="[b.clase, { 'badge-fisico': b.fisico }]"
            >
              {{ b.label }}
            </span>
          </span>
          <div v-if="cargandoEventos" class="no-results">Cargando...</div>
          <ul v-else class="hoja-lista">
            <li v-for="ev in eventos" :key="ev.id">
              <i :class="EVENTO_ICONS[ev.evento] || 'ti ti-point'"></i>
              <div class="hoja-info">
                <span class="hoja-detalle">{{ ev.detalle }}</span>
                <span class="hoja-meta">{{ formatFechaHora(ev.created_at) }}{{ ev.user_email ? ` · ${ev.user_email}` : '' }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
    </Transition>

    <!-- Confirmación (ConfirmDialog compartido): "de_baja" y "eliminar" son
         destructivas (btn-danger); las demás transiciones usan el botón
         primario, igual que "renovar" en Licencias. -->
    <ConfirmDialog
      v-if="accionPendiente"
      ref="dialogoAccion"
      :destructivo="destructivoAccion"
      icono="ti-trash"
      :titulo="tituloAccion"
      :mensaje="mensajeAccion"
      :confirmar-label="confirmarLabelAccion"
      :cargando="procesandoAccion"
      @cancel="accionPendiente = null"
      @confirm="confirmarAccionPendiente"
    />
  </div>
</template>

<style scoped>
.eq-error { color: var(--color-danger); }

/* Datos uniformes: solo cambia la familia (mono para identificadores),
   nunca el peso/tamaño/color */
.eq-codigo {
  font-family: var(--font-mono, monospace);
}

.eq-codigo-almacen {
  font-family: var(--font-mono, monospace);
  color: var(--color-text-secondary);
}

.eq-modelo {
  display: block;
}

.eq-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.eq-foto {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.eq-foto img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.eq-serie {
  font-family: var(--font-mono, monospace);
}

/* Estructura y color: sistema de badges global (.badge + .badge--X) */

/* Columna Situación: ancho mínimo para que el badge doble (físico +
   derivado) no se corte. En pantallas chicas, si no entra, se prioriza
   el estado derivado (el físico queda accesible en el title del grupo). */
.th-situacion { min-width: 168px; }

@media (max-width: 900px) {
  .badge-fisico { display: none; }
}

.ubicacion-nombre {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Solo el icono conserva el color de la familia "ubicaciones" */
.ubicacion-nombre i { color: var(--color-purple-text); }

.nueva-ubicacion {
  display: flex;
  gap: 6px;
}

.nueva-ubicacion input { flex: 1; }

.badge-sin-devolver {
  /* Estructura y color: sistema de badges global (.badge + .badge--danger);
     aquí solo el ajuste único de este chip: separación del texto vecino.
     Sin peso extra: 700 se reserva para stat cards y wordmark (Materen Core #fundaciones). */
  margin-left: 6px;
}

/* Anchos: .modal-sm / .modal-detail de la escala centralizada (main.css) */

.modal-title { display: flex; align-items: center; justify-content: space-between; }

.modal-body {
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-info {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.check-reparacion {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
}

.check-reparacion--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.check-reparacion-hint {
  margin: 2px 0 0 24px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* Hoja de vida */
.hoja-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.hoja-lista li {
  display: flex;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--color-border);
}

.hoja-lista li:last-child { border-bottom: none; }

.hoja-lista li > i {
  font-size: 16px;
  color: var(--color-primary);
  margin-top: 1px;
  flex-shrink: 0;
}

.hoja-info { display: flex; flex-direction: column; min-width: 0; }
.hoja-detalle { font-size: 13px; color: var(--color-text-primary); }
.hoja-meta { font-size: 11.5px; color: var(--color-text-secondary); }
</style>
