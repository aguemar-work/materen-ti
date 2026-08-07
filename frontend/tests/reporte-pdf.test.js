// El reporte se descarga como PDF (ya no abre el diálogo de impresión): este
// test construye el documento de verdad con jsPDF y revisa el archivo
// resultante — que sea un PDF válido, con el nombre del periodo reportado y con
// el texto en español intacto (los acentos y el guión largo del copy son la
// parte que un generador de PDF suele romper).
import { describe, it, expect } from 'vitest';
import { construirReporteTickets, ubicarSeccion } from '../src/modules/tickets/reporte.js';

const DATOS = {
  totalCreados: 12,
  totalResueltos: 9,
  porCategoria: [{ clave: 'Redes', cantidad: 7 }, { clave: 'Sin categoría', cantidad: 5 }],
  porPrioridadLabel: [{ clave: 'Alta', cantidad: 8 }, { clave: 'Baja', cantidad: 4 }],
  porEstadoLabel: [{ clave: 'Cerrado', cantidad: 9 }, { clave: 'Rechazado', cantidad: 3 }],
  porTipoLabel: [{ clave: 'Incidente', cantidad: 8 }, { clave: 'Solicitud', cantidad: 4 }],
  porDia: [
    { fecha: '2026-08-03', cantidad: 4 }, { fecha: '2026-08-04', cantidad: 6 },
    { fecha: '2026-08-05', cantidad: 2 },
  ],
  porTecnicoNombres: [
    { nombre: 'Ana Pérez', cantidad: 6, promedio: 5.5, mediana: 4 },
    { nombre: 'Bruno Díaz', cantidad: 3, promedio: 30, mediana: 26 },
  ],
  porSolicitante: [
    { solicitante: 'Ana Pérez', total: 5, resueltos: 3, rechazados: 1, sinResolver: 1, encuestasContestadas: 2, encuestasPendientes: 1 },
  ],
  tiempoResolucion: { promedio: 13.4, mediana: 6, muestra: 9 },
  tiempoPorPrioridadLabel: [
    { clave: 'Alta', muestra: 6, promedio: 5.5, mediana: 4 },
    { clave: 'Baja', muestra: 3, promedio: 30, mediana: 26 },
  ],
  reaperturas: 2,
  tasaReapertura: 22,
  backlog: {
    total: 7,
    tramos: [
      { clave: 'hasta_3', label: 'Hasta 3 días', cantidad: 3 },
      { clave: 'de_4_a_7', label: '4 a 7 días', cantidad: 2 },
      { clave: 'de_8_a_30', label: '8 a 30 días', cantidad: 1 },
      { clave: 'mas_30', label: 'Más de 30 días', cantidad: 1 },
    ],
    diasMasAntiguo: 41,
  },
  encuestasGeneradas: 9,
  encuestasRespondidas: 4,
  promedioSatisfaccion: 4.25,
  comentarios: [{ nivel: 5, comentario: 'Atención rápida y clara', fecha: '2026-08-04T17:00:00Z' }],
  comentariosTotal: 1,
};

const VACIO = {
  totalCreados: 0,
  totalResueltos: 0,
  porCategoria: [],
  porPrioridadLabel: [],
  porEstadoLabel: [],
  porTipoLabel: [],
  porDia: [],
  porTecnicoNombres: [],
  porSolicitante: [],
  tiempoResolucion: { promedio: null, mediana: null, muestra: 0 },
  tiempoPorPrioridadLabel: [],
  reaperturas: 0,
  tasaReapertura: null,
  backlog: { total: 0, tramos: [], diasMasAntiguo: null },
  encuestasGeneradas: 0,
  encuestasRespondidas: 0,
  promedioSatisfaccion: null,
  comentarios: [],
  comentariosTotal: 0,
};

const OPCIONES = {
  periodoLabel: 'Mensual · Agosto 2026',
  rangoLabel: '01/08/2026 — 31/08/2026',
  nombreArchivo: 'ReporteMensual_2026-08',
};

function bytesDe(doc) {
  return new Uint8Array(doc.output('arraybuffer'));
}

// A4 = 297 mm de alto, margen 14 y 8 mm reservados al pie: una sección puede
// arrancar hasta y = 275 si lo que necesita entra.
describe('ubicarSeccion', () => {
  it('deja la sección donde está si el bloque cabe en la hoja', () => {
    expect(ubicarSeccion(100, 34)).toEqual({ y: 100, nuevaPagina: false });
    expect(ubicarSeccion(241, 34)).toEqual({ y: 241, nuevaPagina: false });
  });

  it('pasa a hoja nueva antes de dejar un título huérfano al pie', () => {
    expect(ubicarSeccion(242, 34)).toEqual({ y: 20, nuevaPagina: true });
    expect(ubicarSeccion(270, 30)).toEqual({ y: 20, nuevaPagina: true });
  });
});

