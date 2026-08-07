// Gestión de empleados y sus accesos.
export default [
  {
    path: '/empleados',
    name: 'empleados',
    component: () => import('../../modules/empleados/EmpleadosView.vue'),
  },
  {
    path: '/empleados/:id',
    name: 'empleado-detalle',
    component: () => import('../../modules/empleados/EmpleadoDetalleView.vue'),
  },
  {
    // Solo JEFE — ver guard en router/guards.js
    path: '/accesos-sensibles',
    name: 'accesos-sensibles',
    component: () => import('../../modules/accesosSensibles/AccesosSensiblesView.vue'),
  },
  {
    // Lo que llega por el formulario público /personal-registro
    path: '/personal-registros',
    name: 'personal-registros',
    component: () => import('../../modules/personal/PersonalRegistrosView.vue'),
  },
];
