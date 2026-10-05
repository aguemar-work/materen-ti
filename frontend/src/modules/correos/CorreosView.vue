<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useCorreosStore } from '../../stores/correos.js';
import { useAuthStore } from '../../stores/auth.js';
import { revelarPassword } from '../../api/passwords.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import EnlaceReporte from '../../components/shared/EnlaceReporte.vue';
import { showToast } from '../../core/toast.js';
import { badgeInfo } from '../../core/badges.js';
import { crearRevelado, escucharOcultamientoPorCambioDePestana } from '../../composables/useRevelado.js';
import CorreoForm from './CorreoForm.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppVistas from '../../components/ui/AppVistas.vue';
import AppFiltros from '../../components/ui/AppFiltros.vue';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import { insforgeApi } from '../../api/insforge.js';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';

const store = useCorreosStore();
const authStore = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const { esMovil } = useEsMovil();

useRealtimeRefresco('cuentas:list', () => Promise.all([store.cargar(), refrescarConteos()]), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

// ── Filtros V2: vistas + chips + URL (2026-09-25, SISTEMA-DISENO §3.2.1) ──
// La VISTA reúne los dos segmentados que había (tipo y "requieren
// rotación"): son las 4 preguntas del módulo. Plataforma es un chip.
// La búsqueda global enlaza con /correos?q=usuario@dominio.
const { filtros, limpiar, hayActivos } = useFiltrosUrl({
  vista: { tipo: 'valor', defecto: 'todos' },
  q: { tipo: 'texto' },
  plataforma: { tipo: 'lista' },
});
const CLAVES_FILTRO = ['q', 'plataforma'];
const hayFiltros = computed(() => hayActivos(CLAVES_FILTRO));

const PARAMS_VISTA = {
  todos: {},
  compartida: { tipo: 'compartida' },
  reutilizable: { tipo: 'reutilizable' },
  rotar: { soloRotacion: true },
};
const filtrosSinVista = computed(() => ({ q: filtros.q, plataformaIds: filtros.plataforma }));
const filtrosServidor = computed(() => ({
  ...filtrosSinVista.value, tipo: '', soloRotacion: false, ...(PARAMS_VISTA[filtros.vista] || {}),
}));

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => { filtros.q = q; } });
busqueda.value = filtros.q;
watch(() => filtros.q, (q) => { if (q !== busqueda.value.trim()) busqueda.value = q; });

const conteos = ref(null);
async function refrescarConteos() {
  try {
    conteos.value = await insforgeApi.conteosCorreosPorVista(filtrosSinVista.value);
  } catch {
    // Sin conteos, las pestañas se muestran igual (sin número).
  }
}

const VISTAS = computed(() => [
  { valor: 'todos', label: 'Todos', conteo: conteos.value?.todos },
  { valor: 'compartida', label: 'Compartidos', conteo: conteos.value?.compartida, titulo: 'Los usan varias personas a la vez' },
  { valor: 'reutilizable', label: 'Reutilizables', conteo: conteos.value?.reutilizable, titulo: 'Pasan de una persona a otra' },
  { valor: 'rotar', label: 'Por rotar', conteo: conteos.value?.rotar, titulo: 'Requieren cambio de contraseña' },
]);
const FRASE_VISTA = { compartida: ' compartidas', reutilizable: ' reutilizables', rotar: ' que requieren rotación' };

const plataformas = ref([]);
const DIMENSIONES = computed(() => [
  { id: 'plataforma', label: 'Plataforma', icono: 'ti ti-apps', opciones: plataformas.value.map((p) => ({ valor: p.id, label: p.nombre })) },
]);
const chips = computed({
  get: () => ({ plataforma: filtros.plataforma }),
  set: (v) => { filtros.plataforma = v.plataforma; },
});

// "Por rotar" vacío y sin filtros: es una buena noticia, no "sin resultados".
const nadaPorRotar = computed(() => filtros.vista === 'rotar' && !hayFiltros.value);
function limpiarFiltros() {
  limpiar(CLAVES_FILTRO);
  busqueda.value = '';
}

