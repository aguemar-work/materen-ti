<script setup>
// «Nuevo cambio» (migración 107) y edición de un borrador. Un cambio se
// registra ANTES de tocar producción:
//   · estándar   rutina de bajo riesgo ya autorizada: no lleva plan de retroceso
//                y «Autorizar» lo deja aprobado, sin esperar a nadie;
//   · normal     plan de retroceso y ventana obligatorios; lo aprueba un jefe;
//   · emergencia plan de retroceso obligatorio, ventana opcional; se ejecuta sin
//                esperar aprobación, pero un jefe debe aprobarla en 48 horas.
// «Guardar borrador» exige solo título, servicio y descripción; lo demás se pide
// al enviar. El servidor repite cada regla (RPC de la migración 107).
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useCambiosStore } from '../../stores/cambios.js';
import { useServiciosStore } from '../../stores/catalogos.js';
import {
  TIPOS_CAMBIO, OPCIONES_TIPO_CAMBIO, OPCIONES_RIESGO_CAMBIO, isoALocal, localAISO,
} from '../../core/dominio-cambios.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const props = defineProps({
  // Borrador que se edita; sin él, es un cambio nuevo.
  cambio: { type: Object, default: null },
});
const emit = defineEmits(['cerrar']);

const store = useCambiosStore();
const serviciosStore = useServiciosStore();
const { lista: servicios } = storeToRefs(serviciosStore);
const infoError = infoNotificacion('error');
let resultado = false;

const c = props.cambio;
const form = ref({
  tipo: c?.tipo || 'normal',
  riesgo: c?.riesgo || 'medio',
  servicio_id: c?.servicio_id || '',
  titulo: c?.titulo || '',
  descripcion: c?.descripcion || '',
  plan: c?.plan_retroceso || '',
  inicio: isoALocal(c?.ventana_inicio),
  fin: isoALocal(c?.ventana_fin),
});

const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios, guardando, error, ejecutarGuardado } =
  useFormularioModal(() => form.value);

const cTitulo = useCampoAccesible();
const cServicio = useCampoAccesible();
const cRiesgo = useCampoAccesible();
const cDescripcion = useCampoAccesible();
const cPlan = useCampoAccesible();
const cInicio = useCampoAccesible();
const cFin = useCampoAccesible();

const esEstandar = computed(() => form.value.tipo === 'estandar');
const esEmergencia = computed(() => form.value.tipo === 'emergencia');
const ayudaTipo = computed(() => TIPOS_CAMBIO[form.value.tipo].ayuda);
const destinoEnvio = computed(() => (esEstandar.value ? 'aprobado' : 'solicitado'));
const textoEnviar = computed(() => (esEstandar.value ? 'Autorizar cambio' : esEmergencia.value ? 'Registrar y enviar' : 'Enviar a aprobación'));
const iconoEnviar = computed(() => (esEstandar.value ? 'ti ti-check' : 'ti ti-send'));

const ventanaValida = computed(() => {
  const { inicio, fin } = form.value;
  return !!inicio && !!fin && new Date(fin) > new Date(inicio);
});
const borradorCompleto = computed(() => form.value.titulo.trim().length >= 3 && !!form.value.servicio_id && !!form.value.descripcion.trim());

// Lo que falta para poder enviar (se muestra al usuario, no solo se deshabilita el botón).
const faltaParaEnviar = computed(() => {
  const f = [];
  if (!borradorCompleto.value) f.push('título, servicio y descripción');
  if (!esEstandar.value && !form.value.plan.trim()) f.push('el plan de retroceso');
  if (!esEmergencia.value && !ventanaValida.value) f.push('la ventana de ejecución (inicio y fin, con el fin posterior)');
  return f;
});

const datos = () => ({
  titulo: form.value.titulo,
  tipo: form.value.tipo,
  riesgo: form.value.riesgo,
  servicioId: form.value.servicio_id,
  descripcion: form.value.descripcion,
  planRetroceso: form.value.plan,
  ventanaInicio: localAISO(form.value.inicio),
  ventanaFin: localAISO(form.value.fin),
});

async function guardar(enviar) {
  const fila = await ejecutarGuardado(async () => {
    if (!props.cambio) return store.crear({ ...datos(), enviar });
    const editado = await store.actualizarBorrador(props.cambio.id, datos());
    return enviar ? store.transicionar(props.cambio.id, destinoEnvio.value) : editado;
  }, { entidad: 'cambio', porDefecto: 'No se pudo guardar el cambio.' });
  if (!fila) return;
  tomarSnapshot();
  resultado = fila;
  modal.value?.cerrar();
}

