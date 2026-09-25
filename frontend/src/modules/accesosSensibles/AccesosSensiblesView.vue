<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAccesosSensiblesStore } from '../../stores/accesosSensibles.js';
import { useAuthStore } from '../../stores/auth.js';
import { revelarAccesoSensible } from '../../api/passwords.js';
import { showToast } from '../../core/toast.js';
import { badgeInfo } from '../../core/badges.js';
import { CATEGORIAS_ACCESO_SENSIBLE } from '../../core/dominio-accesos-sensibles.js';
import { crearRevelado, escucharOcultamientoPorCambioDePestana } from '../../composables/useRevelado.js';
import { useEsMovil } from '../../composables/useEsMovil.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';
import AppTag from '../../components/ui/AppTag.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppBarraFiltros from '../../components/ui/AppBarraFiltros.vue';
import AppMarcoTabla from '../../components/ui/AppMarcoTabla.vue';
import AccesoSensibleForm from './AccesoSensibleForm.vue';

const auth = useAuthStore();
const store = useAccesosSensiblesStore();
const { lista, cargando, error } = storeToRefs(store);
const { esMovil } = useEsMovil();

// El revelado (petición a la edge function `credenciales` con la clave
// aislada CRED_KEY_SENSIBLE, auditoría en accesos_log con el motivo, cuenta
// regresiva de 8 segundos y ocultado automático) vive en
// composables/useRevelado.js. Esta vista solo declara QUÉ credencial se
// revela y si el usuario puede — una instancia por fila, en `revelados`.
//
// `puedeRevelar` viene calculado por el API (join real contra
// accesos_sensibles_permisos) — el frontend no adivina nada. La barrera real
// sigue en la edge function.
const revelados = new Map();
// Creación perezosa: la primera lectura de una fila (al pintar la celda) crea
// su instancia. Evita depender del orden entre un watcher y el render para
// que `revelarDe(fila)` nunca sea undefined en el template.
function revelarDe(fila) {
  if (!revelados.has(fila.id)) {
    revelados.set(fila.id, crearRevelado({
      revelar: (motivo) => revelarAccesoSensible(fila.id, motivo),
      etiqueta: 'contraseña',
    }));
  }
  return revelados.get(fila.id);
}

// Si el permiso se cae mientras la credencial está a la vista, se oculta.
watch(lista, (nueva) => {
  for (const fila of nueva) {
    if (!fila.puedeRevelar) revelarDe(fila)?.ocultar();
  }
}, { deep: true });

const detenerOcultamiento = escucharOcultamientoPorCambioDePestana(() => [...revelados.values()]);
onBeforeUnmount(() => {
  detenerOcultamiento();
  revelados.forEach((r) => r.ocultar());
});

// ── Filtros (solo presentación, sobre la lista ya cargada) ─────────────
// El listado es corto y se carga completo (sin paginación server-side): la
// búsqueda y la categoría filtran en el cliente, no piden nada nuevo.
const busqueda = ref('');
const filtroCategoria = ref('');
const CATEGORIAS_SEGMENTO = [
  { valor: '', label: 'Todas' },
  ...Object.entries(CATEGORIAS_ACCESO_SENSIBLE).map(([valor, c]) => ({ valor, label: c.label })),
];

const listaFiltrada = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return lista.value.filter((fila) => {
    if (filtroCategoria.value && fila.categoria !== filtroCategoria.value) return false;
    if (!q) return true;
    return [fila.nombre, fila.usuario, fila.notas].some((v) => (v || '').toLowerCase().includes(q));
  });
});
// Mismo patrón de "Limpiar filtros" que ya usan KB/Problemas/Equipos/
// Correos/Licencias/Empleados — acá faltaba (propuesta UX/UI V2).
const hayFiltros = computed(() => !!busqueda.value.trim() || !!filtroCategoria.value);
function limpiarFiltros() {
  busqueda.value = '';
  filtroCategoria.value = '';
}

const sinPermiso = computed(() => lista.value.filter((f) => !f.puedeRevelar).length);

const ICONO_CATEGORIA = { equipos: 'ti ti-router', correos: 'ti ti-mail', otro: 'ti ti-shield-lock' };

const mostrarForm = ref(false);
const accesoEditar = ref(null);

