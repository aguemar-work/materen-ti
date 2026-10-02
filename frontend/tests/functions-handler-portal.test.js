// Tests del HANDLER de la edge function `portal` (migración 109: portal del
// empleado por enlace firmado), con el SDK falso de tests/stubs/sdk-falso.js
// (sin red, sin BD). Comprueba:
//   - sin oráculo: token mal formado, inexistente, vencido o revocado responden igual
//   - rate-limit por IP y por token (20 / 10 min) sobre intentos_publicos, sin el token en claro
//   - la respuesta se proyecta campo por campo: nunca contraseña, URL, notas ni token
//   - el token no llega a los logs ni a las respuestas de error
//   - fail-closed: un error de la base o del rate-limit es error_interno (500), nunca "no existe"
//   - confirmarEquipo: validación del id, códigos de negocio y fallo ante un código desconocido
//   - ping sin BD y version solo para staff
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sdk, reiniciarSdk, consultasDe } from './stubs/sdk-falso.js';

vi.mock('./stubs/insforge-sdk.js', () => import('./stubs/sdk-falso.js'));

const { default: portal } = await import('../../functions/dist/portal.ts');

const ORIGEN = 'http://localhost:5173';
const TOKEN = 'Ab3_dEf-Gh1jKlMnOpQrStUv';
const ASIGNACION = '0b0c1e0a-6b0e-4a4e-9a55-2f7f1b1c2d3e';
const IP = '203.0.113.50';
const FALLA_BD = { data: null, error: { message: 'falla simulada de BD' } };

function peticion(body, { ip = IP, token = null, metodo = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGEN };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['cf-connecting-ip'] = ip;
  return new Request('https://funciones.test/fn', {
    method: metodo,
    headers,
    body: metodo === 'POST' ? JSON.stringify(body) : undefined,
  });
}

// Respuesta de portal_abrir CON basura peligrosa mezclada: la function debe proyectar.
const RPC_PORTAL = {
  ok: true,
  nombre: 'Rosa Quispe',
  vence: '2026-10-09T12:00:00Z',
  alcance: ['ver_accesos', 'ver_equipos', 'ver_tickets', 'confirmar_equipo'],
  password: 'NO-DEBE-SALIR',
  equipos: [{
    asignacion_id: ASIGNACION, codigo: 'LAP-0001', tipo: 'Laptop', entregado: '2026-09-01', condicion: 'Nuevo',
    confirmado_at: null, serie: 'NO-DEBE-SALIR-SERIE', costo: 9999,
  }],
  accesos: [{ plataforma: 'Gmail', usuario: 'rosa@x.pe', password: 'NO-DEBE-SALIR-PW', url: 'https://secreto.example', notas: 'NO-DEBE-SALIR-NOTAS' }],
  tickets: [{ codigo: 'TCK-0001', titulo: 'No imprime', estado: 'abierto', creado: '2026-09-30T10:00:00Z', token: 'NO-DEBE-SALIR-TICKET-TOKEN' }],
};

// Responde a las RPC del portal; el resto (rate-limit) cuenta 0 intentos.
function responder({ abrir = () => ({ data: RPC_PORTAL, error: null }), confirmar = () => ({ data: { ok: true, ya_confirmada: false, confirmado_at: '2026-10-02T15:00:00Z' }, error: null }), extra = {} } = {}) {
  return (q) => {
    const clave = `${q.tabla}:${q.op}`;
    if (extra[clave]) return extra[clave](q);
    if (q.op === 'rpc' && q.tabla === 'portal_abrir') return abrir(q);
    if (q.op === 'rpc' && q.tabla === 'portal_confirmar_equipo') return confirmar(q);
    if (q.tabla === 'intentos_publicos' && q.op === 'select') return { data: [], error: null };
    if (q.tabla === 'staff') return { data: { rol: 'JEFE', activo: true }, error: null };
    return { data: null, error: null };
  };
}

const rpcs = (nombre) => consultasDe(nombre, 'rpc');
const intentos = () => consultasDe('intentos_publicos', 'insert').flatMap((q) => q.payload);
const llenos = (n) => ({ data: Array.from({ length: n }, (_, i) => ({ id: i })), error: null });

