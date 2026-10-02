// Vocabulario del dominio Cambios (migración 107): registro mínimo de cambios en
// producción (estándar, normal y emergencia) sobre el catálogo de servicios. Único
// origen de etiquetas, tonos y reglas de lectura — mismo patrón que
// dominio-solicitudes.js.
//
// Lo que NO vive acá: qué transición acepta la base. La barrera es el servidor
// (`transiciones_cambio_permitidas` + trigger `check_transicion_cambio`);
// `TRANSICIONES_CAMBIO` es su ESPEJO para no ofrecer botones que el servidor
// rechazaría (frontend/AGENTS.md: «acciones que el servidor rechazaría no se
// ofrecen»). tests/cambios-dominio.test.js compara este espejo con las 14 filas
// sembradas en la migración, para que no se desfasen.

import {
  claseBadge,
  TONO_ESTADO_CAMBIO as TEC,
  TONO_TIPO_CAMBIO as TTC,
  TONO_RIESGO_CAMBIO as TRC,
  TONO_CRITICIDAD_SERVICIO as TCS,
} from './tonos.js';
import { formatFechaLibro } from './formatters.js';

// ── Estados, tipos, riesgos ──────────────────────────────────────────────────

export const ESTADOS_CAMBIO = {
  borrador:     { label: 'Borrador',      clase: claseBadge(TEC.borrador) },
  solicitado:   { label: 'Por aprobar',   clase: claseBadge(TEC.solicitado) },
  aprobado:     { label: 'Aprobado',      clase: claseBadge(TEC.aprobado) },
  en_ejecucion: { label: 'En ejecución',  clase: claseBadge(TEC.en_ejecucion) },
  implementado: { label: 'Implementado',  clase: claseBadge(TEC.implementado) },
  cerrado:      { label: 'Cerrado',       clase: claseBadge(TEC.cerrado) },
  rechazado:    { label: 'Rechazado',     clase: claseBadge(TEC.rechazado) },
  cancelado:    { label: 'Cancelado',     clase: claseBadge(TEC.cancelado) },
  revertido:    { label: 'Revertido',     clase: claseBadge(TEC.revertido) },
};

export const TIPOS_CAMBIO = {
  estandar:   { label: 'Estándar',   clase: claseBadge(TTC.estandar),   ayuda: 'Rutina de bajo riesgo ya autorizada: no necesita aprobación ni plan de retroceso.' },
  normal:     { label: 'Normal',     clase: claseBadge(TTC.normal),     ayuda: 'Se planifica y lo aprueba un jefe antes de ejecutarse.' },
  emergencia: { label: 'Emergencia', clase: claseBadge(TTC.emergencia), ayuda: 'Se ejecuta sin esperar aprobación; un jefe debe aprobarla dentro de 48 horas.' },
};

export const RIESGOS_CAMBIO = {
  bajo:  { label: 'Bajo',  clase: claseBadge(TRC.bajo, { rango: true }) },
  medio: { label: 'Medio', clase: claseBadge(TRC.medio, { rango: true }) },
  alto:  { label: 'Alto',  clase: claseBadge(TRC.alto, { rango: true }) },
};

export const CRITICIDADES_SERVICIO = {
  baja:    { label: 'Baja',    clase: claseBadge(TCS.baja, { rango: true }) },
  media:   { label: 'Media',   clase: claseBadge(TCS.media, { rango: true }) },
  alta:    { label: 'Alta',    clase: claseBadge(TCS.alta, { rango: true }) },
  critica: { label: 'Crítica', clase: claseBadge(TCS.critica, { rango: true }) },
};

const desconocido = (valor) => ({ label: valor, clase: 'badge--neutral' });
export const estadoCambioInfo = (v) => ESTADOS_CAMBIO[v] || desconocido(v);
export const tipoCambioInfo = (v) => TIPOS_CAMBIO[v] || desconocido(v);
export const riesgoCambioInfo = (v) => RIESGOS_CAMBIO[v] || desconocido(v);
export const criticidadServicioInfo = (v) => CRITICIDADES_SERVICIO[v] || desconocido(v);

