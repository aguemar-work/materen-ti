// Reporte de satisfacción de tickets — PDF descargable para compartir con
// control y gerencia, con el mismo lenguaje visual que el "Reporte" de
// Tickets (reporte.js): título + línea, tablas en gris, pie con fecha y
// paginación. A diferencia de ese reporte, este es SIEMPRE el histórico
// completo (sin recorte de periodo) — mismo criterio que
// ReporteSatisfaccionView.vue.
import { formatFecha, formatFechaHora } from '../../core/formatters.js';
import { aISO } from './reportePeriodo.js';
import { MIN_MUESTRA_PROMEDIO } from '../../api/domains/reportesTickets.js';
import {
  ANCHO, GRIS_TEXTO, NEGRO, celdaVacia, abrirSeccion, nota, bloqueKpis, tabla, piePaginas, crearDocumentoPdf,
} from '../../core/pdfReporte.js';

// Marca con asterisco (no con color: el documento se lee igual impreso en
// blanco y negro) el promedio calculado sobre pocas respuestas — mismo
// umbral que la vista en pantalla.
function celdaPromedio(item) {
  if (item.promedio === null) return '—';
  const asterisco = item.muestra < MIN_MUESTRA_PROMEDIO ? ' *' : '';
  return `${item.promedio.toFixed(1)}/5${asterisco}`;
}

// Conteo por nivel 1-5, en el mismo orden de columnas que la cabecera.
// Ojo: NO se usa el glifo ★ acá (a diferencia de la pantalla) — la fuente
// helvetica estándar de jsPDF solo trae WinAnsi/Latin-1, sin símbolos; con
// columnas "1".."5" + la nota de abajo alcanza para que se entienda igual.
function filaNiveles(conteos) {
  return [1, 2, 3, 4, 5].map((n) => String(conteos?.[n] ?? 0));
}

const ESTILO_COLUMNAS_NIVEL = {
  3: { halign: 'center', cellWidth: 11 },
  4: { halign: 'center', cellWidth: 11 },
  5: { halign: 'center', cellWidth: 11 },
  6: { halign: 'center', cellWidth: 11 },
  7: { halign: 'center', cellWidth: 11 },
  8: { halign: 'right', cellWidth: 20 },
};

// Tabla "Por solicitante" / "Por técnico": mismas 5 columnas de nivel +
// Promedio al final, solo cambian las 2 columnas del medio (Respondidas/
// Pendientes vs. Total/Respondidas) — parametrizadas para no duplicar la
// tabla completa dos veces.
function tablaPorGrupo(doc, autoTable, { titulo, notaTexto, etiquetas2, valores2 }, items, y) {
  y = abrirSeccion(doc, y, titulo, 40);
  y = nota(doc, notaTexto, y);
  y = tabla(doc, autoTable, {
    head: [['Nombre', ...etiquetas2, '1', '2', '3', '4', '5', 'Promedio']],
    body: items.length
      ? items.map((f) => [f.nombre, ...valores2(f), ...filaNiveles(f.conteos), celdaPromedio(f)])
      : celdaVacia('Sin datos', 3 + etiquetas2.length + 5),
    columnStyles: {
      1: { halign: 'right', cellWidth: 22 },
      2: { halign: 'right', cellWidth: 22 },
      ...ESTILO_COLUMNAS_NIVEL,
    },
  }, y);
  if (items.some((f) => f.promedio !== null && f.muestra < MIN_MUESTRA_PROMEDIO)) {
    y = nota(doc, `* Promedio con menos de ${MIN_MUESTRA_PROMEDIO} respuestas con nivel.`, y);
  }
  return y;
}

const COLUMNAS_RESPUESTAS = ['Ticket', 'Solicitante', 'Técnico', 'Nivel', 'Comentario', 'Fecha'];
const ESTILO_COLUMNAS_RESPUESTAS = {
  3: { halign: 'center', cellWidth: 14 },
  5: { halign: 'right', cellWidth: 28 },
};

function filaRespuesta(r) {
  return [
    r.ticketCodigo, r.solicitante, r.tecnico,
    r.nivel !== null ? `${r.nivel}/5` : (r.respondida ? '—' : 'Pendiente'),
    r.comentario || '—',
    formatFechaHora(r.fecha),
  ];
}

