// formatFechaLibro: la fecha de AppLibro ("dd/mm/yy" arriba, "hh:mm" debajo).
import { describe, it, expect } from 'vitest';
import { formatFechaLibro } from '../src/core/formatters.js';

describe('formatFechaLibro', () => {
  it('un Date se parte en dd/mm/yy y hh:mm locales, con ceros a la izquierda', () => {
    expect(formatFechaLibro(new Date(2026, 8, 12, 20, 14))).toEqual({ fecha: '12/09/26', hora: '20:14' });
    expect(formatFechaLibro(new Date(2025, 2, 1, 9, 5))).toEqual({ fecha: '01/03/25', hora: '09:05' });
  });

  it('un timestamp ISO usa la hora local del navegador, igual que new Date()', () => {
    const iso = new Date(2024, 2, 14, 9, 0).toISOString();
    expect(formatFechaLibro(iso)).toEqual({ fecha: '14/03/24', hora: '09:00' });
  });

  it('una fecha sola no inventa hora ni se corre de día por la zona horaria', () => {
    expect(formatFechaLibro('2026-09-30')).toEqual({ fecha: '30/09/26', hora: '' });
  });

  it('el año va siempre (un kardex cruza años), de dos dígitos', () => {
    expect(formatFechaLibro(new Date(2031, 0, 2, 0, 0)).fecha).toBe('02/01/31');
  });

  it('vacío o inválido devuelve cadenas vacías, nunca "Invalid Date"', () => {
    for (const v of [null, undefined, '', 'no es fecha']) {
      expect(formatFechaLibro(v)).toEqual({ fecha: '', hora: '' });
    }
  });
});
