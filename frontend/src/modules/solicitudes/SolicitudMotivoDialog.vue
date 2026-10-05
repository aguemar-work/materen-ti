<script setup>
// Un solo campo de texto, obligatorio, para las dos salidas que NO son
// «hecho» de una solicitud (migración 108):
//   · omitir un paso      → «por qué no corresponde»  (≤ 500). Un paso
//                           obligatorio solo lo omite un jefe: el servidor lo
//                           repite; acá no se ofrece a quien no puede.
//   · cancelar la solicitud → «por qué se cancela»    (≤ 500). Solo abiertas.
// El motivo queda en el libro de la solicitud con quién y cuándo.
import { ref, computed } from 'vue';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useSolicitudesStore } from '../../stores/solicitudes.js';
import { showToast } from '../../core/toast.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';

const props = defineProps({
  accion: { type: String, required: true, validator: (v) => ['omitir', 'cancelar'].includes(v) },
  solicitud: { type: Object, required: true },
  // Solo `omitir`: el paso que se omite.
  paso: { type: Object, default: null },
});
const emit = defineEmits(['cerrar']);

const MAX = 500;
const CONFIG = {
  omitir: {
    titulo: 'Omitir paso',
    etiqueta: 'Motivo',
    placeholder: 'Por qué no corresponde, p. ej. el cargo no usa equipo',
    boton: 'Omitir paso',
    enCurso: 'Omitiendo...',
    icono: 'ti ti-player-skip-forward',
    exito: 'Paso omitido',
  },
  cancelar: {
    titulo: 'Cancelar solicitud',
    etiqueta: 'Motivo de la cancelación',
    placeholder: 'Por qué se cancela, p. ej. pedido duplicado',
    boton: 'Cancelar solicitud',
    enCurso: 'Cancelando...',
    icono: 'ti ti-ban',
    exito: 'Solicitud cancelada',
  },
};

const config = computed(() => CONFIG[props.accion]);
const store = useSolicitudesStore();
const dialogo = ref(null);
const texto = ref('');
const guardando = ref(false);
const error = ref('');
const infoError = infoNotificacion('error');
const campo = useCampoAccesible({ error: () => error.value });
let resultado = false;

const faltaMotivo = computed(() => !texto.value.trim());

async function confirmar() {
  if (faltaMotivo.value) {
    error.value = 'Indique el motivo.';
    return;
  }
  error.value = '';
  guardando.value = true;
  try {
    const motivo = texto.value.trim();
    if (props.accion === 'omitir') await store.omitirPaso(props.solicitud.id, props.paso.id, motivo);
    else await store.cancelar(props.solicitud.id, motivo);
    showToast(config.value.exito);
    resultado = true;
    dialogo.value?.cerrar();
  } catch (e) {
    error.value = traducirErrorDb(e, { entidad: 'solicitud', porDefecto: 'No se pudo completar la operación.' }).mensaje;
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <AppDialog
    ref="dialogo"
    size="sm"
    :titulo="config.titulo"
    :confirmar-cierre="() => !guardando"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="solicitud-motivo-form" class="space-y-4" @submit.prevent="confirmar">
      <p class="text-sm text-gray-600">
        <AppCodigo :valor="solicitud.codigo" titulo="Número de solicitud" />
        <template v-if="paso"> · {{ paso.label }}</template>
      </p>

      <div class="campo" :class="{ 'campo--invalido': campo.invalido.value }">
        <label class="campo__etiqueta" :for="campo.id">{{ config.etiqueta }}<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <textarea
            :id="campo.id"
            v-model="texto"
            class="campo__control campo__control--area"
            rows="3"
            :maxlength="MAX"
            :placeholder="config.placeholder"
            required
            :disabled="guardando"
            :aria-invalid="campo.invalido.value"
            :aria-describedby="campo.describedBy.value"
          ></textarea>
        </div>
        <p class="campo__pie tabular-nums">Queda en el libro de la solicitud. {{ texto.length }}/{{ MAX }}</p>
      </div>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Volver" :disabled="guardando" @click="dialogo?.cerrar()" />
      <AppButton
        type="submit"
        form="solicitud-motivo-form"
        :severity="accion === 'cancelar' ? 'danger' : 'primary'"
        :icon="config.icono"
        :label="guardando ? config.enCurso : config.boton"
        :loading="guardando"
        :disabled="faltaMotivo"
      />
    </template>
  </AppDialog>
</template>