function abrirNuevo() {
  accesoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(acceso) {
  if (!acceso.puedeRevelar) return;
  accesoEditar.value = acceso;
  mostrarForm.value = true;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!accesoEditar.value;
  mostrarForm.value = false;
  accesoEditar.value = null;
  if (guardado) showToast(fueEdicion ? 'Acceso actualizado' : 'Acceso creado');
}

// Confirmación destructiva (ConfirmDialog compartido, tier base)
const porEliminar = ref(null);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

// Acciones por fila en el menú ⋮ (rediseño 2026-09-22). Mismas reglas que
// los íconos anteriores: sin permiso sobre la credencial, Editar y Eliminar
// quedan deshabilitados (la RLS lo exige igual del lado del servidor).
function accionesDe(fila) {
  return [
    {
      icono: 'ti-pencil',
      label: fila.puedeRevelar ? 'Editar' : 'Editar (sin permiso)',
      disabled: !fila.puedeRevelar,
      onClick: () => abrirEditar(fila),
    },
    { separador: true },
    {
      icono: 'ti-trash',
      label: fila.puedeRevelar ? 'Eliminar' : 'Eliminar (sin permiso)',
      danger: true,
      disabled: !fila.puedeRevelar,
      onClick: () => { porEliminar.value = fila; },
    },
  ];
}

async function confirmarEliminar() {
  const a = porEliminar.value;
  if (!a) return;
  eliminando.value = true;
  try {
    await store.softDelete(a.id);
    showToast('Acceso eliminado');
    dialogoEliminar.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
  }
}

onMounted(async () => {
  try {
    await store.cargar(auth.user.id);
  } catch {
    showToast(error.value || 'Error al cargar accesos sensibles', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado titulo="Accesos sensibles">
      <template #subtitulo>
        {{ lista.length }} {{ lista.length === 1 ? 'credencial' : 'credenciales' }} de alta sensibilidad
        <template v-if="sinPermiso"> · <span class="font-medium text-gray-700">{{ sinPermiso }} sin permiso para usted</span></template>
        · cada una la revelan solo los JEFE autorizados y queda registrada en Actividad
      </template>
      <template #acciones>
        <AppButton icon="ti ti-plus" label="Nuevo acceso" @click="abrirNuevo" />
      </template>
    </AppEncabezado>

    <!-- ══ Barra de filtros ═══════════════════════════════════════ -->
    <AppBarraFiltros v-if="lista.length">
      <AppBuscador v-model="busqueda" label="Buscar accesos sensibles" placeholder="Buscar por nombre, usuario o nota" />
      <AppSegmentado v-model="filtroCategoria" :opciones="CATEGORIAS_SEGMENTO" label="Filtrar por categoría" />
      <AppButton v-if="hayFiltros" size="sm" variant="text" severity="secondary" icon="ti ti-x" label="Limpiar" @click="limpiarFiltros" />
    </AppBarraFiltros>

    <!-- ══ Contenido ═══════════════════════════════════════════════ -->
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <div v-if="error" class="notif notif--danger" role="alert">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>

      <AppVacio
        v-else-if="!cargando && !lista.length"
        icono="ti ti-shield-lock"
        titulo="Sin accesos sensibles"
        mensaje="Registre credenciales de alta sensibilidad (equipos de red, correos de gerencia o de TI...) con visibilidad restringida a los JEFE que usted elija."
      >
        <AppButton variant="outline" severity="secondary" icon="ti ti-plus" label="Registrar acceso" @click="abrirNuevo" />
      </AppVacio>

      <AppVacio
        v-else-if="!cargando && !listaFiltrada.length"
        icono="ti ti-search"
        titulo="Sin resultados"
        mensaje="No hay accesos con los filtros aplicados."
      >
        <AppButton variant="outline" severity="secondary" icon="ti ti-x" label="Limpiar filtros" @click="limpiarFiltros" />
      </AppVacio>

      <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando accesos sensibles…</p>

        <!-- ── Tabla (escritorio) ── -->
        <AppMarcoTabla v-if="!esMovil">
          <div class="min-h-0 flex-1 overflow-auto">
            <AppTable
              :value="listaFiltrada"
              :loading="cargando"
              :lazy="false"
              aria-label="Accesos sensibles"
            >
              <AppColumn field="nombre" header="Acceso">
                <template #body="{ data: fila }">
                  <div class="flex min-w-0 max-w-96 items-center gap-3">
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 text-lg text-gray-500">
                      <i :class="ICONO_CATEGORIA[fila.categoria] || 'ti ti-shield-lock'" aria-hidden="true"></i>
                    </span>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="truncate font-medium text-gray-900">{{ fila.nombre }}</span>
                      </div>
                      <div class="truncate text-xs text-gray-500">{{ badgeInfo('categoria_acceso_sensible', fila.categoria).label }}</div>
                    </div>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="usuario" header="Usuario">
                <template #body="{ data: fila }">
                  <span class="block max-w-60 truncate font-mono text-xs text-gray-700" :title="fila.usuario">{{ fila.usuario }}</span>
                </template>
              </AppColumn>

              <AppColumn field="contrasena" header="Contraseña">
                <template #body="{ data: fila }">
                  <!-- Revelado auditado (useRevelado): marcado .cred* intacto -->
                  <div class="flex items-center gap-2">
                    <div class="cred w-40">
                      <span v-if="revelarDe(fila).valor.value" class="cred__valor">{{ revelarDe(fila).valor.value }}</span>
                      <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                      <template v-if="fila.puedeRevelar">
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
                        <span v-if="revelarDe(fila).valor.value" class="cred__cuenta" aria-live="off">
                          {{ revelarDe(fila).restante.value }}s
                        </span>
                      </template>
                      <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver esta credencial" title="Sin permiso para ver esta credencial">
                        <i class="ti ti-lock" aria-hidden="true"></i>
                      </span>
                    </div>
                    <AppTag v-if="!fila.puedeRevelar">Sin permiso</AppTag>
                  </div>
                </template>
              </AppColumn>

              <AppColumn field="notas" header="Notas">
                <template #body="{ data: fila }">
                  <p v-if="fila.notas" class="max-w-72 truncate text-sm text-gray-600" :title="fila.notas">{{ fila.notas }}</p>
                  <span v-else class="text-sm text-gray-500">Sin notas</span>
                </template>
              </AppColumn>

              <AppColumn field="acciones" header="Acciones" :header-style="{ width: '1%', textAlign: 'right' }">
                <template #body="{ data: fila }">
                  <div class="flex justify-end">
                    <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.nombre}`" />
                  </div>
                </template>
              </AppColumn>
            </AppTable>
          </div>
        </AppMarcoTabla>

        <!-- ── Tarjetas (móvil) ── -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="cargando" class="py-10 text-center text-sm text-gray-500">Cargando accesos sensibles...</p>
          <ul v-else class="grid gap-3 sm:grid-cols-2" aria-label="Accesos sensibles">
            <li v-for="fila in listaFiltrada" :key="fila.id" class="flex flex-col rounded-lg border border-gray-200 bg-white p-4">
              <div class="flex items-start gap-3">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-50 text-xl text-gray-500">
                  <i :class="ICONO_CATEGORIA[fila.categoria] || 'ti ti-shield-lock'" aria-hidden="true"></i>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium text-gray-900">{{ fila.nombre }}</div>
                  <div class="truncate text-xs text-gray-500">{{ badgeInfo('categoria_acceso_sensible', fila.categoria).label }}</div>
                </div>
                <div class="-mr-1 -mt-1">
                  <MenuAcciones :acciones="accionesDe(fila)" :label="`Acciones de ${fila.nombre}`" />
                </div>
              </div>

              <dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
                <dt class="text-xs text-gray-500">Usuario</dt>
                <dd class="truncate font-mono text-xs text-gray-700">{{ fila.usuario }}</dd>
                <dt class="text-xs text-gray-500">Contraseña</dt>
                <dd class="flex items-center gap-2">
                  <div class="cred">
                    <span v-if="revelarDe(fila).valor.value" class="cred__valor">{{ revelarDe(fila).valor.value }}</span>
                    <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                    <template v-if="fila.puedeRevelar">
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
                    <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver esta credencial">
                      <i class="ti ti-lock" aria-hidden="true"></i>
                    </span>
                  </div>
                  <AppTag v-if="!fila.puedeRevelar">Sin permiso</AppTag>
                </dd>
              </dl>

              <p v-if="fila.notas" class="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">{{ fila.notas }}</p>
            </li>
          </ul>
        </div>
      </template>
    </div>

    <AccesoSensibleForm
      v-if="mostrarForm"
      :acceso="accesoEditar"
      @cerrar="onFormCerrado"
    />

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar acceso sensible"
      :mensaje="`¿Eliminar “${porEliminar.nombre}”? Esta acción no se puede deshacer.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cerrado="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>
