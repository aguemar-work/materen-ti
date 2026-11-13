// @vitest-environment happy-dom
//
// Migración a Kapo TI (2026-11-13): la creación de tickets está cerrada.
//   - Barrera real: la edge function `tickets`, acción `crear`, responde
//     `creacion_cerrada` sin tocar la BD salvo que el secret
//     TICKETS_CREACION_ABIERTA valga 'si' (tests/setup.js lo abre para el
//     resto de la suite; aquí se borra).
//   - Pantallas: /soporte/nuevo, /soporte y el modal interno del staff
//     muestran el aviso con el enlace y no ofrecen el formulario.
//   - El resto de la function (seguimiento, encuesta…) no se cierra.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import { sdk, reiniciarSdk, consultasDe } from './stubs/sdk-falso.js';
import { AVISO_NUEVO_SISTEMA, CREACION_TICKETS_CERRADA, ENLACE_NUEVO_SISTEMA } from '../src/core/dominio-tickets.js';

vi.mock('./stubs/insforge-sdk.js', () => import('./stubs/sdk-falso.js'));
vi.mock('../src/api/ticketsPublicos.js', async (importOriginal) => ({
  ...(await importOriginal()),
  catalogoTickets: vi.fn(),
  crearTicket: vi.fn(),
}));
vi.mock('../src/api/insforge.js', () => ({
  insforgeApi: {
    listCategoriasTicket: vi.fn().mockResolvedValue([]),
    listSubcategoriasTicket: vi.fn().mockResolvedValue([]),
    listEmpleados: vi.fn().mockResolvedValue([]),
  },
}));

const { default: tickets } = await import('../../functions/dist/tickets.ts');
const { catalogoTickets, MENSAJES_ERROR_TICKETS } = await import('../src/api/ticketsPublicos.js');
const { insforgeApi } = await import('../src/api/insforge.js');
const { default: TicketNuevoView } = await import('../src/modules/tickets/TicketNuevoView.vue');
const { default: SoporteView } = await import('../src/modules/soporte/SoporteView.vue');
const { default: TicketInternoForm } = await import('../src/modules/tickets/TicketInternoForm.vue');

const TEXTO = 'POR FAVOR EL NUEVO ENLACE ES kapo.com.pe - Modulo TI';
const normalizar = (t) => t.replace(/\s+/g, ' ').trim();

function peticion(body) {
  return new Request('https://funciones.test/fn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify(body),
  });
}

describe('constantes del aviso', () => {
  it('la creación está cerrada y el texto es exactamente el pedido por TI', () => {
    expect(CREACION_TICKETS_CERRADA).toBe(true);
    expect(AVISO_NUEVO_SISTEMA).toBe(TEXTO);
    expect(ENLACE_NUEVO_SISTEMA).toBe('https://kapo.com.pe');
    expect(MENSAJES_ERROR_TICKETS.creacion_cerrada).toBe(TEXTO);
  });
});

describe('edge function tickets — crear cerrada', () => {
  let getOriginal;
  beforeEach(() => {
    reiniciarSdk();
    sdk.usuario = null;
    getOriginal = globalThis.Deno.env.get;
  });
  afterEach(() => {
    globalThis.Deno.env.get = getOriginal;
  });
  const sinSecret = () => {
    globalThis.Deno.env.get = (k) => (k === 'TICKETS_CREACION_ABIERTA' ? undefined : getOriginal(k));
  };

  it('sin el secret responde creacion_cerrada y no llama a crear_ticket_publico', async () => {
    sinSecret();
    const r = await tickets(peticion({ action: 'crear', titulo: 't', descripcion: 'd', categoriaId: 'c', contacto: '12345678' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: false, code: 'creacion_cerrada' });
    expect(consultasDe('crear_ticket_publico', 'rpc')).toHaveLength(0);
  });

  it('un valor distinto de "si" no la reabre', async () => {
    globalThis.Deno.env.get = (k) => (k === 'TICKETS_CREACION_ABIERTA' ? 'true' : getOriginal(k));
    const r = await tickets(peticion({ action: 'crear', titulo: 't', descripcion: 'd', categoriaId: 'c' }));
    expect((await r.json()).code).toBe('creacion_cerrada');
  });

  it('las demás acciones no se cierran (ping responde ok)', async () => {
    sinSecret();
    const r = await tickets(peticion({ action: 'ping' }));
    expect((await r.json()).ok).toBe(true);
  });
});

describe('pantallas con la creación cerrada', () => {
  let w;
  afterEach(() => {
    w?.unmount();
    document.body.innerHTML = '';
  });

  async function montarConRouter(componente, ruta) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/soporte', name: 'soporte', component: { template: '<div />' } },
        { path: '/soporte/nuevo', name: 'ticket-nuevo', component: { template: '<div />' } },
        { path: '/soporte/buscar', name: 'ticket-buscar', component: { template: '<div />' } },
        { path: '/soporte/t/:token', name: 'ticket-seguimiento', component: { template: '<div />' } },
      ],
    });
    router.push(ruta);
    await router.isReady();
    w = mount(componente, { attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }

  const aviso = () => document.querySelector('[data-aviso-nuevo-sistema]');

  it('/soporte/nuevo muestra el aviso con el enlace, sin formulario ni catálogo', async () => {
    await montarConRouter(TicketNuevoView, '/soporte/nuevo');
    expect(normalizar(aviso().textContent)).toBe(TEXTO);
    const a = aviso().querySelector('a');
    expect(a.getAttribute('href')).toBe('https://kapo.com.pe');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(document.querySelector('form')).toBeNull();
    expect(catalogoTickets).not.toHaveBeenCalled();
  });

  it('/soporte muestra el aviso, oculta «Reportar un problema» y conserva el seguimiento', async () => {
    await montarConRouter(SoporteView, '/soporte');
    expect(normalizar(aviso().textContent)).toBe(TEXTO);
    expect(document.body.textContent).not.toContain('Reportar un problema');
    expect(document.body.textContent).toContain('Seguimiento de tickets');
  });

  it('el modal interno del staff muestra el aviso, sin formulario ni botón Crear', async () => {
    w = mount(TicketInternoForm, { global: { plugins: [[PrimeVue, { unstyled: true }]] } });
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(normalizar(aviso().textContent)).toBe(TEXTO);
    expect(document.querySelector('#ti-form')).toBeNull();
    const botones = [...document.querySelectorAll('button')].map((b) => b.textContent.trim());
    expect(botones).not.toContain('Crear ticket');
    expect(botones).toContain('Cerrar');
    expect(insforgeApi.listCategoriasTicket).not.toHaveBeenCalled();
  });
});