describe('construirReporteTickets', () => {
  it('produce un PDF válido nombrado por el periodo reportado', async () => {
    const { doc, nombre } = await construirReporteTickets(DATOS, OPCIONES);

    expect(nombre).toBe('ReporteMensual_2026-08.pdf');

    const bytes = bytesDe(doc);
    const crudo = new TextDecoder('latin1').decode(bytes);
    expect(crudo.startsWith('%PDF-')).toBe(true);   // es un PDF, no HTML
    expect(crudo).toContain('%%EOF');
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });

  it('no destroza los acentos ni el guión largo del castellano', async () => {
    const { doc } = await construirReporteTickets(DATOS, OPCIONES);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));

    // jsPDF escribe los textos con WinAnsi, que para estos caracteres coincide
    // con latin1: la é va como 0xE9 y el guión largo como 0x97.
    expect(crudo).toContain('Ana P\xE9rez');
    expect(crudo).toContain('Atenci\xF3n r\xE1pida');
    expect(crudo).toContain('\x97');
  });

  it('usa un nombre con la fecha local cuando no se le pasa uno', async () => {
    const { nombre } = await construirReporteTickets(DATOS, { periodoLabel: 'Diario · 05/08/2026', rangoLabel: '05/08/2026' });
    expect(nombre).toMatch(/^Reporte_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('genera igual un periodo sin datos y uno en curso', async () => {
    const { doc, nombre } = await construirReporteTickets(VACIO, {
      periodoLabel: 'Diario · 05/08/2026', rangoLabel: '05/08/2026',
      nombreArchivo: 'ReporteDiario_2026-08-05', enCurso: true,
    });
    expect(nombre).toBe('ReporteDiario_2026-08-05.pdf');
    expect(bytesDe(doc).byteLength).toBeGreaterThan(2000);
  });

  it('pagina y numera todas las hojas cuando el reporte es largo', async () => {
    const largo = {
      ...DATOS,
      porSolicitante: Array.from({ length: 90 }, (_, i) => ({
        solicitante: `Solicitante ${i + 1}`, total: 3, resueltos: 1, rechazados: 1,
        sinResolver: 1, encuestasContestadas: 1, encuestasPendientes: 0,
      })),
    };
    const { doc } = await construirReporteTickets(largo, { ...OPCIONES, nombreArchivo: 'x' });
    const paginas = doc.getNumberOfPages();
    expect(paginas).toBeGreaterThan(1);

    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain(`de ${paginas}`);
  });

  it('incluye las secciones nuevas y la comparativa cuando se le pasa', async () => {
    const { doc } = await construirReporteTickets(DATOS, {
      ...OPCIONES,
      comparativa: {
        totalCreados: 8, totalResueltos: 11, promedioSatisfaccion: 3.9, tasaRespuesta: 30,
        etiqueta: 'Julio 2026',
      },
    });
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));

    expect(crudo).toContain('TIEMPOS Y CALIDAD DE LA ATENCI');
    expect(crudo).toContain('BACKLOG PENDIENTE');
    expect(crudo).toContain('Julio 2026');
    expect(crudo).toContain('+4');    // creados: 12 vs 8
    expect(crudo).toContain('-2');    // resueltos: 9 vs 11
  });

  // Guarda contra que el documento se dispare de largo: un mes normal tiene que
  // seguir siendo algo que alguien lea, no un informe de diez hojas.
  it('un mes completo con 31 días de volumen entra en pocas hojas', async () => {
    const mes = {
      ...DATOS,
      porDia: Array.from({ length: 31 }, (_, i) => ({
        fecha: `2026-08-${String(i + 1).padStart(2, '0')}`, cantidad: (i % 7) + 1,
      })),
      porCategoria: Array.from({ length: 9 }, (_, i) => ({ clave: `Categoría ${i + 1}`, cantidad: 9 - i })),
    };
    const { doc } = await construirReporteTickets(mes, OPCIONES);
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(3);
  });

  it('dibuja el gráfico por día solo si el periodo tiene más de un día', async () => {
    const unSoloDia = { ...DATOS, porDia: [{ fecha: '2026-08-05', cantidad: 3 }] };
    const [conGrafico, sinGrafico] = await Promise.all([
      construirReporteTickets(DATOS, OPCIONES),
      construirReporteTickets(unSoloDia, OPCIONES),
    ]);
    // Un gráfico de una sola barra no aporta nada: el documento sale más corto.
    expect(bytesDe(sinGrafico.doc).byteLength).toBeLessThan(bytesDe(conGrafico.doc).byteLength);
  });
});
