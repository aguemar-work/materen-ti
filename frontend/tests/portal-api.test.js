// API del portal del empleado (migración 109): la pública pasa por la function
// "portal" (mapa de códigos → mensajes en español, de usted) y la de staff por
// RPC con argumentos nombrados y lectura solo de columnas no secretas.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invocaciones = [];
let respuestaFuncion = () => ({ data: { ok: true }, error: null });
const llamadasRpc = [];
let respuestaRpc = () => ({ data: null, error: null });
const consultas = [];
let respuestaTabla = () => ({ data: null, error: null });

vi.mock('../src/api/client.js', () => ({
  getClient: () => ({
    functions: {
      invoke: async (nombre, { body }) => {
        invocaciones.push({ nombre, body });
        return respuestaFuncion(body);
      },
    },
    database: {
      rpc: async (nombre, args) => {
        llamadasRpc.push({ nombre, args });
        return respuestaRpc(nombre, args);
      },
      from: (tabla) => {
        const q = { tabla, op: [] };
        consultas.push(q);
        const b = new Proxy({}, {
          get(_, metodo) {
            if (metodo === 'then') return (res, rej) => Promise.resolve(respuestaTabla(q)).then(res, rej);
            return (...args) => { q.op.push([metodo, ...args]); return b; };
          },
        });
        return b;
      },
    },
  }),
}));

import { abrirPortal, confirmarEquipoPortal, MENSAJES_ERROR_PORTAL } from '../src/api/portalEmpleado.js';
import { portalApi } from '../src/api/domains/portal.js';

beforeEach(() => {
  invocaciones.length = 0;
  llamadasRpc.length = 0;
  consultas.length = 0;
  respuestaFuncion = () => ({ data: { ok: true }, error: null });
  respuestaRpc = () => ({ data: null, error: null });
  respuestaTabla = () => ({ data: null, error: null });
});

describe('portal público (edge function)', () => {
  it('abrirPortal invoca la acción abrir con el token y devuelve el contenido sin la marca ok', async () => {
    respuestaFuncion = () => ({ data: { ok: true, nombre: 'Rosa', alcance: ['ver_equipos'], equipos: [] }, error: null });
    const r = await abrirPortal('TOK');
    expect(invocaciones).toEqual([{ nombre: 'portal', body: { action: 'abrir', token: 'TOK' } }]);
    expect(r).toEqual({ nombre: 'Rosa', alcance: ['ver_equipos'], equipos: [] });
  });

  it('confirmarEquipoPortal manda el id y normaliza la respuesta', async () => {
    respuestaFuncion = () => ({ data: { ok: true, yaConfirmada: true, confirmadoAt: '2026-10-01T10:00:00Z' }, error: null });
    expect(await confirmarEquipoPortal('TOK', 'a-1')).toEqual({ yaConfirmada: true, confirmadoAt: '2026-10-01T10:00:00Z' });
    expect(invocaciones[0].body).toEqual({ action: 'confirmarEquipo', token: 'TOK', asignacionId: 'a-1' });
    respuestaFuncion = () => ({ data: { ok: true }, error: null });
    expect(await confirmarEquipoPortal('TOK', 'a-1')).toEqual({ yaConfirmada: false, confirmadoAt: null });
  });

  it.each(['no_existe', 'sin_alcance', 'no_encontrada', 'demasiados_intentos'])('el código %s llega como mensaje en español con su code', async (code) => {
    respuestaFuncion = () => ({ data: { ok: false, code }, error: null });
    await expect(abrirPortal('TOK')).rejects.toMatchObject({ code, message: MENSAJES_ERROR_PORTAL[code] });
  });

  it('un error HTTP con code (429, 500) también conserva el code y el mensaje del dominio', async () => {
    respuestaFuncion = () => ({ data: null, error: { code: 'demasiados_intentos', message: 'x' } });
    await expect(abrirPortal('TOK')).rejects.toMatchObject({ code: 'demasiados_intentos', message: MENSAJES_ERROR_PORTAL.demasiados_intentos });
  });

  it('un código desconocido cae a un texto genérico en español, sin mostrar el código', async () => {
    respuestaFuncion = () => ({ data: { ok: false, code: 'raro' }, error: null });
    const e = await abrirPortal('TOK').catch((x) => x);
    expect(e.message).toBe('No se pudo completar la operación. Intente de nuevo en unos minutos.');
    expect(e.message).not.toContain('raro');
  });

  it('los mensajes tratan de usted y no tutean', () => {
    for (const m of Object.values(MENSAJES_ERROR_PORTAL)) expect(m).not.toMatch(/\b(tu|tus|tienes|puedes|solicita)\b/i);
    expect(MENSAJES_ERROR_PORTAL.no_existe).toMatch(/Solicite/);
  });
});

