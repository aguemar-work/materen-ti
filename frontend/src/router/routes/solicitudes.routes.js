// Solicitudes de servicio (migración 108): altas, bajas y pedidos con pasos.
// Mismo módulo de permisos que Empleados: el CHECK de staff_modulos_permisos
// (056) admite 8 módulos y ninguno es «solicitudes»; no se inventa uno.
export default [
  {
    path: '/solicitudes',
    name: 'solicitudes',
    component: () => import('../../modules/solicitudes/SolicitudesView.vue'),
    meta: { modulo: 'empleados' },
  },
  {
    path: '/solicitudes/:id',
    name: 'solicitud-detalle',
    component: () => import('../../modules/solicitudes/SolicitudDetalleView.vue'),
    meta: { modulo: 'empleados', imprimible: true },
  },
];
