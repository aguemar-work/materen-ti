// Forma común de los reportes centralizados (migración 117) para la maqueta:
// el MISMO contrato que reporte_cabecera / reporte_col / reporte_tabla /
// reporte_seccion / reporte_etiqueta del SQL, y el mismo guard que puede().
// Módulo PURO (sin globals del navegador): lo importan los rpc-reportes-*.js,
// los tests y el escenario S17 de scripts/sql-local/verificar-migraciones.mjs.
import { diaLima } from './rpc-reportes.js';

export const VERSION_DEFINICIONES_117 = 'reportes-2026-10-05';
export const ZONA = 'America/Lima';

export const col = (clave, titulo, tipo = 'texto') => ({ clave, titulo, tipo });
export const tabla = (id, titulo, columnas, filas, nota = null) => ({ id, titulo, nota, columnas, filas: filas || [] });
export const seccion = (id, titulo, tablas, nota = null) => ({ id, titulo, nota, tablas: tablas || [] });

export const rechazo = (code, message) => Object.assign(new Error(message), { code, message });

/** puede(p_user, p_permiso) de la 099: staff activo, rol:jefe, atajo de JEFE y módulos. */
export function puede(db, user, permiso) {
  const s = (db.staff || []).find((x) => x.user_id === user);
  if (!s || !s.activo) return false;
  if (permiso === 'staff:activo') return true;
  if (permiso === 'rol:jefe') return s.rol === 'JEFE';
  if (s.rol === 'JEFE') return true;
  if (permiso.startsWith('modulo:')) {
    return (db.staff_modulos_permisos || []).some((m) => m.staff_user_id === user && m.modulo === permiso.slice(7));
  }
  return false;
}

export function exigir(db, user, permiso) {
  if (!puede(db, user, permiso)) throw rechazo('42501', 'No autorizado');
}

// ── Fechas de calendario ('YYYY-MM-DD') ─────────────────────────────────────
export function sumarDias(iso, n) {
  const f = new Date(`${iso}T00:00:00Z`);
  f.setUTCDate(f.getUTCDate() + n);
  return f.toISOString().slice(0, 10);
}
/** b − a en días (como `date - date` en Postgres). */
export function restaDias(b, a) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}
export { diaLima };

export function validarPeriodo(desde, hasta) {
  if (!desde || !hasta || desde > hasta) {
    throw rechazo('P0001', 'El período no es válido: la fecha inicial debe ser anterior o igual a la final.');
  }
  if (restaDias(hasta, desde) >= 366) throw rechazo('P0001', 'El período no puede superar los 366 días.');
}

export function parametro(db, clave, defecto, subclave = null) {
  const fila = (db.config_parametros || []).find((p) => p.clave === clave);
  const v = subclave ? fila?.valor?.[subclave] : fila?.valor;
  return Number.isInteger(v) ? v : defecto;
}

/** reporte_cabecera(p_user, p_reporte, p_desde, p_hasta). */
export function cabecera(db, user, reporte, { desde = null, hasta = null, ahora = new Date() } = {}) {
  const hoy = diaLima(ahora);
  const nombre = (db.staff || []).find((s) => s.user_id === user)?.nombre ?? null;
  const conPeriodo = desde != null;
  const fin = conPeriodo ? new Date(`${sumarDias(hasta, 1)}T00:00:00-05:00`) : null;
  return {
    reporte,
    generado_en: ahora.toISOString(),
    generado_por: { user_id: user, nombre },
    definiciones_version: VERSION_DEFINICIONES_117,
    periodo: conPeriodo
      ? { desde, hasta, dias: restaDias(hasta, desde) + 1, completo: hasta < hoy, en_curso: desde <= hoy && hasta >= hoy, zona: ZONA }
      : null,
    periodo_completo: conPeriodo ? hasta < hoy : null,
    corte_at: conPeriodo ? new Date(Math.min(fin.getTime(), ahora.getTime())).toISOString() : ahora.toISOString(),
  };
}

