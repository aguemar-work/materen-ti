// Primitivas compartidas para armar reportes en PDF (jsPDF + jspdf-autotable):
// geometría de página, estilos de tabla y los bloques de layout (título de
// sección, nota, KPIs, pie de página). Extraído de reporte.js (el PDF del
// modal "Reporte" de Tickets) cuando reporteSatisfaccion.js necesitó lo mismo
// — dos PDFs con el mismo lenguaje visual no pueden cada uno reinventar
// "cómo se ve un título de sección" o el gris de las líneas.
//
// jsPDF y autoTable se importan de forma DIFERIDA: solo se descargan cuando
// alguien pide un reporte, no en la carga del panel.
export const ANCHO = 210;                    // A4 vertical, en mm
export const ALTO = 297;
export const MARGEN = 14;
export const UTIL = ANCHO - MARGEN * 2;

// Documento sobrio en grises: se lee igual impreso en blanco y negro y no
// compite con los colores de la marca (que viven en la UI, no acá).
export const GRIS_CABECERA = [238, 238, 238];
export const GRIS_LINEA = [187, 187, 187];
export const GRIS_TEXTO = [90, 90, 90];
export const NEGRO = 20;

export const ESTILOS_TABLA = {
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: GRIS_LINEA, lineWidth: 0.1, textColor: NEGRO, overflow: 'linebreak' },
  headStyles: { fillColor: GRIS_CABECERA, textColor: NEGRO, fontStyle: 'bold' },
};

export function celdaVacia(texto, columnas) {
  return [[{ content: texto, colSpan: columnas, styles: { halign: 'center', fontStyle: 'italic', textColor: GRIS_TEXTO } }]];
}

// Evita el título huérfano al pie de la hoja: si el título más el arranque de su
// tabla no caben, la sección empieza en página nueva. Puro y exportado para
// poder testear la decisión sin generar un PDF.
export function ubicarSeccion(y, necesario = 30) {
  return y + necesario <= ALTO - MARGEN - 8
    ? { y, nuevaPagina: false }
    : { y: MARGEN + 6, nuevaPagina: true };
}

export function tituloSeccion(doc, texto, y) {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(NEGRO);
  doc.text(texto.toUpperCase(), MARGEN, y);
  doc.setDrawColor(NEGRO).setLineWidth(0.4);
  doc.line(MARGEN, y + 1.4, ANCHO - MARGEN, y + 1.4);
  return y + 5.5;
}

export function abrirSeccion(doc, y, texto, necesario) {
  const pos = ubicarSeccion(y, necesario);
  if (pos.nuevaPagina) doc.addPage();
  return tituloSeccion(doc, texto, pos.y);
}

export function nota(doc, texto, y) {
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS_TEXTO);
  const lineas = doc.splitTextToSize(texto, UTIL);
  doc.text(lineas, MARGEN, y);
  doc.setTextColor(NEGRO);
  return y + lineas.length * 3 + 1.5;
}

export function bloqueKpis(doc, items, y) {
  const hueco = 3;
  const ancho = (UTIL - hueco * (items.length - 1)) / items.length;
  const conDelta = items.some((i) => i.delta);
  const alto = conDelta ? 19 : 15;
  items.forEach((item, i) => {
    const x = MARGEN + i * (ancho + hueco);
    doc.setDrawColor(...GRIS_LINEA).setLineWidth(0.2);
    doc.roundedRect(x, y, ancho, alto, 1, 1);
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(NEGRO);
    doc.text(String(item.valor), x + ancho / 2, y + 7.8, { align: 'center' });
    doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...GRIS_TEXTO);
    doc.text(item.label.toUpperCase(), x + ancho / 2, y + 12.2, { align: 'center' });
    if (conDelta) {
      doc.setFontSize(7);
      doc.text(item.delta || '—', x + ancho / 2, y + 16.6, { align: 'center' });
    }
  });
  doc.setTextColor(NEGRO);
  return y + alto + 7;
}

export function tabla(doc, autoTable, { head, body, columnStyles }, y) {
  autoTable(doc, {
    ...ESTILOS_TABLA,
    startY: y,
    margin: { left: MARGEN, right: MARGEN, top: MARGEN, bottom: MARGEN + 6 },
    head,
    body,
    columnStyles,
  });
  return doc.lastAutoTable.finalY + 7;
}

