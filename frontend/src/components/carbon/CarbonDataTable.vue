<script setup>
// DataTable de IBM Carbon v11 — tabla de alta densidad, declarativa.
//
// QUÉ RESUELVE
// Las ~14 vistas de listado escriben su `<thead>`/`<tbody>` a mano. El
// estilo ya era compartido (las reglas de `table`/`th`/`td` viven en
// main.css como selectores de elemento), pero la ESTRUCTURA no: cada vista
// repite el envoltorio de scroll, la fila de skeleton mientras carga, el
// estado vacío, el conteo de columnas del `colspan`, y el cableado de
// ordenamiento contra `ThOrdenable`. Cuando el `colspan` del estado vacío
// no coincide con el número real de columnas —que pasa cada vez que se
// agrega una— la tabla se rompe en silencio.
//
// Acá las columnas se declaran una vez y todo lo demás sale de ahí: el
// `colspan`, el número de columnas del skeleton, qué columna es ordenable,
// cuál se alinea a la derecha y cuál absorbe el ancho sobrante.
//
// DENSIDAD (lo que la vuelve "Carbon" y no una tabla cualquiera)
// Carbon publica cuatro alturas de fila; acá se usan tres:
//   sm  32px — consulta larga/densa (Actividad, logs)
//   md  40px — DEFAULT desde la revisión "Filas con foco + espaciosas"
//              (2026-09-03): fila con controles (ícono, select inline,
//              avatar) que no caben en 32px, y el punto de partida general
//   lg  48px — vistas insignia (Dashboard, Tickets, Empleados), donde el
//              pedido fue más aire que el resto del sistema
// El hover de fila va en layer-hover-01 (#e8e8e8), sin bordes verticales y
// sin zebra: en Carbon la lectura de una tabla la sostienen el separador
// horizontal de 1px y la capa de gris del hover. Con zebra o líneas
// verticales el ojo sigue la reja en vez de la fila.
//
// ENCABEZADO SIN RELLENO (revisión 2026-09-03)
// Antes llevaba fondo de layer-accent-01 (Gray 20), la cabecera-bandeja de
// Carbon estricto. Ahora es transparente con una línea inferior más fuerte
// que la de las filas (--color-border-strong): el lenguaje de lista de
// Linear/GitHub, más limpio en una tabla ya espaciosa. Ver GUIA-UX-UI.md,
// "Revisión Filas con foco".
//
// ACCIONES DE FILA (`.fila-accion`, main.css)
// Un botón de icono de fila que solo aparece en hover/foco de teclado, y
// siempre visible en dispositivos táctiles (`@media (hover: none)`) — ver
// el comentario de la clase en main.css. Quien declara una columna de
// acciones le agrega esa clase al botón, no a la celda.
//
// EL RENDER MÓVIL SALE DE LA MISMA DEFINICIÓN
// Las 17 vistas de listado renderizan cada fila DOS VECES: como `<tr>` para
// escritorio y como tarjeta apilada para móvil, celda por celda — 609 líneas
// de template duplicado, el 17% del template de todos los módulos. No es
// solo repetición: es la clase de duplicación que se desincroniza sola,
// porque agregar una columna exige acordarse de tocar los dos sitios.
//
// Acá las dos representaciones salen de las MISMAS columnas y de los MISMOS
// slots. La columna declara `movil` para decir en qué parte de la tarjeta
// cae, y con eso alcanza:
//
//   movil: 'cab'        renglón superior (código, fecha, tag de estado)
//   movil: 'principal'  el dato que identifica la fila. UNO por tarjeta
//   movil: 'sec'        datos de apoyo, uno por renglón
//   movil: 'pie'        acciones y badges, abajo
//   movil: false        no aparece en móvil (una columna que solo tiene
//                       sentido con el ancho de una tabla)
//
// Sin `movil` declarado la columna cae en `sec`, que es el destino correcto
// para el caso común. Las clases (`.tarjeta-fila__*`) ya viven en main.css y
// no cambian: esto no inventa un patrón, lo deja de copiar a mano.
//
// QUÉ NO HACE
// No pagina (eso es `CarbonPagination`, que va afuera y ya funciona
// server-side y client-side), no filtra, no selecciona filas con checkbox
// (Carbon lo tiene; acá solo Tickets lo pide, y llega con esa migración) y
// no ordena por su cuenta: emite `ordenar` y quien la usa decide si el orden
// es de cliente (`useOrdenTabla.js`) o de servidor (el store del módulo).
// Mantener el ordenamiento afuera es lo que permite que la misma tabla sirva
// para una lista de 20 filas en memoria y para una paginada de 4000 en el
// backend.
import { computed, useSlots } from 'vue';
import ThOrdenable from '../shared/ThOrdenable.vue';
import SkeletonTabla from '../shared/SkeletonTabla.vue';
import EmptyState from '../shared/EmptyState.vue';

