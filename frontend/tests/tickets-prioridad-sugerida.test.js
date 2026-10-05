// Tests del HANDLER de la edge function `tickets` para la prioridad inicial
// (migración 116), con el SDK falso de tests/stubs/sdk-falso.js (sin red ni BD):
//   - con sesión de staff, `crear` pasa a la RPC la prioridad explícita SOLO si
//     es un valor del CHECK (baja, media, alta, urgente); otra cosa viaja null y
//     la RPC deja la sugerida por la subcategoría
//   - sin sesión (portal público) la prioridad NO viaja aunque el cliente la mande
//   - `catalogo` devuelve prioridad_sugerida (el portal la recibe pero no la pinta)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sdk, reiniciarSdk, consultasDe } from './stubs/sdk-falso.js';

vi.mock('./stubs/insforge-sdk.js', () => import('./stubs/sdk-falso.js'));

const { default: tickets } = await import('../../functions/dist/tickets.ts');

const ORIGEN = 'http://localhost:5173';
const creadoOk = { data: { ok: true, id: '55555555-5555-4555-8555-555555555555', codigo: 'TCK-0042', token: 'AbCdEfGhIjKlMnOpQrStUvWx', vinculado: true }, error: null };

function peticion(body, { token = 'token-de-prueba' } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGEN, 'cf-connecting-ip': '10.0.0.8' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://funciones.test/fn', { method: 'POST', headers, body: JSON.stringify(body) });
}

function responder(extra = {}) {
  return (q) => {
    const clave = `${q.tabla}:${q.op}`;
    if (extra[clave]) return extra[clave](q);
    if (clave === 'crear_ticket_publico:rpc') return creadoOk;
    if (q.tabla === 'staff') return { data: { rol: 'ASISTENTE', activo: true }, error: null };
    if (q.tabla === 'intentos_publicos' && q.op === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

const datosRpc = () => consultasDe('crear_ticket_publico', 'rpc')[0]?.payload?.p_datos;
const cuerpo = (extra = {}) => ({ action: 'crear', titulo: 't', descripcion: 'd', categoriaId: 'red', subcategoriaId: null, ...extra });

beforeEach(() => {
  reiniciarSdk();
  sdk.usuario = { id: 'u-1', email: 'asistente@materen.test' };
  sdk.responder = responder();
});

describe('tickets.crear — prioridad inicial (116)', () => {
  it('con sesión de staff, una prioridad válida viaja a la RPC', async () => {
    const r = await tickets(peticion(cuerpo({ prioridad: 'urgente', origen: 'staff_interno' })));
    expect(r.status).toBe(200);
    expect(datosRpc()).toMatchObject({ staff_id: 'u-1', prioridad: 'urgente' });
  });

  it('con sesión de staff, un valor fuera del CHECK viaja null (la RPC deja la sugerida)', async () => {
    await tickets(peticion(cuerpo({ prioridad: 'critica' })));
    expect(datosRpc().prioridad).toBeNull();
    await tickets(peticion(cuerpo({})));
    expect(consultasDe('crear_ticket_publico', 'rpc')[1].payload.p_datos.prioridad).toBeNull();
  });

  it('sin sesión (portal público) la prioridad no viaja aunque el cliente la mande', async () => {
    sdk.usuario = null;
    const r = await tickets(peticion(cuerpo({ prioridad: 'urgente' }), { token: null }));
    expect(r.status).toBe(200);
    const p = datosRpc();
    expect(p).not.toHaveProperty('prioridad');
    expect(p).not.toHaveProperty('staff_id');
  });
});

describe('tickets.catalogo — prioridad_sugerida (116)', () => {
  it('la devuelve tal como está en la base', async () => {
    sdk.usuario = null;
    sdk.responder = responder({
      'categorias_ticket:select': () => ({ data: [{ id: 'seguridad', nombre: 'Seguridad de la Información', aviso: null }], error: null }),
      'subcategorias_ticket:select': () => ({
        data: [{ id: 's-v', categoria_id: 'seguridad', nombre: 'Virus o malware sospechoso', tipo_sugerido: 'incidente', prioridad_sugerida: 'urgente', aviso: null }],
        error: null,
      }),
    });
    const datos = await (await tickets(peticion({ action: 'catalogo' }, { token: null }))).json();
    expect(datos.subcategorias[0]).toMatchObject({ id: 's-v', prioridad_sugerida: 'urgente' });
  });
});
