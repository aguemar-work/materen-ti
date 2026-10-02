// @vitest-environment happy-dom
//
// Captura adjunta del ticket en el bucket PRIVADO (migración 111), lado STAFF:
// TicketSolicitante.vue ya no recibe una URL pública (`adjunto_url`), solo
// `tiene_adjunto`; la URL firmada (300 s) se pide a la edge function `tickets`
// (acción adjuntoStaff) al montar la miniatura y, para abrir la captura, SIEMPRE
// al hacer clic (una URL guardada vence). Y el portal público de seguimiento
// (TicketSeguimientoView.vue) vuelve a pedir una URL fresca al hacer clic.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import TicketSolicitante from '../../src/modules/tickets/TicketSolicitante.vue';
import TicketSeguimientoView from '../../src/modules/tickets/TicketSeguimientoView.vue';

vi.mock('../../src/api/ticketsPublicos.js', () => ({
  urlAdjuntoTicket: vi.fn(),
  seguimientoTicket: vi.fn(),
  buscarTicketsPorDni: vi.fn(),
  responderEncuesta: vi.fn(),
  encuestaYaRespondida: vi.fn().mockResolvedValue(false),
  MENSAJES_ERROR_TICKETS: {},
}));
vi.mock('../../src/composables/useRealtimeRefresco.js', () => ({ useRealtimeRefresco: vi.fn() }));
import { urlAdjuntoTicket, seguimientoTicket } from '../../src/api/ticketsPublicos.js';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const ticketBase = (extra = {}) => ({
  id: 'tck-1',
  vinculado: true,
  empleado_id: 'emp-1',
  empleado_nombre: 'Juan Pérez',
  empleado_dni: '12345678',
  empleado_correo: null,
  contacto_ingresado: null,
  equipo_desc: '',
  cuenta_desc: '',
  licencia_desc: '',
  tiene_adjunto: true,
  ...extra,
});

function router() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/empleados/:id', component: { template: '<div />' } },
      { path: '/soporte/:token', component: { template: '<div />' } },
      { path: '/soporte', component: { template: '<div />' } },
      { path: '/ticket-buscar', name: 'ticket-buscar', component: { template: '<div />' } },
    ],
  });
}

async function montarSolicitante(props) {
  const r = router();
  r.push('/soporte');
  await r.isReady();
  const w = mount(TicketSolicitante, { props, global: { plugins: [r, [PrimeVue, { unstyled: true }]] } });
  await flushPromises();
  return w;
}

// window.open falso: devuelve una "ventana" con location.href escribible.
let ventana;
beforeEach(() => {
  vi.clearAllMocks();
  ventana = { opener: 'x', close: vi.fn(), location: { href: '' } };
  vi.spyOn(window, 'open').mockImplementation(() => ventana);
});
afterEach(() => vi.restoreAllMocks());

describe('TicketSolicitante — chip "Captura adjunta" (sin miniatura)', () => {
  it('sin adjunto: no hay botón ni se pide ninguna URL', async () => {
    const w = await montarSolicitante({ ticket: ticketBase({ tiene_adjunto: false }) });
    expect(w.find('[data-captura="abrir"]').exists()).toBe(false);
    expect(urlAdjuntoTicket).not.toHaveBeenCalled();
  });

  it('con adjunto: NO pide URL al montar; al hacer clic abre una pestaña y la redirige a la URL firmada fresca', async () => {
    urlAdjuntoTicket.mockResolvedValue({ url: 'https://almacen.test/firmada?f=1', expiraSegundos: 300 });
    const w = await montarSolicitante({ ticket: ticketBase() });
    expect(urlAdjuntoTicket).not.toHaveBeenCalled();
    const boton = w.find('[data-captura="abrir"]');
    expect(boton.exists()).toBe(true);
    expect(boton.element.tagName).toBe('BUTTON'); // ya no es un <a href> con una URL que vence
    expect(boton.text()).toContain('Captura adjunta');

    await boton.trigger('click');
    await flushPromises();
    expect(window.open).toHaveBeenCalledWith('', '_blank'); // en el clic, antes del await
    expect(ventana.opener).toBeNull(); // la pestaña nueva no controla a esta
    expect(urlAdjuntoTicket).toHaveBeenCalledWith('tck-1');
    expect(ventana.location.href).toBe('https://almacen.test/firmada?f=1');
    expect(w.find('[data-captura="error"]').exists()).toBe(false);
  });

  it('si la URL no se puede obtener: cierra la pestaña y avisa sin mostrar el texto técnico', async () => {
    urlAdjuntoTicket.mockRejectedValue(new Error('Request failed: 500 Internal Server Error'));
    const w = await montarSolicitante({ ticket: ticketBase() });
    await w.find('[data-captura="abrir"]').trigger('click');
    await flushPromises();
    expect(ventana.close).toHaveBeenCalled();
    const aviso = w.find('[data-captura="error"]');
    expect(aviso.text()).toBe('No se pudo abrir la captura. Intente de nuevo.');
    expect(w.text()).not.toContain('Request failed');
  });
});

