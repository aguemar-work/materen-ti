// Vocabulario del dominio Solicitudes de servicio (migración 108): trámites con
// pasos (alta, baja, cambio de puesto, acceso, equipo, licencia). Único origen
// de etiquetas, tonos y reglas de lectura — mismo patrón que dominio-problemas.js.
//
// Reemplaza a `altaIncompleta()` / `pasosAlta()` / `DIAS_VENTANA_ALTA` de
// dominio-empleados.js, que adivinaban en el cliente qué altas estaban a medias.
// Ahora el servidor guarda el trámite: acá solo se lee.
//
// Lo que NO vive acá: qué pasos tiene cada tipo ni cuándo se marcan solos. Eso
// es la plantilla de la base (`solicitud_plantilla_pasos`) y los triggers de
// la 108; el cliente recibe los pasos ya armados.

import { claseBadge, TONO_ESTADO_SOLICITUD as TES, TONO_ESTADO_PASO as TEP } from './tonos.js';

export const ESTADOS_SOLICITUD = {
  abierta:    { label: 'Abierta',    clase: claseBadge(TES.abierta) },
  completada: { label: 'Completada', clase: claseBadge(TES.completada) },
  cancelada:  { label: 'Cancelada',  clase: claseBadge(TES.cancelada) },
};

export const ESTADOS_PASO = {
  pendiente: { label: 'Pendiente', clase: claseBadge(TEP.pendiente) },
  hecho:     { label: 'Hecho',     clase: claseBadge(TEP.hecho) },
  omitido:   { label: 'Omitido',   clase: claseBadge(TEP.omitido) },
};

export function estadoSolicitudInfo(estado) {
  return ESTADOS_SOLICITUD[estado] || { label: estado, clase: 'badge--neutral' };
}

export function estadoPasoInfo(estado) {
  return ESTADOS_PASO[estado] || { label: estado, clase: 'badge--neutral' };
}

// Espejo de `solicitud_tipos` (catálogo cerrado: lo agrega una migración).
// `persona`: qué pide el formulario — 'activa' (empleado Activo), 'cualquiera'
// (devolución: también un Inactivo con equipo pendiente), 'nueva-o-activa'
// (alta: persona nueva o ya registrada) o 'ninguna' (baja: la crea «Dar de
// baja», nunca el formulario).
export const TIPOS_SOLICITUD = {
  alta_empleado:     { label: 'Alta de empleado',     corto: 'Alta',        modulo: 'empleados', persona: 'nueva-o-activa' },
  baja_empleado:     { label: 'Baja de empleado',     corto: 'Baja',        modulo: 'empleados', persona: 'ninguna' },
  cambio_puesto:     { label: 'Cambio de puesto',     corto: 'Cambio',      modulo: 'empleados', persona: 'activa' },
  acceso_nuevo:      { label: 'Acceso nuevo',         corto: 'Acceso',      modulo: 'correos',   persona: 'activa' },
  entrega_equipo:    { label: 'Entrega de equipo',    corto: 'Entrega',     modulo: 'equipos',   persona: 'activa' },
  devolucion_equipo: { label: 'Devolución de equipo', corto: 'Devolución',  modulo: 'equipos',   persona: 'cualquiera' },
  licencia:          { label: 'Licencia',             corto: 'Licencia',    modulo: 'licencias', persona: 'activa' },
};

export function tipoSolicitudInfo(id) {
  return TIPOS_SOLICITUD[id] || { label: id, corto: id, modulo: 'empleados', persona: 'activa' };
}

/** Tipos que el formulario ofrece (la baja nace de «Dar de baja»). */
export const OPCIONES_TIPO_CREABLE = Object.entries(TIPOS_SOLICITUD)
  .filter(([, t]) => t.persona !== 'ninguna')
  .map(([valor, t]) => ({ valor, label: t.label }));

/** Todos los tipos, para el filtro del listado. */
export const OPCIONES_TIPO_SOLICITUD = Object.entries(TIPOS_SOLICITUD)
  .map(([valor, t]) => ({ valor, label: t.label }));

// `solicitudes.origen`: de dónde vino el pedido. Las altas las genera RRHH por
// correo y TI las registra a mano (decisión del dueño, 2026-10-01).
export const ORIGENES_SOLICITUD = {
  rrhh_correo:  'Pedido de RRHH por correo',
  jefe_directo: 'Pedido del jefe directo',
  ticket:       'Ticket',
  sistema:      'Sistema',
  otro:         'Otro',
};

/** Orígenes que el formulario ofrece (ticket y sistema los pone el sistema). */
export const OPCIONES_ORIGEN = ['rrhh_correo', 'jefe_directo', 'otro']
  .map((valor) => ({ valor, label: ORIGENES_SOLICITUD[valor] }));

export function origenSolicitudInfo(origen) {
  return ORIGENES_SOLICITUD[origen] || origen || '';
}

/** Altas y bajas abiertas por más de estos días suben a crítico en el Inicio. */
export const DIAS_SOLICITUD_CRITICA = 3;
export const TIPOS_CRITICOS_SI_VIEJOS = Object.freeze(['alta_empleado', 'baja_empleado']);

// ── Avance de una solicitud ──────────────────────────────────────────────────

/**
 * @param {Array<{estado: string, obligatorio?: boolean}>} pasos
 * @returns {{ total: number, resueltos: number, pendientes: number, hechos: number,
 *   omitidos: number, obligatoriosPendientes: number }}
 */
