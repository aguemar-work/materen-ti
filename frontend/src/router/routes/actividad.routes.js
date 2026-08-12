// Auditoría de actividad (solo JEFE — ver guard en router/guards.js).
export default [
  {
    path: '/actividad',
    name: 'actividad',
    component: () => import('../../modules/actividad/ActividadView.vue'),
    meta: { roles: ['jefe'] },
  },
];
