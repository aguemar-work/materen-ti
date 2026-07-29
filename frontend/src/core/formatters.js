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

// Normaliza teléfonos a formato internacional (Perú por defecto):
//   "987 654 321"  → "+51987654321"   (celular peruano: 9 dígitos, empieza en 9)
//   "51987654321"  → "+51987654321"
//   "+51 987..."   → "+51987654321"   (ya tiene código: solo se limpia)
//   otros formatos → solo dígitos, sin adivinar el país
export function normalizarTelefono(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  if (!s) return null;
  const digitos = s.replace(/\D/g, '');
  if (!digitos) return null;
  if (s.startsWith('+')) return `+${digitos}`;
  if (/^9\d{8}$/.test(digitos)) return `+51${digitos}`;
  if (/^519\d{8}$/.test(digitos)) return `+${digitos}`;
  return digitos;
}

// "+51987654321" → "+51 987 654 321" (solo para mostrar)
export function formatTelefono(val) {
  if (!val) return '';
  const m = /^\+51(9\d{8})$/.exec(val);
  if (m) return `+51 ${m[1].slice(0, 3)} ${m[1].slice(3, 6)} ${m[1].slice(6)}`;
  return val;
}

// "2026-07-02" → "02/07/2026" (fechas de la BD, sin zona horaria)
export function formatFecha(val) {
  if (!val) return '';
  const [y, m, d] = String(val).split('T')[0].split('-');
  if (!y || !m || !d) return String(val);
  return `${d}/${m}/${y}`;
}

// Timestamp ISO → "02/07/2026 14:35" (hora local del navegador)
export function formatFechaHora(iso) {
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Timestamp ISO → "hace 5 min" / "hace 3 h" / "hace 2 d" (edad relativa,
// para señalar de un vistazo cuánto lleva algo sin moverse — ej. tickets).
export function formatAntiguedad(iso) {
  if (!iso) return '';
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'Recién';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}
