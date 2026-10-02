// Cambios (migración 107): registro mínimo de cambios en producción. Mismo
// módulo de permisos que Tickets: el CHECK de staff_modulos_permisos (056) admite
// 8 módulos y ninguno es «cambios»; no se inventa uno. Aprobar es de un jefe, y
// eso lo exige el servidor (el listado y el detalle son del módulo tickets).
export default [
  {
    path: '/cambios',
    name: 'cambios',
    component: () => import('../../modules/cambios/CambiosView.vue'),
    meta: { modulo: 'tickets' },
  },
  {
    path: '/cambios/:id',
    name: 'cambio-detalle',
    component: () => import('../../modules/cambios/CambioDetalleView.vue'),
    meta: { modulo: 'tickets', imprimible: true },
  },
];