describe('TicketSolicitante — miniatura (página completa)', () => {
  it('pide la URL firmada al montar y muestra la imagen con su alt; al hacer clic abre una URL FRESCA', async () => {
    urlAdjuntoTicket
      .mockResolvedValueOnce({ url: 'https://almacen.test/firmada?f=miniatura', expiraSegundos: 300 })
      .mockResolvedValueOnce({ url: 'https://almacen.test/firmada?f=fresca', expiraSegundos: 300 });
    const w = await montarSolicitante({ ticket: ticketBase(), miniatura: true });
    expect(urlAdjuntoTicket).toHaveBeenCalledTimes(1);
    const img = w.find('img');
    expect(img.attributes('src')).toBe('https://almacen.test/firmada?f=miniatura');
    expect(img.attributes('alt')).toBe('Captura adjunta al ticket');

    await w.find('[data-captura="abrir"]').trigger('click');
    await flushPromises();
    expect(urlAdjuntoTicket).toHaveBeenCalledTimes(2);
    expect(ventana.location.href).toBe('https://almacen.test/firmada?f=fresca');
  });

  it('si la miniatura no carga: sin <img> rota, con aviso', async () => {
    urlAdjuntoTicket.mockRejectedValue(new Error('boom'));
    const w = await montarSolicitante({ ticket: ticketBase(), miniatura: true });
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('[data-captura="error"]').text()).toBe('No se pudo cargar la captura.');
  });

  it('al cambiar de ticket descarta la respuesta tardía del anterior', async () => {
    let resolverPrimera;
    urlAdjuntoTicket
      .mockImplementationOnce(() => new Promise((res) => { resolverPrimera = res; }))
      .mockResolvedValueOnce({ url: 'https://almacen.test/firmada?f=segundo', expiraSegundos: 300 });
    const w = await montarSolicitante({ ticket: ticketBase({ id: 'tck-1' }), miniatura: true });
    await w.setProps({ ticket: ticketBase({ id: 'tck-2' }) });
    await flushPromises();
    resolverPrimera({ url: 'https://almacen.test/firmada?f=primero', expiraSegundos: 300 });
    await flushPromises();
    expect(urlAdjuntoTicket).toHaveBeenNthCalledWith(2, 'tck-2');
    expect(w.find('img').attributes('src')).toBe('https://almacen.test/firmada?f=segundo');
  });

  it('sin adjunto en modo miniatura: ni petición ni imagen', async () => {
    const w = await montarSolicitante({ ticket: ticketBase({ tiene_adjunto: false }), miniatura: true });
    expect(urlAdjuntoTicket).not.toHaveBeenCalled();
    expect(w.find('img').exists()).toBe(false);
  });
});

describe('TicketSeguimientoView (público) — "Ver captura adjunta"', () => {
  const seguimiento = (extra = {}) => ({
    codigo: 'TCK-0042', titulo: 'Impresora', descripcion: 'No imprime', estado: 'abierto', categoria: 'Equipos', subcategoria: '',
    creado: '2026-10-01T10:00:00Z', actualizado: '2026-10-01T10:00:00Z', comentarios: [],
    adjuntoUrl: 'https://almacen.test/firmada?f=1', adjuntoExpiraSegundos: 300, ...extra,
  });

  async function montar(datos) {
    seguimientoTicket.mockResolvedValue(datos);
    const r = router();
    r.push('/soporte/tok-abc');
    await r.isReady();
    const w = mount(TicketSeguimientoView, { global: { plugins: [r, [PrimeVue, { unstyled: true }]] } });
    await flushPromises();
    return w;
  }

  it('sin captura no hay botón', async () => {
    const w = await montar(seguimiento({ adjuntoUrl: null, adjuntoExpiraSegundos: null }));
    expect(w.find('[data-captura="ver"]').exists()).toBe(false);
  });

  it('con captura: el clic vuelve a consultar el seguimiento y abre la URL firmada FRESCA (la del primer envío puede haber vencido)', async () => {
    const w = await montar(seguimiento());
    const boton = w.find('[data-captura="ver"]');
    expect(boton.exists()).toBe(true);
    expect(boton.text()).toContain('Ver captura adjunta');
    seguimientoTicket.mockResolvedValue(seguimiento({ adjuntoUrl: 'https://almacen.test/firmada?f=fresca' }));
    await boton.trigger('click');
    await flushPromises();
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(seguimientoTicket).toHaveBeenLastCalledWith('tok-abc');
    expect(ventana.location.href).toBe('https://almacen.test/firmada?f=fresca');
  });

  it('si el seguimiento falla al abrir: cierra la pestaña y muestra un aviso en español', async () => {
    const w = await montar(seguimiento());
    seguimientoTicket.mockRejectedValue(new Error('Request failed'));
    await w.find('[data-captura="ver"]').trigger('click');
    await flushPromises();
    expect(ventana.close).toHaveBeenCalled();
    expect(w.text()).toContain('No se pudo abrir la captura. Intente de nuevo.');
  });
});
