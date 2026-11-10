// Catálogo de navegación: lo comparten Configuración y sus migas.
export const GRUPOS_CONFIGURACION = [
  {
    id: 'organizacion',
    titulo: 'Organización',
    secciones: [
      { id: 'empresas', titulo: 'Empresas', icono: 'ti ti-building', descripcion: 'Entidades a las que pertenecen las personas y los recursos.' },
      { id: 'areas-obras', titulo: 'Áreas y obras', icono: 'ti ti-building-community', descripcion: 'Áreas de trabajo y obras para clasificar al personal.' },
      { id: 'ubicaciones', titulo: 'Ubicaciones', icono: 'ti ti-map-pin', descripcion: 'Lugares donde se guardan o utilizan los equipos.' },
    ],
  },
  {
    id: 'recursos',
    titulo: 'Recursos de TI',
    secciones: [
      { id: 'plataformas', titulo: 'Plataformas', icono: 'ti ti-apps', descripcion: 'Sistemas y servicios en los que se registran cuentas.' },
      { id: 'tipos-equipo', titulo: 'Tipos de equipo', icono: 'ti ti-devices', descripcion: 'Clasificación de los equipos del inventario.' },
    ],
  },
  {
    id: 'atencion',
    titulo: 'Mesa de ayuda',
    secciones: [
      { id: 'categorias-ticket', titulo: 'Categorías de tickets', icono: 'ti ti-headset', descripcion: 'Categorías y subcategorías para clasificar solicitudes de soporte.' },
      { id: 'servicios', titulo: 'Servicios', icono: 'ti ti-server-cog', descripcion: 'Servicios de TI que se pueden asociar a los cambios.' },
    ],
  },
  {
    id: 'equipo',
    titulo: 'Equipo de TI',
    soloJefe: true,
    secciones: [
      { id: 'staff', titulo: 'Personal de TI y permisos', icono: 'ti ti-shield', descripcion: 'Miembros del equipo, roles y acceso a los módulos.' },
    ],
  },
];

export const SECCIONES_CONFIGURACION = GRUPOS_CONFIGURACION.flatMap((grupo) => grupo.secciones);
