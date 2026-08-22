// Reporte de inventario de equipos — PDF descargable, foto del estado
// ACTUAL de todo el parque (sin recorte de periodo, mismo criterio que
// reporteSatisfaccion.js: siempre el total, no lo que esté filtrado en el
// toolbar de la vista en ese momento). Mismo lenguaje visual que
// pdfReporte.js: título+línea, KPIs, tablas en gris, pie con fecha y
// paginación — más dos bloques de gráfico dibujados a mano con las
// primitivas de jsPDF (rect/line/text, ver pdfReporte.js): el proyecto no
// tiene ninguna librería de charts (chart.js, etc.) y no hacía falta sumar
// una dependencia nueva solo para esto.
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import { aISO } from '../tickets/reportePeriodo.js';
import {
  ANCHO, MARGEN, UTIL, GRIS_LINEA, GRIS_TEXTO, NEGRO,
  celdaVacia, abrirSeccion, nota, bloqueKpis, tabla, graficoCategorias, piePaginas, crearDocumentoPdf,
} from '../../core/pdfReporte.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_VENTANA_GARANTIA = 90;

// "Últimos N movimientos", no "últimos X días": acotado por construcción,
// sin el riesgo de un día de importación masiva (migración 057) inundando
// la tabla del PDF. Mismo número que pide EquiposView.vue a
// equiposApi.ultimosMovimientos() — ver esa función para el porqué de
// pedir de más y descartar después los de equipos ya eliminados.
export const LIMITE_MOVIMIENTOS_PDF = 20;

// 'YYYY-MM-DD' → Date local a medianoche (new Date('2026-08-05') sería UTC,
// mismo motivo por el que reportePeriodo.js tiene su propio aFecha() privado
// — acá se repite en chico en vez de exportar el de allá, es de uso interno).
function fechaLocalDesdeISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function mesesEntre(desde, hasta) {
  return (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth());
}

// En meses si es menos de un año, en años (1 decimal) si no — lo que se lea
// mejor según el caso, en vez de forzar siempre la misma unidad.
function antiguedadPromedio(equipos, hoy) {
  const conFecha = equipos.filter((e) => e.fecha_compra);
  if (!conFecha.length) return '—';
  const meses = conFecha.reduce((acc, e) => acc + mesesEntre(fechaLocalDesdeISO(e.fecha_compra), hoy), 0) / conFecha.length;
  return meses >= 12 ? `${(meses / 12).toFixed(1)} años` : `${Math.round(meses)} meses`;
}

// Situación del parque, en el mismo orden en KPIs y en la barra apilada.
// 'asignados' es una SUMA de dos situaciones reales distintas
// (situacion='asignado': lo tiene una persona; situacion='en_ubicacion': está
// en un almacén/área) colapsadas en una sola categoría de reporte — decisión
// de producto 2026-08-22, no es un valor nuevo de `situacion` ni reemplaza el
// desglose persona/ubicación que sí se ve en la vista de Equipos.
// eventos_equipo.evento → columna "Acción" de la tabla de movimientos.
const ACCION_LABELS = { asignado: 'Asignado', devuelto: 'Devuelto' };

const SITUACIONES = [
  { clave: 'asignados', label: 'Asignados', tono: [214, 214, 214] },
  { clave: 'disponibles', label: 'Disponibles', tono: [170, 170, 170] },
  { clave: 'reparacion', label: 'En reparación', tono: [126, 126, 126] },
  { clave: 'de_baja', label: 'De baja', tono: [80, 80, 80] },
  { clave: 'perdidos', label: 'Perdidos/Robados', tono: [20, 20, 20] },
];

