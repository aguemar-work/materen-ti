<script setup>
// Campo de formulario de IBM Carbon v11 — texto, select y textarea.
//
// EL CAMPO ES *OUTLINED*, NO FILLED
// El campo tiene fondo limpio, un borde perimetral de 1px, radio
// (`--radius-md`) y una sombra sutil (`--shadow-sm`); el foco agrega un halo
// (`box-shadow` de 2px en el color del acento). Carbon v11 estricto define
// el campo *filled* (fondo gris + una sola línea abajo), pero la revisión
// "Modern Clean Enterprise" del 2026-09-03 lo reemplazó junto con el resto
// de la geometría/elevación del sistema — ver docs/GUIA-UX-UI.md, "Revisión
// Modern Clean Enterprise (2026-09-03)" para el motivo completo. Hasta el
// 2026-09-02 los 91 campos de los 13 formularios eran cajas con contorno
// (el idioma de shadcn/Bootstrap, sin radio calibrado ni foco en halo); el
// outlined actual es ese mismo lenguaje con la geometría y el foco ya
// resueltos por el design system, no un regreso a lo anterior.
//
// Por qué funciona: el borde perimetral separa el campo de la tarjeta que
// lo contiene sin depender de una capa de gris de fondo, y el radio +
// sombra son los mismos recursos con los que el resto del sistema construye
// jerarquía (ver "Geometría y elevación" en la guía).
//
// POR QUÉ UN COMPONENTE Y NO TRES
// Carbon publica `TextInput`, `Select` y `TextArea` por separado, y el plan
// de convergencia los listaba así. Se hizo uno solo con un prop `tipo`
// porque en este sistema **el 90% del componente es el mismo**: la etiqueta
// arriba, la caja gris, la línea inferior, el foco, el texto de ayuda, el
// estado inválido con su mensaje. Tres archivos habrían sido tres copias de
// ese armazón — exactamente la duplicación que este plan existe para borrar
// (`.field-hint` está hoy redefinido en 7 archivos por el mismo motivo).
// Lo que de verdad difiere entre los tres —el chevron del select, el
// `resize` del textarea— son cuatro reglas.
//
// LO QUE AGREGA SOBRE `.form-group`
// Un **error por campo**. El sistema anterior solo tenía `.form-error`: un
// bloque al pie del formulario que dice qué falló pero no *dónde*. Acá el
// campo inválido se marca solo (línea roja de 2px + ícono) y lleva su
// mensaje debajo, enlazado por `aria-describedby`. El bloque al pie sigue
// sirviendo para el error de la operación completa ("no se pudo guardar"),
// que es otra cosa.
import { computed, useId, useTemplateRef } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  etiqueta: { type: String, required: true },
  /** text | email | password | number | date | select | textarea */
  tipo: { type: String, default: 'text' },
  /** sm (32px) | md (40px) | lg (48px). */
  tam: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
  /** Texto de ayuda permanente bajo el campo. Lo reemplaza el error si lo hay. */
  ayuda: { type: String, default: '' },
  /**
   * Mensaje de error DE ESTE CAMPO. Con valor, el campo se marca inválido:
   * línea roja, ícono y `aria-invalid`. Vacío, el campo está bien.
   */
  error: { type: String, default: '' },
  requerido: { type: Boolean, default: false },
  deshabilitado: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  filas: { type: Number, default: 3 },
});

defineEmits(['update:modelValue']);

// Sin esto, Vue aplica los atributos no declarados como prop (autocomplete,
// pattern, maxlength, inputmode, autofocus...) al <div> RAÍZ del componente,
// no al control real — un atributo que "no hace nada" y no avisa por qué.
// Encontrado en la migración de formularios (2026-09-03): LoginView perdía
// `autocomplete="current-password"` (gestores de contraseña) y
// PlataformasView perdía el `pattern` del slug. Con `inheritAttrs: false` +
// `v-bind="$attrs"` en el control, el atributo llega a donde el que llama
// esperaba que llegara.
defineOptions({ inheritAttrs: false });

// useId(): el id tiene que ser estable entre el render del servidor y el del
// cliente, y único aunque el mismo campo se monte dos veces (tabla + tarjeta
// móvil renderizan el mismo formulario en algunas vistas).
const id = useId();
const idAyuda = computed(() => `${id}-ayuda`);
const invalido = computed(() => Boolean(props.error));
const esArea = computed(() => props.tipo === 'textarea');
const esSelect = computed(() => props.tipo === 'select');

// Expone el control real para los casos donde el que llama necesita
// enfocarlo a mano (ej: LicenciaForm lleva el foco al campo que falló la
// última validación). Sin esto, un template ref sobre <CarbonCampo> entrega
// la instancia del componente, no el <input>/<select>/<textarea>, y
// `.focus()` no existe ahí.
const control = useTemplateRef('control');
defineExpose({ focus: () => control.value?.focus() });
</script>

