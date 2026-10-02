// Guarda de forma del API: la partición de api/insforge.js en módulos por
// dominio se ensambla con spread — este test detecta métodos perdidos o
// colisiones silenciosas de nombres. Si agregas un método nuevo al API,
// agrégalo también aquí (es deliberadamente explícito).
import { describe, it, expect } from 'vitest';
import { insforgeApi } from '../src/api/insforge.js';

const METODOS = [
  'buscarGlobal', 'misTickets',
  // empleados
  'listEmpleados', 'listEmpleadosPage', 'listEmpleadosFiltrados',
  'getEmpleado', 'createEmpleado', 'buscarPorDni',
  'updateEmpleado', 'softDeleteEmpleado', 'resumenBaja', 'bajaEmpleado', 'reactivarEmpleado',
  'conteosVinculos', 'conteosEmpleadosPorEstado',
  // ciclo de vida del empleado (migración 102) y lecturas del expediente
  'suspenderEmpleado', 'reingresarEmpleado', 'registrarRevisionAccesos', 'ultimaRevisionAccesos',
  'listEventosEmpleado', 'ticketsDeEmpleado', 'entregasDeEmpleado', 'actasDeEmpleado',
  'historialCuentasEmpleado', 'historialLicenciasEmpleado', 'historialEquiposEmpleado',
  // catálogos
  'listEmpresas', 'createEmpresa', 'updateEmpresa', 'softDeleteEmpresa',
  'listPlataformas', 'createPlataforma', 'updatePlataforma', 'softDeletePlataforma',
  'listUbicaciones', 'createUbicacion', 'updateUbicacion', 'softDeleteUbicacion',
  'listAreasObras', 'createAreaObra', 'updateAreaObra', 'softDeleteAreaObra',
  'listTiposEquipo', 'createTipoEquipo', 'updateTipoEquipo', 'softDeleteTipoEquipo',
  'listCatalogoAlmacen', 'createCatalogoAlmacen', 'updateCatalogoAlmacen', 'softDeleteCatalogoAlmacen',
  // cuentas
  'listCuentasPorEmpleado', 'createCuenta', 'updateCuenta', 'traspasarCuenta',
  'historialCuenta', 'cerrarAsignacion', 'revocarCuentaPersonal',
  // dashboard / actividad
  'getEstadisticas', 'listPendientes', 'pendientesTickets', 'listActividad', 'getResumen',
  // correos
  'listCorreosAsignables', 'listCorreosCompartidos', 'listCorreosPage', 'listCorreosFiltrados', 'conteosCorreosPorVista',
  'createCorreo', 'updateCorreo',
  'softDeleteCorreo', 'asignarCuentaExistente',
  // licencias
  'listLicencias', 'listLicenciasPage', 'listLicenciasFiltrados', 'conteosLicenciasPorSituacion', 'createLicencia', 'createLicenciaConCuenta', 'updateLicencia', 'renovarLicencia',
  'softDeleteLicencia', 'asignarLicencia', 'cerrarAsignacionLicencia', 'licenciasPorEmpleado',
  'asignarUsuario', 'liberarUsuario',
  // equipos
  'listEquipos', 'listEquiposPage', 'listEquiposFiltrados', 'asignacionActivaEquipo', 'moverEquipo', 'createEquipo', 'updateEquipo',
  'cambiarEstadoEquipo', 'softDeleteEquipo', 'asignarEquipo', 'devolverEquipo',
  'subirFotoEquipo', 'eliminarFotoEquipo', 'eventosEquipo', 'equiposPorEmpleado', 'ultimosMovimientos',
  'conteosEquiposPorSituacion',
  // hoja de vida, actas firmadas y etiquetas QR (RPC 101, tabla actas 110)
  'verificarEquipo', 'getEquipo', 'buscarEquipoPorCodigo', 'listEquiposPorIds', 'guardarFotosEquipo',
  'asignacionesDeEquipo', 'listActasEquipo', 'subirActa', 'urlActa',
  // bandeja de importación de equipos desde Excel (migración 057)
  'listImportacionPendiente', 'bulkCrearImportacion', 'updateImportacion',
  'eliminarImportacion', 'vaciarImportacion', 'migrarImportacionEquipo', 'migrarImportacionEquipos',
  // tickets (staff) + categorías
  'listCategoriasTicket', 'listSubcategoriasTicket', 'createCategoriaTicket',
  'updateCategoriaTicket', 'softDeleteCategoriaTicket', 'createSubcategoriaTicket',
  'updateSubcategoriaTicket', 'softDeleteSubcategoriaTicket',
  'listTickets', 'listTicketsPage', 'listTicketsFiltrados', 'contarTickets',
  'getTicket', 'listComentariosTicket', 'crearComentarioTicket',
  'listEventosTicket', 'getSatisfaccionTicket', 'actualizarTicket', 'cerrarTicket',
  'obtenerReporteTickets', 'obtenerResumenTickets', 'obtenerSatisfaccionConsolidado', 'listarTicketsDelPeriodo',
  // staff
  'listStaff', 'updateStaff', 'nombresStaff',
  // accesos sensibles
  'listAccesosSensibles', 'permisosDeAcceso', 'crearAccesoSensible',
  'actualizarAccesoSensible', 'eliminarAccesoSensible',
  // base de conocimiento
  'listKbPage', 'getKbArticulo', 'listArticulosRelacionados', 'conteosKbPorEstado',
  'crearKbArticulo', 'actualizarKbArticulo', 'softDeleteKbArticulo', 'votarKbArticulo',
  // KEDB (migración 106): workaround de un problema, KB desde un ticket y usos
  'publicarWorkaroundProblema', 'crearKbDesdeTicket', 'registrarUsoKbTicket', 'listUsosKbTicket', 'kpiKbArticulo',
  // gestión de problemas
  'listProblemasPage', 'conteosProblemasPorVista', 'getProblema', 'crearProblema', 'actualizarProblema', 'softDeleteProblema',
  'listTicketsVinculados', 'vincularTicket', 'desvincularTicket',
  'listAccionesCorrectivas', 'crearAccionCorrectiva', 'actualizarAccionCorrectiva', 'softDeleteAccionCorrectiva',
  'getProblemaAbiertoDeTicket', 'listCategoriasRecurrentes', 'listAccionesCorrectivasVencidas', 'pendientesProblemas',
  // encuestas
  'listEncuestas', 'getEncuesta', 'createEncuesta', 'updateEncuesta', 'softDeleteEncuesta',
  'listRondas', 'crearRonda', 'cerrarRonda', 'listRespuestas',
  // solicitudes de servicio (migración 108): lectura con RLS y escritura por RPC
  'listSolicitudesPage', 'conteosSolicitudesPorEstado', 'getSolicitud', 'solicitudesDeEmpleado',
  'solicitudDeBaja', 'objetivosDePasosSolicitud', 'crearSolicitud', 'completarPasoSolicitud',
  'omitirPasoSolicitud', 'cancelarSolicitud', 'convertirTicketEnSolicitud',
  // notificaciones
  'listNotificaciones', 'listLecturas', 'marcarLeida', 'marcarVariasLeidas',
  // permisos de módulo (migración 056)
  'misModulos', 'modulosDeStaff', 'modulosPorStaff', 'guardarModulos',
  // permisos individuales (migración 060)
  'misPermisos', 'setCredencialesVer',
];

describe('forma de insforgeApi', () => {
  it('expone exactamente los métodos conocidos (sin pérdidas ni colisiones del spread)', () => {
    const actuales = Object.keys(insforgeApi)
      .filter((k) => typeof insforgeApi[k] === 'function')
      .sort();
    expect(actuales).toEqual([...METODOS].sort());
  });

  it('conserva la bandera mode', () => {
    expect(insforgeApi.mode).toBe('insforge');
  });
});