// Construye los agregados del reporte a partir del inventario COMPLETO (sin
// filtros del toolbar de la vista — ver comentario de arriba). `equipos` es
// el resultado de equiposApi.listEquiposFiltrados({}) tal cual lo mapea
// mapEquipo() en api/domains/equipos.js (con `situacion` y `estado` ya
// resueltos), así que acá no se recalcula nada de eso, solo se agrega.
export function construirDatosReporteEquipos(equipos, hoy = new Date()) {
  const total = equipos.length;
  const asignados = equipos.filter((e) => e.situacion === 'asignado' || e.situacion === 'en_ubicacion').length;
  const disponibles = equipos.filter((e) => e.situacion === 'disponible').length;
  const enReparacion = equipos.filter((e) => e.estado === 'en_reparacion').length;
  const deBaja = equipos.filter((e) => e.estado === 'de_baja').length;
  const perdidos = equipos.filter((e) => e.estado === 'perdido').length;

  const conteos = { asignados, disponibles, reparacion: enReparacion, de_baja: deBaja, perdidos };
  const porSituacion = SITUACIONES.map((s) => ({ ...s, conteo: conteos[s.clave] }));

  const porTipoMapa = new Map();
  for (const e of equipos) {
    const nombre = e.tipo_nombre || e.tipo_id || 'Sin tipo';
    porTipoMapa.set(nombre, (porTipoMapa.get(nombre) || 0) + 1);
  }
  // {clave, cantidad}: mismo shape que espera graficoCategorias() (pdfReporte.js).
  const porTipo = [...porTipoMapa.entries()]
    .map(([clave, cantidad]) => ({ clave, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const hoyISO = aISO(hoy);
  const limiteISO = aISO(new Date(hoy.getTime() + DIAS_VENTANA_GARANTIA * DIA_MS));
  const hoyMedianoche = fechaLocalDesdeISO(hoyISO);
  const garantias = equipos
    .filter((e) => e.garantia_hasta && e.garantia_hasta >= hoyISO && e.garantia_hasta <= limiteISO)
    .map((e) => ({
      codigo: e.codigo,
      tipo: e.tipo_nombre || e.tipo_id || 'Sin tipo',
      marca: e.marca,
      modelo: e.modelo,
      garantia_hasta: e.garantia_hasta,
      diasRestantes: Math.round((fechaLocalDesdeISO(e.garantia_hasta) - hoyMedianoche) / DIA_MS),
    }))
    .sort((a, b) => a.garantia_hasta.localeCompare(b.garantia_hasta));

  return {
    total, asignados, disponibles, enReparacion, deBaja, perdidos,
    antiguedad: antiguedadPromedio(equipos, hoy),
    porSituacion, porTipo, garantias,
  };
}

// Proporción Asignado/Disponible/Reparación/Baja/Perdido como un único
// rectángulo dividido en tramos de ancho proporcional, en 5 tonos de gris
// (de claro a casi negro): se distinguen a simple vista impresos en blanco y
// negro, por valor tonal y no por color. Sin tramo si el conteo es 0 (evita
// una línea invisible con su leyenda suelta).
const ALTO_BARRA = 9;

function barraApiladaSituacion(doc, porSituacion, total, y) {
  const conDatos = porSituacion.filter((s) => s.conteo > 0);
  if (!total || !conDatos.length) return nota(doc, 'Sin equipos activos para graficar.', y);

  doc.setDrawColor(...GRIS_LINEA).setLineWidth(0.2);
  let x = MARGEN;
  conDatos.forEach((s) => {
    const ancho = (s.conteo / total) * UTIL;
    doc.setFillColor(...s.tono);
    doc.rect(x, y, ancho, ALTO_BARRA, 'FD');
    x += ancho;
  });

  // Leyenda: swatch + label + cantidad + porcentaje, en filas de 3 — con 5
  // categorías como mucho entra en 2 filas sin medir texto caso por caso.
  let yLeyenda = y + ALTO_BARRA + 6;
  const porFila = 3;
  const anchoItem = UTIL / porFila;
  conDatos.forEach((s, i) => {
    const col = i % porFila;
    const fila = Math.floor(i / porFila);
    const x0 = MARGEN + col * anchoItem;
    const y0 = yLeyenda + fila * 6;
    doc.setFillColor(...s.tono);
    doc.setDrawColor(...GRIS_LINEA).setLineWidth(0.2);
    doc.rect(x0, y0 - 3, 3, 3, 'FD');
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS_TEXTO);
    const pct = Math.round((s.conteo / total) * 100);
    doc.text(`${s.label} ${s.conteo} (${pct}%)`, x0 + 5, y0);
  });
  doc.setTextColor(NEGRO);

  const filas = Math.ceil(conDatos.length / porFila);
  return yLeyenda + filas * 6 + 3;
}

// Construye el documento y devuelve { doc, nombre }. Separado de la descarga
// para poder verificar el PDF en tests; la UI usa generarReporteEquipos(),
// abajo.
export async function construirReporteEquipos(datos, { nombreArchivo = '' } = {}) {
  const { doc, autoTable } = await crearDocumentoPdf();
  const hoy = formatFecha(aISO(new Date()));

  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(NEGRO);
  doc.text('REPORTE DE EQUIPOS', ANCHO / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS_TEXTO);
  doc.text(`Inventario activo — foto al ${hoy}`, ANCHO / 2, 24, { align: 'center' });
  doc.setTextColor(NEGRO);

  let y = 32;
  y = bloqueKpis(doc, [
    { valor: datos.total, label: 'Total' },
    { valor: datos.asignados, label: 'Asignados' },
    { valor: datos.disponibles, label: 'Disponibles' },
    { valor: datos.enReparacion, label: 'En reparación' },
  ], y);
  y = bloqueKpis(doc, [
    { valor: datos.deBaja, label: 'De baja' },
    { valor: datos.perdidos, label: 'Perdidos' },
    { valor: datos.antiguedad, label: 'Antigüedad promedio' },
  ], y);

  y = abrirSeccion(doc, y, 'Situación del parque', 40);
  y = nota(doc, 'Proporción sobre el total de equipos activos. "Asignados" suma equipos entregados a una persona y equipos ubicados en un almacén/área.', y);
  y = barraApiladaSituacion(doc, datos.porSituacion, datos.total, y);

  y = abrirSeccion(doc, y, 'Por tipo de equipo', 40);
  y = nota(doc, 'Ordenado de mayor a menor cantidad.', y);
  y = graficoCategorias(doc, datos.porTipo, y, 10);

  y = abrirSeccion(doc, y, `Garantías por vencer (próximos ${DIAS_VENTANA_GARANTIA} días)`, 34);
  y = tabla(doc, autoTable, {
    head: [['Código', 'Tipo', 'Marca / Modelo', 'Vence', 'Días']],
    body: datos.garantias.length
      ? datos.garantias.map((g) => [
          g.codigo,
          g.tipo,
          [g.marca, g.modelo].filter(Boolean).join(' ') || '—',
          formatFecha(g.garantia_hasta),
          String(g.diasRestantes),
        ])
      : celdaVacia(`Sin garantías por vencer en los próximos ${DIAS_VENTANA_GARANTIA} días`, 5),
    columnStyles: { 3: { halign: 'right', cellWidth: 24 }, 4: { halign: 'right', cellWidth: 14 } },
  }, y);

  const movimientos = datos.movimientos || [];
  y = abrirSeccion(doc, y, 'Últimas asignaciones y devoluciones', 34);
  y = nota(doc, `Se muestran los últimos ${LIMITE_MOVIMIENTOS_PDF} movimientos (asignaciones y devoluciones), de más reciente a más antiguo.`, y);
  tabla(doc, autoTable, {
    head: [['Fecha', 'Equipo', 'Acción', 'Detalle']],
    body: movimientos.length
      ? movimientos.map((m) => [
          formatFechaHora(m.fecha),
          [m.codigo, m.tipo].filter(Boolean).join(' · '),
          ACCION_LABELS[m.evento] || m.evento,
          m.detalle,
        ])
      : celdaVacia('Sin movimientos recientes', 4),
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 34 }, 2: { cellWidth: 20 } },
  }, y);

  piePaginas(doc, hoy);
  return { doc, nombre: `${nombreArchivo || `Equipos_${aISO(new Date())}`}.pdf` };
}

export async function generarReporteEquipos(...args) {
  const { doc, nombre } = await construirReporteEquipos(...args);
  doc.save(nombre);
}
