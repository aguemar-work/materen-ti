// Reportes (migración 115): hoja imprimible por período, compuesta en el
// servidor (reporte_tickets). Cuelga del módulo `tickets`: es el mismo dato que
// la bandeja, agregado. "Por técnico" no es una ruta aparte: la RPC solo la
// devuelve al JEFE y la hoja la muestra si llegó.
export default [
  {
    path: '/reportes',
    name: 'reportes',
    component: () => import('../../modules/reportes/ReportesView.vue'),
    meta: { modulo: 'tickets' },
  },
];
