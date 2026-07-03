// Acta de entrega de equipo — documento imprimible para firma física.
// Se abre en una ventana nueva lista para imprimir o guardar como PDF.
import { formatFecha } from '../../core/formatters.js';

function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function generarActa(equipo, empleado) {
  const hoy = formatFecha(new Date().toISOString());
  const fechaEntrega = equipo.fecha_asignacion ? formatFecha(equipo.fecha_asignacion) : hoy;

  const specsRows = Object.entries(equipo.specs || {})
    .map(([k, v]) => `<tr><td class="lbl">${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('');

  const accesorios = (equipo.accesorios || []).length
    ? equipo.accesorios.map(esc).join(', ')
    : 'Ninguno';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Acta de entrega — ${esc(equipo.codigo)}</title>
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
  <h1>Acta de Entrega de Equipo</h1>
  <p class="subtitulo">${esc(equipo.empresa_nombre || 'Sistema TI')} — ${esc(fechaEntrega)}</p>

  <h2>1. Datos del receptor</h2>
  <table>
    <tr><td class="lbl">Nombre completo</td><td>${esc(empleado.nombres)} ${esc(empleado.apellidos)}</td></tr>
    <tr><td class="lbl">DNI</td><td>${esc(empleado.dni)}</td></tr>
    <tr><td class="lbl">Cargo</td><td>${esc(empleado.cargo || '—')}</td></tr>
    <tr><td class="lbl">Empresa</td><td>${esc(empleado.empresa_nombre || '—')}</td></tr>
  </table>

  <h2>2. Datos del equipo</h2>
  <table>
    <tr><td class="lbl">Código de inventario</td><td>${esc(equipo.codigo)}</td></tr>
    <tr><td class="lbl">Tipo</td><td>${esc(equipo.tipo_nombre)}</td></tr>
    <tr><td class="lbl">Marca / Modelo</td><td>${esc(equipo.marca || '—')} ${esc(equipo.modelo || '')}</td></tr>
    <tr><td class="lbl">Número de serie</td><td>${esc(equipo.serie || '—')}</td></tr>
    ${specsRows}
    <tr><td class="lbl">Accesorios entregados</td><td>${accesorios}</td></tr>
    <tr><td class="lbl">Condición de entrega</td><td>${esc(equipo.condicion_entrega || 'Operativo')}</td></tr>
    <tr><td class="lbl">Fecha de entrega</td><td>${esc(fechaEntrega)}</td></tr>
  </table>

  <p class="clausula">
    Declaro haber recibido el equipo descrito en la presente acta, junto con los
    accesorios detallados, en la condición indicada, y me comprometo a: (a) darle
    uso exclusivamente laboral; (b) custodiarlo y mantenerlo en buen estado;
    (c) reportar de inmediato al área de TI cualquier falla, daño, pérdida o robo;
    y (d) devolverlo con todos sus accesorios al término de la relación laboral o
    cuando el área de TI lo requiera. Asumo responsabilidad por los daños o
    pérdidas atribuibles a negligencia en su uso o custodia.
  </p>

  <div class="firmas">
    <div class="firma">
      <div class="linea">
        <span class="rol">Entrega — Área de TI</span><br>
        Nombre y firma
      </div>
    </div>
    <div class="firma">
      <div class="linea">
        <span class="rol">Recibe conforme</span><br>
        ${esc(empleado.nombres)} ${esc(empleado.apellidos)}<br>
        DNI: ${esc(empleado.dni)}
      </div>
    </div>
  </div>

  <p class="pie">Documento generado por Sistema TI el ${esc(hoy)} — equipo ${esc(equipo.codigo)}</p>

  <script>window.onload = function () { window.print(); };</` + `script>
</body>
</html>`;

  const win = window.open('', '_blank', 'noopener,width=800,height=900');
  if (!win) throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.');
  win.document.write(html);
  win.document.close();
}
