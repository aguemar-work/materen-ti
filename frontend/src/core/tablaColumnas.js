// Derivaciones puras de una config de columnas — sin componente, sin Vue.
// Extraído de components/carbon/CarbonDataTable.vue al retirar esa librería
// (reinicio de diseño, 2026-09-05). El componente pintaba <thead>/<tbody> Y
// la tarjeta móvil a partir de esto; ahora cada vista escribe su propio
// <table>/<ul> en HTML plano, pero sigue usando estas funciones para no
// desincronizar el colspan del estado vacío/skeleton con el número real de
// columnas, ni la agrupación de la tarjeta móvil.
//
// Forma de una columna (igual que antes): { clave, label, ordenable, num,
// elastica, ancho, oculta, movil }. Ver el comentario de columnas que tenía
// CarbonDataTable si hace falta el detalle de cada campo — está en el
// historial de git de ese archivo.

/** Columnas que de verdad se pintan (oculta=true las saca sin tocar el array). */
export function columnasVisibles(columnas) {
  return columnas.filter((c) => !c.oculta);
}

/** Estilo inline de ancho de una columna, o null si no declara ninguno. */
export function estiloColumna(col) {
  if (col.elastica) return { width: '100%' };
  if (col.ancho) return { width: col.ancho };
  return null;
}

const RANURAS = ['cab', 'principal', 'sec', 'pie'];

/**
 * Agrupa columnas visibles para la tarjeta móvil: `col.movil` dice en qué
 * renglón cae ('cab' | 'principal' | 'sec' | 'pie'); `false` la saca de la
 * tarjeta; sin declarar, cae en 'sec' (el destino correcto para el caso
 * común). Devuelve `{ cab: [], principal: [], sec: [], pie: [] }`.
 */
export function agruparParaTarjeta(columnasVisiblesYa) {
  const grupos = Object.fromEntries(RANURAS.map((r) => [r, []]));
  for (const col of columnasVisiblesYa) {
    if (col.movil === false) continue;
    const ranura = RANURAS.includes(col.movil) ? col.movil : 'sec';
    grupos[ranura].push(col);
  }
  return grupos;
}
