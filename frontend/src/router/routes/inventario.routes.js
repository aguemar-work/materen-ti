// Inventario: cuentas de correo, licencias y equipos.
export default [
  {
    path: '/correos',
    name: 'correos',
    component: () => import('../../modules/correos/CorreosView.vue'),
  },
  {
    path: '/licencias',
    name: 'licencias',
    component: () => import('../../modules/licencias/LicenciasView.vue'),
  },
  {
    path: '/equipos',
    name: 'equipos',
    component: () => import('../../modules/equipos/EquiposView.vue'),
  },
];
