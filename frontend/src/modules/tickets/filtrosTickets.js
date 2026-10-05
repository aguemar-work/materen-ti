// Filtros V2 del listado de Tickets (2026-09-25). Lógica pura, sin Vue: qué
// vistas hay, qué chips admite cada una y cómo se traduce todo a los
// parámetros de queryTickets() (api/domains/tickets.js).
//
// Regla de coherencia (pedido del dueño, 2026-09-25): las pestañas responden
// UNA sola pregunta — en qué estado está el ticket — y "Todos" va primero,
// igual que en el resto de los módulos. La primera versión mezclaba dos
// criterios en la misma fila (responsable: "Nuevos", "Mis tickets"; estado:
// "Pendientes", "Resueltos") con "Todos" al final; eso se retiró. El
// responsable es un chip ("Asignado a": Usted · Sin asignar · técnicos).
//
//   - VISTAS: Todos · Pendientes (por defecto) · Resueltos · Rechazados.
//   - CHIPS: dimensiones independientes que se suman bajo demanda. El chip
//     de Estado solo ofrece lo que cabe en la vista (`dimensionesDe`) y, si
//     ya estaba puesto, se poda al cambiar de vista (`podarChips`) — nunca
//     queda una combinación imposible que devuelva cero filas sin explicación.
import { ESTADOS_VIGENTES, SIN_ASIGNAR, OPCIONES_TIPO, NIVELES_ATENCION } from '../../core/dominio-tickets.js';

export const VISTA_DEFECTO = 'pendientes';

// Valor del chip "Asignado a" para el usuario en sesión: en la URL queda
// `?asignado=yo`, así el mismo enlace sirve a cualquier técnico ("lo mío").
export const ASIGNADO_YO = 'yo';

export const VISTAS_TICKETS = [
  { valor: 'todos', label: 'Todos', titulo: 'Cualquier estado', frase: 'en total', estados: null },
  { valor: 'pendientes', label: 'Pendientes', titulo: 'Abiertos, en progreso o reabiertos', frase: 'pendientes', estados: ESTADOS_VIGENTES },
  { valor: 'resueltos', label: 'Resueltos', titulo: 'Resueltos y cerrados', frase: 'resueltos', estados: ['resuelto'] },
  { valor: 'rechazados', label: 'Rechazados', titulo: 'Descartados sin atención', frase: 'rechazados', estados: ['rechazado'] },
];

// Enlaces y recuerdos de la primera versión (?vista=nuevos|mios): se
// traducen a la vista + chip equivalentes en vez de caer en "Todos".
export const VISTAS_ANTERIORES = {
  nuevos: { vista: 'pendientes', asignado: [SIN_ASIGNAR] },
  mios: { vista: 'pendientes', asignado: [ASIGNADO_YO] },
};

const vistaDe = (valor) => VISTAS_TICKETS.find((v) => v.valor === valor) || vistaDe(VISTA_DEFECTO);

// Estado: solo los que caben dentro de la vista. En "Resueltos" y
// "Rechazados" (un solo estado) no hay nada que refinar.
const OPCIONES_ESTADO = [
  { valor: 'abierto', label: 'Abierto' },
  { valor: 'en_progreso', label: 'En progreso' },
  { valor: 'reabierto', label: 'Reabierto' },
  { valor: 'resuelto', label: 'Resuelto' },
  { valor: 'rechazado', label: 'Rechazado' },
];

// De más a menos urgente: el orden en que se lee una cola.
const OPCIONES_PRIORIDAD = [
  { valor: 'urgente', label: 'Crítica' }, // el valor sigue siendo `urgente` (116)
  { valor: 'alta', label: 'Alta' },
  { valor: 'media', label: 'Media' },
  { valor: 'baja', label: 'Baja' },
];

const OPCIONES_SOLICITANTE = [
  { valor: 'si', label: 'Vinculado a un empleado' },
  { valor: 'no', label: 'Sin vincular' },
];

export const CLAVES_CHIPS = ['estado', 'asignado', 'prioridad', 'categoria', 'tipo', 'nivel', 'solicitante'];

