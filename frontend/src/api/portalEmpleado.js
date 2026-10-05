// Lado público del portal del empleado (migración 109): el empleado abre su
// enlace personal /mi/<token> y la edge function "portal" (sin sesión) le
// devuelve lo suyo. El navegador nunca lee `empleado_enlaces` ni las tablas del
// empleado: todo pasa por la function, igual que ticketsPublicos.js.
//
// El token es un bearer token: quien lo tiene ES ese empleado. Aquí nunca se
// guarda ni se registra; solo viaja en el cuerpo de la petición.
import { crearInvocador } from './invocarFuncion.js';

const invoke = crearInvocador('portal', mensajeError);

// Mensajes en español, de usted. `no_existe` es la única respuesta ante un enlace
// inexistente, vencido, revocado o de alguien que ya no está Activo: no se
// distingue el motivo.
export const MENSAJES_ERROR_PORTAL = {
  no_existe: 'Este enlace no es válido o ya venció. Solicite uno nuevo a TI.',
  sin_alcance: 'Este enlace no permite confirmar la recepción de equipos. Solicite uno nuevo a TI.',
  no_encontrada: 'No se encontró ese equipo entre los que tiene a su cargo. Actualice la página e intente de nuevo.',
  demasiados_intentos: 'Demasiados intentos. Espere unos minutos e intente de nuevo.',
  error_interno: 'No se pudo completar la operación. Intente de nuevo en unos minutos.',
};

function mensajeError(code) {
  return MENSAJES_ERROR_PORTAL[code] || 'No se pudo completar la operación. Intente de nuevo en unos minutos.';
}

// { nombre, vence, alcance[], equipos?[], accesos?[], tickets?[] }. Una sección
// solo viene si el alcance del enlace la incluye.
export async function abrirPortal(token) {
  const { ok, ...datos } = await invoke({ action: 'abrir', token });
  void ok;
  return datos;
}

// Confirma la recepción de UN equipo vigente del propio empleado. Idempotente.
export async function confirmarEquipoPortal(token, asignacionId) {
  const data = await invoke({ action: 'confirmarEquipo', token, asignacionId });
  return { yaConfirmada: data.yaConfirmada === true, confirmadoAt: data.confirmadoAt || null };
}