// ── reporte_etiqueta(dominio, valor) ────────────────────────────────────────
const ETIQUETAS = {
  situacion_equipo: { asignado: 'Asignado', en_ubicacion: 'En ubicación', disponible: 'Disponible', en_reparacion: 'En reparación', de_baja: 'De baja', perdido: 'Robado/Perdido' },
  tipo_licencia: { suscripcion: 'Suscripción', perpetua: 'Perpetua' },
  situacion_licencia: { vencida: 'Vencida', por_vencer: 'Por vencer', vigente: 'Vigente', perpetua: 'Perpetua', sin_fecha: 'Sin vencimiento registrado' },
  tipo_cuenta: { personal: 'Personal', reutilizable: 'Reutilizable', compartida: 'Compartida' },
  movimiento_empleado: { creado: 'Alta', reingreso: 'Reingreso', baja_ejecutada: 'Baja', baja_registro: 'Baja', suspendido: 'Suspensión', reactivado: 'Reactivación' },
  estado_solicitud: { abierta: 'Abierta', completada: 'Completada', cancelada: 'Cancelada' },
  origen_solicitud: { rrhh_correo: 'Pedido de RRHH por correo', jefe_directo: 'Pedido del jefe directo', ticket: 'Ticket', sistema: 'Sistema', otro: 'Otro' },
  tipo_cambio: { estandar: 'Estándar', normal: 'Normal', emergencia: 'Emergencia' },
  estado_cambio: {
    borrador: 'Borrador', solicitado: 'Por aprobar', aprobado: 'Aprobado', en_ejecucion: 'En ejecución', implementado: 'Implementado',
    cerrado: 'Cerrado', rechazado: 'Rechazado', cancelado: 'Cancelado', revertido: 'Revertido',
  },
  riesgo_cambio: { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' },
  estado_problema: { abierto: 'Abierto', diagnostico: 'Diagnóstico', acciones: 'Acciones', cerrado: 'Cerrado' },
  severidad: { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' },
  estado_kb: { borrador: 'Borrador', en_revision: 'En revisión', publicado: 'Publicado', obsoleto: 'Obsoleto' },
  tipo_kb: { solucion: 'Solución', workaround: 'Workaround', procedimiento: 'Procedimiento' },
  accion_log: {
    ver: 'Contraseña vista', copiar: 'Contraseña copiada', enviar: 'Entrega creada', entrega_creada: 'Entrega creada',
    entrega_abierta: 'Entrega abierta', entrega_fallida: 'Entrega fallida', creado: 'Cuenta creada', editado: 'Cuenta editada',
    eliminado: 'Cuenta eliminada', acceso_denegado: 'Acceso denegado', permiso_otorgado: 'Permiso otorgado',
    permiso_revocado: 'Permiso revocado', revelado_fallido: 'Revelado fallido', revelado_denegado: 'Revelado denegado',
    purga_ejecutada: 'Purga ejecutada', portal_abierto: 'Portal abierto', exportacion: 'Exportación',
  },
};
export function etiqueta(dominio, valor) {
  return ETIQUETAS[dominio]?.[valor] ?? valor ?? null;
}

// ── Utilidades de agregación ────────────────────────────────────────────────
export const porId = (filas, clave = 'id') => Object.fromEntries((filas || []).map((r) => [r[clave], r]));
export const nombreDe = (e) => (e ? `${e.nombres} ${e.apellidos}`.trim() : null);
export const cmpTexto = (a, b) => String(a ?? '￿').localeCompare(String(b ?? '￿'), 'es');
/** Agrupa por clave (null incluido) conservando el primer orden de aparición. */
export function agrupar(filas, clave) {
  const mapa = new Map();
  for (const f of filas) {
    const k = clave(f) ?? null;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(f);
  }
  return [...mapa.entries()];
}
export const contar = (filas, pred) => filas.filter(pred).length;
const redondear1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
export function mediana1(valores) {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return redondear1(o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2);
}
export function promedio1(valores) {
  return valores.length ? redondear1(valores.reduce((a, b) => a + b, 0) / valores.length) : null;
}
export const pct0 = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);
export const maxIso = (valores) => (valores.length ? valores.reduce((a, b) => (new Date(b) > new Date(a) ? b : a)) : null);