const aOpciones = (mapa) => Object.entries(mapa).map(([valor, info]) => ({ valor, label: info.label }));
export const OPCIONES_TIPO_CAMBIO = aOpciones(TIPOS_CAMBIO);
export const OPCIONES_RIESGO_CAMBIO = aOpciones(RIESGOS_CAMBIO);
export const OPCIONES_CRITICIDAD_SERVICIO = aOpciones(CRITICIDADES_SERVICIO);

/** Plazo (horas) que tiene un jefe para aprobar una emergencia ya ejecutada. */
export const PLAZO_APROBACION_EMERGENCIA_HORAS = 48;
/** Tope de servicios vivos en el catálogo (trigger `check_tope_servicios`). */
export const MAX_SERVICIOS = 15;

// ── Vistas del listado ───────────────────────────────────────────────────────
// Cada vista es un conjunto de estados; `[]` = sin filtro. La URL guarda la
// clave (`/cambios?vista=por_aprobar`).
export const ESTADOS_DE_VISTA = {
  activos:      ['borrador', 'solicitado', 'aprobado', 'en_ejecucion', 'implementado'],
  por_aprobar:  ['solicitado'],
  en_ejecucion: ['en_ejecucion'],
  cerrados:     ['cerrado', 'rechazado', 'cancelado', 'revertido'],
  todos:        [],
};
export const VISTA_CAMBIO_DEFECTO = 'activos';

export const ETIQUETAS_VISTA = {
  activos: 'En curso',
  por_aprobar: 'Por aprobar',
  en_ejecucion: 'En ejecución',
  cerrados: 'Terminados',
  todos: 'Todos',
};

/** Estados que el servidor debe filtrar para una vista (desconocida → la de defecto). */
export function estadosDeVista(vista) {
  return ESTADOS_DE_VISTA[vista] ?? ESTADOS_DE_VISTA[VISTA_CAMBIO_DEFECTO];
}

// ── Transiciones: espejo de transiciones_cambio_permitidas ───────────────────
const TODOS = ['estandar', 'normal', 'emergencia'];

export const TRANSICIONES_CAMBIO = Object.freeze([
  { origen: 'borrador',     destino: 'solicitado',   tipos: TODOS,          soloJefe: false },
  { origen: 'borrador',     destino: 'aprobado',     tipos: ['estandar'],   soloJefe: false },
  { origen: 'borrador',     destino: 'en_ejecucion', tipos: ['emergencia'], soloJefe: false },
  { origen: 'borrador',     destino: 'cancelado',    tipos: TODOS,          soloJefe: false },
  { origen: 'solicitado',   destino: 'aprobado',     tipos: TODOS,          soloJefe: true },
  { origen: 'solicitado',   destino: 'rechazado',    tipos: TODOS,          soloJefe: true },
  { origen: 'solicitado',   destino: 'en_ejecucion', tipos: ['emergencia'], soloJefe: false },
  { origen: 'solicitado',   destino: 'cancelado',    tipos: TODOS,          soloJefe: false },
  { origen: 'aprobado',     destino: 'en_ejecucion', tipos: TODOS,          soloJefe: false },
  { origen: 'aprobado',     destino: 'cancelado',    tipos: TODOS,          soloJefe: false },
  { origen: 'en_ejecucion', destino: 'implementado', tipos: TODOS,          soloJefe: false },
  { origen: 'en_ejecucion', destino: 'revertido',    tipos: TODOS,          soloJefe: false },
  { origen: 'implementado', destino: 'cerrado',      tipos: TODOS,          soloJefe: false },
  { origen: 'implementado', destino: 'revertido',    tipos: TODOS,          soloJefe: false },
]);

