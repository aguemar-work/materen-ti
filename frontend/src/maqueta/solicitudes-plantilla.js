// Catálogo de Solicitudes de servicio del modo "maqueta": ESPEJO de lo que la
// migración 108 siembra en `solicitud_tipos` y `solicitud_plantilla_pasos`
// (7 tipos, 24 pasos). La maqueta no tiene backend, así que copia los pasos de
// aquí al crear una solicitud, igual que lo hace `crear_solicitud` con la
// plantilla de la base. `tests/maqueta-solicitudes.test.js` compara este archivo
// con el SQL de la migración: si uno cambia sin el otro, el test falla.

export const TIPOS = [
  { id: 'alta_empleado',     nombre: 'Alta de empleado',     modulo_responsable: 'empleados', activo: true, orden: 1 },
  { id: 'baja_empleado',     nombre: 'Baja de empleado',     modulo_responsable: 'empleados', activo: true, orden: 2 },
  { id: 'cambio_puesto',     nombre: 'Cambio de puesto',     modulo_responsable: 'empleados', activo: true, orden: 3 },
  { id: 'acceso_nuevo',      nombre: 'Acceso nuevo',         modulo_responsable: 'correos',   activo: true, orden: 4 },
  { id: 'entrega_equipo',    nombre: 'Entrega de equipo',    modulo_responsable: 'equipos',   activo: true, orden: 5 },
  { id: 'devolucion_equipo', nombre: 'Devolución de equipo', modulo_responsable: 'equipos',   activo: true, orden: 6 },
  { id: 'licencia',          nombre: 'Licencia',             modulo_responsable: 'licencias', activo: true, orden: 7 },
];

// [tipo_id, orden, clave, label, obligatorio, modulo, referencia_tipo, autocompleta, dinamico]
const FILAS = [
  ['alta_empleado', 1, 'registrar_empleado', 'Registrar a la persona', true, 'empleados', 'empleado', true, false],
  ['alta_empleado', 2, 'crear_cuenta', 'Crear la cuenta de correo', true, 'correos', 'cuenta', true, false],
  ['alta_empleado', 3, 'entregar_credenciales', 'Entregar las credenciales por enlace', true, 'correos', 'entrega', true, false],
  ['alta_empleado', 4, 'dar_accesos_area', 'Dar los accesos propios del área u obra', false, 'correos', 'cuenta', false, false],
  ['alta_empleado', 5, 'asignar_equipo', 'Asignar el equipo', false, 'equipos', 'equipo', true, false],
  ['alta_empleado', 6, 'asignar_licencia', 'Asignar las licencias', false, 'licencias', 'licencia', true, false],
  ['alta_empleado', 7, 'confirmar_recepcion', 'Confirmar la recepción con la persona', true, 'empleados', null, false, false],
  ['baja_empleado', 1, 'cerrar_accesos', 'Cerrar los accesos y los asientos de licencia', true, 'empleados', null, true, false],
  ['baja_empleado', 2, 'rotar_contrasenas', 'Rotar la contraseña de la cuenta', true, 'correos', 'cuenta', true, true],
  ['baja_empleado', 3, 'devolver_equipo', 'Recuperar el equipo', true, 'equipos', 'equipo', true, true],
  ['baja_empleado', 4, 'cerrar_cuentas_plataforma', 'Suspender o cerrar las cuentas personales en sus plataformas', true, 'correos', null, false, true],
  ['cambio_puesto', 1, 'actualizar_datos', 'Actualizar el cargo y el área en la ficha', true, 'empleados', null, false, false],
  ['cambio_puesto', 2, 'revisar_accesos', 'Revisar y ajustar los accesos al nuevo puesto', true, 'correos', null, false, false],
  ['cambio_puesto', 3, 'reasignar_equipo', 'Devolver o reasignar los equipos del puesto anterior', false, 'equipos', null, false, false],
  ['acceso_nuevo', 1, 'crear_cuenta', 'Crear o asignar la cuenta pedida', true, 'correos', 'cuenta', true, false],
  ['acceso_nuevo', 2, 'entregar_credenciales', 'Entregar las credenciales por enlace', true, 'correos', 'entrega', true, false],
  ['acceso_nuevo', 3, 'confirmar_recepcion', 'Confirmar con la persona que el acceso funciona', true, 'empleados', null, false, false],
  ['entrega_equipo', 1, 'asignar_equipo', 'Entregar el equipo', true, 'equipos', 'equipo', true, false],
  ['entrega_equipo', 2, 'adjuntar_acta', 'Adjuntar el acta de entrega firmada', false, 'equipos', null, false, false],
  ['entrega_equipo', 3, 'confirmar_recepcion', 'Confirmar la recepción con la persona', true, 'empleados', null, false, false],
  ['devolucion_equipo', 1, 'devolver_equipo', 'Registrar la devolución del equipo', true, 'equipos', 'equipo', true, false],
  ['devolucion_equipo', 2, 'revisar_estado', 'Revisar el estado del equipo y anotar daños', false, 'equipos', null, false, false],
  ['licencia', 1, 'asignar_licencia', 'Asignar la licencia', true, 'licencias', 'licencia', true, false],
  ['licencia', 2, 'activar_licencia', 'Activar la licencia en la plataforma del proveedor', true, 'licencias', null, false, false],
];

export const PLANTILLA = FILAS.map(([tipo_id, orden, clave, label, obligatorio, modulo, referencia_tipo, autocompleta, dinamico]) => ({
  tipo_id, orden, clave, label, obligatorio, modulo, referencia_tipo, autocompleta, dinamico,
}));

/** Fila de `solicitud_pasos` (pendiente) a partir de una fila de la plantilla. */
export function pasoDePlantilla(p, solicitudId, id, extra = {}) {
  return {
    id,
    solicitud_id: solicitudId,
    orden: p.orden,
    clave: p.clave,
    label: p.label,
    obligatorio: p.obligatorio,
    modulo: p.modulo,
    referencia_tipo: p.referencia_tipo,
    objetivo_id: null,
    autocompleta: p.autocompleta,
    estado: 'pendiente',
    referencia_id: null,
    automatico: false,
    hecho_por: null,
    hecho_at: null,
    nota: null,
    motivo_omision: null,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

/** Pasos que se copian al crear: los no dinámicos de un tipo, por orden. */
export const plantillaDe = (tipoId) => PLANTILLA.filter((p) => p.tipo_id === tipoId && !p.dinamico).sort((a, b) => a.orden - b.orden);

export const plantillaPaso = (tipoId, clave) => PLANTILLA.find((p) => p.tipo_id === tipoId && p.clave === clave);
