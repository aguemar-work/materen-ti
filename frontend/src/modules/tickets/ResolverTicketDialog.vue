<script setup>
// Resolver un ticket según el procedimiento de cierre (migración 120): la
// solución aplicada es obligatoria y el solicitante la ve en su seguimiento
// (la base la publica como comentario visible); el ticket queda «Resuelto» y
// espera su calificación, que es la que lo cierra. Si no califica en las horas
// del parámetro, se cierra solo como «Cerrado automático – Sin validación».
// Sin solicitante vinculado nadie puede calificar: se cierra al resolver.
//
// Compartido por la página completa y el panel de Triage (las diferencias
// van como prop). `resolver(nota)` lo pone useTicketDetalleLogica: la acción
// vive en el store, acá solo el formulario. Emite `cerrar` con
// { nota, guardarKb } si se resolvió, o null si se canceló.
import { ref, computed } from 'vue';
import { SOLUCION_MAX } from '../../core/dominio-tickets.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const props = defineProps({
  // { codigo, titulo, empleado_id } del ticket de la ficha.
  ticket: { type: Object, required: true },
  resolver: { type: Function, required: true },
  horasAutocierre: { type: Number, default: 24 },
  // Ofrecer «guardar en la Base de Conocimiento» (quien tiene ese módulo).
  ofrecerKb: { type: Boolean, default: false },
});
const emit = defineEmits(['cerrar']);

const form = ref({ nota: '', guardarKb: false });
let resultado = null;

const { modal, guardando, error, ejecutarGuardado, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);
tomarSnapshot();

const campoNota = useCampoAccesible({ ayuda: () => 'Obligatoria' });
const infoError = infoNotificacion('error');
const infoAviso = infoNotificacion('info');
const sinSolicitante = computed(() => !props.ticket.empleado_id);

async function guardar() {
  error.value = '';
  const nota = form.value.nota.trim();
  if (!nota) {
    error.value = 'Escriba la solución aplicada: el solicitante la verá en su seguimiento.';
    return;
  }
  // ejecutarGuardado devuelve undefined cuando falla: la acción no devuelve
  // nada, así que el éxito se marca con true.
  const ok = await ejecutarGuardado(async () => {
    await props.resolver(nota);
    return true;
  }, { entidad: 'el ticket', porDefecto: 'No se pudo resolver el ticket' });
  if (!ok) return;
  resultado = { nota, guardarKb: props.ofrecerKb && form.value.guardarKb };
  tomarSnapshot();
  modal.value?.cerrar();
}
</script>

<template>
  <AppDialog
    ref="modal"
    titulo="Resolver ticket"
    size="sm"
    :confirmar-cierre="confirmarCierre"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="resolver-ticket-form" class="space-y-4" @submit.prevent="guardar">
      <p class="text-sm text-gray-700"><AppCodigo :valor="ticket.codigo" titulo="Número de ticket" /> · {{ ticket.titulo }}</p>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta flex items-baseline justify-between gap-3" :for="campoNota.id">
          <span>Solución aplicada<span aria-hidden="true"> *</span></span>
          <span class="text-xs font-normal tabular-nums text-gray-500" aria-hidden="true">{{ form.nota.length }}/{{ SOLUCION_MAX }}</span>
        </label>
        <div class="campo__caja">
          <textarea
            :id="campoNota.id"
            v-model="form.nota"
            class="campo__control campo__control--area"
            :rows="5"
            required
            :maxlength="SOLUCION_MAX"
            :disabled="guardando"
            placeholder="Qué se hizo y cómo se comprobó; cite la evidencia de cierre (por ejemplo, el registro en KAPO Almacén)"
            :aria-describedby="campoNota.describedBy.value"
          ></textarea>
        </div>
        <p :id="campoNota.idAyuda" class="campo__pie">El solicitante la verá en su seguimiento. No la reemplaza una nota interna.</p>
      </div>

      <div class="notif notif--inline" :class="`notif--${infoAviso.rol}`" :role="infoAviso.rolAria">
        <i class="ti" :class="infoAviso.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p v-if="sinSolicitante" class="notif__detalle">
            Este ticket no tiene un solicitante que califique: se cerrará al resolverlo.
          </p>
          <p v-else class="notif__detalle">
            Antes de resolver, verifique la condición de cierre del procedimiento. Si espera a Almacén o a un proveedor,
            deje el ticket en curso con una nota. El solicitante califica la atención para cerrarlo; si no califica en
            {{ horasAutocierre }} horas, se cierra como «Cerrado automático – Sin validación».
          </p>
        </div>
      </div>

      <label v-if="ofrecerKb" class="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
        <input v-model="form.guardarKb" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary-500" :disabled="guardando">
        Guardar esta solución como borrador en la Base de Conocimiento
      </label>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </form>
    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton type="submit" form="resolver-ticket-form" icon="ti ti-circle-check" :label="guardando ? 'Resolviendo...' : 'Resolver'" :loading="guardando" />
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
