import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Paginación server-side (mismo patrón que empleados/tickets).
export const useLicenciasStore = defineStore('licencias', {
  state: () => ({
    lista: [],
    total: 0,
    pagina: 1,
    tamPagina: 20,
    filtros: { q: '' },
    orden: null,
    cargando: false,
    error: null,
    _peticionId: 0,
  }),

  actions: {
    // _peticionId descarta respuestas obsoletas: si dos cargar() se
    // superponen (búsqueda con debounce + cambio de página/filtro rápido),
    // solo se aplica el resultado de la petición más reciente.
    async cargar() {
      const peticionId = ++this._peticionId;
      this.cargando = true;
      this.error = null;
      try {
        const { items, total } = await insforgeApi.listLicenciasPage({
          pagina: this.pagina,
          tamPagina: this.tamPagina,
          ...this.filtros,
          orden: this.orden,
        });
        if (peticionId !== this._peticionId) return;
        this.lista = items;
        this.total = total;
      } catch (e) {
        if (peticionId !== this._peticionId) return;
        this.error = e?.message || 'Error al cargar licencias';
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

    // Se llama al montar la vista: ver nota en stores/empleados.js.
    resetearFiltros() {
      this.filtros = { q: '' };
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

    async listaParaExportar() {
      return insforgeApi.listLicenciasFiltrados(this.filtros);
    },

    async crear(datos) {
      this.error = null;
      const id = await insforgeApi.createLicencia(datos);
      await this.cargar();
      return id;
    },

    async actualizar(id, datos) {
      this.error = null;
      await insforgeApi.updateLicencia(id, datos);
      await this.cargar();
    },

    async renovar(id, nuevaFecha) {
      this.error = null;
      await insforgeApi.renovarLicencia(id, nuevaFecha);
      await this.cargar();
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteLicencia(id);
      await this.cargar();
    },

    // licencia: objeto completo (necesita cuenta_id para elegir el mecanismo).
    async asignar(licencia, empleadoId) {
      this.error = null;
      await insforgeApi.asignarUsuario(licencia, empleadoId);
      await this.cargar();
    },

    // usuario: entrada de licencia.usuarios (trae `origen` y `asignacion_id`).
    async liberar(usuario, notas = null) {
      this.error = null;
      await insforgeApi.liberarUsuario(usuario, notas);
      await this.cargar();
    },
  },
});
