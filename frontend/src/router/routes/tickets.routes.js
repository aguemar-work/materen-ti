// Mesa de ayuda interna (vistas de staff; las públicas van en soporte.routes.js).
export default [
  {
    path: '/tickets',
    name: 'tickets',
    component: () => import('../../modules/tickets/TicketsView.vue'),
  },
  {
    path: '/tickets/:id',
    name: 'ticket-detalle',
    component: () => import('../../modules/tickets/TicketDetalleView.vue'),
  },
];
