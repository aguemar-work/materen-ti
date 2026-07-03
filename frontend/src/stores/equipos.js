import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

export const useEquiposStore = defineStore('equipos', {
  state: () => ({
    lista: [],
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
        const [lista, tipos, ubicaciones] = await Promise.all([
          insforgeApi.listEquipos(),
          this.tipos.length ? Promise.resolve(this.tipos) : insforgeApi.listTiposEquipo(),
          insforgeApi.listUbicaciones(),
        ]);
        this.lista = lista;
        this.tipos = tipos;
        this.ubicaciones = ubicaciones;
      } catch (e) {
        this.error = e?.message || 'Error al cargar equipos';
        throw e;
      } finally {
        this.cargando = false;
      }
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
      this.lista = this.lista.filter((e) => e.id !== id);
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
