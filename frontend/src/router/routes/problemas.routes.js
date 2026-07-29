// Gestión de Problemas: solo staff (JEFE/ASISTENTE), sin rutas públicas.
export default [
  {
    path: '/problemas',
    name: 'problemas',
    component: () => import('../../modules/problemas/ProblemasView.vue'),
  },
  {
    path: '/problemas/:id',
    name: 'problema-detalle',
    component: () => import('../../modules/problemas/ProblemaDetalleView.vue'),
  },
];
