// Forma del resumen del Inicio (RPC `dashboard_resumen`, migración 103) y
// reglas de lectura que comparten el feed, el store y el menú.
//
// Contrato (ver `migrations/103_parametros_y_dashboard.sql`): cada sección es
// `null` si la persona no tiene el módulo (eso NO es un error: la sección no
// se muestra) o si su cálculo falló en el servidor (entonces su nombre está en
// `errores` y SÍ se muestra un aviso de sección con reintento). La RPC puede
// fallar entera: eso lo trata el store, no este archivo.

/** Nombre de cada bloque de la RPC tal como llega en `errores`. */
export const SECCIONES_RESUMEN = Object.freeze([
  'kpis',
  'tickets',
  'rotaciones_pendientes',
  'cuentas_sin_password',
  'equipos_sin_devolver',
  'licencias_por_vencer',
  'garantias_por_vencer',
  'altas_incompletas',
  'problemas',
  'encuestas_sin_responder',
  'custodia_hoy',
  'actas_pendientes',
]);

const lista = (v) => (Array.isArray(v) ? v : null);

/**
 * Deja el jsonb de la RPC en una forma segura de leer: `errores` siempre es
 * arreglo y los arreglos internos de `tickets` y `problemas` existen. Una
 * sección ausente sigue siendo `null` (sin módulo o con error): no se
 * inventa un "vacío" que luego se leería como "al día".
 */
export function normalizarResumen(crudo) {
  const r = { ...crudo };
  r.errores = Array.isArray(crudo?.errores) ? crudo.errores.filter((e) => typeof e === 'string') : [];

  for (const k of [
    'rotaciones_pendientes', 'cuentas_sin_password', 'equipos_sin_devolver',
    'licencias_por_vencer', 'garantias_por_vencer', 'altas_incompletas',
    'custodia_hoy', 'actas_pendientes',
  ]) {
    r[k] = lista(crudo?.[k]);
  }

  const t = crudo?.tickets;
  r.tickets = t && typeof t === 'object'
    ? {
        ...t,
        sin_asignar: lista(t.sin_asignar) || [],
        sin_vincular: lista(t.sin_vincular) || [],
        viejos: lista(t.viejos) || [],
        mios: lista(t.mios) || [],
        mios_total: Number.isFinite(t.mios_total) ? t.mios_total : (lista(t.mios) || []).length,
        vigentes: Number.isFinite(t.vigentes) ? t.vigentes : 0,
        vencidos: t.vencidos ?? null,
        por_vencer: t.por_vencer ?? null,
      }
    : null;

  const p = crudo?.problemas;
  r.problemas = p && typeof p === 'object'
    ? { ...p, acciones_vencidas: lista(p.acciones_vencidas) || [], recurrentes: lista(p.recurrentes) }
    : null;

  r.kpis = crudo?.kpis && typeof crudo.kpis === 'object' ? crudo.kpis : null;
  r.encuestas_sin_responder = Number.isFinite(crudo?.encuestas_sin_responder) ? crudo.encuestas_sin_responder : null;
  r.solicitudes_abiertas = lista(crudo?.solicitudes_abiertas) || [];
  return r;
}

/**
 * Cantidad de tickets que el menú muestra como pendientes: los vigentes sin
 * asignar (la cola viva: baja cuando alguien toma el ticket). Es la misma
 * regla que tenía `AppLayout` con `pendientesTickets().sinAsignar.length`.
 * Sin módulo tickets o sin dato fiable: 0.
 */
export function ticketsSinAsignar(resumen) {
  return resumen?.tickets?.sin_asignar?.length ?? 0;
}