export const ESTADOS_TERMINALES_CAMBIO = ['cerrado', 'rechazado', 'cancelado', 'revertido'];

/** Estados terminales que se muestran con sello en la carátula (regla 15). */
export const SELLO_CAMBIO = {
  cerrado:   { tono: 'ok',      texto: 'CERRADO' },
  rechazado: { tono: 'neutro',  texto: 'RECHAZADO' },
  cancelado: { tono: 'neutro',  texto: 'CANCELADO' },
  revertido: { tono: 'critico', texto: 'REVERTIDO' },
};

// Cómo se llama y qué pide cada salida. `nota`: null (sin campo), 'opcional' o
// 'obligatoria' (la regla del servidor: rechazar y revertir siempre; cancelar
// salvo desde borrador).
const ACCION_POR_DESTINO = {
  solicitado:   { label: 'Enviar a aprobación',        icono: 'ti-send',           nota: null },
  aprobado:     { label: 'Aprobar',                    icono: 'ti-check',          nota: 'opcional', via: 'aprobar' },
  rechazado:    { label: 'Rechazar',                   icono: 'ti-x',              nota: 'obligatoria', peligro: true, via: 'rechazar' },
  en_ejecucion: { label: 'Iniciar ejecución',          icono: 'ti-player-play',    nota: null },
  implementado: { label: 'Marcar como implementado',   icono: 'ti-circle-check',   nota: 'opcional' },
  cerrado:      { label: 'Cerrar cambio',              icono: 'ti-lock',           nota: 'opcional' },
  revertido:    { label: 'Revertir',                   icono: 'ti-arrow-back-up',  nota: 'obligatoria', peligro: true },
  cancelado:    { label: 'Cancelar cambio',            icono: 'ti-ban',            nota: 'obligatoria', peligro: true },
};

// El paso natural hacia delante en cada estado: el único botón sólido de la pantalla.
// Un estándar sale de borrador autorizado (no espera a un jefe); el resto, a aprobación.
const SIGUIENTE = {
  solicitado: ['aprobado'],
  aprobado: ['en_ejecucion'],
  en_ejecucion: ['implementado'],
  implementado: ['cerrado'],
};
function siguientesDe(cambio) {
  if (cambio.estado === 'borrador') return [cambio.tipo === 'estandar' ? 'aprobado' : 'solicitado'];
  return SIGUIENTE[cambio.estado] || [];
}

/** ¿Una emergencia ya ejecutada a la que todavía le falta la aprobación de un jefe? */
export function emergenciaSinAprobar(cambio) {
  return cambio?.tipo === 'emergencia'
    && !cambio.aprobado_por
    && ['en_ejecucion', 'implementado'].includes(cambio.estado);
}

/**
 * Acciones que el servidor aceptaría hoy para este cambio y este usuario.
 * `puedeTickets`: tiene el módulo `tickets` (permiso de todas las RPC salvo
 * aprobar/rechazar, que exigen además ser jefe).
 *
 * @returns {Array<{ id: string, destino: string|null, label: string, icono: string,
 *   nota: null|'opcional'|'obligatoria', peligro: boolean, via: 'transicionar'|'aprobar'|'rechazar',
 *   primaria: boolean }>} la primaria primero
 */
