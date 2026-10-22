// @vitest-environment happy-dom
//
// TicketsView.vue — Fase 1 (listado principal) de la migración de Tickets a
// AppTable/AppColumn/AppButton. Mismo patrón de test que Licencias/Equipos:
// mockea solo api/insforge.js, Pinia y router son reales. La selección
// múltiple y las acciones en lote se retiraron el 2026-10-21.
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
    listCategoriasTicket: vi.fn().mockResolvedValue([]),
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
      stubs: { TicketDetallePanel: true, TicketInternoForm: true, ConfirmDialog: true },
    },
  });
  await flushPromises();
  return w;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  insforgeApi.listTicketsPage.mockResolvedValue({ items: TICKETS_FIXTURE, total: 2 });
  insforgeApi.contarTickets.mockResolvedValue(0);
  insforgeApi.nombresStaff.mockResolvedValue([{ user_id: 'staff-1', nombre: 'Sofía Medina' }]);
});

describe('TicketsView.vue — listado migrado a AppTable/AppColumn/AppButton (Fase 1)', () => {
  it('carga la página inicial vía el store real y pinta las filas', async () => {
    const w = await montar();
    // Una sola carga al montar: los filtros V2 salen de la URL y se aplican
    // una vez en onMounted (antes eran 2: watcher immediate + onMounted).
    expect(insforgeApi.listTicketsPage).toHaveBeenCalledTimes(1);
    expect(w.text()).toContain('TCK-0001');
    expect(w.text()).toContain('TCK-0002');
    expect(w.text()).toContain('No enciende el monitor');
  });

  it('las 6 columnas declaradas se renderizan como <th> (sin columna de selección)', async () => {
    const w = await montar();
    const headers = w.findAll('th');
    expect(headers.length).toBe(6);
    const labels = headers.map((th) => th.text());
    expect(labels).toEqual(['Prioridad', 'Estado', 'Ticket', 'Solicitante', 'Responsable', 'Fecha']);
  });

  it('clic en el header ordenable "Ticket" llama a store.ordenarPor vía @ordenar', async () => {
    const w = await montar();
    const th = w.findAll('th').find((t) => t.text() === 'Ticket');
    await th.trigger('click');
    await flushPromises();
    // Línea base de montaje es 1 (ver el test anterior) + 1 por el click.
    expect(insforgeApi.listTicketsPage).toHaveBeenCalledTimes(2);
    const ultimaLlamada = insforgeApi.listTicketsPage.mock.calls.at(-1);
    expect(ultimaLlamada[0].orden).toEqual({ columna: 'codigo', direccion: 'asc' });
  });

  // 2026-10-21 (pedido del dueño): sin selección múltiple ni acciones en lote.
  // Reasignar y cerrar se hacen desde la ficha de cada ticket.
  it('la tabla no tiene casillas de selección ni barra de acciones en lote', async () => {
    const w = await montar();
    expect(w.findAll('input[type="checkbox"]')).toHaveLength(0);
    expect(w.find('[role="toolbar"]').exists()).toBe(false);
    expect(w.text()).not.toContain('Cerrar seleccionados');
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
        stubs: { TicketDetallePanel: true, TicketInternoForm: true, ConfirmDialog: true },
      },
    });
    await Promise.resolve();
    expect(w.find('table').exists()).toBe(true);
    resolver({ items: TICKETS_FIXTURE, total: 2 });
    await flushPromises();
    expect(w.text()).toContain('TCK-0001');
  });
});

