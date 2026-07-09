// Guarda de forma del API: la partición de api/insforge.js en módulos por
// dominio se ensambla con spread — este test detecta métodos perdidos o
// colisiones silenciosas de nombres. Si agregas un método nuevo al API,
// agrégalo también aquí (es deliberadamente explícito).
import { describe, it, expect } from 'vitest';
import { insforgeApi } from '../src/api/insforge.js';

const METODOS = [
  'buscarGlobal',
  // empleados
  'listEmpleadosRecientes', 'listEmpleados', 'getEmpleado', 'createEmpleado',
  'updateEmpleado', 'softDeleteEmpleado', 'resumenBaja', 'bajaEmpleado', 'reactivarEmpleado',
  // catálogos
  'listEmpresas', 'createEmpresa', 'updateEmpresa', 'softDeleteEmpresa',
  'listPlataformas', 'createPlataforma', 'updatePlataforma', 'softDeletePlataforma',
  'listUbicaciones', 'createUbicacion', 'updateUbicacion', 'softDeleteUbicacion',
  'listAreasObras', 'createAreaObra', 'updateAreaObra', 'softDeleteAreaObra',
  'listTiposEquipo', 'createTipoEquipo', 'updateTipoEquipo', 'softDeleteTipoEquipo',
  // cuentas
  'listCuentasPorEmpleado', 'createCuenta', 'updateCuenta', 'traspasarCuenta',
  'historialCuenta', 'cerrarAsignacion',
  // dashboard / actividad
  'getEstadisticas', 'listPendientes', 'pendientesTickets', 'listActividad',
  // correos
  'listCorreosAsignables', 'listCorreosCompartidos', 'createCorreo', 'updateCorreo',
  'softDeleteCorreo', 'asignarCuentaExistente',
  // licencias
  'listLicencias', 'createLicencia', 'updateLicencia', 'renovarLicencia',
  'softDeleteLicencia', 'asignarLicencia', 'cerrarAsignacionLicencia', 'licenciasPorEmpleado',
  // equipos
  'listEquipos', 'asignacionActivaEquipo', 'moverEquipo', 'createEquipo', 'updateEquipo',
  'cambiarEstadoEquipo', 'softDeleteEquipo', 'asignarEquipo', 'devolverEquipo',
  'subirFotoEquipo', 'eliminarFotoEquipo', 'eventosEquipo', 'equiposPorEmpleado',
  // tickets (staff) + categorías
  'listCategoriasTicket', 'listSubcategoriasTicket', 'createCategoriaTicket',
  'updateCategoriaTicket', 'softDeleteCategoriaTicket', 'createSubcategoriaTicket',
  'updateSubcategoriaTicket', 'softDeleteSubcategoriaTicket',
  'listTickets', 'getTicket', 'listComentariosTicket', 'crearComentarioTicket',
  'listEventosTicket', 'getSatisfaccionTicket', 'actualizarTicket',
  // staff
  'listStaff', 'updateStaff',
];

describe('forma de insforgeApi', () => {
  it('expone exactamente los 84 métodos conocidos (sin pérdidas ni colisiones del spread)', () => {
    const actuales = Object.keys(insforgeApi)
      .filter((k) => typeof insforgeApi[k] === 'function')
      .sort();
    expect(actuales).toEqual([...METODOS].sort());
  });

  it('conserva la bandera mode', () => {
    expect(insforgeApi.mode).toBe('insforge');
  });
});
