import { insforgeApi } from '../api/insforge.js';
import { crearStorePaginado } from './crearStorePaginado.js';

// Paginación server-side (el esqueleto común vive en crearStorePaginado.js).
export const useLicenciasStore = crearStorePaginado('licencias', {
  listarPagina: (params) => insforgeApi.listLicenciasPage(params),
  // situacion: '' | 'vencidas' | 'por_vencer' (ver SITUACIONES_LICENCIA en
  // api/domains/licencias.js). Se resetea en cada montaje de la vista, igual
  // que `q` (gotcha de resetearFiltros(), ver frontend/AGENTS.md).
  filtrosIniciales: () => ({ q: '', situacion: '' }),
  mensajeError: 'Error al cargar licencias',
  entidad: 'licencia',

  actions: {
    async listaParaExportar() {
      return insforgeApi.listLicenciasFiltrados(this.filtros);
    },

    // cuentaNueva (opcional): correo que se crea junto con la licencia, en una
    // sola transacción (RPC crear_licencia_con_cuenta, migración 101).
    async crear(datos, cuentaNueva = null) {
      this.error = null;
      const id = cuentaNueva
        ? await insforgeApi.createLicenciaConCuenta(datos, cuentaNueva)
        : await insforgeApi.createLicencia(datos);
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
