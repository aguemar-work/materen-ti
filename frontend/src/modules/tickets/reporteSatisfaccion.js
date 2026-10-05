// Reporte de satisfacción de tickets — PDF descargable para compartir con
// control y gerencia, con el lenguaje visual de core/pdfReporte.js: título +
// línea, tablas en gris, pie con fecha y paginación. Es SIEMPRE el histórico
// completo (sin recorte de período), mismo criterio que
// ReporteSatisfaccionView.vue, y NO calcula nada: todo (promedios, muestra
// mínima, desglose 1-5, insatisfechos) llega de reporte_satisfaccion_consolidado
// (migración 115); acá solo se da formato.
import { formatFecha, formatFechaHora, fechaISO as aISO } from '../../core/formatters.js';
import {
  ANCHO, GRIS_TEXTO, NEGRO, celdaVacia, abrirSeccion, nota, bloqueKpis, tabla, piePaginas, crearDocumentoPdf,
} from '../../core/pdfReporte.js';

// Un promedio que el servidor no publicó (muestra menor al mínimo) se imprime
// como "n insuficiente (k)", nunca como número: el documento se lee igual en
// blanco y negro y nadie compara un 5,0 sobre una sola respuesta.
function celdaPromedio(item) {
  if (item.promedio === null || item.promedio === undefined) {
    return item.muestra ? `n insuficiente (${item.muestra})` : '—';
  }
  return `${Number(item.promedio).toFixed(1)}/5`;
}

// Conteo por nivel 1-5, en el mismo orden de columnas que la cabecera.
// Ojo: NO se usa el glifo ★ acá (a diferencia de la pantalla) — la fuente
// helvetica estándar de jsPDF solo trae WinAnsi/Latin-1, sin símbolos; con
// columnas "1".."5" + la nota de abajo alcanza para que se entienda igual.
function filaNiveles(niveles) {
  return [1, 2, 3, 4, 5].map((n) => String(niveles?.[n] ?? 0));
}

const ESTILO_COLUMNAS_NIVEL = {
  3: { halign: 'center', cellWidth: 11 },
  4: { halign: 'center', cellWidth: 11 },
  5: { halign: 'center', cellWidth: 11 },
  6: { halign: 'center', cellWidth: 11 },
  7: { halign: 'center', cellWidth: 11 },
  8: { halign: 'right', cellWidth: 26 },
};

