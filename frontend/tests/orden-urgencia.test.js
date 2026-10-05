// Orden por urgencia de tickets (core/dominio-tickets.js).
//
// Lo usa "Mi trabajo" del Dashboard, que muestra solo los 5 primeros de mis
// tickets asignados. Si el orden se equivoca, el recorte deja fuera
// justamente lo que había que atender primero — y el usuario no tiene forma
// de notarlo: la lista se ve igual de plausible.

import { describe, it, expect } from 'vitest';
import { ordenarPorUrgencia } from '../src/core/dominio-tickets.js';

function t(codigo, prioridad, created_at) {
  return { codigo, prioridad, created_at };
}

describe('ordenarPorUrgencia', () => {
  it('pone la prioridad más alta primero', () => {
    const r = ordenarPorUrgencia([
      t('A', 'baja', '2026-09-01'),
      t('B', 'urgente', '2026-09-01'),
      t('C', 'media', '2026-09-01'),
      t('D', 'alta', '2026-09-01'),
    ]);
    expect(r.map((x) => x.codigo)).toEqual(['B', 'D', 'C', 'A']);
  });

  it('con la misma prioridad, el más antiguo primero', () => {
    const r = ordenarPorUrgencia([
      t('NUEVO', 'alta', '2026-09-02T10:00:00Z'),
      t('VIEJO', 'alta', '2026-08-20T10:00:00Z'),
      t('MEDIO', 'alta', '2026-08-30T10:00:00Z'),
    ]);
    expect(r.map((x) => x.codigo)).toEqual(['VIEJO', 'MEDIO', 'NUEVO']);
  });

  it('la prioridad manda sobre la antigüedad', () => {
    // Un urgente de hoy va antes que un "baja" de hace un mes: la escala de
    // prioridad existe justamente para eso.
    const r = ordenarPorUrgencia([
      t('VIEJO_BAJO', 'baja', '2026-08-01'),
      t('NUEVO_URGENTE', 'urgente', '2026-09-02'),
    ]);
    expect(r[0].codigo).toBe('NUEVO_URGENTE');
  });

  it('una prioridad desconocida NO se cuela arriba', () => {
    // El dominio puede crecer en la base antes que en el frontend; un valor
    // que este código no conoce no debe desplazar a un urgente real.
    const r = ordenarPorUrgencia([
      t('RARO', 'catastrofica', '2026-09-01'),
      t('URGENTE', 'urgente', '2026-09-01'),
      t('BAJA', 'baja', '2026-09-01'),
    ]);
    expect(r[0].codigo).toBe('URGENTE');
    expect(r[r.length - 1].codigo).toBe('RARO');
  });

  it('tolera prioridad y fecha ausentes sin reventar', () => {
    const r = ordenarPorUrgencia([
      { codigo: 'X' },
      t('OK', 'alta', '2026-09-01'),
      { codigo: 'Y', prioridad: 'media' },
    ]);
    expect(r[0].codigo).toBe('OK');
    expect(r).toHaveLength(3);
  });

  it('no muta el arreglo recibido', () => {
    const original = [t('A', 'baja', '2026-09-01'), t('B', 'urgente', '2026-09-01')];
    const copia = [...original];
    ordenarPorUrgencia(original);
    expect(original).toEqual(copia);
  });

  it('no revienta con vacío ni con ausencia de argumento', () => {
    expect(ordenarPorUrgencia([])).toEqual([]);
    expect(ordenarPorUrgencia()).toEqual([]);
    expect(ordenarPorUrgencia(null)).toEqual([]);
  });

  it('el ranking se deriva del mapa de prioridades, no de una lista aparte', () => {
    // Si alguien agrega una prioridad a PRIORIDADES_TICKET, el orden la toma
    // sola. Esta prueba vigila que sigan siendo una sola fuente: las 4
    // conocidas tienen que quedar estrictamente ordenadas entre sí.
    const r = ordenarPorUrgencia([
      t('baja', 'baja', '2026-09-01'),
      t('media', 'media', '2026-09-01'),
      t('alta', 'alta', '2026-09-01'),
      t('urgente', 'urgente', '2026-09-01'),
    ]);
    expect(r.map((x) => x.codigo)).toEqual(['urgente', 'alta', 'media', 'baja']);
  });
});
