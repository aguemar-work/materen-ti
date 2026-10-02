// @vitest-environment happy-dom
//
// Tickets enlazados a un cambio (migración 107): lista con enlace al ticket,
// enlazar escribiendo el código (TCK-0123) y quitar el enlace. Sin el módulo
// tickets solo se ve. Solo api/insforge.js está mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import CambioTickets from '../../src/modules/cambios/CambioTickets.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    buscarTicketPorCodigo: vi.fn(),
    vincularCambioTicket: vi.fn(),
    desvincularCambioTicket: vi.fn(),
    getCambio: vi.fn(),
    listEventosCambio: vi.fn(),
    ticketsDeCambio: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const CAMBIO = { id: 'c1', codigo: 'CHG-0004' };
const TICKETS = [
  { id: 't1', codigo: 'TCK-0007', titulo: 'Sin internet en la sede', estado: 'en_progreso', vinculado_at: '2026-10-02T09:00:00Z' },
];

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar(props = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:resto(.*)*', component: { template: '<div />' } }] });
  router.push('/');
  await router.isReady();
  wrapper = mount(CambioTickets, {
    props: { cambio: CAMBIO, tickets: TICKETS, puedeEnlazar: true, ...props },
    attachTo: document.body,
    global: { plugins: [router, [PrimeVue, { unstyled: true }]] },
  });
  await espera();
  return wrapper;
}

const boton = (w, texto) => w.findAll('button').find((b) => b.text().startsWith(texto));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.buscarTicketPorCodigo.mockResolvedValue({ id: 't2', codigo: 'TCK-0010', titulo: 'Otro', estado: 'abierto' });
  insforgeApi.vincularCambioTicket.mockResolvedValue({});
  insforgeApi.desvincularCambioTicket.mockResolvedValue(true);
  insforgeApi.getCambio.mockResolvedValue(null);
  insforgeApi.listEventosCambio.mockResolvedValue([]);
  insforgeApi.ticketsDeCambio.mockResolvedValue([]);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('CambioTickets', () => {
  it('lista los tickets con su código, título y estado, enlazados a su ficha', async () => {
    const w = await montar();
    expect(w.find('h2').text()).toContain('Tickets enlazados');
    const li = w.findAll('[data-ticket-enlazado]');
    expect(li).toHaveLength(1);
    expect(li[0].find('a[href="/tickets/t1"]').text()).toContain('TCK-0007');
    expect(li[0].text()).toContain('Sin internet en la sede');
    expect(li[0].find('button[aria-label="Quitar el enlace con el ticket TCK-0007"]').exists()).toBe(true);
  });

  it('sin tickets dice cómo usarlo', async () => {
    const w = await montar({ tickets: [] });
    expect(w.text()).toContain('Sin tickets enlazados');
  });

  it('sin el módulo tickets solo se ve: ni «Enlazar ticket» ni quitar', async () => {
    const w = await montar({ puedeEnlazar: false });
    expect(boton(w, 'Enlazar ticket')).toBeUndefined();
    expect(w.find('button[aria-label^="Quitar el enlace"]').exists()).toBe(false);
  });

  it('enlazar: busca el código, enlaza el ticket encontrado y cierra el formulario', async () => {
    const w = await montar();
    await boton(w, 'Enlazar ticket').trigger('click');
    const input = w.find('input[type="text"]');
    await input.setValue(' tck-0010 ');
    await w.find('form').trigger('submit');
    await espera(30);
    expect(insforgeApi.buscarTicketPorCodigo).toHaveBeenCalledWith('tck-0010');
    expect(insforgeApi.vincularCambioTicket).toHaveBeenCalledWith('c1', 't2');
    expect(w.find('form').exists()).toBe(false);
  });

  it('un código que no existe lo dice y no enlaza nada', async () => {
    insforgeApi.buscarTicketPorCodigo.mockResolvedValue(null);
    const w = await montar();
    await boton(w, 'Enlazar ticket').trigger('click');
    await w.find('input[type="text"]').setValue('TCK-9999');
    await w.find('form').trigger('submit');
    await espera(30);
    expect(w.find('[role="alert"]').text()).toContain('No hay un ticket con el código TCK-9999');
    expect(insforgeApi.vincularCambioTicket).not.toHaveBeenCalled();
    expect(w.find('form').exists()).toBe(true);
  });

  it('sin escribir nada pide el código; un rechazo del servidor sale en español', async () => {
    const w = await montar();
    await boton(w, 'Enlazar ticket').trigger('click');
    await w.find('form').trigger('submit');
    await espera();
    expect(w.find('[role="alert"]').text()).toContain('Escriba el código del ticket');
    insforgeApi.vincularCambioTicket.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    await w.find('input[type="text"]').setValue('TCK-0010');
    await w.find('form').trigger('submit');
    await espera(30);
    expect(w.find('[role="alert"]').text()).toContain('No tiene permiso');
  });

  it('quitar el enlace llama a la RPC con el cambio y el ticket', async () => {
    const w = await montar();
    await w.find('button[aria-label^="Quitar el enlace"]').trigger('click');
    await espera(30);
    expect(insforgeApi.desvincularCambioTicket).toHaveBeenCalledWith('c1', 't1');
  });
});
