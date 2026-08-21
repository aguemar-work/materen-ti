// Guarda de forma del API: la partición de api/insforge.js en módulos por
// dominio se ensambla con spread — este test detecta métodos perdidos o
// colisiones silenciosas de nombres. Si agregas un método nuevo al API,
// agrégalo también aquí (es deliberadamente explícito).
import { describe, it, expect } from 'vitest';
import { insforgeApi } from '../src/api/insforge.js';

const METODOS = [
  'buscarGlobal',
  // empleados
  'listEmpleadosRecientes', 'listEmpleados', 'listEmpleadosPage', 'listEmpleadosFiltrados',
  'getEmpleado', 'createEmpleado', 'buscarPorDni',
  'updateEmpleado', 'softDeleteEmpleado', 'resumenBaja', 'bajaEmpleado', 'reactivarEmpleado',
  'conteosVinculos',
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
  'getEstadisticas', 'getTendencias', 'listPendientes', 'pendientesTickets', 'listActividad',
  // correos
  'listCorreosAsignables', 'listCorreosCompartidos', 'listCorreosPage', 'listCorreosFiltrados',
  'createCorreo', 'updateCorreo',
  'softDeleteCorreo', 'asignarCuentaExistente',
  // licencias
  'listLicencias', 'listLicenciasPage', 'listLicenciasFiltrados', 'createLicencia', 'updateLicencia', 'renovarLicencia',
  'softDeleteLicencia', 'asignarLicencia', 'cerrarAsignacionLicencia', 'licenciasPorEmpleado',
  'asignarUsuario', 'liberarUsuario',
  // equipos
  'listEquipos', 'listEquiposPage', 'listEquiposFiltrados', 'asignacionActivaEquipo', 'moverEquipo', 'createEquipo', 'updateEquipo',
  'cambiarEstadoEquipo', 'softDeleteEquipo', 'asignarEquipo', 'devolverEquipo',
  'subirFotoEquipo', 'eliminarFotoEquipo', 'eventosEquipo', 'equiposPorEmpleado',
  // bandeja de importación de equipos desde Excel (migración 057)
  'listImportacionPendiente', 'bulkCrearImportacion', 'updateImportacion',
  'eliminarImportacion', 'vaciarImportacion',
  // tickets (staff) + categorías
  'listCategoriasTicket', 'listSubcategoriasTicket', 'createCategoriaTicket',
  'updateCategoriaTicket', 'softDeleteCategoriaTicket', 'createSubcategoriaTicket',
  'updateSubcategoriaTicket', 'softDeleteSubcategoriaTicket',
  'listTickets', 'listTicketsPage', 'listTicketsFiltrados',
  'getTicket', 'listComentariosTicket', 'crearComentarioTicket',
  'listEventosTicket', 'getSatisfaccionTicket', 'actualizarTicket', 'cerrarTicket',
  'obtenerReporteTickets', 'obtenerResumenTickets', 'obtenerSatisfaccionConsolidado', 'listarTicketsDelPeriodo',
  // staff
  'listStaff', 'updateStaff', 'nombresStaff',
  // accesos sensibles
  'listAccesosSensibles', 'permisosDeAcceso', 'crearAccesoSensible',
  'actualizarAccesoSensible', 'eliminarAccesoSensible',
  // base de conocimiento
  'listKbPage', 'getKbArticulo', 'listArticulosRelacionados',
  'crearKbArticulo', 'actualizarKbArticulo', 'softDeleteKbArticulo', 'votarKbArticulo',
  // gestión de problemas
  'listProblemasPage', 'getProblema', 'crearProblema', 'actualizarProblema', 'softDeleteProblema',
  'listTicketsVinculados', 'vincularTicket', 'desvincularTicket',
  'listAccionesCorrectivas', 'crearAccionCorrectiva', 'actualizarAccionCorrectiva', 'softDeleteAccionCorrectiva',
  'getProblemaAbiertoDeTicket', 'listCategoriasRecurrentes', 'listAccionesCorrectivasVencidas', 'pendientesProblemas',
  // pre-registro de personal
  'listPersonalRegistrosPage', 'listPersonalRegistrosFiltrados', 'marcarUsado', 'eliminarRegistro',
  // encuestas
  'listEncuestas', 'getEncuesta', 'createEncuesta', 'updateEncuesta', 'softDeleteEncuesta',
  'listRondas', 'crearRonda', 'cerrarRonda', 'listRespuestas',
  // notificaciones
  'listNotificaciones', 'listLecturas', 'marcarLeida', 'marcarVariasLeidas',
  // permisos de módulo (migración 056)
  'misModulos', 'modulosDeStaff', 'guardarModulos',
  // permisos individuales (migración 060)
  'misPermisos', 'setCredencialesVer',
];

describe('forma de insforgeApi', () => {
  it('expone exactamente los 163 métodos conocidos (sin pérdidas ni colisiones del spread)', () => {
    const actuales = Object.keys(insforgeApi)
      .filter((k) => typeof insforgeApi[k] === 'function')
      .sort();
    expect(actuales).toEqual([...METODOS].sort());
  });

  it('conserva la bandera mode', () => {
    expect(insforgeApi.mode).toBe('insforge');
  });
});
