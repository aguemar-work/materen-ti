// Matemática de render de paginación — funciones puras, sin Vue y sin
// componente. Antes vivía solo dentro de components/carbon/CarbonPagination.vue;
// se extrajo acá al retirar esa librería (reinicio de diseño, 2026-09-05) para
// que cada vista arme su propio <nav> de paginación en HTML plano sin duplicar
// esta cuenta. La fuente del número de página / tamaño de página sigue siendo
// la de siempre — `usePaginacion.js` (client-side) o `crearStorePaginado.js`
// (server-side) — esto solo deriva lo que hace falta para pintar el control.

/** Cuántas páginas hay, como mínimo 1 (una lista vacía sigue mostrando "página 1 de 1"). */
export function totalPaginasDe(totalItems, tamPagina) {
  return Math.max(1, Math.ceil(totalItems / tamPagina));
}

/** [1, 2, ..., totalPaginas] — para el <select> de "ir a la página". */
export function paginasDe(totalPaginas) {
  return Array.from({ length: totalPaginas }, (_, i) => i + 1);
}

/**
 * Rango "desde–hasta" mostrado ("21–40 de 63"). `hasta` se acota contra el
 * total: en la última página, `pagina * tam` suele pasarse (63 items en
 * páginas de 20 daría "61–80 de 63" sin este clamp).
 */
export function rangoDe(paginaActual, tamPagina, totalItems) {
  const desde = totalItems === 0 ? 0 : (paginaActual - 1) * tamPagina + 1;
  const hasta = Math.min(paginaActual * tamPagina, totalItems);
  return { desde, hasta };
}

/** Clampea un destino de página a [1, totalPaginas] — nunca navega fuera de rango. */
export function clampPagina(pagina, totalPaginas) {
  return Math.min(Math.max(1, pagina), totalPaginas);
}
