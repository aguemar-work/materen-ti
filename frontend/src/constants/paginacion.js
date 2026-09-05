// Tamaños de página que ofrece el selector "Filas por página" de
// CarbonPagination, y el tamaño con el que abre cualquier listado.
//
// Están acá y no repetidos en cada vista por una razón concreta: el selector
// muestra el tamaño actual con `:tam-pagina`, así que si el inicial no es una
// de las opciones el `<select>` arranca desmintiendo a la tabla — muestra
// "10" (o queda en blanco, según el navegador) mientras la tabla trae 20
// filas. Con las dos constantes juntas ese desfase no puede volver a
// colarse: agregar o quitar una opción obliga a mirar el inicial.
export const TAMANOS_PAGINA = [10, 15, 20, 50, 100];

export const TAM_PAGINA_DEFECTO = 20;