const props = defineProps({
  /**
   * Definición de columnas, en orden de aparición:
   *   clave      identificador de la columna. Es la llave del slot de celda
   *              (`#celda-<clave>`) y lo que viaja en el evento `ordenar`.
   *   label      encabezado visible.
   *   ordenable  la columna se puede ordenar (usa ThOrdenable).
   *   num        cantidad/importe: alinea a la derecha para comparar dígito
   *              a dígito (la tabla ya trae tabular-nums).
   *   elastica   esta columna absorbe el ancho sobrante. UNA sola por
   *              tabla: con dos, el navegador vuelve a repartir entre
   *              todas y no se gana nada.
   *   ancho      ancho fijo (ej. '96px') para columnas de acción o de tag.
   *   oculta     omite la columna sin sacarla del array (útil para una
   *              columna que solo ve el JEFE).
   *   movil      dónde cae en la tarjeta móvil: 'cab' | 'principal' |
   *              'sec' | 'pie' | false. Por defecto 'sec'. Ver la cabecera.
   *
   * El encabezado de una columna NO ordenable puede llevar contenido propio
   * vía el slot `#encabezado-<clave>` (ej. un checkbox "seleccionar todos")
   * en vez de `label` como texto plano — ver ACCIONES DE FILA más abajo.
   */
  columnas: { type: Array, required: true },
  filas: { type: Array, default: () => [] },
  /** Campo de la fila que sirve de `:key`. */
  clave: { type: String, default: 'id' },
  /** 'sm' (32px) | 'md' (40px, default) | 'lg' (48px) — ver DENSIDAD arriba. */
  densidad: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
  cargando: { type: Boolean, default: false },
  /** Columna y dirección de orden actuales, para pintar el indicador. */
  ordenPor: { type: String, default: '' },
  ordenDir: { type: String, default: 'asc' },
  /** Estado vacío. El slot #vacio manda sobre estos dos. */
  vacioTitulo: { type: String, default: 'Sin resultados' },
  vacioMensaje: { type: String, default: '' },
  vacioIcono: { type: String, default: 'ti ti-inbox' },
  /**
   * Devuelve clases extra para una fila: `(fila) => 'mi-clase'` o un
   * objeto. Es como una vista marca la fila seleccionada o en alerta sin
   * que esta tabla conozca su dominio.
   */
  claseFila: { type: Function, default: null },
  /**
   * Devuelve atributos extra para el `<tr>`: `(fila) => ({ 'aria-current':
   * 'true' })`. Para lo que `claseFila` no cubre — un estado que un lector
   * de pantalla tiene que anunciar, no solo ver (ej. "este es el ticket
   * abierto actualmente"), sin que esta tabla conozca ese dominio. Se
   * agregó en la migración de TicketsView (2026-09-03): el `<tr>` a mano
   * llevaba `aria-current="true"` en la fila activa y no había forma de
   * preservarlo con solo `claseFila`.
   */
  filaAtributos: { type: Function, default: null },
  /**
   * Etiqueta accesible de la lista de tarjetas móviles. La tabla la toma de
   * su `aria-label`; la lista es otro elemento y necesita la suya.
   */
  etiqueta: { type: String, default: '' },
  /** Sin esto no se renderiza la lista móvil (vistas que no la tienen hoy). */
  conTarjetas: { type: Boolean, default: true },
});

// Dos raices (la tabla y la lista de tarjetas), asi que Vue no sabe a cual
// aplicar los atributos heredados y avisaria en consola. La etiqueta
// accesible se pasa por el prop `etiqueta`, que va a las dos.
defineOptions({ inheritAttrs: false });

