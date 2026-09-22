// @vitest-environment happy-dom
//
// TicketsView.vue — Fase 1 (listado principal) de la migración de Tickets a
// AppTable/AppColumn/AppButton, con la extensión de selección múltiple de
// AppTable (2026-09-08). Mismo patrón de test que Licencias/Equipos: mockea
// solo api/insforge.js, Pinia y router son reales.
//
// Fuerza vista='tabla' vía localStorage (useVistaModulo la lee ahí) — el
// modo por defecto de Tickets es 'triage' (split-view, no tabla), y esta
// migración es específicamente sobre la tabla.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import TicketsView from '../../src/modules/tickets/TicketsView.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listTicketsPage: vi.fn(),
    listTicketsFiltrados: vi.fn().mockResolvedValue([]),
    contarTickets: vi.fn().mockResolvedValue(0),
    nombresStaff: vi.fn().mockResolvedValue([]),
    cerrarTicket: vi.fn().mockResolvedValue(undefined),
    actualizarTicket: vi.fn().mockResolvedValue(undefined),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const TICKETS_FIXTURE = [
  {
    id: 'tck-1',
    codigo: 'TCK-0001',
    titulo: 'No enciende el monitor',
    categoria: null,
    nivel_atencion: null,
    prioridad: 'alta',
    solicitante: 'Marta Ibáñez',
    solicitante_id: 'emp-1',
    vinculado: true,
    estado: 'abierto',
    asignado_a: null,
    created_at: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'tck-2',
    codigo: 'TCK-0002',
    titulo: 'Solicitud de acceso a VPN',
    categoria: 'Accesos',
    nivel_atencion: null,
    prioridad: 'media',
    solicitante: 'Carlos Núñez',
    solicitante_id: null,
    vinculado: false,
    estado: 'en_progreso',
    asignado_a: 'staff-1',
    created_at: '2026-09-02T10:00:00.000Z',
  },
];

function crearRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tickets', name: 'tickets', component: { template: '<div />' } },
      { path: '/tickets/:id', name: 'ticket-detalle', component: { template: '<div />' } },
      { path: '/tickets/satisfaccion', name: 'ticket-satisfaccion', component: { template: '<div />' } },
      { path: '/empleados/:id', name: 'empleado-detalle', component: { template: '<div />' } },
    ],
  });
}

function flushPromises() {
  return new Promise((r) => setTimeout(r, 0));
}

async function montar() {
  localStorage.setItem('sistema-ti-vista-tickets', 'tabla');
  const router = crearRouter();
  router.push('/tickets');
  await router.isReady();
  const w = mount(TicketsView, {
    global: {
      plugins: [router, [PrimeVue, { unstyled: true }]],
      stubs: { TicketDetallePanel: true, TicketInternoForm: true, ReporteTicketsModal: true, ConfirmDialog: true },
    },
  });
  await flushPromises();
  return w;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  localStorage.clear();
  insforgeApi.listTicketsPage.mockResolvedValue({ items: TICKETS_FIXTURE, total: 2 });
  insforgeApi.contarTickets.mockResolvedValue(0);
  insforgeApi.nombresStaff.mockResolvedValue([{ user_id: 'staff-1', nombre: 'Sofía Medina' }]);
});

