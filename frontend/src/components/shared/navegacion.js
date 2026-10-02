import { MODULO_POR_ID } from '../../core/modulos.js';

// Estructura de la navegación del shell: áreas → grupos → ítems.
//
// Vive en su propio módulo (V2, 2026-09-25) porque la leen DOS piezas: el
// SideNav (AppNav.vue), que la filtra por rol y módulo, y las migas de la
// barra superior de la hoja (AppLayout.vue), que solo necesitan saber en qué
// grupo y módulo está la ruta actual. Antes vivía como constante dentro de
// AppNav.vue; duplicarla en las migas la hubiera hecho divergir.
//
// Agrupada por intención de uso, no por tabla de origen (nombres decididos
// el 2026-10-01, Ciclo 21 §3.2): Inicio · Mesa de ayuda (Tickets,
// Conocimiento, Problemas) · Personas (Empleados, Encuestas) · Custodia
// (Equipos, Licencias, Correos) · Administración (Registro de actividad,
// Accesos sensibles, Configuración). Cada grupo lleva un `id` fijo, no el
// `label`. Solicitudes (migración 108) vive en Personas, entre Empleados y
// Encuestas: es el trámite de la persona (alta, baja, accesos, equipos).
//
// Los 8 ítems con `modulo` salen de `core/modulos.js` (registro único con el
// CHECK de la migración 056): acá solo se decide el orden y los extras.
//
// El nivel de Áreas está reservado para cuando el sistema crezca a dominios
// no-TI (RRHH, Finanzas — docs/PANORAMA-SISTEMA.md §6): con una sola área
// el nav no muestra encabezado de área.
//
// `soloJefe`: Registro de actividad y Accesos sensibles son EXCLUSIVOS de
// JEFE, igual que el guard real de sus rutas (`meta: { roles: ['jefe'] }`).
// El sidebar nunca es la barrera: es el reflejo de ella
// (tests/modulos-unicos.test.js compara cada ítem con el `meta` de su ruta).
// `modulo`: el ítem se oculta si el integrante no tiene ese módulo
// (migración 056) — mismo reflejo.
//
// Configuración NO es exclusiva de JEFE (6 de sus 7 pestañas están abiertas
// a cualquier staff activo; solo Staff declara su propio guard). No
// "arreglarlo" ocultándola.

// Ítem de módulo configurable, con extras propios del menú (badge…).
function itemModulo(id, extras = {}) {
  const m = MODULO_POR_ID[id];
  return { path: m.path, label: m.label, icon: m.icon, modulo: m.id, ...extras };
}

export const AREAS_NAV = [
  {
    id: 'ti',
    label: 'TI',
    grupos: [
      {
        id: 'general',
        label: '',
        items: [
          { path: '/dashboard', label: 'Inicio', icon: 'ti ti-layout-dashboard' },
        ],
      },
      {
        id: 'mesa-de-ayuda',
        label: 'Mesa de ayuda',
        items: [
          itemModulo('tickets', { badgeSinAsignar: true }),
          itemModulo('base_conocimiento'),
          itemModulo('problemas'),
        ],
      },
      {
        id: 'personas',
        label: 'Personas',
        // Solicitudes (108) usa el módulo `empleados`: no es un módulo propio
        // (el CHECK de la 056 admite 8) y su ruta declara el mismo meta.modulo.
        items: [
          itemModulo('empleados'),
          { path: '/solicitudes', label: 'Solicitudes', icon: 'ti ti-clipboard-check', modulo: 'empleados' },
          itemModulo('encuestas'),
        ],
      },
      {
        id: 'custodia',
        label: 'Custodia',
        items: [itemModulo('equipos'), itemModulo('licencias'), itemModulo('correos')],
      },
      {
        id: 'administracion',
        label: 'Administración',
        items: [
          { path: '/actividad', label: 'Registro de actividad', icon: 'ti ti-activity', soloJefe: true },
          { path: '/accesos-sensibles', label: 'Accesos sensibles', icon: 'ti ti-shield-lock', soloJefe: true },
          { path: '/configuracion', label: 'Configuración', icon: 'ti ti-settings' },
        ],
      },
    ],
  },
];

// ¿Esta ruta cae dentro del ítem? Coincide el propio path o cualquier
// sub-ruta (`/tickets/t114`, `/configuracion/empresas`), nunca un prefijo
// de texto suelto (`/ticketsX`).
function rutaDentroDe(path, base) {
  return path === base || path.startsWith(`${base}/`);
}

// Sub-rutas con nombre propio que merecen una tercera miga (las de detalle
// con `:id` no: la hoja ya muestra el nombre del registro como título).
const SUBRUTAS = {
  '/tickets/satisfaccion': 'Satisfacción',
  '/equipos/importar': 'Importar desde Excel',
};

// Migas de la barra superior para una ruta: [{ label, to? }]. El último
// elemento es la página actual (sin `to`). Sin coincidencia (portal,
// páginas de error) devuelve [].
export function migasDeRuta(path) {
  for (const area of AREAS_NAV) {
    for (const grupo of area.grupos) {
      const item = grupo.items.find((i) => rutaDentroDe(path, i.path));
      if (!item) continue;
      const migas = [];
      if (grupo.label) migas.push({ label: grupo.label });
      const sub = SUBRUTAS[path];
      if (path === item.path || !sub) {
        // En la raíz del módulo, o en un detalle: el módulo es enlace solo
        // si hay algo "debajo" de él al que volver.
        migas.push(path === item.path ? { label: item.label } : { label: item.label, to: item.path });
      } else {
        migas.push({ label: item.label, to: item.path }, { label: sub });
      }
      return migas;
    }
  }
  return [];
}
