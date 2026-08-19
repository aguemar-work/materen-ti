// Mismo criterio que reporte-pdf.test.js: se construye el documento de
// verdad con jsPDF y se revisa el archivo resultante — que sea un PDF
// válido, con el texto en español intacto (acentos y guión largo).
import { describe, it, expect } from 'vitest';
import { construirReporteSatisfaccion } from '../src/modules/tickets/reporteSatisfaccion.js';

const DATOS = {
  encuestasGeneradas: 12,
  encuestasRespondidas: 9,
  promedioGeneral: 4.25,
  porSolicitante: [
    { nombre: 'Ana Pérez', encuestasRespondidas: 3, encuestasGeneradas: 4, promedio: 4.5, muestra: 3, conteos: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 } },
    { nombre: 'Bruno Díaz', encuestasRespondidas: 1, encuestasGeneradas: 1, promedio: 2, muestra: 1, conteos: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0 } },
  ],
  porTecnico: [
    { nombre: 'Carla Ruiz', encuestasRespondidas: 5, encuestasGeneradas: 6, promedio: 4.8, muestra: 5, conteos: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 4 } },
  ],
  respuestasTotal: 2,
  respuestas: [
    { ticketCodigo: 'TCK-0001', solicitante: 'Ana Pérez', tecnico: 'Carla Ruiz', nivel: 5, respondida: true, comentario: 'Atención rápida y clara', fecha: '2026-08-04T17:00:00Z' },
    { ticketCodigo: 'TCK-0002', solicitante: 'Bruno Díaz', tecnico: 'Sin asignar', nivel: null, respondida: false, comentario: null, fecha: '2026-08-05T09:00:00Z' },
  ],
  respuestasBajasTotal: 1,
  respuestasBajas: [
    { ticketCodigo: 'TCK-0003', solicitante: 'Bruno Díaz', tecnico: 'Carla Ruiz', nivel: 2, respondida: true, comentario: 'Tardó demasiado', fecha: '2026-08-03T10:00:00Z' },
  ],
};

const VACIO = {
  encuestasGeneradas: 0,
  encuestasRespondidas: 0,
  promedioGeneral: null,
  porSolicitante: [],
  porTecnico: [],
  respuestasTotal: 0,
  respuestas: [],
  respuestasBajasTotal: 0,
  respuestasBajas: [],
};

function bytesDe(doc) {
  return new Uint8Array(doc.output('arraybuffer'));
}

describe('construirReporteSatisfaccion', () => {
  it('produce un PDF válido con el nombre por defecto', async () => {
    const { doc, nombre } = await construirReporteSatisfaccion(DATOS);
    expect(nombre).toMatch(/^Satisfaccion_\d{4}-\d{2}-\d{2}\.pdf$/);

    const bytes = bytesDe(doc);
    const crudo = new TextDecoder('latin1').decode(bytes);
    expect(crudo.startsWith('%PDF-')).toBe(true);
    expect(crudo).toContain('%%EOF');
    expect(bytes.byteLength).toBeGreaterThan(1500);
  });

  it('usa el nombre de archivo pasado por opciones', async () => {
    const { nombre } = await construirReporteSatisfaccion(DATOS, { nombreArchivo: 'Satisfaccion_tickets' });
    expect(nombre).toBe('Satisfaccion_tickets.pdf');
  });

  it('no destroza los acentos ni el guión largo del castellano', async () => {
    const { doc } = await construirReporteSatisfaccion(DATOS);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('Ana P\xE9rez');
    expect(crudo).toContain('Atenci\xF3n r\xE1pida');
    expect(crudo).toContain('\x97'); // Materen — Sistema TI, en el pie
  });

  it('marca con asterisco el promedio con muestra baja (Bruno Díaz, muestra 1)', async () => {
    const { doc } = await construirReporteSatisfaccion(DATOS);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('2.0/5 *');
    expect(crudo).toContain('4.8/5'); // muestra suficiente: sin asterisco
    expect(crudo).not.toContain('4.8/5 *');
  });

  it('avisa cuando "Todas las respuestas" viene recortada', async () => {
    const { doc } = await construirReporteSatisfaccion({ ...DATOS, respuestasTotal: 500 });
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('Se muestran las 2 m\xE1s recientes de 500');
  });

  it('incluye las columnas Respondidas/Pendientes (solicitante) y Total/Respondidas (técnico)', async () => {
    const { doc } = await construirReporteSatisfaccion(DATOS);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('Respondidas');
    expect(crudo).toContain('Pendientes');
    expect(crudo).toContain('Total');
  });

  it('incluye la sección "Respuestas con baja satisfacción" con sus filas', async () => {
    const { doc } = await construirReporteSatisfaccion(DATOS);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('BAJA SATISFACCI');
    expect(crudo).toContain('TCK-0003');
    expect(crudo).toContain('Tard\xF3 demasiado');
  });

  it('avisa cuando "Respuestas con baja satisfacción" viene recortada', async () => {
    const { doc } = await construirReporteSatisfaccion({ ...DATOS, respuestasBajasTotal: 200 });
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('Se muestran las 1 m\xE1s recientes de 200');
  });

  it('genera igual un histórico completamente vacío', async () => {
    const { doc, nombre } = await construirReporteSatisfaccion(VACIO, { nombreArchivo: 'x' });
    expect(nombre).toBe('x.pdf');
    expect(bytesDe(doc).byteLength).toBeGreaterThan(1000);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('Sin encuestas todav');
    expect(crudo).toContain('Sin respuestas con nivel 3 o menos');
  });
});
