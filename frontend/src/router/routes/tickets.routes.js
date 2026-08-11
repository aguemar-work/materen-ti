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
  {
    // Consolidado histórico de satisfacción (todo el tiempo). Va antes de
    // '/tickets/:id' en la lista pero eso no importa acá: vue-router matchea
    // rutas estáticas antes que las dinámicas independientemente del orden.
    path: '/tickets/satisfaccion',
    name: 'tickets-satisfaccion',
    component: () => import('../../modules/tickets/SatisfaccionTicketsView.vue'),
  },
];