function opcionesEstado(vista) {
  const { estados } = vistaDe(vista);
  if (!estados) return OPCIONES_ESTADO;
  if (estados.length < 2) return [];
  return OPCIONES_ESTADO.filter((o) => estados.includes(o.valor));
}

/**
 * Dimensiones de AppFiltros para la vista activa.
 * @param {string} vista
 * @param {{ staff: {user_id:string,nombre:string}[], categorias: {id:string,nombre:string}[], yo: string }} catalogos
 */
export function dimensionesDe(vista, { staff = [], categorias = [], yo = '' } = {}) {
  const dims = [];
  const estados = opcionesEstado(vista);
  if (estados.length) dims.push({ id: 'estado', label: 'Estado', icono: 'ti ti-progress', opciones: estados });
  // "Usted" primero y "Sin asignar" después: son las dos preguntas diarias
  // (lo mío, lo que nadie tomó); luego el resto del equipo.
  dims.push(
    {
      id: 'asignado', label: 'Asignado a', icono: 'ti ti-user',
      opciones: [
        { valor: ASIGNADO_YO, label: 'Usted' },
        { valor: SIN_ASIGNAR, label: 'Sin asignar' },
        ...staff.filter((s) => s.user_id !== yo).map((s) => ({ valor: s.user_id, label: s.nombre })),
      ],
    },
    { id: 'prioridad', label: 'Prioridad', icono: 'ti ti-flag', opciones: OPCIONES_PRIORIDAD },
    { id: 'categoria', label: 'Categoría', icono: 'ti ti-category', opciones: categorias.map((c) => ({ valor: c.id, label: c.nombre })) },
    { id: 'tipo', label: 'Tipo', icono: 'ti ti-tag', opciones: OPCIONES_TIPO },
    { id: 'nivel', label: 'Nivel', icono: 'ti ti-stairs', opciones: NIVELES_ATENCION.map((n) => ({ valor: n.valor, label: n.valor })) },
    { id: 'solicitante', label: 'Solicitante', icono: 'ti ti-user-question', opciones: OPCIONES_SOLICITANTE },
    // Rango de fechas (AppFiltros tipo 'rango'); en la URL, desde/hasta.
    { id: 'creado', label: 'Creado', icono: 'ti ti-calendar', tipo: 'rango' },
  );
  return dims;
}

/**
 * Quita de los chips lo que la vista no admite (hoy, solo estados fuera de
 * la vista). Devuelve un objeto nuevo solo con las claves de CLAVES_CHIPS.
 */
export function podarChips(vista, chips) {
  const salida = Object.fromEntries(CLAVES_CHIPS.map((k) => [k, [...(chips[k] || [])]]));
  const permitidos = opcionesEstado(vista).map((o) => o.valor);
  salida.estado = salida.estado.filter((e) => permitidos.includes(e));
  return salida;
}

/**
 * Parámetros de queryTickets() para una vista + chips + búsqueda/fecha.
 * @param {{ vista: string, chips: object, q?: string, desde?: string, hasta?: string }} f
 * @param {string} yo  user_id del staff en sesión
 */
export function paramsServidor({ vista, chips, q = '', desde = '', hasta = '' }, yo) {
  const def = vistaDe(vista);
  const c = podarChips(vista, chips);
  const estados = c.estado.length ? c.estado : (def.estados || []);
  // "Usted" sin sesión resuelta: un id imposible devuelve cero filas en vez
  // de caer en "todos los técnicos".
  const asignados = c.asignado.map((a) => (a === ASIGNADO_YO ? yo || '00000000-0000-0000-0000-000000000000' : a));
  const solicitante = c.solicitante;
  return {
    q,
    estados,
    asignados,
    prioridades: c.prioridad,
    categoriaIds: c.categoria,
    tipos: c.tipo,
    niveles: c.nivel,
    vinculado: solicitante.length === 1 ? solicitante[0] : '',
    fechaDesde: desde,
    fechaHasta: hasta,
  };
}

export { vistaDe };
