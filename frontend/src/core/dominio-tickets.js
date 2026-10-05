// Vocabulario del dominio tickets: estados, prioridades y niveles con su
// color semántico (badge--*). Única fuente — antes había 4 copias del mapa
// de estados repartidas entre vistas.
//
// El TONO de cada estado/prioridad NO se decide acá: sale del mapa único de
// core/tonos.js (regla 24 del sistema de diseño). Este archivo solo dice qué
// etiqueta lleva cada valor.
import { claseBadge, TONO_ESTADO_TICKET as TE, TONO_PRIORIDAD as TP, TONO_TICKET_SIN_VINCULAR } from './tonos.js';

// 'resuelto' y 'cerrado' se muestran como una sola cosa para el staff
// (decisión de producto 2026-08-21): en la práctica nadie ve nunca un
// ticket parado en 'resuelto' — cerrar_ticket() (migración 051) encadena
// ambos en un solo clic — así que mostrarlos con label/color distinto solo
// generaba la pregunta de "¿en qué se diferencian?". La columna `estado`
// de la tabla sigue guardando los 2 valores reales (crear_encuesta_al_cerrar
// depende del literal 'cerrado', igual que el resto de los triggers de
// tickets) — esto es puramente la fachada que ve el staff. Ver
// OPCIONES_FILTRO_ESTADO más abajo para el filtro (que sí necesita
// colapsarlos en una sola opción, no solo un mismo label).
export const ESTADOS_TICKET = {
  abierto:     { label: 'Abierto',       clase: claseBadge(TE.abierto) },
  en_progreso: { label: 'En progreso',   clase: claseBadge(TE.en_progreso) },
  resuelto:    { label: 'Resuelto',      clase: claseBadge(TE.resuelto) },
  cerrado:     { label: 'Resuelto',      clase: claseBadge(TE.cerrado) },
  reabierto:   { label: 'Reabierto',     clase: claseBadge(TE.reabierto) },
  rechazado:   { label: 'Rechazado',     clase: claseBadge(TE.rechazado) },
};

// Ticket público sin empleado vinculado ('Sin vincular'): alguien de TI tiene
// que vincularlo, así que pide acción (ya no comparte el rojo con 'Urgente').
export const CLASE_TICKET_SIN_VINCULAR = claseBadge(TONO_TICKET_SIN_VINCULAR);

// Prioridad como RANGO ESCRITO (regla 24): baja/media/alta son neutras y solo
// 'Urgente' es roja; el orden real lo dan el reloj y la cola, no el color.
// Estado y Prioridad se pintan una junto a la otra en la misma fila: el
// modificador `badge--rango` (mayúsculas semibold) las distingue aunque ambas
// sean neutras (rechazado / baja), y por eso la clase de una prioridad nunca
// coincide con la de un estado (tests/tonos.test.js).
export const PRIORIDADES_TICKET = {
  baja:    { label: 'Baja',    clase: claseBadge(TP.baja, { rango: true }) },
  media:   { label: 'Media',   clase: claseBadge(TP.media, { rango: true }) },
  alta:    { label: 'Alta',    clase: claseBadge(TP.alta, { rango: true }) },
  urgente: { label: 'Urgente', clase: claseBadge(TP.urgente, { rango: true }) },
};

// Para selects: [{ valor, label }]
export const OPCIONES_PRIORIDAD = Object.entries(PRIORIDADES_TICKET)
  .map(([valor, v]) => ({ valor, label: v.label }));

// El orden de PRIORIDADES_TICKET (de menor a mayor) ES el ranking: derivarlo
// del mapa en vez de escribir una segunda lista evita que las dos se
// separen — el mismo tipo de deriva que ya costó varios ciclos de auditoría.
const RANGO_PRIORIDAD = Object.fromEntries(
  Object.keys(PRIORIDADES_TICKET).map((p, i) => [p, i]),
);

/**
 * Ordena tickets por urgencia real: primero la prioridad más alta y, dentro
 * de la misma prioridad, el más antiguo — el que lleva más tiempo esperando.
 *
 * Mismo criterio que el feed de pendientes del Dashboard (tier, luego días de
 * atraso). No muta el arreglo recibido.
 */