<template>
  <div class="cds-campo" :class="[`cds-campo--${tam}`, { 'cds-campo--invalido': invalido, 'cds-campo--inerte': deshabilitado }]">
    <label class="cds-campo__etiqueta" :for="id">
      {{ etiqueta }}<span v-if="requerido" aria-hidden="true"> *</span>
    </label>

    <div class="cds-campo__caja">
      <textarea
        v-if="esArea"
        ref="control"
        :id="id"
        v-bind="$attrs"
        class="cds-campo__control cds-campo__control--area"
        :value="modelValue"
        :rows="filas"
        :placeholder="placeholder"
        :required="requerido"
        :disabled="deshabilitado"
        :aria-invalid="invalido"
        :aria-describedby="ayuda || error ? idAyuda : undefined"
        @input="$emit('update:modelValue', $event.target.value)"
      ></textarea>

      <select
        v-else-if="esSelect"
        ref="control"
        :id="id"
        v-bind="$attrs"
        class="cds-campo__control cds-campo__control--select"
        :value="modelValue"
        :required="requerido"
        :disabled="deshabilitado"
        :aria-invalid="invalido"
        :aria-describedby="ayuda || error ? idAyuda : undefined"
        @change="$emit('update:modelValue', $event.target.value)"
      >
        <slot name="opciones" />
      </select>

      <input
        v-else
        ref="control"
        :id="id"
        v-bind="$attrs"
        class="cds-campo__control"
        :type="tipo"
        :value="modelValue"
        :placeholder="placeholder"
        :required="requerido"
        :disabled="deshabilitado"
        :aria-invalid="invalido"
        :aria-describedby="ayuda || error ? idAyuda : undefined"
        @input="$emit('update:modelValue', $event.target.value)"
      >

      <i v-if="esSelect" class="ti ti-chevron-down cds-campo__adorno" aria-hidden="true"></i>
      <i v-else-if="invalido" class="ti ti-alert-circle-filled cds-campo__adorno cds-campo__adorno--error" aria-hidden="true"></i>
    </div>

    <!-- Un solo nodo para ayuda y error, y el error gana: dos líneas debajo
         del campo (una explicando cómo llenarlo y otra diciendo que está mal)
         compiten justo cuando hay que corregir algo. role="alert" solo
         cuando es error, para que el lector de pantalla no anuncie la ayuda
         permanente en cada render. -->
    <p
      v-if="error || ayuda"
      :id="idAyuda"
      class="cds-campo__pie"
      :class="{ 'cds-campo__pie--error': invalido }"
      :role="invalido ? 'alert' : undefined"
    >{{ error || ayuda }}</p>
  </div>
</template>

<style scoped>
.cds-campo {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Etiqueta ARRIBA del campo, siempre. Carbon no usa placeholder como
   etiqueta y este sistema tampoco (ver GUIA-UX-UI, "Label vs. placeholder"):
   un placeholder desaparece al escribir, justo cuando hay que verificar que
   se llenó el campo correcto. */
.cds-campo__etiqueta {
  margin-bottom: var(--space-4);
  color: var(--color-text-secondary);
  font-size: var(--fs-label-01);
  letter-spacing: var(--cds-label-01-ls);
}

/* La caja Modern Clean Enterprise: superficie limpia, borde perimetral sutil,
   radio suave y foco nítido con micro-sombra. */
.cds-campo__caja {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.cds-campo--sm .cds-campo__caja { min-height: var(--space-10); }
.cds-campo--md .cds-campo__caja { min-height: var(--space-11); }
.cds-campo--lg .cds-campo__caja { min-height: var(--space-12); }

.cds-campo__control {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 0 var(--space-7);
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--fs-body-01);
  letter-spacing: var(--cds-body-01-ls);
}

.cds-campo__control::placeholder {
  color: var(--color-text-tertiary);
}

.cds-campo__control--area {
  padding: var(--space-6) var(--space-7);
  resize: vertical;
  line-height: var(--cds-body-01-lh);
}

/* El select nativo pierde su flecha y se dibuja una con la webfont: el glifo
   del sistema operativo es distinto en cada plataforma y rompía la única
   cosa que un formulario denso necesita, que todos los campos se vean
   iguales. Mismo criterio que ya usaba `select` en main.css, con un ícono
   real en vez de un data-URI. */
.cds-campo__control--select {
  padding-right: var(--space-10);
  appearance: none;
  cursor: pointer;
}

.cds-campo__adorno {
  position: absolute;
  right: var(--space-7);
  pointer-events: none;
  color: var(--color-text-secondary);
  font-size: var(--icon-sm);
}

.cds-campo__adorno--error {
  color: var(--color-danger);
}

/* Foco: borde de acento + halo nítido */
.cds-campo__caja:focus-within {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--ring);
  outline: none;
}

/* Inválido: borde de error y halo de advertencia */
.cds-campo--invalido .cds-campo__caja {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 2px var(--ring-danger);
}

.cds-campo__pie {
  margin-top: var(--space-4);
  color: var(--color-text-tertiary);
  font-size: var(--fs-label-01);
  letter-spacing: var(--cds-label-01-ls);
}

.cds-campo__pie--error {
  color: var(--color-danger-text);
}

/* Inerte: fondo atenuado y borde sutil sin sombra */
.cds-campo--inerte .cds-campo__caja {
  background: var(--color-bg-subtle);
  border-color: var(--color-border-subtle);
  box-shadow: none;
}

.cds-campo--inerte .cds-campo__etiqueta,
.cds-campo__control:disabled {
  color: var(--color-text-disabled);
}

.cds-campo__control:disabled {
  cursor: not-allowed;
  -webkit-text-fill-color: var(--color-text-disabled); /* Safari ignora `color` en :disabled */
}
</style>
