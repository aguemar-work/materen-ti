// Catálogo ÚNICO de reportes (migraciones 115 y 117): todo reporte o
// exportación del sistema vive en el módulo Reportes, en su ruta
// `/reportes/<id>`. Ningún módulo tiene su propio botón de exportar o de
// reporte (encargo del dueño, 2026-10-05); donde estaba el botón queda un
// enlace «Ver reporte» que sale de acá. Los DOCUMENTOS de un solo registro
// (acta, etiquetas, expediente, hoja de vida, solicitud, cambio) siguen en su
// ficha y no figuran en este catálogo.
//
// Cada reporte dice quién lo ve con el MISMO permiso que exige su RPC:
// `modulo` (staff_modulos_permisos; JEFE exento) o `rol: 'jefe'`. La lista de
// la pantalla, el menú y el guard del router lo leen de acá; la barrera real es
// el servidor (42501).
//
//   alcance: 'periodo' (mes/semana/rango), 'corte' (foto al momento),
//            'historico' (todo el tiempo) o 'ronda' (una ronda de encuesta).
//   metodo:  el de insforgeApi que trae el jsonb (null = vista propia).

export const AREAS_REPORTES = [
  { id: 'mesa-de-ayuda', label: 'Mesa de ayuda' },
  { id: 'personas', label: 'Personas' },
  { id: 'custodia', label: 'Custodia' },
  { id: 'administracion', label: 'Administración' },
];

export const REPORTES = [
  {
    id: 'tickets', titulo: 'Tickets', area: 'mesa-de-ayuda', modulo: 'tickets', alcance: 'periodo', metodo: null,
    descripcion: 'Volumen, tiempos de atención, reaperturas y satisfacción del período, con el detalle de cada ticket.',
  },
  {
    id: 'satisfaccion', titulo: 'Satisfacción', area: 'mesa-de-ayuda', modulo: 'tickets', alcance: 'historico', metodo: null,
    descripcion: 'Encuestas de cierre de tickets de todo el historial: por mes, por técnico y por solicitante.',
  },
  {
    id: 'cambios', titulo: 'Cambios', area: 'mesa-de-ayuda', modulo: 'tickets', alcance: 'periodo', metodo: 'obtenerReporteCambios',
    descripcion: 'Cambios por tipo y servicio, revertidos y emergencias sin aprobar.',
  },
  {
    id: 'problemas', titulo: 'Problemas y conocimiento', area: 'mesa-de-ayuda', modulo: 'problemas', alcance: 'periodo', metodo: 'obtenerReporteProblemas',
    descripcion: 'Problemas abiertos, errores conocidos, acciones vencidas, uso de la base de conocimiento y recurrencias.',
  },
  {
    id: 'personal', titulo: 'Personal', area: 'personas', modulo: 'empleados', alcance: 'periodo', metodo: 'obtenerReportePersonal',
    descripcion: 'Activos por empresa, área y cargo; altas y bajas del período; revisiones de acceso pendientes.',
  },
  {
    id: 'solicitudes', titulo: 'Solicitudes', area: 'personas', modulo: 'empleados', alcance: 'periodo', metodo: 'obtenerReporteSolicitudes',
    descripcion: 'Solicitudes por tipo, tiempo de trámite y abiertas por antigüedad.',
  },
  {
    id: 'encuestas', titulo: 'Encuestas', area: 'personas', modulo: 'encuestas', alcance: 'ronda', metodo: 'obtenerReporteEncuestas',
    descripcion: 'Resultados anónimos de una ronda, pregunta por pregunta.',
  },
  {
    id: 'inventario', titulo: 'Inventario de equipos', area: 'custodia', modulo: 'equipos', alcance: 'corte', metodo: 'obtenerReporteInventario',
    descripcion: 'Situación del parque, ubicación y custodia, garantías, equipos sin devolver y actas pendientes.',
  },
  {
    id: 'licencias', titulo: 'Licencias', area: 'custodia', modulo: 'licencias', alcance: 'corte', metodo: 'obtenerReporteLicencias',
    descripcion: 'Asientos usados y libres por licencia, y vencimientos.',
  },
  {
    id: 'correos', titulo: 'Correos y cuentas compartidas', area: 'custodia', modulo: 'correos', alcance: 'corte', metodo: 'obtenerReporteCorreos',
    descripcion: 'Cuentas por plataforma, rotaciones de contraseña pendientes y reutilizables sin titular.',
  },
  {
    id: 'auditoria', titulo: 'Auditoría', area: 'administracion', rol: 'jefe', alcance: 'periodo', metodo: 'obtenerReporteAuditoria',
    descripcion: 'Contraseñas vistas y copiadas, accesos denegados, cambios de permisos y purgas del período.',
  },
];

export const REPORTE_POR_ID = Object.fromEntries(REPORTES.map((r) => [r.id, r]));

/** Ruta de la hoja de un reporte. */
export const rutaReporte = (id) => `/reportes/${id}`;

/** Módulos que dan acceso a algún reporte: el menú «Reportes» se ve con cualquiera de ellos (o siendo JEFE). */
export const MODULOS_CON_REPORTE = [...new Set(REPORTES.filter((r) => r.modulo).map((r) => r.modulo))];

/** ¿Este usuario puede ver este reporte? `auth` = store de sesión (esJefe, puedeVerModulo). */
export function puedeVerReporte(auth, reporte) {
  if (!reporte) return false;
  if (reporte.rol === 'jefe') return !!auth.esJefe;
  return !!auth.puedeVerModulo(reporte.modulo);
}

/** Áreas con los reportes que el usuario puede ver (las vacías no se devuelven). */
export function reportesPorArea(auth) {
  return AREAS_REPORTES
    .map((area) => ({ ...area, reportes: REPORTES.filter((r) => r.area === area.id && puedeVerReporte(auth, r)) }))
    .filter((area) => area.reportes.length > 0);
}
