import { fechaLocalISO } from './formatters.js';

export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getInitials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

// "Cámara de seguridad" → "camara_de_seguridad" (ids-slug de catálogos)
export function slugDe(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function uid() {
  return crypto.randomUUID();
}

// DNI peruano: 8 dígitos. Usado en los formularios que identifican a una
// persona por DNI (tickets públicos, pre-registro de personal).
export function esDniValido(dni) {
  return /^\d{8}$/.test(dni || '');
}

export function todayISO() {
  return fechaLocalISO();
}
