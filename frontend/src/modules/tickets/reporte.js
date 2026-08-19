// Reporte de tickets — PDF descargable para compartir con control y gerencia.
//
// Antes se abría una ventana con HTML y se disparaba window.print(): el staff
// tenía que pasar por el diálogo de impresión y elegir "Guardar como PDF", y si
// el navegador bloqueaba la ventana emergente no salía nada. Ahora se genera el
// PDF y se descarga directo, con texto vectorial (seleccionable y buscable, no
// una captura de pantalla).
//
// La geometría de página, los estilos de tabla y los bloques de layout
// (título de sección, nota, KPIs, pie de página) viven en core/pdfReporte.js
// — compartidos con reporteSatisfaccion.js, que arma el PDF de
// /tickets/satisfaccion con el mismo lenguaje visual.
import { formatFecha, formatFechaHora, formatHoras as horas, formatDelta as delta } from '../../core/formatters.js';
import { aISO } from './reportePeriodo.js';
import {
  ANCHO, ALTO, MARGEN, UTIL, GRIS_LINEA, GRIS_TEXTO, NEGRO, ESTILOS_TABLA,
  celdaVacia, ubicarSeccion, abrirSeccion, nota, bloqueKpis, tabla, piePaginas, crearDocumentoPdf,
} from '../../core/pdfReporte.js';

export { ubicarSeccion };

// ── Gráficos ────────────────────────────────────────────────────────────────
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
const GRIS_DATO = [74, 74, 74];
const GRIS_GUIA = [214, 214, 214];
const GROSOR_MAX = 4.5;      // ≈24px: la barra no llena su carril, deja aire
const HUECO_MIN = 0.6;       // ≈2px de papel entre barras vecinas
const RADIO_DATO = 1;        // ≈4px de redondeo en el extremo de dato

// Barra con el extremo de dato redondeado y la base recta: jsPDF solo sabe
// redondear las cuatro esquinas, así que se tapa el lado de la base con un
// rectángulo recto del mismo relleno.
function barra(doc, x, y, ancho, alto, orientacion) {
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

function ejeTexto(doc) {
  doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...GRIS_TEXTO);
}

// Volumen por día: columnas desde una única línea base. Con menos de dos días no
// se dibuja — un gráfico de una sola barra no aporta nada que el KPI no diga.
function graficoPorDia(doc, porDia, y) {
  if (porDia.length < 2) return y;

  const altoPlot = 26;
  const bandaEtiquetas = 5;
  const base = y + altoPlot;
  const maximo = Math.max(...porDia.map((d) => d.cantidad));
  const carril = UTIL / porDia.length;
  const ancho = Math.max(0.8, Math.min(GROSOR_MAX, carril - HUECO_MIN));

  doc.setDrawColor(...GRIS_GUIA).setLineWidth(0.1);
  doc.line(MARGEN, base, ANCHO - MARGEN, base);          // línea base
  doc.line(MARGEN, y, ANCHO - MARGEN, y);                // guía del máximo
  ejeTexto(doc);
  doc.text(String(maximo), ANCHO - MARGEN + 0.5, y + 1.2);
  doc.text('0', ANCHO - MARGEN + 0.5, base + 1.2);

  const pico = porDia.reduce((a, b) => (b.cantidad > a.cantidad ? b : a), porDia[0]);
  const paso = porDia.length <= 16 ? 1 : Math.ceil(porDia.length / 12);

  porDia.forEach((dia, i) => {
    const alto = (dia.cantidad / maximo) * altoPlot;
    const x = MARGEN + i * carril + (carril - ancho) / 2;
    barra(doc, x, base - alto, ancho, alto, 'vertical');

    if (i % paso === 0 || i === porDia.length - 1) {
      ejeTexto(doc);
      doc.text(String(Number(dia.fecha.slice(8, 10))), x + ancho / 2, base + 3.4, { align: 'center' });
    }
    // Solo el pico lleva su valor encima; el resto lo cuenta el eje.
    if (dia === pico) {
      ejeTexto(doc);
      doc.text(String(dia.cantidad), x + ancho / 2, base - alto - 1.2, { align: 'center' });
    }
  });

  doc.setTextColor(NEGRO);
  return base + bandaEtiquetas + 4;
}

