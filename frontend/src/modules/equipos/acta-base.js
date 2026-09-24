// Base compartida de las actas imprimibles de equipos (entrega y
// devolución): escapado, estilos de impresión, armado del documento y
// apertura de la ventana lista para imprimir.
//
// Hasta 2026-08-31 `acta.js` y `acta-devolucion.js` tenían cada una su
// copia de todo esto — el bloque <style> completo, `esc()` y el andamiaje
// de `window.open`/`print` eran idénticos byte a byte, así que cualquier
// ajuste de formato del documento había que hacerlo dos veces. Lo que
// queda en cada archivo es solo lo que difiere de verdad: sus secciones,
// su cláusula y sus firmas.
import { formatFecha } from '../../core/formatters.js';
import { NOMBRE_PRODUCTO, NOMBRE_CORTO } from '../../core/marca.js';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function fechaHoy() {
  return formatFecha(new Date().toISOString());
}

// Accesorios del equipo como <ul>, o "Ninguno". Acepta las dos formas que
// conviven hoy: `accesorios_lineas` (con código y cantidad) o el array
// plano `accesorios` de descripciones.
export function listaAccesorios(equipo) {
  const lineas = equipo.accesorios_lineas?.length
    ? equipo.accesorios_lineas
    : (equipo.accesorios || []).map((d) => ({ descripcion: d, cantidad: 1 }));
  if (!lineas.length) return 'Ninguno';
  const items = lineas
    .map((l) => {
      const cant = (l.cantidad || 1) > 1 ? ` ×${l.cantidad}` : '';
      const cod = l.codigo ? `<span class="acc-cod">${esc(l.codigo)}</span> ` : '';
      return `<li>${cod}${esc(l.descripcion)}${cant}</li>`;
    })
    .join('');
  return `<ul class="acc-ul">${items}</ul>`;
}

// filas: [etiqueta, valor][] — el valor se escapa siempre. Para insertar
// HTML ya armado (ej. la lista de accesorios) pasar `{ html: '...' }`.
export function tablaDatos(filas) {
  const celdas = filas
    .map(([etiqueta, valor]) => {
      const contenido = valor && typeof valor === 'object' && 'html' in valor ? valor.html : esc(valor);
      return `<tr><td class="lbl">${esc(etiqueta)}</td><td>${contenido}</td></tr>`;
    })
    .join('');
  return `<table>${celdas}</table>`;
}

export function seccion(titulo, contenido) {
  return `<h2>${esc(titulo)}</h2>\n  ${contenido}`;
}

// Un bloque de firma. detalle: líneas ya escapadas (o el genérico).
export function firma(rol, detalle = 'Nombre y firma') {
  return `<div class="firma">
      <div class="linea">
        <span class="rol">${esc(rol)}</span><br>
        ${detalle}
      </div>
    </div>`;
}

// Nombre + DNI de quien firma, para el bloque de la contraparte del acta.
export function firmanteEmpleado(empleado) {
  return `${esc(empleado.nombres)} ${esc(empleado.apellidos)}<br>
        DNI: ${esc(empleado.dni)}`;
}

const ESTILOS = `
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
  @media print { body { padding: 10mm 6mm; } }`;

// Arma el documento completo. Exportado aparte de `abrirActa` para poder
// verificar el HTML en tests sin abrir una ventana del navegador.
export function construirActa({ titulo, encabezado, fecha, equipo, secciones, clausula, firmas }) {
  const hoy = fechaHoy();
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${esc(titulo)} — ${esc(equipo.codigo)}</title>
<style>${ESTILOS}
</style>
</head>
<body>
  <h1>${esc(encabezado)}</h1>
  <p class="subtitulo">${esc(equipo.empresa_nombre || NOMBRE_CORTO)} — ${esc(fecha)}</p>

  ${secciones.join('\n\n  ')}

  <p class="clausula">
    ${clausula}
  </p>

  <div class="firmas">
    ${firmas.join('\n    ')}
  </div>

  <p class="pie">Documento generado por ${esc(NOMBRE_PRODUCTO)} el ${esc(hoy)} — equipo ${esc(equipo.codigo)}</p>

  <script>window.onload = function () { window.print(); };</` + `script>
</body>
</html>`;
}

// Abre la ventana en el MISMO instante del clic. Los navegadores solo dejan
// abrir ventanas desde un gesto del usuario: si se abre después de un
// `await` (traer al empleado, registrar la devolución), la bloquean. El
// flujo es: reservar al clic → pedir los datos → escribir el acta en ella.
export function reservarVentanaActa() {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) throw new Error('El navegador bloqueó la ventana de impresión. Permita las ventanas emergentes para este sitio.');
  win.document.write('<p style="font-family:sans-serif;padding:2rem;color:#555">Preparando el acta…</p>');
  return win;
}

export function abrirActa(acta, win = reservarVentanaActa()) {
  win.document.open();
  win.document.write(construirActa(acta));
  win.document.close();
}
