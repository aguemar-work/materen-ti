<script setup>
// Diálogo único del escalamiento por niveles (migración 121), en tres modos:
//   - escalar:  a Nivel 2 (Especializado: elige quién lo atiende, el ticket se
//               le reasigna) o a Nivel 3 (Especialista interno o externo: tipo,
//               nombre, referencia; quien escala conserva el ticket salvo que
//               indique otro responsable). Motivo obligatorio: qué pasó.
//   - devolver: a un nivel inferior, con motivo; el responsable es opcional.
//   - avance:   lo que informa el especialista o proveedor, con nueva fecha
//               estimada opcional; «Visible para el empleado» lo publica en su
//               seguimiento.
// Las reglas las valida el servidor (P0001 con el mensaje de la regla): acá
// solo se piden los campos que cada modo exige. Emite `cerrar` con la
// respuesta de la RPC, o con null si se canceló.
import { ref, computed } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import {
  nivelesParaEscalar, nivelesParaDevolver, nivelAtencionLabel, ESPECIALISTA_TIPOS,
  MOTIVO_ESCALAR_MAX, NOTA_AVANCE_MAX, ESPECIALISTA_NOMBRE_MAX, REFERENCIA_EXTERNA_MAX,
} from '../../core/dominio-tickets.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const props = defineProps({
  modo: { type: String, required: true, validator: (v) => ['escalar', 'devolver', 'avance'].includes(v) },
  // El ticket de la ficha (mapTicketDetalle).
  ticket: { type: Object, required: true },
  // Tramo abierto (para el avance: fecha y referencia actuales), o null.
  tramo: { type: Object, default: null },
  staffActivo: { type: Array, default: () => [] },
});
const emit = defineEmits(['cerrar']);

const opcionesNivel = computed(() => (props.modo === 'devolver'
  ? nivelesParaDevolver(props.ticket.nivel_atencion)
  : nivelesParaEscalar(props.ticket.nivel_atencion)));

const form = ref({
  nivel: opcionesNivel.value[0]?.valor || '',
  motivo: '',
  // N2: quién lo atiende (obligatorio). N3 y devolver: opcional, el actual por defecto.
  responsable_id: props.modo === 'escalar' ? '' : (props.ticket.asignado_a || ''),
  especialista_tipo: '',
  especialista_nombre: '',
  referencia: props.modo === 'avance' ? (props.tramo?.referencia_externa || '') : '',
  fecha_estimada: '',
  nota: '',
  visible_usuario: false,
});
let resultado = null;

const { modal, guardando, error, ejecutarGuardado, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);
tomarSnapshot();

const esN3 = computed(() => props.modo === 'escalar' && form.value.nivel === 'N3');
const esN2 = computed(() => props.modo === 'escalar' && form.value.nivel === 'N2');

const TITULOS = { escalar: 'Escalar ticket', devolver: 'Devolver de nivel', avance: 'Registrar avance' };
const BOTON = { escalar: 'Escalar', devolver: 'Devolver', avance: 'Registrar' };

// El responsable de N3 es quien da seguimiento; si no se elige, se conserva el actual.
const etiquetaResponsable = computed(() => (esN2.value ? 'Quién lo atiende en el Nivel 2' : 'Responsable del seguimiento'));

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const campoMotivo = useCampoAccesible({ ayuda: () => 'Obligatorio' });
const campoResponsable = useCampoAccesible();
const campoTipo = useCampoAccesible();
const campoNombre = useCampoAccesible();
const campoReferencia = useCampoAccesible();
const campoFecha = useCampoAccesible();
const campoNota = useCampoAccesible({ ayuda: () => 'Obligatorio' });
const infoError = infoNotificacion('error');

function validar() {
  const f = form.value;
  if (props.modo === 'avance') return f.nota.trim() ? '' : 'Indique el avance.';
  if (!f.nivel) return 'Seleccione el nivel.';
  if (!f.motivo.trim()) return props.modo === 'escalar' ? 'Indique qué pasó y qué se intentó antes de escalar.' : 'Indique por qué devuelve el ticket de nivel.';
  if (esN2.value && !f.responsable_id) return 'Indique quién atiende el ticket en el Nivel 2.';
  if (esN3.value && !f.especialista_tipo) return 'Indique el tipo de especialista del Nivel 3.';
  if (esN3.value && !f.especialista_nombre.trim()) return 'Indique el especialista o proveedor del Nivel 3.';
  return '';
}

function datosDeModo() {
  const f = form.value;
  if (props.modo === 'avance') {
    return { nota: f.nota, fecha_estimada: f.fecha_estimada, referencia: f.referencia, visible_usuario: f.visible_usuario };
  }
  if (props.modo === 'devolver') return { nivel: f.nivel, motivo: f.motivo, responsable_id: f.responsable_id };
  return {
    nivel: f.nivel, motivo: f.motivo, responsable_id: f.responsable_id, fecha_estimada: f.fecha_estimada,
    ...(esN3.value ? { especialista_tipo: f.especialista_tipo, especialista_nombre: f.especialista_nombre, referencia: f.referencia } : {}),
  };
}

const LLAMADA = {
  escalar: (id, d) => insforgeApi.escalarTicket(id, d),
  devolver: (id, d) => insforgeApi.devolverNivelTicket(id, d),
  avance: (id, d) => insforgeApi.registrarAvanceEscalamiento(id, d),
};

