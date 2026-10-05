<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useLicenciasStore } from '../../stores/licencias.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import LicenciaAccesoCampos from './LicenciaAccesoCampos.vue';
import { PERIODOS, formVacio, formDesdeLicencia, modoAccesoDe, correoNuevoVacio, esCorreoValido } from './licenciaFormulario.js';

const infoError = infoNotificacion('error');
const props = defineProps({
  licencia: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);
// Sobre AppDialog.vue (mismo patrón que EmpleadoForm.vue/AccesoSensibleForm.vue):
// Teleport, bloqueo de scroll del body, atrapamiento de foco y Escape los
// resuelve el componente compartido. La sección de acceso (modo, correo,
// clave) vive en LicenciaAccesoCampos.vue; el estado se queda acá porque entra
// en el snapshot de cambios sin guardar y en la validación.
let resultado = false;

const store = useLicenciasStore();

const empresas = ref([]);
const correos = ref([]);
const plataformas = ref([]);
const cargandoCatalogos = ref(false);
const guardando = ref(false);
const error = ref('');

// Campo que falló la última validación ('' | 'correo' | 'plataforma'): se resalta y recibe el foco.
const campoInvalido = ref('');
const accesoCampos = ref(null);

async function enfocarCampoInvalido() {
  await nextTick();
  accesoCampos.value?.enfocar(campoInvalido.value);
}

const esEdicion = computed(() => !!props.licencia?.id);

// Modo de acceso: 'ninguno' | 'login' (correo vinculado) | 'clave' (serial)
const modoAcceso = ref('ninguno');
const form = ref(formVacio());

// Buscador del correo vinculado y registro en línea de un correo que aún no
// existe en el módulo Correos
const busquedaCorreo = ref('');
const registrandoCorreo = ref(false);
const nuevoCorreo = ref(correoNuevoVacio());

const campoSoftware = useCampoAccesible();
const campoTipo = useCampoAccesible();
const campoCantidad = useCampoAccesible();
const campoEmpresa = useCampoAccesible();
const campoFechaVencimiento = useCampoAccesible();
const campoRenovacion = useCampoAccesible();
const campoProveedor = useCampoAccesible();
const campoCosto = useCampoAccesible();
const campoNotas = useCampoAccesible();

// Además del form entran el modo de acceso, el correo buscado/escrito y los
// datos del correo nuevo en línea — todo es captura del usuario.
const { modal, mensajeError, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => ({
    form: form.value,
    modoAcceso: modoAcceso.value,
    busquedaCorreo: busquedaCorreo.value,
    registrandoCorreo: registrandoCorreo.value,
    nuevoCorreo: nuevoCorreo.value,
  }));

function resetForm() {
  error.value = '';
  form.value = props.licencia ? formDesdeLicencia(props.licencia) : formVacio();
  modoAcceso.value = modoAccesoDe(props.licencia);
  busquedaCorreo.value = props.licencia?.cuenta_usuario || '';
  registrandoCorreo.value = false;
  nuevoCorreo.value = correoNuevoVacio();
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

// Primer problema del formulario: { mensaje, campo } o null si se puede guardar.
function validar() {
  if (modoAcceso.value !== 'login') return null;
  if (!registrandoCorreo.value) {
    return form.value.cuenta_id ? null : { mensaje: 'Seleccione el correo que da acceso a la licencia', campo: 'correo' };
  }
  if (!esCorreoValido(busquedaCorreo.value)) return { mensaje: 'Escriba un correo válido para registrarlo', campo: 'correo' };
  if (!nuevoCorreo.value.plataforma_id) return { mensaje: 'Seleccione la plataforma del correo nuevo', campo: 'plataforma' };
  return null;
}

// Datos de la cuenta que se crea junto con la licencia (correo "al vuelo").
function cuentaNueva() {
  return {
    plataforma_id: nuevoCorreo.value.plataforma_id,
    usuario: busquedaCorreo.value,
    password: nuevoCorreo.value.password,
    tipo_cuenta: nuevoCorreo.value.tipo_cuenta,
  };
}

async function guardar() {
  error.value = '';
  campoInvalido.value = '';
  const problema = validar();
  if (problema) {
    error.value = problema.mensaje;
    campoInvalido.value = problema.campo;
    enfocarCampoInvalido();
    return;
  }
  guardando.value = true;
  try {
    const registrar = modoAcceso.value === 'login' && registrandoCorreo.value;
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
      // Edición con correo no registrado: se crea primero en Correos y se
      // vincula (no hay RPC de edición). Al lograrlo queda seleccionado, así un
      // reintento no lo duplica.
      if (registrar) {
        const creado = await insforgeApi.createCorreo(cuentaNueva());
        correos.value.push(creado);
        form.value.cuenta_id = creado.id;
        datos.cuenta_id = creado.id;
        registrandoCorreo.value = false;
      }
      await store.actualizar(props.licencia.id, datos);
    } else if (registrar) {
      // Alta con correo nuevo: licencia y correo en UNA transacción (RPC
      // crear_licencia_con_cuenta): si falla, no queda un correo huérfano.
      await store.crear(datos, cuentaNueva());
    } else {
      await store.crear(datos);
    }
    tomarSnapshot();
    resultado = true;
    modal.value?.cerrar();
  } catch (e) {
    error.value = mensajeError(e, { porDefecto: 'Error al guardar licencia' });
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <AppDialog
    ref="modal"
    size="lg"
    :titulo="esEdicion ? 'Editar licencia' : 'Nueva licencia'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @cerrado="emit('cerrar', resultado)"
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
        <i class="ti ti-infinity text-gray-500" aria-hidden="true"></i> Licencia perpetua: no tiene vencimiento ni renovación.
      </p>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoCosto.id">Costo</label>
        <div class="campo__caja">
          <select
            v-model="form.moneda"
            :disabled="guardando"
            aria-label="Moneda"
            data-ui
            class="shrink-0 cursor-pointer self-stretch rounded-l-md border-0 bg-gray-50 pl-3 pr-2 text-sm text-gray-700 focus:outline-none"
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

      <!-- ── Modo de acceso, correo y clave ── -->
      <LicenciaAccesoCampos
        ref="accesoCampos"
        v-model:modo="modoAcceso"
        v-model:cuenta-id="form.cuenta_id"
        v-model:clave="form.clave"
        v-model:busqueda="busquedaCorreo"
        v-model:registrando="registrandoCorreo"
        v-model:correo-nuevo="nuevoCorreo"
        :correos="correos"
        :plataformas="plataformas"
        :cargando-catalogos="cargandoCatalogos"
        :guardando="guardando"
        :campo-invalido="campoInvalido"
        :es-edicion="esEdicion"
        :tiene-clave="!!licencia?.tiene_clave"
        @seleccion-correo="campoInvalido = ''"
      />

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
