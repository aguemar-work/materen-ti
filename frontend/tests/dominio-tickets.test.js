// destinoDeCambio es el único punto del sistema que conoce el formato del
// detalle que escriben los triggers ('De "x" a "y"', migración 035). Lo usan la
// hoja de vida del ticket y el reporte para saber a qué estado se transicionó,
// así que si el texto del trigger cambia, estos tests son los que avisan.
import { describe, it, expect } from 'vitest';
import { destinoDeCambio, ESTADOS_TICKET, PRIORIDADES_TICKET } from '../src/core/dominio-tickets.js';

describe('destinoDeCambio', () => {
  it('devuelve el estado destino de un cambio de estado', () => {
    expect(destinoDeCambio('De "en_progreso" a "resuelto"')).toBe('resuelto');
    expect(destinoDeCambio('De "resuelto" a "cerrado"')).toBe('cerrado');
    expect(destinoDeCambio('De "cerrado" a "reabierto"')).toBe('reabierto');
    expect(destinoDeCambio('De "abierto" a "rechazado"')).toBe('rechazado');
  });

  it('no confunde el estado de origen con el destino', () => {
    // El caso que rompería el conteo de resueltos: "resuelto" aparece primero.
    expect(destinoDeCambio('De "resuelto" a "reabierto"')).toBe('reabierto');
    expect(destinoDeCambio('De "resuelto" a "cerrado"')).not.toBe('resuelto');
  });

  it('sirve igual para los cambios de prioridad', () => {
    expect(destinoDeCambio('De "baja" a "urgente"')).toBe('urgente');
  });

  it('devuelve null cuando el detalle no tiene ese formato', () => {
    expect(destinoDeCambio(null)).toBeNull();
    expect(destinoDeCambio('')).toBeNull();
    expect(destinoDeCambio('Reasignado')).toBeNull();
    expect(destinoDeCambio('De "N1" a "sin definir"')).toBeNull();  // valor con espacio
  });

  it('todos los estados y prioridades del dominio se parsean', () => {
    for (const estado of Object.keys(ESTADOS_TICKET)) {
      expect(destinoDeCambio(`De "abierto" a "${estado}"`)).toBe(estado);
    }
    for (const prioridad of Object.keys(PRIORIDADES_TICKET)) {
      expect(destinoDeCambio(`De "media" a "${prioridad}"`)).toBe(prioridad);
    }
  });
});
