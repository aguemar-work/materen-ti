// Helpers compartidos por autorizacion-anonima.smoke.test.js y
// autorizacion-roles.smoke.test.js. Endurecido 2026-08-18 (autoauditoría
// posterior al Ciclo 11): antes cada archivo definía su propia versión de
// estos helpers y aceptaban CUALQUIER error (`Boolean(error)`) como prueba
// de rechazo de autorización — eso es una expectativa débil: un typo de
// nombre de tabla, una columna eliminada, o un cambio de firma de una RPC
// también producen un error, y el test "pasaría" en verde sin haber
// probado nada de autorización.
//
// Formas reales verificadas en vivo (clave anónima, sin sesión, contra el
// backend real — no supuestas) antes de escribir este archivo:
//   - .database.from()/.insert()/.rpc() denegado por RLS o por falta de
//     GRANT: { error: { code: '42501', message: 'permission denied for
//     function es_jefe' } } — SQLSTATE 42501 (insufficient_privilege),
//     igual para SELECT/INSERT/RPC.
//   - Una RPC con `raise exception 'No autorizado'` alcanzada por un rol
//     YA autenticado con EXECUTE otorgado (ej. staff inactivo llamando
//     staff_nombres()): Postgres asigna P0001 (excepción PL/pgSQL sin
//     ERRCODE explícito) — el MISMO código que usan otras excepciones de
//     negocio de esa misma función (ej. "Ticket no encontrado" en
//     cerrar_ticket), así que P0001 solo cuenta si además el mensaje es
//     específicamente el guard de autorización.
//   - tiene_permiso_modulo (hallazgo P0-05, ver docs/HISTORIAL-AUDITORIAS.md
//     Ciclo 11): { error: null, data: false, status: 200 } — confirma que
//     hoy NO hay ningún rechazo; el test que lo usa queda en rojo a
//     propósito, no se corrige acá.
//   - functions.invoke con status no-2xx (401/403/429, los que credenciales.ts
//     pasa explícitamente a json(body, status) para no_autenticado/
//     no_es_staff/no_autorizado/demasiados_revelados): data es SIEMPRE
//     null, error es una instancia InsForgeError con `statusCode` = el
//     status HTTP real. `error.error` es la constante genérica
//     'REQUEST_FAILED' — no sirve para distinguir el motivo.
//   - functions.invoke con status 200 y {ok:false, code:'...'} en el body
//     (ej. entregaAbrir con token inexistente, o cualquier "no_existe" que
//     credenciales.ts devuelve sin pasar status): error es null, data SÍ
//     trae el code. Por eso NO se usa data?.ok===false como prueba de
//     rechazo de autorización: si el guard de permiso se rompiera, la
//     llamada con un id inventado caería directo a un "no_existe" con
//     status 200 — data?.ok===false seguiría siendo true, y el test
//     "pasaría" sin haber probado nada. El único mecanismo específico acá
//     es el status HTTP real (401/403/429), que la propia edge function
//     solo usa para sus rechazos de autenticación/autorización/rate-limit.
import { expect } from 'vitest';
import { getClient } from '../../src/api/client.js';

// ── Discriminantes puros (sin red, testeados en autorizacion-helpers.test.js) ──

// 429 (demasiados_revelados) NO cuenta: es rate-limit, no autorización —
// puede ocurrir con una sesión completamente autorizada (ej. un JEFE que
// ya reveló 40 contraseñas en 5 minutos). Mezclarlo acá haría que un test
// "pase" por rate-limit en vez de por el guard de autorización real.
const CODIGOS_STATUS_RECHAZO_ACCION = new Set([401, 403]);

export function esRechazoDeAutorizacionSql(error) {
  if (!error) return false;
  if (error.code === '42501') return true;
  if (error.code === 'P0001' && /no autorizad/i.test(error.message || '')) return true;
  return false;
}

export function esRechazoDeAutorizacionAccion(error) {
  if (!error) return false;
  return CODIGOS_STATUS_RECHAZO_ACCION.has(error.statusCode);
}

// ── Constructores de mensaje: solo código/status/conteo, NUNCA el payload ──
// (nunca JSON.stringify(data) ni JSON.stringify({data, error}) — ver la
// autoauditoría: esos mensajes podían imprimir contraseñas/DNI/nombres
// reales en el log de CI si el control que prueban alguna vez fallaba).

export function mensajeAcceso(tabla, { data, error }) {
  const motivo = error ? `${error.code}: ${error.message}` : `${Array.isArray(data) ? data.length : 0} fila(s) devueltas`;
  return `"${tabla}" no fue rechazada por autorización — ${motivo}`;
}

export function mensajeInsert(tabla, error) {
  const motivo = error ? `${error.code}: ${error.message}` : 'ninguno (insertó sin error)';
  return `insertar en "${tabla}" no fue rechazado por autorización — ${motivo}`;
}

export function mensajeRpc(nombre, error) {
  const motivo = error ? `${error.code}: ${error.message}` : 'ninguno (ejecutó sin error)';
  return `la RPC "${nombre}" no fue rechazada por autorización — ${motivo}`;
}

export function mensajeAccion(funcion, action, error) {
  const motivo = error ? `status ${error.statusCode}` : 'ninguno (respondió 200)';
  return `la acción "${action}" de "${funcion}" no fue rechazada por autorización — ${motivo}`;
}

// ── Helpers async (usan el backend real) ──────────────────────────────

export async function esperarSinAcceso(tabla) {
  const { data, error } = await getClient().database.from(tabla).select('*').limit(5);
  const rechazado = esRechazoDeAutorizacionSql(error) || (!error && Array.isArray(data) && data.length === 0);
  expect(rechazado, mensajeAcceso(tabla, { data, error })).toBe(true);
}

export async function esperarInsertRechazado(tabla, fila) {
  const { error } = await getClient().database.from(tabla).insert([fila]);
  expect(esRechazoDeAutorizacionSql(error), mensajeInsert(tabla, error)).toBe(true);
}

export async function esperarRpcRechazada(nombre, args) {
  const { error } = await getClient().database.rpc(nombre, args);
  expect(esRechazoDeAutorizacionSql(error), mensajeRpc(nombre, error)).toBe(true);
}

export async function esperarAccionRechazada(funcion, body) {
  const { error } = await getClient().functions.invoke(funcion, { body });
  expect(esRechazoDeAutorizacionAccion(error), mensajeAccion(funcion, body.action, error)).toBe(true);
}
