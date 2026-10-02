// Resúmenes de `dashboard_resumen` (migración 103) para las pruebas del Inicio.
// `resumenVacio()` es un resumen COMPLETO y sin pendientes (todas las secciones
// presentes y vacías, `errores: []`): lo que el servidor devuelve a un JEFE
// con todo al día. Cada prueba parte de él y agrega lo que necesita.

/** Hoy en Lima de las pruebas: jueves 1 de octubre de 2026, 08:30 (UTC-5). */
export const AHORA = new Date('2026-10-01T13:30:00Z');

export function resumenVacio(extra = {}) {
  return {
    generado_en: '2026-10-01T13:30:00Z',
    kpis: {
      empleados_activos: 9, empleados_total: 12, cuentas_asignadas: 18, correos_compartidos: 3,
      cuentas_por_rotar: 0, licencias_por_vencer: 0, equipos_total: 12, tickets_abiertos: 0,
    },
    tickets: {
      sin_asignar: [], sin_vincular: [], viejos: [], mios: [], mios_total: 0, vigentes: 0, vencidos: null, por_vencer: null,
    },
    rotaciones_pendientes: [],
    cuentas_sin_password: [],
    equipos_sin_devolver: [],
    licencias_por_vencer: [],
    garantias_por_vencer: [],
    altas_incompletas: [],
    problemas: { acciones_vencidas: [], recurrentes: [] },
    encuestas_sin_responder: 0,
    custodia_hoy: [],
    actas_pendientes: [],
    solicitudes_abiertas: [],
    errores: [],
    ...extra,
  };
}

export const cuenta = (extra = {}) => ({
  cuenta_id: 'c1', usuario: 'soporte@materen.pe', tipo_cuenta: 'reutilizable', plataforma: 'Gmail', titulares: [], ...extra,
});

export const ticket = (extra = {}) => ({
  ticket_id: 't1', codigo: 'TCK-0281', titulo: 'Impresora obra Lurín', desde: '2026-09-28T15:00:00Z', ...extra,
});

export const mio = (extra = {}) => ({
  id: 't2', codigo: 'TCK-0287', titulo: 'Sin acceso a Bitrix', prioridad: 'alta', estado: 'en_progreso',
  created_at: '2026-09-30T15:00:00Z', ...extra,
});

/** Un resumen con de todo: críticos y atención en las cuatro vistas. */
export function resumenCompleto() {
  return resumenVacio({
    tickets: {
      sin_asignar: [ticket()],
      sin_vincular: [ticket({ ticket_id: 't3', codigo: 'TCK-0283', titulo: 'Teclado' })],
      viejos: [ticket()],
      mios: [mio(), mio({ id: 't4', codigo: 'TCK-0290', titulo: 'Excel macros', prioridad: 'urgente', estado: 'abierto' })],
      mios_total: 7, vigentes: 9, vencidos: null, por_vencer: null,
    },
    cuentas_sin_password: [cuenta({ cuenta_id: 'c9', usuario: 'cflores', tipo_cuenta: 'personal', titulares: [{ id: 'e5', nombre: 'Carmen Flores' }] })],
    rotaciones_pendientes: [cuenta()],
    equipos_sin_devolver: [{
      asignacion_id: 'a1', codigo: 'LAP-0142', equipo: 'HP ProBook', empleado: 'J. Quispe', empleado_id: 'e6', desde: '2025-03-12',
    }],
    licencias_por_vencer: [
      { licencia_id: 'l3', software: 'ESET Endpoint', cantidad: 25, fecha_vencimiento: '2026-09-23', empresa: 'Materen', vencida: true },
      { licencia_id: 'l2', software: 'AutoCAD 2026', cantidad: 3, fecha_vencimiento: '2026-10-03', empresa: 'Materen', vencida: false },
      { licencia_id: 'l5', software: 'S10 Costos', cantidad: 4, fecha_vencimiento: '2026-10-25', empresa: 'Los Andes', vencida: false },
    ],
    garantias_por_vencer: [
      { equipo_id: 'q1', codigo: 'LAP-001', equipo: 'Lenovo ThinkPad', garantia_hasta: '2026-10-05', vencida: false },
    ],
    altas_incompletas: [{
      empleado_id: 'e7', nombre: 'Ana Torres', cargo: 'Arquitecta', fecha_alta: '2026-09-28', dias: 3, faltan: ['cuenta'],
    }],
    problemas: {
      acciones_vencidas: [{
        accion_id: 'ac1', descripcion: 'Contratar línea de respaldo', fecha_limite: '2026-09-28', problema_id: 'p1', problema_titulo: 'Caídas de internet',
      }],
      recurrentes: [{ categoria_id: 'red', categoria_nombre: 'Red', total: 3, tickets: [{}, {}, {}] }],
    },
    custodia_hoy: [
      { hora: '10:12', ocurrido_at: '2026-10-01T15:12:00Z', evento: 'entregado', equipo_codigo: 'LAP-0150', equipo_descripcion: 'Laptop Dell', persona: 'R. Salas' },
      { hora: '09:40', ocurrido_at: '2026-10-01T14:40:00Z', evento: 'devuelto', equipo_codigo: 'MON-0031', equipo_descripcion: 'Monitor LG', persona: 'J. Quispe' },
    ],
    actas_pendientes: [{
      asignacion_id: 'as1', equipo_id: 'q9', equipo_codigo: 'DES-002', equipo_descripcion: 'Desktop Lenovo',
      empleado_id: 'e3', empleado: 'M. Salazar', fecha_inicio: '2026-09-20', dias: 11,
    }],
  });
}
