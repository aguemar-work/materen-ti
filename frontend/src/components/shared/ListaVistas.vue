<script setup>
// Lista de Vistas — reemplaza el modelo anterior de Tickets (Estado
// dropdown/nav-list + toggles sueltos, ver TicketsView.vue PASO 1). Un
// solo componente, reutilizado con los MISMOS datos en Tabla y Triage (y
// pensado para cualquier módulo futuro con el mismo patrón) — el layout
// (columna angosta, fila horizontal, etc.) lo decide el consumidor vía la
// clase que le pase; este componente no impone display/flex-direction
// propio, solo la lista de botones.
defineProps({
  vistas: { type: Array, required: true }, // [{ id, label, icono, filtro }]
  modelValue: { type: String, required: true },
  conteos: { type: Object, default: null }, // { [id]: numero } — opcional, no obliga a calcularlo si no hace falta
  // Deshabilita el grupo ENTERO (no por ítem) — pensado para un sub-filtro
  // que solo aplica bajo cierta Vista padre (ver "Mis tickets" en
  // TicketsView.vue: los 4 sub-estados quedan deshabilitados hasta que esa
  // Vista está activa). `.tnav-item:disabled` ya trae opacidad/cursor
  // propios, no hace falta CSS nuevo por consumidor.
  disabled: { type: Boolean, default: false },
  // Layout del grupo. 'nav' = columna de riel (bandejas del nav lateral).
  // 'segmento' = control segmentado horizontal, para un eje que refina lo
  // que la bandeja activa ya acotó y que por eso vive junto a la lista, no
  // en el nav. Es el MISMO componente y los mismos datos: lo único que
  // cambia es la envoltura, igual que SelectorVista.vue no es un
  // componente distinto por aparecer en un header o en una toolbar.
  variante: { type: String, default: 'nav' },
});
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <div class="lista-vistas" :class="`lista-vistas--${variante}`" role="group" aria-label="Vistas">
    <button
      v-for="v in vistas"
      :key="v.id"
      type="button"
      class="tnav-item"
      :class="{ 'tnav-item--activo': modelValue === v.id }"
      :aria-pressed="modelValue === v.id"
      :disabled="disabled"
      @click="emit('update:modelValue', v.id)"
    >
      <i v-if="v.icono" class="ti" :class="v.icono" aria-hidden="true"></i>
      <span class="tnav-label">{{ v.label }}</span>
      <!-- Contador en TODAS las vistas, no solo la activa (rediseño ago
           2026): el nav existe para decir de un vistazo qué cola está
           creciendo — mostrar el número únicamente de la vista en la que ya
           estás parado no responde eso. `!= null` y no un truthy check: 0 es
           un valor válido y tiene que verse ("Sin asignar 0" es la mejor
           noticia del turno, no un dato ausente). -->
      <span v-if="conteos && conteos[v.id] != null" class="tnav-contador">{{ conteos[v.id] }}</span>
    </button>
  </div>
</template>


