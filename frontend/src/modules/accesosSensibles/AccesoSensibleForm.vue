<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useAccesosSensiblesStore } from '../../stores/accesosSensibles.js';
import { useAuthStore } from '../../stores/auth.js';
import { CATEGORIAS_ACCESO_SENSIBLE } from '../../core/dominio-accesos-sensibles.js';
import { generarPassword } from '../../core/generarPassword.js';
import { useDetectorDeCambios } from '../../composables/useDetectorDeCambios.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const props = defineProps({
  acceso: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

const auth = useAuthStore();
const store = useAccesosSensiblesStore();

const modal = ref(null);
let resultado = false;

const guardando = ref(false);
const error = ref('');
const passwordVisible = ref(false);

const esEdicion = computed(() => !!props.acceso?.id);
const categorias = Object.entries(CATEGORIAS_ACCESO_SENSIBLE).map(([id, c]) => ({ id, label: c.label }));

const jefesActivos = ref([]);
const cargandoJefes = ref(true);

const form = ref({
  nombre: '',
  categoria: '',
  usuario: '',
  password: '',
  notas: '',
});

// Quién puede revelar/editar/eliminar esta credencial. El usuario actual
// SIEMPRE aparece marcado y no se puede destildar acá: si se sacara a sí
// mismo, al guardar perdería el permiso sobre esta fila (RLS lo exige
// para editar) y ningún otro camino en la UI se lo devolvería.
const permisosSeleccionados = ref([]);

const { estaSucio, tomarSnapshot } = useDetectorDeCambios(() => ({
  form: form.value,
  permisos: [...permisosSeleccionados.value].sort(),
}));
const confirmarDescarte = ref(false);
const dialogoDescarte = ref(null);

function resetForm() {
  error.value = '';
  if (props.acceso) {
    form.value = {
      nombre: props.acceso.nombre,
      categoria: props.acceso.categoria,
      // La contraseña actual nunca viaja al formulario:
      // vacío = se mantiene la actual, escribir algo = se cambia
      password: '',
      usuario: props.acceso.usuario,
      notas: props.acceso.notas || '',
    };
  } else {
    form.value = { nombre: '', categoria: '', usuario: '', password: '', notas: '' };
  }
}

async function cargarDatos() {
  cargandoJefes.value = true;
  try {
    const staff = await insforgeApi.listStaff();
    jefesActivos.value = staff.filter((s) => s.rol === 'JEFE' && s.activo);

    if (esEdicion.value) {
      permisosSeleccionados.value = await insforgeApi.permisosDeAcceso(props.acceso.id);
    } else {
      // Nueva credencial: el creador queda con permiso automático en el
      // servidor (trigger de BD) — acá solo se refleja en el checkbox.
      permisosSeleccionados.value = [auth.user.id];
    }
  } catch (e) {
    error.value = e?.message || 'Error al cargar JEFEs';
  } finally {
    cargandoJefes.value = false;
    // El snapshot se toma recién con todo poblado (form + permisos),
    // tanto en alta como en edición.
    resetForm();
    tomarSnapshot();
  }
}

watch(() => props.acceso, resetForm);
onMounted(cargarDatos);

function togglePermiso(userId) {
  if (userId === auth.user.id) return; // no se puede destildar a sí mismo
  const i = permisosSeleccionados.value.indexOf(userId);
  if (i === -1) permisosSeleccionados.value.push(userId);
  else permisosSeleccionados.value.splice(i, 1);
}

// Guard de cierre del Modal compartido: backdrop/Escape/X pasan por acá
// igual que el botón "Cancelar" — con cambios sin guardar se pide
// confirmación antes de descartar; limpio cierra directo.
function confirmarCierre() {
  if (estaSucio.value) {
    confirmarDescarte.value = true;
    return false;
  }
  return true;
}

function cancelar() {
  if (confirmarCierre()) modal.value?.cerrar();
}

function descartarCambios() {
  dialogoDescarte.value?.cerrar();
  modal.value?.cerrar();
}

function generar() {
  form.value.password = generarPassword();
  passwordVisible.value = true;
}

