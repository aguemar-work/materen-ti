<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useCorreosStore } from '../../stores/correos.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { generarPassword } from '../../core/generarPassword.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const props = defineProps({
  correo: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

// Migrado a Modal.vue (pasada de diseño ago 2026, mismo patrón que
// EmpleadoForm.vue/AccesoSensibleForm.vue): Teleport, bloqueo de scroll del
// body, atrapamiento de foco y Escape los resuelve el componente
// compartido.
let resultado = false;

const store = useCorreosStore();

const plataformas = ref([]);
const cargandoPlataformas = ref(false);
const guardando = ref(false);
const error = ref('');
const passwordVisible = ref(false);

const esEdicion = computed(() => !!props.correo?.id);

const form = ref({
  plataforma_id: '',
  usuario: '',
  password: '',
  url: '',
  notas: '',
  tipo_cuenta: 'compartida',
});

const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);

function resetForm() {
  error.value = '';
  if (props.correo) {
    form.value = {
      plataforma_id: props.correo.plataforma_id,
      usuario: props.correo.usuario,
      // La contraseña actual nunca viaja al formulario:
      // vacío = se mantiene la actual, escribir algo = se cambia
      password: '',
      url: props.correo.url || '',
      notas: props.correo.notas || '',
      tipo_cuenta: props.correo.tipo_cuenta || 'compartida',
    };
  } else {
    form.value = { plataforma_id: '', usuario: '', password: '', url: '', notas: '', tipo_cuenta: 'compartida' };
  }
  // El snapshot se toma con el form ya poblado (edición) o en blanco (alta)
  tomarSnapshot();
}

watch(() => props.correo, resetForm, { immediate: true });

onMounted(async () => {
  cargandoPlataformas.value = true;
  try {
    plataformas.value = await insforgeApi.listPlataformas();
  } catch (e) {
    error.value = e?.message || 'Error al cargar plataformas';
  } finally {
    cargandoPlataformas.value = false;
  }
});

// Guard de cierre del Modal compartido: Escape y la X (backdrop
// deshabilitado, ver template — formulario de captura, un clic afuera no
// debe perder lo escrito) pasan por acá igual que el botón "Cancelar" —
// con cambios sin guardar se pide confirmación antes de descartar; limpio
// cierra directo.
function generar() {
  form.value.password = generarPassword();
  passwordVisible.value = true;
}

async function guardar() {
  error.value = '';
  guardando.value = true;
  try {
    if (esEdicion.value) {
      // Campo vacío = mantener la contraseña actual; con texto = cambiarla
      // (al cambiarla se limpia el aviso "rotar contraseña")
      await store.actualizar(props.correo.id, {
        ...form.value,
        password_cambiada: form.value.password !== '',
      });
    } else {
      await store.crear(form.value);
    }
    tomarSnapshot();
    resultado = true;
    modal.value?.cerrar();
  } catch (e) {
    error.value = e?.message || 'Error al guardar';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal
    ref="modal"
    :titulo="esEdicion ? 'Editar correo compartido' : 'Nuevo correo compartido'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @close="emit('cerrar', resultado)"
  >
      <form id="correo-form" @submit.prevent="guardar">
        <div class="form-grid">
        <div class="form-group full">
          <label>Tipo de correo *</label>
          <div class="tipo-options">
            <label class="tipo-option" :class="{ 'tipo-option--active': form.tipo_cuenta === 'compartida' }">
              <input v-model="form.tipo_cuenta" type="radio" value="compartida" :disabled="guardando">
              <div class="tipo-option-body">
                <i class="ti ti-users"></i>
                <span class="tipo-option-label">Compartido</span>
                <span class="tipo-option-desc">Varios usuarios activos al mismo tiempo</span>
              </div>
            </label>
            <label class="tipo-option" :class="{ 'tipo-option--active': form.tipo_cuenta === 'reutilizable' }">
              <input v-model="form.tipo_cuenta" type="radio" value="reutilizable" :disabled="guardando">
              <div class="tipo-option-body">
                <i class="ti ti-transfer"></i>
                <span class="tipo-option-label">Reutilizable</span>
                <span class="tipo-option-desc">Un usuario a la vez, se hereda entre personas</span>
              </div>
            </label>
          </div>
        </div>

        <CarbonCampo
          v-model="form.plataforma_id"
          class="full"
          etiqueta="Plataforma"
          tipo="select"
          requerido
          :deshabilitado="guardando || cargandoPlataformas"
        >
          <template #opciones>
            <option value="" disabled>Seleccionar plataforma</option>
            <option v-for="p in plataformas" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </template>
        </CarbonCampo>

        <CarbonCampo
          v-model="form.usuario"
          class="full"
          etiqueta="Correo / usuario"
          requerido
          :deshabilitado="guardando"
          placeholder="marketing@empresa.com"
        />

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
          <button
            type="button"
            class="icon-btn"
            :title="passwordVisible ? 'Ocultar' : 'Mostrar'"
            :aria-label="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            @click="passwordVisible = !passwordVisible"
          >
            <i :class="passwordVisible ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
          </button>
        </div>

        <CarbonCampo
          v-model="form.url"
          class="full"
          etiqueta="URL"
          placeholder="https://..."
          :deshabilitado="guardando"
        />

        <CarbonCampo
          v-model="form.notas"
          class="full"
          etiqueta="Notas"
          tipo="textarea"
          :deshabilitado="guardando"
        />

        </div>

        <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
      </form>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="cancelar">Cancelar</CarbonButton>
      <CarbonButton variante="primary" tipo="submit" form="correo-form" :deshabilitado="guardando" :cargando="guardando">
        {{ guardando ? 'Guardando...' : 'Guardar' }}
      </CarbonButton>
    </template>
  </Modal>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Hay cambios sin guardar, ¿desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cancel="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>

<style scoped>
/* .form-group.full (main.css) exige la clase .form-group, que trae consigo
   estilos de <input>/<select> viejos que pisarían los de CarbonCampo — acá
   se repite solo el grid-column. Vue aplica el scope del padre también a la
   raíz de un componente hijo (CarbonCampo incluido), así que esta regla
   simple alcanza tanto a los <div class="full"> propios como a los
   <CarbonCampo class="full">. */
.full {
  grid-column: 1 / -1;
}

.tipo-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.tipo-option {
  display: flex;
  cursor: pointer;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-base);
  padding: 10px 12px;
  transition: border-color 0.15s, background 0.15s;
}

.tipo-option input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.tipo-option:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.tipo-option:focus-within {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.tipo-option--active {
  border-color: var(--color-primary);
  background: var(--color-accent-subtle);
}

.tipo-option-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tipo-option-body > i {
  font-size: var(--icon-md);
  color: var(--color-primary);
  margin-bottom: 4px;
}

.tipo-option-label {
  font-size: var(--fs-body-01);
  font-weight: 600;
  color: var(--color-text-primary);
}

.tipo-option-desc {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
  line-height: 1.3;
}

.input-with-action {
  display: flex;
  gap: 4px;
  align-items: flex-end;
}

.input-with-action :deep(.cds-campo) {
  flex: 1;
  min-width: 0;
}

</style>