// ── Gráficos ────────────────────────────────────────────────────────────────
// Extraído de reporte.js (2026-08-22) cuando reporteEquipos.js necesitó el
// mismo gráfico de barras horizontales ("por tipo") — mismo criterio que el
// resto del archivo: dos PDFs con el mismo lenguaje visual no pueden cada
// uno reinventarlo. graficoPorDia (el de columnas verticales) es específico
// de tickets y se queda en reporte.js, pero usa estas mismas primitivas.
//
// Cada gráfico lleva UNA sola serie y un único gris: el documento se imprime en
// blanco y negro, así que no hay paleta categórica que validar (la comprobación
// de color que aplica es el contraste del relleno sobre el papel: #4A4A4A sobre
// blanco ≈ 8.9:1). Marcas según la guía de dataviz: barras finas con el extremo
// de dato redondeado y la base recta, hueco de papel entre barras vecinas, ejes
// y guías en hairline continuo (nunca punteado), sin caja de leyenda (serie
// única: el título ya dice qué se grafica) y etiquetas selectivas — el pico y
// los extremos del eje, nunca un número sobre cada barra. Cada gráfico tiene su
// tabla equivalente en el mismo documento, así que ningún valor queda encerrado
// en la imagen.
export const GRIS_DATO = [74, 74, 74];
export const GRIS_GUIA = [214, 214, 214];
export const GROSOR_MAX = 4.5;      // ≈24px: la barra no llena su carril, deja aire
export const HUECO_MIN = 0.6;       // ≈2px de papel entre barras vecinas
export const RADIO_DATO = 1;        // ≈4px de redondeo en el extremo de dato

// Barra con el extremo de dato redondeado y la base recta: jsPDF solo sabe
// redondear las cuatro esquinas, así que se tapa el lado de la base con un
// rectángulo recto del mismo relleno.
export function barra(doc, x, y, ancho, alto, orientacion) {
  if (alto <= 0 || ancho <= 0) return;
  doc.setFillColor(...GRIS_DATO);
  const corto = orientacion === 'vertical' ? alto : ancho;
  if (corto <= RADIO_DATO * 1.5) {
    doc.rect(x, y, ancho, alto, 'F');
    return;
  }
  const radio = Math.min(RADIO_DATO, corto / 2);
  doc.roundedRect(x, y, ancho, alto, radio, radio, 'F');
  if (orientacion === 'vertical') doc.rect(x, y + alto - radio, ancho, radio, 'F');
  else doc.rect(x, y, radio, alto, 'F');
}

export function ejeTexto(doc) {
  doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...GRIS_TEXTO);
}

// Volumen por categoría: barras horizontales (los nombres son largos), todas del
// mismo gris — la longitud ya codifica la magnitud, teñir de más oscuro al mayor
// sería duplicar el encoding.
export function graficoCategorias(doc, items, y, tope = 5) {
  if (!items.length) return y;

  const visibles = items.slice(0, tope);
  const resto = items.slice(tope);
  if (resto.length) {
    visibles.push({ clave: `Otras (${resto.length})`, cantidad: resto.reduce((a, b) => a + b.cantidad, 0) });
  }

  const anchoEtiqueta = 46;
  const anchoValor = 10;
  const x0 = MARGEN + anchoEtiqueta;
  const anchoPlot = UTIL - anchoEtiqueta - anchoValor;
  const maximo = Math.max(...visibles.map((c) => c.cantidad));
  const grosor = 4;
  const pitch = grosor + 2.6;   // deja hueco de papel entre barras vecinas

  visibles.forEach((c, i) => {
    const yb = y + i * pitch;
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GRIS_TEXTO);
    doc.text(doc.splitTextToSize(c.clave, anchoEtiqueta - 2)[0], MARGEN, yb + grosor / 2 + 1);
    barra(doc, x0, yb, (c.cantidad / maximo) * anchoPlot, grosor, 'horizontal');
    doc.setTextColor(NEGRO);
    doc.text(String(c.cantidad), x0 + (c.cantidad / maximo) * anchoPlot + 1.5, yb + grosor / 2 + 1);
  });

  doc.setTextColor(NEGRO);
  return y + visibles.length * pitch + 3;
}

export function piePaginas(doc, hoy) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GRIS_TEXTO);
    doc.text(`Materen — Sistema TI · Generado el ${hoy}`, MARGEN, ALTO - 8);
    doc.text(`Página ${p} de ${total}`, ANCHO - MARGEN, ALTO - 8, { align: 'right' });
  }
}

// Carga diferida de jsPDF/autoTable + documento A4 en blanco, listo para
// escribir. Todo generador de reporte arranca con esto.
export async function crearDocumentoPdf() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  return { doc, autoTable };
}
