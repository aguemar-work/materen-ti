// Rutas PÚBLICAS (meta.public: sin sesión): portal de soporte y entregas.
// Todas lazy: no descargan el panel interno.
export default [
  {
    // Landing de soporte (punto de entrada memorable hacia reportar/buscar
    // tickets; apta para QR o comunicado interno)
    path: '/soporte',
    name: 'soporte',
    component: () => import('../../modules/soporte/SoporteView.vue'),
    meta: { public: true },
  },
  {
    // Formulario de creación de ticket (?entrega=<token> opcional)
    path: '/soporte/nuevo',
    name: 'ticket-nuevo',
    component: () => import('../../modules/tickets/TicketNuevoView.vue'),
    meta: { public: true },
  },
  {
    // Buscar tickets ACTIVOS por DNI (sin enlace guardado)
    path: '/soporte/buscar',
    name: 'ticket-buscar',
    component: () => import('../../modules/tickets/TicketBuscarView.vue'),
    meta: { public: true },
  },
  {
    // Seguimiento de UN ticket por su propio token
    path: '/soporte/:token',
    name: 'ticket-seguimiento',
    component: () => import('../../modules/tickets/TicketSeguimientoView.vue'),
    meta: { public: true },
  },
  {
    // Encuesta de satisfacción, enlace enviado al cerrar
    path: '/soporte/:token/satisfaccion',
    name: 'ticket-satisfaccion',
    component: () => import('../../modules/tickets/ResponderEncuestaView.vue'),
    meta: { public: true },
  },
  {
    // El empleado abre su entrega de un solo uso sin sesión
    path: '/entrega/:token',
    name: 'entrega',
    component: () => import('../../modules/entregas/EntregaView.vue'),
    meta: { public: true },
  },
  {
    // Pre-registro público de personal (candidato/nuevo ingreso, sin sesión)
    path: '/personal-registro',
    name: 'personal-registro',
    component: () => import('../../modules/personal/PersonalRegistroView.vue'),
    meta: { public: true },
  },
  {
    // Responder una ronda de encuesta anónima (sin sesión, sin un solo uso)
    path: '/encuesta/:slug',
    name: 'encuesta-publica',
    component: () => import('../../modules/encuestas/EncuestaPublicaView.vue'),
    meta: { public: true },
  },
  // Compat /ticket/* → /soporte/*: hay enlaces viejos ya enviados por
  // correo (functions/tickets.ts) y copiados/impresos por el staff que
  // no se pueden actualizar. Params y query (?entrega=) se conservan.
  {
    path: '/ticket/nuevo',
    name: 'ticket-nuevo-legacy',
    redirect: { name: 'ticket-nuevo' },
  },
  {
    path: '/ticket/buscar',
    name: 'ticket-buscar-legacy',
    redirect: { name: 'ticket-buscar' },
  },
  {
    path: '/ticket/:token',
    name: 'ticket-seguimiento-legacy',
    redirect: { name: 'ticket-seguimiento' },
  },
  {
    path: '/ticket/:token/satisfaccion',
    name: 'ticket-satisfaccion-legacy',
    redirect: { name: 'ticket-satisfaccion' },
  },
];
