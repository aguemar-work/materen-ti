// Configuración: catálogos y administración del sistema.
// ConfiguracionView es el layout de pestañas; cada pestaña es una ruta
// hija (/configuracion/<seccion>) con su propio chunk, enlazable directo.
const SECCIONES = [
  'empresas',
  'areas-obras',
  'plataformas',
  'tipos-equipo',
  'ubicaciones',
  'categorias-ticket',
  'staff',
];

export default [
  {
    path: '/configuracion',
    name: 'configuracion',
    component: () => import('../../modules/configuracion/ConfiguracionView.vue'),
    // Compat: los enlaces viejos /configuracion?tab=<seccion> caen en su
    // ruta hija; sin tab (o tab desconocido), a la primera pestaña.
    redirect: (to) => {
      const tab = SECCIONES.includes(to.query.tab) ? to.query.tab : 'empresas';
      return { name: `configuracion-${tab}`, query: {} };
    },
    children: [
      {
        path: 'empresas',
        name: 'configuracion-empresas',
        component: () => import('../../modules/empresas/EmpresasView.vue'),
      },
      {
        path: 'areas-obras',
        name: 'configuracion-areas-obras',
        component: () => import('../../modules/configuracion/AreasObrasPanel.vue'),
      },
      {
        path: 'plataformas',
        name: 'configuracion-plataformas',
        component: () => import('../../modules/plataformas/PlataformasView.vue'),
      },
      {
        path: 'tipos-equipo',
        name: 'configuracion-tipos-equipo',
        component: () => import('../../modules/configuracion/TiposEquipoPanel.vue'),
      },
      {
        path: 'ubicaciones',
        name: 'configuracion-ubicaciones',
        component: () => import('../../modules/configuracion/UbicacionesPanel.vue'),
      },
      {
        path: 'categorias-ticket',
        name: 'configuracion-categorias-ticket',
        component: () => import('../../modules/configuracion/CategoriasTicketPanel.vue'),
      },
      {
        // Solo JEFE — ver guard en router/guards.js
        path: 'staff',
        name: 'configuracion-staff',
        component: () => import('../../modules/staff/StaffView.vue'),
      },
    ],
  },
  // Rutas antiguas → su pestaña dentro de Configuración
  {
    path: '/empresas',
    name: 'configuracion-empresas-legacy',
    redirect: { name: 'configuracion-empresas' },
  },
  {
    path: '/plataformas',
    name: 'configuracion-plataformas-legacy',
    redirect: { name: 'configuracion-plataformas' },
  },
  {
    path: '/staff',
    name: 'configuracion-staff-legacy',
    redirect: { name: 'configuracion-staff' },
  },
];
