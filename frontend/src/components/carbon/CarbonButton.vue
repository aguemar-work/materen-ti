<script setup>
// Botón de IBM Carbon v11.
//
// QUÉ CAMBIA RESPECTO DE `.btn`
// Tres cosas, y ninguna es cosmética:
//
// 1. **Hay jerarquía.** Carbon publica cinco niveles y el sistema anterior
//    tenía cuatro variantes sin orden entre sí (`.btn`, `.btn-primary`,
//    `.btn-danger`, `.btn-danger-solid`). El orden importa porque responde
//    la pregunta que se hace en cada pantalla: "de estos tres botones, ¿cuál
//    pesa más?".
//
//      primary    azul sólido          la acción de la vista. UNA por pantalla
//      secondary  superficie + borde   la alternativa real ("Cancelar" en un modal)
//      tertiary   azul con borde       acción secundaria que no compite
//      ghost      solo texto azul      acción de baja jerarquía, en una fila
//      danger     rojo sólido          destructiva e irreversible
//
//    Carbon v11 estricto define el **secondary como gris SÓLIDO**, no un
//    contorno — esa fue la primera versión de este componente. La revisión
//    "Modern Clean Enterprise" del 2026-09-03 lo cambió a superficie clara +
//    borde sutil (`--color-btn-secondary` + `--color-border-default`),
//    porque el bloque gris sólido se leía como una acción más pesada que la
//    primaria en vez de una alternativa — ver docs/GUIA-UX-UI.md, "Revisión
//    Modern Clean Enterprise (2026-09-03)". El secondary sigue distinguido
//    del tertiary: éste es azul con borde, aquél es gris con borde, así que
//    "esta es la alternativa de verdad" sigue teniendo una forma propia.
//
// 2. **Hay tamaños.** `.btn` tenía UN alto, 36px, que no es un paso de
//    Carbon. Acá son los tres del spec en rango de UI: 32 / 40 / 48.
//    Los pasos `xl` (64px) y `2xl` (80px) NO se transcriben, por el mismo
//    motivo que el ícono de 24px: son para layouts expresivos y formularios
//    de ancho completo, y este panel no tiene ninguno. Un tamaño sin
//    consumidor en una escala recién escrita es peso muerto.
//
// 3. **El ícono va a la DERECHA**, con la etiqueta a la izquierda y el
//    espacio entre las dos. Es la anatomía del botón de Carbon. En el
//    sistema anterior el ícono iba a la izquierda, pegado al texto.
//
// SOBRE EL TEXTO DE LOS RELLENOS SÓLIDOS
// Usa `--color-text-on-color` (blanco en TODOS los temas), nunca
// `--color-text-inverse`. Confundir los dos es lo que dejó al botón primario
// con texto casi negro sobre azul en tema oscuro —3.41:1— hasta el
// 2026-09-02 (CB-10 en docs/HISTORIAL-AUDITORIAS.md). El fondo de estos
// botones no cambia con el tema, así que su texto tampoco puede.
//
// SOBRE EL PROP `to`: MISMO PATRÓN QUE CarbonTabs
// Un botón que navega a una URL fija (ej. "Volver a Equipos") tiene que ser
// un ENLACE, no un `<button>` con `router.push` en el handler: se abre en
// pestaña nueva con ctrl+clic, se copia, un lector de pantalla lo anuncia
// como destino. Con `to` (string u objeto de Vue Router) este componente
// renderiza `<RouterLink>` con las mismas clases y estilos; sin `to`,
// `<button>` — igual que CarbonTabs resuelve el mismo problema.
import { computed, useSlots } from 'vue';

const props = defineProps({
  /** primary | secondary | tertiary | ghost | danger — ver la tabla de arriba. */
  variante: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'secondary', 'tertiary', 'ghost', 'danger'].includes(v),
  },
  /** sm (32px) | md (40px) | lg (48px). */
  tam: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
  /** Clase del ícono Tabler (`ti-plus`). Se renderiza a la DERECHA. */
  icono: { type: String, default: '' },
  /**
   * Ícono que reemplaza a la etiqueta mientras la acción está en vuelo.
   * Con `cargando` el botón se deshabilita solo: un submit que se puede
   * disparar dos veces es un bug de datos, no de UI.
   */
  cargando: { type: Boolean, default: false },
  deshabilitado: { type: Boolean, default: false },
  tipo: { type: String, default: 'button' },
  /** Ocupa el ancho del contenedor (footer de modal, formulario angosto). */
  ancho: { type: Boolean, default: false },
  /** Destino de Vue Router (string u objeto). Con `to` renderiza `<RouterLink>` en vez de `<button>`. */
  to: { type: [String, Object], default: null },
});

