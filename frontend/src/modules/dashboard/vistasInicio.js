import { GRUPOS_INICIO } from './pendientesFeed.js';
import { diasDesde } from './tiempoLima.js';

// Lectura del resumen del Inicio para la pantalla: qué vistas existen, qué
// secciones fallaron y qué vence esta semana. Todo puro (recibe el resumen) y
// sin tocar permisos: que una persona vea o no una sección lo decidió el
// servidor (`dashboard_resumen` devuelve `null` en lo que no puede ver).

/** Orden fijo de las vistas de la fila `AppVistas` (después de "Todos"). */
export const ORDEN_VISTAS = Object.freeze(['tickets', 'accesos', 'custodia', 'problemas']);

/** Nombre legible de cada bloque de la RPC, para los avisos de error. */
export const ETIQUETA_SECCION = Object.freeze({
  kpis: 'las cifras generales',
  tickets: 'los tickets',
  rotaciones_pendientes: 'las contraseñas por rotar',
  cuentas_sin_password: 'las cuentas sin contraseña',
  equipos_sin_devolver: 'los equipos sin devolver',
  licencias_por_vencer: 'las licencias por vencer',
  garantias_por_vencer: 'las garantías por vencer',
  altas_incompletas: 'las altas a medias',
  problemas: 'los problemas',
  encuestas_sin_responder: 'las encuestas sin responder',
  custodia_hoy: 'la custodia de hoy',
  actas_pendientes: 'las actas sin adjuntar',
});

/** Secciones de "Hoy en custodia" y "Vence esta semana" (no son del feed). */
export const SECCIONES_LATERALES = Object.freeze({
  mios: ['tickets'],
  vencimientos: ['licencias_por_vencer', 'garantias_por_vencer'],
  custodiaHoy: ['custodia_hoy'],
});

/** "Vence esta semana": ventana que solo existe para mostrar (el umbral de
 *  "por vencer" que cuenta como pendiente lo fija el servidor). */
export const DIAS_SEMANA = 7;

const tiene = (resumen, nombre) => resumen?.[nombre] != null || resumen?.errores?.includes(nombre);

/** ¿La persona tiene (o falló) alguna de estas secciones? Sin módulo → false. */
export function hayAlguna(resumen, secciones) {
  return secciones.some((s) => tiene(resumen, s));
}

/**
 * Vistas que la persona puede ver: solo las que tienen al menos una sección
 * (con datos o con error). Una persona sin el módulo `problemas` no ve la
 * vista Problemas aunque exista.
 */
export function vistasDisponibles(resumen) {
  if (!resumen) return [];
  return ORDEN_VISTAS.filter((id) => hayAlguna(resumen, GRUPOS_INICIO[id].secciones));
}

/**
 * Secciones que fallaron y se muestran dentro del feed de una vista:
 * en "todos" todas las que no tienen panel propio; en una vista, las suyas.
 */
export function erroresDelFeed(resumen, vista) {
  const errores = resumen?.errores || [];
  if (vista && vista !== 'todos') {
    const propias = GRUPOS_INICIO[vista]?.secciones || [];
    return errores.filter((e) => propias.includes(e));
  }
  return errores.filter((e) => !SECCIONES_LATERALES.custodiaHoy.includes(e));
}

/** Errores (de las secciones indicadas) para el aviso de un panel lateral. */
export function erroresDe(resumen, secciones) {
  return (resumen?.errores || []).filter((e) => secciones.includes(e));
}

/**
 * Licencias y garantías que vencen en los próximos DIAS_SEMANA días (las ya
 * vencidas están en el feed como críticas). `mas` = cuántas quedan fuera de
 * la ventana pero dentro del horizonte que calculó el servidor.
 */
export function vencimientosDeLaSemana(resumen, ahora = new Date()) {
  const dentro = [];
  let mas = 0;
  const considerar = (fecha, item) => {
    const d = diasDesde(fecha, ahora); // negativo = faltan días
    if (d == null || d > 0) return; // ya venció (o sin fecha)
    if (-d <= DIAS_SEMANA) dentro.push({ ...item, fecha });
    else mas += 1;
  };
  for (const l of resumen?.licencias_por_vencer || []) {
    if (l.vencida) continue;
    considerar(l.fecha_vencimiento, {
      key: `lic-${l.licencia_id}`,
      tipo: 'licencia',
      titulo: l.software,
      contexto: [l.cantidad ? `${l.cantidad} ${l.cantidad === 1 ? 'asiento' : 'asientos'}` : '', l.empresa].filter(Boolean).join(' · '),
      destino: `/licencias?q=${encodeURIComponent(l.software)}`,
    });
  }
  for (const g of resumen?.garantias_por_vencer || []) {
    if (g.vencida) continue;
    considerar(g.garantia_hasta, {
      key: `garantia-${g.equipo_id}`,
      tipo: 'garantia',
      codigo: g.codigo,
      titulo: 'Garantía',
      contexto: g.equipo,
      destino: `/equipos?q=${encodeURIComponent(g.codigo)}`,
    });
  }
  dentro.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { items: dentro, mas };
}
