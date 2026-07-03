function clean(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim().replace(/\s+/g, ' ');
  return s || null;
}

// "juan carlos" → "Juan Carlos"
export function toTitleCase(val) {
  const s = clean(val);
  if (!s) return null;
  return s
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// "JUAN@GMAIL.COM " → "juan@gmail.com"
export function toLower(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim().toLowerCase();
  return s || null;
}

// "+51 999 888 777" → "+51999888777"
export function stripSpaces(val) {
  if (val == null || val === '') return null;
  const s = String(val).replace(/\s/g, '');
  return s || null;
}

// "20 123-456-789" → "20123456789"  (DNI, RUC)
export function onlyDigits(val) {
  if (val == null || val === '') return null;
  const s = String(val).replace(/\D/g, '');
  return s || null;
}

// Trim + colapsa espacios dobles
export function trimText(val) {
  return clean(val);
}

// "2026-07-02" → "02/07/2026" (fechas de la BD, sin zona horaria)
export function formatFecha(val) {
  if (!val) return '';
  const [y, m, d] = String(val).split('T')[0].split('-');
  if (!y || !m || !d) return String(val);
  return `${d}/${m}/${y}`;
}
