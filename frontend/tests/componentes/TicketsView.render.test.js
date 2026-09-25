// @vitest-environment happy-dom
//
// TicketsView.vue — Fase 1 (listado principal) de la migración de Tickets a
// AppTable/AppColumn/AppButton, con la extensión de selección múltiple de
// AppTable (2026-09-08). Mismo patrón de test que Licencias/Equipos: mockea
// solo api/insforge.js, Pinia y router son reales.
//
// Rediseño 2026-09-23: la barra de acciones masivas se localiza por su rol
// (role="toolbar"), no por la clase provisional `.barra-seleccion` que ya no
// existe — mismo comportamiento verificado, selector semántico.
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
    // Línea base de montaje es 1 (ver el test anterior) + 1 por el click.
    expect(insforgeApi.listTicketsPage).toHaveBeenCalledTimes(2);
    const ultimaLlamada = insforgeApi.listTicketsPage.mock.calls.at(-1);
    expect(ultimaLlamada[0].orden).toEqual({ columna: 'codigo', direccion: 'asc' });
  });

  it('marcar el checkbox de una fila actualiza el modelo reactivo y habilita la barra de acciones masivas', async () => {
    const w = await montar();
    expect(w.find('[role="toolbar"]').exists()).toBe(false);

    const checkboxesFila = w.findAll('input[type="checkbox"]');
    // El primero es "seleccionar todos" (header); el resto son por fila.
    expect(checkboxesFila.length).toBeGreaterThanOrEqual(3);
    await checkboxesFila[1].setValue(true); // fila de TCK-0001

    const barra = w.find('[role="toolbar"]');
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
    const barra = w.find('[role="toolbar"]');
    expect(barra.text()).toContain('2 seleccionados');
  });

  it('destildar la única fila seleccionada oculta la barra de nuevo', async () => {
    const w = await montar();
    const checkboxesFila = w.findAll('input[type="checkbox"]');
    await checkboxesFila[1].setValue(true);
    expect(w.find('[role="toolbar"]').exists()).toBe(true);
    await checkboxesFila[1].setValue(false);
    expect(w.find('[role="toolbar"]').exists()).toBe(false);
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
        stubs: { TicketDetallePanel: true, TicketInternoForm: true, ReporteTicketsModal: true, ConfirmDialog: true },
      },
    });
    await flushPromises();
    return { w, router };
  }

  const vistas = (w) => w.find('[role="group"][aria-label="Vista de tickets"]');

  beforeEach(() => {
    insforgeApi.listCategoriasTicket.mockResolvedValue([{ id: 'red', nombre: 'Red y Conectividad' }]);
  });

  it('muestra las 5 vistas fijas y arranca en "Nuevos": vigentes sin técnico', async () => {
    const { w } = await montarEn('/tickets');
    const botones = vistas(w).findAll('button');
    expect(botones.map((b) => b.text().replace(/\d+/g, '').trim()))
      .toEqual(['Nuevos', 'Mis tickets', 'Pendientes', 'Resueltos', 'Todos']);
    expect(botones[0].attributes('aria-pressed')).toBe('true');
    expect(insforgeApi.listTicketsPage.mock.calls.at(-1)[0]).toMatchObject({
      estados: ['abierto', 'en_progreso', 'reabierto'],
      asignados: ['sin_asignar'],
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
    expect(insforgeApi.listTicketsPage.mock.calls.at(-1)[0]).toMatchObject({ estados: ['resuelto'], asignados: [] });
    expect(router.currentRoute.value.query.vista).toBe('resueltos');
  });

  it('pide un conteo por vista (+ el atajo "sin vincular")', async () => {
    await montarEn('/tickets');
    expect(insforgeApi.contarTickets).toHaveBeenCalledTimes(6);
  });

  it('el enlace del Dashboard (?vista=todos&categoria=) filtra desde la primera carga y muestra el chip', async () => {
    const { w } = await montarEn('/tickets?vista=todos&categoria=red');
    const llamadas = insforgeApi.listTicketsPage.mock.calls.map((c) => c[0]);
    expect(llamadas.every((f) => f.categoriaIds.includes('red'))).toBe(true);
    expect(llamadas.at(-1)).toMatchObject({ estados: [], asignados: [] });
    expect(w.find('button[aria-label^="Filtro Categoría"]').text()).toContain('Red y Conectividad');
    expect(insforgeApi.contarTickets.mock.calls.every((c) => c[0].categoriaIds.includes('red'))).toBe(true);
  });

  it('quitar el chip limpia el filtro y saca el parámetro de la URL', async () => {
    const { w, router } = await montarEn('/tickets?vista=todos&categoria=red');
    await w.find('button[aria-label="Quitar filtro Categoría"]').trigger('click');
    await flushPromises();
    expect(insforgeApi.listTicketsPage.mock.calls.at(-1)[0].categoriaIds).toEqual([]);
    expect(router.currentRoute.value.query.categoria).toBeUndefined();
  });

  it('una vista que fija el responsable poda el chip "Asignado a" (nunca una combinación imposible)', async () => {
    const { w, router } = await montarEn('/tickets?vista=mios&asignado=staff-1');
    await flushPromises();
    expect(w.find('button[aria-label^="Filtro Asignado a"]').exists()).toBe(false);
    expect(router.currentRoute.value.query.asignado).toBeUndefined();
  });

  it('recuerda la última combinación al volver al listado sin filtros en la URL', async () => {
    const primera = await montarEn('/tickets?vista=resueltos&prioridad=alta');
    primera.w.unmount();
    insforgeApi.listTicketsPage.mockClear();
    const { router } = await montarEn('/tickets');
    expect(router.currentRoute.value.query).toMatchObject({ vista: 'resueltos', prioridad: 'alta' });
    expect(insforgeApi.listTicketsPage.mock.calls.at(-1)[0]).toMatchObject({ estados: ['resuelto'], prioridades: ['alta'] });
  });
});
