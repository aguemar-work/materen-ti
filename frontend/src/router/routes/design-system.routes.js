// Style guide interno — solo se registra en desarrollo (ver spread
// condicional en router/index.js detrás de import.meta.env.DEV). En un
// build de producción esta ruta ni siquiera existe: /design-system cae en
// el catch-all (404), no queda expuesta ni indexable. Sigue exigiendo
// sesión de staff (no lleva meta.public) igual que el resto del panel.
export default [
  {
    path: '/design-system',
    name: 'design-system',
    component: () => import('../../modules/designSystem/DesignSystemView.vue'),
  },
];
