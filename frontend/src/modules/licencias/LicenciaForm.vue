<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useLicenciasStore } from '../../stores/licencias.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { generarPassword } from '../../core/generarPassword.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import AppButton from '../../components/ui/AppButton.vue';

const infoError = infoNotificacion('error');

const props = defineProps({
  licencia: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

// Migrado a Modal.vue (mismo patrón que EmpleadoForm.vue/AccesoSensibleForm.vue):
// Teleport, bloqueo de scroll del body, atrapamiento de foco y Escape los
// resuelve el componente compartido.
let resultado = false;

const store = useLicenciasStore();

const empresas = ref([]);
const correos = ref([]);
const plataformas = ref([]);
const cargandoCatalogos = ref(false);
const guardando = ref(false);
const error = ref('');
const claveVisible = ref(false);

// Campo que falló la última validación ('' | 'correo' | 'plataforma'), para
// resaltar el control y llevarle el foco además del mensaje de aviso.
const campoInvalido = ref('');
const refGrupoCorreo = ref(null);
const refPlataforma = ref(null);

async function enfocarCampoInvalido() {
  await nextTick();
  if (campoInvalido.value === 'correo') {
    refGrupoCorreo.value?.querySelector('input')?.focus();
  } else if (campoInvalido.value === 'plataforma') {
    refPlataforma.value?.focus();
  }
}

const esEdicion = computed(() => !!props.licencia?.id);

// modo de acceso: 'ninguno' | 'login' (correo vinculado) | 'clave' (serial)
const modoAcceso = ref('ninguno');

const PERIODOS = [
  { value: '', label: 'Sin definir' },
  { value: 1, label: 'Mensual' },
  { value: 3, label: 'Trimestral' },
  { value: 6, label: 'Cada 6 meses' },
  { value: 12, label: 'Anual' },
  { value: 24, label: 'Cada 2 años' },
  { value: 36, label: 'Cada 3 años' },
];

const form = ref({
  software: '',
  tipo: 'suscripcion',
  cantidad: 1,
  empresa_id: '',
  proveedor: '',
  fecha_vencimiento: '',
  renovacion_meses: '',
  costo: '',
  moneda: 'PEN',
  cuenta_id: '',
  clave: '',
  notas: '',
});

// ── Buscador del correo vinculado ─────────────────────────────
const busquedaCorreo = ref('');

// Registro en línea de un correo que aún no existe en el módulo Correos
const registrandoCorreo = ref(false);
const nuevoCorreo = ref({ plataforma_id: '', tipo_cuenta: 'compartida', password: '' });
const passwordCorreoVisible = ref(false);

const campoSoftware = useCampoAccesible();
const campoTipo = useCampoAccesible();
const campoCantidad = useCampoAccesible();
const campoEmpresa = useCampoAccesible();
const campoFechaVencimiento = useCampoAccesible();
const campoRenovacion = useCampoAccesible();
const campoProveedor = useCampoAccesible();
const campoCosto = useCampoAccesible();
const campoPlataformaNueva = useCampoAccesible({
  error: () => (campoInvalido.value === 'plataforma' ? 'Seleccione la plataforma del correo nuevo' : ''),
});
const campoTipoCuenta = useCampoAccesible();
const campoPasswordCorreo = useCampoAccesible();
const campoClaveLogin = useCampoAccesible({
  ayuda: () => 'Algunos software (ej: AutoCAD) usan el correo como usuario pero tienen su propia contraseña. Si se entra con la contraseña del correo, déjelo vacío.',
});
const campoClaveDirecta = useCampoAccesible();
const campoNotas = useCampoAccesible();

const correoEscritoValido = computed(() =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(busquedaCorreo.value.trim())
);

// Si ya existe exactamente ese correo, no tiene sentido ofrecer registrarlo
const correoYaRegistrado = computed(() => {
  const q = busquedaCorreo.value.trim().toLowerCase();
  return correos.value.some((c) => c.usuario.toLowerCase() === q);
});

// Cualquier cambio de selección (elegir de la lista o volver a escribir)
// cancela el modo "registrar correo nuevo" en curso.
function onSeleccionCorreo() {
  registrandoCorreo.value = false;
  campoInvalido.value = '';
}

function elegirRegistrarCorreo() {
  busquedaCorreo.value = busquedaCorreo.value.trim().toLowerCase();
  registrandoCorreo.value = true;
}

// Además del form entran el modo de acceso, el correo buscado/escrito y los
// datos del correo nuevo en línea — todo es captura del usuario.
const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => ({
    form: form.value,
    modoAcceso: modoAcceso.value,
    busquedaCorreo: busquedaCorreo.value,
    registrandoCorreo: registrandoCorreo.value,
    nuevoCorreo: nuevoCorreo.value,
  }));

function resetForm() {
  error.value = '';
  if (props.licencia) {
    form.value = {
      software: props.licencia.software,
      tipo: props.licencia.tipo,
      cantidad: props.licencia.cantidad,
      empresa_id: props.licencia.empresa_id || '',
      proveedor: props.licencia.proveedor || '',
      fecha_vencimiento: props.licencia.fecha_vencimiento || '',
      renovacion_meses: props.licencia.renovacion_meses || '',
      costo: props.licencia.costo ?? '',
      moneda: props.licencia.moneda || 'PEN',
      cuenta_id: props.licencia.cuenta_id || '',
      // La clave actual nunca viaja al formulario: vacío = mantenerla
      clave: '',
      notas: props.licencia.notas || '',
    };
    modoAcceso.value = props.licencia.cuenta_id
      ? 'login'
      : (props.licencia.tiene_clave ? 'clave' : 'ninguno');
    busquedaCorreo.value = props.licencia.cuenta_usuario || '';
  } else {
    form.value = {
      software: '', tipo: 'suscripcion', cantidad: 1, empresa_id: '',
      proveedor: '', fecha_vencimiento: '', renovacion_meses: '',
      costo: '', moneda: 'PEN', cuenta_id: '', clave: '', notas: '',
    };
    modoAcceso.value = 'ninguno';
    busquedaCorreo.value = '';
  }
  registrandoCorreo.value = false;
  nuevoCorreo.value = { plataforma_id: '', tipo_cuenta: 'compartida', password: '' };
  // El snapshot se toma con el form ya poblado (edición) o en blanco (alta)
  tomarSnapshot();
}

watch(() => props.licencia, resetForm, { immediate: true });

// Al corregir el campo señalado, se apaga el resaltado sin esperar a un
// nuevo intento de guardar.
watch(() => nuevoCorreo.value.plataforma_id, (v) => {
  if (v && campoInvalido.value === 'plataforma') campoInvalido.value = '';
});
watch(busquedaCorreo, () => {
  if (campoInvalido.value === 'correo') campoInvalido.value = '';
});

onMounted(async () => {
  cargandoCatalogos.value = true;
  try {
    const [emp, corr, plats] = await Promise.all([
      insforgeApi.listEmpresas(),
      insforgeApi.listCorreosCompartidos(),
      insforgeApi.listPlataformas(),
    ]);
    empresas.value = emp;
    correos.value = corr;
    plataformas.value = plats;
  } catch (e) {
    error.value = e?.message || 'Error al cargar catálogos';
  } finally {
    cargandoCatalogos.value = false;
  }
});

function generarPasswordCorreo() {
  nuevoCorreo.value.password = generarPassword();
  passwordCorreoVisible.value = true;
}

async function guardar() {
  error.value = '';
  campoInvalido.value = '';
  if (modoAcceso.value === 'login' && !form.value.cuenta_id && !registrandoCorreo.value) {
    error.value = 'Seleccione el correo que da acceso a la licencia';
    campoInvalido.value = 'correo';
    enfocarCampoInvalido();
    return;
  }
  if (modoAcceso.value === 'login' && registrandoCorreo.value) {
    if (!correoEscritoValido.value) {
      error.value = 'Escriba un correo válido para registrarlo';
      campoInvalido.value = 'correo';
      enfocarCampoInvalido();
      return;
    }
    if (!nuevoCorreo.value.plataforma_id) {
      error.value = 'Seleccione la plataforma del correo nuevo';
      campoInvalido.value = 'plataforma';
      enfocarCampoInvalido();
      return;
    }
  }
  guardando.value = true;
  try {
    // Correo no registrado: se crea primero en Correos y se vincula.
    // Al lograrlo queda seleccionado, así un reintento no lo duplica.
    if (modoAcceso.value === 'login' && registrandoCorreo.value) {
      const creado = await insforgeApi.createCorreo({
        plataforma_id: nuevoCorreo.value.plataforma_id,
        usuario: busquedaCorreo.value,
        password: nuevoCorreo.value.password,
        tipo_cuenta: nuevoCorreo.value.tipo_cuenta,
      });
      correos.value.push(creado);
      form.value.cuenta_id = creado.id;
      registrandoCorreo.value = false;
    }
    // En modo login, clave = contraseña propia del software (opcional:
    // vacía significa que se entra con la contraseña del correo)
    const conClave = modoAcceso.value === 'clave' || modoAcceso.value === 'login';
    const datos = {
      ...form.value,
      cuenta_id: modoAcceso.value === 'login' ? form.value.cuenta_id : null,
      clave: conClave ? form.value.clave : '',
      clave_cambiada: !conClave || form.value.clave !== '',
    };
    if (esEdicion.value) {
      await store.actualizar(props.licencia.id, datos);
    } else {
      await store.crear(datos);
    }
    tomarSnapshot();
    resultado = true;
    modal.value?.cerrar();
  } catch (e) {
    error.value = e?.message || 'Error al guardar licencia';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal
    ref="modal"
    size="lg"
    :titulo="esEdicion ? 'Editar licencia' : 'Nueva licencia'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @close="emit('cerrar', resultado)"
  >
    <form id="lic-form" class="form-grid" @submit.prevent="guardar">
      <!-- ── Licencia ── -->
      <div class="section-label !mt-0 !border-t-0 !pt-0">
        <i class="ti ti-license" aria-hidden="true"></i> Licencia
      </div>

      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoSoftware.id">Software<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoSoftware.id"
            v-model="form.software"
            class="campo__control"
            type="text"
            placeholder="ej: Microsoft 365 Business"
            required
            :disabled="guardando"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoTipo.id">Tipo<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <select
            :id="campoTipo.id"
            class="campo__control campo__control--select"
            :value="form.tipo"
            required
            :disabled="guardando"
            @change="form.tipo = $event.target.value"
          >
            <option value="suscripcion">Suscripción (se renueva)</option>
            <option value="perpetua">Perpetua (no vence)</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoCantidad.id">Asientos (usuarios máx.)<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoCantidad.id"
            v-model.number="form.cantidad"
            class="campo__control tabular-nums"
            type="number"
            min="1"
            required
            :disabled="guardando"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando || cargandoCatalogos }">
        <label class="campo__etiqueta" :for="campoEmpresa.id">Empresa</label>
        <div class="campo__caja">
          <select
            :id="campoEmpresa.id"
            class="campo__control campo__control--select"
            :value="form.empresa_id"
            :disabled="guardando || cargandoCatalogos"
            @change="form.empresa_id = $event.target.value"
          >
            <option value="">Del grupo (sin empresa)</option>
            <option v-for="e in empresas" :key="e.id" :value="e.id">{{ e.nombre }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoProveedor.id">Proveedor</label>
        <div class="campo__caja">
          <input :id="campoProveedor.id" v-model="form.proveedor" class="campo__control" type="text" :disabled="guardando">
        </div>
      </div>

      <!-- ── Vigencia y costo ── -->
      <div class="section-label">
        <i class="ti ti-calendar-event" aria-hidden="true"></i> Vigencia y costo
      </div>

      <template v-if="form.tipo === 'suscripcion'">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoFechaVencimiento.id">Próximo vencimiento</label>
          <div class="campo__caja">
            <input
              :id="campoFechaVencimiento.id"
              v-model="form.fecha_vencimiento"
              class="campo__control"
              type="date"
              :disabled="guardando"
            >
          </div>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoRenovacion.id">Renovación</label>
          <div class="campo__caja">
            <select
              :id="campoRenovacion.id"
              class="campo__control campo__control--select"
              :value="form.renovacion_meses"
              :disabled="guardando"
              @change="form.renovacion_meses = $event.target.value"
            >
              <option v-for="p in PERIODOS" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>
      </template>
      <p v-else class="full -mt-1 flex items-center gap-2 text-sm text-gray-500">
        <i class="ti ti-infinity text-gray-400" aria-hidden="true"></i> Licencia perpetua: no tiene vencimiento ni renovación.
      </p>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoCosto.id">Costo</label>
        <div class="campo__caja">
          <select
            v-model="form.moneda"
            :disabled="guardando"
            aria-label="Moneda"
            data-ui
            class="shrink-0 cursor-pointer self-stretch rounded-l-md border-0 border-r border-gray-200 bg-gray-50 pl-3 pr-2 text-sm text-gray-700 focus:outline-none"
          >
            <option value="PEN">S/</option>
            <option value="USD">US$</option>
          </select>
          <input
            :id="campoCosto.id"
            v-model="form.costo"
            class="campo__control tabular-nums"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            :disabled="guardando"
          >
        </div>
      </div>

      <!-- ── Modo de acceso ── -->
      <div class="section-label">
        <i class="ti ti-lock-access" aria-hidden="true"></i> Acceso al software
      </div>
      <fieldset class="full">
        <legend class="sr-only">Acceso al software</legend>
        <div class="grid gap-2 sm:grid-cols-3">
          <label
            v-for="op in [
              { valor: 'ninguno', icono: 'ti ti-ban', label: 'Sin credencial', desc: 'Solo registro del contrato' },
              { valor: 'login', icono: 'ti ti-mail', label: 'Con login', desc: 'Se entra con un correo del sistema' },
              { valor: 'clave', icono: 'ti ti-key', label: 'Con clave/serial', desc: 'Clave de activación cifrada' },
            ]"
            :key="op.valor"
            class="relative flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150 focus-within:ring-2 focus-within:ring-primary-500"
            :class="modoAcceso === op.valor ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'"
          >
            <input v-model="modoAcceso" type="radio" :value="op.valor" class="sr-only" :disabled="guardando">
            <i class="mt-0.5 text-lg" :class="[op.icono, modoAcceso === op.valor ? 'text-primary-600' : 'text-gray-400']" aria-hidden="true"></i>
            <span class="min-w-0">
              <span class="block text-sm font-medium" :class="modoAcceso === op.valor ? 'text-primary-700' : 'text-gray-900'">{{ op.label }}</span>
              <span class="mt-0.5 block text-xs text-gray-500">{{ op.desc }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <template v-if="modoAcceso === 'login'">
        <div ref="refGrupoCorreo" class="campo full" :class="{ '[&_.combo-wrap_input]:border-red-500': campoInvalido === 'correo' }">
          <label class="campo__etiqueta" for="lf-cuenta">Correo que da acceso<span aria-hidden="true"> *</span></label>
          <BuscadorCombo
            id="lf-cuenta"
            v-model="form.cuenta_id"
            v-model:busqueda="busquedaCorreo"
            :items="correos"
            :campos-busqueda="['usuario', 'plataforma_nombre']"
            :etiqueta="(c) => c.usuario"
            :placeholder="cargandoCatalogos ? 'Cargando correos...' : 'Buscar correo por dirección o plataforma...'"
            :disabled="guardando || cargandoCatalogos"
            :forzar-cerrado="registrandoCorreo"
            @update:model-value="onSeleccionCorreo"
          >
            <template #icono="{ seleccionado }">
              <i v-if="seleccionado" class="ti ti-circle-check combo-check" aria-hidden="true"></i>
              <i v-else-if="registrandoCorreo" class="ti ti-circle-plus combo-check combo-check--nuevo" aria-hidden="true"></i>
            </template>
            <template #resultado="{ item }">
              <span class="combo-usuario">{{ item.usuario }}</span>
              <span class="combo-plataforma">{{ item.plataforma_nombre }}</span>
            </template>
            <template #vacio="{ sinResultados }">
              <li v-if="sinResultados && !correoEscritoValido" class="combo-vacio">
                Sin resultados. Escriba el correo completo para registrarlo desde aquí.
              </li>
            </template>
            <template #extra>
              <li
                v-if="correoEscritoValido && !correoYaRegistrado"
                class="combo-registrar"
                @mousedown.prevent="elegirRegistrarCorreo"
              >
                <i class="ti ti-circle-plus" aria-hidden="true"></i>
                <span>Registrar <strong>{{ busquedaCorreo.trim().toLowerCase() }}</strong> como correo nuevo</span>
              </li>
            </template>
          </BuscadorCombo>
          <p class="campo__pie">
            Los usuarios se asignan desde la lista de Licencias, desde Correos o desde la ficha del
            empleado: es la misma cuenta. El sistema no permite más personas que asientos comprados.
          </p>
        </div>

        <!-- Datos mínimos del correo que se registrará en Correos -->
        <div v-if="registrandoCorreo" class="full rounded-lg border border-primary-200 bg-primary-50/40 p-4">
          <p class="mb-3 flex items-start gap-2 text-sm text-primary-800">
            <i class="ti ti-mail-plus mt-0.5" aria-hidden="true"></i>
            Este correo no existe todavía: se registrará en el módulo Correos al guardar.
          </p>
          <div class="grid gap-4 md:grid-cols-2">
            <div class="campo" :class="{ 'campo--invalido': campoPlataformaNueva.invalido.value, 'campo--inerte': guardando }">
              <label class="campo__etiqueta" :for="campoPlataformaNueva.id">Plataforma<span aria-hidden="true"> *</span></label>
              <div class="campo__caja">
                <select
                  :id="campoPlataformaNueva.id"
                  ref="refPlataforma"
                  class="campo__control campo__control--select"
                  :value="nuevoCorreo.plataforma_id"
                  required
                  :disabled="guardando"
                  :aria-invalid="campoPlataformaNueva.invalido.value"
                  :aria-describedby="campoPlataformaNueva.describedBy.value"
                  @change="nuevoCorreo.plataforma_id = $event.target.value"
                >
                  <option value="" disabled>Seleccionar plataforma</option>
                  <option v-for="p in plataformas" :key="p.id" :value="p.id">{{ p.nombre }}</option>
                </select>
                <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
              </div>
              <p
                v-if="campoPlataformaNueva.invalido.value"
                :id="campoPlataformaNueva.idAyuda"
                class="campo__pie campo__pie--error"
                role="alert"
              >Seleccione la plataforma del correo nuevo</p>
            </div>

            <div class="campo" :class="{ 'campo--inerte': guardando }">
              <label class="campo__etiqueta" :for="campoTipoCuenta.id">Tipo de correo</label>
              <div class="campo__caja">
                <select
                  :id="campoTipoCuenta.id"
                  class="campo__control campo__control--select"
                  :value="nuevoCorreo.tipo_cuenta"
                  :disabled="guardando"
                  @change="nuevoCorreo.tipo_cuenta = $event.target.value"
                >
                  <option value="compartida">Compartido (varios a la vez)</option>
                  <option value="reutilizable">Reutilizable (uno a la vez)</option>
                </select>
                <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
              </div>
            </div>

            <div class="campo md:col-span-2" :class="{ 'campo--inerte': guardando }">
              <label class="campo__etiqueta" :for="campoPasswordCorreo.id">Contraseña del correo</label>
              <div class="campo__caja pr-1">
                <input
                  :id="campoPasswordCorreo.id"
                  v-model="nuevoCorreo.password"
                  class="campo__control"
                  :type="passwordCorreoVisible ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="Opcional, se puede completar después en Correos"
                  :disabled="guardando"
                >
                <button type="button" class="icon-btn shrink-0" title="Generar contraseña" aria-label="Generar contraseña" :disabled="guardando" @click="generarPasswordCorreo">
                  <i class="ti ti-refresh" aria-hidden="true"></i>
                </button>
                <button type="button" class="icon-btn shrink-0" :title="passwordCorreoVisible ? 'Ocultar' : 'Mostrar'" :aria-label="passwordCorreoVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="passwordCorreoVisible = !passwordCorreoVisible">
                  <i :class="passwordCorreoVisible ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="campo full" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoClaveLogin.id">{{ esEdicion && licencia?.tiene_clave ? 'Nueva contraseña del software' : 'Contraseña del software' }}</label>
          <div class="campo__caja pr-1">
            <input
              :id="campoClaveLogin.id"
              v-model="form.clave"
              class="campo__control"
              :type="claveVisible ? 'text' : 'password'"
              autocomplete="off"
              :placeholder="esEdicion && licencia?.tiene_clave ? 'Dejar vacío para mantener la actual' : 'Dejar vacío si es la misma del correo'"
              :disabled="guardando"
              :aria-describedby="campoClaveLogin.describedBy.value"
            >
            <button type="button" class="icon-btn shrink-0" :title="claveVisible ? 'Ocultar' : 'Mostrar'" :aria-label="claveVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="claveVisible = !claveVisible">
              <i :class="claveVisible ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
            </button>
          </div>
          <p :id="campoClaveLogin.idAyuda" class="campo__pie">Algunos software (ej: AutoCAD) usan el correo como usuario pero tienen su propia contraseña. Si se entra con la contraseña del correo, déjelo vacío.</p>
        </div>
      </template>

      <div v-if="modoAcceso === 'clave'" class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoClaveDirecta.id">{{ esEdicion && licencia?.tiene_clave ? 'Nueva clave/serial' : 'Clave / serial' }}</label>
        <div class="campo__caja pr-1">
          <input
            :id="campoClaveDirecta.id"
            v-model="form.clave"
            class="campo__control tabular-nums"
            :type="claveVisible ? 'text' : 'password'"
            autocomplete="off"
            :placeholder="esEdicion && licencia?.tiene_clave ? 'Dejar vacío para mantener la actual' : 'XXXXX-XXXXX-XXXXX'"
            :disabled="guardando"
          >
          <button type="button" class="icon-btn shrink-0" :title="claveVisible ? 'Ocultar' : 'Mostrar'" :aria-label="claveVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="claveVisible = !claveVisible">
            <i :class="claveVisible ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div class="section-label">
        <i class="ti ti-notes" aria-hidden="true"></i> Notas
      </div>
      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta sr-only" :for="campoNotas.id">Notas</label>
        <div class="campo__caja">
          <textarea :id="campoNotas.id" v-model="form.notas" class="campo__control campo__control--area" :rows="3" :disabled="guardando"></textarea>
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
      <AppButton type="submit" form="lic-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
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
    @cerrado="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>
