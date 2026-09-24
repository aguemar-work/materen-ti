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
import AppButton from '../../components/ui/AppButton.vue';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

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

const campoNombre = useCampoAccesible();
const campoCategoria = useCampoAccesible();
const campoUsuario = useCampoAccesible();
const campoPassword = useCampoAccesible();
const campoNotas = useCampoAccesible();
const infoErrorForm = infoNotificacion('error');

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
      <!-- ── Credencial ── -->
      <div class="section-label !mt-0 !border-t-0 !pt-0">
        <i class="ti ti-key" aria-hidden="true"></i> Credencial
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoNombre.id">Nombre<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoNombre.id"
            v-model="form.nombre"
            class="campo__control"
            type="text"
            placeholder="ej: Router principal, Correo gerencia"
            required
            :disabled="guardando"
            :aria-invalid="campoNombre.invalido.value"
            :aria-describedby="campoNombre.describedBy.value"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoCategoria.id">Categoría<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <select
            :id="campoCategoria.id"
            v-model="form.categoria"
            class="campo__control campo__control--select"
            required
            :disabled="guardando"
            :aria-invalid="campoCategoria.invalido.value"
            :aria-describedby="campoCategoria.describedBy.value"
          >
            <option value="" disabled>Seleccionar categoría</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.label }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoUsuario.id">Usuario<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoUsuario.id"
            v-model="form.usuario"
            class="campo__control"
            type="text"
            required
            :disabled="guardando"
            :aria-invalid="campoUsuario.invalido.value"
            :aria-describedby="campoUsuario.describedBy.value"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoPassword.id">{{ esEdicion ? 'Nueva contraseña' : 'Contraseña' }}</label>
        <div class="campo__caja pr-1">
          <input
            :id="campoPassword.id"
            v-model="form.password"
            class="campo__control"
            :type="passwordVisible ? 'text' : 'password'"
            autocomplete="new-password"
            :placeholder="esEdicion ? 'Vacío = mantener la actual' : ''"
            :disabled="guardando"
            :aria-invalid="campoPassword.invalido.value"
            :aria-describedby="campoPassword.describedBy.value"
          >
          <button type="button" class="icon-btn shrink-0" title="Generar contraseña" aria-label="Generar contraseña" :disabled="guardando" @click="generar">
            <i class="ti ti-refresh" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-btn shrink-0" :title="passwordVisible ? 'Ocultar' : 'Mostrar'" :aria-label="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="passwordVisible = !passwordVisible">
            <i :class="passwordVisible ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoNotas.id">Notas</label>
        <div class="campo__caja">
          <textarea
            :id="campoNotas.id"
            v-model="form.notas"
            class="campo__control campo__control--area"
            :rows="2"
            :disabled="guardando"
            :aria-invalid="campoNotas.invalido.value"
            :aria-describedby="campoNotas.describedBy.value"
          ></textarea>
        </div>
      </div>

      <!-- ── Permisos ── -->
      <div class="section-label">
        <i class="ti ti-shield-lock" aria-hidden="true"></i> Quién puede revelar esta credencial
      </div>

      <fieldset class="full">
        <legend class="sr-only">JEFE con permiso sobre esta credencial</legend>
        <p v-if="cargandoJefes" class="py-3 text-sm text-gray-500" role="status">Cargando JEFEs...</p>
        <ul v-else class="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200">
          <li v-for="j in jefesActivos" :key="j.user_id">
            <label
              class="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-150"
              :class="j.user_id === auth.user.id ? 'cursor-default bg-gray-50' : 'cursor-pointer hover:bg-gray-50'"
            >
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0 accent-primary-600"
                :checked="permisosSeleccionados.includes(j.user_id)"
                :disabled="guardando || j.user_id === auth.user.id"
                @change="togglePermiso(j.user_id)"
              >
              <AppAvatar :nombre="j.nombre" />
              <span class="min-w-0 flex-1 truncate text-gray-900">{{ j.nombre }}</span>
              <span v-if="j.user_id === auth.user.id" class="shrink-0 text-xs text-gray-500">Usted · siempre incluido</span>
            </label>
          </li>
        </ul>
        <p class="mt-2 text-xs text-gray-500">
          Solo los JEFE marcados podrán revelar, editar o eliminar esta credencial. Su propio permiso queda incluido siempre.
        </p>
      </fieldset>

      <div v-if="error" class="notif" :class="[`notif--${infoErrorForm.rol}`, 'notif--inline']" :role="infoErrorForm.rolAria">
        <i class="ti" :class="infoErrorForm.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton
        type="submit"
        form="acceso-sensible-form"
        :label="guardando ? 'Guardando...' : 'Guardar'"
        :loading="guardando"
        :disabled="cargandoJefes"
      />
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
    @cerrado="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>
