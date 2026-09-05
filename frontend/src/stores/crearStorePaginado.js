import { defineStore } from 'pinia';
import { TAM_PAGINA_DEFECTO } from '../constants/paginacion.js';

// Los 7 listados con paginación server-side (tickets, empleados, correos,
// equipos, licencias, kb, problemas) comparten exactamente el mismo ciclo:
// `lista` es SOLO la página actual, búsqueda/filtros/orden viajan al
// servidor, y un `_peticionId` descarta respuestas obsoletas.
//
// Hasta ago 2026 cada store repetía a mano ese esqueleto —
// cargar/irAPagina/aplicarFiltros/resetearFiltros/ordenarPor, ~40 líneas
// casi byte a byte iguales × 7 (ARQ-04, ver docs/HISTORIAL-AUDITORIAS.md).
// Este factory es el análogo de `crearCatalogoStore()` (stores/catalogos.js)
// para ese otro patrón repetido.
//
// Cada store aporta lo suyo con `state`/`getters`/`actions`, que se mezclan
// con lo común (las actions propias se aplican al final: un store puede
// pisar una común si de verdad lo necesita).
//
// REGLA DE COHERENCIA tras crear/actualizar/borrar (estaba escrita solo en
// stores/empleados.js y por eso cada store nuevo elegía distinto —
// ARQ-14): las mutaciones **in-place** (editar una fila, darla de baja)
// actualizan esa fila de `lista` si está en la página actual; las que
// **cambian el conjunto** (crear, borrar, reactivar) llaman a `cargar()`
// para corregir `total` y rellenar el hueco de la página. No hay una
// tercera opción: un `push` local en un listado paginado deja la página
// con un elemento de más y el `total` desfasado.
export function crearStorePaginado(id, {
  // (params, store) => { items, total, extra? }
  // `store` es de solo lectura (ej. mirar un catálogo ya cacheado para no
  // volver a pedirlo). Para ESCRIBIR state extra en la misma tanda se
  // devuelve `extra`: se mezcla después del guard de _peticionId, igual que
  // lista/total, para no aplicar nada de una respuesta obsoleta.
  listarPagina,
  // Función, no objeto: se llama en el state inicial Y en resetearFiltros(),
  // y cada store debe recibir un objeto nuevo, no uno compartido.
  filtrosIniciales,
  mensajeError = 'Error al cargar',
  tamPagina = TAM_PAGINA_DEFECTO,
  // Datos extra de la página ya cargada (ej. conteos por fila). Si falla,
  // la página se muestra igual sin ellos — nunca tumba el listado.
  enriquecer = null,
  state = () => ({}),
  getters = {},
  actions = {},
}) {
  return defineStore(id, {
    state: () => ({
      lista: [],
      total: 0,
      pagina: 1,
      tamPagina,
      filtros: filtrosIniciales(),
      orden: null, // { columna, direccion } — null = orden por defecto del servidor
      cargando: false,
      error: null,
      _peticionId: 0,
      ...state(),
    }),

    getters,

    actions: {
      // _peticionId descarta respuestas obsoletas: si dos cargar() se
      // superponen (búsqueda con debounce + cambio de página/filtro rápido,
      // orden de red no garantizado), solo se aplica el resultado de la
      // petición más reciente.
      async cargar() {
        const peticionId = ++this._peticionId;
        this.cargando = true;
        this.error = null;
        try {
          const { items, total, extra } = await listarPagina(
            {
              pagina: this.pagina,
              tamPagina: this.tamPagina,
              ...this.filtros,
              orden: this.orden,
            },
            this,
          );
          if (peticionId !== this._peticionId) return;
          this.lista = items;
          this.total = total;
          if (extra) Object.assign(this, extra);
          if (enriquecer) {
            try {
              const enriquecidos = await enriquecer(items);
              if (peticionId !== this._peticionId) return;
              this.lista = enriquecidos;
            } catch {
              /* la página ya se ve; solo faltan los datos extra */
            }
          }
        } catch (e) {
          if (peticionId !== this._peticionId) return;
          this.error = e?.message || mensajeError;
          throw e;
        } finally {
          if (peticionId === this._peticionId) this.cargando = false;
        }
      },

      async irAPagina(pagina) {
        this.pagina = pagina;
        await this.cargar();
      },

      // Selector "Filas por página" de CarbonPagination. Igual que
      // irAPagina, pero además vuelve a la 1: quedarse en la página 7 con
      // 100 filas por página, cuando antes eran 20, deja al usuario viendo
      // un listado vacío sin explicar por qué. Ese reset es obligatorio y no
      // redundante: CarbonPagination ya no emite el suyo, justamente para no
      // gastar una segunda consulta.
      async cambiarTamPagina(nuevoTam) {
        this.tamPagina = nuevoTam;
        this.pagina = 1;
        await this.cargar();
      },

      async aplicarFiltros(filtros) {
        this.filtros = { ...this.filtros, ...filtros };
        this.pagina = 1;
        await this.cargar();
      },

      // Se llama al montar la vista en 6 de los 7 módulos: los filtros viven
      // en el store (no en el componente) y sobreviven a la navegación — sin
      // este reset, al volver a entrar la caja de búsqueda se ve vacía pero
      // el filtro anterior sigue aplicado (bug reportado jul 2026).
      // Tickets es la excepción deliberada: ver `resetearBusqueda()` en
      // stores/tickets.js y la nota de AGENTS.md.
      resetearFiltros() {
        this.filtros = filtrosIniciales();
        this.orden = null;
        this.pagina = 1;
      },

      async ordenarPor(columna) {
        if (this.orden?.columna === columna) {
          this.orden = { columna, direccion: this.orden.direccion === 'asc' ? 'desc' : 'asc' };
        } else {
          this.orden = { columna, direccion: 'asc' };
        }
        this.pagina = 1;
        await this.cargar();
      },

      ...actions,
    },
  });
}