async function guardar() {
  error.value = '';
  guardando.value = true;
  try {
    if (esEdicion.value) {
      await store.actualizar(
        props.acceso.id,
        { ...form.value, password_cambiada: form.value.password !== '' },
        permisosSeleccionados.value,
      );
    } else {
      if (!permisosSeleccionados.value.length) {
        error.value = 'Seleccione al menos un JEFE con permiso (su propio permiso ya está incluido)';
        guardando.value = false;
        return;
      }
      await store.crear(form.value, permisosSeleccionados.value);
    }
    tomarSnapshot();
    resultado = true;
    modal.value?.cerrar();
  } catch (e) {
    error.value = e?.message || 'Error al guardar el acceso';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal
    ref="modal"
    size="lg"
    :titulo="esEdicion ? 'Editar acceso sensible' : 'Nuevo acceso sensible'"
    :confirmar-cierre="confirmarCierre"
    @close="emit('cerrar', resultado)"
  >
    <form id="acceso-sensible-form" class="form-grid" @submit.prevent="guardar">
      <div class="form-group full">
        <label for="as-nombre">Nombre *</label>
        <input id="as-nombre" v-model="form.nombre" required placeholder="ej: Router principal, Correo gerencia" :disabled="guardando">
      </div>

      <div class="form-group">
        <label for="as-categoria">Categoría *</label>
        <select id="as-categoria" v-model="form.categoria" required :disabled="guardando">
          <option value="" disabled>Seleccionar categoría</option>
          <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
      </div>

      <div class="form-group">
        <label for="as-usuario">Usuario *</label>
        <input id="as-usuario" v-model="form.usuario" required :disabled="guardando">
      </div>

      <div class="form-group full">
        <label for="as-password">{{ esEdicion ? 'Nueva contraseña' : 'Contraseña' }}</label>
        <div class="input-with-action">
          <input
            id="as-password"
            v-model="form.password"
            :type="passwordVisible ? 'text' : 'password'"
            autocomplete="new-password"
            :placeholder="esEdicion ? 'Dejar vacío para mantener la actual' : ''"
            :disabled="guardando"
          >
          <button type="button" class="icon-btn" title="Generar contraseña" aria-label="Generar contraseña" :disabled="guardando" @click="generar">
            <i class="ti ti-refresh" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-btn" :title="passwordVisible ? 'Ocultar' : 'Mostrar'" :aria-label="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="passwordVisible = !passwordVisible">
            <i :class="passwordVisible ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
          </button>
        </div>
      </div>

      <div class="form-group full">
        <label for="as-notas">Notas</label>
        <textarea id="as-notas" v-model="form.notas" :disabled="guardando"></textarea>
      </div>

      <div class="form-group full section-label">
        <i class="ti ti-shield-lock" aria-hidden="true"></i> Quién puede revelar esta credencial
      </div>

      <div class="form-group full">
        <div v-if="cargandoJefes" class="loading-inline">Cargando JEFEs...</div>
        <ul v-else class="permisos-lista">
          <li v-for="j in jefesActivos" :key="j.user_id" class="permiso-item">
            <label>
              <input
                type="checkbox"
                :checked="permisosSeleccionados.includes(j.user_id)"
                :disabled="guardando || j.user_id === auth.user.id"
                @change="togglePermiso(j.user_id)"
              >
              {{ j.nombre }}
              <span v-if="j.user_id === auth.user.id" class="permiso-yo">(yo)</span>
            </label>
          </li>
        </ul>
        <p class="field-hint">
          Solo los JEFE marcados acá van a poder revelar, editar o eliminar esta credencial. Su propio permiso queda incluido siempre.
        </p>
      </div>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>

    <template #acciones>
      <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
      <button class="btn btn-primary" type="submit" form="acceso-sensible-form" :disabled="guardando || cargandoJefes">
        <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
        {{ guardando ? 'Guardando...' : 'Guardar' }}
      </button>
    </template>
  </Modal>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Tiene cambios sin guardar, ¿desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cancel="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>

<style scoped>
.loading-inline {
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  padding: 8px 0;
}

.input-with-action {
  display: flex;
  gap: 4px;
  align-items: center;
}

.input-with-action input {
  flex: 1;
}

.permisos-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.permiso-item label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-base);
  font-weight: 400;
  color: var(--color-text-primary);
  cursor: pointer;
}

.permiso-yo {
  color: var(--color-text-tertiary);
  font-size: var(--fs-sm);
}

.field-hint {
  margin: 6px 0 0;
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}
</style>
