// @vitest-environment happy-dom
//
// Primer test de render de una VISTA completa respaldada por store+router
// en este proyecto (no existía ninguno antes de esta migración — verificado
// buscando en todo tests/ antes de escribir esto). LicenciasView.vue es el
// primer módulo de negocio migrado al patrón PrimeVue Unstyled + Tailwind
// (AppTable/AppColumn/AppButton, ver frontend/AGENTS.md "UI/UX"): esto
// prueba que la migración —tabla nativa → AppTable, orden vía @ordenar—
// sigue produciendo el DOM y el contrato con el store que la vista espera.
//
// Alcance deliberado: solo el LISTADO (carga inicial, columnas, orden). Los
// modales (LicenciaForm, asignar asiento, ConfirmDialog) son código que esta
// migración no tocó — se stubean, no se re-verifican acá.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import LicenciasView from '../../src/modules/licencias/LicenciasView.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listLicenciasPage: vi.fn(),
    listEmpleados: vi.fn().mockResolvedValue([]),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const LICENCIAS_FIXTURE = [
  {
    id: 'lic-1',
    software: 'Adobe Creative Cloud',
    proveedor: 'Adobe',
    empresa_nombre: null,
    cuenta_id: 'c1',
    cuenta_usuario: 'ti@empresa.com',
    tiene_clave: false,
    usados: 3,
    cantidad: 5,
    usuarios: [{ nombre: 'Juan Pérez', empleado_id: 'e1', asignacion_id: 'a1' }],
    tipo: 'suscripcion',
    fecha_vencimiento: '2030-01-01',
    renovacion_meses: 12,
  },
  {
    id: 'lic-2',
    software: 'Windows Server',
    proveedor: null,
    empresa_nombre: 'Constructora XYZ',
    cuenta_id: null,
    tiene_clave: false,
    usados: 0,
    cantidad: 1,
    usuarios: [],
    tipo: 'perpetua',
    fecha_vencimiento: null,
    renovacion_meses: null,
  },
];

function crearRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/licencias', name: 'licencias', component: { template: '<div />' } },
      // Solo para que el <RouterLink> del chip de usuario asignado no tire
      // el warning "No match found" — esta vista no navega ahí de verdad.
      { path: '/empleados/:id', name: 'empleado-detalle', component: { template: '<div />' } },
    ],
  });
  return router;
}

async function montar() {
  const router = crearRouter();
  router.push('/licencias');
  await router.isReady();

  const w = mount(LicenciasView, {
    global: {
      plugins: [router],
      stubs: { LicenciaForm: true, Modal: true, ConfirmDialog: true },
    },
  });
  await flushPromises();
  return w;
}

// onMounted -> store.cargar() -> insforgeApi.listLicenciasPage() son todas
// promesas encadenadas; unos `await Promise.resolve()` no alcanzan a drenar
// la cadena completa en algunos entornos, por eso un microtask real.
function flushPromises() {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listLicenciasPage.mockResolvedValue({ items: LICENCIAS_FIXTURE, total: 2 });
});

describe('LicenciasView.vue — listado migrado a AppTable/AppColumn/AppButton', () => {
  it('carga la página inicial vía el store real y pinta las filas', async () => {
    const w = await montar();
    expect(insforgeApi.listLicenciasPage).toHaveBeenCalledTimes(1);
    expect(w.text()).toContain('Adobe Creative Cloud');
    expect(w.text()).toContain('Windows Server');
    expect(w.text()).toContain('Constructora XYZ');
  });

  it('las 7 columnas declaradas con AppColumn se renderizan como <th>', async () => {
    const w = await montar();
    const headers = w.findAll('th').map((th) => th.text());
    expect(headers).toEqual(['Software', 'Empresa', 'Acceso', 'Asientos', 'Usuarios', 'Vencimiento', 'Acciones']);
  });

  it('celdas con contenido custom (#body) siguen renderizando lo mismo que antes', async () => {
    const w = await montar();
    // Barra de capacidad (columna Asientos)
    expect(w.text()).toContain('3/5 asientos');
    // Vencimiento de una licencia perpetua
    expect(w.text()).toContain('Perpetua');
    // Chip de usuario asignado, con link al empleado
    const link = w.find('a.empleado-link');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('/empleados/e1');
  });

  it('clic en el header ordenable "Software" llama a store.ordenarPor vía @ordenar, no queda como un no-op', async () => {
    const w = await montar();
    const thSoftware = w.findAll('th').find((th) => th.text() === 'Software');
    await thSoftware.trigger('click');
    await flushPromises();

    // ordenarPor() dispara una segunda carga con el orden nuevo — igual que
    // antes (ThOrdenable + store.ordenarPor(col.clave) directo).
    expect(insforgeApi.listLicenciasPage).toHaveBeenCalledTimes(2);
    const [, ultimaLlamada] = insforgeApi.listLicenciasPage.mock.calls;
    expect(ultimaLlamada[0].orden).toEqual({ columna: 'software', direccion: 'asc' });
  });

  it('columna "Empresa" (no declarada sortable) no dispara una carga extra al clickearla', async () => {
    const w = await montar();
    const thEmpresa = w.findAll('th').find((th) => th.text() === 'Empresa');
    await thEmpresa.trigger('click');
    await flushPromises();
    expect(insforgeApi.listLicenciasPage).toHaveBeenCalledTimes(1);
  });

  it('el botón "Nueva licencia" del header es el AppButton real (severidad primaria)', async () => {
    const w = await montar();
    const boton = w.findAll('button').find((b) => b.text().includes('Nueva licencia') && !b.text().includes('Registra'));
    expect(boton).toBeTruthy();
    expect(boton.attributes('class') || '').toContain('bg-primary-500');
  });

  it('loading=true (mientras carga) no rompe el render — AppTable maneja su propio overlay', async () => {
    let resolver;
    insforgeApi.listLicenciasPage.mockReturnValueOnce(new Promise((r) => (resolver = r)));
    const router = crearRouter();
    router.push('/licencias');
    await router.isReady();
    const w = mount(LicenciasView, {
      global: { plugins: [router], stubs: { LicenciaForm: true, Modal: true, ConfirmDialog: true } },
    });
    await Promise.resolve();
    // Todavía cargando: la tabla existe (con 0 filas), no explota.
    expect(w.find('table').exists()).toBe(true);
    resolver({ items: LICENCIAS_FIXTURE, total: 2 });
    await flushPromises();
    expect(w.text()).toContain('Adobe Creative Cloud');
  });
});