const emit = defineEmits(['ordenar', 'clic-fila']);
const slots = useSlots();

const visibles = computed(() => props.columnas.filter((c) => !c.oculta));

// El colspan del estado vacío y el número de columnas del skeleton salen
// del mismo lugar que los encabezados. Es el punto: no puede desincronizarse.
const total = computed(() => visibles.value.length);

function estiloColumna(col) {
  if (col.elastica) return { width: '100%' };
  if (col.ancho) return { width: col.ancho };
  return null;
}

// El slot de celda gana; sin slot se imprime el valor crudo del campo. Así
// una tabla de puro texto no necesita catorce slots vacíos, y la columna
// que lleva un tag o un botón declara solo la suya.
function tieneSlot(col) {
  return Boolean(slots[`celda-${col.clave}`]);
}

// Encabezado con contenido propio (`#encabezado-<clave>`), no solo texto —
// hoy el único caso real es la columna de checkbox "seleccionar todos" de
// Tickets (selección múltiple, piloto Tabla de escritorio). Sin slot se
// pinta `col.label` como siempre; esto es puramente aditivo, ninguna de las
// otras tablas lo usa. Solo aplica al `<th>` no ordenable — una columna con
// encabezado propio no tiene sentido que además sea ordenable por click.
function tieneSlotEncabezado(col) {
  return Boolean(slots[`encabezado-${col.clave}`]);
}

// Agrupación para la tarjeta móvil. `movil: false` saca la columna de la
// tarjeta; sin declarar, cae en 'sec'.
const RANURAS = ['cab', 'principal', 'sec', 'pie'];
const enTarjeta = computed(() => {
  const grupos = Object.fromEntries(RANURAS.map((r) => [r, []]));
  for (const col of visibles.value) {
    if (col.movil === false) continue;
    const ranura = RANURAS.includes(col.movil) ? col.movil : 'sec';
    grupos[ranura].push(col);
  }
  return grupos;
});
</script>

<template>
  <div class="table-wrap" :class="{ 'solo-escritorio': conTarjetas }">
    <table class="cds-table" :class="`cds-table--${densidad}`" :aria-label="etiqueta || undefined">
      <thead>
        <tr>
          <template v-for="col in visibles" :key="col.clave">
            <ThOrdenable
              v-if="col.ordenable"
              :clave="col.clave"
              :columna="ordenPor"
              :direccion="ordenDir"
              :class="{ 'col-num': col.num }"
              :style="estiloColumna(col)"
              @ordenar="emit('ordenar', col.clave)"
            >{{ col.label }}</ThOrdenable>
            <th
              v-else
              scope="col"
              :class="{ 'col-num': col.num }"
              :style="estiloColumna(col)"
            ><slot v-if="tieneSlotEncabezado(col)" :name="`encabezado-${col.clave}`" /><template v-else>{{ col.label }}</template></th>
          </template>
        </tr>
      </thead>

      <tbody>
        <SkeletonTabla v-if="cargando" :columnas="total" />

        <tr v-else-if="!filas.length">
          <td :colspan="total" class="cds-table__vacio">
            <slot name="vacio">
              <EmptyState :icono="vacioIcono" :titulo="vacioTitulo" :mensaje="vacioMensaje">
                <slot name="vacio-accion" />
              </EmptyState>
            </slot>
          </td>
        </tr>

        <!-- v-for dentro de un <template v-else> y no `v-for` + `v-else` en
             el mismo <tr>: en Vue 3 el v-if/v-else se evalua ANTES del
             v-for, asi que ponerlos juntos es ambiguo (y lo marca
             vue/no-use-v-if-with-v-for). -->
        <template v-else>
          <tr
            v-for="fila in filas"
            :key="fila[clave]"
            :class="claseFila ? claseFila(fila) : null"
            v-bind="filaAtributos ? filaAtributos(fila) : null"
            @click="emit('clic-fila', fila)"
          >
            <td
              v-for="col in visibles"
              :key="col.clave"
              :class="{ 'col-num': col.num }"
            >
              <slot v-if="tieneSlot(col)" :name="`celda-${col.clave}`" :fila="fila" :valor="fila[col.clave]" />
              <template v-else>{{ fila[col.clave] }}</template>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>

  <!-- Misma lista, mismos slots, otra forma. `solo-movil`/`solo-escritorio`
       ya existen en main.css y son las que alternan las dos. -->
  <ul
    v-if="conTarjetas && !cargando && filas.length"
    class="lista-tarjetas solo-movil"
    :aria-label="etiqueta || undefined"
  >
    <li
      v-for="fila in filas"
      :key="fila[clave]"
      class="tarjeta-fila"
      :class="claseFila ? claseFila(fila) : null"
      @click="emit('clic-fila', fila)"
    >
      <div v-if="enTarjeta.cab.length" class="tarjeta-fila__cab">
        <template v-for="col in enTarjeta.cab" :key="col.clave">
          <slot v-if="tieneSlot(col)" :name="`celda-${col.clave}`" :fila="fila" :valor="fila[col.clave]" />
          <span v-else>{{ fila[col.clave] }}</span>
        </template>
      </div>

      <div v-for="col in enTarjeta.principal" :key="col.clave" class="tarjeta-fila__principal">
        <slot v-if="tieneSlot(col)" :name="`celda-${col.clave}`" :fila="fila" :valor="fila[col.clave]" />
        <template v-else>{{ fila[col.clave] }}</template>
      </div>

      <div v-for="col in enTarjeta.sec" :key="col.clave" class="tarjeta-fila__sec">
        <slot v-if="tieneSlot(col)" :name="`celda-${col.clave}`" :fila="fila" :valor="fila[col.clave]" />
        <template v-else>{{ fila[col.clave] }}</template>
      </div>

      <div v-if="enTarjeta.pie.length" class="tarjeta-fila__pie">
        <template v-for="col in enTarjeta.pie" :key="col.clave">
          <slot v-if="tieneSlot(col)" :name="`celda-${col.clave}`" :fila="fila" :valor="fila[col.clave]" />
          <span v-else>{{ fila[col.clave] }}</span>
        </template>
      </div>
    </li>
  </ul>
