import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Paginación server-side en la lista; tipos y ubicaciones se cachean
// (catálogos pequeños, no cambian con cada página).
export const useEquiposStore = defineStore('equipos', {
  state: () => ({
    lista: [],
    total: 0,
    pagina: 1,
    tamPagina: 20,
    filtros: { q: '', tipoId: '', situacion: '' },
    tipos: [],
    ubicaciones: [],
    cargando: false,
    error: null,
  }),

  actions: {
    async cargar() {
      this.cargando = true;
      this.error = null;
      try {
        const [pageRes, tipos, ubicaciones] = await Promise.all([
          insforgeApi.listEquiposPage({
            pagina: this.pagina,
            tamPagina: this.tamPagina,
            ...this.filtros,
          }),
          this.tipos.length ? Promise.resolve(this.tipos) : insforgeApi.listTiposEquipo(),
          this.ubicaciones.length ? Promise.resolve(this.ubicaciones) : insforgeApi.listUbicaciones(),
        ]);
        this.lista = pageRes.items;
        this.total = pageRes.total;
        this.tipos = tipos;
        this.ubicaciones = ubicaciones;
      } catch (e) {
        this.error = e?.message || 'Error al cargar equipos';
        throw e;
      } finally {
        this.cargando = false;
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

    async listaParaExportar() {
      return insforgeApi.listEquiposFiltrados(this.filtros);
    },

    async crear(datos) {
      this.error = null;
      await insforgeApi.createEquipo(datos);
      await this.cargar();
    },

    async actualizar(id, datos) {
      this.error = null;
      await insforgeApi.updateEquipo(id, datos);
      await this.cargar();
    },

    async cambiarEstado(id, estado) {
      this.error = null;
      await insforgeApi.cambiarEstadoEquipo(id, estado);
      await this.cargar();
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteEquipo(id);
      await this.cargar();
    },

    async asignar(equipoId, empleadoId, condicionEntrega) {
      this.error = null;
      await insforgeApi.asignarEquipo(equipoId, empleadoId, condicionEntrega);
      await this.cargar();
    },

    async devolver(asignacionId, equipoId, datos) {
      this.error = null;
      await insforgeApi.devolverEquipo(asignacionId, equipoId, datos);
      await this.cargar();
    },

    async mover(equipoId, ubicacionId) {
      this.error = null;
      await insforgeApi.moverEquipo(equipoId, ubicacionId);
      await this.cargar();
    },

    async crearUbicacion(nombre) {
      this.error = null;
      const ubicacion = await insforgeApi.createUbicacion(nombre);
      this.ubicaciones.push(ubicacion);
      this.ubicaciones.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return ubicacion;
    },
  },
});
