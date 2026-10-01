import { describe, it, expect } from 'vitest';
import { badgeInfo } from '../src/core/badges.js';

describe('badgeInfo', () => {
  it('resuelve estados de empleado', () => {
    expect(badgeInfo('empleado', 'Activo')).toEqual({ label: 'Activo', clase: 'badge--success' });
  });

  it('resuelve estados de ticket', () => {
    // 'cerrado' se muestra con la misma ETIQUETA que 'resuelto' (decisión de
    // producto 2026-08-21, ver dominio-tickets.js), aunque la columna real de
    // la tabla guarda los 2 valores distintos.
    expect(badgeInfo('ticket', 'cerrado').label).toBe('Resuelto');
    expect(badgeInfo('ticket', 'resuelto').label).toBe('Resuelto');
    // El TONO sí los separa desde el mapa único (core/tonos.js, Ciclo 21):
    // cerrado = ok (verde); resuelto = espera (violeta, aguarda la
    // conformidad del solicitante). Antes ambos eran verdes.
    expect(badgeInfo('ticket', 'cerrado').clase).toBe('badge--success');
    expect(badgeInfo('ticket', 'resuelto').clase).toBe('badge--purple');
  });

  it('abierto y reabierto piden acción; en progreso es "trabajando"', () => {
    expect(badgeInfo('ticket', 'abierto').clase).toBe('badge--warning');
    expect(badgeInfo('ticket', 'reabierto').clase).toBe('badge--warning');
    expect(badgeInfo('ticket', 'en_progreso').clase).toBe('badge--sky');
  });

  it('solo la prioridad urgente es roja; baja/media/alta son neutras de rango', () => {
    expect(badgeInfo('prioridad', 'urgente').clase).toBe('badge--danger badge--rango');
    for (const p of ['baja', 'media', 'alta']) {
      expect(badgeInfo('prioridad', p).clase).toBe('badge--neutral badge--rango');
    }
  });

  it('ticket sin vincular pide acción, ya no comparte el rojo de urgente', () => {
    expect(badgeInfo('ticket_sin_vincular', true).clase).toBe('badge--warning');
  });

  it('resuelve tipo de cuenta', () => {
    expect(badgeInfo('tipo_cuenta', 'compartida').label).toBe('Compartido');
    // Las categorías son teal (antes sky): sky pasó a significar "trabajando".
    expect(badgeInfo('tipo_cuenta', 'compartida').clase).toBe('badge--teal');
  });

  it('resuelve activo/inactivo de staff', () => {
    expect(badgeInfo('activo_staff', true).label).toBe('Activo');
    expect(badgeInfo('activo_staff', false).clase).toBe('badge--neutral');
  });
});
