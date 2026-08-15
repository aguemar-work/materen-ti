// Helpers de importación de equipos desde Excel: parseo del pegado,
// detección de columnas y sugerencias (tipo/estado/asignación). Ninguna
// sugerencia se guarda directo — todas son un punto de partida editable
// en la grilla de ImportarEquiposView.vue.
import { trimText } from '../../core/formatters.js';

export const CAMPOS_SISTEMA = [
  { clave: 'ignorar', label: '(ignorar esta columna)' },
  { clave: 'codigo', label: 'Código' },
  { clave: 'categoria', label: 'Categoría' },
  { clave: 'tipo', label: 'Tipo' },
  { clave: 'marca', label: 'Marca' },
  { clave: 'modelo', label: 'Modelo' },
  { clave: 'serie', label: 'Serie' },
  { clave: 'costo', label: 'Costo' },
  { clave: 'fecha_compra', label: 'Fecha de compra' },
  { clave: 'estado_texto', label: 'Estado (Excel)' },
  { clave: 'usuario', label: 'Usuario (Excel)' },
  { clave: 'ubicacion_texto', label: 'Ubicación (Excel)' },
  { clave: 'observaciones', label: 'Observaciones' },
  { clave: 'subido_kapo', label: 'Subido a Kapo' },
  { clave: 'nota_adicional', label: 'Nota adicional' },
];

const SINONIMOS = {
  codigo: ['codigo', 'código'],
  categoria: ['categoria', 'categoría'],
  tipo: ['tipo'],
  marca: ['marca'],
  modelo: ['modelo'],
  serie: ['serie', 'nro serie', 'numero de serie', 'número de serie'],
  costo: ['costo', 'precio'],
  fecha_compra: ['f.compra', 'fecha compra', 'fecha de compra'],
  estado_texto: ['estado', 'condicion', 'condición', 'condicion fisica', 'condición física'],
  usuario: ['usuario', 'asignado a', 'empleado'],
  ubicacion_texto: ['ubicacion', 'ubicación'],
  observaciones: ['observaciones', 'observacion', 'observación'],
  subido_kapo: ['subido a kapo', 'kapo'],
  nota_adicional: ['nota adicional', 'notas adicionales', 'nota'],
};

const RX_DIACRITICOS = new RegExp('[̀-ͯ]', 'g');

function normalizar(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(RX_DIACRITICOS, '');
}

// Auto-detecta a qué campo del sistema corresponde un encabezado de Excel.
// "N°"/"N"/"No" y cualquier encabezado no reconocido caen en 'ignorar' —
// se revisa/corrige en la UI de mapeo, nunca se asume en silencio.
export function detectarCampo(encabezado) {
  const h = normalizar(encabezado);
  if (!h) return 'ignorar';
  for (const [campo, sinonimos] of Object.entries(SINONIMOS)) {
    if (sinonimos.some((s) => normalizar(s) === h)) return campo;
  }
  return 'ignorar';
}

// Pegado desde Excel: filas por salto de línea, columnas por tab.
export function parsearPegado(texto) {
  const lineas = String(texto || '').split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
  if (!lineas.length) return { encabezados: [], filas: [] };
  const encabezados = lineas[0].split('\t').map((h) => h.trim());
  const filas = lineas.slice(1).map((linea) => linea.split('\t'));
  return { encabezados, filas };
}

const TIPO_KEYWORDS = [
  [/laptop|notebook/i, 'laptop'],
  [/desktop|\bpc\b|torre|\bcpu\b/i, 'desktop'],
  [/monitor/i, 'monitor'],
  [/impresora|printer/i, 'impresora'],
  [/celular|smartphone|movil|móvil/i, 'celular'],
  [/tablet/i, 'tablet'],
];

// Sugiere un tipo_id existente a partir de Categoría/Tipo del Excel. Cae en
// "otro" para lo que no calza (cámaras, alarmas, redes...) — se corrige a
// mano fila por fila, nunca se inventa un tipo nuevo automáticamente.
export function sugerirTipoId(categoria, tipo, tiposDisponibles) {
  const texto = `${categoria || ''} ${tipo || ''}`;
  for (const [rx, slug] of TIPO_KEYWORDS) {
    if (rx.test(texto) && tiposDisponibles.some((t) => t.id === slug)) return slug;
  }
  const otro = tiposDisponibles.find((t) => t.id === 'otro');
  return otro ? otro.id : (tiposDisponibles[0]?.id || '');
}

