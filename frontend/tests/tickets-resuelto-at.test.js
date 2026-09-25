// resuelto_at (migración 089) en el listado de Tickets: si el proyecto
// todavía no tiene la columna, la primera consulta falla con 42703 y el
// listado se reintenta sin ella — la bandeja nunca se rompe por una
// migración pendiente. Sin la columna, un resuelto cae a updated_at.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selects = [];
let columnaExiste = false;

function consulta() {
  let seleccion = '';
  const qb = {
    select(s) { seleccion = s; selects.push(s); return qb; },
    order() { return qb; },
    range() { return qb; },
    eq() { return qb; }, in() { return qb; }, is() { return qb; }, not() { return qb; },
    or() { return qb; }, gte() { return qb; }, lte() { return qb; }, ilike() { return qb; }, limit() { return qb; },
    then(resolver) {
      if (!columnaExiste && seleccion.includes('resuelto_at')) {
        return Promise.resolve({ data: null, count: null, error: { code: '42703', message: 'column tickets.resuelto_at does not exist' } }).then(resolver);
      }
      const fila = { id: 't1', codigo: 'TCK-1', titulo: 'x', estado: 'cerrado', updated_at: '2026-09-20T10:00:00Z', created_at: '2026-09-18T10:00:00Z' };
      if (columnaExiste) fila.resuelto_at = '2026-09-19T15:00:00Z';
      return Promise.resolve({ data: [fila], count: 1, error: null }).then(resolver);
    },
  };
  return qb;
}

vi.mock('../src/api/client.js', () => ({ getClient: () => ({ database: { from: () => consulta() } }) }));

beforeEach(() => {
  selects.length = 0;
  vi.resetModules();
});

describe('listTicketsPage — resuelto_at', () => {
  it('con la columna: la trae y la usa tal cual', async () => {
    columnaExiste = true;
    const { ticketsApi } = await import('../src/api/domains/tickets.js');
    const { items } = await ticketsApi.listTicketsPage({});
    expect(items[0].resuelto_at).toBe('2026-09-19T15:00:00Z');
    expect(selects.every((s) => s.includes('resuelto_at'))).toBe(true);
  });

  it('sin la columna (42703): reintenta sin ella y cae a updated_at en un cerrado', async () => {
    columnaExiste = false;
    const { ticketsApi } = await import('../src/api/domains/tickets.js');
    const { items, total } = await ticketsApi.listTicketsPage({});
    expect(total).toBe(1);
    expect(items[0].resuelto_at).toBe('2026-09-20T10:00:00Z');
    expect(selects.at(-1)).not.toContain('resuelto_at');
    // Y ya no lo vuelve a pedir en la misma sesión.
    await ticketsApi.listTicketsPage({});
    expect(selects.at(-1)).not.toContain('resuelto_at');
  });
});