watch(filtrosServidor, (f) => { store.aplicarFiltros(f).catch(() => {}); }, { deep: true });
watch(filtrosSinVista, refrescarConteos, { deep: true });

const mostrarForm = ref(false);
const correoEditar = ref(null);
// true = el formulario se abrió desde "Rotar contraseña": entra con el foco
// en "Nueva contraseña" y un aviso de por qué (ver CorreoForm.vue).
const modoRotar = ref(false);

// El revelado de una credencial (peticion a la edge function `credenciales`,
// auditoria en accesos_log con el motivo, cuenta regresiva de 8 segundos y
// ocultado automatico) vive en composables/useRevelado.js. Esta vista solo
// declara QUE se revela — una instancia por fila, creada perezosamente.
const revelados = new Map();
function revelarDe(fila) {
  if (!revelados.has(fila.id)) {
    revelados.set(fila.id, crearRevelado({
      revelar: (motivo) => revelarPassword(fila.id, motivo),
      etiqueta: 'contraseña',
    }));
  }
  return revelados.get(fila.id);
}
// Bloqueo uniforme (no por fila): si el permiso general se cae mientras hay
// credenciales a la vista, se ocultan todas.
watch(() => authStore.puedeVerCredenciales, (puede) => {
  if (!puede) revelados.forEach((r) => r.ocultar());
});
const detenerOcultamiento = escucharOcultamientoPorCambioDePestana(() => [...revelados.values()]);
onBeforeUnmount(() => {
  detenerOcultamiento();
  revelados.forEach((r) => r.ocultar());
});

function abrirNuevo() {
  correoEditar.value = null;
  modoRotar.value = false;
  mostrarForm.value = true;
}

function abrirEditar(correo) {
  correoEditar.value = correo;
  modoRotar.value = false;
  mostrarForm.value = true;
}

// Rotar = el mismo formulario de edición (la contraseña nueva viaja por el
// mismo updateCorreo con password_cambiada, que además limpia la marca), pero
// entrando directo al campo que importa. Nunca precarga la actual.
function abrirRotar(correo) {
  correoEditar.value = correo;
  modoRotar.value = true;
  mostrarForm.value = true;
}

// Acciones por fila en el menú ⋮ (rediseño 2026-09-22: antes eran dos
// íconos sueltos). Mismas acciones que antes.
function accionesDe(fila) {
  return [
    { icono: 'ti-key', label: 'Rotar contraseña', visible: fila.requiere_rotacion, onClick: () => abrirRotar(fila) },
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(fila) },
    { separador: true },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => { porEliminar.value = fila; } },
  ];
}

// Nombres de quienes usan la cuenta, para el título de la celda "Asignado a".
function nombresAsignados(fila) {
  return (fila.asignados || []).map((a) => a.nombre).join(', ');
}

function onFormCerrado(guardado) {
  const fueEdicion = !!correoEditar.value;
  mostrarForm.value = false;
  correoEditar.value = null;
  modoRotar.value = false;
  if (guardado) showToast(fueEdicion ? 'Correo actualizado' : 'Correo compartido creado');
}

// Confirmación destructiva (ConfirmDialog compartido, tier base)
const porEliminar = ref(null);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

async function confirmarEliminar() {
  const c = porEliminar.value;
  if (!c) return;
  eliminando.value = true;
  try {
    await store.softDelete(c.id);
    showToast('Correo eliminado');
    dialogoEliminar.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
  }
}

onMounted(async () => {
  store.resetearFiltros();
  insforgeApi.listPlataformas().then((p) => { plataformas.value = p; }).catch(() => {});
  refrescarConteos();
  try {
    await store.aplicarFiltros(filtrosServidor.value);
  } catch {
    showToast(error.value || 'Error al cargar correos compartidos', 'error');
  }
});
</script>


