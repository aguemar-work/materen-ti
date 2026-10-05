<script setup>
// Reclasificar un ticket (catálogo v2, migración 116): el JEFE elige la
// subcategoría correcta (con ella va su categoría) y escribe el motivo; la RPC
// reclasificar_ticket deja el evento en la hoja de vida del ticket. Nunca
// cambia el tipo ni la prioridad del ticket. Elegir la misma subcategoría que
// ya tiene registra «Clasificación confirmada» (el ticket sale de la lista).
// Emite `cerrar` con la respuesta de la RPC, o con null si se canceló.
import { ref, computed } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { MOTIVO_RECLASIFICAR_MAX } from '../../core/dominio-tickets.js';
import { formatFecha } from '../../core/formatters.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const props = defineProps({
  // Fila de v_tickets_por_reclasificar
  ticket: { type: Object, required: true },
  categorias: { type: Array, default: () => [] },
  subcategorias: { type: Array, default: () => [] },
});
const emit = defineEmits(['cerrar']);

const form = ref({ subcategoriaId: '', motivo: '' });
let resultado = null;

const { modal, guardando, error, ejecutarGuardado, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);
tomarSnapshot();

const campoSub = useCampoAccesible();
const campoMotivo = useCampoAccesible({ ayuda: () => 'Obligatorio' });
const infoError = infoNotificacion('error');

// Subcategorías agrupadas por categoría, en el orden del catálogo.
const grupos = computed(() => props.categorias
  .map((c) => ({ categoria: c, subs: props.subcategorias.filter((s) => s.categoria_id === c.id) }))
  .filter((g) => g.subs.length));

const clasificacionActual = computed(() => {
  const t = props.ticket;
  if (!t.categoria) return 'Sin categoría';
  return `${t.categoria} › ${t.subcategoria || 'sin subcategoría'}`;
});

async function guardar() {
  error.value = '';
  if (!form.value.subcategoriaId) {
    error.value = 'Seleccione la subcategoría correcta.';
    return;
  }
  if (!form.value.motivo.trim()) {
    error.value = 'Indique el motivo de la reclasificación.';
    return;
  }
  const r = await ejecutarGuardado(
    () => insforgeApi.reclasificarTicket(props.ticket.ticket_id, form.value.subcategoriaId, form.value.motivo),
    { entidad: 'el ticket', porDefecto: 'No se pudo reclasificar el ticket' },
  );
  if (r === undefined) return;
  resultado = r || { ticket_id: props.ticket.ticket_id };
  tomarSnapshot();
  modal.value?.cerrar();
}
</script>

<template>
  <AppDialog
    ref="modal"
    titulo="Reclasificar ticket"
    size="sm"
    :confirmar-cierre="confirmarCierre"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="reclasificar-form" class="space-y-4" @submit.prevent="guardar">
      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Ticket</dt>
        <dd class="min-w-0"><AppCodigo :valor="ticket.codigo" titulo="Número de ticket" /> · <span class="text-gray-900">{{ ticket.titulo }}</span></dd>
        <dt class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Hoy</dt>
        <dd class="min-w-0 text-gray-700">{{ clasificacionActual }}</dd>
        <dt class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Creado</dt>
        <dd class="tabular-nums text-gray-700">{{ formatFecha(ticket.created_at) }}</dd>
      </dl>
      <p v-if="ticket.descripcion" class="whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{{ ticket.descripcion }}</p>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoSub.id">Subcategoría correcta<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <select :id="campoSub.id" v-model="form.subcategoriaId" class="campo__control campo__control--select" required :disabled="guardando">
            <option value="" disabled>Seleccionar</option>
            <optgroup v-for="g in grupos" :key="g.categoria.id" :label="g.categoria.nombre">
              <option v-for="s in g.subs" :key="s.id" :value="s.id">{{ s.nombre }}{{ s.id === ticket.subcategoria_id ? ' (actual)' : '' }}</option>
            </optgroup>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta flex items-baseline justify-between gap-3" :for="campoMotivo.id">
          <span>Motivo<span aria-hidden="true"> *</span></span>
          <span class="text-xs font-normal tabular-nums text-gray-500" aria-hidden="true">{{ form.motivo.length }}/{{ MOTIVO_RECLASIFICAR_MAX }}</span>
        </label>
        <div class="campo__caja">
          <textarea
            :id="campoMotivo.id"
            v-model="form.motivo"
            class="campo__control campo__control--area"
            :rows="3"
            required
            :maxlength="MOTIVO_RECLASIFICAR_MAX"
            :disabled="guardando"
            :aria-describedby="campoMotivo.describedBy.value"
          ></textarea>
        </div>
        <p :id="campoMotivo.idAyuda" class="campo__pie">Queda en la hoja de vida del ticket. El tipo y la prioridad del ticket no cambian.</p>
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
      <AppButton type="submit" form="reclasificar-form" :label="guardando ? 'Guardando...' : 'Reclasificar'" :loading="guardando" />
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
