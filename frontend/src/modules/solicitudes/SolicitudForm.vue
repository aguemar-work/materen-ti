<script setup>
// «Nueva solicitud»: tipo + persona + de dónde vino el pedido. Las altas las
// genera RRHH por correo y TI las registra a mano (decisión del dueño): el
// origen y la nota dejan escrito quién pidió qué («pedido de RRHH por correo
// del 30/09»). Para un alta, la persona puede ser NUEVA (se crea en la misma
// transacción que el trámite) o una ya registrada.
//
// Tres formas de llegar acá:
//   · Solicitudes → «Nueva solicitud»                 (sin props)
//   · Expediente de un empleado → «Nueva solicitud»   (`empleado` fijo)
//   · Detalle de un ticket → «Convertir en solicitud» (`ticket` + su empleado)
// Todo pasa por las RPC de la migración 108; el servidor repite cada regla.
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useSolicitudesStore } from '../../stores/solicitudes.js';
import { fechaLocalISO } from '../../core/formatters.js';
import { OPCIONES_TIPO_CREABLE, OPCIONES_ORIGEN, tipoSolicitudInfo } from '../../core/dominio-solicitudes.js';
import { nombreCompleto } from '../../core/dominio-empleados.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import SolicitudPersonaNueva from './SolicitudPersonaNueva.vue';

const props = defineProps({
  // Persona fija (desde su expediente). Sin ella se elige o, en el alta, se crea.
  empleado: { type: Object, default: null },
  tipoInicial: { type: String, default: '' },
  // { id, codigo, empleadoId, empleadoNombre } al convertir un ticket.
  ticket: { type: Object, default: null },
});
const emit = defineEmits(['cerrar']);

const store = useSolicitudesStore();
const infoError = infoNotificacion('error');
let resultado = false;

const personaVacia = () => ({
  nombres: '', apellidos: '', dni: '', empresa_id: '', area_obra_id: '', ubicacion_id: '',
  cargo: '', fecha_alta: fechaLocalISO(), whatsapp: '',
});

const tipo = ref(props.tipoInicial || (props.empleado || props.ticket ? 'acceso_nuevo' : 'alta_empleado'));
const modoPersona = ref('nueva'); // 'nueva' | 'existente' (solo en el alta)
const persona = ref(personaVacia());
const empleadoId = ref(props.empleado?.id || props.ticket?.empleadoId || '');
const busquedaEmpleado = ref('');
const origen = ref('rrhh_correo');
const nota = ref('');

const empleados = ref([]);
const cargandoEmpleados = ref(false);

const infoTipo = computed(() => tipoSolicitudInfo(tipo.value));
const personaFija = computed(() => !!(props.empleado || props.ticket));
const nombreFijo = computed(() => (props.empleado ? nombreCompleto(props.empleado) : props.ticket?.empleadoNombre || ''));
const esAlta = computed(() => tipo.value === 'alta_empleado');
const creaPersona = computed(() => esAlta.value && !personaFija.value && modoPersona.value === 'nueva');
const eligePersona = computed(() => !personaFija.value && !creaPersona.value);

// La devolución de un equipo admite a un Inactivo; el resto, solo Activos.
const candidatos = computed(() => empleados.value
  .filter((e) => infoTipo.value.persona === 'cualquiera' || e.estado === 'Activo'));

const OPCIONES_MODO = [
  { valor: 'nueva', label: 'Persona nueva' },
  { valor: 'existente', label: 'Ya registrada' },
];

const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios, guardando, error, ejecutarGuardado } =
  useFormularioModal(() => ({ tipo: tipo.value, persona: persona.value, empleadoId: empleadoId.value, origen: origen.value, nota: nota.value }));

const cTipo = useCampoAccesible();
const cOrigen = useCampoAccesible();
const cNota = useCampoAccesible();

// El origen más probable depende del tipo: las altas vienen de RRHH.
watch(tipo, (t) => {
  if (!props.ticket) origen.value = t === 'alta_empleado' ? 'rrhh_correo' : 'otro';
  if (!personaFija.value) empleadoId.value = '';
  error.value = '';
});