export function accionesDeCambio(cambio, { esJefe = false, puedeTickets = false } = {}) {
  if (!cambio || !puedeTickets) return [];
  const acciones = [];

  for (const t of TRANSICIONES_CAMBIO) {
    if (t.origen !== cambio.estado || !t.tipos.includes(cambio.tipo)) continue;
    if (t.soloJefe && !esJefe) continue;
    // Una emergencia sin aprobar no se cierra: el servidor lo rechaza (trigger).
    if (t.destino === 'cerrado' && emergenciaSinAprobar(cambio)) continue;

    const base = ACCION_POR_DESTINO[t.destino];
    let { label, nota } = base;
    if (t.destino === 'aprobado' && t.origen === 'borrador') label = 'Autorizar (cambio estándar)';
    if (t.destino === 'en_ejecucion' && t.origen !== 'aprobado') label = 'Ejecutar sin esperar aprobación';
    if (t.destino === 'cancelado' && t.origen === 'borrador') nota = null;

    // Autorizar un estándar desde borrador NO es aprobar_cambio (esa RPC exige jefe):
    // es una transición normal que el servidor deja pasar a cualquiera con tickets.
    const via = t.soloJefe ? base.via : 'transicionar';
    acciones.push({
      id: `${via}:${t.destino}`,
      destino: t.destino,
      label,
      icono: base.icono,
      nota,
      peligro: !!base.peligro,
      via,
      primaria: siguientesDe(cambio).includes(t.destino),
    });
  }

  // Aprobación a posteriori de una emergencia: no cambia el estado.
  if (esJefe && emergenciaSinAprobar(cambio)) {
    acciones.push({
      id: 'aprobar:posteriori',
      destino: null,
      label: 'Aprobar a posteriori',
      icono: 'ti-check',
      nota: 'opcional',
      peligro: false,
      via: 'aprobar',
      primaria: true,
    });
  }

  // Un solo botón sólido: si hay varias candidatas (p. ej. emergencia por aprobar y por
  // implementar), gana la aprobación; las demás pasan al menú.
  const primarias = acciones.filter((a) => a.primaria);
  if (primarias.length > 1) {
    const ganadora = primarias.find((a) => a.id === 'aprobar:posteriori') || primarias[0];
    for (const a of primarias) a.primaria = a === ganadora;
  }
  return acciones.sort((a, b) => Number(b.primaria) - Number(a.primaria));
}

// ── Plazo de aprobación de una emergencia ────────────────────────────────────

/**
 * @returns {null | { vencida: boolean, horas: number, texto: string }}
 *   null si el cambio no tiene aprobación pendiente con plazo.
 */
export function plazoAprobacion(cambio, ahora = Date.now()) {
  if (!cambio?.aprobacion_pendiente_hasta || cambio.aprobado_por) return null;
  const limite = new Date(cambio.aprobacion_pendiente_hasta).getTime();
  if (Number.isNaN(limite)) return null;
  const horas = Math.max(0, Math.round(Math.abs(limite - ahora) / 3600000));
  const vencida = limite < ahora;
  const unidad = horas === 1 ? 'hora' : 'horas';
  return {
    vencida,
    horas,
    texto: vencida ? `Plazo vencido hace ${horas} ${unidad}` : `Vence en ${horas} ${unidad}`,
  };
}

// ── Presentación ─────────────────────────────────────────────────────────────

/** "03/10/26 08:00 a 10:00" · "03/10/26 22:00 a 04/10/26 02:00" · "Sin ventana". */
export function textoVentana(cambio) {
  if (!cambio?.ventana_inicio || !cambio?.ventana_fin) return 'Sin ventana';
  const a = formatFechaLibro(cambio.ventana_inicio);
  const b = formatFechaLibro(cambio.ventana_fin);
  return a.fecha === b.fecha
    ? `${a.fecha} ${a.hora} a ${b.hora}`
    : `${a.fecha} ${a.hora} a ${b.fecha} ${b.hora}`;
}

/** Fecha corta de la ventana para la tabla ("03/10/26"). */
export function fechaVentana(cambio) {
  return cambio?.ventana_inicio ? formatFechaLibro(cambio.ventana_inicio).fecha : '';
}

/** Fecha de cierre del sello (cerrado, rechazado, cancelado o revertido). */
export function fechaCierreCambio(cambio) {
  if (!cambio || !ESTADOS_TERMINALES_CAMBIO.includes(cambio.estado)) return '';
  return formatFechaLibro(cambio.updated_at).fecha;
}

