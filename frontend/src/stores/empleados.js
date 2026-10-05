import { insforgeApi } from '../api/insforge.js';
import { anotarErrorDb } from '../api/erroresDb.js';
import { crearStorePaginado } from './crearStorePaginado.js';

// Las transiciones de estado (migración 102) cambian el CONJUNTO de cada vista
// (Activos / Suspendidos / Inactivos): tras la RPC se recarga la página para
// corregir total y huecos, según la regla de crearStorePaginado. Si la recarga
// falla, la operación ya ocurrió: no se la presenta como un error de la
// mutación. El error de la RPC sale traducido (42501, P0001 en español...).
async function transicion(store, accion) {
  let empleado;
  try {
    empleado = await accion();
  } catch (e) {
    throw anotarErrorDb(e, { entidad: 'empleado' });
  }
  // Sin lista cargada (ficha abierta directo por URL) no hay nada que corregir:
  // la lista se pide completa al montarse.
  if (store.lista.length) {
    try {
      await store.cargar();
    } catch {
      // La lista se reintenta sola al volver a montarla.
    }
  }
  return empleado;
}

// Paginación server-side (el esqueleto común vive en crearStorePaginado.js):
// `lista` es SOLO la página actual; búsqueda y filtros viajan al servidor.
// Regla de coherencia: mutaciones in-place (editar, baja) actualizan la fila
// si está en la página; las que cambian el conjunto (crear, borrar,
// reactivar) recargan la página para corregir total y huecos.
export const useEmpleadosStore = crearStorePaginado('empleados', {
  listarPagina: (params) => insforgeApi.listEmpleadosPage(params),
  // estado: 'Activo' por defecto (ago 2026) — activos e inactivos mezclados
  // en la lista era el problema reportado; la vista "Todos" sigue a un clic.
  // Las dimensiones (V2) son listas: varios valores por dimensión.
  filtrosIniciales: () => ({ q: '', estado: 'Activo', empresaIds: [], ubicacionIds: [], areaIds: [] }),
  mensajeError: 'Error al cargar empleados',
  entidad: 'empleado',

  // Conteos de cuentas/equipos/licencias vinculados de la página; si fallan,
  // la columna "Vínculos" queda vacía pero el listado no se cae.
  async enriquecer(items) {
    const conteos = await insforgeApi.conteosVinculos(items.map((e) => e.id));
    return items.map((e) => ({
      ...e,
      n_cuentas: conteos[e.id]?.cuentas ?? 0,
      n_equipos: conteos[e.id]?.equipos ?? 0,
      n_licencias: conteos[e.id]?.licencias ?? 0,
    }));
  },

  actions: {
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

    // `motivo` opcional (≤ 500): queda en la hoja de vida del empleado.
    async darDeBaja(id, motivo = null) {
      this.error = null;
      let resultado;
      await transicion(this, async () => {
        resultado = await insforgeApi.bajaEmpleado(id, motivo);
        return resultado.empleado;
      });
      return resultado;
    },

    // Motivo OBLIGATORIO; solo desde Activo.
    async suspender(id, motivo) {
      this.error = null;
      return transicion(this, () => insforgeApi.suspenderEmpleado(id, motivo));
    },

    // Desde Suspendido o Inactivo. No toca la fecha de alta.
    async reactivar(id, motivo = null) {
      this.error = null;
      return transicion(this, () => insforgeApi.reactivarEmpleado(id, motivo));
    },

    // Solo desde Inactivo: nueva fecha de alta (hoy) y datos opcionales
    // (area_obra_id, ubicacion_id, cargo, empresa_id).
    async reingresar(id, datos = {}) {
      this.error = null;
      return transicion(this, () => insforgeApi.reingresarEmpleado(id, datos));
    },

    // Control de accesos: no cambia el conjunto, no recarga la lista.
    async registrarRevisionAccesos(id, resultado = {}, nota = null) {
      this.error = null;
      try {
        return await insforgeApi.registrarRevisionAccesos(id, resultado, nota);
      } catch (e) {
        throw anotarErrorDb(e, { entidad: 'empleado' });
      }
    },

    async softDelete(id) {
      this.error = null;
      await insforgeApi.softDeleteEmpleado(id);
      await this.cargar(); // rellena el hueco de la página y corrige total
    },

  },
});
