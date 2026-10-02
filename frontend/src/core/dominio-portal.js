// Dominio del portal del empleado (migración 109): lo que el staff elige al emitir
// el enlace y lo que el empleado ve. Lógica pura, sin red ni DOM salvo `urlPortal`
// (que lee el origen de la página).
import { fechaISO, formatFecha } from './formatters.js';

// Alcances que admite el enlace (CHECK de empleado_enlaces). `confirmar_ticket`
// queda fuera: depende de la rama V2 (confirmar_cierre_usuario) y aún no existe.
export const ALCANCES_PORTAL = [
  { id: 'ver_equipos', etiqueta: 'Equipos a su cargo', ayuda: 'Código, tipo, fecha de entrega y condición.' },
  { id: 'confirmar_equipo', etiqueta: 'Confirmar la recepción de equipos', ayuda: 'Incluye ver los equipos.' },
  { id: 'ver_accesos', etiqueta: 'Cuentas asignadas', ayuda: 'Solo plataforma y usuario; nunca la contraseña.' },
  { id: 'ver_tickets', etiqueta: 'Tickets activos', ayuda: 'Código, asunto y estado.' },
];

export const ALCANCE_COMPLETO = ALCANCES_PORTAL.map((a) => a.id);

// Vigencias que ofrece la ventana (el servidor acepta de 1 a 30 días; 7 es el
// parámetro por defecto).
export const VIGENCIAS_PORTAL = [1, 3, 7, 14, 30];
export const VIGENCIA_PORTAL_DEFECTO = 7;

export function textoVigencia(dias) {
  return `${dias} ${dias === 1 ? 'día' : 'días'}`;
}

// Confirmar recepción implica ver los equipos: se agrega solo (el servidor hace lo mismo).
export function normalizarAlcance(ids = []) {
  const set = new Set(ids.filter((id) => ALCANCE_COMPLETO.includes(id)));
  if (set.has('confirmar_equipo')) set.add('ver_equipos');
  return ALCANCE_COMPLETO.filter((id) => set.has(id));
}

// Enlace que se entrega al empleado. El token solo existe en memoria, en el
// momento de emitirlo.
export function urlPortal(token, origen = window.location.origin) {
  return `${origen}/mi/${token}`;
}

// 'vigente' | 'vencido' | null (sin enlace sin revocar).
export function estadoEnlacePortal(enlace, ahora = Date.now()) {
  if (!enlace || enlace.revocado_at) return null;
  return new Date(enlace.expires_at).getTime() > ahora ? 'vigente' : 'vencido';
}

// Timestamp ISO → "02/10/2026" en hora local (un Date, no el prefijo UTC de la cadena).
export function fechaLocal(iso) {
  if (!iso) return '';
  const f = new Date(iso);
  return Number.isNaN(f.getTime()) ? '' : formatFecha(fechaISO(f));
}

export function resumenAlcance(ids = []) {
  const textos = ALCANCES_PORTAL.filter((a) => ids.includes(a.id)).map((a) => a.etiqueta.toLowerCase());
  return textos.length ? textos.join(', ') : 'nada';
}

// Cuántos equipos siguen sin la confirmación del empleado.
export function equiposSinConfirmar(equipos = []) {
  return equipos.filter((e) => !e.confirmado_at).length;
}

export function primerNombre(nombre = '') {
  return String(nombre).trim().split(/\s+/)[0] || '';
}
