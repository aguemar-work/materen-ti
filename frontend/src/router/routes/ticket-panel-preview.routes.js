// Preview aislado de TicketDetallePanel.vue (panel de detalle del split-view
// de Tickets, todavía en construcción — no integrado en TicketsView.vue)
// — deja ver el panel standalone, sin la lista al lado, antes de decidir el
// layout final. Solo se registra en desarrollo (ver spread condicional en
// router/index.js detrás de import.meta.env.DEV), mismo criterio que
// style-lab.routes.js / design-system.routes.js: en un build de producción
// esta ruta ni siquiera existe. Sigue exigiendo sesión de staff (no lleva
// meta.public) — el panel llama a la API real (RLS), así que sin sesión no
// va a poder cargar ningún ticket real de todas formas; saltear el guard acá
// no evitaría ese requisito, solo lo movería del router al 401 de la API.
export default [
  {
    path: '/preview/ticket-panel/:id?',
    name: 'preview-ticket-panel',
    component: () => import('../../modules/tickets/TicketPanelPreviewView.vue'),
  },
];