async function guardar() {
  error.value = validar();
  if (error.value) return;
  const r = await ejecutarGuardado(
    () => LLAMADA[props.modo](props.ticket.id, datosDeModo()),
    { entidad: 'el ticket', porDefecto: 'No se pudo guardar el escalamiento' },
  );
  if (r === undefined) return;
  resultado = r || { ticket_id: props.ticket.id };
  tomarSnapshot();
  modal.value?.cerrar();
}
</script>

<template>
  <AppDialog
    ref="modal"
    :titulo="TITULOS[modo]"
    size="sm"
    :confirmar-cierre="confirmarCierre"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="escalamiento-form" class="space-y-4" @submit.prevent="guardar">
      <p class="text-sm">
        <AppCodigo :valor="ticket.codigo" titulo="Número de ticket" /> · <span class="text-gray-900">{{ ticket.titulo }}</span>
        <span class="block text-xs text-gray-500">Hoy: {{ nivelAtencionLabel(ticket.nivel_atencion) || 'Sin nivel' }}</span>
      </p>

      <fieldset v-if="modo !== 'avance'">
        <legend class="campo__etiqueta">{{ modo === 'escalar' ? 'Escalar a' : 'Devolver a' }}<span aria-hidden="true"> *</span></legend>
        <div class="grid gap-2">
          <label
            v-for="n in opcionesNivel"
            :key="n.valor"
            class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary-500"
            :class="form.nivel === n.valor ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-900 hover:bg-gray-50'"
          >
            <input v-model="form.nivel" type="radio" :value="n.valor" class="h-4 w-4 accent-primary-500" :disabled="guardando">
            {{ n.label }}
          </label>
        </div>
      </fieldset>

      <template v-if="esN3">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoTipo.id">Tipo de especialista<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <select :id="campoTipo.id" v-model="form.especialista_tipo" class="campo__control campo__control--select" required :disabled="guardando">
              <option value="" disabled>Seleccionar</option>
              <option v-for="t in ESPECIALISTA_TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoNombre.id">Especialista o proveedor<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input :id="campoNombre.id" v-model="form.especialista_nombre" class="campo__control" required :maxlength="ESPECIALISTA_NOMBRE_MAX" :disabled="guardando" placeholder="Ej.: Lenovo — servicio técnico">
          </div>
        </div>
      </template>

      <div v-if="esN3 || modo === 'avance'" class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoReferencia.id">Referencia del caso</label>
        <div class="campo__caja">
          <input :id="campoReferencia.id" v-model="form.referencia" class="campo__control" :maxlength="REFERENCIA_EXTERNA_MAX" :disabled="guardando" placeholder="N.º de caso, orden o garantía">
        </div>
      </div>

      <div v-if="modo !== 'avance'" class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoResponsable.id">{{ etiquetaResponsable }}<span v-if="esN2" aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <select :id="campoResponsable.id" v-model="form.responsable_id" class="campo__control campo__control--select" :required="esN2" :disabled="guardando">
            <option value="" :disabled="esN2">{{ esN2 ? 'Seleccionar' : 'Sin cambio' }}</option>
            <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div v-if="modo !== 'devolver'" class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoFecha.id">{{ modo === 'avance' ? 'Nueva fecha estimada de solución' : 'Fecha estimada de solución' }}</label>
        <div class="campo__caja">
          <input :id="campoFecha.id" v-model="form.fecha_estimada" class="campo__control" type="date" :min="hoy()" :disabled="guardando" :aria-describedby="campoFecha.describedBy.value">
        </div>
        <p :id="campoFecha.idAyuda" class="campo__pie">La ve el empleado en su seguimiento.</p>
      </div>

      <div v-if="modo !== 'avance'" class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta flex items-baseline justify-between gap-3" :for="campoMotivo.id">
          <span>{{ modo === 'escalar' ? 'Qué pasó y qué se intentó' : 'Motivo' }}<span aria-hidden="true"> *</span></span>
          <span class="text-xs font-normal tabular-nums text-gray-500" aria-hidden="true">{{ form.motivo.length }}/{{ MOTIVO_ESCALAR_MAX }}</span>
        </label>
        <div class="campo__caja">
          <textarea :id="campoMotivo.id" v-model="form.motivo" class="campo__control campo__control--area" :rows="3" required :maxlength="MOTIVO_ESCALAR_MAX" :disabled="guardando" :aria-describedby="campoMotivo.describedBy.value"></textarea>
        </div>
        <p :id="campoMotivo.idAyuda" class="campo__pie">Interno: queda en la hoja de vida, el empleado no lo ve.</p>
      </div>

      <template v-if="modo === 'avance'">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta flex items-baseline justify-between gap-3" :for="campoNota.id">
            <span>Avance<span aria-hidden="true"> *</span></span>
            <span class="text-xs font-normal tabular-nums text-gray-500" aria-hidden="true">{{ form.nota.length }}/{{ NOTA_AVANCE_MAX }}</span>
          </label>
          <div class="campo__caja">
            <textarea :id="campoNota.id" v-model="form.nota" class="campo__control campo__control--area" :rows="3" required :maxlength="NOTA_AVANCE_MAX" :disabled="guardando" :aria-describedby="campoNota.describedBy.value"></textarea>
          </div>
        </div>
        <label class="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
          <input v-model="form.visible_usuario" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary-500" :disabled="guardando">
          Visible para el empleado (se publica en su seguimiento)
        </label>
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
      <AppButton type="submit" form="escalamiento-form" :label="guardando ? 'Guardando...' : BOTON[modo]" :loading="guardando" />
    </template>
  </AppDialog>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Hay cambios sin guardar. ¿Desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cerrado="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>
