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

<style>
/* Global (sin scoped) a propósito: .tnav-item también lo usa el botón
   "Vencidos" de TicketsView.vue, fuera de este componente — mismo
   criterio que .icon-btn/.chip-filtro, clases compartidas sin scope de un
   único componente dueño. */
.tnav-item {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 36px;
  padding: 0 var(--space-5);
  border: none;
  border-radius: var(--radius-base);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--fs-body-01);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
}

.tnav-item:hover:not(:disabled) { background: var(--color-bg-hover); }

.tnav-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ring);
}

/* Mismo par tenue/acento que el ítem activo del sidebar real (GUIA-UX-UI):
   un solo lenguaje para "esto está seleccionado" en toda la app. */
.tnav-item--activo {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
}

.tnav-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tnav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Gris terciario en reposo: con el contador en las 6 vistas, heredar el
   color del label pondría 6 números al mismo peso que 6 etiquetas y la
   columna se leería como una tabla de dos columnas, no como un nav. El
   ítem activo sí lo hereda (regla de abajo) y así el número de la vista
   en curso queda en acento, igual que su etiqueta. */
.tnav-contador {
  font-size: var(--fs-label-01);
  font-weight: 700;
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.tnav-item--activo .tnav-contador { color: inherit; }

/* ── Variante segmento ──────────────────────────────────────────────────
   Grupo horizontal contenido, para un sub-eje que refina la bandeja activa.
   Copia deliberada del tratamiento de SelectorVista.vue (contenedor
   bg-subtle + borde + radio, activo en bg-elevated + acento + --shadow-sm)
   en vez de inventar un tercer lenguaje de "seleccionado": en el sistema hay
   exactamente dos, el fondo de acento tenue (nav/sidebar, sobre superficie
   elevada) y este (grupo segmentado, sobre superficie hundida). El activo no
   puede usar accent-subtle acá porque el contenedor ya es bg-subtle y los
   dos tonos se pisan — el mismo motivo que ya está anotado en
   SelectorVista.vue. */
.lista-vistas--segmento {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg-subtle);
  min-width: 0;
}

.lista-vistas--segmento .tnav-item {
  height: 30px;
  padding: 0 var(--space-5);
  gap: var(--space-3);
}

/* En el riel el label se estira para que los contadores alineen en columna;
   en un segmento cada botón mide su contenido, si no el grupo se estira a
   todo el ancho de la toolbar. */
.lista-vistas--segmento .tnav-label { flex: 0 0 auto; }

/* El contador sube un escalón (terciario -> secundario) SOLO en esta
   variante, y no por gusto: --color-text-tertiary está calibrado contra
   --color-bg-elevated (4.86:1), pero el segmento vive sobre
   --color-bg-subtle, donde cae a 4.33:1 y deja de pasar AA. Verificado en
   scripts/contraste.mjs (par `segmentoContador`). Mismo remedio local que
   ya usa .fila-ticket--activa en TicketsView.vue: se corrige el par en la
   única superficie que lo necesita, no el token global. */
.lista-vistas--segmento .tnav-contador { color: var(--color-text-secondary); }

.lista-vistas--segmento .tnav-item--activo {
  background: var(--color-bg-elevated);
  color: var(--color-accent-text);
  box-shadow: none;
}

.lista-vistas--segmento .tnav-item--activo:hover {
  background: var(--color-bg-elevated);
}
</style>