/** `datetime-local` (hora local, "2026-10-03T08:00") → ISO con zona, o null. */
export function localAISO(valor) {
  if (!valor) return null;
  const f = new Date(valor);
  return Number.isNaN(f.getTime()) ? null : f.toISOString();
}

/** ISO con zona → valor de un `datetime-local` en hora local. */
export function isoALocal(iso) {
  if (!iso) return '';
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return '';
  const dos = (n) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}T${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

// ── Libro de movimientos ─────────────────────────────────────────────────────

const MOVIMIENTO_EVENTO = {
  creado: 'Registrado',
  editado: 'Borrador editado',
  solicitado: 'Enviado a aprobación',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  iniciado: 'Ejecución iniciada',
  implementado: 'Implementado',
  cerrado: 'Cerrado',
  revertido: 'Revertido',
  cancelado: 'Cancelado',
  ticket_vinculado: 'Ticket enlazado',
  ticket_desvinculado: 'Ticket desenlazado',
};

/**
 * Filas de `AppLibro` (lo más reciente arriba) a partir de `cambio_eventos`.
 * El autor sale de `nombresStaff` (user_id → nombre); si no, del correo guardado
 * en el evento; un evento del sistema se escribe «Automático».
 *
 * @param {Array<object>} eventos filas de cambio_eventos (cualquier orden)
 * @param {{ nombresStaff?: Record<string,string> }} [opciones]
 */
export function armarLibroCambio(eventos = [], { nombresStaff = {} } = {}) {
  return [...eventos]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || Number(b.orden ?? 0) - Number(a.orden ?? 0))
    .map((e) => ({
      id: e.id,
      fecha: e.created_at,
      movimiento: MOVIMIENTO_EVENTO[e.evento] || e.evento,
      detalle: e.detalle || '',
      por: nombresStaff[e.user_id] || e.user_email || (e.rol_actor === 'sistema' ? 'Automático' : null),
    }));
}

// ── Aprobación, en una línea (dato «Aprobación» de la carátula) ──────────────

/**
 * Quién aprobó el cambio, o por qué todavía no: «Alejandro Guevara · 02/10/26»,
 * «Preautorizado (estándar)», «Pendiente de un jefe», «Pendiente · Vence en 31 horas».
 * @param {object} cambio
 * @param {Record<string,string>} [nombresStaff] user_id → nombre
 */
export function textoAprobacion(cambio, nombresStaff = {}) {
  if (!cambio) return '';
  if (cambio.aprobado_por) {
    const quien = nombresStaff[cambio.aprobado_por] || 'Un jefe';
    const aPosteriori = cambio.tipo === 'emergencia' && cambio.inicio_real_at && cambio.aprobado_at > cambio.inicio_real_at;
    return `${quien} · ${formatFechaLibro(cambio.aprobado_at).fecha}${aPosteriori ? ' (a posteriori)' : ''}`;
  }
  if (emergenciaSinAprobar(cambio)) {
    const plazo = plazoAprobacion(cambio);
    return plazo ? `Pendiente · ${plazo.texto}` : 'Pendiente de un jefe';
  }
  if (cambio.tipo === 'estandar' && ['aprobado', 'en_ejecucion', 'implementado', 'cerrado', 'revertido'].includes(cambio.estado)) {
    return 'Preautorizado (estándar)';
  }
  return {
    borrador: 'Sin enviar',
    solicitado: 'Pendiente de un jefe',
    rechazado: 'Rechazado por un jefe',
    cancelado: 'No llegó a aprobarse',
  }[cambio.estado] || '';
}

/** Rótulo del texto de cierre según el estado (sección «Resultado» del expediente). */
export function rotuloResultado(estado) {
  return {
    rechazado: 'Motivo del rechazo',
    cancelado: 'Motivo de la cancelación',
    revertido: 'Por qué se revirtió',
  }[estado] || 'Resultado';
}