// "Todas las respuestas" y "Respuestas con baja satisfacción" comparten la
// misma forma de fila — cada una con su propio recorte/aviso de cuántas
// quedaron afuera (mismo criterio que MAX_COMENTARIOS en reportesTickets.js)
// y, opcionalmente, una nota introductoria propia (ej. el criterio de orden).
function tablaRespuestas(doc, autoTable, { titulo, notaIntro, mensajeVacio }, respuestas, total, y) {
  y = abrirSeccion(doc, y, titulo, 34);
  if (notaIntro) y = nota(doc, notaIntro, y);
  if (total > respuestas.length) {
    y = nota(doc, `Se muestran las ${respuestas.length} más recientes de ${total}.`, y);
  }
  return tabla(doc, autoTable, {
    head: [COLUMNAS_RESPUESTAS],
    body: respuestas.length ? respuestas.map(filaRespuesta) : celdaVacia(mensajeVacio, 6),
    columnStyles: ESTILO_COLUMNAS_RESPUESTAS,
  }, y);
}

// Construye el documento y devuelve { doc, nombre }. Separado de la descarga
// para poder verificar el PDF en tests; la UI usa generarReporteSatisfaccion(),
// abajo.
export async function construirReporteSatisfaccion(datos, { nombreArchivo = '' } = {}) {
  const { doc, autoTable } = await crearDocumentoPdf();
  const hoy = formatFecha(aISO(new Date()));
  const tasaRespuesta = datos.encuestasGeneradas
    ? Math.round((datos.encuestasRespondidas / datos.encuestasGeneradas) * 100)
    : 0;

  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(NEGRO);
  doc.text('REPORTE DE SATISFACCIÓN DE TICKETS', ANCHO / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS_TEXTO);
  doc.text('Histórico completo, sin recorte de periodo', ANCHO / 2, 24, { align: 'center' });
  doc.setTextColor(NEGRO);

  let y = 32;
  y = bloqueKpis(doc, [
    { valor: datos.encuestasGeneradas, label: 'Encuestas generadas' },
    { valor: datos.encuestasRespondidas, label: 'Respondidas' },
    { valor: `${tasaRespuesta}%`, label: 'Tasa de respuesta' },
    { valor: datos.promedioGeneral !== null ? `${datos.promedioGeneral.toFixed(1)}/5` : '—', label: 'Promedio general' },
  ], y);

  y = tablaPorGrupo(doc, autoTable, {
    titulo: 'Por solicitante',
    notaTexto: `Columnas 1 a 5: cantidad de respuestas de ese nivel (1 = muy insatisfecho, 5 = muy satisfecho). Promedio marcado con * cuando tiene menos de ${MIN_MUESTRA_PROMEDIO} respuestas con nivel.`,
    etiquetas2: ['Respondidas', 'Pendientes'],
    valores2: (f) => [String(f.encuestasRespondidas), String(f.encuestasGeneradas - f.encuestasRespondidas)],
  }, datos.porSolicitante, y);

  y = tablaPorGrupo(doc, autoTable, {
    titulo: 'Por técnico',
    notaTexto: 'Es quien marcó el ticket como resuelto por última vez, no necesariamente el asignado actual. Columnas 1 a 5: cantidad de respuestas de ese nivel.',
    etiquetas2: ['Total', 'Respondidas'],
    valores2: (f) => [String(f.encuestasGeneradas), String(f.encuestasRespondidas)],
  }, datos.porTecnico, y);

  y = tablaRespuestas(doc, autoTable, {
    titulo: 'Todas las respuestas',
    mensajeVacio: 'Sin encuestas todavía',
  }, datos.respuestas, datos.respuestasTotal, y);

  tablaRespuestas(doc, autoTable, {
    // Sin "≤": la fuente helvetica estándar de jsPDF (WinAnsi/Latin-1) no
    // trae ese glifo — con él, el título sale con espacios entre cada letra
    // en vez de texto normal (mismo motivo por el que las columnas de nivel
    // usan "1".."5" en vez de "★" acá arriba).
    titulo: 'Respuestas con baja satisfacción (nivel 3 o menos)',
    notaIntro: 'Para entender el motivo de una calificación baja — ordenadas de peor a mejor nivel, más reciente primero a igual nivel.',
    mensajeVacio: 'Sin respuestas con nivel 3 o menos',
  }, datos.respuestasBajas, datos.respuestasBajasTotal, y);

  piePaginas(doc, hoy);
  return { doc, nombre: `${nombreArchivo || `Satisfaccion_${aISO(new Date())}`}.pdf` };
}

export async function generarReporteSatisfaccion(...args) {
  const { doc, nombre } = await construirReporteSatisfaccion(...args);
  doc.save(nombre);
}