onMounted(async () => {
  tomarSnapshot();
  if (personaFija.value) return;
  cargandoEmpleados.value = true;
  try {
    empleados.value = await insforgeApi.listEmpleados();
  } catch {
    error.value = 'No se pudo cargar la lista de empleados.';
  } finally {
    cargandoEmpleados.value = false;
  }
});

const faltaDato = computed(() => {
  if (creaPersona.value) {
    const p = persona.value;
    return !p.nombres.trim() || !p.apellidos.trim() || !/^\d{8}$/.test(String(p.dni).replace(/\D/g, '')) || !p.empresa_id;
  }
  return !empleadoId.value;
});

async function guardar() {
  const creada = await ejecutarGuardado(() => {
    if (props.ticket) return store.convertirTicket(props.ticket.id, tipo.value, nota.value);
    return store.crear({
      tipo: tipo.value,
      empleadoId: creaPersona.value ? null : empleadoId.value,
      empleado: creaPersona.value ? persona.value : null,
      nota: nota.value,
      origen: origen.value,
    });
  }, { entidad: 'solicitud', porDefecto: 'No se pudo abrir la solicitud.' });
  if (!creada) return;
  tomarSnapshot();
  resultado = creada;
  modal.value?.cerrar();
}
</script>

<template>
  <AppDialog
    ref="modal"
    size="lg"
    :titulo="ticket ? `Convertir ${ticket.codigo} en solicitud` : 'Nueva solicitud'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="solicitud-form" class="space-y-5" @submit.prevent="guardar">
      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="cTipo.id">Tipo de solicitud<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <select :id="cTipo.id" v-model="tipo" class="campo__control campo__control--select" required :disabled="guardando">
            <option v-for="op in OPCIONES_TIPO_CREABLE" :key="op.valor" :value="op.valor">{{ op.label }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <!-- ── Persona ── -->
      <div v-if="personaFija" class="text-sm text-gray-700">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Persona</span>
        <p class="mt-0.5 font-medium text-gray-900">{{ nombreFijo }}</p>
      </div>

      <template v-else>
        <AppSegmentado
          v-if="esAlta"
          v-model="modoPersona"
          label="Persona del alta"
          :opciones="OPCIONES_MODO"
        />

        <SolicitudPersonaNueva v-if="creaPersona" v-model="persona" :deshabilitado="guardando" />

        <div v-if="eligePersona" class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" for="solicitud-empleado">Persona<span aria-hidden="true"> *</span></label>
          <BuscadorCombo
            id="solicitud-empleado"
            v-model="empleadoId"
            v-model:busqueda="busquedaEmpleado"
            :items="candidatos"
            :campos-busqueda="['nombres', 'apellidos', 'dni']"
            :etiqueta="(e) => nombreCompleto(e)"
            :placeholder="cargandoEmpleados ? 'Cargando empleados...' : 'Buscar por nombre o DNI...'"
            :disabled="guardando || cargandoEmpleados"
          >
            <template #resultado="{ item }">
              <span>{{ nombreCompleto(item) }}</span>
              <span class="combo-sec">{{ item.cargo }}</span>
            </template>
          </BuscadorCombo>
        </div>
      </template>

      <!-- ── Origen del pedido ── -->
      <div v-if="!ticket" class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="cOrigen.id">Quién lo pidió</label>
        <div class="campo__caja">
          <select :id="cOrigen.id" v-model="origen" class="campo__control campo__control--select" :disabled="guardando">
            <option v-for="op in OPCIONES_ORIGEN" :key="op.valor" :value="op.valor">{{ op.label }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="cNota.id">Nota</label>
        <div class="campo__caja">
          <textarea
            :id="cNota.id"
            v-model="nota"
            class="campo__control campo__control--area"
            rows="3"
            maxlength="1000"
            placeholder="Ej.: pedido de RRHH por correo del 30/09, ingresa a la obra Mirasol"
            :disabled="guardando"
          ></textarea>
        </div>
        <p class="campo__pie tabular-nums">Queda en la solicitud. {{ nota.length }}/1000</p>
      </div>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton
        type="submit"
        form="solicitud-form"
        icon="ti ti-clipboard-plus"
        :label="guardando ? 'Abriendo...' : 'Abrir solicitud'"
        :loading="guardando"
        :disabled="faltaDato"
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
