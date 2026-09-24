<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useCorreosStore } from '../../stores/correos.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { generarPassword } from '../../core/generarPassword.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

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

// Opciones del tipo (tarjetas de radio, mismo patrón que el modo de acceso
// de LicenciaForm.vue).
const TIPOS = [
  { valor: 'compartida', icono: 'ti ti-users', label: 'Compartido', desc: 'Varios usuarios activos al mismo tiempo' },
  { valor: 'reutilizable', icono: 'ti ti-transfer', label: 'Reutilizable', desc: 'Un usuario a la vez, se hereda entre personas' },
];

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
    <form id="correo-form" class="form-grid" @submit.prevent="guardar">
      <!-- ── Tipo ── -->
      <fieldset class="full">
        <legend class="campo__etiqueta">Tipo de correo<span aria-hidden="true"> *</span></legend>
        <div class="grid gap-2 sm:grid-cols-2">
          <label
            v-for="op in TIPOS"
            :key="op.valor"
            class="relative flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150 focus-within:ring-2 focus-within:ring-primary-500"
            :class="form.tipo_cuenta === op.valor ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'"
          >
            <input v-model="form.tipo_cuenta" type="radio" :value="op.valor" class="sr-only" :disabled="guardando">
            <i class="mt-0.5 text-lg" :class="[op.icono, form.tipo_cuenta === op.valor ? 'text-primary-600' : 'text-gray-400']" aria-hidden="true"></i>
            <span class="min-w-0">
              <span class="block text-sm font-medium" :class="form.tipo_cuenta === op.valor ? 'text-primary-700' : 'text-gray-900'">{{ op.label }}</span>
              <span class="mt-0.5 block text-xs text-gray-500">{{ op.desc }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <!-- ── Acceso ── -->
      <div class="section-label">
        <i class="ti ti-at" aria-hidden="true"></i> Acceso
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando || cargandoPlataformas }">
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

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoUsuario.id">
          Correo / usuario<span aria-hidden="true"> *</span>
        </label>
        <div class="campo__caja">
          <input
            :id="campoUsuario.id"
            v-model="form.usuario"
            type="text"
            class="campo__control"
            required
            placeholder="marketing@empresa.com"
            :disabled="guardando"
            :aria-invalid="campoUsuario.invalido.value"
            :aria-describedby="campoUsuario.describedBy.value"
          >
        </div>
      </div>

      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoPassword.id">{{ esEdicion ? 'Nueva contraseña' : 'Contraseña' }}</label>
        <div class="campo__caja pr-1">
          <input
            :id="campoPassword.id"
            v-model="form.password"
            :type="passwordVisible ? 'text' : 'password'"
            class="campo__control"
            autocomplete="new-password"
            :placeholder="esEdicion ? 'Dejar vacío para mantener la actual' : ''"
            :disabled="guardando"
            :aria-invalid="campoPassword.invalido.value"
            :aria-describedby="campoPassword.describedBy.value"
          >
          <button type="button" class="icon-btn shrink-0" title="Generar contraseña" aria-label="Generar contraseña" :disabled="guardando" @click="generar">
            <i class="ti ti-refresh" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="icon-btn shrink-0"
            :title="passwordVisible ? 'Ocultar' : 'Mostrar'"
            :aria-label="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            @click="passwordVisible = !passwordVisible"
          >
            <i :class="passwordVisible ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
          </button>
        </div>
        <p v-if="esEdicion" class="campo__pie">Al cambiarla se quita el aviso “Rotar contraseña”.</p>
      </div>

      <!-- ── Detalles ── -->
      <div class="section-label">
        <i class="ti ti-notes" aria-hidden="true"></i> Detalles
      </div>

      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoUrl.id">URL de acceso</label>
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

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton type="submit" form="correo-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
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
