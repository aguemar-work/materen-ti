// @vitest-environment happy-dom
//
// TicketDetallePanel.vue — Fase 2, la otra mitad de useTicketDetalleLogica.js
// (split-view). A diferencia de TicketDetalleView.vue (ya cubierto), acá se
// verifica lo que es distinto de este archivo específicamente: el toggle KB
// (variant/severity de AppButton reusados para expresar "activo", sin una
// prop `pressed` nueva) y que Rechazar/Reabrir usan ConfirmDialog (no el
// formulario inline de la página completa) — ambos caminos deben seguir
// disparando la misma transición en el backend.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import TicketDetallePanel from '../../src/modules/tickets/TicketDetallePanel.vue';
import { useAuthStore } from '../../src/stores/auth.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    getTicket: vi.fn(),
    listComentariosTicket: vi.fn().mockResolvedValue([]),
    nombresStaff: vi.fn().mockResolvedValue([]),
    listEventosTicket: vi.fn().mockResolvedValue([]),
    getSatisfaccionTicket: vi.fn().mockResolvedValue(null),
    equiposPorEmpleado: vi.fn().mockResolvedValue([]),
    listArticulosRelacionados: vi.fn().mockResolvedValue([]),
    getProblemaAbiertoDeTicket: vi.fn().mockResolvedValue(null),
    actualizarTicket: vi.fn().mockResolvedValue(undefined),
    cerrarTicket: vi.fn(),
    crearComentarioTicket: vi.fn().mockResolvedValue(undefined),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

function ticketBase(overrides = {}) {
  return {
    id: 'tck-1',
    codigo: 'TCK-0001',
    titulo: 'No enciende el monitor',
    descripcion: 'desc',
    categoria_nombre: 'Hardware',
    subcategoria_nombre: null,
    categoria_id: null,
    estado: 'en_progreso',
    prioridad: 'media',
    nivel_atencion: null,
    asignado_a: 'staff-1',
    tipo: 'incidente',
    vinculado: true,
    empleado_id: 'emp-1',
    empleado_nombre: 'Juan Pérez',
    empleado_dni: '12345678',
    empleado_correo: null,
    contacto_ingresado: null,
    equipo_desc: null,
    cuenta_desc: null,
    licencia_desc: null,
    adjunto_url: null,
    token: 'tok-abc',
    ...overrides,
  };
}

function crearRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tickets', name: 'tickets', component: { template: '<div />' } },
      { path: '/empleados/:id', name: 'empleado-detalle', component: { template: '<div />' } },
      { path: '/problemas/:id', name: 'problema-detalle', component: { template: '<div />' } },
    ],
  });
}

function flushPromises() {
  return new Promise((r) => setTimeout(r, 0));
}

async function montar(ticketId = 'tck-1', { rol = 'ASISTENTE' } = {}) {
  const router = crearRouter();
  router.push('/tickets'); // sin esto, isReady() nunca resuelve (no hay navegación inicial)
  await router.isReady();
  const auth = useAuthStore();
  auth.$patch({ user: { id: 'staff-1' }, rol });
  const w = mount(TicketDetallePanel, {
    props: { ticketId },
    global: {
      plugins: [router, [PrimeVue, { unstyled: true }]],
      stubs: { ProblemaForm: true },
    },
  });
  await flushPromises();
  return w;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.getTicket.mockResolvedValue(ticketBase());
});

describe('TicketDetallePanel.vue — botones migrados a AppButton (Fase 2)', () => {
  // Rediseño 2026-09-23: el estado activo pasa de "sólido primario" a
  // "outline primario" (un solo sólido por pantalla: el de "Marcar
  // resuelto"). Mismo comportamiento verificado — el toggle se distingue
  // visualmente al activarse y aria-pressed lo acompaña — con las clases
  // del estado nuevo.
  it('toggle KB: arranca neutro y pasa a acento primario al activarse — sin romper aria-pressed', async () => {
    const w = await montar();
    const kb = w.findAll('button').find((b) => b.text() === 'KB');
    expect(kb.attributes('aria-pressed')).toBe('false');
    expect(kb.classes().join(' ')).not.toContain('text-primary-600');

    await kb.trigger('click');
    const kbActivo = w.findAll('button').find((b) => b.text() === 'KB');
    expect(kbActivo.attributes('aria-pressed')).toBe('true');
    expect(kbActivo.classes().join(' ')).toContain('text-primary-600');
    expect(kbActivo.classes().join(' ')).toContain('border-primary-300');
  });

  it('"Marcar resuelto" -> ConfirmDialog -> guarda en KB si el toggle estaba activo', async () => {
    insforgeApi.cerrarTicket.mockResolvedValue(ticketBase({ estado: 'cerrado' }));
    const w = await montar();

    await w.findAll('button').find((b) => b.text() === 'KB').trigger('click'); // activa guardarComoKb
    await w.findAll('button').find((b) => b.text().includes('Marcar resuelto')).trigger('click');
    await flushPromises();

    const confirmar = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Marcar como resuelto');
    confirmar.click();
    await flushPromises();

    expect(insforgeApi.cerrarTicket).toHaveBeenCalledWith('tck-1');
  });

  it('estado "abierto": Rechazar vía ConfirmDialog con motivo llama a actualizarTicket(rechazado)', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'abierto', asignado_a: null }));
    const w = await montar();

    await w.findAll('button').find((b) => b.text().includes('Rechazar')).trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Rechazar ticket');

    const textarea = document.querySelector('textarea');
    textarea.value = 'Duplicado de otro ticket';
    textarea.dispatchEvent(new Event('input'));
    await flushPromises();

    const confirmar = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes('Confirmar rechazo'));
    confirmar.click();
    await flushPromises();

    expect(insforgeApi.crearComentarioTicket).toHaveBeenCalledWith('tck-1', 'Duplicado de otro ticket', false);
    expect(insforgeApi.actualizarTicket).toHaveBeenCalledWith('tck-1', { estado: 'rechazado' });
  });

  it('"Problema" (sin problema vinculado) es un AppButton; con problema vinculado es un RouterLink, no un botón', async () => {
    const w = await montar();
    expect(w.findAll('button').find((b) => b.text().includes('Problema'))).toBeTruthy();

    insforgeApi.getProblemaAbiertoDeTicket.mockResolvedValue({ id: 'prob-1', titulo: 'Falla recurrente', estado: 'abierto' });
    const w2 = await montar();
    expect(w2.findAll('button').find((b) => b.text().includes('Problema'))).toBeFalsy();
    // Selector por contenido/destino en vez de la clase `.tdp-btn-problema-activo`
    // (retirada en el rediseño 2026-09-23): sigue siendo un enlace al problema.
    const enlace = w2.findAll('a').find((a) => a.text().includes('Problema'));
    expect(enlace).toBeTruthy();
    expect(enlace.attributes('href')).toBe('/problemas/prob-1');
  });
});
