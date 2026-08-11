<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { normalizarTelefono } from '../../core/formatters.js';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useDetectorDeCambios } from '../../composables/useDetectorDeCambios.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const props = defineProps({
  empleado: {
    type: Object,
    default: null,
  },
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

const store = useEmpleadosStore();

const empresas = ref([]);
const areasObras = ref([]);
const cargandoEmpresas = ref(false);
const guardando = ref(false);
const error = ref('');

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
  estado: 'Activo',
  fecha_alta: new Date().toISOString().slice(0, 10),
});

const { estaSucio, tomarSnapshot } = useDetectorDeCambios(() => form.value);
const confirmarDescarte = ref(false);
const dialogoDescarte = ref(null);

function resetForm() {
  // Rama por `id`, no por truthiness: un prellenado de alta (ej. migración
  // desde pre-registro de personal) llega como objeto truthy SIN id, y debe
  // tratarse como alta (estado/empresa en blanco), no como edición de un
  // empleado real que ya tendría esos campos.
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
      estado: props.empleado.estado,
      fecha_alta: props.empleado.fecha_alta || new Date().toISOString().slice(0, 10),
    };
  } else if (props.empleado) {
    // Prellenado parcial para alta (sin id): mismos defaults del alta en
    // blanco, con lo que sí trae el prellenado superpuesto.
    form.value = {
      nombres: props.empleado.nombres || '',
      apellidos: props.empleado.apellidos || '',
      dni: props.empleado.dni || '',
      telefono: props.empleado.telefono || '',
      whatsapp: props.empleado.whatsapp || '',
      correo_personal: props.empleado.correo_personal || '',
      cargo: props.empleado.cargo || '',
      empresa_id: props.empleado.empresa_id || '',
      area_obra_id: props.empleado.area_obra_id || '',
      estado: 'Activo',
      fecha_alta: props.empleado.fecha_alta || new Date().toISOString().slice(0, 10),
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
      estado: 'Activo',
      fecha_alta: new Date().toISOString().slice(0, 10),
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
    [empresas.value, areasObras.value] = await Promise.all([
      insforgeApi.listEmpresas(),
      insforgeApi.listAreasObras(),
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

async function guardar() {
  error.value = '';
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
    cerrar(guardado);
  } catch (e) {
    error.value = e?.message || 'Error al guardar empleado';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Transition name="modal-anim" appear @after-leave="emitirCierre">
  <div v-if="visible" class="modal-bg">
    <div ref="panelModal" class="modal modal-lg empleado-form" role="dialog" aria-modal="true" aria-labelledby="empleado-form-title" tabindex="-1">
      <div class="modal-title">
        <span id="empleado-form-title">{{ esEdicion ? 'Editar empleado' : 'Nuevo empleado' }}</span>
        <button class="icon-btn" type="button" aria-label="Cerrar" @click="cancelar">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>

      <form @submit.prevent="guardar">
        <div class="modal-body form-grid">
        <div class="form-group full">
          <span class="section-label"><i class="ti ti-user"></i> Datos personales</span>
        </div>

        <div class="form-group">
          <label for="nombres">Nombres *</label>
          <input id="nombres" v-model="form.nombres" required :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="apellidos">Apellidos *</label>
          <input id="apellidos" v-model="form.apellidos" required :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="dni">DNI *</label>
          <input id="dni" v-model="form.dni" required :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="correo">Correo personal</label>
          <input id="correo" v-model="form.correo_personal" type="email" :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="telefono">Teléfono</label>
          <input
            id="telefono"
            v-model="form.telefono"
            placeholder="987 654 321 (el +51 se agrega solo)"
            :disabled="guardando"
            @blur="normalizarCampo('telefono')"
          >
        </div>

        <div class="form-group">
          <label for="whatsapp">WhatsApp</label>
          <div class="whatsapp-row">
            <input
              id="whatsapp"
              v-model="form.whatsapp"
              placeholder="987 654 321 (el +51 se agrega solo)"
              :disabled="guardando"
              @blur="normalizarCampo('whatsapp')"
            >
            <button class="btn" type="button" :disabled="guardando || !form.telefono" @click="copiarTelefono">
              Copiar del teléfono
            </button>
          </div>
        </div>

        <div class="form-group full">
          <span class="section-label"><i class="ti ti-briefcase"></i> Datos laborales</span>
        </div>

        <div class="form-group">
          <label for="empresa">Empresa *</label>
          <select id="empresa" v-model="form.empresa_id" required :disabled="guardando || cargandoEmpresas">
            <option value="" disabled>Seleccionar empresa</option>
            <option v-for="emp in empresas" :key="emp.id" :value="emp.id">
              {{ emp.nombre }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="area-obra">Área/Obra</label>
          <select id="area-obra" v-model="form.area_obra_id" :disabled="guardando || cargandoEmpresas">
            <option value="">Sin asignar</option>
            <option v-for="ao in areasObras" :key="ao.id" :value="ao.id">
              {{ ao.nombre }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="cargo">Cargo</label>
          <input id="cargo" v-model="form.cargo" :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="fecha-alta">Fecha de alta *</label>
          <input id="fecha-alta" v-model="form.fecha_alta" type="date" required :disabled="guardando">
        </div>

        <!-- Sin campo Estado: el alta siempre es "Activo"; al editar se
             conserva el estado actual. Cambiarlo es un flujo aparte
             (Dar de baja / Reactivar en la ficha). -->

        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="modal-actions full">
          <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ guardando ? 'Guardando...' : 'Guardar' }}
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
.empleado-form .section-label {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.whatsapp-row {
  display: flex;
  gap: 8px;
}

.whatsapp-row input {
  flex: 1;
}

.whatsapp-row .btn {
  flex-shrink: 0;
  font-size: 12px;
  padding: 8px 10px;
}


.modal-actions.full {
  grid-column: 1 / -1;
}
</style>