// Tabla "Por solicitante" / "Por técnico" / "Por mes": mismas 5 columnas de
// nivel + Promedio al final, solo cambian las 2 columnas del medio.
function tablaPorGrupo(doc, autoTable, { titulo, notaTexto, etiquetas2, valores2, nombreDe }, items, y) {
  y = abrirSeccion(doc, y, titulo, 40);
  y = nota(doc, notaTexto, y);
  return tabla(doc, autoTable, {
    head: [['Nombre', ...etiquetas2, '1', '2', '3', '4', '5', 'Promedio']],
    body: items.length
      ? items.map((f) => [nombreDe(f), ...valores2(f), ...filaNiveles(f.niveles), celdaPromedio(f)])
      : celdaVacia('Sin datos', 3 + etiquetas2.length + 5),
    columnStyles: {
      1: { halign: 'right', cellWidth: 22 },
      2: { halign: 'right', cellWidth: 22 },
      ...ESTILO_COLUMNAS_NIVEL,
    },
  }, y);
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

// "Todas las respuestas" y "Respuestas insatisfechas" comparten la forma de
// fila — cada una con su propio recorte/aviso de cuántas quedaron afuera.
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

/**
 * Construye el documento y devuelve { doc, nombre }. Separado de la descarga
 * para poder verificar el PDF en tests; la UI usa generarReporteSatisfaccion().
 * `datos`: { muestraMinima, resumen: {encuestasGeneradas, encuestasRespondidas,
 * tasaRespuestaPct, promedio, muestra}, porSolicitante, porTecnico (con
 * `nombre` resuelto), porMes, respuestasTotal, respuestas, respuestasBajasTotal,
 * respuestasBajas }.
 */
export async function construirReporteSatisfaccion(datos, { nombreArchivo = '' } = {}) {
  const { doc, autoTable } = await crearDocumentoPdf();
  const hoy = formatFecha(aISO(new Date()));
  const minimo = datos.muestraMinima ?? 5;
  const resumen = datos.resumen || {};

  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(NEGRO);
  doc.text('REPORTE DE SATISFACCIÓN DE TICKETS', ANCHO / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS_TEXTO);
  doc.text(`Histórico completo, sin recorte de periodo. Promedios publicados solo con ${minimo} o más respuestas con nivel.`, ANCHO / 2, 24, { align: 'center' });
  doc.setTextColor(NEGRO);

  let y = 32;
  y = bloqueKpis(doc, [
    { valor: resumen.encuestasGeneradas ?? 0, label: 'Encuestas generadas' },
    { valor: resumen.encuestasRespondidas ?? 0, label: 'Respondidas' },
    { valor: resumen.tasaRespuestaPct == null ? '—' : `${resumen.tasaRespuestaPct}%`, label: 'Tasa de respuesta' },
    { valor: celdaPromedio(resumen), label: 'Promedio general' },
  ], y);

  const notaNiveles = `Columnas 1 a 5: cantidad de respuestas de ese nivel (1 = muy insatisfecho, 5 = muy satisfecho). "n insuficiente" = menos de ${minimo} respuestas con nivel: el promedio no se publica.`;
  y = tablaPorGrupo(doc, autoTable, {
    titulo: 'Por solicitante',
    notaTexto: notaNiveles,
    etiquetas2: ['Respondidas', 'Pendientes'],
    valores2: (f) => [String(f.encuestasRespondidas), String(f.encuestasGeneradas - f.encuestasRespondidas)],
    nombreDe: (f) => f.nombre,
  }, datos.porSolicitante || [], y);

  y = tablaPorGrupo(doc, autoTable, {
    titulo: 'Por técnico',
    notaTexto: 'Es quien marcó el ticket como resuelto por última vez, no necesariamente el asignado actual. Columnas 1 a 5: cantidad de respuestas de ese nivel.',
    etiquetas2: ['Total', 'Respondidas'],
    valores2: (f) => [String(f.encuestasGeneradas), String(f.encuestasRespondidas)],
    nombreDe: (f) => f.nombre,
  }, datos.porTecnico || [], y);

  y = tablaPorGrupo(doc, autoTable, {
    titulo: 'Por mes de resolución',
    notaTexto: 'Encuestas de los tickets resueltos en cada mes (hora de Lima); el mes más reciente primero.',
    etiquetas2: ['Generadas', 'Respondidas'],
    valores2: (f) => [String(f.encuestasGeneradas), String(f.encuestasRespondidas)],
    nombreDe: (f) => formatFecha(f.mes).slice(3),
  }, datos.porMes || [], y);

  y = tablaRespuestas(doc, autoTable, {
    titulo: 'Todas las respuestas',
    mensajeVacio: 'Sin encuestas todavía',
  }, datos.respuestas || [], datos.respuestasTotal ?? 0, y);

  tablaRespuestas(doc, autoTable, {
    // Sin "≤": la fuente helvetica estándar de jsPDF (WinAnsi/Latin-1) no
    // trae ese glifo — con él, el título sale con espacios entre cada letra.
    titulo: 'Respuestas insatisfechas (nivel 1 o 2)',
    notaIntro: 'Para entender el motivo de una calificación baja — ordenadas de peor a mejor nivel, más reciente primero a igual nivel.',
    mensajeVacio: 'Sin respuestas con nivel 2 o menos',
  }, datos.respuestasBajas || [], datos.respuestasBajasTotal ?? 0, y);

  piePaginas(doc, hoy);
  return { doc, nombre: `${nombreArchivo || `Satisfaccion_${aISO(new Date())}`}.pdf` };
}

export async function generarReporteSatisfaccion(...args) {
  const { doc, nombre } = await construirReporteSatisfaccion(...args);
  doc.save(nombre);
}
