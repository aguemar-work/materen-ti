// @vitest-environment happy-dom
//
// Listado de empleados: el menú ⋮ ofrece las acciones del ciclo de vida que el
// servidor acepta para el estado de la fila (migración 102): Suspender solo a
// un Activo; Reactivar a un Suspendido o Inactivo; Dar de baja a quien no está
// dado de baja. La fila entera abre el expediente. Mismo arnés que
// EquiposView.render.test.js: solo api/insforge.js mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import EmpleadosView from '../../src/modules/empleados/EmpleadosView.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listEmpleadosPage: vi.fn(),
    conteosEmpleadosPorEstado: vi.fn(),
    conteosVinculos: vi.fn(),
    listEmpresas: vi.fn(),
    listAreasObras: vi.fn(),
    listUbicaciones: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const fila = (id, nombres, estado) => ({
  id, nombres, apellidos: 'Prueba', dni: `7000000${id.slice(-1)}`, estado, cargo: 'Analista',
  empresa_nombre: 'Materen', whatsapp: '', fecha_alta: '2024-01-10',
});
const EMPLEADOS = [fila('e1', 'Ana', 'Activo'), fila('e2', 'Beto', 'Suspendido'), fila('e3', 'Carla', 'Inactivo')];

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/empleados', component: { template: '<div />' } },
      { path: '/empleados/:id', component: { template: '<div />' } },
    ],
  });
  router.push('/empleados?estado=todos');
  await router.isReady();
  wrapper = mount(EmpleadosView, {
    attachTo: document.body,
    global: {
      plugins: [router, [PrimeVue, { unstyled: true }]],
      stubs: { EmpleadoForm: true, BajaEmpleadoModal: true, EmpleadoMotivoDialog: true },
    },
  });
  for (let i = 0; i < 5; i += 1) await espera();
  return { w: wrapper, router };
}

const itemsDelMenu = () => [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim());
async function abrirMenu(w, nombre) {
  await w.find(`button[aria-label="Acciones de ${nombre} Prueba"]`).trigger('click');
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listEmpleadosPage.mockResolvedValue({ items: EMPLEADOS, total: 3 });
  insforgeApi.conteosEmpleadosPorEstado.mockResolvedValue({ Activo: 1, Suspendido: 1, Inactivo: 1, todos: 3 });
  insforgeApi.conteosVinculos.mockResolvedValue({});
  insforgeApi.listEmpresas.mockResolvedValue([]);
  insforgeApi.listAreasObras.mockResolvedValue([]);
  insforgeApi.listUbicaciones.mockResolvedValue([]);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('EmpleadosView — acciones del ⋮ por estado', () => {
  it('un Activo ofrece Suspender y Dar de baja (no Reactivar)', async () => {
    const { w } = await montar();
    await abrirMenu(w, 'Ana');
    expect(itemsDelMenu()).toEqual(['Ver ficha', 'Editar', 'Enviar credenciales por WhatsApp', 'Suspender', 'Dar de baja']);
  });

  it('un Suspendido ofrece Reactivar y Dar de baja (no Suspender)', async () => {
    const { w } = await montar();
    await abrirMenu(w, 'Beto');
    const items = itemsDelMenu();
    expect(items).toContain('Reactivar');
    expect(items).toContain('Dar de baja');
    expect(items).not.toContain('Suspender');
  });

  it('un Inactivo ofrece Reactivar y ya no Dar de baja ni Suspender', async () => {
    const { w } = await montar();
    await abrirMenu(w, 'Carla');
    const items = itemsDelMenu();
    expect(items).toContain('Reactivar');
    expect(items).not.toContain('Dar de baja');
    expect(items).not.toContain('Suspender');
  });

  it('Suspender abre el diálogo de motivo para esa fila', async () => {
    const { w } = await montar();
    await abrirMenu(w, 'Ana');
    [...document.querySelectorAll('[data-pc-section="itemcontent"]')].find((i) => i.textContent.includes('Suspender')).click();
    await espera();
    const dialogo = w.findComponent({ name: 'EmpleadoMotivoDialog' });
    expect(dialogo.props('accion')).toBe('suspender');
    expect(dialogo.props('empleado').id).toBe('e1');
  });

  it('Reactivar abre el diálogo de motivo con la acción reactivar', async () => {
    const { w } = await montar();
    await abrirMenu(w, 'Beto');
    [...document.querySelectorAll('[data-pc-section="itemcontent"]')].find((i) => i.textContent.includes('Reactivar')).click();
    await espera();
    expect(w.findComponent({ name: 'EmpleadoMotivoDialog' }).props('accion')).toBe('reactivar');
  });

  it('la fila entera abre el expediente', async () => {
    const { w, router } = await montar();
    await w.findAll('tbody tr')[1].trigger('click');
    await espera();
    expect(router.currentRoute.value.path).toBe('/empleados/e2');
  });
});