<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Correos">
      <template #subtitulo>
        {{ total }} {{ total === 1 ? 'cuenta' : 'cuentas' }}{{ FRASE_VISTA[filtros.vista] || '' }}{{ hayFiltros ? ', con los filtros aplicados' : '' }}
        · buzones y usuarios que se usan entre varias personas
      </template>
      <template #acciones>
        <EnlaceReporte reporte="correos" />
        <AppButton icon="ti ti-plus" label="Nuevo correo" @click="abrirNuevo" />
      </template>
    </AppEncabezado>

    <!-- ══ Vistas + barra de filtros (SISTEMA-DISENO §3.2.1) ══════ -->
    <AppVistas v-model="filtros.vista" :opciones="VISTAS" label="Vista de correos" />
    <AppBarraFiltros class="pt-3">
      <AppBuscador v-model="busqueda" label="Buscar correos" placeholder="Buscar por correo o plataforma" />
      <AppFiltros v-model="chips" :dimensiones="DIMENSIONES" />
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiarFiltros" />
    </AppBarraFiltros>

    <!-- ══ Contenido ═══════════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && total === 0"
        icono="ti ti-mail-share"
        :titulo="nadaPorRotar ? 'Nada por rotar' : hayFiltros ? 'Sin resultados' : 'Sin correos compartidos todavía'"
        :mensaje="nadaPorRotar
          ? 'Ninguna cuenta compartida o reutilizable tiene pendiente el cambio de contraseña.'
          : hayFiltros ? 'No hay correos con los filtros aplicados.' : 'Registre un correo compartido o reutilizable para asignarlo a los empleados que lo usan.'"
      >
        <AppButton
          v-if="!hayFiltros"
          variant="outline"
          severity="secondary"
          icon="ti ti-plus"
          label="Registrar correo"
          @click="abrirNuevo"
        />
        <AppButton
          v-if="hayFiltros"
          variant="outline"
          severity="secondary"
          icon="ti ti-x"
          label="Limpiar filtros"
          @click="limpiarFiltros"
        />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando correos compartidos…</p>

        <!-- ── Tabla (escritorio) ── -->
        <AppMarcoTabla v-if="!esMovil">
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="lista"
              :loading="cargando"
              :total-records="total"
              :rows="store.tamPagina"
              :orden="orden"
              aria-label="Correos compartidos y reutilizables"
              @ordenar="store.ordenarPor"
            >
              <AppColumn field="usuario" header="Cuenta" sortable>
                <template #body="{ data: fila }">
                  <div class="flex min-w-0 max-w-80 items-center gap-3">
                    <span
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500"
                      :title="badgeInfo('tipo_cuenta', fila.tipo_cuenta).label"
                    >
                      <i :class="fila.tipo_cuenta === 'reutilizable' ? 'ti ti-transfer' : 'ti ti-users'" aria-hidden="true"></i>
                    </span>
                    <div class="min-w-0">
                      <div class="truncate font-medium text-gray-900" :title="fila.usuario">{{ fila.usuario }}</div>
                      <div class="truncate text-xs text-gray-500">
                        {{ fila.plataforma_nombre || 'Sin plataforma' }} · {{ badgeInfo('tipo_cuenta', fila.tipo_cuenta).label }}
                      </div>
                    </div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="asignado" header="Quién la usa">
                <template #body="{ data: fila }">
                  <div class="flex min-w-0 flex-col items-start gap-1">
                    <!-- Reutilizable: un titular a la vez, o libre -->
                    <template v-if="fila.tipo_cuenta === 'reutilizable'">
                      <RouterLink
                        v-if="fila.asignados?.length"
                        class="inline-flex max-w-56 items-center gap-2 rounded text-sm text-gray-900 hover:text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        :to="`/empleados/${fila.asignados[0].id}`"
                        :title="nombresAsignados(fila)"
                      >
                        <AppAvatar :nombre="fila.asignados[0].nombre" />
                        <span class="truncate">{{ fila.asignados[0].nombre }}</span>
                      </RouterLink>
                      <AppTag v-else tono="success" icono="ti ti-circle-check">Libre</AppTag>
                    </template>
                    <!-- Compartida: varios usuarios a la vez -->
                    <template v-else>
                      <div v-if="fila.asignados?.length" class="flex items-center gap-2" :title="nombresAsignados(fila)">
                        <div class="flex -space-x-2" aria-hidden="true">
                          <span v-for="a in fila.asignados.slice(0, 3)" :key="a.id" class="rounded-full ring-2 ring-white">
                            <AppAvatar :nombre="a.nombre" />
                          </span>
                        </div>
                        <span class="text-sm text-gray-700 tabular-nums">
                          {{ fila.asignados.length }} {{ fila.asignados.length === 1 ? 'usuario' : 'usuarios' }}
                        </span>
                      </div>
                      <span v-else class="text-sm text-gray-500">Sin usuarios</span>
                    </template>
                    <AppTag
                      v-if="fila.requiere_rotacion"
                      tono="warning"
                      icono="ti ti-alert-triangle"
                      title="Un titular dejó esta cuenta y la contraseña no se ha cambiado"
                    >Rotar contraseña</AppTag>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="contrasena" header="Contraseña">
                <template #body="{ data: fila }">
                  <!-- Revelado auditado (useRevelado): marcado .cred* intacto -->
                  <div class="cred w-40">
                    <span v-if="revelarDe(fila).valor.value" class="cred__valor">{{ revelarDe(fila).valor.value }}</span>
                    <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                    <template v-if="authStore.puedeVerCredenciales">
                      <button
                        type="button"
                        class="cred__accion"
                        :disabled="revelarDe(fila).pidiendo.value"
                        :aria-label="revelarDe(fila).valor.value ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                        @click="revelarDe(fila).mostrar()"
                      >
                        <i :class="revelarDe(fila).valor.value ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
                      </button>
                      <button
                        type="button"
                        class="cred__accion"
                        :disabled="revelarDe(fila).pidiendo.value"
                        aria-label="Copiar contraseña"
                        @click="revelarDe(fila).copiar()"
                      >
                        <i class="ti ti-copy" aria-hidden="true"></i>
                      </button>
                      <span v-if="revelarDe(fila).valor.value" class="cred__cuenta" aria-live="off">{{ revelarDe(fila).restante.value }}s</span>
                    </template>
                    <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver contraseñas" title="Sin permiso para ver contraseñas">
                      <i class="ti ti-lock" aria-hidden="true"></i>
                    </span>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="notas" header="Notas" sortable>
                <template #body="{ data: fila }">
                  <p v-if="fila.notas" class="max-w-64 truncate text-sm text-gray-600" :title="fila.notas">{{ fila.notas }}</p>
                  <span v-else class="text-sm text-gray-500">Sin notas</span>
                </template>
              </AppColumn>

              <AppColumn field="acciones" header="Acciones" :header-style="{ width: '1%', textAlign: 'right' }">
                <template #body="{ data: fila }">
                  <div class="flex items-center justify-end gap-0.5">
                    <a
                      v-if="fila.url"
                      :href="fila.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="icon-btn"
                      :title="fila.url"
                      aria-label="Abrir URL de la plataforma"
                    >
                      <i class="ti ti-arrow-up-right" aria-hidden="true"></i>
                    </a>
                    <span v-else class="inline-block h-8 w-8" aria-hidden="true"></span>
                    <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.usuario}`" />
                  </div>
                </template>
              </AppColumn>
            </AppTable>
          </div>

          <AppPaginacion
            v-if="!cargando && total > 0"
            :pagina="store.pagina"
            :tam-pagina="store.tamPagina"
            :total="total"
            @update:pagina="store.irAPagina"
            @update:tam-pagina="store.cambiarTamPagina"
          />
        </AppMarcoTabla>

        <!-- ── Tarjetas (móvil) ── -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando correos...</p>
          <ul v-else class="grid gap-3 sm:grid-cols-2" aria-label="Correos compartidos y reutilizables">
            <li v-for="fila in lista" :key="fila.id" class="flex flex-col rounded-lg border border-gray-200 bg-white p-4">
              <div class="flex items-start gap-3">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-50 text-xl text-gray-500">
                  <i :class="fila.tipo_cuenta === 'reutilizable' ? 'ti ti-transfer' : 'ti ti-users'" aria-hidden="true"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium text-gray-900">{{ fila.usuario }}</div>
                  <div class="truncate text-xs text-gray-500">
                    {{ fila.plataforma_nombre || 'Sin plataforma' }} · {{ badgeInfo('tipo_cuenta', fila.tipo_cuenta).label }}
                  </div>
                </div>
                <div class="-mr-1 -mt-1 flex items-center">
                  <a
                    v-if="fila.url"
                    :href="fila.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="icon-btn"
                    :title="fila.url"
                    aria-label="Abrir URL de la plataforma"
                  >
                    <i class="ti ti-arrow-up-right" aria-hidden="true"></i>
                  </a>
                  <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.usuario}`" />
                </div>
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <template v-if="fila.tipo_cuenta === 'reutilizable'">
                  <RouterLink
                    v-if="fila.asignados?.length"
                    class="inline-flex min-w-0 items-center gap-2 text-gray-900 hover:text-primary-700 hover:underline"
                    :to="`/empleados/${fila.asignados[0].id}`"
                  >
                    <AppAvatar :nombre="fila.asignados[0].nombre" />
                    <span class="truncate">{{ fila.asignados[0].nombre }}</span>
                  </RouterLink>
                  <AppTag v-else tono="success" icono="ti ti-circle-check">Libre</AppTag>
                </template>
                <template v-else>
                  <span v-if="fila.asignados?.length" class="text-gray-700 tabular-nums" :title="nombresAsignados(fila)">
                    {{ fila.asignados.length }} {{ fila.asignados.length === 1 ? 'usuario' : 'usuarios' }}
                  </span>
                  <span v-else class="text-gray-500">Sin usuarios</span>
                </template>
                <AppTag v-if="fila.requiere_rotacion" tono="warning" icono="ti ti-alert-triangle">Rotar contraseña</AppTag>
              </div>

              <p v-if="fila.notas" class="mt-2 line-clamp-2 text-sm text-gray-600">{{ fila.notas }}</p>

              <div class="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                <span class="text-xs text-gray-500">Contraseña</span>
                <div class="cred">
                  <span v-if="revelarDe(fila).valor.value" class="cred__valor">{{ revelarDe(fila).valor.value }}</span>
                  <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                  <template v-if="authStore.puedeVerCredenciales">
                    <button type="button" class="cred__accion" :disabled="revelarDe(fila).pidiendo.value" :aria-label="revelarDe(fila).valor.value ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="revelarDe(fila).mostrar()">
                      <i :class="revelarDe(fila).valor.value ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="cred__accion" :disabled="revelarDe(fila).pidiendo.value" aria-label="Copiar contraseña" @click="revelarDe(fila).copiar()">
                      <i class="ti ti-copy" aria-hidden="true"></i>
                    </button>
                    <span v-if="revelarDe(fila).valor.value" class="cred__cuenta" aria-live="off">{{ revelarDe(fila).restante.value }}s</span>
                  </template>
                  <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver contraseñas"><i class="ti ti-lock" aria-hidden="true"></i></span>
                </div>
              </div>
            </li>
          </ul>
          <AppPaginacion
            v-if="!cargando"
            variante="compacta"
            :pagina="store.pagina"
            :tam-pagina="store.tamPagina"
            :total="total"
            @update:pagina="store.irAPagina"
          />
        </div>
      </template>
    </div>

    <CorreoForm
      v-if="mostrarForm"
      :correo="correoEditar"
      :rotar="modoRotar"
      @cerrar="onFormCerrado"
    />

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar correo compartido"
      :mensaje="`¿Eliminar el correo compartido “${porEliminar.usuario}”? Las asignaciones activas quedarán en el historial.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cerrado="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>
