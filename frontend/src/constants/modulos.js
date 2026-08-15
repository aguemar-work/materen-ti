// Módulos operativos configurables por usuario (migración 056). Lista única
// de verdad: la usan AppNav.vue (para filtrar el sidebar) y la UI de gestión
// en Configuración·Staff (para el checklist por integrante). Dashboard no
// está acá porque siempre es visible (pantalla de entrada); Pre-registro,
// Actividad, Accesos sensibles y Configuración·Staff siguen exclusivos de
// JEFE vía meta.roles, no forman parte de este mecanismo.
export const MODULOS_CONFIGURABLES = [
  { id: 'tickets', label: 'Tickets' },
  { id: 'empleados', label: 'Empleados' },
  { id: 'correos', label: 'Correos' },
  { id: 'licencias', label: 'Licencias' },
  { id: 'equipos', label: 'Equipos' },
  { id: 'base_conocimiento', label: 'Base de Conocimiento' },
  { id: 'problemas', label: 'Problemas' },
  { id: 'encuestas', label: 'Encuestas' },
];
