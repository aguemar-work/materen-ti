// Mesa de ayuda interna (vistas de staff; las públicas van en soporte.routes.js).
export default [
  {
    path: '/tickets',
    name: 'tickets',
    component: () => import('../../modules/tickets/TicketsView.vue'),
    meta: { modulo: 'tickets' },
  },
  {
    // Calificaciones de 1 o 2 por revisar (procedimiento de cierre, 120).
    // Estática: vue-router la matchea antes que '/tickets/:id'.
    path: '/tickets/calificaciones',
    name: 'tickets-calificaciones',
    component: () => import('../../modules/tickets/CalificacionesBajasView.vue'),
    meta: { modulo: 'tickets' },
  },
  {
    path: '/tickets/:id',
    name: 'ticket-detalle',
    component: () => import('../../modules/tickets/TicketDetalleView.vue'),
    meta: { modulo: 'tickets' },
  },
  {
    // El consolidado de satisfacción se mudó a Reportes (2026-10-05): la ruta
    // vieja (enlaces guardados) redirige. vue-router matchea rutas estáticas
    // antes que '/tickets/:id', así que no la captura el detalle.
    path: '/tickets/satisfaccion',
    redirect: '/reportes/satisfaccion',
  },
];
