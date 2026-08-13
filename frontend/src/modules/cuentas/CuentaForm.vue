<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useDetectorDeCambios } from '../../composables/useDetectorDeCambios.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import { generarPassword } from '../../core/generarPassword.js';
import { showToast } from '../../core/toast.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';

const props = defineProps({
  cuenta: { type: Object, default: null },
  empleadoId: { type: String, required: true },
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

const { estaSucio, tomarSnapshot } = useDetectorDeCambios(() => ({
  form: form.value,
  modoCompartido: modoCompartido.value,
  cuentaCompartidaId: cuentaCompartidaId.value,
}));
const confirmarDescarte = ref(false);
const dialogoDescarte = ref(null);

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
  // El snapshot se toma con el form ya poblado (edición) o en blanco (alta)
  tomarSnapshot();
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
}

async function copiarGenerada() {
  try {
    await navigator.clipboard.writeText(form.value.password);
    showToast('Contraseña copiada');
  } catch {
    showToast('No se pudo copiar. Selecciónala manualmente', 'error');
  }
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
    tomarSnapshot();
    cerrar(true);
  } catch (e) {
    error.value = e?.message || 'Error al guardar cuenta';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Transition name="modal-anim" appear @after-leave="emitirCierre">
  <div v-if="visible" class="modal-bg">
    <div ref="panelModal" class="modal cuenta-form" role="dialog" aria-modal="true" aria-labelledby="cuenta-form-title" tabindex="-1">
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

      <form @submit.prevent="guardar">
        <div class="modal-body form-grid">

        <!-- Modo: correo compartido existente -->
        <template v-if="modoCompartido">
          <div class="form-group full">
            <label for="cf-correo-compartido">Correo compartido *</label>
            <div v-if="cargandoCompartidos" class="loading-inline">Cargando correos compartidos...</div>
            <BuscadorCombo
              v-else
              id="cf-correo-compartido"
              v-model="cuentaCompartidaId"
              :items="correosCompartidos"
              :campos-busqueda="['usuario', 'plataforma_nombre']"
              :etiqueta="(c) => c.usuario"
              placeholder="Buscar correo por dirección o plataforma..."
              :disabled="guardando"
            >
              <template #resultado="{ item }">
                <span class="combo-usuario">{{ item.usuario }}</span>
                <span class="combo-plataforma">{{ item.plataforma_nombre }} · {{ item.tipo_cuenta === 'compartida' ? 'Compartido' : 'Reutilizable' }}</span>
              </template>
            </BuscadorCombo>
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
            <div class="password-wrap">
              <input
                id="cf-password"
                v-model="form.password"
                autocomplete="new-password"
                :placeholder="esEdicion ? 'Dejar vacío para mantener la actual' : ''"
                :disabled="guardando"
              >
              <button class="icon-btn" type="button" title="Generar contraseña" aria-label="Generar contraseña" :disabled="guardando" @click="generar">
                <i class="ti ti-refresh" aria-hidden="true"></i>
              </button>
              <button
                v-if="form.password"
                class="icon-btn"
                type="button"
                title="Copiar contraseña"
                aria-label="Copiar contraseña"
                :disabled="guardando"
                @click="copiarGenerada"
              >
                <i class="ti ti-copy" aria-hidden="true"></i>
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
        </template>

        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="modal-actions full">
          <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ guardando ? 'Guardando...' : (modoCompartido ? 'Asignar' : 'Guardar') }}
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

.password-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.password-wrap input { flex: 1; min-width: 0; }

.field-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
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
