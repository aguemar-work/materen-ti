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
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SelectorVista from '../../components/shared/SelectorVista.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import { useVistaModulo } from '../../composables/useVistaModulo.js';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const router = useRouter();
const route = useRoute();
const store = useEmpleadosStore();
const auth = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

// Definición de columnas de CarbonDataTable, densidad `lg` (vista insignia,
// ver template): mobile nunca pasa por acá (`:con-tarjetas="false"`) porque
// ya tiene su propia grilla real de tarjetas (vista "Tarjetas" de arriba,
// que también sirve de fallback móvil) — la tarjeta que arma CarbonDataTable
// por columna hubiera sido una segunda tarjeta redundante.
const columnasEmpleados = [
  { clave: 'apellidos', label: 'Nombre', ordenable: true, elastica: true },
  { clave: 'cargo', label: 'Cargo', ordenable: true },
  { clave: 'empresa_nombre', label: 'Empresa' },
  { clave: 'vinculos', label: 'Vínculos' },
  { clave: 'estado', label: 'Estado', ordenable: true },
  { clave: 'acciones', label: 'Acciones', ancho: '176px' },
];

// Fila entera clicable (va a la ficha) — mismo patrón que KbView.vue: la
// clase se pinta en el scope de CarbonDataTable, así que el estilo abajo
// necesita :deep().
function claseFilaEmpleado() {
  return 'fila-empleado';
}

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
        <CarbonButton variante="secondary" icono="ti-table-export" :cargando="exportando" title="Exportar a Excel (CSV)" @click="exportar">
          {{ exportando ? 'Exportando...' : 'Exportar' }}
        </CarbonButton>
        <CarbonButton variante="primary" icono="ti-plus" @click="abrirNuevo">Nuevo empleado</CarbonButton>
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
          <CarbonButton v-if="!busqueda && !filtroEstado" variante="secondary" icono="ti-plus" @click="abrirNuevo">Agregar empleado</CarbonButton>
        </EmptyState>

        <template v-if="!error && (cargando || total > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando empleados…</p>
        <CarbonDataTable
          v-if="vista === 'tabla' && !esMovil"
          :columnas="columnasEmpleados"
          :filas="lista"
          :cargando="cargando"
          densidad="lg"
          :orden-por="ordenColumna"
          :orden-dir="ordenDireccion"
          :con-tarjetas="false"
          :clase-fila="claseFilaEmpleado"
          etiqueta="Inventario de empleados"
          @ordenar="store.ordenarPor"
          @clic-fila="verFicha"
        >
          <template #celda-apellidos="{ fila }">
            <!-- DNI + Nombre colapsan (mismo criterio que Tickets):
                 identificador arriba en gris chico, dato principal abajo. -->
            <div class="celda-apilada">
              <span class="celda-apilada__meta">{{ fila.dni }}</span>
              <span class="celda-apilada__principal">{{ nombreCompleto(fila) }}</span>
            </div>
          </template>
          <template #celda-cargo="{ valor }">
            <TextoVacio :valor="valor" />
          </template>
          <template #celda-empresa_nombre="{ valor }">
            <TextoVacio :valor="valor" />
          </template>
          <template #celda-vinculos="{ fila }">
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
          </template>
          <template #celda-estado="{ fila }">
            <BadgeEstado tipo="empleado" :valor="fila.estado" status />
          </template>
          <template #celda-acciones="{ fila }">
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
          </template>
        </CarbonDataTable>

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

        <CarbonPagination
          v-if="!cargando"
          v-model="paginaActual"
          :total-items="total"
          :tam-pagina="store.tamPagina"
          :tamanos-pagina="TAMANOS_PAGINA"
          unidad="empleados"
          @update:tam-pagina="store.cambiarTamPagina"
        />
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

<style scoped>
.empleados-error { color: var(--color-danger); }

/* :deep() porque CarbonDataTable renderiza el <tr> en su propio ámbito de
   scope (vía claseFila) — un selector scoped normal acá nunca lo alcanza.
   Mismo patrón que KbView.vue. */
:deep(.fila-empleado) { cursor: pointer; }
:deep(.fila-empleado:hover td) { background: var(--color-bg-hover, var(--color-bg-subtle)); }

/* Conteos de cuentas/equipos: dato secundario, no badge (no es estado) */
.vinculos {
  display: flex;
  align-items: center;
  gap: 14px;
}

.vinculo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-secondary);
}

.vinculo i { font-size: var(--icon-sm); }

.vinculo--cero { color: var(--color-text-tertiary); }

/* Cero cuentas EN ALGUIEN QUE ACABA DE ENTRAR: no es información neutra, es
   trabajo pendiente. Gana el tono de atención sobre el apagado de --cero por
   orden de aparición (misma especificidad), que es lo que se busca. */
.vinculo--pendiente { color: var(--color-warning-text); }

/* Grilla real de tarjetas (ver nota larga en el template). Responsive sin
   media query: cada columna pide un mínimo de 260px, así que en una
   pantalla angosta `auto-fill` ya cae solo a 1 columna. */
.emp-tarjetas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  align-content: start;
  padding: 1rem 1.25rem;
}

.emp-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
}

.emp-card__cab {
  display: flex;
  align-items: center;
  gap: 10px;
}

.emp-card__id {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

/* Sin esto, un nombre largo compite por espacio con el disparador de
   MenuAcciones (ninguno de los dos tiene flex-shrink:0 por defecto) y el
   ícono ⋮ puede terminar deformado — el nombre ya tiene su propio
   ellipsis para ceder espacio primero. */
.emp-card__cab :deep(.icon-btn) {
  flex-shrink: 0;
}

.emp-card__nombre {
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.emp-card__dni {
  font-size: var(--fs-label-01);
  color: var(--color-text-tertiary);
  font-family: var(--font-mono, monospace);
}

.emp-card__sec {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* margin-top:auto empuja el pie al fondo de la tarjeta: las tarjetas de una
   misma fila del grid ya estiran parejo (comportamiento default de Grid,
   align-items:stretch), así que una tarjeta con menos texto en el medio
   (sin cargo/empresa) igual alinea su pie con las de al lado. */
.emp-card__pie {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
}

/* Los 3 conteos pueden envolver en una tarjeta angosta sin romper layout
   (a diferencia de la fila de tabla, con todo el ancho disponible). */
.vinculos--tarjeta {
  flex-wrap: wrap;
  row-gap: 4px;
}
</style>
