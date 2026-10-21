// subtituloListado (core/subtituloListado.js): el subtítulo de un listado dice
// cuántas filas hay, en qué vista y si hay filtros, antes de la descripción.
import { describe, it, expect } from 'vitest';
import { subtituloListado } from '../src/core/subtituloListado.js';

describe('subtituloListado', () => {
  it('concuerda sustantivo y frase con el conteo', () => {
    expect(subtituloListado(1, ['empleado', 'empleados'], { frase: ['activo', 'activos'] })).toBe('1 empleado activo');
    expect(subtituloListado(9, ['empleado', 'empleados'], { frase: ['activo', 'activos'] })).toBe('9 empleados activos');
    expect(subtituloListado(0, ['solicitud', 'solicitudes'])).toBe('0 solicitudes');
  });

  it('avisa los filtros y agrega la descripción', () => {
    expect(subtituloListado(3, ['equipo', 'equipos'], { frase: ['libre', 'libres'], filtrado: true, descripcion: 'dónde está cada uno' }))
      .toBe('3 equipos libres, con los filtros aplicados · dónde está cada uno');
  });
});
