// @vitest-environment happy-dom
//
// Artículos sugeridos para un ticket y «Registrar uso» (KEDB, migración 106).
// Componente autónomo: solo api/insforge.js está mockeado; el store de auth es
// real. Sin los módulos tickets y base_conocimiento no pinta nada.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TicketKbSugeridos from '../../src/modules/tickets/TicketKbSugeridos.vue';
import { useAuthStore } from '../../src/stores/auth.js';
import { toasts } from '../../src/core/toast.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listArticulosRelacionados: vi.fn(),
    listUsosKbTicket: vi.fn(),
    registrarUsoKbTicket: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const A1 = { id: 'k1', titulo: 'Reiniciar el spooler', tipo: 'solucion' };
const A2 = { id: 'k2', titulo: 'Workaround: Caídas', tipo: 'workaround' };

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar({ rol = 'JEFE', modulos = ['tickets', 'base_conocimiento'], props = {} } = {}) {
  const auth = useAuthStore();
  auth.rol = rol;
  auth.modulosVisibles = modulos;
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:resto(.*)*', component: { template: '<div />' } }] });
  router.push('/');
  await router.isReady();
  wrapper = mount(TicketKbSugeridos, {
    props: { ticketId: 't1', categoriaId: 'equipos', ...props },
    attachTo: document.body,
    global: { plugins: [router] },
  });
  for (let i = 0; i < 3; i += 1) await espera();
  return wrapper;
}

const botones = (w) => w.findAll('button').filter((b) => b.text().includes('Registrar uso'));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  toasts.length = 0;
  insforgeApi.listArticulosRelacionados.mockResolvedValue([A1, A2]);
  insforgeApi.listUsosKbTicket.mockResolvedValue([]);
  insforgeApi.registrarUsoKbTicket.mockResolvedValue({});
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('TicketKbSugeridos', () => {
  it('lista los artículos de la categoría con enlace, marca el tipo que no es solución y ofrece registrar el uso', async () => {
    const w = await montar();
    expect(insforgeApi.listArticulosRelacionados).toHaveBeenCalledWith({ categoriaId: 'equipos' });
    expect(insforgeApi.listUsosKbTicket).toHaveBeenCalledWith('t1');
    expect(w.find('a[href="/base-conocimiento/k1"]').text()).toBe('Reiniciar el spooler');
    expect(w.find('a[href="/base-conocimiento/k2"]').exists()).toBe(true);
    expect(w.text()).toContain('Workaround');
    expect(w.findAll('span').filter((s) => s.text() === 'Solución')).toHaveLength(0);
    expect(botones(w)).toHaveLength(2);
  });

  it('un artículo ya usado en este ticket no ofrece el botón', async () => {
    insforgeApi.listUsosKbTicket.mockResolvedValue([{ kb_articulo_id: 'k1' }]);
    const w = await montar();
    expect(w.text()).toContain('Usado en este ticket');
    expect(botones(w)).toHaveLength(1);
  });

  it('registrar el uso llama a la RPC, avisa, marca el artículo y emite el evento', async () => {
    const w = await montar();
    await botones(w)[0].trigger('click');
    await espera(); await espera();
    expect(insforgeApi.registrarUsoKbTicket).toHaveBeenCalledWith('t1', 'k1');
    expect(toasts.at(-1)).toMatchObject({ msg: 'Uso registrado en el artículo', tipo: 'success' });
    expect(w.text()).toContain('Usado en este ticket');
    expect(botones(w)).toHaveLength(1);
    expect(w.emitted('uso-registrado')[0][0]).toMatchObject({ id: 'k1' });
  });

  it('el rechazo del servidor sale traducido y el artículo sigue sin marcar', async () => {
    insforgeApi.registrarUsoKbTicket.mockRejectedValue({ code: 'P0001', message: 'Solo se registra el uso de artículos publicados.' });
    const w = await montar();
    await botones(w)[0].trigger('click');
    await espera(); await espera();
    expect(toasts.at(-1)).toMatchObject({ msg: 'Solo se registra el uso de artículos publicados.', tipo: 'error' });
    expect(botones(w)).toHaveLength(2);
    expect(w.emitted('uso-registrado')).toBeUndefined();
  });

  it('sin artículos dice que la categoría no tiene; si no cargan, lo avisa sin romper', async () => {
    insforgeApi.listArticulosRelacionados.mockResolvedValue([]);
    let w = await montar();
    expect(w.text()).toContain('Sin artículos publicados en esta categoría todavía.');
    wrapper.unmount();
    insforgeApi.listArticulosRelacionados.mockRejectedValue(new Error('x'));
    w = await montar();
    expect(w.text()).toContain('No se pudieron cargar las sugerencias.');
  });

  it('sin el módulo base_conocimiento (o tickets) no pinta ni consulta nada', async () => {
    const w = await montar({ rol: 'ASISTENTE', modulos: ['tickets'] });
    expect(w.html()).toBe('<!--v-if-->');
    expect(insforgeApi.listArticulosRelacionados).not.toHaveBeenCalled();
  });

  it('al cambiar de ticket vuelve a cargar', async () => {
    const w = await montar();
    await w.setProps({ ticketId: 't2' });
    await espera(); await espera();
    expect(insforgeApi.listUsosKbTicket).toHaveBeenLastCalledWith('t2');
  });
});
