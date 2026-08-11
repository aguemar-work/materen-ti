import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';

// Campana genérica (migración 045): últimas notificaciones de los 4 eventos
// (ticket creado, cuenta creada, alta/baja de empleado) + estado leído/no
// leído propio del usuario logueado. leidasIds vive como Set reactivo
// (Vue 3 soporta Map/Set nativamente) para O(1) en noLeidas.
export const useNotificacionesStore = defineStore('notificaciones', {
  state: () => ({
    lista: [],
    leidasIds: new Set(),
    cargando: false,
  }),

  getters: {
    noLeidas: (state) => state.lista.filter((n) => !state.leidasIds.has(n.id)),
  },

  actions: {
    async cargar(usuarioId) {
      this.cargando = true;
      try {
        const [lista, leidas] = await Promise.all([
          insforgeApi.listNotificaciones(),
          insforgeApi.listLecturas(usuarioId),
        ]);
        this.lista = lista;
        this.leidasIds = new Set(leidas);
      } finally {
        this.cargando = false;
      }
    },

    // Notificación nueva llegada por el canal realtime "notificaciones:nuevas".
    agregar(payload) {
      if (this.lista.some((n) => n.id === payload.id)) return;
      this.lista.unshift({
        id: payload.id,
        tipo: payload.tipo,
        titulo: payload.titulo,
        url_destino: payload.url_destino,
        creado_en: new Date().toISOString(),
      });
    },

    // Optimista: marca antes de confirmar con el servidor, revierte si falla
    // (mismo criterio de UI que el resto del sistema para acciones rápidas).
    async marcarLeida(id, usuarioId) {
      if (this.leidasIds.has(id)) return;
      this.leidasIds.add(id);
      try {
        await insforgeApi.marcarLeida(id, usuarioId);
      } catch (e) {
        this.leidasIds.delete(id);
        throw e;
      }
    },

    async marcarTodasLeidas(usuarioId) {
      const pendientes = this.noLeidas.map((n) => n.id);
      if (!pendientes.length) return;
      pendientes.forEach((id) => this.leidasIds.add(id));
      try {
        await insforgeApi.marcarVariasLeidas(pendientes, usuarioId);
      } catch (e) {
        pendientes.forEach((id) => this.leidasIds.delete(id));
        throw e;
      }
    },
  },
});