describe('portal de staff (RPC y lectura)', () => {
  it('emitirEnlacePortal usa argumentos nombrados, manda null por defecto y devuelve el token', async () => {
    respuestaRpc = () => ({ data: { ok: true, id: 'l1', token: 'TOKEN24', expires_at: '2026-10-09T00:00:00Z', alcance: ['ver_equipos'], dias: 7 }, error: null });
    const r = await portalApi.emitirEnlacePortal('e1');
    expect(llamadasRpc).toEqual([{ nombre: 'portal_emitir_enlace', args: { p_empleado_id: 'e1', p_alcance: null, p_dias: null } }]);
    expect(r).toEqual({ id: 'l1', token: 'TOKEN24', expiraEn: '2026-10-09T00:00:00Z', alcance: ['ver_equipos'], dias: 7 });
  });

  it('manda el alcance y los días elegidos', async () => {
    respuestaRpc = () => ({ data: { id: 'l1', token: 'T', expires_at: 'x', alcance: ['ver_accesos'], dias: 3 }, error: null });
    await portalApi.emitirEnlacePortal('e1', { alcance: ['ver_accesos'], dias: 3 });
    expect(llamadasRpc[0].args).toEqual({ p_empleado_id: 'e1', p_alcance: ['ver_accesos'], p_dias: 3 });
  });

  it('un error de la RPC se relanza crudo (lo traduce quien lo muestra)', async () => {
    respuestaRpc = () => ({ data: null, error: { code: '42501', message: 'No autorizado' } });
    await expect(portalApi.emitirEnlacePortal('e1')).rejects.toMatchObject({ code: '42501' });
    await expect(portalApi.revocarEnlacePortal('e1')).rejects.toMatchObject({ code: '42501' });
  });

  it('revocarEnlacePortal devuelve true solo si había un enlace', async () => {
    respuestaRpc = () => ({ data: true, error: null });
    expect(await portalApi.revocarEnlacePortal('e1')).toBe(true);
    respuestaRpc = () => ({ data: false, error: null });
    expect(await portalApi.revocarEnlacePortal('e1')).toBe(false);
    expect(llamadasRpc[0]).toEqual({ nombre: 'portal_revocar_enlace', args: { p_empleado_id: 'e1' } });
  });

  it('enlacePortalActivo pide SOLO columnas no secretas, sin revocar, del empleado', async () => {
    respuestaTabla = () => ({ data: { id: 'l1', expires_at: 'x' }, error: null });
    expect(await portalApi.enlacePortalActivo('e1')).toEqual({ id: 'l1', expires_at: 'x' });
    const q = consultas[0];
    expect(q.tabla).toBe('empleado_enlaces');
    const columnas = q.op.find(([m]) => m === 'select')[1];
    expect(columnas).not.toMatch(/token_hash|ultimo_ip|\*/);
    expect(q.op).toContainEqual(['eq', 'empleado_id', 'e1']);
    expect(q.op).toContainEqual(['is', 'revocado_at', null]);
  });

  it('sin enlace devuelve null', async () => {
    respuestaTabla = () => ({ data: null, error: null });
    expect(await portalApi.enlacePortalActivo('e1')).toBeNull();
  });
});
