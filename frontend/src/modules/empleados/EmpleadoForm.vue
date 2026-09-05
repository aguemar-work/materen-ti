<script setup>
import { ref, computed, watch, onMounted, nextTick, useTemplateRef } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { normalizarTelefono } from '../../core/formatters.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const props = defineProps({
  empleado: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['cerrar']);

// Migrado a Modal.vue (pasada de diseño ago 2026, mismo patrón que
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
// y llevarle el foco además del mensaje de CarbonNotification. Mismo patrón
// que EquipoForm.vue.
const campoInvalido = ref('');
const refDni = useTemplateRef('refDni');

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

const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);

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
    error.value = e?.message || 'Error al cargar catálogos';
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

// Guard de cierre del Modal compartido: Escape y la X (backdrop
// deshabilitado, ver template — formulario de captura, un clic afuera no
// debe perder lo escrito) pasan por acá igual que el botón "Cancelar" —
// con cambios sin guardar se pide confirmación antes de descartar; limpio
// cierra directo. Mismo cuerpo que AccesoSensibleForm.vue.
async function guardar() {
  error.value = '';
  campoInvalido.value = '';
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
    if (e?.message?.includes('empleados_dni_key') || e?.message?.includes('empleados.dni')) {
      error.value = 'Ya existe un empleado con ese DNI';
      campoInvalido.value = 'dni';
    } else {
      error.value = e?.message || 'Error al guardar empleado';
    }
    if (campoInvalido.value) enfocarCampoInvalido();
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal
    ref="modal"
    size="lg"
    :titulo="esEdicion ? 'Editar empleado' : 'Nuevo empleado'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @close="emit('cerrar', resultado)"
  >
    <form id="empleado-form" class="empleado-form form-grid" @submit.prevent="guardar">
        <div class="form-group full">
          <span class="section-label"><i class="ti ti-user"></i> Datos personales</span>
        </div>

        <CarbonCampo v-model="form.nombres" etiqueta="Nombres" requerido :deshabilitado="guardando" />

        <CarbonCampo v-model="form.apellidos" etiqueta="Apellidos" requerido :deshabilitado="guardando" />

        <CarbonCampo
          ref="refDni"
          v-model="form.dni"
          etiqueta="DNI"
          requerido
          inputmode="numeric"
          :deshabilitado="guardando"
          :error="campoInvalido === 'dni' ? 'Ya existe un empleado con ese DNI' : ''"
          @update:model-value="campoInvalido === 'dni' && (campoInvalido = '')"
        />

        <CarbonCampo v-model="form.correo_personal" etiqueta="Correo personal" tipo="email" :deshabilitado="guardando" />

        <CarbonCampo
          v-model="form.telefono"
          etiqueta="Teléfono"
          placeholder="987 654 321 (el +51 se agrega solo)"
          :deshabilitado="guardando"
          @blur="normalizarCampo('telefono')"
        />

        <div class="whatsapp-row">
          <CarbonCampo
            v-model="form.whatsapp"
            etiqueta="WhatsApp"
            placeholder="987 654 321 (el +51 se agrega solo)"
            :deshabilitado="guardando"
            @blur="normalizarCampo('whatsapp')"
          />
          <CarbonButton variante="secondary" tam="sm" :deshabilitado="guardando || !form.telefono" @click="copiarTelefono">
            Copiar del teléfono
          </CarbonButton>
        </div>

        <div class="form-group full">
          <span class="section-label"><i class="ti ti-briefcase"></i> Datos laborales</span>
        </div>

        <CarbonCampo v-model="form.empresa_id" etiqueta="Empresa" tipo="select" requerido :deshabilitado="guardando || cargandoEmpresas">
          <template #opciones>
            <option value="" disabled>Seleccionar empresa</option>
            <option v-for="emp in empresas" :key="emp.id" :value="emp.id">
              {{ emp.nombre }}
            </option>
          </template>
        </CarbonCampo>

        <CarbonCampo v-model="form.area_obra_id" etiqueta="Área/Obra" tipo="select" :deshabilitado="guardando || cargandoEmpresas">
          <template #opciones>
            <option value="">Sin asignar</option>
            <option v-for="ao in areasObras" :key="ao.id" :value="ao.id">
              {{ ao.nombre }}
            </option>
          </template>
        </CarbonCampo>

        <!-- Independiente de Área/Obra (migración 059): el área es función,
             la ubicación es lugar físico — no se derivan entre sí. -->
        <CarbonCampo v-model="form.ubicacion_id" etiqueta="Ubicación" tipo="select" :deshabilitado="guardando || cargandoEmpresas">
          <template #opciones>
            <option value="">Sin asignar</option>
            <option v-for="u in ubicaciones" :key="u.id" :value="u.id">
              {{ u.nombre }}
            </option>
          </template>
        </CarbonCampo>

        <CarbonCampo v-model="form.cargo" etiqueta="Cargo" :deshabilitado="guardando" />

        <CarbonCampo v-model="form.fecha_alta" etiqueta="Fecha de alta" tipo="date" requerido :deshabilitado="guardando" />

        <!-- Sin campo Estado: el alta siempre es "Activo"; al editar se
             conserva el estado actual. Cambiarlo es un flujo aparte
             (Dar de baja / Reactivar en la ficha). -->

        <CarbonCampo v-model="form.notas" class="full" etiqueta="Notas" tipo="textarea" :deshabilitado="guardando" />

        <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
    </form>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="cancelar">Cancelar</CarbonButton>
      <CarbonButton variante="primary" tipo="submit" form="empleado-form" :cargando="guardando">
        {{ guardando ? 'Guardando...' : 'Guardar' }}
      </CarbonButton>
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

<style scoped>
/* CarbonCampo de Notas no puede envolverse en el viejo .form-group.full (le
   filtraría el estilo del <textarea> anterior), así que repite solo el
   grid-column (mismo criterio que EquipoForm.vue/LicenciaForm.vue). */
.full {
  grid-column: 1 / -1;
}

.empleado-form .section-label {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.whatsapp-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.whatsapp-row :deep(.cds-campo) { flex: 1; min-width: 0; }
</style>