</template>

<style scoped>
/* Las reglas de `table`, `th` y `td` (color, borde, encabezado en
   layer-accent, hover de fila, tabular-nums) ya viven en main.css como
   selectores de ELEMENTO, así que aplican acá sin repetirse — es design
   system, no estilo de este componente. Lo único propio es la densidad,
   que main.css no puede fijar porque depende de qué lleva la fila. */

/* :deep porque las celdas se pintan en el ámbito de este componente pero
   los selectores de elemento de main.css no llevan el atributo de scope;
   sin :deep, estas dos reglas no alcanzarían a los <td> del v-for. */
.cds-table--sm :deep(td),
.cds-table--sm :deep(th) {
  height: var(--cds-row-h-sm);
  padding-top: 0;
  padding-bottom: 0;
}

.cds-table--md :deep(td),
.cds-table--md :deep(th) {
  height: var(--cds-row-h-md);
  padding-top: 0;
  padding-bottom: 0;
}

.cds-table--lg :deep(td),
.cds-table--lg :deep(th) {
  height: var(--cds-row-h-lg);
  padding-top: 0;
  padding-bottom: 0;
}

/* ThOrdenable pone `padding: 0` en el <th> y traslada el padding a su
   botón interno, para que toda la celda sea el objetivo del clic. Con la
   densidad fijada arriba ese padding vertical desborda la fila, así que
   el botón pasa a tomar el alto completo del encabezado en vez de
   calcularlo desde su propio padding. */
.cds-table--sm :deep(.th-ordenable-btn),
.cds-table--md :deep(.th-ordenable-btn),
.cds-table--lg :deep(.th-ordenable-btn) {
  height: 100%;
  padding-top: 0;
  padding-bottom: 0;
}

/* El gutter horizontal NO se toca: 1.25rem es el mismo de .filters y
   .card-toolbar, y es lo que alinea la primera columna con el buscador de
   arriba. Cambiarlo acá desalinearía la tabla del resto de la tarjeta. */

/* La celda del estado vacío no es una celda de datos: sin alto de fila,
   sin borde inferior y sin hover. */
.cds-table__vacio {
  height: auto !important;
  padding: 0 !important;
  border-bottom: none;
}
</style>
