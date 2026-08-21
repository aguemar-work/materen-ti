import { describe, it, expect } from 'vitest';
import { badgeInfo } from '../src/core/badges.js';

describe('badgeInfo', () => {
  it('resuelve estados de empleado', () => {
    expect(badgeInfo('empleado', 'Activo')).toEqual({ label: 'Activo', clase: 'badge--success' });
  });

  it('resuelve estados de ticket', () => {
    // 'cerrado' se muestra fusionado con 'resuelto' (decisión de producto
    // 2026-08-21, ver dominio-tickets.js) — mismo label y color, aunque la
    // columna real de la tabla sigue guardando los 2 valores distintos.
    expect(badgeInfo('ticket', 'cerrado').label).toBe('Resuelto');
    expect(badgeInfo('ticket', 'cerrado').clase).toBe('badge--success');
    expect(badgeInfo('ticket', 'resuelto')).toEqual(badgeInfo('ticket', 'cerrado'));
  });

  it('resuelve tipo de cuenta', () => {
    expect(badgeInfo('tipo_cuenta', 'compartida').label).toBe('Compartido');
  });

  it('resuelve activo/inactivo de staff', () => {
    expect(badgeInfo('activo_staff', true).label).toBe('Activo');
    expect(badgeInfo('activo_staff', false).clase).toBe('badge--neutral');
  });
});
