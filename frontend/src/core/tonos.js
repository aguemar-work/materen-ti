// Mapa semántico ÚNICO de tonos (plan de mejora Ciclo 21, §3.8; regla 24 de
// docs/SISTEMA-DISENO.md, "Versión Expediente").
//
// El tono dice QUÉ TIENE QUE HACER quien lo lee, no de qué entidad es:
//
//   accion      amber    requiere acción de TI
//   trabajando  sky      TI está trabajando en ello
//   espera      violet   se espera a un tercero (empleado, proveedor)
//   ok          green    terminado bien / vigente
//   neutro      gray     terminal neutro o inactivo
//   critico     red      pérdida, vencimiento o urgencia
//   categoria   teal     categoría, NO estado (tipo de cuenta, nivel, tipo...)
//
// Son los seis colores de la paleta + el neutro: no hay tono nuevo ni variable
// nueva en el @theme. Fondo `-50`, texto `-800` (neutro: `gray-100` + `gray-700`).
//
// Este módulo es una HOJA: no importa nada. Los `core/dominio-*.js` lo importan
// para asignar cada uno de sus estados a un tono; `AppTag`, `AppSello`,
// `BadgeEstado` y las vistas lo consumen para dibujar. Un estado nuevo se
// agrega acá Y en su dominio; `tests/tonos.test.js` falla si alguno queda sin
// tono (el fallback gris existe para valores desconocidos de la base, no para
// estados que el código ya conoce).
//
// Colisión estado ↔ prioridad: prioridad `baja/media/alta` es neutra (igual
// que `rechazado`) y `urgente` es roja. Lo que las separa es la TIPOGRAFÍA
// (`rango`: mayúsculas semibold con tracking, ver `claseBadge()`), no el color;
// el orden real lo da el reloj y la cola, no el tinte.

/** Tono al que cae un valor que el código no conoce. */
export const TONO_POR_DEFECTO = 'neutro';

/**
 * Definición visual de cada tono.
 *  - `tag`: clases del `AppTag` (fondo tenue, sin borde).
 *  - `sello`: clases del `AppSello` (solo borde, sin fondo). Solo los tres
 *    tonos que un sello puede tener (regla 15): terminal neutro, conforme,
 *    rechazado/perdido.
 *  - `apptag`: nombre histórico del tono en `AppTag`/`core/tagRol.js`
 *    (`badge--<apptag>`). Se conserva para no romper a quien ya lo usa.
 */
export const TONOS = Object.freeze({
  accion: {
    etiqueta: 'Requiere acción',
    significado: 'Requiere acción de TI',
    apptag: 'warning',
    tag: 'bg-amber-50 text-amber-800',
  },
  trabajando: {
    etiqueta: 'En trabajo',
    significado: 'TI está trabajando en ello',
    apptag: 'sky',
    tag: 'bg-sky-50 text-sky-800',
  },
  espera: {
    etiqueta: 'En espera',
    significado: 'Se espera a un tercero',
    apptag: 'purple',
    tag: 'bg-violet-50 text-violet-800',
  },
  ok: {
    etiqueta: 'Terminado',
    significado: 'Terminado bien o vigente',
    apptag: 'success',
    tag: 'bg-green-50 text-green-800',
    sello: 'border-green-700 text-green-800',
  },
  neutro: {
    etiqueta: 'Neutro',
    significado: 'Terminal neutro o inactivo',
    apptag: 'neutral',
    tag: 'bg-gray-100 text-gray-700',
    sello: 'border-gray-500 text-gray-700',
  },
  critico: {
    etiqueta: 'Crítico',
    significado: 'Pérdida, vencimiento o urgencia',
    apptag: 'danger',
    tag: 'bg-red-50 text-red-800',
    sello: 'border-red-700 text-red-800',
  },
  categoria: {
    etiqueta: 'Categoría',
    significado: 'Categoría, no estado',
    apptag: 'teal',
    tag: 'bg-teal-50 text-teal-800',
  },
});

export const NOMBRES_TONO = Object.freeze(Object.keys(TONOS));

// Nombre histórico de AppTag → tono semántico (y de vuelta). `info` (azul de
// marca) NO es un tono de estado: el azul es tinta (regla 17). Sigue aceptado
// por AppTag para no romper a quien lo pase, pero ningún dominio lo usa.
const DE_APPTAG = Object.freeze(
  Object.fromEntries(Object.entries(TONOS).map(([nombre, t]) => [t.apptag, nombre])),
);
const CLASES_INFO_LEGADO = 'bg-primary-50 text-primary-700';

/** ¿Es un tono semántico (`accion`, `ok`...)? */
export function esTono(valor) {
  return Object.hasOwn(TONOS, valor);
}

/**
 * Cualquier nombre de tono (semántico `ok` o histórico `success`) → tono
 * semántico. Lo desconocido cae a `neutro`.
 */
export function normalizarTono(valor) {
  if (esTono(valor)) return valor;
  return DE_APPTAG[valor] ?? TONO_POR_DEFECTO;
}