// Volumen por categoría: barras horizontales (los nombres son largos), todas del
// mismo gris — la longitud ya codifica la magnitud, teñir de más oscuro al mayor
// sería duplicar el encoding.
function graficoCategorias(doc, items, y, tope = 5) {
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

// Categoría / prioridad / estado van una al lado de la otra: son listas cortas
// y apiladas gastaban media página.
function tablasConteo(doc, autoTable, bloques, y) {
  const hueco = 4;
  const ancho = (UTIL - hueco * (bloques.length - 1)) / bloques.length;
  let finalY = y;
  bloques.forEach((bloque, i) => {
    autoTable(doc, {
      ...ESTILOS_TABLA,
      startY: y,
      tableWidth: ancho,
      margin: { left: MARGEN + i * (ancho + hueco), right: MARGEN, top: MARGEN, bottom: MARGEN + 6 },
      head: [[bloque.titulo, 'Cant.']],
      body: bloque.items.length
        ? bloque.items.map((it) => [it.clave, String(it.cantidad)])
        : celdaVacia('Sin datos', 2),
      columnStyles: { 1: { halign: 'right', cellWidth: 13 } },
    });
    finalY = Math.max(finalY, doc.lastAutoTable.finalY);
  });
  return finalY + 7;
}

// Construye el documento y devuelve { doc, nombre }. Separado de la descarga
// para poder verificar el PDF en tests sin depender de la API de descarga del
// navegador; la UI usa generarReporteTickets(), abajo.
export async function construirReporteTickets(datos, {
  periodoLabel = '', rangoLabel = '', alcanceLabel = '', nombreArchivo = '', enCurso = false, comparativa = null,
  incluirTasaRespuesta = false, etiquetaResueltosMismoPeriodo = 'del periodo', etiquetaColMismoPeriodo = 'Del periodo',
} = {}) {
  const { doc, autoTable } = await crearDocumentoPdf();
  const hoy = formatFecha(aISO(new Date()));
  // Tasa sobre las encuestas generadas al cerrar (mismo criterio que el modal).
  const tasaRespuesta = datos.encuestasGeneradas
    ? Math.round((datos.encuestasRespondidas / datos.encuestasGeneradas) * 100)
    : 0;
  const promedio = datos.promedioSatisfaccion !== null ? datos.promedioSatisfaccion.toFixed(2) : '—';

  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(NEGRO);
  doc.text('REPORTE DE TICKETS', ANCHO / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'bold').setFontSize(9.5);
  doc.text(periodoLabel, ANCHO / 2, 24, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS_TEXTO);
  // Alcance junto al periodo, siempre visible (no solo cuando es "propia"):
  // un reporte de equipo que no diga que es de equipo es tan ambiguo como
  // uno individual que no lo diga.
  doc.text(`Periodo ${rangoLabel}${alcanceLabel ? ` · ${alcanceLabel}` : ''}`, ANCHO / 2, 29, { align: 'center' });
  doc.setTextColor(NEGRO);

  let y = 36;
  if (enCurso) {
    doc.setDrawColor(...GRIS_LINEA).setLineWidth(0.2);
    doc.roundedRect(MARGEN, y - 4, UTIL, 7, 1, 1);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS_TEXTO);
    doc.text('Periodo en curso: los totales aún pueden variar hasta que termine.', ANCHO / 2, y, { align: 'center' });
    doc.setTextColor(NEGRO);
    y += 9;
  }

  const itemsKpis = [
    { valor: datos.totalCreados, label: 'Creados', delta: delta(datos.totalCreados, comparativa?.totalCreados) },
    { valor: datos.totalResueltos, label: 'Resueltos', delta: delta(datos.totalResueltos, comparativa?.totalResueltos) },
    { valor: `${datos.promedioSatisfaccion !== null ? datos.promedioSatisfaccion.toFixed(1) : '—'}/5`, label: 'Satisfacción', delta: delta(datos.promedioSatisfaccion, comparativa?.promedioSatisfaccion, 1) },
  ];
  if (incluirTasaRespuesta) {
    itemsKpis.push({ valor: `${tasaRespuesta}%`, label: 'Tasa de respuesta', delta: delta(tasaRespuesta, comparativa?.tasaRespuesta, 0, ' pp') });
  }
  y = bloqueKpis(doc, itemsKpis, y);
  if (comparativa?.etiqueta) {
    doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...GRIS_TEXTO);
    doc.text(`Variación respecto a ${comparativa.etiqueta}`, ANCHO / 2, y - 3.5, { align: 'center' });
    doc.setTextColor(NEGRO);
  }
  y = nota(doc, `Del total resuelto: ${datos.resueltosMismoPeriodo ?? 0} ${etiquetaResueltosMismoPeriodo}, ${datos.resueltosArrastrados ?? 0} anteriores.`, y);

  y = abrirSeccion(doc, y, 'Volumen y distribución', 40);
  y = graficoPorDia(doc, datos.porDia || [], y);
  y = graficoCategorias(doc, datos.porCategoria, y);
  y = tablasConteo(doc, autoTable, [
    { titulo: 'Categoría', items: datos.porCategoria },
    { titulo: 'Prioridad', items: datos.porPrioridadLabel },
    { titulo: 'Tipo', items: datos.porTipoLabel },
  ], y);

  y = abrirSeccion(doc, y, 'Tiempos y calidad de la atención', 40);
  y = tabla(doc, autoTable, {
    head: [['Indicador', 'Valor']],
    body: [
      ['Tiempo medio de resolución', horas(datos.tiempoResolucion?.promedio)],
      ['Mediana de resolución', horas(datos.tiempoResolucion?.mediana)],
      ['Tickets medidos', String(datos.tiempoResolucion?.muestra ?? 0)],
      ['Reaperturas en el periodo', String(datos.reaperturas ?? 0)],
      ['Tasa de reapertura (sobre resueltos)', datos.tasaReapertura === null ? '—' : `${datos.tasaReapertura}%`],
    ],
    columnStyles: { 1: { halign: 'right', cellWidth: 34 } },
  }, y);
  y = tabla(doc, autoTable, {
    head: [['Prioridad', 'Resueltos', 'Tiempo medio', 'Mediana']],
    body: (datos.tiempoPorPrioridadLabel || []).length
      ? datos.tiempoPorPrioridadLabel.map((f) => [f.clave, String(f.muestra), horas(f.promedio), horas(f.mediana)])
      : celdaVacia('Sin tickets resueltos en el periodo', 4),
    columnStyles: {
      1: { halign: 'right', cellWidth: 24 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 26 },
    },
  }, y);

  y = abrirSeccion(doc, y, 'Desempeño por técnico', 34);
  y = tabla(doc, autoTable, {
    head: [['Técnico', 'Resueltos', etiquetaColMismoPeriodo, 'Anteriores', 'Tiempo medio', 'Mediana']],
    body: datos.porTecnicoNombres.length
      ? datos.porTecnicoNombres.map((t) => [t.nombre, String(t.cantidad), String(t.mismoPeriodo), String(t.arrastrados), horas(t.promedio), horas(t.mediana)])
      : celdaVacia('Sin tickets resueltos en el periodo', 6),
    columnStyles: {
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 20 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 22 },
    },
  }, y);

  y = abrirSeccion(doc, y, 'Tickets anteriores resueltos en el periodo', 34);
  y = tabla(doc, autoTable, {
    head: [['Código', 'Título', 'Técnico', 'Creado el', 'Días abierto']],
    body: (datos.arrastradosNombres || []).length
      ? datos.arrastradosNombres.map((a) => [a.codigo, a.titulo, a.tecnico, formatFecha(a.creadoEn), String(a.diasAbierto)])
      : celdaVacia('Sin tickets arrastrados resueltos en el periodo', 5),
    columnStyles: {
      3: { halign: 'right', cellWidth: 24 },
      4: { halign: 'right', cellWidth: 22 },
    },
  }, y);

  y = abrirSeccion(doc, y, 'Tickets del periodo por solicitante', 38);
  y = nota(doc, '"Histórico" es el total de siempre para ese usuario, no de este periodo — el resto de columnas sí es solo del periodo.', y);
  y = tabla(doc, autoTable, {
    head: [['Usuario', 'Histórico', 'Ticket creado', 'Ticket resuelto', 'Rechazado', 'Enc. contestadas', 'Enc. pendientes']],
    body: datos.porSolicitante.length
      ? datos.porSolicitante.map((s) => [
        s.solicitante, String(s.total), String(s.creados), String(s.resueltos),
        String(s.rechazados), String(s.encuestasContestadas), String(s.encuestasPendientes),
      ])
      : celdaVacia('Sin tickets creados en el periodo', 7),
    columnStyles: {
      1: { halign: 'right', cellWidth: 14 },
      2: { halign: 'right', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 22 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 26 },
      6: { halign: 'right', cellWidth: 26 },
    },
  }, y);

  y = abrirSeccion(doc, y, 'Satisfacción del servicio', 34);
  y = tabla(doc, autoTable, {
    head: [['Indicador', 'Valor']],
    body: [
      ['Encuestas generadas', String(datos.encuestasGeneradas)],
      ['Encuestas respondidas', String(datos.encuestasRespondidas)],
      ['Tasa de respuesta', `${tasaRespuesta}%`],
      ['Promedio (1-5)', promedio],
    ],
    columnStyles: { 1: { halign: 'right', cellWidth: 30 } },
  }, y);

  y = abrirSeccion(doc, y, 'Comentarios del periodo', 30);
  if (datos.comentariosTotal > datos.comentarios.length) {
    y = nota(doc, `Se muestran los ${datos.comentarios.length} más recientes de ${datos.comentariosTotal}.`, y);
  }
  tabla(doc, autoTable, {
    head: [['Nivel', 'Comentario', 'Fecha']],
    body: datos.comentarios.length
      ? datos.comentarios.map((c) => [`${c.nivel}/5`, c.comentario, formatFechaHora(c.fecha)])
      : celdaVacia('Sin comentarios en el periodo', 3),
    columnStyles: {
      0: { halign: 'center', cellWidth: 14 },
      2: { halign: 'right', cellWidth: 30 },
    },
  }, y);

  piePaginas(doc, hoy);
  return { doc, nombre: `${nombreArchivo || `Reporte_${aISO(new Date())}`}.pdf` };
}

export async function generarReporteTickets(...args) {
  const { doc, nombre } = await construirReporteTickets(...args);
  doc.save(nombre);
}
