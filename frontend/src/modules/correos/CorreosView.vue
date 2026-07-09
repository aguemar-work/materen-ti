<script setup>
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useCorreosStore } from '../../stores/correos.js';
import { revelarPassword } from '../../api/passwords.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import CorreoForm from './CorreoForm.vue';
import Pagination from '../../components/shared/Pagination.vue';

const store = useCorreosStore();
const { lista, cargando, error } = storeToRefs(store);

const busqueda = ref('');
const filtroTipo = ref('');
const mostrarForm = ref(false);
const correoEditar = ref(null);
const passwordVisibles = ref({});

const listaFiltrada = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  return lista.value.filter((c) => {
    if (filtroTipo.value && c.tipo_cuenta !== filtroTipo.value) return false;
    if (!q) return true;
    return c.usuario.toLowerCase().includes(q) || (c.plataforma_nombre || '').toLowerCase().includes(q);
  });
});

// Exporta lo visible según filtros; las contraseñas nunca salen del servidor.
function exportar() {
  exportarCSV(
    'correos',
    ['Plataforma', 'Tipo', 'Correo / Usuario', 'Asignados', 'URL', 'Notas'],
    listaFiltrada.value.map((c) => [
      c.plataforma_nombre,
      c.tipo_cuenta === 'compartida' ? 'Compartido' : 'Reutilizable',
      c.usuario,
      (c.asignados || []).join(', '),
      c.url,
      c.notas,
    ]),
  );
}

const { paginaActual, listaPaginada, totalItems, tamPagina } = usePaginacion(listaFiltrada);

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

async function eliminar(correo) {
  if (!confirm(`¿Eliminar el correo compartido "${correo.usuario}"?\nLas asignaciones activas quedarán en el historial.`)) return;
  try {
    await store.softDelete(correo.id);
    showToast('Correo eliminado');
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  }
}

onMounted(async () => {
  try {
    await store.cargar();
  } catch {
    showToast(error.value || 'Error al cargar correos compartidos', 'error');
  }
});
</script>

<template>
  <div class="correos-page vista-modulo">
    <header class="site-header">
      <div class="header-inner">
        <div class="header-title">
          <h1>
            <i class="ti ti-mail-share" aria-hidden="true"></i> Correos
            <span class="badge-count">{{ listaFiltrada.length }}</span>
          </h1>
        </div>
        <div class="header-btns">
          <button class="btn" type="button" title="Exportar a Excel (CSV)" @click="exportar">
            <i class="ti ti-table-export" aria-hidden="true"></i> Exportar
          </button>
          <button class="btn btn-primary" type="button" @click="abrirNuevo">
            <i class="ti ti-plus" aria-hidden="true"></i> Nuevo correo
          </button>
        </div>
      </div>
    </header>

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

        <div v-else-if="listaFiltrada.length === 0" class="empty">
          <div class="empty-icon"><i class="ti ti-mail-share"></i></div>
          <h3>Sin correos compartidos</h3>
          <p>{{ busqueda ? 'No hay resultados con ese filtro.' : 'Registra un correo compartido para asignarlo a empleados.' }}</p>
          <button v-if="!busqueda" class="btn" type="button" @click="abrirNuevo">
            <i class="ti ti-plus"></i> Nuevo correo compartido
          </button>
        </div>

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
              <tr v-for="correo in listaPaginada" :key="correo.id">
                <td>
                  <div class="user-name">{{ correo.plataforma_nombre || '—' }}</div>
                </td>
                <td>
                  <span class="badge" :class="correo.tipo_cuenta === 'compartida' ? 'badge--accent' : 'badge--success'">
                    <i :class="correo.tipo_cuenta === 'compartida' ? 'ti ti-users' : 'ti ti-transfer'"></i>
                    {{ correo.tipo_cuenta === 'compartida' ? 'Compartido' : 'Reutilizable' }}
                  </span>
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
                      <span v-else class="text-muted">Sin usuarios</span>
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
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="notas-cell">
                  <span v-if="correo.notas" :title="correo.notas">{{ correo.notas }}</span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td>
                  <div class="actions">
                    <button class="icon-btn" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(correo)">
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button class="icon-btn danger" type="button" title="Eliminar" aria-label="Eliminar" @click="eliminar(correo)">
                      <i class="ti ti-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <Pagination v-model="paginaActual" :total-items="totalItems" :page-size="tamPagina" />
        </div>
      </div>
    </main>

    <CorreoForm
      v-if="mostrarForm"
      :correo="correoEditar"
      @cerrar="onFormCerrado"
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
  font-family: monospace;
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