let errores;
beforeEach(() => {
  reiniciarSdk();
  sdk.usuario = null;
  sdk.responder = responder();
  errores = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errores.mockRestore());

describe('portal — acciones básicas', () => {
  it('ping responde sin sesión y sin tocar la base', async () => {
    const r = await portal(peticion({ action: 'ping' }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, funcion: 'portal' });
    expect(sdk.consultas).toHaveLength(0);
  });

  it('un método distinto de POST es 405 y una acción desconocida es 400', async () => {
    expect((await portal(peticion({}, { metodo: 'GET' }))).status).toBe(405);
    const r = await portal(peticion({ action: 'inventada' }));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe('accion_desconocida');
  });

  it('las respuestas llevan CORS del origen permitido y no se cachean', async () => {
    const r = await portal(peticion({ action: 'abrir', token: TOKEN }));
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEN);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('version exige staff: sin sesión es 401', async () => {
    const r = await portal(peticion({ action: 'version' }));
    expect(r.status).toBe(401);
    expect(sdk.consultas.filter((q) => q.tabla === 'portal_abrir')).toHaveLength(0);
  });
});

describe('portal — abrir', () => {
  it('llama a portal_abrir con el token y la IP y devuelve el portal proyectado', async () => {
    const r = await portal(peticion({ action: 'abrir', token: TOKEN }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.nombre).toBe('Rosa Quispe');
    expect(j.equipos).toEqual([{ asignacion_id: ASIGNACION, codigo: 'LAP-0001', tipo: 'Laptop', entregado: '2026-09-01', condicion: 'Nuevo', confirmado_at: null }]);
    expect(j.accesos).toEqual([{ plataforma: 'Gmail', usuario: 'rosa@x.pe' }]);
    expect(j.tickets).toEqual([{ codigo: 'TCK-0001', titulo: 'No imprime', estado: 'abierto', creado: '2026-09-30T10:00:00Z' }]);
    expect(rpcs('portal_abrir')[0].payload).toEqual({ p_token: TOKEN, p_ip: IP });
  });

  it('NUNCA entrega contraseñas, URL, notas, series ni el token de un ticket (proyección campo por campo)', async () => {
    const texto = await (await portal(peticion({ action: 'abrir', token: TOKEN }))).text();
    for (const prohibido of ['NO-DEBE-SALIR', 'password', 'secreto.example', 'serie', 'costo']) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it('sin el alcance de una sección, esa clave no aparece', async () => {
    sdk.responder = responder({ abrir: () => ({ data: { ok: true, nombre: 'Rosa', vence: null, alcance: ['ver_accesos'], accesos: [] }, error: null }) });
    const j = await (await portal(peticion({ action: 'abrir', token: TOKEN }))).json();
    expect(j).not.toHaveProperty('equipos');
    expect(j).not.toHaveProperty('tickets');
    expect(j.accesos).toEqual([]);
  });

  it('SIN ORÁCULO: token mal formado, inexistente, vencido o revocado dan exactamente la misma respuesta', async () => {
    const malFormado = await portal(peticion({ action: 'abrir', token: 'corto' }));
    sdk.responder = responder({ abrir: () => ({ data: { ok: false, code: 'no_existe' }, error: null }) });
    const noExiste = await portal(peticion({ action: 'abrir', token: TOKEN }));
    expect(malFormado.status).toBe(noExiste.status);
    expect(await malFormado.json()).toEqual(await noExiste.json());
    expect(noExiste.status).toBe(200);
  });

  it('un token mal formado, ausente o no textual no llega a la base (pero sí cuenta para la IP)', async () => {
    for (const token of ['', 'corto', 'x'.repeat(25), 12345, null, undefined]) {
      reiniciarSdk();
      sdk.responder = responder();
      const r = await portal(peticion({ action: 'abrir', token }));
      expect((await r.json()).code).toBe('no_existe');
      expect(rpcs('portal_abrir')).toHaveLength(0);
      expect(intentos().map((i) => i.ambito)).toEqual(['portal.ip']);
    }
  });

  it('un código inesperado de la RPC es error interno, nunca "no existe"', async () => {
    sdk.responder = responder({ abrir: () => ({ data: { ok: false, code: 'raro' }, error: null }) });
    const r = await portal(peticion({ action: 'abrir', token: TOKEN }));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
  });

  it('un error de la base es 500 error_interno y el token no sale en la respuesta ni en el log', async () => {
    sdk.responder = responder({ abrir: () => FALLA_BD });
    const r = await portal(peticion({ action: 'abrir', token: TOKEN }));
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(texto).code).toBe('error_interno');
    expect(texto).not.toContain(TOKEN);
    expect(JSON.stringify(errores.mock.calls)).not.toContain(TOKEN);
  });
});

describe('portal — rate-limit (intentos_publicos)', () => {
  it('cuenta por IP y por token; la clave del token es un hash corto, nunca el token', async () => {
    await portal(peticion({ action: 'abrir', token: TOKEN }));
    const filas = intentos();
    expect(filas.map((f) => f.ambito)).toEqual(['portal.ip', 'portal.token']);
    expect(filas[0].clave).toBe(IP);
    expect(filas[1].clave).toMatch(/^[0-9a-f]{32}$/);
    const deRateLimit = sdk.consultas.filter((q) => q.tabla === 'intentos_publicos');
    expect(deRateLimit.length).toBeGreaterThan(0);
    expect(JSON.stringify(deRateLimit.map((q) => [q.payload, q.filtros]))).not.toContain(TOKEN);
  });

  it('20 intentos por IP en la ventana: 429 y no llega a la RPC', async () => {
    sdk.responder = responder({ extra: { 'intentos_publicos:select': () => llenos(20) } });
    const r = await portal(peticion({ action: 'abrir', token: TOKEN }));
    expect(r.status).toBe(429);
    expect((await r.json()).code).toBe('demasiados_intentos');
    expect(rpcs('portal_abrir')).toHaveLength(0);
    expect(intentos()).toHaveLength(0);
  });

  it('19 intentos todavía pasan (el límite es 20)', async () => {
    sdk.responder = responder({ extra: { 'intentos_publicos:select': () => llenos(19) } });
    const r = await portal(peticion({ action: 'abrir', token: TOKEN }));
    expect(r.status).toBe(200);
    expect(rpcs('portal_abrir')).toHaveLength(1);
  });

  it('el tope por token funciona aparte del de la IP', async () => {
    let n = 0;
    sdk.responder = responder({ extra: { 'intentos_publicos:select': (q) => {
      n += 1;
      const ambito = q.filtros.find(([t, c]) => t === 'eq' && c === 'ambito')[2];
      return ambito === 'portal.token' ? llenos(20) : { data: [], error: null };
    } } });
    const r = await portal(peticion({ action: 'abrir', token: TOKEN }));
    expect(n).toBe(2);
    expect(r.status).toBe(429);
    expect(rpcs('portal_abrir')).toHaveLength(0);
  });

  it('FAIL-CLOSED: si no se puede contar el rate-limit es error_interno', async () => {
    sdk.responder = responder({ extra: { 'intentos_publicos:select': () => FALLA_BD } });
    const r = await portal(peticion({ action: 'abrir', token: TOKEN }));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    expect(rpcs('portal_abrir')).toHaveLength(0);
  });
});

describe('portal — confirmarEquipo', () => {
  const pedir = (extra = {}) => portal(peticion({ action: 'confirmarEquipo', token: TOKEN, asignacionId: ASIGNACION, ...extra }));

  it('llama a portal_confirmar_equipo y devuelve fecha y si ya estaba confirmada', async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, yaConfirmada: false, confirmadoAt: '2026-10-02T15:00:00Z' });
    expect(rpcs('portal_confirmar_equipo')[0].payload).toEqual({ p_token: TOKEN, p_asignacion_id: ASIGNACION, p_ip: IP });
  });

  it('idempotente: una confirmación previa se informa como yaConfirmada', async () => {
    sdk.responder = responder({ confirmar: () => ({ data: { ok: true, ya_confirmada: true, confirmado_at: '2026-10-01T10:00:00Z' }, error: null }) });
    expect(await (await pedir()).json()).toEqual({ ok: true, yaConfirmada: true, confirmadoAt: '2026-10-01T10:00:00Z' });
  });

  it('un id que no es uuid no llega a la base: no_encontrada', async () => {
    for (const asignacionId of ['', 'abc', '1; drop table', 5, null]) {
      reiniciarSdk();
      sdk.responder = responder();
      const r = await pedir({ asignacionId });
      expect((await r.json()).code).toBe('no_encontrada');
      expect(rpcs('portal_confirmar_equipo')).toHaveLength(0);
    }
  });

  it('un token mal formado da no_existe, igual que en abrir', async () => {
    const r = await pedir({ token: 'corto' });
    expect(await r.json()).toEqual({ ok: false, code: 'no_existe' });
    expect(rpcs('portal_confirmar_equipo')).toHaveLength(0);
  });

  it.each(['no_existe', 'sin_alcance', 'no_encontrada'])('el código de negocio %s llega al navegador (200)', async (code) => {
    sdk.responder = responder({ confirmar: () => ({ data: { ok: false, code }, error: null }) });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: false, code });
  });

  it('un código desconocido o un error de la base es error_interno', async () => {
    sdk.responder = responder({ confirmar: () => ({ data: { ok: false, code: 'otro' }, error: null }) });
    expect((await pedir()).status).toBe(500);
    sdk.responder = responder({ confirmar: () => FALLA_BD });
    const r = await pedir();
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain(TOKEN);
    expect(JSON.stringify(errores.mock.calls)).not.toContain(TOKEN);
  });

  it('comparte el tope de intentos con abrir (por IP)', async () => {
    sdk.responder = responder({ extra: { 'intentos_publicos:select': () => llenos(20) } });
    const r = await pedir();
    expect(r.status).toBe(429);
    expect(rpcs('portal_confirmar_equipo')).toHaveLength(0);
  });
});