/** Nombre histórico de AppTag de un tono semántico (`ok` → `success`). */
export function tonoAppTag(tono) {
  return TONOS[normalizarTono(tono)].apptag;
}

/**
 * Clases de fondo + texto de un tag para cualquier nombre de tono.
 * `info` (legado) devuelve el azul tenue de siempre.
 */
export function clasesTag(valor) {
  if (valor === 'info') return CLASES_INFO_LEGADO;
  return TONOS[normalizarTono(valor)].tag;
}

/** Clases de borde + texto de un sello. Solo `neutro`, `ok` y `critico`. */
export function clasesSello(tono) {
  return TONOS[tono]?.sello ?? null;
}

/**
 * Clase de dominio (`badge--<apptag>`) de un tono: lo que devuelven los
 * `core/dominio-*.js` y entiende `rolDeTag()`.
 *
 * `rango: true` agrega el modificador `badge--rango` (prioridad y severidad:
 * se dibujan en mayúsculas semibold). Es lo que impide que la clase de una
 * prioridad coincida con la de un estado aunque ambos sean neutros.
 */
export function claseBadge(tono, { rango = false } = {}) {
  const base = `badge--${tonoAppTag(tono)}`;
  return rango ? `${base} badge--rango` : base;
}

// ── Asignación de cada estado del dominio a su tono ─────────────────────────
// Las claves son los valores reales de la base (o derivados que ya calcula el
// frontend). Lo que la UI muestre (label, fecha) es de cada core/dominio-*.js.

/** `tickets.estado`. `en_espera_usuario` llega con el plan V2 (doble cierre). */
export const TONO_ESTADO_TICKET = Object.freeze({
  abierto: 'accion',
  reabierto: 'accion',
  en_progreso: 'trabajando',
  en_espera_usuario: 'espera',
  resuelto: 'espera', // esperando conformidad del solicitante
  cerrado: 'ok',
  rechazado: 'neutro',
});

/** Ticket público sin empleado vinculado: alguien de TI debe vincularlo. */
export const TONO_TICKET_SIN_VINCULAR = 'accion';

/** `tickets.prioridad`. Rango escrito: el color casi no distingue (regla 24). */
export const TONO_PRIORIDAD = Object.freeze({
  baja: 'neutro',
  media: 'neutro',
  alta: 'neutro',
  urgente: 'critico',
});

/** Reloj de un ticket (`estado_tiempo_ticket`, plan V2). */
export const TONO_RELOJ_TICKET = Object.freeze({
  en_plazo: 'ok',
  por_vencer: 'accion',
  vencido: 'critico',
  pausado: 'neutro',
});

/** Situación derivada de un equipo (`core/dominio-equipos.js`). */
export const TONO_SITUACION_EQUIPO = Object.freeze({
  disponible: 'ok',
  asignado: 'neutro',
  en_ubicacion: 'neutro',
  en_reparacion: 'trabajando',
  de_baja: 'neutro',
  perdido: 'critico',
});

/** `equipos.estado` (estado físico). */
export const TONO_ESTADO_FISICO_EQUIPO = Object.freeze({
  operativo: 'ok',
  en_reparacion: 'trabajando',
  de_baja: 'neutro',
  perdido: 'critico',
});

/** `empleados.estado` (enum capitalizado en la base). */
export const TONO_ESTADO_EMPLEADO = Object.freeze({
  Activo: 'ok',
  Inactivo: 'neutro',
  Suspendido: 'accion',
});

/** `staff.activo`. */
export const TONO_ACTIVO_STAFF = Object.freeze({
  activo: 'ok',
  inactivo: 'neutro',
});

/** `kb_articulos.estado`. */
export const TONO_ESTADO_KB = Object.freeze({
  borrador: 'neutro',
  en_revision: 'neutro',
  publicado: 'ok',
  obsoleto: 'neutro',
});

/** `problemas.estado`. */
export const TONO_ESTADO_PROBLEMA = Object.freeze({
  abierto: 'accion',
  diagnostico: 'trabajando',
  acciones: 'trabajando',
  cerrado: 'ok',
});

/** `problemas.severidad`: misma escala que la prioridad de ticket. */
export const TONO_SEVERIDAD_PROBLEMA = Object.freeze({
  baja: 'neutro',
  media: 'neutro',
  alta: 'neutro',
  critica: 'critico',
});

/** `problema_acciones.estado`. */
export const TONO_ESTADO_ACCION = Object.freeze({
  pendiente: 'accion',
  en_progreso: 'trabajando',
  completada: 'ok',
});

/** Vencimiento derivado de una licencia (`estadoVencimientoLicencia`). */
export const TONO_VENCIMIENTO_LICENCIA = Object.freeze({
  perpetua: 'ok',
  vigente: 'ok',
  por_vencer: 'accion',
  vencida: 'critico',
});

/** `solicitudes.estado` (migración 108): abierta = TI está trabajando en ella. */
export const TONO_ESTADO_SOLICITUD = Object.freeze({
  abierta: 'trabajando',
  completada: 'ok',
  cancelada: 'neutro',
});

