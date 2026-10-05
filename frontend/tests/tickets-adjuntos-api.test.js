// Capa de datos y maqueta de los adjuntos privados de tickets (migración 111):
//   - api/ticketsPublicos.js: urlAdjuntoTicket (acción adjuntoStaff) con sus
//     mensajes en español, y seguimientoTicket conserva adjuntoUrl
//   - api/domains/tickets.js: el detalle trae `tiene_adjunto` (desde adjunto_key),
//     ya no una URL pública
//   - maqueta: el servidor falso (rpc-tickets.js) entrega una URL firmada, jamás la key
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeSdk = vi.fn();
const llamadasQuery = [];
vi.mock('../src/api/client.js', () => ({
  getClient: () => ({
    functions: { invoke: invokeSdk },
    database: {
      from: (tabla) => {
        const q = { tabla, cols: null, filtros: [] };
        llamadasQuery.push(q);
        const b = {
          select(c) { q.cols = c; return b; },
          eq(c, v) { q.filtros.push([c, v]); return b; },
          maybeSingle: async () => ({ data: globalThis.__respuestaGetTicket, error: null }),
        };
        globalThis.__ultimaQuery = q;
        return b;
      },
    },
  }),
}));

const { urlAdjuntoTicket, seguimientoTicket, MENSAJES_ERROR_TICKETS } = await import('../src/api/ticketsPublicos.js');
const { ticketsApi } = await import('../src/api/domains/tickets.js');
const { funcionTickets } = await import('../src/maqueta/rpc-tickets.js');
const { TABLAS } = await import('../src/maqueta/datos.js');

beforeEach(() => {
  invokeSdk.mockReset();
  llamadasQuery.length = 0;
});

describe('urlAdjuntoTicket', () => {
  it('invoca adjuntoStaff con el id del ticket y devuelve { url, expiraSegundos }', async () => {
    invokeSdk.mockResolvedValue({ data: { ok: true, url: 'https://almacen.test/firmada?f=1', expiraSegundos: 300 }, error: null });
    await expect(urlAdjuntoTicket('tck-1')).resolves.toEqual({ url: 'https://almacen.test/firmada?f=1', expiraSegundos: 300 });
    expect(invokeSdk).toHaveBeenCalledWith('tickets', { body: { action: 'adjuntoStaff', ticketId: 'tck-1' } });
  });

  it.each([
    ['no_autorizado', 'Sin permiso sobre el módulo Tickets'],
    ['no_autenticado', 'Sesión expirada — vuelva a iniciar sesión'],
    ['error_url', 'No se pudo generar el enlace de la captura'],
    ['demasiados_intentos', 'Demasiados intentos. Espere unos minutos e intente de nuevo'],
  ])('ante %s lanza el mensaje en español y conserva el code', async (code, mensaje) => {
    invokeSdk.mockResolvedValue({ data: { ok: false, code }, error: null });
    await expect(urlAdjuntoTicket('tck-1')).rejects.toMatchObject({ message: mensaje, code });
  });

  it('los códigos nuevos de crear (RPC crear_ticket_publico) tienen mensaje en español', () => {
    for (const c of ['texto_muy_largo', 'categoria_invalida', 'empleado_invalido', 'vinculo_invalido']) {
      expect(MENSAJES_ERROR_TICKETS[c]).toBeTruthy();
    }
  });
});

describe('seguimientoTicket', () => {
  it('conserva adjuntoUrl (URL firmada) y quita el ok', async () => {
    invokeSdk.mockResolvedValue({
      data: { ok: true, codigo: 'TCK-0001', comentarios: [], adjuntoUrl: 'https://almacen.test/firmada?f=1', adjuntoExpiraSegundos: 300 },
      error: null,
    });
    const r = await seguimientoTicket('tok');
    expect(r).toEqual({ codigo: 'TCK-0001', comentarios: [], adjuntoUrl: 'https://almacen.test/firmada?f=1', adjuntoExpiraSegundos: 300 });
  });
});

describe('ticketsApi.getTicket — la captura ya no es una URL pública', () => {
  async function detalle(fila) {
    globalThis.__respuestaGetTicket = fila;
    return ticketsApi.getTicket('tck-1');
  }
  const base = { id: 'tck-1', codigo: 'TCK-0001', token: 'tok', titulo: 't', descripcion: 'd', estado: 'abierto', created_at: 'x', updated_at: 'y' };

  it('pide adjunto_key (no adjunto_url) y expone solo tiene_adjunto', async () => {
    const t = await detalle({ ...base, adjunto_key: 'tickets/tck-1/captura.jpg' });
    expect(globalThis.__ultimaQuery.cols).toContain('adjunto_key');
    expect(globalThis.__ultimaQuery.cols).not.toContain('adjunto_url');
    expect(t.tiene_adjunto).toBe(true);
    expect(t).not.toHaveProperty('adjunto_url');
    expect(t).not.toHaveProperty('adjunto_key'); // la key del objeto no viaja a los componentes
  });

  it('sin adjunto_key: tiene_adjunto false', async () => {
    expect((await detalle({ ...base, adjunto_key: null })).tiene_adjunto).toBe(false);
  });
});

describe('maqueta — servidor falso de tickets (rpc-tickets.js)', () => {
  const db = () => JSON.parse(JSON.stringify(TABLAS));
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:maqueta-captura') }));
  });

  it('el ticket de ejemplo con captura la tiene como adjunto_key (sin URL pública)', () => {
    const t = TABLAS.tickets.find((x) => x.adjunto_key);
    expect(t).toBeTruthy();
    expect(TABLAS.tickets.some((x) => 'adjunto_url' in x)).toBe(false);
  });

  it('adjuntoStaff: URL firmada de 300 s para un ticket con captura; no_existe si no la tiene', () => {
    const d = db();
    const con = d.tickets.find((x) => x.adjunto_key);
    const sin = d.tickets.find((x) => !x.adjunto_key);
    expect(funcionTickets(d, { action: 'adjuntoStaff', ticketId: con.id })).toEqual({ ok: true, url: 'blob:maqueta-captura', expiraSegundos: 300 });
    expect(funcionTickets(d, { action: 'adjuntoStaff', ticketId: sin.id })).toEqual({ ok: false, code: 'no_existe' });
    expect(funcionTickets(d, { action: 'adjuntoStaff', ticketId: 'no-existe' })).toEqual({ ok: false, code: 'no_existe' });
  });

  it('seguimiento: devuelve la forma de la function con adjuntoUrl firmada y NUNCA la key', () => {
    const d = db();
    const con = d.tickets.find((x) => x.adjunto_key);
    const r = funcionTickets(d, { action: 'seguimiento', token: con.token });
    expect(r).toMatchObject({ ok: true, codigo: con.codigo, adjuntoUrl: 'blob:maqueta-captura', adjuntoExpiraSegundos: 300 });
    expect(JSON.stringify(r)).not.toContain(con.adjunto_key);
    const sin = d.tickets.find((x) => !x.adjunto_key);
    expect(funcionTickets(d, { action: 'seguimiento', token: sin.token })).toMatchObject({ ok: true, adjuntoUrl: null, adjuntoExpiraSegundos: null });
    expect(funcionTickets(d, { action: 'seguimiento', token: 'no-existe' })).toEqual({ ok: false, code: 'no_existe' });
  });

  it('otras acciones no se atienden (el llamador cae a su respuesta por defecto)', () => {
    expect(funcionTickets(db(), { action: 'crear' })).toBeNull();
  });
});
