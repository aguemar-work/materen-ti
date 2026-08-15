// Inventario: cuentas de correo, licencias y equipos.
export default [
  {
    path: '/correos',
    name: 'correos',
    component: () => import('../../modules/correos/CorreosView.vue'),
    meta: { modulo: 'correos' },
  },
  {
    path: '/licencias',
    name: 'licencias',
    component: () => import('../../modules/licencias/LicenciasView.vue'),
    meta: { modulo: 'licencias' },
  },
  {
    path: '/equipos',
    name: 'equipos',
    component: () => import('../../modules/equipos/EquiposView.vue'),
    meta: { modulo: 'equipos' },
  },
  {
    path: '/equipos/importar',
    name: 'equipos-importar',
    component: () => import('../../modules/equipos/ImportarEquiposView.vue'),
    meta: { modulo: 'equipos' },
  },
];
