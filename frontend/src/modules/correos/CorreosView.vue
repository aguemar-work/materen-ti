<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useCorreosStore } from '../../stores/correos.js';
import { revelarPassword } from '../../api/passwords.js';
import { useRealtimeRefresco } from '../../composables/useRealtimeRefresco.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import CorreoForm from './CorreoForm.vue';
import Pagination from '../../components/shared/Pagination.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const store = useCorreosStore();
const { lista, total, cargando, error } = storeToRefs(store);

useRealtimeRefresco('cuentas:list', () => store.cargar());

// Deep-link desde la búsqueda global: /correos?q=usuario@dominio
const route = useRoute();
const busqueda = ref(String(route.query.q ?? ''));
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const filtroTipo = ref('');
const mostrarForm = ref(false);
const correoEditar = ref(null);
const passwordVisibles = ref({});

let debounceBusqueda = null;
watch(busqueda, (q) => {
  clearTimeout(debounceBusqueda);
  debounceBusqueda = setTimeout(() => store.aplicarFiltros({ q: q.trim() }), 300);
});
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
        (c.asignados || []).join(', '),
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
          <i class="ti ti-table-export" aria-hidden="true"></i> Exportar
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
          <select v-model="filtroTipo">
            <option value="">Todos los tipos</option>
            <option value="compartida">Compartidos</option>
            <option value="reutilizable">Reutilizables</option>
          </select>
        </div>

        <div v-if="cargando" class="no-results">Cargando correos compartidos...</div>

        <div v-else-if="error" class="no-results correos-error">{{ error }}</div>

        <EmptyState
          v-else-if="total === 0"
          icono="ti ti-mail-share"
          titulo="Sin correos compartidos"
          :mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Registra un correo compartido para asignarlo a empleados.'"
        >
          <button v-if="!busqueda" class="btn" type="button" @click="abrirNuevo">
            <i class="ti ti-plus"></i> Nuevo correo compartido
          </button>
        </EmptyState>

        <div v-else class="table-wrap">
          <table aria-label="Correos compartidos y reutilizables">
            <thead>
              <tr>
                <th scope="col">Plataforma</th>
                <th scope="col">Tipo</th>
                <th scope="col">Correo / Usuario</th>
                <th scope="col">Asignado a</th>
                <th scope="col">Contraseña</th>
                <th scope="col">URL</th>
                <th scope="col">Notas</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="correo in lista" :key="correo.id">
                <td>
                  <div class="user-name">{{ correo.plataforma_nombre || '—' }}</div>
                </td>
                <td>
                  <BadgeEstado tipo="tipo_cuenta" :valor="correo.tipo_cuenta" />
                </td>
                <td class="correo-usuario">{{ correo.usuario }}</td>
                <td>
                  <div class="asignado-cell">
                    <template v-if="correo.tipo_cuenta === 'reutilizable'">
                      <span v-if="correo.asignados?.length" class="asignado-nombre" :title="correo.asignados.join(', ')">
                        {{ correo.asignados[0] }}
                      </span>
                      <span v-else class="badge badge--success">
                        <i class="ti ti-circle-check"></i> Libre
                      </span>
                    </template>
                    <template v-else>
                      <span
                        v-if="correo.asignados?.length"
                        class="asignado-nombre"
                        :title="correo.asignados.join(', ')"
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
                      :title="passwordVisibles[correo.id] ? 'Ocultar' : 'Mostrar'"
                      :aria-label="passwordVisibles[correo.id] ? 'Ocultar' : 'Mostrar'"
                      @click="togglePassword(correo)"
                    >
                      <i :class="passwordVisibles[correo.id] ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
                    </button>
                    <button
                      class="icon-btn"
                      type="button"
                      title="Copiar contraseña"
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
            </tbody>
          </table>
          <Pagination v-model="paginaActual" :total-items="total" :page-size="store.tamPagina" />
        </div>
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

/* .badge-libre y .badge-rotar: estructura y color del sistema de badges global */

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
