// Mismo criterio que reporte-pdf.test.js / reporte-satisfaccion-pdf.test.js:
// se construye el documento de verdad con jsPDF y se revisa el archivo
// resultante — que sea un PDF válido, con el texto en español intacto.
import { describe, it, expect } from 'vitest';
import { construirReporteEquipos, construirDatosReporteEquipos } from '../src/modules/equipos/reporteEquipos.js';

const HOY = new Date(2026, 7, 22);

const EQUIPOS = [
  { codigo: 'EQ-0001', tipo_nombre: 'Laptop', marca: 'Dell', modelo: 'Latitude 5420', estado: 'operativo', situacion: 'asignado', fecha_compra: '2025-02-22', garantia_hasta: '2026-09-15' },
  { codigo: 'EQ-0002', tipo_nombre: 'Laptop', marca: 'Dell', modelo: 'Latitude 5420', estado: 'operativo', situacion: 'asignado', fecha_compra: '2024-08-22', garantia_hasta: null },
  { codigo: 'EQ-0003', tipo_nombre: 'Monitor', marca: 'LG', modelo: '24"', estado: 'operativo', situacion: 'en_ubicacion', fecha_compra: null, garantia_hasta: null },
  { codigo: 'EQ-0004', tipo_nombre: 'Celular', marca: 'Samsung', modelo: 'A54', estado: 'operativo', situacion: 'disponible', fecha_compra: null, garantia_hasta: null },
  { codigo: 'EQ-0005', tipo_nombre: 'Laptop', marca: 'HP', modelo: 'ProBook', estado: 'en_reparacion', situacion: 'en_reparacion', fecha_compra: null, garantia_hasta: null },
  { codigo: 'EQ-0006', tipo_nombre: 'Impresora', marca: 'Epson', modelo: 'L3250', estado: 'de_baja', situacion: 'de_baja', fecha_compra: null, garantia_hasta: null },
  { codigo: 'EQ-0007', tipo_nombre: 'Celular', marca: 'Samsung', modelo: 'A34', estado: 'perdido', situacion: 'perdido', fecha_compra: null, garantia_hasta: null },
];

function bytesDe(doc) {
  return new Uint8Array(doc.output('arraybuffer'));
}

describe('construirReporteEquipos', () => {
  it('produce un PDF válido con el nombre por defecto', async () => {
    const datos = construirDatosReporteEquipos(EQUIPOS, HOY);
    const { doc, nombre } = await construirReporteEquipos(datos);
    expect(nombre).toMatch(/^Equipos_\d{4}-\d{2}-\d{2}\.pdf$/);

    const bytes = bytesDe(doc);
    const crudo = new TextDecoder('latin1').decode(bytes);
    expect(crudo.startsWith('%PDF-')).toBe(true);
    expect(crudo).toContain('%%EOF');
    expect(bytes.byteLength).toBeGreaterThan(1500);
  });

  it('usa el nombre de archivo pasado por opciones', async () => {
    const datos = construirDatosReporteEquipos(EQUIPOS, HOY);
    const { nombre } = await construirReporteEquipos(datos, { nombreArchivo: 'Equipos_inventario' });
    expect(nombre).toBe('Equipos_inventario.pdf');
  });

  it('no destroza los acentos ni el guión largo del castellano', async () => {
    const datos = construirDatosReporteEquipos(EQUIPOS, HOY);
    const { doc } = await construirReporteEquipos(datos);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('REPARACI\xD3N');
    expect(crudo).toContain('GARANT\xCDAS');
    expect(crudo).toContain('\x97'); // Materen — Sistema TI, en el pie
  });

  it('incluye el conteo por tipo (Laptop es el mayor: 3)', async () => {
    const datos = construirDatosReporteEquipos(EQUIPOS, HOY);
    const { doc } = await construirReporteEquipos(datos);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('Laptop');
    expect(crudo).toContain('Monitor');
  });

  it('incluye la tabla de garantías por vencer con el equipo dentro de la ventana', async () => {
    const datos = construirDatosReporteEquipos(EQUIPOS, HOY);
    const { doc } = await construirReporteEquipos(datos);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('EQ-0001');
    expect(crudo).toContain('15/09/2026');
  });

  it('muestra el mensaje vacío cuando no hay garantías por vencer', async () => {
    const sinGarantias = EQUIPOS.map((e) => ({ ...e, garantia_hasta: null }));
    const datos = construirDatosReporteEquipos(sinGarantias, HOY);
    const { doc } = await construirReporteEquipos(datos);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('Sin garant\xEDas por vencer en los pr\xF3ximos 90 d\xEDas');
  });

  it('genera igual un inventario completamente vacío', async () => {
    const datos = construirDatosReporteEquipos([], HOY);
    const { doc, nombre } = await construirReporteEquipos(datos, { nombreArchivo: 'x' });
    expect(nombre).toBe('x.pdf');
    expect(bytesDe(doc).byteLength).toBeGreaterThan(1000);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('Sin equipos activos para graficar');
  });

  it('incluye la sección de últimos movimientos con el detalle ya armado por el trigger', async () => {
    const datos = {
      ...construirDatosReporteEquipos(EQUIPOS, HOY),
      movimientos: [
        { fecha: '2026-08-20T14:30:00Z', evento: 'asignado', codigo: 'EQ-0001', tipo: 'Laptop', detalle: 'Entregado a Ana Pérez — Buen estado' },
        { fecha: '2026-08-18T09:00:00Z', evento: 'devuelto', codigo: 'EQ-0009', tipo: 'Monitor', detalle: 'Retirado de Almacén de TI (movimiento)' },
      ],
    };
    const { doc } = await construirReporteEquipos(datos);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('\xDALTIMAS ASIGNACIONES Y DEVOLUCIONES');
    expect(crudo).toContain('Asignado');
    expect(crudo).toContain('Devuelto');
    expect(crudo).toContain('Ana P\xE9rez');
    expect(crudo).toContain('Almac\xE9n de TI');
  });

  it('muestra el mensaje vacío cuando no hay movimientos recientes', async () => {
    const datos = { ...construirDatosReporteEquipos(EQUIPOS, HOY), movimientos: [] };
    const { doc } = await construirReporteEquipos(datos);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('Sin movimientos recientes');
  });

  it('sin `movimientos` en los datos (compat), muestra igual el mensaje vacío en vez de romper', async () => {
    const datos = construirDatosReporteEquipos(EQUIPOS, HOY);
    const { doc } = await construirReporteEquipos(datos);
    const crudo = new TextDecoder('latin1').decode(bytesDe(doc));
    expect(crudo).toContain('Sin movimientos recientes');
  });
});
