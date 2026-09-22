// EXCEPCIÓN documentada al Patrón Wrapper Estricto — no es un wrapper, es un
// re-export directo del componente real.
//
// Por qué: DataTable reconoce las columnas de su slot por defecto por la
// referencia exacta del componente `Column` (verificado con un test
// descartable: un <script setup> propio que renderiza <Column> adentro
// termina en 0 columnas — DataTable no expande el árbol interno de un
// componente hijo para encontrarlo). Envolverlo como a Button en
// AppButton.vue es, literalmente, imposible sin tocar PrimeVue.
//
// La regla de fondo ("ninguna vista importa primevue/* directo") se cumple
// igual: ninguna vista escribe `import Column from 'primevue/column'`, todas
// importan `AppColumn` desde acá. Y Column no necesita más que eso: es un
// elemento de configuración (campo, encabezado, si ordena), no una unidad
// visual — su 100% del estilo (headerCell, bodyCell, hover, tipografía) lo
// aplica AppTable.vue vía `pt.column.*` a TODAS las columnas por igual. Un
// <AppColumn> nunca trae su propio `pt`.
export { default } from 'primevue/column';
