export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
// persona por DNI (tickets públicos).
export function esDniValido(dni) {
  return /^\d{8}$/.test(dni || '');
}

// "La fecha de hoy" NO vive acá: es `fechaLocalISO()` de core/formatters.js,
// el único punto del proyecto para eso. Este archivo tenía un `todayISO()`
// que solo la reexportaba con otro nombre y sin un solo consumidor
// (ARQ-18, ver docs/HISTORIAL-AUDITORIAS.md).
