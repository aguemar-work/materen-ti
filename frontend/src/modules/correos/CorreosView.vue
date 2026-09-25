<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useCorreosStore } from '../../stores/correos.js';
import { useAuthStore } from '../../stores/auth.js';
import { revelarPassword } from '../../api/passwords.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { exportarCSV } from '../../core/exportar.js';
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
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { useEsMovil } from '../../composables/useEsMovil.js';

const store = useCorreosStore();
const authStore = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const { esMovil } = useEsMovil();

useRealtimeRefresco('cuentas:list', () => store.cargar(), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });

// Deep-link desde la búsqueda global: /correos?q=usuario@dominio
const route = useRoute();
busqueda.value = String(route.query.q ?? '');
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const filtroTipo = ref('');
const mostrarForm = ref(false);
const correoEditar = ref(null);
// true = el formulario se abrió desde "Rotar contraseña": entra con el foco
// en "Nueva contraseña" y un aviso de por qué (ver CorreoForm.vue).
const modoRotar = ref(false);

watch(filtroTipo, (tipo) => store.aplicarFiltros({ tipo }));

// "Requieren rotación" (server-side, `requiere_rotacion = true`). Ref local
// fresca en cada montaje, igual que filtroTipo: el store.resetearFiltros()
// de onMounted la deja coherente con lo que se ve.
const filtroRotacion = ref(false);
watch(filtroRotacion, (soloRotacion) => store.aplicarFiltros({ soloRotacion }));

const ROTACION_SEGMENTO = [
  { valor: false, label: 'Todas' },
  { valor: true, label: 'Requieren rotación', icono: 'ti ti-alert-triangle' },
];

const hayFiltros = computed(() => !!busqueda.value.trim() || !!filtroTipo.value || filtroRotacion.value);
// Vacío por el filtro de rotación solo: es una buena noticia, no "sin resultados".
const nadaPorRotar = computed(() => filtroRotacion.value && !busqueda.value.trim() && !filtroTipo.value);
// Mismo patrón de "Limpiar filtros" que ya usan KB/Problemas/Equipos — acá
// faltaba (diagnóstico UX 2026-09-25, propuesta V2).
function limpiarFiltros() {
  busqueda.value = '';
  filtroTipo.value = '';
  filtroRotacion.value = false;
}

// Filtro de tipo como segmentado (rediseño 2026-09-22): solo hay dos tipos
// y "todos" — verlos a la vista ahorra abrir un select. '' = todos.
const TIPOS_SEGMENTO = [
  { valor: '', label: 'Todos' },
  { valor: 'compartida', label: 'Compartidos', icono: 'ti ti-users' },
  { valor: 'reutilizable', label: 'Reutilizables', icono: 'ti ti-transfer' },
];

const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'correos',
      ['Plataforma', 'Tipo', 'Correo / Usuario', 'Asignados', 'URL', 'Notas'],
      filas.map((c) => [
        c.plataforma_nombre,
        c.tipo_cuenta === 'compartida' ? 'Compartido' : 'Reutilizable',
        c.usuario,
        (c.asignados || []).map((a) => a.nombre).join(', '),
        c.url,
        c.notas,
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

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
  try {
    if (busqueda.value.trim()) {
      await store.aplicarFiltros({ q: busqueda.value.trim() });
    } else {
      await store.cargar();
    }
  } catch {
    showToast(error.value || 'Error al cargar correos compartidos', 'error');
  }
});
</script>


<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Correos">
      <template #subtitulo>
        {{ total }} {{ total === 1 ? 'cuenta' : 'cuentas' }}<template v-if="filtroTipo === 'compartida'"> compartidas</template><template v-else-if="filtroTipo === 'reutilizable'"> reutilizables</template><template v-if="filtroRotacion"> que requieren rotación</template><template v-if="busqueda.trim()"> que coinciden con “{{ busqueda.trim() }}”</template>
        · buzones y usuarios que se usan entre varias personas
      </template>
      <template #acciones>
        <AppButton
          variant="text"
          severity="secondary"
          icon="ti ti-table-export"
          :loading="exportando"
          :disabled="exportando"
          :label="exportando ? 'Exportando...' : 'Exportar'"
          title="Exportar a Excel (CSV)"
          @click="exportar"
        />
        <AppButton icon="ti ti-plus" label="Nuevo correo" @click="abrirNuevo" />
      </template>
    </AppEncabezado>

    <!-- ══ Barra de filtros ═══════════════════════════════════════ -->
    <div class="flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-6">
      <AppBuscador v-model="busqueda" label="Buscar correos" placeholder="Buscar por correo o plataforma" />
      <AppSegmentado v-model="filtroTipo" :opciones="TIPOS_SEGMENTO" label="Filtrar por tipo" />
      <AppSegmentado v-model="filtroRotacion" :opciones="ROTACION_SEGMENTO" label="Filtrar por rotación de contraseña" />
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiarFiltros" />
    </div>

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
        <div v-if="!esMovil" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
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
        </div>

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
