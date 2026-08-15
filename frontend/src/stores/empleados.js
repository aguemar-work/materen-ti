import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Paginación server-side (patrón de referencia para migrar otros módulos):
// `lista` es SOLO la página actual; búsqueda y filtros viajan al servidor.
// Regla de coherencia: mutaciones in-place (editar, baja) actualizan la fila
// si está en la página; las que cambian el conjunto (crear, borrar,
// reactivar) recargan la página para corregir total y huecos.
export const useEmpleadosStore = defineStore('empleados', {
  state: () => ({
    lista: [],
    total: 0,
    pagina: 1,
    tamPagina: 20,
    filtros: { q: '', estado: '' },
    orden: null, // { columna, direccion } — null = orden por defecto del servidor
    cargando: false,
    error: null,
    _peticionId: 0,
  }),

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
        const { items, total } = await insforgeApi.listEmpleadosPage({
          pagina: this.pagina,
          tamPagina: this.tamPagina,
          ...this.filtros,
          orden: this.orden,
        });
        if (peticionId !== this._peticionId) return;
        this.lista = items;
        this.total = total;
        // Conteos de cuentas/equipos vinculados de la página; si fallan,
        // la columna "Vínculos" queda vacía pero el listado no se cae.
        try {
          const conteos = await insforgeApi.conteosVinculos(items.map((e) => e.id));
          if (peticionId !== this._peticionId) return;
          this.lista = items.map((e) => ({
            ...e,
            n_cuentas: conteos[e.id]?.cuentas ?? 0,
            n_equipos: conteos[e.id]?.equipos ?? 0,
            n_licencias: conteos[e.id]?.licencias ?? 0,
          }));
        } catch { /* columna sin datos */ }
      } catch (e) {
        if (peticionId !== this._peticionId) return;
        this.error = e?.message || 'Error al cargar empleados';
        throw e;
      } finally {
        if (peticionId === this._peticionId) this.cargando = false;
      }
    },

    async irAPagina(pagina) {
      this.pagina = pagina;
      await this.cargar();
    },

    async aplicarFiltros(filtros) {
      this.filtros = { ...this.filtros, ...filtros };
      this.pagina = 1;
      await this.cargar();
    },

    // Se llama al montar la vista: los filtros viven en el store (no en el
    // componente) y sobreviven a la navegación — sin este reset, al volver
    // a entrar la caja de búsqueda se ve vacía pero el filtro anterior
    // sigue aplicado (bug reportado jul 2026).
    resetearFiltros() {
      // estado: 'Activo' por defecto (ago 2026) — activos e inactivos
      // mezclados en la lista era el problema reportado; "Todos los
      // estados" sigue disponible en el selector.
      this.filtros = { q: '', estado: 'Activo' };
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

    // Dataset filtrado completo (sin página) — para exportar CSV
    async listaParaExportar() {
      return insforgeApi.listEmpleadosFiltrados(this.filtros);
    },

    async crear(datos) {
      this.error = null;
      // Sin push local: el alta navega a la ficha del nuevo empleado y la
      // lista se recarga al volver a montarse.
      return insforgeApi.createEmpleado(datos);
    },

    async actualizar(id, datos) {
      this.error = null;
      const empleado = await insforgeApi.updateEmpleado(id, datos);
      const idx = this.lista.findIndex((e) => e.id === id);
      if (idx !== -1) this.lista[idx] = empleado;
      return empleado;
    },

    async darDeBaja(id) {
      this.error = null;
      const { empleado, resumen } = await insforgeApi.bajaEmpleado(id);
      const idx = this.lista.findIndex((e) => e.id === id);
      if (idx !== -1) this.lista[idx] = empleado;
      return { empleado, resumen };
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteEmpleado(id);
      await this.cargar(); // rellena el hueco de la página y corrige total
    },

    async reactivar(id) {
      this.error = null;
      const empleado = await insforgeApi.reactivarEmpleado(id);
      const idx = this.lista.findIndex((e) => e.id === id);
      if (idx !== -1) this.lista[idx] = empleado;
      return empleado;
    },
  },
});
