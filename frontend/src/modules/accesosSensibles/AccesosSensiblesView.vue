<script setup>
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useAccesosSensiblesStore } from '../../stores/accesosSensibles.js';
import { useAuthStore } from '../../stores/auth.js';
import { revelarAccesoSensible } from '../../api/passwords.js';
import { showToast } from '../../core/toast.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import AccesoSensibleForm from './AccesoSensibleForm.vue';

const auth = useAuthStore();
const store = useAccesosSensiblesStore();
const { lista, cargando, error } = storeToRefs(store);

const passwordVisibles = ref({});

// puedeRevelar viene calculado por el API (join real contra
// accesos_sensibles_permisos) — el frontend no adivina nada, solo
// deshabilita el botón cuando ese campo ya viene en false.
async function togglePassword(acceso) {
  if (!acceso.puedeRevelar) return;
  if (passwordVisibles.value[acceso.id]) {
    passwordVisibles.value[acceso.id] = null;
    return;
  }
  try {
    passwordVisibles.value[acceso.id] = await revelarAccesoSensible(acceso.id, 'ver');
  } catch (e) {
    showToast(e?.message || 'Error al revelar contraseña', 'error');
  }
}

async function copiarPassword(acceso) {
  if (!acceso.puedeRevelar) return;
  try {
    const password = await revelarAccesoSensible(acceso.id, 'copiar');
    await navigator.clipboard.writeText(password);
    showToast('Contraseña copiada');
  } catch (e) {
    showToast(e?.message || 'No se pudo copiar', 'error');
  }
}

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

// Fuente única de las acciones por acceso para el menú ⋮ de las tarjetas
// móviles (mismo criterio que accionesDe/accionesVisibles en EquiposView).
function accionesDe(a) {
  return [
    { icono: 'ti-copy', label: 'Copiar contraseña', disabled: !a.puedeRevelar, onClick: () => copiarPassword(a) },
    { icono: 'ti-pencil', label: 'Editar', disabled: !a.puedeRevelar, onClick: () => abrirEditar(a) },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, disabled: !a.puedeRevelar, onClick: () => { porEliminar.value = a; } },
  ];
}

