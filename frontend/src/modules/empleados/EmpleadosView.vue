<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter, useRoute } from 'vue-router';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { altaIncompleta } from '../../core/dominio-empleados.js';
import { fechaLocalISO } from '../../core/formatters.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { enviarCredencialesWhatsApp } from '../../core/entregas.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto } from '../../core/dominio-empleados.js';
import { tonoAvatar, inicialesDe } from '../../core/avatar.js';
import EmpleadoForm from './EmpleadoForm.vue';
import BajaEmpleadoModal from './BajaEmpleadoModal.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';
import { columnasVisibles, estiloColumna } from '../../core/tablaColumnas.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';

const router = useRouter();
const route = useRoute();
const store = useEmpleadosStore();
const auth = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

// Definición de columnas de la tabla nativa, densidad `lg` (vista insignia,
// ver template): mobile nunca pasa por esta tabla porque ya tiene su propia
// grilla real de tarjetas (vista "Tarjetas" de arriba, que también sirve de
// fallback móvil) — una tarjeta por columna hubiera sido una segunda
// tarjeta redundante.
const columnasEmpleados = [
  { clave: 'apellidos', label: 'Nombre', ordenable: true, elastica: true },
  { clave: 'cargo', label: 'Cargo', ordenable: true },
  { clave: 'empresa_nombre', label: 'Empresa' },
  { clave: 'vinculos', label: 'Vínculos' },
  { clave: 'estado', label: 'Estado', ordenable: true },
  { clave: 'acciones', label: 'Acciones', ancho: '176px' },
];
const columnasVisiblesLista = computed(() => columnasVisibles(columnasEmpleados));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);

// ── Selector Tabla/Tarjetas (FASE 4) ────────────────────────────────────
// "Lista con avatar" queda pendiente como 3ª opción (falta el mockup de
// proporciones) — sigue siendo distinta de "Tarjetas": esa sería una lista
// angosta de una columna (como la tarjeta angosta de Triage en Tickets),
// "Tarjetas" es una grilla de tarjetas reales (ver más abajo, corregido en
// esta pasada — antes reusaba el mismo `.tarjeta-fila` de fila compacta que
// el fallback móvil, así que en escritorio se veía como una lista de filas
// angosta, no como tarjetas). Mobile siempre muestra tarjetas sin importar
// la preferencia (ya era así antes de que este selector existiera) — ver
// el v-if de las tarjetas y de la tabla más abajo, que se resuelven contra
// `esMovil` además de contra `vista`.
const OPCIONES_VISTA_EMPLEADOS = [
  { valor: 'tabla', icono: 'ti-table', label: 'Tabla' },
  { valor: 'tarjetas', icono: 'ti-id', label: 'Tarjetas' },
];
const { esMovil } = useEsMovil();
const { vista } = useVistaModulo('empleados', ['tabla', 'tarjetas']);

useRealtimeRefresco('empleados:list', () => store.cargar(), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });
// Precarga desde el link del Dashboard (ej. /empleados?estado=Inactivo);
// sin query entrante arranca en Activo — ver activos e inactivos mezclados
// por defecto era el problema reportado (ago 2026).
const filtroEstado = ref(route.query.estado || 'Activo');
const filtroUbicacion = ref('');
const ubicaciones = ref([]);
// El chip de cuentas de la fila ya distinguía "0 cuentas" con un tono
// apagado, pero cero cuentas no significa lo mismo en todos lados: en alguien
// que entró la semana pasada es un alta a medias, y en alguien de hace dos
// años es sencillamente cómo trabaja. Misma regla que alimenta el feed de
// pendientes del Dashboard (core/dominio-empleados.js) — el chip solo cambia
// de significado, no se agrega ningún elemento nuevo a la fila.
function altaPendiente(emp) {
  return !!altaIncompleta(emp, { cuentas: emp.n_cuentas ?? 0 }, fechaLocalISO());
}

function tituloCuentas(emp) {
  const base = `${emp.n_cuentas} cuenta(s) activa(s)`;
  return altaPendiente(emp) ? `${base} — alta sin completar` : base;
}

const mostrarForm = ref(false);
const empleadoEditar = ref(null);

const estados = ['Activo', 'Inactivo', 'Suspendido'];

