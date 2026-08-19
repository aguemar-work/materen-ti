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
