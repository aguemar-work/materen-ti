<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { generarPassword } from '../../core/generarPassword.js';
import { showToast } from '../../core/toast.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const props = defineProps({
  cuenta: { type: Object, default: null },
  empleadoId: { type: String, required: true },
});

const emit = defineEmits(['cerrar']);

// Migrado a Modal.vue (pasada de diseño ago 2026, mismo patrón que
// EmpleadoForm.vue/AccesoSensibleForm.vue): Teleport, bloqueo de scroll del
// body, atrapamiento de foco y Escape los resuelve el componente
// compartido.
let resultado = false;

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

const infoError = infoNotificacion('error');
const campoPlataforma = useCampoAccesible();
const campoUsuario = useCampoAccesible();
const campoPassword = useCampoAccesible();
const campoUrl = useCampoAccesible();
const campoNotas = useCampoAccesible();

const form = ref({
  plataforma_id: '',
  usuario: '',
  password: '',
  url: '',
  notas: '',
});

const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => ({
  form: form.value,
  modoCompartido: modoCompartido.value,
  cuentaCompartidaId: cuentaCompartidaId.value,
}));

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

// Guard de cierre del Modal compartido: Escape y la X (backdrop
// deshabilitado, ver template — formulario de captura, un clic afuera no
// debe perder lo escrito) pasan por acá igual que el botón "Cancelar" —
// con cambios sin guardar se pide confirmación antes de descartar; limpio
// cierra directo.
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
    resultado = true;
    modal.value?.cerrar();
  } catch (e) {
    error.value = e?.message || 'Error al guardar cuenta';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal
    ref="modal"
    :titulo="esEdicion ? 'Editar cuenta' : 'Nueva cuenta'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @close="emit('cerrar', resultado)"
  >
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

      <form id="cuenta-form" @submit.prevent="guardar">
        <div class="form-grid">

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
          <div class="campo full" :class="{ 'campo--inerte': guardando || cargandoPlataformas }">
            <label class="campo__etiqueta" :for="campoPlataforma.id">
              Plataforma<span aria-hidden="true"> *</span>
            </label>
            <div class="campo__caja">
              <select
                :id="campoPlataforma.id"
                v-model="form.plataforma_id"
                class="campo__control campo__control--select"
                required
                :disabled="guardando || cargandoPlataformas"
                :aria-invalid="campoPlataforma.invalido.value"
                :aria-describedby="campoPlataforma.describedBy.value"
              >
                <option value="" disabled>Seleccionar plataforma</option>
                <option v-for="p in plataformas" :key="p.id" :value="p.id">{{ p.nombre }}</option>
              </select>
              <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
            </div>
          </div>

          <div class="campo full" :class="{ 'campo--inerte': guardando }">
            <label class="campo__etiqueta" :for="campoUsuario.id">
              Usuario<span aria-hidden="true"> *</span>
            </label>
            <div class="campo__caja">
              <input
                :id="campoUsuario.id"
                v-model="form.usuario"
                type="text"
                class="campo__control"
                required
                :disabled="guardando"
                :aria-invalid="campoUsuario.invalido.value"
                :aria-describedby="campoUsuario.describedBy.value"
              >
            </div>
          </div>

          <div class="full input-with-action">
            <div class="campo" :class="{ 'campo--inerte': guardando }">
              <label class="campo__etiqueta" :for="campoPassword.id">{{ esEdicion ? 'Nueva contraseña' : 'Contraseña' }}</label>
              <div class="campo__caja">
                <input
                  :id="campoPassword.id"
                  v-model="form.password"
                  type="text"
                  class="campo__control"
                  autocomplete="new-password"
                  :placeholder="esEdicion ? 'Dejar vacío para mantener la actual' : ''"
                  :disabled="guardando"
                  :aria-invalid="campoPassword.invalido.value"
                  :aria-describedby="campoPassword.describedBy.value"
                >
              </div>
            </div>
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

          <div class="campo full" :class="{ 'campo--inerte': guardando }">
            <label class="campo__etiqueta" :for="campoUrl.id">URL</label>
            <div class="campo__caja">
              <input
                :id="campoUrl.id"
                v-model="form.url"
                type="text"
                class="campo__control"
                placeholder="https://..."
                :disabled="guardando"
                :aria-invalid="campoUrl.invalido.value"
                :aria-describedby="campoUrl.describedBy.value"
              >
            </div>
          </div>

          <div class="campo full" :class="{ 'campo--inerte': guardando }">
            <label class="campo__etiqueta" :for="campoNotas.id">Notas</label>
            <div class="campo__caja">
              <textarea
                :id="campoNotas.id"
                v-model="form.notas"
                class="campo__control campo__control--area"
                rows="3"
                :disabled="guardando"
                :aria-invalid="campoNotas.invalido.value"
                :aria-describedby="campoNotas.describedBy.value"
              ></textarea>
            </div>
          </div>
        </template>

        </div>

        <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
          <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
          <div class="notif__texto">
            <p class="notif__detalle">{{ error }}</p>
          </div>
        </div>
      </form>

    <template #acciones>
      <button type="button" class="btn btn--secondary btn--md" :disabled="guardando" @click="cancelar">Cancelar</button>
      <button type="submit" form="cuenta-form" class="btn btn--primary btn--md" :disabled="guardando">
        {{ guardando ? 'Guardando...' : (modoCompartido ? 'Asignar' : 'Guardar') }}
        <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
      </button>
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


