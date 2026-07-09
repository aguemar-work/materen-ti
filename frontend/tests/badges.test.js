import { describe, it, expect } from 'vitest';
import { badgeInfo } from '../src/core/badges.js';

describe('badgeInfo', () => {
  it('resuelve estados de empleado', () => {
    expect(badgeInfo('empleado', 'Activo')).toEqual({ label: 'Activo', clase: 'badge--success' });
  });

  it('resuelve estados de ticket', () => {
    expect(badgeInfo('ticket', 'cerrado').label).toBe('Cerrado');
    expect(badgeInfo('ticket', 'cerrado').clase).toBe('badge--neutral');
  });

  it('resuelve tipo de cuenta', () => {
    expect(badgeInfo('tipo_cuenta', 'compartida').label).toBe('Compartido');
  });

  it('resuelve activo/inactivo de staff', () => {
    expect(badgeInfo('activo_staff', true).label).toBe('Activo');
    expect(badgeInfo('activo_staff', false).clase).toBe('badge--neutral');
  });
});