async function confirmarEliminar() {
  const a = porEliminar.value;
  if (!a) return;
  eliminando.value = true;
  try {
    await store.eliminar(a.id);
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
  <div class="accesos-sensibles-page vista-modulo">
    <PageHeader titulo="Accesos sensibles" icono="ti ti-shield-lock" :conteo="lista.length">
      <template #acciones>
        <button class="btn btn-primary" type="button" @click="abrirNuevo">
          <i class="ti ti-plus" aria-hidden="true"></i> Nuevo acceso
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div v-if="cargando" class="no-results solo-movil">Cargando accesos sensibles...</div>
        <div v-else-if="error" class="no-results acc-error">{{ error }}</div>

        <EmptyState
          v-else-if="!cargando && lista.length === 0"
          icono="ti ti-shield-lock"
          titulo="Sin accesos sensibles"
          mensaje="Registra credenciales de alta sensibilidad (equipos, correos de gerencia/TI...) con visibilidad restringida por JEFE."
        >
          <button class="btn" type="button" @click="abrirNuevo">
            <i class="ti ti-plus"></i> Nuevo acceso
          </button>
        </EmptyState>

        <template v-if="!error && (cargando || lista.length > 0)">
        <p v-if="cargando" class="sr-only" role="status">Cargando accesos sensibles…</p>
        <div class="table-wrap solo-escritorio">
          <table aria-label="Accesos sensibles">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Categoría</th>
                <th scope="col">Usuario</th>
                <th scope="col">Contraseña</th>
                <th scope="col">Notas</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="6" />
              <template v-else>
              <tr v-for="a in lista" :key="a.id">
                <td><span class="user-name">{{ a.nombre }}</span></td>
                <td><BadgeEstado tipo="categoria_acceso_sensible" :valor="a.categoria" /></td>
                <td>{{ a.usuario }}</td>
                <td>
                  <div class="password-cell">
                    <span class="password-text">{{ passwordVisibles[a.id] || '••••••••' }}</span>
                    <button
                      class="icon-btn"
                      type="button"
                      :disabled="!a.puedeRevelar"
                      :title="a.puedeRevelar ? (passwordVisibles[a.id] ? 'Ocultar' : 'Mostrar') : 'No tienes permiso para ver esta credencial'"
                      :aria-label="a.puedeRevelar ? (passwordVisibles[a.id] ? 'Ocultar' : 'Mostrar') : 'No tienes permiso para ver esta credencial'"
                      @click="togglePassword(a)"
                    >
                      <i :class="passwordVisibles[a.id] ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
                    </button>
                    <button
                      class="icon-btn"
                      type="button"
                      :disabled="!a.puedeRevelar"
                      :title="a.puedeRevelar ? 'Copiar contraseña' : 'No tienes permiso para ver esta credencial'"
                      :aria-label="a.puedeRevelar ? 'Copiar contraseña' : 'No tienes permiso para ver esta credencial'"
                      @click="copiarPassword(a)"
                    >
                      <i class="ti ti-copy"></i>
                    </button>
                  </div>
                </td>
                <td><TextoVacio :valor="a.notas" /></td>
                <td>
                  <div class="actions">
                    <button
                      class="icon-btn"
                      type="button"
                      :disabled="!a.puedeRevelar"
                      :title="a.puedeRevelar ? 'Editar' : 'No tienes permiso para editar esta credencial'"
                      :aria-label="a.puedeRevelar ? 'Editar' : 'No tienes permiso para editar esta credencial'"
                      @click="abrirEditar(a)"
                    >
                      <i class="ti ti-pencil"></i>
                    </button>
                    <button
                      class="icon-btn danger"
                      type="button"
                      :disabled="!a.puedeRevelar"
                      :title="a.puedeRevelar ? 'Eliminar' : 'No tienes permiso para eliminar esta credencial'"
                      :aria-label="a.puedeRevelar ? 'Eliminar' : 'No tienes permiso para eliminar esta credencial'"
                      @click="porEliminar = a"
                    >
                      <i class="ti ti-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Render móvil: misma lista, como tarjetas apiladas -->
        <ul v-if="!cargando" class="lista-tarjetas solo-movil" aria-label="Accesos sensibles">
          <li v-for="a in lista" :key="a.id" class="tarjeta-fila">
            <div class="tarjeta-fila__cab">
              <BadgeEstado tipo="categoria_acceso_sensible" :valor="a.categoria" />
            </div>
            <div class="tarjeta-fila__principal user-name">{{ a.nombre }}</div>
            <div class="tarjeta-fila__sec">{{ a.usuario }}</div>
            <div class="tarjeta-fila__sec password-cell">
              <span class="password-text">{{ passwordVisibles[a.id] || '••••••••' }}</span>
              <button
                class="icon-btn"
                type="button"
                :disabled="!a.puedeRevelar"
                :title="a.puedeRevelar ? (passwordVisibles[a.id] ? 'Ocultar' : 'Mostrar') : 'No tienes permiso para ver esta credencial'"
                :aria-label="a.puedeRevelar ? (passwordVisibles[a.id] ? 'Ocultar' : 'Mostrar') : 'No tienes permiso para ver esta credencial'"
                @click="togglePassword(a)"
              >
                <i :class="passwordVisibles[a.id] ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
              </button>
            </div>
            <div class="tarjeta-fila__pie">
              <TextoVacio :valor="a.notas" placeholder="Sin notas" />
              <MenuAcciones :acciones="accionesDe(a)" :label="`Acciones de ${a.nombre}`" />
            </div>
          </li>
        </ul>
        </template>
      </div>
    </main>

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
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>

<style scoped>
.acc-error { color: var(--color-danger); }

.password-cell {
  display: flex;
  align-items: center;
  gap: 2px;
}

.password-text {
  font-family: var(--font-mono, monospace);
  letter-spacing: 0.05em;
  min-width: 72px;
}
</style>