// Filtros V2 (2026-09-25): una fila fija de vistas con conteo + chips bajo
// demanda + URL como fuente de verdad. Reemplaza las 4 bandejas con
// sub-segmentado de estado y select de técnico que aparecían y
// desaparecían según la bandeja (el reclamo del dueño).
describe('TicketsView.vue — filtros V2 (vistas + chips + URL)', () => {
  async function montarEn(url) {
    localStorage.setItem('sistema-ti-vista-tickets', 'tabla');
    const router = crearRouter();
    router.push(url);
    await router.isReady();
    const w = mount(TicketsView, {
      global: {
        plugins: [router, [PrimeVue, { unstyled: true }]],
        stubs: { TicketDetallePanel: true, TicketInternoForm: true, ConfirmDialog: true },
      },
    });
    await flushPromises();
    return { w, router };
  }

  const vistas = (w) => w.find('[role="group"][aria-label="Vista de tickets"]');

  beforeEach(() => {
    insforgeApi.listCategoriasTicket.mockResolvedValue([{ id: 'red', nombre: 'Red y Conectividad' }]);
  });

  it('las vistas son un solo criterio (estado), "Todos" primero, y arranca en "Pendientes"', async () => {
    const { w } = await montarEn('/tickets');
    const botones = vistas(w).findAll('button');
    expect(botones.map((b) => b.text().replace(/\d+/g, '').trim()))
      .toEqual(['Todos', 'Pendientes', 'Resueltos', 'Rechazados']);
    expect(botones[1].attributes('aria-pressed')).toBe('true');
    expect(insforgeApi.listTicketsPage.mock.calls.at(-1)[0]).toMatchObject({
      estados: ['abierto', 'en_progreso', 'reabierto'],
      asignados: [],
    });
  });

  it('no quedan los controles anidados del modelo anterior', async () => {
    const { w } = await montarEn('/tickets?vista=pendientes');
    expect(w.text()).not.toContain('Filtrar por técnico');
    expect(w.find('[aria-label="Filtrar por estado"]').exists()).toBe(false);
    expect(w.find('[aria-label="Bandeja de tickets"]').exists()).toBe(false);
  });

  it('cambiar de vista recarga con su alcance y lo deja en la URL', async () => {
    const { w, router } = await montarEn('/tickets');
    const resueltos = vistas(w).findAll('button').find((b) => b.text().includes('Resueltos'));
    await resueltos.trigger('click');
    await flushPromises();
    // 120: «Resueltos» son los resueltos por calificar y los cerrados.
    expect(insforgeApi.listTicketsPage.mock.calls.at(-1)[0]).toMatchObject({ estados: ['resuelto', 'cerrado'], asignados: [] });
    expect(router.currentRoute.value.query.vista).toBe('resueltos');
  });

  it('pide un conteo por vista (+ los atajos "sin asignar" y "sin vincular")', async () => {
    await montarEn('/tickets');
    expect(insforgeApi.contarTickets).toHaveBeenCalledTimes(6);
  });

  it('el enlace del Dashboard (?vista=todos&categoria=) filtra desde la primera carga y muestra el chip', async () => {
    const { w } = await montarEn('/tickets?vista=todos&categoria=red');
    const llamadas = insforgeApi.listTicketsPage.mock.calls.map((c) => c[0]);
    expect(llamadas.every((f) => f.categoriaIds.includes('red'))).toBe(true);
    expect(llamadas.at(-1)).toMatchObject({ estados: [], asignados: [] });
    // El botón "Filtros" dice qué hay puesto (2026-10-21: un solo menú).
    expect(w.find('button[aria-haspopup="dialog"]').attributes('aria-label')).toContain('Categoría Red y Conectividad');
    expect(insforgeApi.contarTickets.mock.calls.every((c) => c[0].categoriaIds.includes('red'))).toBe(true);
  });

  it('quitar el chip limpia el filtro y saca el parámetro de la URL', async () => {
    const { w, router } = await montarEn('/tickets?vista=todos&categoria=red');
    await w.find('button[aria-haspopup="dialog"]').trigger('click');
    await flushPromises();
    document.body.querySelector('[aria-label="Quitar filtro Categoría"]').click();
    await flushPromises();
    expect(insforgeApi.listTicketsPage.mock.calls.at(-1)[0].categoriaIds).toEqual([]);
    expect(router.currentRoute.value.query.categoria).toBeUndefined();
  });

  it('un enlace viejo (?vista=mios) se traduce a Pendientes + chip "Asignado a: Usted"', async () => {
    const { w, router } = await montarEn('/tickets?vista=mios');
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ asignado: 'yo' });
    expect(router.currentRoute.value.query.vista).toBeUndefined(); // pendientes = por defecto
    expect(w.find('button[aria-haspopup="dialog"]').attributes('aria-label')).toContain('Asignado a Usted');
  });

  it('la cola de Triage no tiene casillas ni "Seleccionar todos"', async () => {
    localStorage.setItem('sistema-ti-vista-tickets', 'triage');
    const router = crearRouter();
    router.push('/tickets');
    await router.isReady();
    const w = mount(TicketsView, {
      global: {
        plugins: [router, [PrimeVue, { unstyled: true }]],
        stubs: { TicketDetallePanel: true, TicketInternoForm: true },
      },
    });
    await flushPromises();
    expect(w.find('section[aria-label="Cola de tickets"]').exists()).toBe(true);
    expect(w.findAll('section[aria-label="Cola de tickets"] input[type="checkbox"]')).toHaveLength(0);
    expect(w.text()).not.toContain('Seleccionar todos');
  });

  it('recuerda la última combinación al volver al listado sin filtros en la URL', async () => {
    const primera = await montarEn('/tickets?vista=resueltos&prioridad=alta');
    primera.w.unmount();
    insforgeApi.listTicketsPage.mockClear();
    const { router } = await montarEn('/tickets');
    expect(router.currentRoute.value.query).toMatchObject({ vista: 'resueltos', prioridad: 'alta' });
    expect(insforgeApi.listTicketsPage.mock.calls.at(-1)[0]).toMatchObject({ estados: ['resuelto', 'cerrado'], prioridades: ['alta'] });
  });
});

// Tabla V2 (2026-09-25): Ticket = solo número + título; "Fecha" reemplaza a
// "Edad" (Recibido / Resuelto según el estado); prioridad siempre con fondo.
describe('TicketsView.vue — columnas de la tabla', () => {
  it('la celda Ticket no repite categoría ni nivel, y Fecha dice Recibido o Resuelto', async () => {
    insforgeApi.listTicketsPage.mockResolvedValue({
      items: [
        TICKETS_FIXTURE[1],
        { ...TICKETS_FIXTURE[0], id: 'tck-3', codigo: 'TCK-0003', estado: 'cerrado', resuelto_at: '2026-09-05T15:00:00.000Z' },
      ],
      total: 2,
    });
    const w = await montar();
    const filas = w.findAll('tbody tr');
    const celdas = (fila) => fila.findAll('td').map((td) => td.text());
    // [prioridad, estado, ticket, solicitante, responsable, fecha]
    expect(celdas(filas[0])[2]).toContain('TCK-0002');
    expect(celdas(filas[0])[2]).not.toContain('Accesos');
    expect(celdas(filas[0])[5]).toContain('Recibido');
    expect(celdas(filas[1])[5]).toContain('Resuelto');
    expect(celdas(filas[1])[5]).toContain('05/09');
  });
});