onMounted(() => {
  tomarSnapshot();
  if (!servicios.value.length) serviciosStore.cargar().catch(() => { error.value = 'No se pudo cargar el catálogo de servicios.'; });
});
</script>

<template>
  <AppDialog
    ref="modal"
    size="lg"
    :titulo="cambio ? `Editar ${cambio.codigo}` : 'Nuevo cambio'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="cambio-form" class="space-y-5" @submit.prevent="guardar(true)">
      <div>
        <AppSegmentado v-model="form.tipo" label="Tipo de cambio" :opciones="OPCIONES_TIPO_CAMBIO" />
        <p class="mt-1.5 text-xs text-gray-500" data-ayuda-tipo>{{ ayudaTipo }}</p>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="cTitulo.id">Título<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="cTitulo.id"
            v-model="form.titulo"
            class="campo__control"
            type="text"
            maxlength="120"
            placeholder="Ej.: Cambio del router principal de la sede"
            required
            :disabled="guardando"
          >
        </div>
      </div>

      <div class="grid gap-5 sm:grid-cols-2">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="cServicio.id">Servicio afectado<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <select :id="cServicio.id" v-model="form.servicio_id" class="campo__control campo__control--select" required :disabled="guardando">
              <option value="" disabled>Elija un servicio</option>
              <option v-for="s in servicios" :key="s.id" :value="s.id">{{ s.nombre }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
          <p v-if="!servicios.length" class="campo__pie">No hay servicios. Un jefe puede crearlos en Configuración › Servicios.</p>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="cRiesgo.id">Riesgo<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <select :id="cRiesgo.id" v-model="form.riesgo" class="campo__control campo__control--select" required :disabled="guardando">
              <option v-for="op in OPCIONES_RIESGO_CAMBIO" :key="op.valor" :value="op.valor">{{ op.label }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="cDescripcion.id">Descripción<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <textarea
            :id="cDescripcion.id"
            v-model="form.descripcion"
            class="campo__control campo__control--area"
            rows="3"
            maxlength="4000"
            placeholder="Qué se va a cambiar, por qué y a quién afecta"
            required
            :disabled="guardando"
          ></textarea>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="cPlan.id">
          Plan de retroceso<span v-if="!esEstandar" aria-hidden="true"> *</span>
        </label>
        <div class="campo__caja">
          <textarea
            :id="cPlan.id"
            v-model="form.plan"
            class="campo__control campo__control--area"
            rows="3"
            maxlength="4000"
            :placeholder="esEstandar ? 'Opcional en un cambio estándar' : 'Cómo se vuelve atrás si algo falla'"
            :disabled="guardando"
          ></textarea>
        </div>
      </div>

      <div class="grid gap-5 sm:grid-cols-2">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="cInicio.id">Inicio de la ventana<span v-if="!esEmergencia" aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input :id="cInicio.id" v-model="form.inicio" class="campo__control" type="datetime-local" :disabled="guardando">
          </div>
        </div>
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="cFin.id">Fin de la ventana<span v-if="!esEmergencia" aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input :id="cFin.id" v-model="form.fin" class="campo__control" type="datetime-local" :disabled="guardando">
          </div>
        </div>
      </div>
      <p v-if="esEmergencia" class="-mt-2 text-xs text-gray-500">En una emergencia la ventana es opcional: se ejecuta de inmediato.</p>

      <p v-if="faltaParaEnviar.length" class="text-xs text-gray-500" data-falta>
        Para {{ esEstandar ? 'autorizarlo' : 'enviarlo' }} falta: {{ faltaParaEnviar.join('; ') }}.
      </p>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton
        variant="outline"
        severity="secondary"
        icon="ti ti-device-floppy"
        :label="cambio ? 'Guardar cambios' : 'Guardar borrador'"
        :disabled="guardando || !borradorCompleto"
        @click="guardar(false)"
      />
      <AppButton
        type="submit"
        form="cambio-form"
        :icon="iconoEnviar"
        :label="guardando ? 'Guardando...' : textoEnviar"
        :loading="guardando"
        :disabled="faltaParaEnviar.length > 0"
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
