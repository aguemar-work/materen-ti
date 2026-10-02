// @vitest-environment happy-dom
//
// AppLayout.vue — el contador de tickets sin asignar del menú sale del MISMO
// store que el Inicio (RPC `dashboard_resumen`): una sola llamada para los dos,
// ya no un `pendientesTickets()` aparte. Se actualiza con el realtime de
// `tickets:list` (con el mismo debounce de siempre) y al volver a la pestaña.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { h } from 'vue';
import { resumenVacio, ticket } from '../stubs/resumen-inicio.js';

const rt = vi.hoisted(() => {
  const manejadores = new Map();
  return {
    manejadores,
    realtime: {
      isConnected: true,
      connect: () => Promise.resolve(),
      disconnect: () => {},
      subscribe: () => Promise.resolve({ ok: true }),
      unsubscribe: () => {},
      on: (ev, fn) => { manejadores.set(ev, [...(manejadores.get(ev) || []), fn]); },
      off: (ev, fn) => { manejadores.set(ev, (manejadores.get(ev) || []).filter((f) => f !== fn)); },
    },
    rpc: vi.fn(),
    from: vi.fn(() => { throw new Error('el menú no debe consultar tablas'); }),
    cargarTickets: vi.fn(() => Promise.resolve()),
  };
});
vi.mock('../../src/api/client.js', () => ({
  getClient: () => ({ database: { rpc: rt.rpc, from: rt.from }, realtime: rt.realtime }),
}));
vi.mock('../../src/stores/tickets.js', () => ({ useTicketsStore: () => ({ cargar: rt.cargarTickets }) }));

import AppLayout from '../../src/components/shared/AppLayout.vue';
import { useAuthStore } from '../../src/stores/auth.js';

const conSinAsignar = (n) => resumenVacio({
  tickets: { ...resumenVacio().tickets, sin_asignar: Array.from({ length: n }, (_, i) => ticket({ ticket_id: `t${i}`, codigo: `TCK-${i}` })) },
});
const responde = (data) => rt.rpc.mockResolvedValue({ data, error: null });
const asentar = () => new Promise((r) => setTimeout(r, 0));
const esperarDebounce = () => new Promise((r) => setTimeout(r, 650));

// AppNav sustituido por un stub que muestra la prop que recibe.
const AppNavStub = { name: 'AppNav', props: ['ticketsSinAsignar', 'navEnRiel'], render() { return h('i', { 'data-badge': this.ticketsSinAsignar }); } };

const montados = [];
async function montar() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] });
  router.push('/dashboard');
  await router.isReady();
  const w = mount(AppLayout, {
    global: {
      plugins: [router],
      stubs: {
        AppNav: AppNavStub, AppSearch: true, NotificacionesCampana: true, AppNotifications: true,
        MenuAcciones: true, AppAvatar: true, StaffNombreForm: true,
      },
    },
  });
  montados.push(w);
  await asentar();
  return w;
}
const badge = (w) => w.find('[data-badge]').attributes('data-badge');
const emitirTicketsList = (payload = { op: 'UPDATE' }) => {
  for (const fn of rt.manejadores.get('changed') || []) fn({ meta: { channel: 'tickets:list' }, ...payload });
};

beforeEach(() => {
  setActivePinia(createPinia());
  rt.manejadores.clear();
  rt.rpc.mockReset();
  rt.from.mockClear();
  rt.cargarTickets.mockClear();
  const auth = useAuthStore();
  auth.user = { id: 'u-1' };
  auth.rol = 'JEFE';
  auth.nombre = 'Alejandro Guevara';
});
afterEach(() => {
  // Desmontar quita los listeners de `document`: si no, se acumulan entre pruebas.
  while (montados.length) montados.pop().unmount();
  vi.restoreAllMocks();
});

describe('AppLayout — contador de tickets del menú', () => {
  it('sale del resumen del Inicio con UNA llamada y ninguna consulta a tablas', async () => {
    responde(conSinAsignar(3));
    const w = await montar();
    expect(badge(w)).toBe('3');
    expect(rt.rpc).toHaveBeenCalledTimes(1);
    expect(rt.rpc).toHaveBeenCalledWith('dashboard_resumen');
    expect(rt.from).not.toHaveBeenCalled();
  });

  it('sin módulo tickets (sección null) el contador es 0', async () => {
    responde(resumenVacio({ tickets: null }));
    const w = await montar();
    expect(badge(w)).toBe('0');
  });

  it('un evento realtime de tickets:list lo actualiza (y refresca la lista de tickets)', async () => {
    responde(conSinAsignar(3));
    const w = await montar();
    responde(conSinAsignar(2));
    emitirTicketsList({ op: 'UPDATE' });
    await asentar();
    expect(badge(w)).toBe('2');
    expect(rt.cargarTickets).toHaveBeenCalled();
    expect(rt.rpc).toHaveBeenCalledTimes(2);
  });

  it('una ráfaga de eventos se coalesce: no una llamada por evento', async () => {
    responde(conSinAsignar(3));
    await montar();
    rt.rpc.mockClear();
    for (let i = 0; i < 6; i += 1) emitirTicketsList({ op: 'UPDATE' });
    await esperarDebounce();
    await asentar();
    // Una inmediata y, como mucho, una de alcance: nunca seis.
    expect(rt.rpc.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('al volver a la pestaña se recarga el resumen una vez', async () => {
    responde(conSinAsignar(3));
    const w = await montar();
    responde(conSinAsignar(1));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await asentar();
    expect(badge(w)).toBe('1');
    expect(rt.rpc).toHaveBeenCalledTimes(2);
  });

  it('con la pestaña oculta no recarga', async () => {
    responde(conSinAsignar(3));
    await montar();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await asentar();
    expect(rt.rpc).toHaveBeenCalledTimes(1);
  });

  it('si la RPC falla se conserva el último valor conocido', async () => {
    responde(conSinAsignar(3));
    const w = await montar();
    rt.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } });
    emitirTicketsList();
    await asentar();
    expect(badge(w)).toBe('3');
  });
});
