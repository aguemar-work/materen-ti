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
// que vincularlo, así que pide acción (ya no comparte el rojo con 'Crítica').
export const CLASE_TICKET_SIN_VINCULAR = claseBadge(TONO_TICKET_SIN_VINCULAR);

// Prioridad como RANGO ESCRITO (regla 24): baja/media/alta son neutras y solo
// la máxima es roja; el orden real lo dan el reloj y la cola, no el color.
// La máxima se ESCRIBE «Crítica» en toda la interfaz (catálogo v2, migración
// 116) pero el valor en la base sigue siendo `urgente` (CHECK de tickets y de
// subcategorias_ticket.prioridad_sugerida): ningún filtro, URL ni RPC cambia.
// Estado y Prioridad se pintan una junto a la otra en la misma fila: el
// modificador `badge--rango` (mayúsculas semibold) las distingue aunque ambas
// sean neutras (rechazado / baja), y por eso la clase de una prioridad nunca
// coincide con la de un estado (tests/tonos.test.js).
export const PRIORIDADES_TICKET = {
  baja:    { label: 'Baja',    clase: claseBadge(TP.baja, { rango: true }) },
  media:   { label: 'Media',   clase: claseBadge(TP.media, { rango: true }) },
  alta:    { label: 'Alta',    clase: claseBadge(TP.alta, { rango: true }) },
  urgente: { label: 'Crítica', clase: claseBadge(TP.urgente, { rango: true }) },
};

// Para selects: [{ valor, label }]
export const OPCIONES_PRIORIDAD = Object.entries(PRIORIDADES_TICKET)
  .map(([valor, v]) => ({ valor, label: v.label }));

// Prioridad de un ticket nuevo cuando la subcategoría no sugiere ninguna (o no
// hay subcategoría): la misma que aplica crear_ticket_publico (116).
export const PRIORIDAD_POR_DEFECTO = 'media';

/**
 * Prioridad inicial que corresponde a una subcategoría del catálogo:
 * `prioridad_sugerida` si es un valor conocido; si no, media. Precarga el
 * selector del formulario interno; la que vale al crear la fija el servidor
 * con la misma regla.
 */
export function prioridadSugeridaDe(subcategoria) {
  const p = subcategoria?.prioridad_sugerida;
  return p && PRIORIDADES_TICKET[p] ? p : PRIORIDAD_POR_DEFECTO;
}

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

// Política de la mesa de ayuda (migración 121): N1 lo atiende Soporte, N2 el
// especialista interno (Redes) y N3 un especialista interno o externo
// (experto, desarrollo, proveedor, garantía).
export const NIVELES_ATENCION = [
  { valor: 'N1', label: 'N1 — Soporte básico' },
  { valor: 'N2', label: 'N2 — Especializado' },
  { valor: 'N3', label: 'N3 — Especialista (interno o externo)' },
];

export function nivelAtencionLabel(nivel) {
  return NIVELES_ATENCION.find((n) => n.valor === nivel)?.label || '';
}

/**
 * Nivel que precarga Iniciar: el `nivel_sugerido` de la subcategoría si es
 * conocido (migración 121); si no, N1.
 */
export function nivelSugeridoDe(subcategoria) {
  const n = subcategoria?.nivel_sugerido;
  return NIVELES_ATENCION.some((x) => x.valor === n) ? n : 'N1';
}

// Lo que ve el solicitante en su seguimiento. Duplica nivel_atencion_publico()
// de la migración 121 (texto del comentario público): si cambia, en los dos.
export const NIVEL_PUBLICO = {
  N1: 'Nivel 1 – Soporte',
  N2: 'Nivel 2 – Especializado',
  N3: 'Nivel 3 – Especialista',
};

// ── Escalamiento (migración 121) ───────────────────────────────────────────
// Tipo de especialista del Nivel 3 (CHECK de ticket_escalamientos).
export const ESPECIALISTA_TIPOS = [
  { valor: 'experto_interno', label: 'Experto interno' },
  { valor: 'desarrollo', label: 'Desarrollo' },
  { valor: 'proveedor', label: 'Proveedor' },
  { valor: 'garantia', label: 'Garantía del fabricante' },
  { valor: 'otro', label: 'Otro' },
];

export function especialistaTipoLabel(tipo) {
  return ESPECIALISTA_TIPOS.find((t) => t.valor === tipo)?.label || '';
}

// Topes que también valida el servidor (P0001 en las RPC de la 121).
export const MOTIVO_ESCALAR_MAX = 1000;
export const NOTA_AVANCE_MAX = 1000;
export const ESPECIALISTA_NOMBRE_MAX = 120;
export const REFERENCIA_EXTERNA_MAX = 80;

/** Rango del nivel (sin nivel = N1), para escalar hacia arriba y devolver hacia abajo. */
export function rangoNivel(nivel) {
  return { N1: 1, N2: 2, N3: 3 }[nivel || 'N1'] || 1;
}

/** Niveles a los que se puede escalar desde `actual` (siempre por encima; nunca N1). */
export function nivelesParaEscalar(actual) {
  return NIVELES_ATENCION.filter((n) => n.valor !== 'N1' && rangoNivel(n.valor) > rangoNivel(actual));
}

/** Niveles a los que se puede devolver desde `actual` (siempre por debajo). */
export function nivelesParaDevolver(actual) {
  return NIVELES_ATENCION.filter((n) => rangoNivel(n.valor) < rangoNivel(actual));
}

/**
 * Fecha estimada vencida: anterior a hoy (fecha local del navegador, en el
 * formato `AAAA-MM-DD` de la columna date). Misma regla que
 * `escalados_vencidos` de dashboard_resumen (que usa la hora de Lima).
 */
export function fechaEstimadaVencida(fecha, hoy = new Date()) {
  if (!fecha) return false;
  const h = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  return String(fecha).slice(0, 10) < h;
}

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
  categoria_cambiada: 'Reclasificado',
  escalado: 'Escalado',
  nivel_devuelto: 'Devuelto de nivel',
  escalamiento_actualizado: 'Avance del escalamiento',
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

// Escalar y devolver de nivel (migración 121) escriben 'De "N1" a "N2".
// Motivo: …' (y, en N3, ' Especialista: …'): el destino ya no va al final, así
// que destinoDeCambio no sirve. `resto` es el texto después del cambio.
export function partesCambioNivel(detalle) {
  const m = /^De "(\w+)" a "(\w+)"\.?\s*([\s\S]*)$/.exec(String(detalle || ''));
  return m ? { desde: m[1], hacia: m[2], resto: m[3].trim() } : null;
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

// ── Tickets por reclasificar (catálogo v2, migración 116) ──────────────────
// Por qué un ticket aparece en v_tickets_por_reclasificar (columna `motivo`).
export const MOTIVOS_RECLASIFICAR = {
  sin_subcategoria: 'Sin subcategoría',
  no_clasificado: 'Otro (no clasificado)',
  seguridad_legado: 'Seguridad anterior: virus o respaldo',
};
// Tope del motivo (lo valida también reclasificar_ticket_nucleo, P0001).
export const MOTIVO_RECLASIFICAR_MAX = 500;

export function estadoInfo(e) {
  return ESTADOS_TICKET[e] || { label: e, clase: 'badge--neutral' };
}

export function prioridadInfo(p) {
  return PRIORIDADES_TICKET[p] || { label: p, clase: 'badge--neutral' };
}
