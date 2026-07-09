import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Los 4 catálogos de Configuración (ubicaciones, áreas/obras, tipos de
// equipo y categorías de ticket) comparten el mismo ciclo de vida:
// listar, crear, actualizar y soft-delete sobre una lista ordenada por
// nombre. Este factory genera un store Pinia con el patrón estándar
// { lista, cargando, error } para cada uno.
//
// `api.crear` recibe `...args` tal cual porque las firmas del API
// difieren por catálogo (createUbicacion(nombre, descripcion) vs
// createTipoEquipo(datos)); cada panel llama con su forma.
function crearCatalogoStore(id, api) {
  const ordenar = (lista) => lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return defineStore(id, {
    state: () => ({
      lista: [],
      cargando: false,
      error: null,
    }),

    actions: {
      async cargar() {
        this.cargando = true;
        this.error = null;
        try {
          const datos = await api.listar();
          this.lista = api.ordenar !== false ? ordenar(datos) : datos;
        } catch (e) {
          this.error = e?.message || 'Error al cargar';
          throw e;
        } finally {
          this.cargando = false;
        }
      },

      async crear(...args) {
        this.error = null;
        const item = await api.crear(...args);
        this.lista.push(item);
        ordenar(this.lista);
        return item;
      },

      async actualizar(id, datos) {
        this.error = null;
        const item = await api.actualizar(id, datos);
        const idx = this.lista.findIndex((x) => x.id === id);
        if (idx !== -1) this.lista[idx] = item;
        return item;
      },

      async softDelete(id) {
        this.error = null;
        await api.softDelete(id);
        this.lista = this.lista.filter((x) => x.id !== id);
      },
    },
  });
}

export const useUbicacionesStore = crearCatalogoStore('cat-ubicaciones', {
  listar: insforgeApi.listUbicaciones,
  crear: insforgeApi.createUbicacion,
  actualizar: insforgeApi.updateUbicacion,
  softDelete: insforgeApi.softDeleteUbicacion,
});

export const useAreasObrasStore = crearCatalogoStore('cat-areas-obras', {
  listar: insforgeApi.listAreasObras,
  crear: insforgeApi.createAreaObra,
  actualizar: insforgeApi.updateAreaObra,
  softDelete: insforgeApi.softDeleteAreaObra,
});

export const useTiposEquipoStore = crearCatalogoStore('cat-tipos-equipo', {
  listar: insforgeApi.listTiposEquipo,
  crear: insforgeApi.createTipoEquipo,
  actualizar: insforgeApi.updateTipoEquipo,
  softDelete: insforgeApi.softDeleteTipoEquipo,
});

export const useCategoriasTicketStore = crearCatalogoStore('cat-categorias-ticket', {
  listar: insforgeApi.listCategoriasTicket,
  crear: insforgeApi.createCategoriaTicket,
  actualizar: insforgeApi.updateCategoriaTicket,
  softDelete: insforgeApi.softDeleteCategoriaTicket,
});
