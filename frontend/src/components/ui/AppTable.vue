<script setup>
// Wrapper estricto sobre primevue/datatable — segundo caso real del patrón
// (ver AppButton.vue para el primero). Sostiene la carga de datos del futuro
// ERP: hoy tickets/empleados/correos/equipos/licencias/kb/problemas ya
// comparten el mismo contrato de paginación server-side
// (stores/crearStorePaginado.js); este componente es la vista de ese
// contrato, no un DataTable genérico suelto.
//
// Columnas: se declaran con <AppColumn>, NO <Column> de primevue directo —
// ver components/ui/AppColumn.js para por qué ese archivo es un re-export y
// no un wrapper (DataTable no reconoce un wrapper propio como columna
// válida). Todo el estilo de columna (headerCell/bodyCell/hover/tipografía)
// sale de acá, de pt.column.*, aplicado por igual a cada <AppColumn>.
//
// Paginación: a propósito NO trae el paginador propio de PrimeVue. El
// sistema ya tiene components/shared/Pagination.vue conectado 1:1 al mismo
// store (`v-model="store.pagina"` + `total-items="store.total"`) en los 7
// listados existentes — reinventar un segundo paginador acá duplicaría UI y
// preset sin necesidad. `lazy`/`totalRecords` SÍ se exponen (evitan que
// DataTable pagine en el cliente sobre una `value` que ya es solo la página
// actual) y quedan preparados por si algún listado futuro prefiere paginador
// inline; `pagina-cambiada`/`tam-pagina-cambiada` se emiten para ese caso,
// pero el patrón recomendado sigue siendo <AppPaginacion> como hermano.
import { computed, useAttrs } from 'vue';
import DataTable from 'primevue/datatable';
import AppVacio from './AppVacio.vue';
import { buildTablePT } from './pt/table.pt.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  value: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  dataKey: { type: String, default: 'id' },
  // Server-side por defecto: es lo que necesita TODO listado real de este
  // sistema hoy. Un uso client-side puntual puede pasar `:lazy="false"`.
  lazy: { type: Boolean, default: true },
  totalRecords: { type: Number, default: 0 },
  rows: { type: Number, default: 20 },
  first: { type: Number, default: 0 },
  // Controlado desde afuera (store.orden), no estado interno — así el ícono
  // de orden de la columna nunca puede desincronizarse de lo que el servidor
  // realmente aplicó.
  sortField: { type: String, default: null },
  sortOrder: { type: Number, default: null }, // 1 asc | -1 desc
  // El store (crearStorePaginado.ordenarPor) solo alterna asc/desc, no tiene
  // un tercer estado "sin orden" — con esto en false, un tercer click en el
  // header no lo introduce (mismo comportamiento que la tabla ya tiene hoy).
  removableSort: { type: Boolean, default: false },
  // Paginador inline de PrimeVue, apagado por defecto — ver nota de arriba.
  paginator: { type: Boolean, default: false },
  // Selección múltiple por checkbox (2026-09-08, piloto Tickets): el
  // consumidor declara la columna con <AppColumn selection-mode="multiple">
  // (columna real de PrimeVue, AppColumn ya la soporta sin cambios — es un
  // re-export). Acá solo se expone el v-model:selection — un array de FILAS
  // (no de ids: así compara por `dataKey`, sobrevive a que `value` cambie de
  // referencia en cada recarga). Quien ya tenga su selección como Set<id>
  // (patrón existente en varias vistas) arma un computed puente en vez de
  // reescribir esa lógica — ver TicketsView.vue.
  selection: { type: Array, default: null },
  // rowClass/rowAttrs son props NATIVAS de DataTable, no un invento nuestro
  // — se exponen tal cual (rowClass ya es de PrimeVue; rowAttrs no existe en
  // PrimeVue, lo resolvemos nosotros vía pt.bodyRow, ver table.pt.js) porque
  // ninguna vista las había necesitado hasta Tickets (fila con
  // aria-current/clase por selección). Sin uso, no hacen nada — no afectan
  // a Licencias/Equipos.
  rowClass: { type: Function, default: null },
  rowAttrs: { type: Function, default: null },
});

const emit = defineEmits(['ordenar', 'pagina-cambiada', 'tam-pagina-cambiada', 'update:selection']);

const attrs = useAttrs();
const restAttrs = computed(() => {
  const { class: _class, ...resto } = attrs;
  return resto;
});
const pt = computed(() => buildTablePT(props, attrs.class));

// El store expone ordenarPor(columna) — ya decide él mismo si toca alternar
// asc/desc (mismo click sobre la misma columna) o empezar en asc (columna
// nueva). Reenviar sortOrder de PrimeVue acá sería una segunda fuente de
// verdad para lo mismo; se descarta a propósito.
function onSort(event) {
  if (event.sortField) emit('ordenar', event.sortField);
}

function onPage(event) {
  if (event.rows !== props.rows) emit('tam-pagina-cambiada', event.rows);
  else emit('pagina-cambiada', event.page + 1); // PrimeVue pagina desde 0
}
</script>

<template>
  <DataTable
    :value="value"
    :loading="loading"
    :data-key="dataKey"
    :lazy="lazy"
    :total-records="totalRecords"
    :rows="rows"
    :first="first"
    :sort-field="sortField"
    :sort-order="sortOrder"
    :removable-sort="removableSort"
    :paginator="paginator"
    :selection="selection"
    :row-class="rowClass"
    row-hover
    :pt="pt"
    v-bind="restAttrs"
    @sort="onSort"
    @page="onPage"
    @update:selection="$emit('update:selection', $event)"
  >
    <slot />
    <template #empty>
      <slot name="empty">
        <AppVacio variante="seccion" titulo="Sin resultados" mensaje="No hay datos que coincidan con la búsqueda o los filtros aplicados." />
      </slot>
    </template>
  </DataTable>
</template>