describe('TicketsView.vue — listado migrado a AppTable/AppColumn/AppButton (Fase 1)', () => {
  it('carga la página inicial vía el store real y pinta las filas', async () => {
    const w = await montar();
    // 2, no 1: el watcher de vistaActiva (immediate:true) dispara su propio
    // aplicarFiltros()/cargar() antes de que onMounted haga el suyo — mismo
    // comportamiento que ya tenía la vista, no algo que introdujo esta
    // migración.
    expect(insforgeApi.listTicketsPage).toHaveBeenCalledTimes(2);
    expect(w.text()).toContain('TCK-0001');
    expect(w.text()).toContain('TCK-0002');
    expect(w.text()).toContain('No enciende el monitor');
  });

  it('las 7 columnas (selección + 6 declaradas) se renderizan como <th>', async () => {
    const w = await montar();
    const headers = w.findAll('th');
    expect(headers.length).toBe(7);
    // La 1ra columna es la de selección (sin texto de header); las 6 con
    // label empiezan en la 2da.
    const labels = headers.slice(1).map((th) => th.text());
    expect(labels).toEqual(['Prioridad', 'Ticket', 'Solicitante', 'Estado', 'Asignado a', 'Edad']);
  });

  it('clic en el header ordenable "Ticket" llama a store.ordenarPor vía @ordenar', async () => {
    const w = await montar();
    const th = w.findAll('th').find((t) => t.text() === 'Ticket');
    await th.trigger('click');
    await flushPromises();
    // Línea base de montaje ya es 2 (ver el test anterior) + 1 por el click.
    expect(insforgeApi.listTicketsPage).toHaveBeenCalledTimes(3);
    const [, , ultimaLlamada] = insforgeApi.listTicketsPage.mock.calls;
    expect(ultimaLlamada[0].orden).toEqual({ columna: 'codigo', direccion: 'asc' });
  });

  it('marcar el checkbox de una fila actualiza el modelo reactivo y habilita la barra de acciones masivas', async () => {
    const w = await montar();
    expect(w.find('.barra-seleccion').exists()).toBe(false);

    const checkboxesFila = w.findAll('input[type="checkbox"]');
    // El primero es "seleccionar todos" (header); el resto son por fila.
    expect(checkboxesFila.length).toBeGreaterThanOrEqual(3);
    await checkboxesFila[1].setValue(true); // fila de TCK-0001

    const barra = w.find('.barra-seleccion');
    expect(barra.exists()).toBe(true);
    expect(barra.text()).toContain('1 seleccionado');

    // El puente seleccionParaTabla -> seleccionados (Set<id>) debe reflejar
    // exactamente esa fila — no una copia distinta, no las dos filas.
    const reasignarBtn = w.findAll('button').find((b) => b.text().includes('Reasignar'));
    expect(reasignarBtn).toBeTruthy();
  });

  it('"seleccionar todos" marca las 2 filas de la página', async () => {
    const w = await montar();
    const checkboxes = w.findAll('input[type="checkbox"]');
    await checkboxes[0].setValue(true); // header
    const barra = w.find('.barra-seleccion');
    expect(barra.text()).toContain('2 seleccionados');
  });

  it('destildar la única fila seleccionada oculta la barra de nuevo', async () => {
    const w = await montar();
    const checkboxesFila = w.findAll('input[type="checkbox"]');
    await checkboxesFila[1].setValue(true);
    expect(w.find('.barra-seleccion').exists()).toBe(true);
    await checkboxesFila[1].setValue(false);
    expect(w.find('.barra-seleccion').exists()).toBe(false);
  });

  it('el botón "Ticket interno" del header es el AppButton real (severidad primaria)', async () => {
    const w = await montar();
    const boton = w.findAll('button').find((b) => b.text().includes('Ticket interno'));
    expect(boton).toBeTruthy();
    expect(boton.attributes('class') || '').toContain('bg-primary-500');
  });

  it('loading=true (mientras carga) no rompe el render', async () => {
    let resolver;
    insforgeApi.listTicketsPage.mockReturnValueOnce(new Promise((r) => (resolver = r)));
    localStorage.setItem('sistema-ti-vista-tickets', 'tabla');
    const router = crearRouter();
    router.push('/tickets');
    await router.isReady();
    const w = mount(TicketsView, {
      global: {
        plugins: [router, [PrimeVue, { unstyled: true }]],
        stubs: { TicketDetallePanel: true, TicketInternoForm: true, ReporteTicketsModal: true, ConfirmDialog: true },
      },
    });
    await Promise.resolve();
    expect(w.find('table').exists()).toBe(true);
    resolver({ items: TICKETS_FIXTURE, total: 2 });
    await flushPromises();
    expect(w.text()).toContain('TCK-0001');
  });
});
