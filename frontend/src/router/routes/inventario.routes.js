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
    // Pantalla de escritorio (plan §3.9): en móvil muestra el aviso.
    meta: { modulo: 'equipos', movil: false },
  },
  {
    // Hoja de etiquetas QR para imprimir: ?ids=a,b,c (la selección del
    // listado) o ?todos=1 con los mismos filtros del listado. Va antes de
    // `/equipos/:id` por claridad (el router ya prefiere la ruta estática).
    path: '/equipos/etiquetas',
    name: 'equipos-etiquetas',
    component: () => import('../../modules/equipos/EtiquetasEquiposView.vue'),
    meta: { modulo: 'equipos', imprimible: true, movil: false },
  },
  {
    // Hoja de vida del equipo (antes un modal del listado): expediente con URL.
    path: '/equipos/:id',
    name: 'equipo-detalle',
    component: () => import('../../modules/equipos/EquipoDetalleView.vue'),
    meta: { modulo: 'equipos', imprimible: true },
  },
  {
    // Acta de entrega o devolución imprimible (?tipo=entrega|devolucion).
    path: '/equipos/:id/acta/:asignacionId',
    name: 'equipo-acta',
    component: () => import('../../modules/equipos/ActaView.vue'),
    meta: { modulo: 'equipos', imprimible: true },
  },
];
