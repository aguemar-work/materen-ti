// Base de Conocimiento: solo staff (JEFE/ASISTENTE), sin rutas públicas.
export default [
  {
    path: '/base-conocimiento',
    name: 'kb',
    component: () => import('../../modules/kb/KbView.vue'),
  },
  {
    path: '/base-conocimiento/:id',
    name: 'kb-detalle',
    component: () => import('../../modules/kb/KbArticuloDetalleView.vue'),
  },
];
