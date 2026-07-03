<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useCorreosStore } from '../../stores/correos.js';

const props = defineProps({
  correo: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

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

function cancelar() {
  emit('cerrar', false);
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
    emit('cerrar', true);
  } catch (e) {
    error.value = e?.message || 'Error al guardar';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="modal-bg" @click.self="cancelar">
    <div class="modal correo-form" role="dialog" aria-labelledby="correo-form-title">
      <div class="modal-title">
        <span id="correo-form-title">{{ esEdicion ? 'Editar correo compartido' : 'Nuevo correo compartido' }}</span>
        <button class="icon-btn" type="button" aria-label="Cerrar" @click="cancelar">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>

      <form class="form-grid" @submit.prevent="guardar">
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
            <button
              type="button"
              class="icon-btn"
              :title="passwordVisible ? 'Ocultar' : 'Mostrar'"
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

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="modal-actions full">
          <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            {{ guardando ? 'Guardando...' : 'Guardar' }}
          </button>
        </div>
      </form>
    </div>
  </div>
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

.form-error {
  grid-column: 1 / -1;
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 13px;
  margin: 0;
}

.modal-actions.full {
  grid-column: 1 / -1;
}
</style>