// Búsqueda y filtros viajan al servidor (paginación server-side):
// la búsqueda con debounce, los selects al instante.
watch(filtroEstado, (estado) => store.aplicarFiltros({ estado }));
watch(filtroUbicacion, (ubicacionId) => store.aplicarFiltros({ ubicacionId }));

const paginaActual = computed({
  get: () => store.pagina,
  set: (p) => store.irAPagina(p),
});

const totalPaginas = computed(() => totalPaginasDe(total.value, store.tamPagina));
const paginas = computed(() => paginasDe(totalPaginas.value));
const desde = computed(() => rangoDe(paginaActual.value, store.tamPagina, total.value).desde);
const hasta = computed(() => rangoDe(paginaActual.value, store.tamPagina, total.value).hasta);
function irA(pagina) {
  const destino = clampPagina(pagina, totalPaginas.value);
  if (destino !== store.pagina) store.irAPagina(destino);
}

// Exporta el dataset filtrado COMPLETO (el servidor solo tiene la página)
const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'empleados',
      ['Nombres', 'Apellidos', 'DNI', 'Empresa', 'Área/Obra', 'Ubicación', 'Cargo', 'Estado', 'Fecha alta', 'WhatsApp', 'Correo personal'],
      filas.map((e) => [
        e.nombres, e.apellidos, e.dni, e.empresa_nombre, e.area_obra_nombre, e.ubicacion_nombre, e.cargo,
        e.estado, e.fecha_alta, e.whatsapp, e.correo_personal,
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// ── Enviar credenciales sin entrar al perfil ──────────────────────
// Mismo flujo que el botón de WhatsApp en la ficha (CuentasPanel):
// enlace de entrega de un solo uso con TODAS las cuentas del empleado.
const enviandoCredsId = ref(null);

async function enviarCredenciales(emp) {
  if (enviandoCredsId.value) return;
  enviandoCredsId.value = emp.id;
  try {
    const cuentas = await insforgeApi.listCuentasPorEmpleado(emp.id);
    if (!cuentas.length) {
      showToast(`${nombreCompleto(emp)} no tiene cuentas registradas`, 'error');
      return;
    }
    await enviarCredencialesWhatsApp({
      empleadoId: emp.id,
      empleadoNombre: nombreCompleto(emp),
      whatsapp: emp.whatsapp,
      cuentaIds: cuentas.map((c) => c.cuenta_id),
    });
  } catch (e) {
    showToast(e?.message || 'Error al crear la entrega', 'error');
  } finally {
    enviandoCredsId.value = null;
  }
}

function abrirNuevo() {
  empleadoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(empleado) {
  empleadoEditar.value = empleado;
  mostrarForm.value = true;
}

function cerrarForm() {
  mostrarForm.value = false;
  empleadoEditar.value = null;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!empleadoEditar.value;
  cerrarForm();
  if (!guardado) return;
  if (fueEdicion) {
    showToast('Empleado actualizado');
  } else {
    // Alta guiada: llevar a la ficha del nuevo empleado para asignarle accesos
    router.push(`/empleados/${guardado.id}?nuevo=1`);
  }
}

function verFicha(empleado) {
  router.push(`/empleados/${empleado.id}`);
}

const empleadoBaja = ref(null);

function darDeBaja(empleado) {
  if (empleado.estado === 'Inactivo') return;
  empleadoBaja.value = empleado;
}

function onBajaCerrada() {
  empleadoBaja.value = null;
}

// Acciones por fila para el menú ⋮ de las tarjetas móviles — mismas
// condiciones que los icon-btn de la tabla de escritorio.
function accionesDe(emp) {
  return [
    { icono: 'ti-eye', label: 'Ver ficha', onClick: () => verFicha(emp) },
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(emp) },
    {
      icono: 'ti-brand-whatsapp',
      label: 'Enviar credenciales por WhatsApp',
      disabled: enviandoCredsId.value === emp.id || !auth.puedeVerCredenciales,
      onClick: () => enviarCredenciales(emp),
    },
    {
      icono: 'ti-user-off',
      label: 'Dar de baja',
      danger: true,
      visible: emp.estado !== 'Inactivo',
      onClick: () => darDeBaja(emp),
    },
  ];
}

onMounted(async () => {
  try {
    ubicaciones.value = await insforgeApi.listUbicaciones();
  } catch {
    // El filtro de ubicación queda vacío si falla — no rompe el listado.
  }
  try {
    // route.query.estado (no filtroEstado.value: ese ref siempre trae un
    // valor por el fallback 'Activo' de la línea de arriba, así que nunca
    // detectaría "no hay query entrante") — condición real de si llegó un
    // deep link del Dashboard. Sin resetear en ese caso, `q` (búsqueda de
    // texto) quedaba pegado en el store entre montajes: la caja se veía
    // vacía (useBusqueda nace limpio) pero el filtro seguía aplicado al
    // volver a Empleados desde otro módulo (bug reportado ago 2026).
    if (route.query.estado) {
      await store.aplicarFiltros({ estado: filtroEstado.value });
    } else {
      store.resetearFiltros();
      await store.cargar();
    }
  } catch {
    showToast(error.value || 'Error al cargar empleados', 'error');
  }
});
</script>

<template>
  <div class="empleados-page vista-modulo">
    <PageHeader titulo="Empleados" icono="ti ti-users" :conteo="total">
      <template #acciones>
        <SelectorVista v-model="vista" :opciones="OPCIONES_VISTA_EMPLEADOS" class="solo-escritorio" />
        <button
          type="button"
          class="btn btn--secondary"
          title="Exportar a Excel (CSV)"
          :disabled="exportando"
          @click="exportar"
        >
          <span class="btn__label">{{ exportando ? 'Exportando...' : 'Exportar' }}</span>
          <i v-if="exportando" class="ti ti-loader-2 btn__icono--girando" aria-hidden="true"></i>
          <i v-else class="ti ti-table-export" aria-hidden="true"></i>
        </button>
        <button type="button" class="btn btn--primary" @click="abrirNuevo">
          Nuevo empleado
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input
              v-model="busqueda"
              type="text"
              placeholder="Buscar por nombre o DNI..."
              aria-label="Buscar empleados"
            >
          </div>
          <div class="filter-field">
            <label for="filtro-estado">Estado</label>
            <select id="filtro-estado" v-model="filtroEstado">
              <option value="">Todos los estados</option>
              <option v-for="est in estados" :key="est" :value="est">{{ est }}</option>
            </select>
          </div>
          <div class="filter-field">
            <label for="filtro-ubicacion">Ubicación</label>
            <select id="filtro-ubicacion" v-model="filtroUbicacion">
              <option value="">Todas las ubicaciones</option>
              <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
            </select>
          </div>
        </div>

        <div v-if="cargando" class="no-results solo-movil">Cargando empleados...</div>

        <div v-else-if="error" class="no-results empleados-error">{{ error }}</div>

        <EmptyState
          v-else-if="total === 0"
          icono="ti ti-users"
          titulo="Sin empleados"
          :mensaje="busqueda || filtroEstado ? 'No hay resultados con los filtros aplicados.' : 'Agregue el primer empleado al inventario.'"
        >
          <button v-if="!busqueda && !filtroEstado" type="button" class="btn btn--secondary" @click="abrirNuevo">
            Agregar empleado
            <i class="ti ti-plus" aria-hidden="true"></i>
          </button>
        </EmptyState>

        <template v-if="!error && (cargando || total > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando empleados…</p>
        <div v-if="vista === 'tabla' && !esMovil" class="tabla-envoltorio">
          <table class="tabla tabla--lg" aria-label="Inventario de empleados">
            <thead>
              <tr>
                <template v-for="col in columnasVisiblesLista" :key="col.clave">
                  <ThOrdenable
                    v-if="col.ordenable"
                    :clave="col.clave"
                    :columna="ordenColumna"
                    :direccion="ordenDireccion"
                    :class="{ 'col-num': col.num }"
                    :style="estiloColumna(col)"
                    @ordenar="store.ordenarPor(col.clave)"
                  >{{ col.label }}</ThOrdenable>
                  <th v-else scope="col" :class="{ 'col-num': col.num }" :style="estiloColumna(col)">{{ col.label }}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="totalColumnas" />
              <tr v-else-if="!lista.length">
                <td :colspan="totalColumnas" class="tabla__vacio">
                  <EmptyState icono="ti ti-inbox" titulo="Sin resultados" />
                </td>
              </tr>
              <template v-else>
                <tr v-for="fila in lista" :key="fila.id" class="fila-empleado" @click="verFicha(fila)">
                  <td>
                    <!-- DNI + Nombre colapsan (mismo criterio que Tickets):
                         identificador arriba en gris chico, dato principal abajo. -->
                    <div class="celda-apilada">
                      <span class="celda-apilada__meta">{{ fila.dni }}</span>
                      <span class="celda-apilada__principal">{{ nombreCompleto(fila) }}</span>
                    </div>
                  </td>
                  <td>
                    <TextoVacio :valor="fila.cargo" />
                  </td>
                  <td>
                    <TextoVacio :valor="fila.empresa_nombre" />
                  </td>
                  <td>
                    <div v-if="fila.n_cuentas != null" class="vinculos">
                      <span
                        class="vinculo"
                        :class="{ 'vinculo--cero': !fila.n_cuentas, 'vinculo--pendiente': altaPendiente(fila) }"
                        :title="tituloCuentas(fila)"
                        :aria-label="tituloCuentas(fila)"
                      >
                        <i class="ti ti-key" aria-hidden="true"></i>{{ fila.n_cuentas }}
                      </span>
                      <span
                        class="vinculo"
                        :class="{ 'vinculo--cero': !fila.n_equipos }"
                        :title="`${fila.n_equipos} equipo(s) asignado(s)`"
                        :aria-label="`${fila.n_equipos} equipo(s) asignado(s)`"
                      >
                        <i class="ti ti-devices" aria-hidden="true"></i>{{ fila.n_equipos }}
                      </span>
                      <span
                        class="vinculo"
                        :class="{ 'vinculo--cero': !fila.n_licencias }"
                        :title="`${fila.n_licencias} licencia(s) directa(s)`"
                        :aria-label="`${fila.n_licencias} licencia(s) directa(s)`"
                      >
                        <i class="ti ti-license" aria-hidden="true"></i>{{ fila.n_licencias }}
                      </span>
                    </div>
                    <TextoVacio v-else />
                  </td>
                  <td>
                    <BadgeEstado tipo="empleado" :valor="fila.estado" status />
                  </td>
                  <td>
                    <div class="actions" @click.stop>
                      <button
                        class="icon-btn fila-accion"
                        type="button"
                        title="Ver ficha"
                        aria-label="Ver ficha"
                        @click="verFicha(fila)"
                      >
                        <i class="ti ti-eye"></i>
                      </button>
                      <button
                        class="icon-btn fila-accion"
                        type="button"
                        title="Editar"
                        aria-label="Editar"
                        @click="abrirEditar(fila)"
                      >
                        <i class="ti ti-pencil"></i>
                      </button>
                      <button
                        class="icon-btn fila-accion"
                        type="button"
                        :title="auth.puedeVerCredenciales ? 'Enviar credenciales por WhatsApp' : 'Sin permiso para ver contraseñas'"
                        aria-label="Enviar credenciales por WhatsApp"
                        :disabled="enviandoCredsId === fila.id || !auth.puedeVerCredenciales"
                        @click="enviarCredenciales(fila)"
                      >
                        <i :class="enviandoCredsId === fila.id ? 'ti ti-loader-2 spinner-icon' : 'ti ti-brand-whatsapp'"></i>
                      </button>
                      <button
                        v-if="fila.estado !== 'Inactivo'"
                        class="icon-btn danger fila-accion"
                        type="button"
                        title="Dar de baja"
                        aria-label="Dar de baja"
                        @click="darDeBaja(fila)"
                      >
                        <i class="ti ti-user-off"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Tarjetas no tiene un equivalente propio de SkeletonTabla (esa
             es la del modo Tabla) — mismo texto genérico que ya usa mobile
             mientras carga, mostrado acá también cuando la vista elegida
             en escritorio es Tarjetas (mobile ya lo cubre el div de
             arriba, .solo-movil). -->
        <div v-if="cargando && vista === 'tarjetas' && !esMovil" class="no-results">Cargando empleados...</div>

        <!-- Tarjetas: vista de escritorio elegida por el usuario, o mobile
             sin importar la preferencia (mobile nunca muestra tabla).
             Grilla real de tarjetas (pasada de diseño ago 2026) — antes
             reusaba `.tarjeta-fila`, la fila compacta del fallback móvil de
             OTROS módulos, así que en escritorio se leía como una lista de
             filas angosta, no como tarjetas. `.lista-tarjetas` se mantiene
             en el `<ul>` a propósito (no se retira): es lo que le da el
             scroll-container correcto dentro de `.card--fill` (main.css);
             `.emp-tarjetas` solo agrega el `display:grid` encima, sin pisar
             esa regla compartida. La grilla responsive
             (`repeat(auto-fill, minmax(260px,1fr))`) no necesita una
             media query aparte para mobile: con un solo viewport angosto ya
             entra 1 sola columna, mismo criterio que el resto del sistema
             evita breakpoints redundantes cuando el layout ya resuelve
             solo. -->
        <ul v-if="!cargando && (vista === 'tarjetas' || esMovil)" class="lista-tarjetas emp-tarjetas" aria-label="Inventario de empleados">
          <li v-for="emp in lista" :key="emp.id" class="card card--clicable emp-card" @click="verFicha(emp)">
            <div class="emp-card__cab">
              <span class="avatar sm" :class="tonoAvatar(nombreCompleto(emp))" aria-hidden="true">{{ inicialesDe(nombreCompleto(emp)) }}</span>
              <div class="emp-card__id">
                <span class="emp-card__nombre">{{ nombreCompleto(emp) }}</span>
                <span class="emp-card__dni">{{ emp.dni }}</span>
              </div>
              <MenuAcciones :acciones="accionesDe(emp)" :label="`Acciones de ${nombreCompleto(emp)}`" />
            </div>

            <div v-if="emp.cargo || emp.empresa_nombre" class="emp-card__sec">
              <template v-if="emp.cargo">{{ emp.cargo }}</template>
              <span v-if="emp.cargo && emp.empresa_nombre" aria-hidden="true"> · </span>
              <template v-if="emp.empresa_nombre">{{ emp.empresa_nombre }}</template>
            </div>

            <div class="emp-card__pie">
              <BadgeEstado tipo="empleado" :valor="emp.estado" status />
              <div v-if="emp.n_cuentas != null" class="vinculos vinculos--tarjeta">
                <span class="vinculo" :class="{ 'vinculo--cero': !emp.n_cuentas, 'vinculo--pendiente': altaPendiente(emp) }" :title="tituloCuentas(emp)" :aria-label="tituloCuentas(emp)">
                  <i class="ti ti-key" aria-hidden="true"></i>{{ emp.n_cuentas }}
                </span>
                <span class="vinculo" :class="{ 'vinculo--cero': !emp.n_equipos }" :title="`${emp.n_equipos} equipo(s) asignado(s)`" :aria-label="`${emp.n_equipos} equipo(s) asignado(s)`">
                  <i class="ti ti-devices" aria-hidden="true"></i>{{ emp.n_equipos }}
                </span>
                <span class="vinculo" :class="{ 'vinculo--cero': !emp.n_licencias }" :title="`${emp.n_licencias} licencia(s) directa(s)`" :aria-label="`${emp.n_licencias} licencia(s) directa(s)`">
                  <i class="ti ti-license" aria-hidden="true"></i>{{ emp.n_licencias }}
                </span>
              </div>
            </div>
          </li>
        </ul>

        <nav v-if="!cargando && total > 0" class="paginacion" aria-label="Paginación">
          <div class="paginacion__lado">
            <label class="paginacion__campo">
              <span>Filas por página:</span>
              <select
                class="paginacion__select"
                :value="store.tamPagina"
                @change="store.cambiarTamPagina(Number($event.target.value))"
              >
                <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <span class="paginacion__rango">{{ desde }}–{{ hasta }} de {{ total }} empleados</span>
          </div>

          <div v-if="totalPaginas > 1" class="paginacion__lado">
            <label class="paginacion__campo">
              <span class="sr-only">Ir a la página</span>
              <select class="paginacion__select" :value="paginaActual" @change="irA(Number($event.target.value))">
                <option v-for="p in paginas" :key="p" :value="p">{{ p }}</option>
              </select>
              <span>de {{ totalPaginas }}</span>
            </label>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual <= 1" aria-label="Página anterior" @click="irA(paginaActual - 1)">
              <i class="ti ti-chevron-left" aria-hidden="true"></i>
            </button>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual >= totalPaginas" aria-label="Página siguiente" @click="irA(paginaActual + 1)">
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </nav>
        </template>
      </div>
    </main>

    <EmpleadoForm
      v-if="mostrarForm"
      :empleado="empleadoEditar"
      @cerrar="onFormCerrado"
    />

    <BajaEmpleadoModal
      v-if="empleadoBaja"
      :empleado="empleadoBaja"
      @cerrar="onBajaCerrada"
    />
  </div>
</template>


