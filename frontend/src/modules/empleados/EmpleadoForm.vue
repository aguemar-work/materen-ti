<script setup>
import { ref, computed, watch, onMounted, nextTick, useTemplateRef } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { normalizarTelefono, onlyDigits } from '../../core/formatters.js';
import { nombreCompleto, estadoEmpleadoInfo } from '../../core/dominio-empleados.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import { traducirErrorDb } from '../../api/erroresDb.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const infoError = infoNotificacion('error');

const props = defineProps({
  empleado: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['cerrar']);

// Sobre AppDialog (diálogo único; antes Modal.vue, pasada de diseño ago 2026, mismo patrón que
// AccesoSensibleForm.vue): Teleport, bloqueo de scroll del body,
// atrapamiento de foco y Escape los resuelve el componente compartido —
// antes este archivo los reimplementaba a mano y le faltaban los dos
// primeros (bug real, UX6-03 en docs/HISTORIAL-AUDITORIAS.md).
let resultado = false;

const store = useEmpleadosStore();

const empresas = ref([]);
const areasObras = ref([]);
const ubicaciones = ref([]);
const cargandoEmpresas = ref(false);
const guardando = ref(false);
const error = ref('');

// Campo que falló el último guardado ('' | 'dni'), para resaltar el control
// y llevarle el foco además del aviso de error del formulario. Mismo patrón
// que EquipoForm.vue.
const campoInvalido = ref('');
const refDni = useTemplateRef('refDni');

// Empleado que ya tiene el DNI que se intentó guardar (unique global de
// `empleados.dni`, migración 002 — incluye a los dados de baja). Antes el
// aviso solo decía "ya existe" y había que ir a buscarlo a mano; ahora dice
// quién es y, en el alta, lleva a su ficha (si está Inactivo, ahí está
// "Reactivar": volver a registrarlo no es el camino).
const duplicado = ref(null);
const duplicadoInactivo = computed(() => duplicado.value?.estado === 'Inactivo');

async function enfocarCampoInvalido() {
  await nextTick();
  const refs = { dni: refDni };
  refs[campoInvalido.value]?.value?.focus();
}

const esEdicion = computed(() => !!props.empleado?.id);

const form = ref({
  nombres: '',
  apellidos: '',
  dni: '',
  telefono: '',
  whatsapp: '',
  correo_personal: '',
  cargo: '',
  empresa_id: '',
  area_obra_id: '',
  ubicacion_id: '',
  estado: 'Activo',
  fecha_alta: new Date().toISOString().slice(0, 10),
  notas: '',
});

const { modal, mensajeError, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);

const campoNombres = useCampoAccesible();
const campoApellidos = useCampoAccesible();
const campoDni = useCampoAccesible({ error: () => (campoInvalido.value === 'dni' ? 'Ya existe un empleado con ese DNI' : '') });
const campoCorreoPersonal = useCampoAccesible();
const campoTelefono = useCampoAccesible();
const campoWhatsapp = useCampoAccesible();
const campoEmpresa = useCampoAccesible();
const campoAreaObra = useCampoAccesible();
const campoUbicacion = useCampoAccesible();
const campoCargo = useCampoAccesible();
const campoFechaAlta = useCampoAccesible();
const campoNotas = useCampoAccesible();

function resetForm() {
  if (props.empleado?.id) {
    form.value = {
      nombres: props.empleado.nombres,
      apellidos: props.empleado.apellidos,
      dni: props.empleado.dni,
      telefono: props.empleado.telefono || '',
      whatsapp: props.empleado.whatsapp || '',
      correo_personal: props.empleado.correo_personal || '',
      cargo: props.empleado.cargo || '',
      empresa_id: props.empleado.empresa_id,
      area_obra_id: props.empleado.area_obra_id || '',
      ubicacion_id: props.empleado.ubicacion_id || '',
      estado: props.empleado.estado,
      fecha_alta: props.empleado.fecha_alta || new Date().toISOString().slice(0, 10),
      notas: props.empleado.notas || '',
    };
  } else {
    form.value = {
      nombres: '',
      apellidos: '',
      dni: '',
      telefono: '',
      whatsapp: '',
      correo_personal: '',
      cargo: '',
      empresa_id: '',
      area_obra_id: '',
      ubicacion_id: '',
      estado: 'Activo',
      fecha_alta: new Date().toISOString().slice(0, 10),
      notas: '',
    };
  }
  error.value = '';
  // El snapshot se toma con el form ya poblado (edición) o en blanco (alta)
  tomarSnapshot();
}

watch(() => props.empleado, resetForm, { immediate: true });

onMounted(async () => {
  cargandoEmpresas.value = true;
  try {
    [empresas.value, areasObras.value, ubicaciones.value] = await Promise.all([
      insforgeApi.listEmpresas(),
      insforgeApi.listAreasObras(),
      insforgeApi.listUbicaciones(),
    ]);
  } catch (e) {
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudieron cargar los catálogos.' }).mensaje;
  } finally {
    cargandoEmpresas.value = false;
  }
});

function copiarTelefono() {
  form.value.whatsapp = form.value.telefono;
}

// Al salir del campo, el número queda en formato internacional:
// "987654321" → "+51987654321" (así wa.me siempre funciona)
function normalizarCampo(campo) {
  form.value[campo] = normalizarTelefono(form.value[campo]) || '';
}

// Guard de cierre del AppDialog compartido: Escape y la X (backdrop
// deshabilitado, ver template — formulario de captura, un clic afuera no
// debe perder lo escrito) pasan por acá igual que el botón "Cancelar" —
// con cambios sin guardar se pide confirmación antes de descartar; limpio
// cierra directo. Mismo cuerpo que AccesoSensibleForm.vue.
// Solo se busca tras el rechazo del unique: la BD sigue siendo la que
// decide si el DNI está tomado. Si la búsqueda falla, queda el aviso genérico.
async function buscarDuplicado(dni) {
  try {
    const existente = await insforgeApi.buscarPorDni(onlyDigits(dni));
    // En edición, el propio empleado nunca es "el otro" con ese DNI.
    duplicado.value = existente && existente.id !== props.empleado?.id ? existente : null;
  } catch {
    duplicado.value = null;
  }
}

async function guardar() {
  error.value = '';
  campoInvalido.value = '';
  duplicado.value = null;
  guardando.value = true;
  try {
    let guardado;
    if (esEdicion.value) {
      guardado = await store.actualizar(props.empleado.id, form.value);
    } else {
      guardado = await store.crear(form.value);
    }
    // Ya guardado: el snapshot se actualiza para que el cierre no pida
    // confirmación de cambios sin guardar
    tomarSnapshot();
    // Se emite el empleado guardado para que el alta pueda navegar a su ficha
    resultado = guardado;
    modal.value?.cerrar();
  } catch (e) {
    if (traducirErrorDb(e).restriccion === 'empleados_dni_key') {
      error.value = 'Ya existe un empleado con ese DNI';
      campoInvalido.value = 'dni';
      await buscarDuplicado(form.value.dni);
    } else {
      error.value = mensajeError(e, { porDefecto: 'Error al guardar empleado' });
    }
    if (campoInvalido.value) enfocarCampoInvalido();
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <AppDialog
    ref="modal"
    size="lg"
    :titulo="esEdicion ? 'Editar empleado' : 'Nuevo empleado'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="empleado-form" class="form-grid" @submit.prevent="guardar">
      <!-- ── Identidad ── -->
      <div class="section-label !mt-0 !border-t-0 !pt-0">
        <i class="ti ti-id" aria-hidden="true"></i> Identidad
      </div>

      <div class="campo" :class="{ 'campo--invalido': campoNombres.invalido.value, 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoNombres.id">Nombres<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoNombres.id"
            v-model="form.nombres"
            class="campo__control"
            type="text"
            required
            :disabled="guardando"
            :aria-invalid="campoNombres.invalido.value"
            :aria-describedby="campoNombres.describedBy.value"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--invalido': campoApellidos.invalido.value, 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoApellidos.id">Apellidos<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoApellidos.id"
            v-model="form.apellidos"
            class="campo__control"
            type="text"
            required
            :disabled="guardando"
            :aria-invalid="campoApellidos.invalido.value"
            :aria-describedby="campoApellidos.describedBy.value"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--invalido': campoDni.invalido.value, 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoDni.id">DNI<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoDni.id"
            ref="refDni"
            v-model="form.dni"
            class="campo__control tabular-nums"
            type="text"
            inputmode="numeric"
            required
            :disabled="guardando"
            :aria-invalid="campoDni.invalido.value"
            :aria-describedby="campoDni.describedBy.value"
            @input="campoInvalido === 'dni' && (campoInvalido = '')"
          >
          <i v-if="campoDni.invalido.value" class="ti ti-alert-circle campo__adorno campo__adorno--error" aria-hidden="true"></i>
        </div>
        <p
          v-if="campoDni.invalido.value"
          :id="campoDni.idAyuda"
          class="campo__pie campo__pie--error"
          role="alert"
        >Ya existe un empleado con ese DNI</p>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoFechaAlta.id">Fecha de alta<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoFechaAlta.id"
            v-model="form.fecha_alta"
            class="campo__control tabular-nums"
            type="date"
            required
            :disabled="guardando"
            :aria-invalid="campoFechaAlta.invalido.value"
            :aria-describedby="campoFechaAlta.describedBy.value"
          >
        </div>
      </div>

      <!-- ── Organización ── -->
      <div class="section-label">
        <i class="ti ti-briefcase" aria-hidden="true"></i> Organización
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando || cargandoEmpresas }">
        <label class="campo__etiqueta" :for="campoEmpresa.id">Empresa<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <select
            :id="campoEmpresa.id"
            v-model="form.empresa_id"
            class="campo__control campo__control--select"
            required
            :disabled="guardando || cargandoEmpresas"
            :aria-invalid="campoEmpresa.invalido.value"
            :aria-describedby="campoEmpresa.describedBy.value"
          >
            <option value="" disabled>Seleccionar empresa</option>
            <option v-for="emp in empresas" :key="emp.id" :value="emp.id">
              {{ emp.nombre }}
            </option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoCargo.id">Cargo</label>
        <div class="campo__caja">
          <input
            :id="campoCargo.id"
            v-model="form.cargo"
            class="campo__control"
            type="text"
            :disabled="guardando"
            :aria-invalid="campoCargo.invalido.value"
            :aria-describedby="campoCargo.describedBy.value"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando || cargandoEmpresas }">
        <label class="campo__etiqueta" :for="campoAreaObra.id">Área/Obra</label>
        <div class="campo__caja">
          <select
            :id="campoAreaObra.id"
            v-model="form.area_obra_id"
            class="campo__control campo__control--select"
            :disabled="guardando || cargandoEmpresas"
            :aria-invalid="campoAreaObra.invalido.value"
            :aria-describedby="campoAreaObra.describedBy.value"
          >
            <option value="">Sin asignar</option>
            <option v-for="ao in areasObras" :key="ao.id" :value="ao.id">
              {{ ao.nombre }}
            </option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <!-- Independiente de Área/Obra (migración 059): el área es función,
           la ubicación es lugar físico — no se derivan entre sí. -->
      <div class="campo" :class="{ 'campo--inerte': guardando || cargandoEmpresas }">
        <label class="campo__etiqueta" :for="campoUbicacion.id">Ubicación</label>
        <div class="campo__caja">
          <select
            :id="campoUbicacion.id"
            v-model="form.ubicacion_id"
            class="campo__control campo__control--select"
            :disabled="guardando || cargandoEmpresas"
            :aria-invalid="campoUbicacion.invalido.value"
            :aria-describedby="campoUbicacion.describedBy.value"
          >
            <option value="">Sin asignar</option>
            <option v-for="u in ubicaciones" :key="u.id" :value="u.id">
              {{ u.nombre }}
            </option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <!-- ── Contacto ── -->
      <div class="section-label">
        <i class="ti ti-address-book" aria-hidden="true"></i> Contacto
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoTelefono.id">Teléfono</label>
        <div class="campo__caja">
          <input
            :id="campoTelefono.id"
            v-model="form.telefono"
            class="campo__control tabular-nums"
            type="text"
            placeholder="987 654 321"
            :disabled="guardando"
            :aria-invalid="campoTelefono.invalido.value"
            :aria-describedby="campoTelefono.describedBy.value"
            @blur="normalizarCampo('telefono')"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoWhatsapp.id">WhatsApp</label>
        <div class="campo__caja pr-1">
          <input
            :id="campoWhatsapp.id"
            v-model="form.whatsapp"
            class="campo__control tabular-nums"
            type="text"
            placeholder="987 654 321"
            :disabled="guardando"
            :aria-invalid="campoWhatsapp.invalido.value"
            :aria-describedby="campoWhatsapp.describedBy.value"
            @blur="normalizarCampo('whatsapp')"
          >
          <AppButton
            variant="text"
            size="sm"
            label="Copiar del teléfono"
            class="shrink-0 whitespace-nowrap"
            :disabled="guardando || !form.telefono"
            @click="copiarTelefono"
          />
        </div>
      </div>

      <p class="full -mt-2 text-xs text-gray-500">El +51 se agrega solo al salir del campo, para que el enlace de WhatsApp funcione siempre.</p>

      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoCorreoPersonal.id">Correo personal</label>
        <div class="campo__caja">
          <input
            :id="campoCorreoPersonal.id"
            v-model="form.correo_personal"
            class="campo__control"
            type="email"
            :disabled="guardando"
            :aria-invalid="campoCorreoPersonal.invalido.value"
            :aria-describedby="campoCorreoPersonal.describedBy.value"
          >
        </div>
      </div>

      <!-- Sin campo Estado: el alta siempre es "Activo"; al editar se
           conserva el estado actual. Cambiarlo es un flujo aparte
           (Dar de baja / Reactivar en la ficha). -->

      <!-- ── Notas ── -->
      <div class="section-label">
        <i class="ti ti-notes" aria-hidden="true"></i> Notas
      </div>
      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta sr-only" :for="campoNotas.id">Notas</label>
        <div class="campo__caja">
          <textarea
            :id="campoNotas.id"
            v-model="form.notas"
            class="campo__control campo__control--area"
            :rows="3"
            :disabled="guardando"
            :aria-invalid="campoNotas.invalido.value"
            :aria-describedby="campoNotas.describedBy.value"
          ></textarea>
        </div>
      </div>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <!-- DNI tomado: quién lo tiene y qué hacer, no solo "ya existe". -->
          <template v-if="duplicado">
            <p class="notif__detalle">
              El DNI {{ duplicado.dni }} ya pertenece a <strong class="font-medium">{{ nombreCompleto(duplicado) }}</strong>
              (estado: {{ estadoEmpleadoInfo(duplicado.estado).label }}).
              <template v-if="duplicadoInactivo">Para volver a darle acceso, reactívelo desde su ficha en lugar de registrarlo de nuevo.</template>
              <template v-else>No se puede registrar a la misma persona dos veces: revise su ficha.</template>
            </p>
            <!-- Solo en el alta: en edición el formulario vive dentro de otra
                 ficha (/empleados/:id), y EmpleadoDetalleView no recarga al
                 cambiar solo el parámetro de la ruta. -->
            <AppButton
              v-if="!esEdicion"
              class="mt-2"
              size="sm"
              variant="outline"
              severity="secondary"
              :icon="duplicadoInactivo ? 'ti ti-user-check' : 'ti ti-id'"
              :label="duplicadoInactivo ? 'Abrir su ficha para reactivarlo' : 'Abrir su ficha'"
              :to="`/empleados/${duplicado.id}`"
            />
          </template>
          <p v-else class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton type="submit" form="empleado-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
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
