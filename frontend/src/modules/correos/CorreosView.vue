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
import CorreoForm from './CorreoForm.vue';
import Pagination from '../../components/shared/Pagination.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';

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
const passwordVisibles = ref({});

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

// passwordVisibles[id] guarda el texto revelado; null = oculto.
// Cada revelado pasa por la edge function y queda auditado.
async function togglePassword(correo) {
  if (passwordVisibles.value[correo.id]) {
    passwordVisibles.value[correo.id] = null;
    return;
  }
  try {
    passwordVisibles.value[correo.id] = await revelarPassword(correo.id, 'ver');
  } catch (e) {
    showToast(e?.message || 'Error al revelar contraseña', 'error');
  }
}

async function copiarPassword(correo) {
  try {
    const password = await revelarPassword(correo.id, 'copiar');
    await navigator.clipboard.writeText(password);
    showToast('Contraseña copiada');
  } catch (e) {
    showToast(e?.message || 'No se pudo copiar', 'error');
  }
}

function abrirNuevo() {
  correoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(correo) {
  correoEditar.value = correo;
  mostrarForm.value = true;
}

function accionesDe(correo) {
  return [
    { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(correo) },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => { porEliminar.value = correo; } },
  ];
}

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
        <button class="btn" type="button" title="Exportar a Excel (CSV)" :disabled="exportando" @click="exportar">
          <i :class="exportando ? 'ti ti-loader-2 spinner-icon' : 'ti ti-table-export'" aria-hidden="true"></i> {{ exportando ? 'Exportando...' : 'Exportar' }}
        </button>
        <button class="btn btn-primary" type="button" @click="abrirNuevo">
          <i class="ti ti-plus" aria-hidden="true"></i> Nuevo correo
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

        <div v-if="cargando" class="no-results solo-movil">Cargando correos...</div>
        <div v-else-if="error" class="no-results correos-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && total === 0"
          icono="ti ti-mail-share"
          titulo="Sin correos compartidos"
          :mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Registra un correo compartido para asignarlo a empleados.'"
        >
          <button v-if="!busqueda" class="btn" type="button" @click="abrirNuevo">
            <i class="ti ti-plus"></i> Nuevo correo compartido
          </button>
        </EmptyState>

        <template v-if="!error && (cargando || total > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando correos compartidos…</p>
        <div class="table-wrap solo-escritorio">
          <table aria-label="Correos compartidos y reutilizables">
            <thead>
              <tr>
                <th scope="col">Plataforma</th>
                <ThOrdenable clave="tipo_cuenta" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Tipo</ThOrdenable>
                <ThOrdenable clave="usuario" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Correo / Usuario</ThOrdenable>
                <th scope="col">Asignado a</th>
                <th scope="col">Contraseña</th>
                <ThOrdenable clave="url" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">URL</ThOrdenable>
                <ThOrdenable clave="notas" :columna="ordenColumna" :direccion="ordenDireccion" @ordenar="store.ordenarPor">Notas</ThOrdenable>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="8" />
              <template v-else>
              <tr v-for="correo in lista" :key="correo.id">
                <td>
                  <div class="user-name"><TextoVacio :valor="correo.plataforma_nombre" /></div>
                </td>
                <td>
                  <BadgeEstado tipo="tipo_cuenta" :valor="correo.tipo_cuenta" />
                </td>
                <td class="correo-usuario">{{ correo.usuario }}</td>
                <td>
                  <div class="asignado-cell">
                    <template v-if="correo.tipo_cuenta === 'reutilizable'">
                      <RouterLink
                        v-if="correo.asignados?.length"
                        class="asignado-nombre empleado-link"
                        :to="`/empleados/${correo.asignados[0].id}`"
                        :title="correo.asignados.map((a) => a.nombre).join(', ')"
                      >
                        {{ correo.asignados[0].nombre }}
                      </RouterLink>
                      <span v-else class="badge badge--success">
                        <i class="ti ti-circle-check"></i> Libre
                      </span>
                    </template>
                    <template v-else>
                      <span
                        v-if="correo.asignados?.length"
                        class="asignado-nombre"
                        :title="correo.asignados.map((a) => a.nombre).join(', ')"
                      >
                        {{ correo.asignados.length }} usuario{{ correo.asignados.length === 1 ? '' : 's' }}
                      </span>
                      <TextoVacio v-else placeholder="Sin usuarios" />
                    </template>
                    <span v-if="correo.requiere_rotacion" class="badge badge--warning" title="Un titular dejó esta cuenta y la contraseña no se ha cambiado">
                      <i class="ti ti-alert-triangle"></i> Rotar contraseña
                    </span>
                  </div>
                </td>
                <td>
                  <div class="password-cell">
                    <span class="password-text">
                      {{ passwordVisibles[correo.id] || '••••••••' }}
                    </span>
                    <button
                      class="icon-btn"
                      type="button"
                      :disabled="!authStore.puedeVerCredenciales"
                      :title="authStore.puedeVerCredenciales ? (passwordVisibles[correo.id] ? 'Ocultar' : 'Mostrar') : 'Sin permiso para ver contraseñas'"
                      :aria-label="passwordVisibles[correo.id] ? 'Ocultar' : 'Mostrar'"
                      @click="togglePassword(correo)"
                    >
                      <i :class="passwordVisibles[correo.id] ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
                    </button>
                    <button
                      class="icon-btn"
                      type="button"
                      :disabled="!authStore.puedeVerCredenciales"
                      :title="authStore.puedeVerCredenciales ? 'Copiar contraseña' : 'Sin permiso para ver contraseñas'"
                      aria-label="Copiar contraseña"
                      @click="copiarPassword(correo)"
                    >
                      <i class="ti ti-copy"></i>
                    </button>
                  </div>
                </td>
                <td>
                  <a
                    v-if="correo.url"
                    :href="correo.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="url-link"
                    :title="correo.url"
                    aria-label="Abrir URL de la plataforma"
                  >
                    <i class="ti ti-external-link"></i>
                  </a>
                  <TextoVacio v-else />
                </td>
                <td class="notas-cell">
                  <span v-if="correo.notas" :title="correo.notas">{{ correo.notas }}</span>
                  <TextoVacio v-else />
                </td>
                <td>
                  <div class="actions">
                    <button class="icon-btn" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(correo)">
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = correo">
                      <i class="ti ti-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Render móvil: misma lista paginada, como tarjetas apiladas -->
        <ul v-if="!cargando" class="lista-tarjetas solo-movil" aria-label="Correos compartidos y reutilizables">
          <li v-for="correo in lista" :key="correo.id" class="tarjeta-fila">
            <div class="tarjeta-fila__principal user-name"><TextoVacio :valor="correo.plataforma_nombre" /></div>
            <div class="tarjeta-fila__sec">
              <span class="correo-usuario">{{ correo.usuario }}</span>
            </div>
            <div class="tarjeta-fila__sec">
              <template v-if="correo.tipo_cuenta === 'reutilizable'">
                <RouterLink
                  v-if="correo.asignados?.length"
                  class="empleado-link"
                  :to="`/empleados/${correo.asignados[0].id}`"
                >
                  {{ correo.asignados[0].nombre }}
                </RouterLink>
                <span v-else class="badge badge--success">
                  <i class="ti ti-circle-check"></i> Libre
                </span>
              </template>
              <template v-else>
                <span v-if="correo.asignados?.length">
                  {{ correo.asignados.length }} usuario{{ correo.asignados.length === 1 ? '' : 's' }}
                </span>
                <TextoVacio v-else placeholder="Sin usuarios" />
              </template>
            </div>
            <div class="tarjeta-fila__sec password-cell">
              <span class="password-text">{{ passwordVisibles[correo.id] || '••••••••' }}</span>
              <button
                class="icon-btn"
                type="button"
                :disabled="!authStore.puedeVerCredenciales"
                :title="authStore.puedeVerCredenciales ? (passwordVisibles[correo.id] ? 'Ocultar' : 'Mostrar') : 'Sin permiso para ver contraseñas'"
                :aria-label="passwordVisibles[correo.id] ? 'Ocultar' : 'Mostrar'"
                @click.stop="togglePassword(correo)"
              >
                <i :class="passwordVisibles[correo.id] ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
              </button>
              <button
                class="icon-btn"
                type="button"
                :disabled="!authStore.puedeVerCredenciales"
                :title="authStore.puedeVerCredenciales ? 'Copiar contraseña' : 'Sin permiso para ver contraseñas'"
                aria-label="Copiar contraseña"
                @click.stop="copiarPassword(correo)"
              >
                <i class="ti ti-copy"></i>
              </button>
            </div>
            <div class="tarjeta-fila__pie">
              <div class="tarjeta-fila__badges">
                <BadgeEstado tipo="tipo_cuenta" :valor="correo.tipo_cuenta" />
                <span v-if="correo.requiere_rotacion" class="badge badge--warning" title="Un titular dejó esta cuenta y la contraseña no se ha cambiado">
                  <i class="ti ti-alert-triangle"></i> Rotar
                </span>
              </div>
              <MenuAcciones :acciones="accionesDe(correo)" :label="`Acciones de ${correo.usuario}`" />
            </div>
          </li>
        </ul>

        <Pagination v-if="!cargando" v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </template>
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
  font-size: 13px;
}

.asignado-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.asignado-nombre {
  font-size: 13px;
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
