<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { generarPassword } from '../../core/generarPassword.js';
import { showToast } from '../../core/toast.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import { traducirErrorDb } from '../../api/erroresDb.js';
import AppButton from '../../components/ui/AppButton.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const props = defineProps({
  cuenta: { type: Object, default: null },
  empleadoId: { type: String, required: true },
});

const emit = defineEmits(['cerrar']);

// Sobre AppDialog (diálogo único del sistema): bloqueo de scroll, foco
// atrapado y Escape los resuelve el componente compartido. `@cerrado` se emite
// en todo cierre; `resultado` dice si hubo guardado.
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

const { modal, mensajeError, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
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
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudieron cargar las plataformas.' }).mensaje;
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
      error.value = traducirErrorDb(e, { porDefecto: 'No se pudieron cargar los correos compartidos.' }).mensaje;
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
    showToast('No se pudo copiar. Selecciónela manualmente', 'error');
  }
}

async function guardar() {
  error.value = '';
  guardando.value = true;
  try {
    if (modoCompartido.value) {
      if (!cuentaCompartidaId.value) {
        error.value = 'Seleccione un correo compartido';
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
    error.value = mensajeError(e, { porDefecto: 'Error al guardar cuenta' });
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <AppDialog
    ref="modal"
    :titulo="esEdicion ? 'Editar cuenta' : 'Nueva cuenta'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="cuenta-form" class="form-grid" @submit.prevent="guardar">
      <!-- Modo: solo al crear. Personal = cuenta nueva del empleado;
           compartido = asignarle un correo que ya existe en Correos. -->
      <div v-if="!esEdicion" class="full grid gap-2 sm:grid-cols-2" role="group" aria-label="Tipo de cuenta">
        <button
          type="button"
          class="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          :class="!modoCompartido ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'"
          :aria-pressed="!modoCompartido"
          :disabled="guardando"
          @click="modoCompartido = false; error = ''"
        >
          <i class="ti ti-user mt-0.5 text-lg" :class="!modoCompartido ? 'text-primary-600' : 'text-gray-500'" aria-hidden="true"></i>
          <span class="min-w-0">
            <span class="block text-sm font-medium" :class="!modoCompartido ? 'text-primary-700' : 'text-gray-900'">Cuenta personal</span>
            <span class="mt-0.5 block text-xs text-gray-500">Usuario propio del empleado en una plataforma</span>
          </span>
        </button>
        <button
          type="button"
          class="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          :class="modoCompartido ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'"
          :aria-pressed="modoCompartido"
          :disabled="guardando"
          @click="activarModoCompartido"
        >
          <i class="ti ti-users mt-0.5 text-lg" :class="modoCompartido ? 'text-primary-600' : 'text-gray-500'" aria-hidden="true"></i>
          <span class="min-w-0">
            <span class="block text-sm font-medium" :class="modoCompartido ? 'text-primary-700' : 'text-gray-900'">Correo compartido</span>
            <span class="mt-0.5 block text-xs text-gray-500">Asignar uno que ya existe en el módulo Correos</span>
          </span>
        </button>
      </div>

      <!-- Modo: correo compartido existente -->
      <template v-if="modoCompartido">
        <div class="campo full">
          <label class="campo__etiqueta" for="cf-correo-compartido">Correo compartido<span aria-hidden="true"> *</span></label>
          <p v-if="cargandoCompartidos" class="py-2 text-sm text-gray-500" role="status">Cargando correos compartidos...</p>
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
              <span class="min-w-0 truncate text-xs">{{ item.usuario }}</span>
              <span class="whitespace-nowrap text-xs text-gray-500">{{ item.plataforma_nombre }} · {{ item.tipo_cuenta === 'compartida' ? 'Compartido' : 'Reutilizable' }}</span>
            </template>
          </BuscadorCombo>
          <p v-if="!cargandoCompartidos && correosCompartidos.length === 0" class="campo__pie">
            No hay correos compartidos registrados.
            <a class="text-primary-700 hover:underline" href="/correos" target="_blank">Ir al módulo de correos compartidos</a>
          </p>
          <p v-else class="campo__pie">El empleado se suma a quienes ya usan ese correo; la contraseña no cambia.</p>
        </div>
      </template>

      <!-- Modo: cuenta personal nueva o edición -->
      <template v-else>
        <div v-if="!esEdicion" class="section-label">
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

        <div class="campo full" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoPassword.id">{{ esEdicion ? 'Nueva contraseña' : 'Contraseña' }}</label>
          <div class="campo__caja pr-1">
            <input
              :id="campoPassword.id"
              v-model="form.password"
              type="text"
              class="campo__control font-mono"
              autocomplete="new-password"
              :placeholder="esEdicion ? 'Dejar vacío para mantener la actual' : ''"
              :disabled="guardando"
              :aria-invalid="campoPassword.invalido.value"
              :aria-describedby="campoPassword.describedBy.value"
            >
            <button class="icon-btn shrink-0" type="button" title="Generar contraseña" aria-label="Generar contraseña" :disabled="guardando" @click="generar">
              <i class="ti ti-refresh" aria-hidden="true"></i>
            </button>
            <button
              v-if="form.password"
              class="icon-btn shrink-0"
              type="button"
              title="Copiar contraseña"
              aria-label="Copiar contraseña"
              :disabled="guardando"
              @click="copiarGenerada"
            >
              <i class="ti ti-copy" aria-hidden="true"></i>
            </button>
          </div>
          <p v-if="esEdicion" class="campo__pie">Al cambiarla se quita el aviso “Rotar contraseña”.</p>
        </div>

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
      </template>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton
        type="submit"
        form="cuenta-form"
        :label="guardando ? 'Guardando...' : (modoCompartido ? 'Asignar' : 'Guardar')"
        :loading="guardando"
      />
    </template>
  </AppDialog>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Hay cambios sin guardar, ¿desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cerrado="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>
