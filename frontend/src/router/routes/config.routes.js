// Configuración: catálogos y administración del sistema.
// ConfiguracionView es el layout de pestañas; cada pestaña es una ruta
// hija (/configuracion/<seccion>) con su propio chunk, enlazable directo.
import { SECCIONES_CONFIGURACION } from '../../core/configuracion.js';

export default [
  {
    path: '/configuracion',
    component: () => import('../../modules/configuracion/ConfiguracionView.vue'),
    children: [
      {
        path: '',
        name: 'configuracion',
        // El índice se pinta en el layout. Los enlaces con tab llevan a
        // su ruta hija, incluso si se llega desde otro catálogo.
        beforeEnter: (to) => {
          const tab = to.query.tab;
          if (SECCIONES_CONFIGURACION.some((s) => s.id === tab)) {
            return { name: `configuracion-${tab}`, replace: true };
          }
        },
      },
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
        // Catálogo de servicios (107): lo lee cualquier staff, lo edita solo un JEFE (RLS).
        path: 'servicios',
        name: 'configuracion-servicios',
        component: () => import('../../modules/configuracion/ServiciosPanel.vue'),
      },
      {
        // Solo JEFE — ver guard en router/guards.js
        path: 'staff',
        name: 'configuracion-staff',
        component: () => import('../../modules/staff/StaffView.vue'),
        meta: { roles: ['jefe'], redirigirDenegado: { name: 'configuracion-empresas' } },
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
