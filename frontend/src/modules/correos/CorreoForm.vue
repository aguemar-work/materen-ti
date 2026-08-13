<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useCorreosStore } from '../../stores/correos.js';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useDetectorDeCambios } from '../../composables/useDetectorDeCambios.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import { generarPassword } from '../../core/generarPassword.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const props = defineProps({
  correo: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

// Cierre animado (Fase 3): cerrar() dispara la transición de salida y el
// emit real sale en @after-leave, así el padre desmonta sin cortarla.
const visible = ref(true);
let resultadoCierre = false;

function cerrar(resultado) {
  resultadoCierre = resultado;
  visible.value = false;
}

function emitirCierre() {
  emit('cerrar', resultadoCierre);
}

// Foco atrapado mientras el modal vive; al desmontar vuelve a quien lo abrió
const panelModal = ref(null);
useFocoAtrapado(panelModal);

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

const { estaSucio, tomarSnapshot } = useDetectorDeCambios(() => form.value);
const confirmarDescarte = ref(false);
const dialogoDescarte = ref(null);

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

// Cancelar, la X y Escape pasan por acá: con cambios sin guardar se pide
// confirmación antes de descartar; limpio cierra directo.
function cancelar() {
  if (!visible.value) return;
  if (estaSucio.value) {
    confirmarDescarte.value = true;
    return;
  }
  cerrar(false);
}

function descartarCambios() {
  // El diálogo sale animado (su @cancel al terminar baja confirmarDescarte)
  // mientras el formulario inicia su propia salida en paralelo
  dialogoDescarte.value?.cerrar();
  cerrar(false);
}

// Formulario de captura: clic fuera NO cierra (se perdería lo escrito);
// solo Cancelar, la X o Escape.
useCerrarConEscape(() => { if (!guardando.value) cancelar(); });

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
    cerrar(true);
  } catch (e) {
    error.value = e?.message || 'Error al guardar';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Transition name="modal-anim" appear @after-leave="emitirCierre">
  <div v-if="visible" class="modal-bg">
    <div ref="panelModal" class="modal correo-form" role="dialog" aria-modal="true" aria-labelledby="correo-form-title" tabindex="-1">
      <div class="modal-title">
        <span id="correo-form-title">{{ esEdicion ? 'Editar correo compartido' : 'Nuevo correo compartido' }}</span>
        <button class="icon-btn" type="button" aria-label="Cerrar" @click="cancelar">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>

      <form @submit.prevent="guardar">
        <div class="modal-body form-grid">
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

        <div class="form-group full">
          <label for="cf-plataforma">Plataforma *</label>
          <select
            id="cf-plataforma"
            v-model="form.plataforma_id"
            required
            :disabled="guardando || cargandoPlataformas"
          >
            <option value="" disabled>Seleccionar plataforma</option>
            <option v-for="p in plataformas" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select>
        </div>

        <div class="form-group full">
          <label for="cf-usuario">Correo / usuario *</label>
          <input id="cf-usuario" v-model="form.usuario" required :disabled="guardando" placeholder="marketing@empresa.com">
        </div>

        <div class="form-group full">
          <label for="cf-password">{{ esEdicion ? 'Nueva contraseña' : 'Contraseña' }}</label>
          <div class="input-with-action">
            <input
              id="cf-password"
              v-model="form.password"
              :type="passwordVisible ? 'text' : 'password'"
              autocomplete="new-password"
              :placeholder="esEdicion ? 'Dejar vacío para mantener la actual' : ''"
              :disabled="guardando"
            >
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
        </div>

        <div class="form-group full">
          <label for="cf-url">URL</label>
          <input id="cf-url" v-model="form.url" type="text" placeholder="https://..." :disabled="guardando">
        </div>

        <div class="form-group full">
          <label for="cf-notas">Notas</label>
          <textarea id="cf-notas" v-model="form.notas" :disabled="guardando"></textarea>
        </div>

        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="modal-actions full">
          <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ guardando ? 'Guardando...' : 'Guardar' }}
          </button>
        </div>
      </form>
    </div>
  </div>
  </Transition>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Tienes cambios sin guardar, ¿deseas continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cancel="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>

<style scoped>
.tipo-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.tipo-option {
  display: flex;
  cursor: pointer;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
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
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.tipo-option-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tipo-option-body > i {
  font-size: 18px;
  color: var(--color-primary);
  margin-bottom: 4px;
}

.tipo-option-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.tipo-option-desc {
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 1.3;
}

.input-with-action {
  display: flex;
  gap: 4px;
  align-items: center;
}

.input-with-action input {
  flex: 1;
}


.modal-actions.full {
  grid-column: 1 / -1;
}
</style>
