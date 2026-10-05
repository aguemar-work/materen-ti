<script setup>
// Un solo campo de texto para las acciones de un cambio (migración 107) que piden
// una nota:
//   · OBLIGATORIA (≤ 1000): rechazar, revertir y cancelar un cambio que ya salió
//     de borrador. Queda en `resultado` y en el libro, con quién y cuándo.
//   · OPCIONAL: aprobar (también a posteriori una emergencia), marcar como
//     implementado y cerrar.
// El servidor repite la regla; acá solo se evita mandar lo que rechazaría.
import { ref, computed } from 'vue';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useCambiosStore } from '../../stores/cambios.js';
import { showToast } from '../../core/toast.js';
import { estadoCambioInfo } from '../../core/dominio-cambios.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';

const props = defineProps({
  // Una acción de accionesDeCambio() con `nota` distinta de null.
  accion: { type: Object, required: true },
  cambio: { type: Object, required: true },
});
const emit = defineEmits(['cerrar']);

const MAX = 1000;
const store = useCambiosStore();
const dialogo = ref(null);
const texto = ref('');
const guardando = ref(false);
const error = ref('');
const infoError = infoNotificacion('error');
const campo = useCampoAccesible({ error: () => error.value });
let resultado = false;

const obligatoria = computed(() => props.accion.nota === 'obligatoria');
const etiqueta = computed(() => {
  if (props.accion.destino === 'rechazado') return 'Motivo del rechazo';
  if (props.accion.destino === 'revertido') return 'Por qué se revierte';
  if (props.accion.destino === 'cancelado') return 'Motivo de la cancelación';
  if (props.accion.destino === 'implementado') return 'Resultado';
  return 'Nota';
});
const placeholder = computed(() => ({
  rechazado: 'Por qué no se aprueba, p. ej. la ventana coincide con el cierre contable',
  revertido: 'Qué falló y por qué hubo que deshacerlo',
  cancelado: 'Por qué se cancela, p. ej. ya no hace falta',
  implementado: 'Qué se hizo y cómo quedó, p. ej. router cambiado sin incidentes',
}[props.accion.destino] || 'Opcional'));
const enCurso = computed(() => ({
  rechazado: 'Rechazando...',
  revertido: 'Revirtiendo...',
  cancelado: 'Cancelando...',
  cerrado: 'Cerrando...',
}[props.accion.destino] || 'Guardando...'));

const faltaNota = computed(() => obligatoria.value && !texto.value.trim());

async function confirmar() {
  if (faltaNota.value) {
    error.value = 'Indique el motivo.';
    return;
  }
  error.value = '';
  guardando.value = true;
  const nota = texto.value.trim() || null;
  const id = props.cambio.id;
  try {
    if (props.accion.via === 'aprobar') await store.aprobar(id, nota);
    else if (props.accion.via === 'rechazar') await store.rechazar(id, nota);
    else await store.transicionar(id, props.accion.destino, nota);
    showToast(props.accion.destino
      ? `${props.cambio.codigo} pasó a «${estadoCambioInfo(store.detalle?.estado).label}»`
      : 'Aprobación registrada');
    resultado = true;
    dialogo.value?.cerrar();
  } catch (e) {
    error.value = traducirErrorDb(e, { entidad: 'cambio', porDefecto: 'No se pudo completar la operación.' }).mensaje;
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <AppDialog
    ref="dialogo"
    size="sm"
    :titulo="accion.label"
    :confirmar-cierre="() => !guardando"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="cambio-nota-form" class="space-y-4" @submit.prevent="confirmar">
      <p class="text-sm text-gray-600">
        <AppCodigo :valor="cambio.codigo" titulo="Número de cambio" /> · {{ cambio.titulo }}
      </p>

      <div class="campo" :class="{ 'campo--invalido': campo.invalido.value }">
        <label class="campo__etiqueta" :for="campo.id">{{ etiqueta }}<span v-if="obligatoria" aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <textarea
            :id="campo.id"
            v-model="texto"
            class="campo__control campo__control--area"
            rows="3"
            :maxlength="MAX"
            :placeholder="placeholder"
            :required="obligatoria"
            :disabled="guardando"
            :aria-invalid="campo.invalido.value"
            :aria-describedby="campo.describedBy.value"
          ></textarea>
        </div>
        <p class="campo__pie tabular-nums">Queda en el libro del cambio. {{ texto.length }}/{{ MAX }}</p>
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
        form="cambio-nota-form"
        :severity="accion.peligro ? 'danger' : 'primary'"
        :icon="`ti ${accion.icono}`"
        :label="guardando ? enCurso : accion.label"
        :loading="guardando"
        :disabled="faltaNota"
      />
    </template>
  </AppDialog>
</template>