const slots = useSlots();
const inerte = computed(() => props.deshabilitado || props.cargando);
// Sin etiqueta el botón es solo-ícono: centra en vez de separar, y ahí sí
// necesita un nombre accesible propio (lo exige scripts/patrones-ui.mjs, y
// quien lo use debe pasar aria-label).
const soloIcono = computed(() => !slots.default);
const clases = computed(() => [
  `cds-btn--${props.variante}`,
  `cds-btn--${props.tam}`,
  { 'cds-btn--ancho': props.ancho, 'cds-btn--solo-icono': soloIcono.value },
]);
</script>

<template>
  <RouterLink v-if="to" class="cds-btn" :class="clases" :to="to">
    <span v-if="!soloIcono" class="cds-btn__label"><slot /></span>
    <i v-if="icono" class="ti cds-btn__icono" :class="icono" aria-hidden="true"></i>
  </RouterLink>
  <button
    v-else
    class="cds-btn"
    :class="clases"
    :type="tipo"
    :disabled="inerte"
  >
    <span v-if="!soloIcono" class="cds-btn__label"><slot /></span>
    <i
      v-if="cargando"
      class="ti ti-loader-2 cds-btn__icono cds-btn__icono--girando"
      aria-hidden="true"
    ></i>
    <i v-else-if="icono" class="ti cds-btn__icono" :class="icono" aria-hidden="true"></i>
  </button>
</template>

<style scoped>
/* La etiqueta a la izquierda y el ícono a la derecha, con el espacio en el
   medio: es la anatomía del botón de Carbon. Con ancho automático el botón
   abraza su contenido y se ve igual que uno centrado; la diferencia aparece
   en `--ancho`, que es donde importa (footer de modal). */
.cds-btn {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-10);
  padding: 0 var(--space-7);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--fs-body-01);
  font-weight: 500;
  letter-spacing: var(--cds-body-01-ls);
  text-align: left;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
}

/* Peso 500: equilibrio moderno y legible entre el texto y el contenedor. */

.cds-btn--sm { min-height: var(--space-10); }
.cds-btn--md { min-height: var(--space-11); }
.cds-btn--lg { min-height: var(--space-12); }

.cds-btn--ancho {
  width: 100%;
  flex: 1;
}

.cds-btn--solo-icono {
  justify-content: center;
  gap: 0;
  padding: 0;
  aspect-ratio: 1;
}

.cds-btn__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.cds-btn__icono {
  flex-shrink: 0;
  font-size: var(--icon-sm);
}

.cds-btn__icono--girando {
  animation: cds-btn-girar 0.7s linear infinite;
}

@keyframes cds-btn-girar {
  to { transform: rotate(360deg); }
}

/* Foco: anillo externo nítido de foco */
.cds-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ring);
}

/* ── Variantes Modern Clean Enterprise ──────────────────────── */
.cds-btn--primary {
  background: var(--color-accent);
  color: var(--color-text-on-color);
  box-shadow: var(--shadow-sm);
}
.cds-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
  box-shadow: var(--shadow-md);
}

.cds-btn--secondary {
  background: var(--color-btn-secondary);
  border-color: var(--color-border-default);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}
.cds-btn--secondary:hover:not(:disabled) {
  background: var(--color-btn-secondary-hover);
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-sm);
}

.cds-btn--tertiary {
  background: transparent;
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}
.cds-btn--tertiary:hover:not(:disabled) {
  background: var(--color-accent);
  color: var(--color-text-on-color);
}

.cds-btn--ghost {
  background: transparent;
  color: var(--color-accent-text);
}
.cds-btn--ghost:hover:not(:disabled) { background: var(--color-bg-hover); }

.cds-btn--danger {
  background: var(--color-danger-solid);
  color: var(--color-text-on-color);
}
.cds-btn--danger:hover:not(:disabled) { background: var(--color-danger-hover); }

/* Deshabilitado: relleno GRIS de verdad, no el contenido a media opacidad.
   Con `opacity: .5` un primario deshabilitado queda azul lavado y sigue
   leyéndose como la acción principal; con el gris deja de competir, que es
   lo que "deshabilitado" tiene que comunicar. Es lo que hace Carbon.
   El contraste del texto no se exige: WCAG exime los controles inactivos. */
.cds-btn:disabled {
  background: var(--color-bg-accent);
  border-color: transparent;
  color: var(--color-text-disabled);
  cursor: not-allowed;
}
</style>
