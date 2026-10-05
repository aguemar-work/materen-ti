// Guarda de forma del API: la partición de api/insforge.js en módulos por
// dominio se ensambla con spread — este test detecta métodos perdidos o
// colisiones silenciosas de nombres. Si agregas un método nuevo al API,
// agrégalo también aquí (es deliberadamente explícito).
import { describe, it, expect } from 'vitest';
import { insforgeApi } from '../src/api/insforge.js';

const METODOS = [
  'buscarGlobal',
  // empleados
  'listEmpleados', 'listEmpleadosPage',
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
  // dashboard / actividad (getEstadisticas, listPendientes, pendientesTickets y
  // misTickets se retiraron el 2026-10-03: todo sale de getResumen)
  'listActividad', 'getResumen',
  // correos
  'listCorreosAsignables', 'listCorreosCompartidos', 'listCorreosPage', 'conteosCorreosPorVista',
  'createCorreo', 'updateCorreo',
  'softDeleteCorreo', 'asignarCuentaExistente',
  // licencias
  'listLicencias', 'listLicenciasPage', 'listLicenciasFiltrados', 'conteosLicenciasPorSituacion', 'createLicencia', 'createLicenciaConCuenta', 'updateLicencia', 'renovarLicencia',
  'softDeleteLicencia', 'asignarLicencia', 'cerrarAsignacionLicencia', 'licenciasPorEmpleado',
  'asignarUsuario', 'liberarUsuario',
  // equipos
  'listEquipos', 'listEquiposPage', 'listEquiposFiltrados', 'asignacionActivaEquipo', 'moverEquipo', 'createEquipo', 'updateEquipo',
  'cambiarEstadoEquipo', 'softDeleteEquipo', 'asignarEquipo', 'devolverEquipo',
  'subirFotoEquipo', 'eliminarFotoEquipo', 'eventosEquipo', 'equiposPorEmpleado',
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
  // catálogo v2 (migración 116): reclasificación por el JEFE
  'listTicketsPorReclasificar', 'reclasificarTicket',
  'listTickets', 'listTicketsPage', 'contarTickets',
  'getTicket', 'listComentariosTicket', 'crearComentarioTicket',
  'listEventosTicket', 'getSatisfaccionTicket', 'actualizarTicket', 'cerrarTicket',
  // reportes (migración 115): solo RPC, nada se agrega en el cliente
  'obtenerReporteTickets', 'obtenerSatisfaccionConsolidado',
  // reportes centralizados (migración 117): una RPC por reporte, misma forma
  'obtenerReporteInventario', 'obtenerReporteLicencias', 'obtenerReporteCorreos', 'obtenerReportePersonal',
  'obtenerReporteSolicitudes', 'obtenerReporteCambios', 'obtenerReporteProblemas', 'obtenerReporteEncuestas',
  'obtenerReporteAuditoria',
  // parámetros de negocio (config_parametros, 103): lectura de un entero
  'parametroEntero',
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
  // cambios (migración 107): lectura con RLS y escritura por RPC
  'listCambiosPage', 'conteosCambiosPorVista', 'getCambio', 'listEventosCambio', 'ticketsDeCambio',
  'buscarTicketPorCodigo', 'kpiCambios', 'cambiosAprobacionVencida', 'crearCambio', 'actualizarCambio',
  'transicionarCambio', 'aprobarCambio', 'rechazarCambio', 'vincularCambioTicket', 'desvincularCambioTicket',
  // servicios (migración 107): catálogo de ≤ 15, lo escribe solo un JEFE
  'listServicios', 'createServicio', 'updateServicio', 'softDeleteServicio',
  // portal del empleado (migración 109): enlace por token, solo columnas no secretas
  'enlacePortalActivo', 'emitirEnlacePortal', 'revocarEnlacePortal',
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