export function ordenarPorUrgencia(tickets) {
  return [...(tickets || [])].sort((a, b) => {
    // Una prioridad desconocida no debe colarse arriba: va al final.
    const ra = RANGO_PRIORIDAD[a.prioridad] ?? -1;
    const rb = RANGO_PRIORIDAD[b.prioridad] ?? -1;
    if (ra !== rb) return rb - ra;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

// Incidente/solicitud (migración 035). Sin color propio todavía: no se
// pinta como badge en ningún lado hasta que haga falta mostrarlo (bandeja,
// reporte) — acá solo el vocabulario para los selects de triage.
export const OPCIONES_TIPO = [
  { valor: 'incidente', label: 'Incidente' },
  { valor: 'solicitud', label: 'Solicitud' },
];

export const NIVELES_ATENCION = [
  { valor: 'N1', label: 'N1 — Soporte básico' },
  { valor: 'N2', label: 'N2 — Especializado' },
  { valor: 'N3', label: 'N3 — Experto / desarrollo' },
];

// Estados en los que el ticket ya está en curso: campos editables + botón Resuelto
export const ESTADOS_EN_CURSO = ['en_progreso', 'reabierto', 'resuelto'];
export const ESTADOS_TERMINALES = ['cerrado', 'rechazado'];

// Valor de filtro (no un estado real): "vigentes" = todo lo que no sea
// Resuelto (incluye 'cerrado' en la base) ni Rechazado — todo lo que
// sigue necesitando atención activa. Default de la Lista de Tickets (un
// filtro de estado nunca arranca vacío) — centralizado
// acá en vez de repetir el string literal en el store, el API y la vista.
// El WHERE real (los 3 valores excluidos) vive en queryTickets()
// (api/domains/tickets.js) — acá solo el nombre del valor de filtro.
export const ESTADO_FILTRO_VIGENTES = 'vigentes';

// Los mismos "vigentes" como lista explícita de estados reales: los filtros
// V2 del listado (2026-09-25) combinan la vista con el chip de Estado por
// intersección, y para eso hace falta el conjunto, no el nombre del filtro.
export const ESTADOS_VIGENTES = ['abierto', 'en_progreso', 'reabierto'];

// Valor centinela del chip "Asignado a" para "Sin asignar" (no es un id de
// staff): queryTickets() lo traduce a `asignado_a IS NULL`.
export const SIN_ASIGNAR = 'sin_asignar';

// Opciones del <select> de estado en la Lista de Tickets: DISTINTO de
// iterar ESTADOS_TICKET directamente, porque ese mapa tiene 'resuelto' Y
// 'cerrado' como dos claves con el mismo label ahora ("Resuelto") — un
// v-for ahí mostraría la opción duplicada. Esta lista la colapsa en una
// sola opción "Resuelto" (ver queryTickets(): filtra por
// .in('estado', ['resuelto','cerrado']), no por .eq()).
export const OPCIONES_FILTRO_ESTADO = [
  { valor: 'abierto', label: 'Abierto' },
  { valor: 'en_progreso', label: 'En progreso' },
  { valor: 'resuelto', label: 'Resuelto' },
  { valor: 'reabierto', label: 'Reabierto' },
  { valor: 'rechazado', label: 'Rechazado' },
];

export const EVENTO_LABELS = {
  creado: 'Ticket creado',
  reasignado: 'Reasignado',
  estado_cambiado: 'Cambio de estado',
  prioridad_cambiada: 'Cambio de prioridad',
  nivel_atencion_cambiado: 'Cambio de nivel de atención',
  tipo_cambiado: 'Cambio de tipo',
  encuesta_enviada: 'Encuesta enviada',
  encuesta_respondida: 'Encuesta respondida',
};

// Hitos del historial esencial (TicketDetalleView): a qué estado se
// transicionó un evento "estado_cambiado", en lenguaje de hito de
// atención (no el nombre técnico del estado).
export const HITO_LABELS = {
  en_progreso: 'Inicio de atención',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  reabierto: 'Reabierto',
  rechazado: 'Rechazado',
};

// Los triggers registran los cambios de estado/prioridad como 'De "x" a "y"'
// (evento_ticket_cambios, migración 035). Esta es la ÚNICA función que conoce
// ese formato: si el texto del trigger cambia, se arregla acá y no en cada
// vista ni en el reporte.
export function destinoDeCambio(detalle) {
  return /a "(\w+)"\s*$/.exec(String(detalle || ''))?.[1] || null;
}

// ── Aviso al solicitante por categoría / subcategoría (migración 114) ──────
// Tope de la columna `aviso` (CHECK en la base): el contador del formulario de
// Configuración y el maxlength del textarea salen de acá, no de un literal.
export const AVISO_CATEGORIA_MAX = 600;

/**
 * Aviso que corresponde mostrar al elegir una categoría y, opcionalmente, una
 * subcategoría: gana el de la subcategoría; si no tiene, el de la categoría;
 * si ninguna tiene, ''. ÚNICA implementación de la regla (la cabecera de la
 * migración 114 la documenta; la edge function `catalogo` solo devuelve los
 * dos textos crudos). Acepta objetos nulos y avisos en blanco.
 */
export function resolverAvisoCategoria(categoria, subcategoria) {
  const limpio = (v) => String(v ?? '').trim();
  return limpio(subcategoria?.aviso) || limpio(categoria?.aviso);
}

export function estadoInfo(e) {
  return ESTADOS_TICKET[e] || { label: e, clase: 'badge--neutral' };
}

export function prioridadInfo(p) {
  return PRIORIDADES_TICKET[p] || { label: p, clase: 'badge--neutral' };
}
