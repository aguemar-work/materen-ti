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

// 'Date' local → 'YYYY-MM-DD'. NUNCA usar `date.toISOString().split('T')[0]`
// para esto: toISOString() convierte a UTC, y en Perú (UTC-5) eso devuelve el
// día SIGUIENTE para cualquier hora local a partir de las 19:00 — corrompe
// fecha_inicio/fecha_fin de asignaciones y comparaciones de vencimiento.
export function fechaISO(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Hoy (o desplazado `diasDesdeHoy` días, negativo = pasado) en 'YYYY-MM-DD'
// LOCAL. Único punto para "la fecha de hoy" en el proyecto — ver fechaISO().
export function fechaLocalISO(diasDesdeHoy = 0) {
  const d = new Date();
  if (diasDesdeHoy) d.setDate(d.getDate() + diasDesdeHoy);
  return fechaISO(d);
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

// Horas decimales → "45 min" / "3.2 h" / "2 d 4 h". Para tiempos de atención:
// en minutos cuando fue rápido y en días cuando el número de horas ya no se
// puede leer de un vistazo.
export function formatHoras(h) {
  if (h === null || h === undefined || !Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  const dias = Math.floor(h / 24);
  const resto = Math.round(h % 24);
  return resto ? `${dias} d ${resto} h` : `${dias} d`;
}

// Variación contra el periodo anterior: "+5", "-2", "sin cambio". Devuelve null
// cuando no hay con qué comparar, para que quien lo muestre no pinte nada.
// Sin el signo menos tipográfico (U+2212): no existe en la codificación de los
// PDF que genera jsPDF y saldría como un carácter roto.
export function formatDelta(actual, anterior, decimales = 0, sufijo = '') {
  if (actual === null || actual === undefined || anterior === null || anterior === undefined) return null;
  const diferencia = Number(actual) - Number(anterior);
  const redondeada = Number(diferencia.toFixed(decimales));
  if (redondeada === 0) return 'sin cambio';
  return `${redondeada > 0 ? '+' : '-'}${Math.abs(redondeada).toFixed(decimales)}${sufijo}`;
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