export function avanceSolicitud(pasos = []) {
  const lista = Array.isArray(pasos) ? pasos : [];
  const hechos = lista.filter((p) => p.estado === 'hecho').length;
  const omitidos = lista.filter((p) => p.estado === 'omitido').length;
  const pendientes = lista.filter((p) => p.estado === 'pendiente');
  return {
    total: lista.length,
    resueltos: hechos + omitidos,
    pendientes: pendientes.length,
    hechos,
    omitidos,
    obligatoriosPendientes: pendientes.filter((p) => p.obligatorio).length,
  };
}

/** "3 de 7 pasos" · "1 paso" · "Sin pasos". */
export function textoAvance(avance) {
  if (!avance || !avance.total) return 'Sin pasos';
  if (avance.total === 1) return avance.resueltos ? '1 de 1 paso' : '0 de 1 paso';
  return `${avance.resueltos} de ${avance.total} pasos`;
}

/** Primer paso pendiente por orden, o null. */
export function siguientePaso(pasos = []) {
  return [...pasos]
    .filter((p) => p.estado === 'pendiente')
    .sort((a, b) => a.orden - b.orden)[0] || null;
}

// ── Dónde se hace cada paso ──────────────────────────────────────────────────

const TEXTO_MODULO = {
  empleados: 'Abrir expediente',
  correos: 'Abrir cuenta',
  equipos: 'Abrir equipo',
  licencias: 'Abrir licencias',
};

/**
 * Enlace al lugar donde se cumple un paso: el expediente de la persona (donde
 * están las cuentas, los equipos y las licencias que se le dan) o, cuando el
 * paso apunta a una cosa concreta, a esa cosa.
 *
 * @param {object} paso      fila de solicitud_pasos
 * @param {{ empleadoId: string, objetivo?: object }} contexto
 *   `objetivo`: lo que resuelve `objetivosDePasosSolicitud` para pasos con
 *   `objetivo_id` ({ usuario } de una cuenta, { equipo_id, codigo } de un equipo).
 * @returns {{ to: string, texto: string, modulo: string }}
 */
export function destinoPaso(paso, { empleadoId, objetivo = null } = {}) {
  const expediente = { to: `/empleados/${empleadoId}`, modulo: 'empleados', texto: TEXTO_MODULO.empleados };
  switch (paso.clave) {
    case 'rotar_contrasenas':
      return {
        to: objetivo?.usuario ? `/correos?q=${encodeURIComponent(objetivo.usuario)}` : '/correos',
        modulo: 'correos',
        texto: TEXTO_MODULO.correos,
      };
    case 'devolver_equipo':
      return objetivo?.equipo_id
        ? { to: `/equipos/${objetivo.equipo_id}`, modulo: 'equipos', texto: TEXTO_MODULO.equipos }
        : expediente;
    case 'activar_licencia':
      return { to: '/licencias', modulo: 'licencias', texto: TEXTO_MODULO.licencias };
    default:
      return expediente;
  }
}

// ── Libro de movimientos de una solicitud ────────────────────────────────────

/**
 * Filas de `AppLibro` (lo más reciente arriba) a partir de una solicitud con
 * sus pasos: se abrió, cada paso hecho u omitido, se completó o se canceló.
 * El autor de un paso marcado por el sistema sin sesión (la persona abrió su
 * enlace de entrega) se escribe "Automático".
 *
 * @param {object} solicitud  mapSolicitud() con `pasos`
 * @param {{ nombresStaff?: Record<string,string> }} [opciones] user_id → nombre
 */
export function armarLibroSolicitud(solicitud, { nombresStaff = {} } = {}) {
  if (!solicitud) return [];
  const quien = (id) => (id ? nombresStaff[id] || null : null);
  const filas = [];

  filas.push({
    id: 'abierta',
    fecha: solicitud.created_at,
    movimiento: 'Abierta',
    detalle: [tipoSolicitudInfo(solicitud.tipo_id).label, origenSolicitudInfo(solicitud.origen), solicitud.nota]
      .filter(Boolean).join(' · '),
    por: quien(solicitud.creada_por) || (solicitud.origen === 'sistema' ? 'Sistema' : null),
  });

  for (const p of solicitud.pasos || []) {
    if (p.estado === 'pendiente' || !p.hecho_at) continue;
    const omitido = p.estado === 'omitido';
    filas.push({
      id: `paso-${p.id}`,
      fecha: p.hecho_at,
      movimiento: omitido ? 'Paso omitido' : 'Paso hecho',
      detalle: omitido
        ? `${p.label} · ${p.motivo_omision}`
        : [p.label, p.nota].filter(Boolean).join(' · '),
      por: quien(p.hecho_por) || (p.automatico ? 'Automático' : null),
    });
  }

  if (solicitud.completada_at) {
    filas.push({ id: 'completada', fecha: solicitud.completada_at, movimiento: 'Completada', detalle: 'Todos los pasos hechos u omitidos', por: 'Automático' });
  }
  if (solicitud.cancelada_at) {
    filas.push({
      id: 'cancelada',
      fecha: solicitud.cancelada_at,
      movimiento: 'Cancelada',
      detalle: solicitud.motivo_cancelacion || '',
      por: quien(solicitud.cancelada_por),
    });
  }

  // Lo más reciente arriba; a igual instante, el cierre antes que el paso que
  // lo causó y la apertura al final.
  const peso = { abierta: 2, completada: 0, cancelada: 0 };
  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha) || (peso[a.id] ?? 1) - (peso[b.id] ?? 1));
}
