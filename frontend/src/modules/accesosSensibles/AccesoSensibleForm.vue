<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useAccesosSensiblesStore } from '../../stores/accesosSensibles.js';
import { useAuthStore } from '../../stores/auth.js';
import { CATEGORIAS_ACCESO_SENSIBLE } from '../../core/dominio-accesos-sensibles.js';
import { generarPassword } from '../../core/generarPassword.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const props = defineProps({
  acceso: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

const auth = useAuthStore();
const store = useAccesosSensiblesStore();

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

const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => ({
  form: form.value,
  permisos: [...permisosSeleccionados.value].sort(),
}));

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
      <CarbonCampo class="full" v-model="form.nombre" etiqueta="Nombre" requerido placeholder="ej: Router principal, Correo gerencia" :deshabilitado="guardando" />

      <CarbonCampo v-model="form.categoria" etiqueta="Categoría" tipo="select" requerido :deshabilitado="guardando">
        <template #opciones>
          <option value="" disabled>Seleccionar categoría</option>
          <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.label }}</option>
        </template>
      </CarbonCampo>

      <CarbonCampo v-model="form.usuario" etiqueta="Usuario" requerido :deshabilitado="guardando" />

      <div class="full input-with-action">
        <CarbonCampo
          v-model="form.password"
          :etiqueta="esEdicion ? 'Nueva contraseña' : 'Contraseña'"
          :tipo="passwordVisible ? 'text' : 'password'"
          autocomplete="new-password"
          :placeholder="esEdicion ? 'Dejar vacío para mantener la actual' : ''"
          :deshabilitado="guardando"
        />
        <button type="button" class="icon-btn" title="Generar contraseña" aria-label="Generar contraseña" :disabled="guardando" @click="generar">
          <i class="ti ti-refresh" aria-hidden="true"></i>
        </button>
        <button type="button" class="icon-btn" :title="passwordVisible ? 'Ocultar' : 'Mostrar'" :aria-label="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="passwordVisible = !passwordVisible">
          <i :class="passwordVisible ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
        </button>
      </div>

      <CarbonCampo v-model="form.notas" class="full" etiqueta="Notas" tipo="textarea" :deshabilitado="guardando" />

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

      <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
    </form>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="cancelar">Cancelar</CarbonButton>
      <CarbonButton
        variante="primary"
        tipo="submit"
        form="acceso-sensible-form"
        :deshabilitado="guardando || cargandoJefes"
        :cargando="guardando"
      >
        {{ guardando ? 'Guardando...' : 'Guardar' }}
      </CarbonButton>
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
/* CarbonCampo no puede envolverse en el viejo .form-group.full (le filtraría
   el estilo de <input>/<select>/<textarea> anterior), así que repite solo el
   grid-column (mismo criterio que LicenciaForm.vue/EquipoForm.vue). */
.full {
  grid-column: 1 / -1;
}

.loading-inline {
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
  padding: 8px 0;
}

.input-with-action {
  display: flex;
  gap: 4px;
  align-items: flex-end;
}

.input-with-action :deep(.cds-campo) { flex: 1; min-width: 0; }

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
  border-radius: var(--radius-base);
  padding: 10px 12px;
}

.permiso-item label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-body-01);
  font-weight: 400;
  color: var(--color-text-primary);
  cursor: pointer;
}

.permiso-yo {
  color: var(--color-text-tertiary);
  font-size: var(--fs-label-01);
}

.field-hint {
  margin: 6px 0 0;
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}
</style>
