// Reporte de tickets — documento imprimible/descargable (Guardar como PDF)
// para compartir con el área de control y gerencia. Mismo patrón que
// equipos/acta.js: HTML standalone que se abre en ventana nueva y se imprime.
import { formatFecha } from '../../core/formatters.js';

function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function filasConteo(items) {
  if (!items.length) return '<tr><td colspan="2" class="vacio">Sin datos</td></tr>';
  return items.map((i) => `<tr><td>${esc(i.clave)}</td><td class="num">${i.cantidad}</td></tr>`).join('');
}

function filasTecnicos(items) {
  if (!items.length) return '<tr><td colspan="2" class="vacio">Sin tickets resueltos en el periodo</td></tr>';
  return items.map((t) => `<tr><td>${esc(t.nombre)}</td><td class="num">${t.cantidad}</td></tr>`).join('');
}

const ENCUESTA_LABELS = { respondida: 'Respondida', pendiente: 'Pendiente' };

function filasTicketsPeriodo(items) {
  if (!items.length) return '<tr><td colspan="3" class="vacio">Sin tickets creados en el periodo</td></tr>';
  return items.map((t) =>
    `<tr><td class="codigo">${esc(t.codigo)}</td><td>${esc(t.solicitante || '—')}</td><td>${ENCUESTA_LABELS[t.encuesta] || '—'}</td></tr>`,
  ).join('');
}

export function generarReporteTickets(datos, periodoLabel, rangoLabel) {
  const hoy = formatFecha(new Date().toISOString());
  const tasaRespuesta = datos.encuestasEnviadas
    ? Math.round((datos.encuestasRespondidas / datos.encuestasEnviadas) * 100)
    : 0;

  const comentariosHtml = datos.comentarios.length
    ? datos.comentarios.map((c) =>
        `<li><strong>${c.nivel}/5</strong> — ${esc(c.comentario)} <span class="fecha-com">(${esc(formatFecha(c.fecha))})</span></li>`,
      ).join('')
    : '<li class="vacio">Sin comentarios en el periodo</li>';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte de tickets — ${esc(periodoLabel)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12.5px;
    color: #111;
    max-width: 760px;
    margin: 0 auto;
    padding: 36px 28px;
    line-height: 1.5;
  }
  h1 { font-size: 18px; text-align: center; text-transform: uppercase; letter-spacing: 0.04em; }
  .subtitulo { text-align: center; font-size: 12px; color: #444; margin-bottom: 22px; }
  h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;
    border-bottom: 1.5px solid #111; padding-bottom: 3px; margin: 20px 0 8px;
  }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  td, th { padding: 4px 8px; border: 1px solid #bbb; vertical-align: top; text-align: left; }
  td.num, th.num { text-align: right; width: 90px; }
  td.codigo { font-family: 'Courier New', monospace; white-space: nowrap; width: 110px; }
  .vacio { color: #777; font-style: italic; text-align: center; }
  .kpis { display: flex; gap: 14px; margin-bottom: 14px; }
  .kpi { flex: 1; border: 1px solid #bbb; border-radius: 4px; padding: 10px; text-align: center; }
  .kpi .valor { font-size: 22px; font-weight: bold; }
  .kpi .label { font-size: 10.5px; color: #555; text-transform: uppercase; letter-spacing: 0.03em; }
  ul.comentarios { list-style: none; }
  ul.comentarios li { border-bottom: 1px solid #ddd; padding: 6px 0; }
  .fecha-com { color: #777; font-size: 10.5px; }
  .pie { margin-top: 24px; text-align: center; font-size: 10.5px; color: #777; }
  @media print { body { padding: 10mm 6mm; } }
</style>
</head>
<body>
  <h1>Reporte de Tickets — ${esc(periodoLabel)}</h1>
  <p class="subtitulo">Materen — Sistema TI · ${esc(rangoLabel)} · Generado el ${esc(hoy)}</p>

  <div class="kpis">
    <div class="kpi"><div class="valor">${datos.totalCreados}</div><div class="label">Creados</div></div>
    <div class="kpi"><div class="valor">${datos.totalResueltos}</div><div class="label">Resueltos</div></div>
    <div class="kpi"><div class="valor">${datos.promedioSatisfaccion !== null ? datos.promedioSatisfaccion.toFixed(1) : '—'}/5</div><div class="label">Satisfacción</div></div>
    <div class="kpi"><div class="valor">${tasaRespuesta}%</div><div class="label">Tasa de respuesta</div></div>
  </div>

  <h2>Por categoría</h2>
  <table><tbody>${filasConteo(datos.porCategoria)}</tbody></table>

  <h2>Por prioridad</h2>
  <table><tbody>${filasConteo(datos.porPrioridadLabel)}</tbody></table>

  <h2>Por estado actual</h2>
  <table><tbody>${filasConteo(datos.porEstadoLabel)}</tbody></table>

  <h2>Desempeño por técnico (resueltos en el periodo)</h2>
  <table><tbody>${filasTecnicos(datos.porTecnicoNombres)}</tbody></table>

  <h2>Tickets del periodo</h2>
  <table>
    <thead><tr><th>Ticket</th><th>Solicitante</th><th>Encuesta</th></tr></thead>
    <tbody>${filasTicketsPeriodo(datos.ticketsPeriodo)}</tbody>
  </table>

  <h2>Satisfacción del servicio</h2>
  <table>
    <tr><td>Encuestas enviadas</td><td class="num">${datos.encuestasEnviadas}</td></tr>
    <tr><td>Encuestas respondidas</td><td class="num">${datos.encuestasRespondidas}</td></tr>
    <tr><td>Tasa de respuesta</td><td class="num">${tasaRespuesta}%</td></tr>
    <tr><td>Promedio (1-5)</td><td class="num">${datos.promedioSatisfaccion !== null ? datos.promedioSatisfaccion.toFixed(2) : '—'}</td></tr>
  </table>

  <h2>Comentarios recientes</h2>
  <ul class="comentarios">${comentariosHtml}</ul>

  <p class="pie">Documento generado por Materen — Sistema TI el ${esc(hoy)}</p>

  <script>window.onload = function () { window.print(); };</` + `script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=850,height=1000');
  if (!win) throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.');
  win.document.write(html);
  win.document.close();
}
