// Reportes: el ÚNICO lugar donde se reporta o se exporta (migraciones 115 y
// 117, encargo del dueño 2026-10-05). /reportes es el índice por área con los
// reportes que el usuario puede ver; cada reporte es su propia hoja imprimible
// en /reportes/<id>, protegida con el MISMO permiso que exige su RPC
// (core/reportes.js): `meta.modulo` del módulo fuente o `meta.roles` para la
// auditoría. El índice se abre con cualquiera de esos módulos (o siendo JEFE).
import { REPORTES, MODULOS_CON_REPORTE, rutaReporte } from '../../core/reportes.js';

const VISTA_PROPIA = {
  tickets: () => import('../../modules/reportes/ReporteTicketsView.vue'),
  satisfaccion: () => import('../../modules/reportes/ReporteSatisfaccionView.vue'),
};
const generica = () => import('../../modules/reportes/ReporteGenericoView.vue');

export default [
  {
    path: '/reportes',
    name: 'reportes',
    component: () => import('../../modules/reportes/ReportesIndiceView.vue'),
    meta: { algunModulo: MODULOS_CON_REPORTE },
    // Enlaces guardados del reporte de tickets de la 115 (/reportes?tipo=…&desde=…).
    beforeEnter: (to) => (to.query.desde || to.query.tipo ? { path: rutaReporte('tickets'), query: to.query } : true),
  },
  ...REPORTES.map((r) => ({
    path: rutaReporte(r.id),
    name: `reporte-${r.id}`,
    component: VISTA_PROPIA[r.id] || generica,
    props: VISTA_PROPIA[r.id] ? false : { reporteId: r.id },
    meta: r.rol ? { roles: [r.rol] } : { modulo: r.modulo },
  })),
];
