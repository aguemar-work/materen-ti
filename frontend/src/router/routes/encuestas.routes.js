// Encuestas (staff): crear/editar plantillas es solo JEFE (RLS lo exige),
// ver resultados es de cualquier staff.
export default [
  {
    path: '/encuestas',
    name: 'encuestas',
    component: () => import('../../modules/encuestas/EncuestasView.vue'),
    meta: { modulo: 'encuestas' },
  },
  {
    path: '/encuestas/:id',
    name: 'encuesta-detalle',
    component: () => import('../../modules/encuestas/EncuestaDetalleView.vue'),
    meta: { modulo: 'encuestas' },
  },
];
