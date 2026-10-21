// modules/tickets/filtrosTickets.js — lógica pura de los filtros V2 de
// Tickets (2026-09-25): vista ∩ chips → parámetros de queryTickets().
import { describe, it, expect } from 'vitest';
import {
  dimensionesDe, podarChips, paramsServidor, VISTAS_TICKETS, VISTA_DEFECTO, ASIGNADO_YO, atajosTickets,
} from '../src/modules/tickets/filtrosTickets.js';
import { SIN_ASIGNAR } from '../src/core/dominio-tickets.js';

const vacios = () => ({ estado: [], asignado: [], prioridad: [], categoria: [], tipo: [], nivel: [], solicitante: [] });

describe('filtrosTickets', () => {
  it('las vistas son un solo criterio (estado), con "Todos" primero y "Pendientes" por defecto', () => {
    expect(VISTAS_TICKETS.map((v) => v.label)).toEqual(['Todos', 'Pendientes', 'Resueltos', 'Rechazados']);
    expect(VISTA_DEFECTO).toBe('pendientes');
    // Ninguna vista fija el responsable: eso es un chip.
    expect(VISTAS_TICKETS.every((v) => !('asignado' in v))).toBe(true);
  });

  it('"Pendientes" = vigentes de cualquier técnico', () => {
    expect(paramsServidor({ vista: 'pendientes', chips: vacios() }, 'u')).toMatchObject({
      estados: ['abierto', 'en_progreso', 'reabierto'], asignados: [],
    });
  });

  it('el chip "Usted" (?asignado=yo) se resuelve al usuario en sesión', () => {
    const p = paramsServidor({ vista: 'pendientes', chips: { ...vacios(), asignado: [ASIGNADO_YO, SIN_ASIGNAR] } }, 'u-1');
    expect(p.asignados).toEqual(['u-1', SIN_ASIGNAR]);
  });

  it('en "Pendientes" el chip de Estado refina dentro de los vigentes y poda los terminales', () => {
    const p = paramsServidor({ vista: 'pendientes', chips: { ...vacios(), estado: ['en_progreso', 'resuelto'] } }, 'u');
    expect(p.estados).toEqual(['en_progreso']);
    expect(dimensionesDe('pendientes').find((d) => d.id === 'estado').opciones.map((o) => o.valor))
      .toEqual(['abierto', 'en_progreso', 'reabierto']);
  });

  it('"Resueltos" y "Rechazados" no ofrecen chip de Estado (no hay nada que refinar)', () => {
    expect(dimensionesDe('resueltos').map((d) => d.id)).not.toContain('estado');
    expect(paramsServidor({ vista: 'rechazados', chips: vacios() }, 'u').estados).toEqual(['rechazado']);
  });

  it('en "Todos" el Estado admite rechazados, y sin chip no restringe', () => {
    expect(paramsServidor({ vista: 'todos', chips: vacios() }, 'u').estados).toEqual([]);
    expect(paramsServidor({ vista: 'todos', chips: { ...vacios(), estado: ['rechazado'] } }, 'u').estados).toEqual(['rechazado']);
  });

  it('"Asignado a": Usted, Sin asignar y luego el resto del equipo (sin repetir al usuario)', () => {
    const dim = dimensionesDe('pendientes', { staff: [{ user_id: 'a', nombre: 'Ana' }, { user_id: 'u', nombre: 'Yo' }], yo: 'u' })
      .find((d) => d.id === 'asignado');
    expect(dim.opciones.map((o) => o.valor)).toEqual([ASIGNADO_YO, SIN_ASIGNAR, 'a']);
    expect(dim.opciones[0].label).toBe('Usted');
  });

  it('Solicitante: un valor filtra, los dos juntos no filtran', () => {
    expect(paramsServidor({ vista: 'todos', chips: { ...vacios(), solicitante: ['no'] } }, 'u').vinculado).toBe('no');
    expect(paramsServidor({ vista: 'todos', chips: { ...vacios(), solicitante: ['no', 'si'] } }, 'u').vinculado).toBe('');
  });

  it('podarChips no toca las dimensiones independientes de la vista', () => {
    const c = podarChips('resueltos', { ...vacios(), prioridad: ['alta'], categoria: ['red'], asignado: ['x'], estado: ['abierto'] });
    expect(c).toMatchObject({ prioridad: ['alta'], categoria: ['red'], asignado: ['x'], estado: [] });
  });
});

// Atajos (2026-10-21): cada uno apunta a dimensiones que existen en todas las
// vistas (AppFiltros esconde el que no), y deja valores que el servidor entiende.
describe('atajosTickets', () => {
  it('sus dimensiones existen en cada vista y "Creados hoy" es el rango del día', () => {
    const atajos = atajosTickets('2026-10-21');
    for (const vista of VISTAS_TICKETS.map((v) => v.valor)) {
      const ids = dimensionesDe(vista).map((d) => d.id);
      for (const a of atajos) for (const id of Object.keys(a.valores)) expect(ids).toContain(id);
    }
    expect(atajos.find((a) => a.id === 'hoy').valores.creado).toEqual(['2026-10-21', '2026-10-21']);
    expect(atajos.find((a) => a.id === 'mios').valores.asignado).toEqual([ASIGNADO_YO]);
    expect(atajos.find((a) => a.id === 'sin-asignar').valores.asignado).toEqual([SIN_ASIGNAR]);
  });

  it('Nivel muestra su descripción, no solo el código', () => {
    const nivel = dimensionesDe('pendientes').find((d) => d.id === 'nivel');
    expect(nivel.opciones[0]).toEqual({ valor: 'N1', label: 'N1 — Soporte básico' });
  });
});
