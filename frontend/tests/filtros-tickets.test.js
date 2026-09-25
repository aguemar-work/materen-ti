// modules/tickets/filtrosTickets.js — lógica pura de los filtros V2 de
// Tickets (2026-09-25): vista ∩ chips → parámetros de queryTickets().
import { describe, it, expect } from 'vitest';
import { dimensionesDe, podarChips, paramsServidor, VISTAS_TICKETS } from '../src/modules/tickets/filtrosTickets.js';
import { SIN_ASIGNAR } from '../src/core/dominio-tickets.js';

const vacios = () => ({ estado: [], asignado: [], prioridad: [], categoria: [], tipo: [], nivel: [], solicitante: [] });

describe('filtrosTickets', () => {
  it('cada vista tiene un label único (ya no hay dos "Todos")', () => {
    const labels = VISTAS_TICKETS.map((v) => v.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('"Nuevos" = vigentes sin asignar; no ofrece Estado ni Asignado a', () => {
    expect(paramsServidor({ vista: 'nuevos', chips: vacios() }, 'yo')).toMatchObject({
      estados: ['abierto', 'en_progreso', 'reabierto'], asignados: [SIN_ASIGNAR],
    });
    const ids = dimensionesDe('nuevos').map((d) => d.id);
    expect(ids).not.toContain('estado');
    expect(ids).not.toContain('asignado');
  });

  it('"Mis tickets" fija al usuario en sesión y poda "Asignado a"', () => {
    const p = paramsServidor({ vista: 'mios', chips: { ...vacios(), asignado: ['otro'] } }, 'u-1');
    expect(p.asignados).toEqual(['u-1']);
  });

  it('en "Pendientes" el chip de Estado refina dentro de los vigentes y poda los terminales', () => {
    const p = paramsServidor({ vista: 'pendientes', chips: { ...vacios(), estado: ['en_progreso', 'resuelto'] } }, 'u');
    expect(p.estados).toEqual(['en_progreso']);
    expect(dimensionesDe('pendientes').find((d) => d.id === 'estado').opciones.map((o) => o.valor))
      .toEqual(['abierto', 'en_progreso', 'reabierto']);
  });

  it('en "Todos" el Estado admite rechazados, y sin chip no restringe', () => {
    expect(paramsServidor({ vista: 'todos', chips: vacios() }, 'u').estados).toEqual([]);
    expect(paramsServidor({ vista: 'todos', chips: { ...vacios(), estado: ['rechazado'] } }, 'u').estados).toEqual(['rechazado']);
  });

  it('"Asignado a" lista primero al usuario, luego "Sin asignar", luego el resto', () => {
    const dim = dimensionesDe('pendientes', { staff: [{ user_id: 'a', nombre: 'Ana' }, { user_id: 'u', nombre: 'Yo' }], yo: 'u' })
      .find((d) => d.id === 'asignado');
    expect(dim.opciones.map((o) => o.valor)).toEqual(['u', SIN_ASIGNAR, 'a']);
    expect(dim.opciones[0].label).toBe('Yo (usted)');
  });

  it('Solicitante: un valor filtra, los dos juntos no filtran', () => {
    expect(paramsServidor({ vista: 'todos', chips: { ...vacios(), solicitante: ['no'] } }, 'u').vinculado).toBe('no');
    expect(paramsServidor({ vista: 'todos', chips: { ...vacios(), solicitante: ['no', 'si'] } }, 'u').vinculado).toBe('');
  });

  it('podarChips no toca las dimensiones independientes de la vista', () => {
    const c = podarChips('mios', { ...vacios(), prioridad: ['alta'], categoria: ['red'], asignado: ['x'] });
    expect(c).toMatchObject({ prioridad: ['alta'], categoria: ['red'], asignado: [] });
  });
});
