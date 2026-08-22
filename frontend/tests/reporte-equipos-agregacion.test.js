// Agregación del reporte de equipos: construirDatosReporteEquipos() es una
// función pura sobre el array ya mapeado por mapEquipo() (api/domains/equipos.js)
// — no toca red, así que no hace falta mockear el cliente, a diferencia de
// reporte-tickets-agregacion.test.js.
import { describe, it, expect } from 'vitest';
import { construirDatosReporteEquipos } from '../src/modules/equipos/reporteEquipos.js';

const HOY = new Date(2026, 7, 22); // 22/08/2026

function equipo(over = {}) {
  return {
    codigo: 'EQ-0001', tipo_nombre: 'Laptop', marca: 'Dell', modelo: 'Latitude',
    estado: 'operativo', situacion: 'disponible', fecha_compra: null, garantia_hasta: null,
    ...over,
  };
}

describe('construirDatosReporteEquipos — situación', () => {
  it('suma asignado + en_ubicacion en un solo KPI/tramo "asignados"', () => {
    const datos = construirDatosReporteEquipos([
      equipo({ situacion: 'asignado' }),
      equipo({ situacion: 'en_ubicacion' }),
      equipo({ situacion: 'disponible' }),
    ], HOY);
    expect(datos.total).toBe(3);
    expect(datos.asignados).toBe(2);
    expect(datos.disponibles).toBe(1);
  });

  it('cuenta en_reparacion/de_baja/perdido por el estado físico, no por situacion', () => {
    const datos = construirDatosReporteEquipos([
      equipo({ estado: 'en_reparacion', situacion: 'en_reparacion' }),
      equipo({ estado: 'de_baja', situacion: 'de_baja' }),
      equipo({ estado: 'perdido', situacion: 'perdido' }),
    ], HOY);
    expect(datos.enReparacion).toBe(1);
    expect(datos.deBaja).toBe(1);
    expect(datos.perdidos).toBe(1);
    expect(datos.asignados).toBe(0);
    expect(datos.disponibles).toBe(0);
  });

  it('el orden y las etiquetas de porSituacion son fijos, con el conteo correcto', () => {
    const datos = construirDatosReporteEquipos([
      equipo({ situacion: 'asignado' }),
      equipo({ situacion: 'disponible' }),
    ], HOY);
    expect(datos.porSituacion.map((s) => s.clave)).toEqual(['asignados', 'disponibles', 'reparacion', 'de_baja', 'perdidos']);
    expect(datos.porSituacion.find((s) => s.clave === 'asignados').conteo).toBe(1);
    expect(datos.porSituacion.find((s) => s.clave === 'perdidos').conteo).toBe(0);
  });

  it('un inventario vacío no rompe nada', () => {
    const datos = construirDatosReporteEquipos([], HOY);
    expect(datos.total).toBe(0);
    expect(datos.antiguedad).toBe('—');
    expect(datos.porTipo).toEqual([]);
    expect(datos.garantias).toEqual([]);
  });
});

describe('construirDatosReporteEquipos — por tipo', () => {
  it('agrupa por tipo_nombre y ordena de mayor a menor', () => {
    const datos = construirDatosReporteEquipos([
      equipo({ tipo_nombre: 'Monitor' }),
      equipo({ tipo_nombre: 'Laptop' }),
      equipo({ tipo_nombre: 'Laptop' }),
      equipo({ tipo_nombre: 'Laptop' }),
    ], HOY);
    expect(datos.porTipo).toEqual([
      { clave: 'Laptop', cantidad: 3 },
      { clave: 'Monitor', cantidad: 1 },
    ]);
  });

  it('un tipo con 0 equipos simplemente no aparece (no hay fila "0")', () => {
    const datos = construirDatosReporteEquipos([equipo({ tipo_nombre: 'Laptop' })], HOY);
    expect(datos.porTipo).toEqual([{ clave: 'Laptop', cantidad: 1 }]);
  });
});

describe('construirDatosReporteEquipos — antigüedad promedio', () => {
  it('en meses cuando el promedio es menor a un año', () => {
    const datos = construirDatosReporteEquipos([equipo({ fecha_compra: '2026-02-22' })], HOY);
    expect(datos.antiguedad).toBe('6 meses');
  });

  it('en años (1 decimal) cuando el promedio llega a un año', () => {
    const datos = construirDatosReporteEquipos([equipo({ fecha_compra: '2025-08-22' })], HOY);
    expect(datos.antiguedad).toBe('1.0 años');
  });

  it('ignora los equipos sin fecha_compra en vez de contarlos como antigüedad 0', () => {
    const datos = construirDatosReporteEquipos([
      equipo({ fecha_compra: '2025-08-22' }),
      equipo({ fecha_compra: null }),
    ], HOY);
    expect(datos.antiguedad).toBe('1.0 años');
  });

  it('"—" cuando ningún equipo tiene fecha_compra', () => {
    const datos = construirDatosReporteEquipos([equipo({ fecha_compra: null })], HOY);
    expect(datos.antiguedad).toBe('—');
  });
});

describe('construirDatosReporteEquipos — garantías por vencer', () => {
  it('incluye desde hoy hasta el borde de los 90 días, excluye antes y después', () => {
    const datos = construirDatosReporteEquipos([
      equipo({ codigo: 'EQ-HOY', garantia_hasta: '2026-08-22' }),        // = hoy: incluido
      equipo({ codigo: 'EQ-DENTRO', garantia_hasta: '2026-09-15' }),     // dentro: incluido
      equipo({ codigo: 'EQ-BORDE', garantia_hasta: '2026-11-20' }),      // exactamente 90 días: incluido
      equipo({ codigo: 'EQ-PASADO', garantia_hasta: '2026-08-21' }),     // ayer: excluido
      equipo({ codigo: 'EQ-LEJOS', garantia_hasta: '2026-11-21' }),      // 91 días: excluido
      equipo({ codigo: 'EQ-SIN', garantia_hasta: null }),                // sin garantía: excluido
    ], HOY);
    expect(datos.garantias.map((g) => g.codigo)).toEqual(['EQ-HOY', 'EQ-DENTRO', 'EQ-BORDE']);
  });

  it('ordena de fecha más próxima a más lejana', () => {
    const datos = construirDatosReporteEquipos([
      equipo({ codigo: 'EQ-LEJOS', garantia_hasta: '2026-11-01' }),
      equipo({ codigo: 'EQ-CERCA', garantia_hasta: '2026-08-25' }),
    ], HOY);
    expect(datos.garantias.map((g) => g.codigo)).toEqual(['EQ-CERCA', 'EQ-LEJOS']);
  });

  it('calcula los días restantes contra "hoy", no contra la hora exacta', () => {
    const datos = construirDatosReporteEquipos([equipo({ garantia_hasta: '2026-09-15' })], HOY);
    expect(datos.garantias[0].diasRestantes).toBe(24);
  });
});
