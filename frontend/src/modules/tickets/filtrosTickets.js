// Filtros V2 del listado de Tickets (2026-09-25). Lógica pura, sin Vue: qué
// vistas hay, qué chips admite cada una y cómo se traduce todo a los
// parámetros de queryTickets() (api/domains/tickets.js).
//
// Modelo anterior (retirado): 4 "bandejas" y, según la bandeja, un segundo
// segmentado de estado (Todos · En progreso · Resuelto · Rechazados) y a
// veces un select de técnico. Los controles aparecían y desaparecían al
// cambiar de bandeja, "Todos" significaba dos cosas en la misma fila y no
// había forma de filtrar por prioridad, categoría, tipo o nivel.
//
// Modelo V2, el mismo que Empleados y Equipos:
//   - VISTAS: una sola fila fija de pestañas exclusivas con conteo. Cada una
//     responde una pregunta de trabajo ("¿qué entró sin dueño?", "¿qué tengo
//     yo?", "¿qué sigue pendiente?", "¿qué se resolvió?").
//   - CHIPS: dimensiones independientes que se suman bajo demanda. La vista
//     fija parte del filtro (estado y/o responsable); un chip que choque con
//     ella no se ofrece (`dimensionesDe`) y, si ya estaba puesto, se poda al
//     cambiar de vista (`podarChips`) — nunca queda una combinación imposible
//     que devuelva cero filas sin explicación.
import { ESTADOS_VIGENTES, SIN_ASIGNAR, OPCIONES_TIPO, NIVELES_ATENCION } from '../../core/dominio-tickets.js';

export const VISTA_DEFECTO = 'nuevos';

export const VISTAS_TICKETS = [
  { valor: 'nuevos', label: 'Nuevos', titulo: 'Vigentes sin técnico asignado', frase: 'nuevos, sin técnico asignado', estados: ESTADOS_VIGENTES, asignado: 'sin' },
  { valor: 'mios', label: 'Mis tickets', titulo: 'Vigentes asignados a usted', frase: 'vigentes asignados a usted', estados: ESTADOS_VIGENTES, asignado: 'yo' },
  { valor: 'pendientes', label: 'Pendientes', titulo: 'Todo lo vigente, de cualquier técnico', frase: 'pendientes de todo el equipo', estados: ESTADOS_VIGENTES },
  { valor: 'resueltos', label: 'Resueltos', titulo: 'Resueltos y cerrados', frase: 'resueltos', estados: ['resuelto'] },
  { valor: 'todos', label: 'Todos', titulo: 'Cualquier estado, incluidos los rechazados', frase: 'en total', estados: null },
];

const vistaDe = (valor) => VISTAS_TICKETS.find((v) => v.valor === valor) || VISTAS_TICKETS[0];

// Estado: solo los que caben dentro de la vista. En "Nuevos" (un ticket sin
// técnico solo puede estar abierto) y "Resueltos" no hay nada que refinar.
const OPCIONES_ESTADO = [
  { valor: 'abierto', label: 'Abierto' },
  { valor: 'en_progreso', label: 'En progreso' },
  { valor: 'reabierto', label: 'Reabierto' },
  { valor: 'resuelto', label: 'Resuelto' },
  { valor: 'rechazado', label: 'Rechazado' },
];

// De más a menos urgente: el orden en que se lee una cola.
const OPCIONES_PRIORIDAD = [
  { valor: 'urgente', label: 'Urgente' },
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
  if (vistaDe(vista).asignado === 'sin' || estados.length < 2) return [];
  return OPCIONES_ESTADO.filter((o) => estados.includes(o.valor));
}

/**
 * Dimensiones de AppFiltros para la vista activa.
 * @param {string} vista
 * @param {{ staff: {user_id:string,nombre:string}[], categorias: {id:string,nombre:string}[], yo: string }} catalogos
 */
export function dimensionesDe(vista, { staff = [], categorias = [], yo = '' } = {}) {
  const def = vistaDe(vista);
  const dims = [];
  const estados = opcionesEstado(vista);
  if (estados.length) dims.push({ id: 'estado', label: 'Estado', icono: 'ti ti-progress', opciones: estados });
  if (!def.asignado) {
    // El propio usuario primero: "lo mío dentro de Resueltos" es el filtro
    // más común de esta dimensión.
    const propios = staff.filter((s) => s.user_id === yo).map((s) => ({ valor: s.user_id, label: `${s.nombre} (usted)` }));
    const resto = staff.filter((s) => s.user_id !== yo).map((s) => ({ valor: s.user_id, label: s.nombre }));
    dims.push({
      id: 'asignado', label: 'Asignado a', icono: 'ti ti-user',
      opciones: [...propios, { valor: SIN_ASIGNAR, label: 'Sin asignar' }, ...resto],
    });
  }
  dims.push(
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
 * Quita de los chips lo que la vista ya decide o no admite.
 * Devuelve un objeto nuevo solo con las claves de CLAVES_CHIPS.
 */
export function podarChips(vista, chips) {
  const def = vistaDe(vista);
  const salida = Object.fromEntries(CLAVES_CHIPS.map((k) => [k, [...(chips[k] || [])]]));
  const permitidos = opcionesEstado(vista).map((o) => o.valor);
  salida.estado = salida.estado.filter((e) => permitidos.includes(e));
  if (def.asignado) salida.asignado = [];
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
  let asignados = c.asignado;
  if (def.asignado === 'sin') asignados = [SIN_ASIGNAR];
  // Sin sesión resuelta no hay "mío": un id imposible devuelve cero filas en
  // vez de caer en "todos los técnicos".
  else if (def.asignado === 'yo') asignados = [yo || '00000000-0000-0000-0000-000000000000'];
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
