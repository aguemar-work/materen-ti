// Acta de devolución de equipo — documento imprimible para firma física.
// Se abre en una ventana nueva lista para imprimir o guardar como PDF.
import { formatFecha } from '../../core/formatters.js';

function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const MOTIVO_LABELS = {
  devolucion: 'Devolución normal',
  cambio_equipo: 'Cambio de equipo',
  baja_empleado: 'Baja del empleado',
  perdida: 'Pérdida / robo',
};

export function generarActaDevolucion(equipo, empleado, datosDevolucion) {
  const hoy = formatFecha(new Date().toISOString());
  const fechaDevolucion = datosDevolucion.fecha ? formatFecha(datosDevolucion.fecha) : hoy;
  const motivoLabel = MOTIVO_LABELS[datosDevolucion.motivo] || datosDevolucion.motivo || '—';

  const lineas = equipo.accesorios_lineas?.length
    ? equipo.accesorios_lineas
    : (equipo.accesorios || []).map((d) => ({ descripcion: d, cantidad: 1 }));
  const accesorios = lineas.length
    ? `<ul class="acc-ul">${lineas.map((l) => {
        const cant = (l.cantidad || 1) > 1 ? ` ×${l.cantidad}` : '';
        const cod = l.codigo ? `<span class="acc-cod">${esc(l.codigo)}</span> ` : '';
        return `<li>${cod}${esc(l.descripcion)}${cant}</li>`;
      }).join('')}</ul>`
    : 'Ninguno';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Acta de devolución — ${esc(equipo.codigo)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12.5px;
    color: #111;
    max-width: 700px;
    margin: 0 auto;
    padding: 36px 28px;
    line-height: 1.5;
  }
  h1 { font-size: 17px; text-align: center; text-transform: uppercase; letter-spacing: 0.04em; }
  .subtitulo { text-align: center; font-size: 12px; color: #444; margin-bottom: 22px; }
  h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;
    border-bottom: 1.5px solid #111; padding-bottom: 3px; margin: 20px 0 8px;
  }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 8px; border: 1px solid #bbb; vertical-align: top; }
  td.lbl { width: 32%; font-weight: bold; background: #f3f3f3; }
  .acc-ul { margin: 0; padding-left: 16px; }
  .acc-ul li { margin: 2px 0; }
  .acc-cod { font-family: Consolas, monospace; color: #444; font-size: 11px; }
  .clausula { margin-top: 18px; font-size: 11.5px; text-align: justify; color: #222; }
  .firmas { display: flex; justify-content: space-between; gap: 40px; margin-top: 70px; }
  .firma { flex: 1; text-align: center; }
  .firma .linea { border-top: 1px solid #111; padding-top: 6px; font-size: 11.5px; }
  .firma .rol { font-weight: bold; }
  .pie { margin-top: 30px; text-align: center; font-size: 10.5px; color: #777; }
  @media print { body { padding: 10mm 6mm; } }
</style>
</head>
<body>
  <h1>Acta de Devolución de Equipo</h1>
  <p class="subtitulo">${esc(equipo.empresa_nombre || 'Sistema TI')} — ${esc(fechaDevolucion)}</p>

  <h2>1. Datos de quien devuelve</h2>
  <table>
    <tr><td class="lbl">Nombre completo</td><td>${esc(empleado.nombres)} ${esc(empleado.apellidos)}</td></tr>
    <tr><td class="lbl">DNI</td><td>${esc(empleado.dni)}</td></tr>
    <tr><td class="lbl">Cargo</td><td>${esc(empleado.cargo || '—')}</td></tr>
    <tr><td class="lbl">Empresa</td><td>${esc(empleado.empresa_nombre || '—')}</td></tr>
  </table>

  <h2>2. Datos del equipo</h2>
  <table>
    <tr><td class="lbl">Código de equipo</td><td>${esc(equipo.codigo)}</td></tr>
    <tr><td class="lbl">Código de almacén</td><td>${esc(equipo.codigo_almacen || '—')}</td></tr>
    <tr><td class="lbl">Tipo</td><td>${esc(equipo.tipo_nombre)}</td></tr>
    <tr><td class="lbl">Marca / Modelo</td><td>${esc(equipo.marca || '—')} ${esc(equipo.modelo || '')}</td></tr>
    <tr><td class="lbl">Número de serie</td><td>${esc(equipo.serie || '—')}</td></tr>
    <tr><td class="lbl">Accesorios devueltos</td><td>${accesorios}</td></tr>
  </table>

  <h2>3. Datos de la devolución</h2>
  <table>
    <tr><td class="lbl">Condición de devolución</td><td>${esc(datosDevolucion.condicion || '—')}</td></tr>
    <tr><td class="lbl">Motivo</td><td>${esc(motivoLabel)}</td></tr>
    <tr><td class="lbl">¿Enviado a reparación?</td><td>${datosDevolucion.aReparacion ? 'Sí' : 'No'}</td></tr>
    <tr><td class="lbl">Fecha de devolución</td><td>${esc(fechaDevolucion)}</td></tr>
  </table>

  <p class="clausula">
    Declaro haber devuelto el equipo descrito en la presente acta, junto con los
    accesorios detallados, en la condición indicada, quedando liberado de la
    responsabilidad de custodia asumida al momento de la entrega. El área de TI
    verificará el estado del equipo y, de existir daños o faltantes no reportados
    en este documento, se reserva el derecho de determinar la responsabilidad
    correspondiente.
  </p>

  <div class="firmas">
    <div class="firma">
      <div class="linea">
        <span class="rol">Entrega conforme</span><br>
        ${esc(empleado.nombres)} ${esc(empleado.apellidos)}<br>
        DNI: ${esc(empleado.dni)}
      </div>
    </div>
    <div class="firma">
      <div class="linea">
        <span class="rol">Recibe — Área de TI</span><br>
        Nombre y firma
      </div>
    </div>
  </div>

  <p class="pie">Documento generado por Materen — Sistema TI el ${esc(hoy)} — equipo ${esc(equipo.codigo)}</p>

  <script>window.onload = function () { window.print(); };</` + `script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.');
  win.document.write(html);
  win.document.close();
}
