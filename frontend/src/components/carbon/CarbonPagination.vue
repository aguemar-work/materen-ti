<script setup>
// Paginación de IBM Carbon v11.
//
// QUÉ AGREGA SOBRE `Pagination.vue`
// La actual muestra `Mostrando 1–20 de 63` a la izquierda y `[◀] Página 2 de
// 4 [▶]` a la derecha. Le faltan las dos cosas que Carbon considera parte
// del control, y que en una tabla de 4 000 filas no son un lujo:
//
//   · **Filas por página.** Sin esto, ver 100 filas de golpe exige 5 clics de
//     "siguiente", y no hay forma de pedir menos en una pantalla chica.
//   · **Salto directo de página.** Con 4 páginas da igual; con 40, llegar a
//     la 37 son 36 clics.
//
// Es un superconjunto del componente anterior: los mismos props
// (`modelValue`, `totalItems`, `tamPagina`) más `tamanosPagina`. Migrar una
// vista es cambiar el import y, si se quiere el selector, pasar el array.
//
// SOBRE LOS DOS SELECTORES
// Son `<select>` nativos y no `CarbonCampo`: acá no hay etiqueta arriba, ni
// texto de ayuda, ni estado inválido — es un control inline dentro de una
// frase ("Filas por página: 20"). Meterle el armazón de un campo de
// formulario sería usar el componente equivocado porque comparte el widget.
import { computed } from 'vue';
import { TAM_PAGINA_DEFECTO } from '../../constants/paginacion.js';

const props = defineProps({
  /** Página actual, 1-based. */
  modelValue: { type: Number, required: true },
  totalItems: { type: Number, required: true },
  tamPagina: { type: Number, default: TAM_PAGINA_DEFECTO },
  /**
   * Opciones de "filas por página". Vacío = no se ofrece el selector, que es
   * lo correcto para una lista corta donde la elección no cambia nada.
   * Se pasa `TAMANOS_PAGINA` (constants/paginacion.js): una opción propia que
   * no incluya el tamaño inicial de la vista deja el `<select>` mostrando un
   * número que la tabla no cumple.
   */
  tamanosPagina: { type: Array, default: () => [] },
  /** Qué se está contando, en plural y minúscula: "empleados", "tickets". */
  unidad: { type: String, default: 'resultados' },
});

const emit = defineEmits(['update:modelValue', 'update:tamPagina']);

const totalPaginas = computed(() => Math.max(1, Math.ceil(props.totalItems / props.tamPagina)));
const paginas = computed(() => Array.from({ length: totalPaginas.value }, (_, i) => i + 1));

// El rango se acota contra el total: en la última página, `pagina * tam`
// suele pasarse (63 items en páginas de 20 daría "61–80 de 63").
const desde = computed(() => (props.totalItems === 0 ? 0 : (props.modelValue - 1) * props.tamPagina + 1));
const hasta = computed(() => Math.min(props.modelValue * props.tamPagina, props.totalItems));

function irA(pagina) {
  const destino = Math.min(Math.max(1, pagina), totalPaginas.value);
  if (destino !== props.modelValue) emit('update:modelValue', destino);
}

// Volver a la página 1 al cambiar el tamaño lo hace el padre, no este
// componente: tanto `store.cambiarTamPagina()` (crearStorePaginado.js) como
// `usePaginacion.cambiarTamPagina()` ya resetean la página, y son los dos
// únicos consumidores. Emitir además `update:modelValue` desde acá costaba
// una consulta de más por cada cambio de tamaño en los 7 listados con store
// —el reset del store recargaba, y el de acá recargaba otra vez—; el guard
// `_peticionId` tapaba el efecto, no el pedido.
//
// Quedarse en la página 7 después de pasar de 10 a 100 filas dejaría al
// usuario fuera de rango viendo un listado vacío sin explicación: si alguna
// vista futura ofrece `tamanosPagina`, tiene que resetear la página en su
// handler de `update:tamPagina`.
function cambiarTam(valor) {
  emit('update:tamPagina', Number(valor));
}
</script>

<template>
  <nav v-if="totalItems > 0" class="cds-pag" aria-label="Paginación">
    <div class="cds-pag__lado">
      <label v-if="tamanosPagina.length" class="cds-pag__campo">
        <span>Filas por página:</span>
        <select
          class="cds-pag__select"
          :value="tamPagina"
          @change="cambiarTam($event.target.value)"
        >
          <option v-for="t in tamanosPagina" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <span class="cds-pag__rango">{{ desde }}–{{ hasta }} de {{ totalItems }} {{ unidad }}</span>
    </div>

    <div v-if="totalPaginas > 1" class="cds-pag__lado">
      <label class="cds-pag__campo">
        <span class="sr-only">Ir a la página</span>
        <select
          class="cds-pag__select"
          :value="modelValue"
          @change="irA(Number($event.target.value))"
        >
          <option v-for="p in paginas" :key="p" :value="p">{{ p }}</option>
        </select>
        <span>de {{ totalPaginas }}</span>
      </label>

      <button
        class="cds-pag__flecha"
        type="button"
        :disabled="modelValue <= 1"
        aria-label="Página anterior"
        @click="irA(modelValue - 1)"
      >
        <i class="ti ti-chevron-left" aria-hidden="true"></i>
      </button>
      <button
        class="cds-pag__flecha"
        type="button"
        :disabled="modelValue >= totalPaginas"
        aria-label="Página siguiente"
        @click="irA(modelValue + 1)"
      >
        <i class="ti ti-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </nav>
</template>

<style scoped>
/* 40px de alto y una línea arriba: la barra de paginación de Carbon se apoya
   en la tabla, no flota debajo. Sin padding vertical — el alto lo fija la
   fila, igual que en la tabla. */
.cds-pag {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-6);
  min-height: var(--space-11);
  padding: 0 var(--space-9);
  border-top: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  font-size: var(--fs-body-01);
  letter-spacing: var(--cds-body-01-ls);
}

.cds-pag__lado {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.cds-pag__campo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  cursor: pointer;
}

/* El select se funde con la barra: sin fondo ni borde propio, porque acá es
   una palabra dentro de una frase, no un campo que haya que encontrar. */
.cds-pag__select {
  padding: var(--space-1) var(--space-3);
  background: transparent;
  border: none;
  border-radius: var(--radius-base);
  color: var(--color-text-primary);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--fs-body-01);
  font-variant-numeric: tabular-nums;
}

.cds-pag__select:hover {
  background: var(--color-bg-hover);
}

.cds-pag__select:focus-visible,
.cds-pag__flecha:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

.cds-pag__rango {
  font-variant-numeric: tabular-nums;
}

/* Las flechas son cuadradas y del alto de la barra: es lo que las vuelve un
   objetivo cómodo sin agrandar la barra. */
.cds-pag__flecha {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--space-11);
  height: var(--space-11);
  padding: 0;
  background: transparent;
  border: none;
  border-left: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-base);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: var(--icon-sm);
}

.cds-pag__flecha:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.cds-pag__flecha:disabled {
  color: var(--color-text-disabled);
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .cds-pag {
    padding: var(--space-4) var(--space-6);
  }

  /* En pantalla angosta el rango se lleva la fila entera y los controles
     bajan: apretarlos en 360px deja los dos selectores sin ancho. */
  .cds-pag__lado {
    flex: 1;
    justify-content: space-between;
  }
}
</style>
