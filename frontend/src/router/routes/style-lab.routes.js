// Style Lab — preview aislado de propuestas visuales (ver
// modules/styleLab/StyleLabView.vue). Solo se registra en desarrollo (ver
// spread condicional en router/index.js detrás de import.meta.env.DEV),
// mismo criterio que design-system.routes.js / ticket-panel-preview.routes.js:
// en un build de producción esta ruta ni siquiera existe. Sigue exigiendo
// sesión de staff (no lleva meta.public) igual que el resto del panel.
//
// Nota (2026-09-07): esta ruta no estaba registrada — el componente existía
// pero /style-lab no llevaba a ningún lado (los otros dos comentarios de
// "mismo criterio que style-lab.routes.js" en el router ya asumían que este
// archivo existía). Se restaura acá para poder verificar en el navegador el
// catálogo de AppButton/AppTable agregado en esta misma sesión.
export default [
  {
    path: '/style-lab',
    name: 'style-lab',
    component: () => import('../../modules/styleLab/StyleLabView.vue'),
  },
];
