import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';
import { anotarErrorDb } from '../api/erroresDb.js';
import { gettersStaff } from './gettersStaff.js';
import { HORAS_AUTOCIERRE_DEFECTO } from '../core/dominio-tickets.js';

// Detalle de un ticket: toda la data de TicketDetalleView pasa por acá.
// Mismo patrón que stores/tickets.js: state plano, actions async que lanzan
// (la vista captura y muestra el toast).
export const useTicketDetalleStore = defineStore('ticketDetalle', {
  state: () => ({
    ticket: null,
    comentarios: [],
    eventos: [],
    satisfaccion: null,
    equiposEmpleado: [],
    articulosRelacionados: [],
    problemaVinculado: null,
    staffLista: [],
    // Horas del cierre automático (config_parametros, 120): el aviso de
    // «Resolver» y el del ticket resuelto dicen cuándo se cierra solo.
    horasAutocierre: HORAS_AUTOCIERRE_DEFECTO,
    cargando: false,
    error: null,
  }),

  getters: { ...gettersStaff },

  actions: {
    async cargar(id) {
      this.cargando = true;
      this.error = null;
      try {
        const [t, coms, staff, eventos] = await Promise.all([
          insforgeApi.getTicket(id),
          insforgeApi.listComentariosTicket(id),
          insforgeApi.nombresStaff(),
          insforgeApi.listEventosTicket(id),
        ]);
        // Si el ticket no existe, ticket queda en null (la vista decide el redirect).
        this.ticket = t || null;
        this.comentarios = coms;
        this.staffLista = staff;
        this.eventos = eventos;
        if (t && t.estado !== 'abierto') {
          this.satisfaccion = await insforgeApi.getSatisfaccionTicket(id);
        }
        if (t && ['en_progreso', 'reabierto', 'resuelto'].includes(t.estado)) {
          // Un parámetro que no se puede leer nunca rompe la ficha: queda el de siempre.
          try {
            this.horasAutocierre = await insforgeApi.parametroEntero('horas_autocierre_resuelto', HORAS_AUTOCIERRE_DEFECTO);
          } catch {
            this.horasAutocierre = HORAS_AUTOCIERRE_DEFECTO;
          }
        }
        // Equipos que tiene ASIGNADOS el solicitante (contexto para el
        // técnico), no el equipo/cuenta/licencia que el ticket referencia
        // (eso es "Enlazado a", un dato distinto).
        this.equiposEmpleado = t?.empleado_id ? await insforgeApi.equiposPorEmpleado(t.empleado_id) : [];
        // Base de Conocimiento: sugerencias por categoría del ticket, para
        // que el técnico resuelva más rápido sin salir de la ficha.
        this.articulosRelacionados = t?.categoria_id
          ? await insforgeApi.listArticulosRelacionados({ categoriaId: t.categoria_id })
          : [];
        // Gestión de Problemas: badge si este ticket ya está vinculado a un
        // problema todavía abierto (migración 033).
        this.problemaVinculado = t ? await insforgeApi.getProblemaAbiertoDeTicket(t.id) : null;
      } catch (e) {
        this.error = e?.message || 'Error al cargar el ticket';
        throw e;
      } finally {
        this.cargando = false;
      }
    },

    async recargarComentarios() {
      this.comentarios = await insforgeApi.listComentariosTicket(this.ticket.id);
    },

    // El historial (hoja de vida) se muestra siempre visible en la vista, así
    // que se refresca cada vez que un cambio de campo pudo generar un evento.
    async recargarEventos() {
      this.eventos = await insforgeApi.listEventosTicket(this.ticket.id);
    },

    async actualizarCampos(datos) {
      await insforgeApi.actualizarTicket(this.ticket.id, datos);
      Object.assign(this.ticket, datos);
      await this.recargarEventos();
    },

    // Resolver con la solución (migración 120): la base deja el comentario
    // visible y abre la encuesta en la misma transacción, así que se releen
    // comentarios, historial y encuesta. Reemplaza this.ticket completo:
    // resolverTicket() ya devuelve el shape mapeado (con joins), igual que cargar().
    async resolver(nota) {
      this.ticket = await insforgeApi.resolverTicket(this.ticket.id, nota);
      await this.recargarTrasCierre();
    },

    // Reabrir (JEFE, 120): estado + motivo como nota interna en una RPC.
    async reabrir(motivo) {
      this.ticket = await insforgeApi.reabrirTicket(this.ticket.id, motivo);
      await this.recargarTrasCierre();
    },

    // Tras resolver, reabrir o revisar una calificación baja: lo que tocó la
    // base en la misma transacción (estado, comentario, historial, encuesta).
    async recargarTrasCierre() {
      const [t, coms, eventos, satisfaccion] = await Promise.all([
        insforgeApi.getTicket(this.ticket.id),
        insforgeApi.listComentariosTicket(this.ticket.id),
        insforgeApi.listEventosTicket(this.ticket.id),
        insforgeApi.getSatisfaccionTicket(this.ticket.id),
      ]);
      if (t) this.ticket = t;
      this.comentarios = coms;
      this.eventos = eventos;
      this.satisfaccion = satisfaccion;
    },

    async comentar(mensaje, interno) {
      await insforgeApi.crearComentarioTicket(this.ticket.id, mensaje, interno);
      await this.recargarComentarios();
    },

    async recargarSatisfaccion() {
      this.satisfaccion = await insforgeApi.getSatisfaccionTicket(this.ticket.id);
    },

    // Catálogo vivo para el diálogo de reclasificar (categorías y subcategorías).
    async catalogoClasificacion() {
      const [categorias, subcategorias] = await Promise.all([
        insforgeApi.listCategoriasTicket(),
        insforgeApi.listSubcategoriasTicket(),
      ]);
      return { categorias, subcategorias };
    },

    // Tras reclasificar (RPC reclasificar_ticket, 116/119): la categoría, la
    // subcategoría y su aviso vienen de joins, así que se relee el ticket
    // entero; el evento `categoria_cambiada` va al historial y los artículos
    // de KB sugeridos dependen de la categoría.
    async recargarTrasReclasificar() {
      const [t, eventos] = await Promise.all([
        insforgeApi.getTicket(this.ticket.id),
        insforgeApi.listEventosTicket(this.ticket.id),
      ]);
      if (t) this.ticket = t;
      this.eventos = eventos;
      this.articulosRelacionados = this.ticket.categoria_id
        ? await insforgeApi.listArticulosRelacionados({ categoriaId: this.ticket.categoria_id })
        : [];
    },

    async recargarProblemaVinculado() {
      this.problemaVinculado = await insforgeApi.getProblemaAbiertoDeTicket(this.ticket.id);
    },

    // Al resolver el ticket, guarda la solución como borrador de KB (queda
    // pendiente de completar/revisar — migración 031). Desde la 106 lo hace el
    // servidor (crear_kb_desde_ticket): exige un ticket resuelto/cerrado y una
    // solución (`solucion` o la nota de resolución del ticket) y copia título,
    // síntoma y categoría. Un ticket sin solución se rechaza con un mensaje en
    // español; ya no nace un borrador vacío (U-05).
    async guardarComoBorradorKb({ solucion = null, titulo = null, sintoma = null } = {}) {
      try {
        return await insforgeApi.crearKbDesdeTicket(this.ticket.id, { solucion, titulo, sintoma });
      } catch (e) {
        throw anotarErrorDb(e, { entidad: 'artículo' });
      }
    },

    limpiar() {
      this.$reset();
    },
  },
});
