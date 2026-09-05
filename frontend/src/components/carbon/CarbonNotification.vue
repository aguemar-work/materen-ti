<script setup>
// Notificación de IBM Carbon v11 — inline y toast.
//
// QUÉ RESUELVE
// El sistema tenía **tres** formas de decir "pasó algo" y ninguna era una
// notificación de Carbon:
//
//   `.toast`        abajo a la derecha, `main.css`, disparada por core/toast.js
//   `.aviso-card`   ARRIBA a la derecha, scoped en AppNotifications.vue
//   `.form-error`   un bloque al pie del formulario
//
// Las dos primeras son lo mismo con distinto nombre, distinto sitio de la
// pantalla y distinto CSS. La tercera es un caso de la inline que nunca se
// generalizó: solo sabe decir "error", en un solo lugar de la página.
//
// LAS DOS VARIANTES DE CARBON
//   inline  vive DENTRO del contenido, en el flujo, donde ocurrió el hecho.
//           Para un aviso que pertenece a lo que se está mirando: un
//           formulario que no se pudo guardar, un equipo que lleva 40 días
//           sin devolver. No se va sola.
//   toast   flota sobre el contenido, arriba a la derecha, y se va sola. Para
//           confirmar algo que el usuario acaba de hacer y que no necesita
//           volver a leer.
//
// La regla para elegir: **¿el aviso sigue siendo cierto si el usuario mira
// para otro lado?** Si sí, es inline. Si es el eco de una acción, es toast.
//
// SOBRE LOS COLORES
// Reusa los pares semánticos ya verificados (`--color-*-bg`/`-text`), que son
// los `tag-*` de Carbon. Carbon usa para notificaciones un tinte un escalón
// más claro (el paso 10 en vez del 20); no se transcribe para no agregar
// cuatro tokens que solo usaría este componente, y el par que se usa ya está
// medido en scripts/contraste.mjs. Es una desviación menor y declarada.
//
// La barra de la izquierda va en **2px** y no en los 3px del spec: regla de
// la casa, ningún acento estructural la supera (ver GUIA-UX-UI, "Principios
// de diseño").
import { computed } from 'vue';

const TIPOS = {
  error:   { icono: 'ti-alert-circle-filled', rol: 'danger' },
  success: { icono: 'ti-circle-check-filled', rol: 'success' },
  warning: { icono: 'ti-alert-triangle-filled', rol: 'warning' },
  info:    { icono: 'ti-info-circle-filled', rol: 'info' },
};

const props = defineProps({
  // La lista va escrita y no `(v) => v in TIPOS`: defineProps() se hoistea
  // fuera de setup(), asi que no puede referenciar una constante local del
  // <script setup> (el compilador de Vue lo rechaza). TIPOS sigue siendo la
  // fuente de verdad en runtime, abajo.
  /** error | success | warning | info */
  tipo: {
    type: String,
    default: 'info',
    validator: (v) => ['error', 'success', 'warning', 'info'].includes(v),
  },
  /** inline (en el flujo) | toast (flota y se va sola) — ver la cabecera. */
  variante: { type: String, default: 'inline', validator: (v) => ['inline', 'toast'].includes(v) },
  titulo: { type: String, default: '' },
  /** Cuerpo. También se puede pasar por el slot por defecto (permite enlaces). */
  detalle: { type: String, default: '' },
  /** Muestra la X. Sin esto el aviso no se puede descartar, que es lo correcto
   *  para un error que sigue vigente hasta que se corrija. */
  descartable: { type: Boolean, default: false },
});

defineEmits(['cerrar']);

const info = computed(() => TIPOS[props.tipo] ?? TIPOS.info);

// `alert` interrumpe al lector de pantalla; `status` espera a que termine lo
// que está leyendo. Un error merece lo primero; una confirmación, no.
const rolAria = computed(() => (props.tipo === 'error' ? 'alert' : 'status'));
</script>

<template>
  <div
    class="cds-notif"
    :class="[`cds-notif--${info.rol}`, `cds-notif--${variante}`]"
    :role="rolAria"
  >
    <i class="ti cds-notif__icono" :class="info.icono" aria-hidden="true"></i>

    <div class="cds-notif__texto">
      <p v-if="titulo" class="cds-notif__titulo">{{ titulo }}</p>
      <p v-if="detalle || $slots.default" class="cds-notif__detalle">
        <slot>{{ detalle }}</slot>
      </p>
    </div>

    <slot name="accion" />

    <button
      v-if="descartable"
      class="cds-notif__cerrar"
      type="button"
      aria-label="Descartar aviso"
      @click="$emit('cerrar')"
    >
      <i class="ti ti-x" aria-hidden="true"></i>
    </button>
  </div>
</template>

<style scoped>
/* 48px de alto mínimo y la barra de acento a la izquierda: la anatomía de la
   InlineNotification de Carbon. El ícono arriba y no centrado verticalmente,
   para que con dos líneas de texto siga alineado con la primera. */
.cds-notif {
  display: flex;
  align-items: flex-start;
  gap: var(--space-6);
  min-height: var(--space-12);
  padding: var(--space-6) var(--space-7);
  border-radius: var(--radius-base);
  border-left: 2px solid;
  font-size: var(--fs-body-01);
  letter-spacing: var(--cds-body-01-ls);
}

.cds-notif__icono {
  flex-shrink: 0;
  margin-top: var(--space-1);
  font-size: var(--icon-sm);
}

.cds-notif__texto {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

/* El título en 600 y el detalle en 400, los dos al mismo tamaño: en Carbon
   la jerarquía dentro del aviso es de peso, no de escala — un aviso no tiene
   por qué traer su propia escala tipográfica. */
.cds-notif__titulo {
  font-weight: 600;
}

.cds-notif__detalle {
  overflow-wrap: anywhere;
}

.cds-notif__cerrar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--space-9);
  height: var(--space-9);
  margin: calc(var(--space-1) * -1) calc(var(--space-3) * -1) 0 0;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-base);
  color: inherit;
  cursor: pointer;
  font-size: var(--icon-sm);
}

.cds-notif__cerrar:hover {
  background: var(--color-bg-hover);
}

.cds-notif__cerrar:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

/* ── Variantes semánticas ─────────────────────────────────────
   El par -bg/-text ya está verificado en scripts/contraste.mjs; la barra y
   el ícono usan el color SÓLIDO de soporte, que pesa más que el texto y es
   lo primero que se ve. */
.cds-notif--danger  { background: var(--color-danger-bg);  color: var(--color-danger-text);  border-left-color: var(--color-danger); }
.cds-notif--success { background: var(--color-success-bg); color: var(--color-success-text); border-left-color: var(--color-success); }
.cds-notif--warning { background: var(--color-warning-bg); color: var(--color-warning-text); border-left-color: var(--color-warning); }
.cds-notif--info    { background: var(--color-info-bg);    color: var(--color-info-text);    border-left-color: var(--color-accent); }

/* ── Toast ────────────────────────────────────────────────────
   Lo único que cambia respecto de la inline es que flota: ancho acotado y
   sombra, porque acá sí hay una capa por encima del contenido — es el caso
   para el que existe --shadow-overlay. El posicionamiento (la pila, arriba a
   la derecha) NO vive acá: es del contenedor que las apila, no de cada una. */
.cds-notif--toast {
  width: min(360px, calc(100vw - var(--space-10)));
  box-shadow: var(--shadow-overlay);
}
</style>
