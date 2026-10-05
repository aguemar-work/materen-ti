// Registro ÚNICO de los módulos operativos configurables por integrante del
// staff (migración 056, tabla `staff_modulos_permisos`). Antes había dos
// listas que nada sincronizaba: `constants/modulos.js` (checklist de
// Configuración·Staff) y `components/shared/navegacion.js` (sidebar); ahora
// ambas salen de acá (Ciclo 21, anexo E §1).
//
// Cada módulo dice quién es (`id`: el valor del CHECK de la base y el
// `meta.modulo` de sus rutas), cómo se llama en el menú (`label`), a dónde
// lleva (`path`), su ícono y a qué grupo del menú pertenece (`grupo`: el `id`
// del grupo en navegacion.js; nombres de grupo decididos el 2026-10-01).
//
// Fuera de esta lista, a propósito: Inicio (siempre visible), y
// Registro de actividad / Accesos sensibles / Configuración·Staff, que son
// exclusivos de JEFE por `meta.roles`. El orden es el del menú.
//
// Agregar un módulo exige, en el mismo cambio: una migración que amplíe el
// CHECK de 056, su ruta con `meta.modulo` y su fila acá —
// `tests/modulos-unicos.test.js` falla si alguna de las tres se desfasa.
export const MODULOS = [
  { id: 'tickets', label: 'Tickets', path: '/tickets', icon: 'ti ti-headset', grupo: 'mesa-de-ayuda' },
  { id: 'base_conocimiento', label: 'Conocimiento', path: '/base-conocimiento', icon: 'ti ti-books', grupo: 'mesa-de-ayuda' },
  { id: 'problemas', label: 'Problemas', path: '/problemas', icon: 'ti ti-alert-hexagon', grupo: 'mesa-de-ayuda' },
  { id: 'empleados', label: 'Empleados', path: '/empleados', icon: 'ti ti-users', grupo: 'personas' },
  { id: 'encuestas', label: 'Encuestas', path: '/encuestas', icon: 'ti ti-clipboard-list', grupo: 'personas' },
  { id: 'equipos', label: 'Equipos', path: '/equipos', icon: 'ti ti-devices', grupo: 'custodia' },
  { id: 'licencias', label: 'Licencias', path: '/licencias', icon: 'ti ti-license', grupo: 'custodia' },
  { id: 'correos', label: 'Correos', path: '/correos', icon: 'ti ti-mail-share', grupo: 'custodia' },
];

// Lo que necesita el checklist de módulos de Configuración·Staff.
export const MODULOS_CONFIGURABLES = MODULOS.map(({ id, label }) => ({ id, label }));

export const MODULO_POR_ID = Object.fromEntries(MODULOS.map((m) => [m.id, m]));
