// Mismo criterio que reporte-pdf.test.js: se construye el documento de
// verdad con jsPDF y se revisa el archivo resultante — que sea un PDF
// válido, con el texto en español intacto (acentos y guión largo).
import { describe, it, expect } from 'vitest';
import { construirReporteSatisfaccion } from '../src/modules/tickets/reporteSatisfaccion.js';

// Forma que devuelve reporte_satisfaccion_consolidado (migración 115): los
// promedios ya vienen publicados o en null (muestra < mínimo), con su desglose.
const DATOS = {
  muestraMinima: 5,
  resumen: { encuestasGeneradas: 12, encuestasRespondidas: 9, tasaRespuestaPct: 75, muestra: 9, promedio: 4.25, insuficiente: false, insatisfechos: 1 },
  porSolicitante: [
    { nombre: 'Ana Pérez', encuestasRespondidas: 6, encuestasGeneradas: 7, promedio: 4.5, muestra: 6, insuficiente: false, niveles: { 1: 0, 2: 0, 3: 0, 4: 3, 5: 3 } },
    { nombre: 'Bruno Díaz', encuestasRespondidas: 1, encuestasGeneradas: 1, promedio: null, muestra: 1, insuficiente: true, niveles: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0 } },
  ],
  porTecnico: [
    { nombre: 'Carla Ruiz', encuestasRespondidas: 5, encuestasGeneradas: 6, promedio: 4.8, muestra: 5, insuficiente: false, niveles: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 4 } },
  ],
  porMes: [
    { mes: '2026-08-01', encuestasGeneradas: 12, encuestasRespondidas: 9, promedio: 4.25, muestra: 9, insuficiente: false, niveles: { 1: 0, 2: 1, 3: 0, 4: 3, 5: 5 } },
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
  muestraMinima: 5,
  resumen: { encuestasGeneradas: 0, encuestasRespondidas: 0, tasaRespuestaPct: null, muestra: 0, promedio: null, insuficiente: true, insatisfechos: 0 },
  porSolicitante: [],
  porTecnico: [],
  porMes: [],
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
    const crudo = Buffer.from(bytes).toString('latin1');
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
    const crudo = Buffer.from(bytesDe(doc)).toString('latin1');
    expect(crudo).toContain('Ana P\xE9rez');
    expect(crudo).toContain('Atenci\xF3n r\xE1pida');
    expect(crudo).toContain('\x97'); // Materen — Sistema TI, en el pie
  });

  it('un promedio que el servidor no publicó sale como "n insuficiente", nunca como número', async () => {
    const { doc } = await construirReporteSatisfaccion(DATOS);
    const crudo = Buffer.from(bytesDe(doc)).toString('latin1');
    expect(crudo).toContain('n insuficiente'); // los paréntesis van escapados en el PDF
    expect(crudo).not.toContain('2.0/5');
    expect(crudo).toContain('4.8/5'); // muestra suficiente: el número
    expect(crudo).toContain('Promedios publicados solo con 5 o m');
  });

  it('incluye la tabla por mes de resolución', async () => {
    const { doc } = await construirReporteSatisfaccion(DATOS);
    const crudo = Buffer.from(bytesDe(doc)).toString('latin1');
    expect(crudo).toContain('POR MES DE RESOLUCI');
    expect(crudo).toContain('08/2026');
  });

  it('avisa cuando "Todas las respuestas" viene recortada', async () => {
    const { doc } = await construirReporteSatisfaccion({ ...DATOS, respuestasTotal: 500 });
    const crudo = Buffer.from(bytesDe(doc)).toString('latin1');
    expect(crudo).toContain('Se muestran las 2 m\xE1s recientes de 500');
  });

  it('incluye las columnas Respondidas/Pendientes (solicitante) y Total/Respondidas (técnico)', async () => {
    const { doc } = await construirReporteSatisfaccion(DATOS);
    const crudo = Buffer.from(bytesDe(doc)).toString('latin1');
    expect(crudo).toContain('Respondidas');
    expect(crudo).toContain('Pendientes');
    expect(crudo).toContain('Total');
  });

  it('incluye la sección "Respuestas insatisfechas (nivel 1 o 2)" con sus filas', async () => {
    const { doc } = await construirReporteSatisfaccion(DATOS);
    const crudo = Buffer.from(bytesDe(doc)).toString('latin1');
    expect(crudo).toContain('RESPUESTAS INSATISFECHAS');
    expect(crudo).toContain('NIVEL 1 O 2');
    expect(crudo).toContain('TCK-0003');
    expect(crudo).toContain('Tard\xF3 demasiado');
  });

  it('avisa cuando "Respuestas con baja satisfacción" viene recortada', async () => {
    const { doc } = await construirReporteSatisfaccion({ ...DATOS, respuestasBajasTotal: 200 });
    const crudo = Buffer.from(bytesDe(doc)).toString('latin1');
    expect(crudo).toContain('Se muestran las 1 m\xE1s recientes de 200');
  });

  it('genera igual un histórico completamente vacío', async () => {
    const { doc, nombre } = await construirReporteSatisfaccion(VACIO, { nombreArchivo: 'x' });
    expect(nombre).toBe('x.pdf');
    expect(bytesDe(doc).byteLength).toBeGreaterThan(1000);
    const crudo = Buffer.from(bytesDe(doc)).toString('latin1');
    expect(crudo).toContain('Sin encuestas todav');
    expect(crudo).toContain('Sin respuestas con nivel 2 o menos');
  });
});