/** `solicitud_pasos.estado`: lo pendiente pide acción de TI; omitido es un cierre neutro. */
export const TONO_ESTADO_PASO = Object.freeze({
  pendiente: 'accion',
  hecho: 'ok',
  omitido: 'neutro',
});

/**
 * `cambios.estado` (migración 107). Pedir aprobación y esperar la ejecución son
 * trabajo de TI (acción); implementado espera la verificación y el cierre.
 * revertido es crítico: el cambio hizo daño y hubo que deshacerlo.
 */
export const TONO_ESTADO_CAMBIO = Object.freeze({
  borrador: 'neutro',
  solicitado: 'accion',
  aprobado: 'accion',
  en_ejecucion: 'trabajando',
  implementado: 'espera',
  cerrado: 'ok',
  rechazado: 'neutro',
  cancelado: 'neutro',
  revertido: 'critico',
});

/** `cambios.tipo`: la emergencia es la única urgente. */
export const TONO_TIPO_CAMBIO = Object.freeze({
  estandar: 'categoria',
  normal: 'categoria',
  emergencia: 'critico',
});

/** `cambios.riesgo`: rango escrito, solo el alto en rojo (misma lógica que la prioridad). */
export const TONO_RIESGO_CAMBIO = Object.freeze({
  bajo: 'neutro',
  medio: 'neutro',
  alto: 'critico',
});

/** `servicios.criticidad`: rango escrito, solo la crítica en rojo. */
export const TONO_CRITICIDAD_SERVICIO = Object.freeze({
  baja: 'neutro',
  media: 'neutro',
  alta: 'neutro',
  critica: 'critico',
});

// ── Categorías (teal): dicen de qué clase es algo, no en qué estado está ─────

/** `cuentas.tipo`. */
export const TONO_TIPO_CUENTA = Object.freeze({
  compartida: 'categoria',
  reutilizable: 'categoria',
  personal: 'categoria',
});

/** `ubicaciones.tipo` (migración 059). `otro` es el cajón sin clasificar. */
export const TONO_TIPO_UBICACION = Object.freeze({
  sede: 'categoria',
  almacen: 'categoria',
  obra: 'categoria',
  otro: 'neutro',
});

/** `tickets.nivel_atencion`. */
export const TONO_NIVEL_ATENCION = Object.freeze({
  N1: 'categoria',
  N2: 'categoria',
  N3: 'categoria',
});

/** `tickets.tipo`. */
export const TONO_TIPO_TICKET = Object.freeze({
  incidente: 'categoria',
  solicitud: 'categoria',
});

/** `accesos_sensibles.categoria`. */
export const TONO_CATEGORIA_ACCESO_SENSIBLE = Object.freeze({
  equipos: 'categoria',
  correos: 'categoria',
  otro: 'neutro',
});

/**
 * Registro de todos los mapas, por nombre. Lo recorre `tests/tonos.test.js`
 * para comprobar que cada valor sea un tono válido; no es API de las vistas.
 */
export const MAPAS_DE_TONO = Object.freeze({
  ticket: TONO_ESTADO_TICKET,
  prioridad: TONO_PRIORIDAD,
  reloj_ticket: TONO_RELOJ_TICKET,
  situacion_equipo: TONO_SITUACION_EQUIPO,
  estado_fisico_equipo: TONO_ESTADO_FISICO_EQUIPO,
  empleado: TONO_ESTADO_EMPLEADO,
  activo_staff: TONO_ACTIVO_STAFF,
  kb_estado: TONO_ESTADO_KB,
  problema_estado: TONO_ESTADO_PROBLEMA,
  problema_severidad: TONO_SEVERIDAD_PROBLEMA,
  accion_estado: TONO_ESTADO_ACCION,
  solicitud_estado: TONO_ESTADO_SOLICITUD,
  solicitud_paso_estado: TONO_ESTADO_PASO,
  cambio_estado: TONO_ESTADO_CAMBIO,
  cambio_tipo: TONO_TIPO_CAMBIO,
  cambio_riesgo: TONO_RIESGO_CAMBIO,
  servicio_criticidad: TONO_CRITICIDAD_SERVICIO,
  vencimiento_licencia: TONO_VENCIMIENTO_LICENCIA,
  tipo_cuenta: TONO_TIPO_CUENTA,
  tipo_ubicacion: TONO_TIPO_UBICACION,
  nivel_atencion: TONO_NIVEL_ATENCION,
  tipo_ticket: TONO_TIPO_TICKET,
  categoria_acceso_sensible: TONO_CATEGORIA_ACCESO_SENSIBLE,
});

/**
 * Tono de un valor en un mapa. `undefined` si el mapa no lo conoce: el
 * llamador decide el fallback (los `*Info()` de dominio caen a neutro).
 */
export function tonoDe(mapa, valor) {
  return MAPAS_DE_TONO[mapa]?.[valor];
}
