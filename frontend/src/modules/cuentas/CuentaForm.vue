<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useCuentasStore } from '../../stores/cuentas.js';

const props = defineProps({
  cuenta: { type: Object, default: null },
  empleadoId: { type: String, required: true },
});

const emit = defineEmits(['cerrar']);

const store = useCuentasStore();

const plataformas = ref([]);
const cargandoPlataformas = ref(false);
const guardando = ref(false);
const error = ref('');

const modoCompartido = ref(false);
const correosCompartidos = ref([]);
const cargandoCompartidos = ref(false);
const cuentaCompartidaId = ref('');

const esEdicion = computed(() => !!props.cuenta?.id);

const form = ref({
  plataforma_id: '',
  usuario: '',
  password: '',
  url: '',
  notas: '',
});

function resetForm() {
  modoCompartido.value = false;
  cuentaCompartidaId.value = '';
  error.value = '';
  if (props.cuenta) {
    form.value = {
      plataforma_id: props.cuenta.plataforma_id,
      usuario: props.cuenta.usuario,
      // La contraseña actual nunca viaja al formulario:
      // vacío = se mantiene la actual, escribir algo = se cambia
      password: '',
      url: props.cuenta.url || '',
      notas: props.cuenta.notas || '',
    };
  } else {
    form.value = { plataforma_id: '', usuario: '', password: '', url: '', notas: '' };
  }
}

watch(() => props.cuenta, resetForm, { immediate: true });

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

async function activarModoCompartido() {
  modoCompartido.value = true;
  error.value = '';
  if (!correosCompartidos.value.length) {
    cargandoCompartidos.value = true;
    try {
      correosCompartidos.value = await insforgeApi.listCorreosAsignables();
    } catch (e) {
      error.value = e?.message || 'Error al cargar correos compartidos';
    } finally {
      cargandoCompartidos.value = false;
    }
  }
}

function cancelar() {
  emit('cerrar', false);
}

async function guardar() {
  error.value = '';
  guardando.value = true;
  try {
    if (modoCompartido.value) {
      if (!cuentaCompartidaId.value) {
        error.value = 'Selecciona un correo compartido';
        guardando.value = false;
        return;
      }
      await store.asignarCompartida(props.empleadoId, cuentaCompartidaId.value);
    } else if (esEdicion.value) {
      // Campo vacío = mantener la contraseña actual; con texto = cambiarla
      // (al cambiarla se limpia el aviso "rotar contraseña")
      await store.actualizar(props.cuenta.id, {
        ...form.value,
        password_cambiada: form.value.password !== '',
      });
    } else {
      await store.crear(props.empleadoId, form.value);
    }
    emit('cerrar', true);
  } catch (e) {
    error.value = e?.message || 'Error al guardar cuenta';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="modal-bg" @click.self="cancelar">
    <div class="modal cuenta-form" role="dialog" aria-labelledby="cuenta-form-title">
      <div class="modal-title">
        <span id="cuenta-form-title">{{ esEdicion ? 'Editar cuenta' : 'Nueva cuenta' }}</span>
        <button class="icon-btn" type="button" aria-label="Cerrar" @click="cancelar">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Toggle solo visible al crear, no al editar -->
      <div v-if="!esEdicion" class="modo-toggle">
        <button
          class="modo-btn"
          :class="{ 'modo-btn--active': !modoCompartido }"
          type="button"
          @click="modoCompartido = false; error = ''"
        >
          <i class="ti ti-user" aria-hidden="true"></i> Cuenta personal
        </button>
        <button
          class="modo-btn"
          :class="{ 'modo-btn--active': modoCompartido }"
          type="button"
          @click="activarModoCompartido"
        >
          <i class="ti ti-users" aria-hidden="true"></i> Correo compartido
        </button>
      </div>

      <form class="form-grid" @submit.prevent="guardar">

        <!-- Modo: correo compartido existente -->
        <template v-if="modoCompartido">
          <div class="form-group full">
            <label for="cf-correo-compartido">Correo compartido *</label>
            <div v-if="cargandoCompartidos" class="loading-inline">Cargando correos compartidos...</div>
            <select
              v-else
              id="cf-correo-compartido"
              v-model="cuentaCompartidaId"
              required
              :disabled="guardando"
            >
              <option value="" disabled>Seleccionar correo compartido</option>
              <option v-for="c in correosCompartidos" :key="c.id" :value="c.id">
                {{ c.plataforma_nombre }} — {{ c.usuario }} ({{ c.tipo_cuenta === 'compartida' ? 'Compartido' : 'Reutilizable' }})
              </option>
            </select>
            <p v-if="!cargandoCompartidos && correosCompartidos.length === 0" class="field-hint">
              No hay correos compartidos registrados.
              <a href="/correos" target="_blank">Ir al módulo de correos compartidos</a>
            </p>
          </div>
        </template>

        <!-- Modo: cuenta personal nueva o edición -->
        <template v-else>
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
            <label for="cf-usuario">Usuario *</label>
            <input id="cf-usuario" v-model="form.usuario" required :disabled="guardando">
          </div>

          <div class="form-group full">
            <label for="cf-password">{{ esEdicion ? 'Nueva contraseña' : 'Contraseña' }}</label>
            <input
              id="cf-password"
              v-model="form.password"
              autocomplete="new-password"
              :placeholder="esEdicion ? 'Dejar vacío para mantener la actual' : ''"
              :disabled="guardando"
            >
          </div>

          <div class="form-group full">
            <label for="cf-url">URL</label>
            <input id="cf-url" v-model="form.url" type="text" placeholder="https://..." :disabled="guardando">
          </div>

          <div class="form-group full">
            <label for="cf-notas">Notas</label>
            <textarea id="cf-notas" v-model="form.notas" :disabled="guardando"></textarea>
          </div>
        </template>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="modal-actions full">
          <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            {{ guardando ? 'Guardando...' : (modoCompartido ? 'Asignar' : 'Guardar') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modo-toggle {
  display: flex;
  gap: 0;
  padding: 0 24px 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 4px;
}

.modo-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 0;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}

.modo-btn:hover {
  color: var(--color-text-primary);
}

.modo-btn--active {
  color: var(--color-primary, var(--color-accent));
  border-bottom-color: var(--color-primary, var(--color-accent));
}

.loading-inline {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  padding: 8px 0;
}

.field-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-secondary));
}

.field-hint a {
  color: var(--color-primary, var(--color-accent));
  text-decoration: none;
}

.field-hint a:hover {
  text-decoration: underline;
}


.modal-actions.full {
  grid-column: 1 / -1;
}
</style>
