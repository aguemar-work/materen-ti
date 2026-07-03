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

export function statusClass(estado) {
  if (estado === 'Activo') return 's-activo';
  if (estado === 'Inactivo') return 's-inactivo';
  return 's-suspendido';
}

export function uid() {
  return crypto.randomUUID();
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}