export function parsearCosto(valor) {
  if (valor == null || valor === '' || valor === '-') return null;
  const limpio = String(valor).replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export function parsearFecha(valor) {
  const s = trimText(valor);
  if (!s || s === '-') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function esDuplicadoKapo(valor) {
  return /duplicad/i.test(String(valor || ''));
}

// Las señales de baja/robo/reparación aparecen sueltas en cualquiera de estas
// 4 columnas del Excel (no solo en "Estado"), así que se buscan juntas.
export function sugerirEstadoFisico({ estado_texto, usuario, ubicacion_texto, observaciones }) {
  const texto = `${estado_texto || ''} ${usuario || ''} ${ubicacion_texto || ''} ${observaciones || ''}`;
  if (/robad|perdid/i.test(texto)) return 'perdido';
  if (/\bbaja\b/i.test(texto)) return 'de_baja';
  if (/malograd|inoperativ|con fallos|mantenimiento/i.test(texto)) return 'en_reparacion';
  return 'operativo';
}

function normalizarNombre(s) {
  return normalizar(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Coincidencia aproximada por palabras compartidas (>2 letras). Nunca decide
// sola: solo prellena la sugerencia, la persona confirma en la grilla —
// necesario porque "Usuario" trae apodos/iniciales que no calzan siempre.
export function sugerirEmpleado(usuario, empleados) {
  const palabras = normalizarNombre(usuario).split(' ').filter((w) => w.length > 2);
  if (!palabras.length) return null;
  let mejor = null;
  let mejorPuntaje = 0;
  for (const emp of empleados) {
    const nombreCompleto = normalizarNombre(`${emp.nombres} ${emp.apellidos}`);
    const puntaje = palabras.filter((w) => nombreCompleto.includes(w)).length;
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = emp; }
  }
  return mejorPuntaje > 0 ? mejor : null;
}

export function sugerirUbicacion(texto, ubicaciones) {
  const palabras = normalizarNombre(texto).split(' ').filter(Boolean);
  if (!palabras.length) return null;
  let mejor = null;
  let mejorPuntaje = 0;
  for (const ub of ubicaciones) {
    const nombre = normalizarNombre(ub.nombre);
    const puntaje = palabras.filter((w) => nombre.includes(w) || (w.length > 2 && w.includes(nombre))).length;
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = ub; }
  }
  return mejorPuntaje > 0 ? mejor : null;
}

// Modo de asignación sugerido para la fila. Prioridad: señal de baja/robo >
// ubicación reconocible (ej. "ALM TI" → Almacén de TI) > nombre de empleado
// reconocible > disponible (sin asignar) por defecto.
export function sugerirAsignacion(campos, ubicaciones, empleados) {
  const { estado_texto, usuario, ubicacion_texto, observaciones } = campos;
  const banderas = `${estado_texto || ''} ${usuario || ''} ${ubicacion_texto || ''} ${observaciones || ''}`;
  if (/robad|perdid|\bbaja\b/i.test(banderas)) {
    return { modo: 'disponible', empleado: null, ubicacion: null };
  }
  const ubicacion = sugerirUbicacion(ubicacion_texto, ubicaciones);
  if (ubicacion) return { modo: 'ubicacion', empleado: null, ubicacion };
  const empleado = sugerirEmpleado(usuario, empleados);
  if (empleado) return { modo: 'empleado', empleado, ubicacion: null };
  return { modo: 'disponible', empleado: null, ubicacion: null };
}

// Consolida las columnas sin campo propio en `equipos` (más el texto crudo
// de Estado/Usuario/Ubicación, por si la sugerencia automática se equivocó)
// para que no se pierda nada al importar.
export function consolidarNotas(campos) {
  const partes = [];
  if (campos.estado_texto) partes.push(`Estado (Excel): ${campos.estado_texto}`);
  if (campos.usuario) partes.push(`Usuario (Excel): ${campos.usuario}`);
  if (campos.ubicacion_texto) partes.push(`Ubicación (Excel): ${campos.ubicacion_texto}`);
  if (campos.observaciones) partes.push(`Obs: ${campos.observaciones}`);
  if (campos.nota_adicional) partes.push(`Nota adicional: ${campos.nota_adicional}`);
  return partes.join(' | ');
}
