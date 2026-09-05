<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useCorreosStore } from '../../stores/correos.js';
import { useAuthStore } from '../../stores/auth.js';
import { revelarPassword } from '../../api/passwords.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { badgeInfo } from '../../core/badges.js';
import CorreoForm from './CorreoForm.vue';
import CarbonPagination from '../../components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonPasswordReveal from '../../components/carbon/CarbonPasswordReveal.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const store = useCorreosStore();
const authStore = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

useRealtimeRefresco('cuentas:list', () => store.cargar(), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });

// Deep-link desde la búsqueda global: /correos?q=usuario@dominio
const route = useRoute();
busqueda.value = String(route.query.q ?? '');
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const filtroTipo = ref('');
const mostrarForm = ref(false);
const correoEditar = ref(null);

watch(filtroTipo, (tipo) => store.aplicarFiltros({ tipo }));

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
// ocultado automatico) vive en CarbonPasswordReveal.vue. Esta vista solo
// declara QUE se revela. Hasta el 2026-09-02 tenia su propio
// `passwordVisibles` mas sus propios togglePassword/copiarPassword: una de
// las cuatro copias del mismo patron en el arbol, y ninguna de las cuatro
// ocultaba la credencial sola.

function abrirNuevo() {
  correoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(correo) {
  correoEditar.value = correo;
  mostrarForm.value = true;
}

// Definición de columnas de CarbonDataTable: paginación y orden son de
// servidor (store.ordenarPor). "Cuenta" es la elástica; URL y Notas no
// tienen sentido en la tarjeta móvil angosta (no se mostraban ahí antes).
const columnas = [
  { clave: 'usuario', label: 'Cuenta', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'asignado', label: 'Asignado a', movil: 'sec' },
  { clave: 'contrasena', label: 'Contraseña', movil: 'sec' },
  { clave: 'url', label: 'URL', ordenable: true, movil: false },
  { clave: 'notas', label: 'Notas', ordenable: true, movil: false },
  { clave: 'acciones', label: 'Acciones', ancho: '96px', movil: 'pie' },
];

function onFormCerrado(guardado) {
  const fueEdicion = !!correoEditar.value;
  mostrarForm.value = false;
  correoEditar.value = null;
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
  <div class="correos-page vista-modulo">
    <PageHeader titulo="Correos" icono="ti ti-mail-share" :conteo="total">
      <template #acciones>
        <CarbonButton variante="secondary" icono="ti-table-export" title="Exportar a Excel (CSV)" :deshabilitado="exportando" :cargando="exportando" @click="exportar">
          {{ exportando ? 'Exportando...' : 'Exportar' }}
        </CarbonButton>
        <CarbonButton variante="primary" icono="ti-plus" @click="abrirNuevo">Nuevo correo</CarbonButton>
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
              placeholder="Buscar por correo o plataforma..."
            >
          </div>
          <div class="filter-field">
            <label for="filtro-tipo">Tipo</label>
            <select id="filtro-tipo" v-model="filtroTipo">
              <option value="">Todos los tipos</option>
              <option value="compartida">Compartidos</option>
              <option value="reutilizable">Reutilizables</option>
            </select>
          </div>
        </div>

        <div v-if="error" class="no-results correos-error">{{ error }}</div>

        <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando correos compartidos…</p>

        <CarbonDataTable
          :columnas="columnas"
          :filas="lista"
          :cargando="cargando"
          :orden-por="ordenColumna"
          :orden-dir="ordenDireccion"
          etiqueta="Correos compartidos y reutilizables"
          vacio-icono="ti ti-mail-share"
          vacio-titulo="Sin correos compartidos"
          :vacio-mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Registra un correo compartido para asignarlo a empleados.'"
          @ordenar="store.ordenarPor"
        >
          <template #celda-usuario="{ fila }">
            <!-- Plataforma + Tipo colapsan en la celda "Cuenta" (mismo
                 criterio que Tickets: identificador+categoría arriba en gris
                 chico, dato principal abajo). Tipo deja de ser badge — es
                 metadato de clasificación fijo (compartida/reutilizable/
                 personal), no un estado — mismo argumento que bajó Categoría
                 a texto en Tickets. -->
            <div class="celda-apilada">
              <span class="celda-apilada__meta">
                <TextoVacio :valor="fila.plataforma_nombre" />
                <span class="celda-sep" aria-hidden="true">·</span>
                <span>{{ badgeInfo('tipo_cuenta', fila.tipo_cuenta).label }}</span>
              </span>
              <span class="celda-apilada__principal correo-usuario">{{ fila.usuario }}</span>
            </div>
          </template>
          <template #celda-asignado="{ fila }">
            <div class="asignado-cell">
              <template v-if="fila.tipo_cuenta === 'reutilizable'">
                <RouterLink
                  v-if="fila.asignados?.length"
                  class="asignado-nombre empleado-link"
                  :to="`/empleados/${fila.asignados[0].id}`"
                  :title="fila.asignados.map((a) => a.nombre).join(', ')"
                >
                  {{ fila.asignados[0].nombre }}
                </RouterLink>
                <CarbonTag v-else variante="success">
                  <i class="ti ti-circle-check"></i> Libre
                </CarbonTag>
              </template>
              <template v-else>
                <span
                  v-if="fila.asignados?.length"
                  class="asignado-nombre"
                  :title="fila.asignados.map((a) => a.nombre).join(', ')"
                >
                  {{ fila.asignados.length }} usuario{{ fila.asignados.length === 1 ? '' : 's' }}
                </span>
                <TextoVacio v-else placeholder="Sin usuarios" />
              </template>
              <CarbonTag v-if="fila.requiere_rotacion" variante="warning" title="Un titular dejó esta cuenta y la contraseña no se ha cambiado">
                <i class="ti ti-alert-triangle"></i> Rotar contraseña
              </CarbonTag>
            </div>
          </template>
          <template #celda-contrasena="{ fila }">
            <CarbonPasswordReveal
              :revelar="(motivo) => revelarPassword(fila.id, motivo)"
              :bloqueado="!authStore.puedeVerCredenciales"
              motivo-bloqueo="Sin permiso para ver contraseñas"
            />
          </template>
          <template #celda-url="{ fila }">
            <a
              v-if="fila.url"
              :href="fila.url"
              target="_blank"
              rel="noopener noreferrer"
              class="url-link"
              :title="fila.url"
              aria-label="Abrir URL de la plataforma"
            >
              <i class="ti ti-external-link"></i>
            </a>
            <TextoVacio v-else />
          </template>
          <template #celda-notas="{ fila }">
            <span v-if="fila.notas" class="notas-cell" :title="fila.notas">{{ fila.notas }}</span>
            <TextoVacio v-else />
          </template>
          <template #celda-acciones="{ fila }">
            <div class="actions">
              <button class="icon-btn fila-accion" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(fila)">
                <i class="ti ti-pencil"></i>
              </button>
              <button class="icon-btn danger fila-accion" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = fila">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </template>
          <template #vacio-accion>
            <CarbonButton v-if="!busqueda" variante="secondary" icono="ti-plus" @click="abrirNuevo">Nuevo correo compartido</CarbonButton>
          </template>
        </CarbonDataTable>
        </template>

        <CarbonPagination
          v-if="!cargando"
          v-model="paginaActual"
          :total-items="total"
          :tam-pagina="store.tamPagina"
          :tamanos-pagina="TAMANOS_PAGINA"
          unidad="correos"
          @update:tam-pagina="store.cambiarTamPagina"
        />
      </div>
    </main>

    <CorreoForm
      v-if="mostrarForm"
      :correo="correoEditar"
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
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>

<style scoped>
.correos-error { color: var(--color-danger); }

.correo-usuario {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-body-01);
}

/* Celda "Cuenta" de la tabla de escritorio: el dato principal es un correo/
   usuario de login, se lee mejor en mono (mismo criterio que .correo-usuario
   de la tarjeta móvil, sin tocar esa clase — sigue usándose ahí). */
.table-wrap .celda-apilada__principal {
  font-family: var(--font-mono, monospace);
}

.asignado-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.asignado-nombre {
  font-size: var(--fs-body-01);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.password-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.password-text {
  font-family: var(--font-mono, monospace);
  letter-spacing: 0.05em;
  min-width: 80px;
}

.notas-cell {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.url-link {
  color: var(--color-primary);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.url-link:hover { text-decoration: underline; }
</style>
