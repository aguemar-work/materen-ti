// @vitest-environment happy-dom
//
// EquiposView.vue — segundo módulo de negocio migrado a
// AppTable/AppColumn/AppButton (PrimeVue Unstyled + Tailwind), después de
// Licencias. Mismo patrón de test que LicenciasView.render.test.js: mockea
// solo api/insforge.js, Pinia y router son reales.
//
// Ojo con el hotfix HTTP 414 (migración 085, `tiene_asignacion_activa`
// derivada en servidor): vive ENTERO en api/domains/equipos.js, un archivo
// que esta migración de UI no tocó — se mockea acá en el límite (el mismo
// `insforgeApi.listEquiposPage`), así que este test no puede probar esa
// query directamente, pero si algo en la vista reconstruyera un filtro
// gigante lo haría ANTES de llamar a esta función mockeada, y aparecería
// en los parámetros que recibe el mock — se verifica abajo.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import EquiposView from '../../src/modules/equipos/EquiposView.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listEquiposPage: vi.fn(),
    listTiposEquipo: vi.fn().mockResolvedValue([]),
    listUbicaciones: vi.fn().mockResolvedValue([{ id: 'ub-1', nombre: 'Almacén TI' }]),
    conteosEquiposPorSituacion: vi.fn(),
    listEmpresas: vi.fn().mockResolvedValue([]),
    listEmpleados: vi.fn().mockResolvedValue([]),
    asignarEquipo: vi.fn(),
    devolverEquipo: vi.fn(),
    moverEquipo: vi.fn(),
    cambiarEstadoEquipo: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const EQUIPOS_FIXTURE = [
  {
    id: 'eq-1',
    codigo: 'EQ-0001',
    codigo_almacen: null,
    fotos: [],
    modelo: 'Latitude 5440',
    empresa_nombre: null,
    tipo_nombre: 'Laptop',
    marca: 'Dell',
    serie: 'SN123',
    estado: 'operativo',
    situacion: 'asignado',
    portador: 'Juan Pérez',
    portador_inactivo: false,
    empleado_id: 'emp-1',
    ubicacion_id: null,
    ubicacion_nombre: null,
  },
  {
    id: 'eq-2',
    codigo: 'EQ-0002',
    codigo_almacen: 'ALM-02',
    fotos: [],
    modelo: null,
    empresa_nombre: 'Constructora XYZ',
    tipo_nombre: 'Monitor',
    marca: 'LG',
    serie: null,
    estado: 'de_baja',
    situacion: 'de_baja',
    portador: null,
    portador_inactivo: false,
    ubicacion_id: null,
    ubicacion_nombre: null,
  },
];

function crearRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/equipos', name: 'equipos', component: { template: '<div />' } },
      { path: '/equipos/importar', name: 'equipos-importar', component: { template: '<div />' } },
      { path: '/empleados/:id', name: 'empleado-detalle', component: { template: '<div />' } },
      { path: '/equipos/etiquetas', name: 'equipos-etiquetas', component: { template: '<div />' } },
      { path: '/equipos/:id', name: 'equipo-detalle', component: { template: '<div />' } },
      { path: '/equipos/:id/acta/:asignacionId', name: 'equipo-acta', component: { template: '<div />' } },
    ],
  });
  return router;
}

async function montar() {
  const router = crearRouter();
  router.push('/equipos');
  await router.isReady();
  const w = mount(EquiposView, {
    global: {
      plugins: [router, [PrimeVue, { unstyled: true }]],
      stubs: { EquipoForm: true, ConfirmDialog: true },
    },
  });
  await flushPromises();
  return w;
}

function flushPromises() {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listEquiposPage.mockResolvedValue({ items: EQUIPOS_FIXTURE, total: 2 });
  insforgeApi.listTiposEquipo.mockResolvedValue([]);
  insforgeApi.listUbicaciones.mockResolvedValue([{ id: 'ub-1', nombre: 'Almacén TI' }]);
  insforgeApi.listEmpresas.mockResolvedValue([]);
  insforgeApi.conteosEquiposPorSituacion.mockResolvedValue({
    todos: 2, disponible: 0, asignado: 1, en_ubicacion: 0, en_reparacion: 0, fuera: 1,
  });
});

describe('EquiposView.vue — listado migrado a AppTable/AppColumn/AppButton', () => {
  it('carga la página inicial vía el store real y pinta las filas', async () => {
    const w = await montar();
    expect(insforgeApi.listEquiposPage).toHaveBeenCalledTimes(1);
    expect(w.text()).toContain('EQ-0001');
    expect(w.text()).toContain('EQ-0002');
    expect(w.text()).toContain('Constructora XYZ');
  });

  // Rediseño 2026-09-23: 8 columnas → 5 ricas (código/almacén/empresa van
  // apilados bajo "Equipo"; "Asignado a" + "Ubicación" se fundieron en
  // "Asignación"). Mismo contrato: cada AppColumn sigue siendo un <th>.
  it('las 5 columnas declaradas con AppColumn se renderizan como <th>', async () => {
    const w = await montar();
    // La primera columna (casilla de selección para imprimir etiquetas) no lleva texto.
    const headers = w.findAll('th').map((th) => th.text()).filter(Boolean);
    expect(headers).toEqual(['Equipo', 'Serie', 'Estado', 'Asignación', 'Acciones']);
    expect(w.find('thead input[type="checkbox"]').exists()).toBe(true);
  });

  it('celdas con contenido custom (#body) siguen renderizando lo mismo que antes', async () => {
    const w = await montar();
    // Badge de estado físico (operativo, no "asignado" — esa distinción es
    // la razón de ser de badgeEstadoFisico()).
    expect(w.text()).toContain('Operativo');
    expect(w.text()).toContain('De baja');
    // Portador con link al empleado.
    // (antes por la clase provisional `.empleado-link`; ahora por destino)
    const link = w.find('a[href="/empleados/emp-1"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe('Juan Pérez');
  });

  it('clic en el header ordenable "Equipo" (campo codigo) llama a store.ordenarPor vía @ordenar', async () => {
    const w = await montar();
    const th = w.findAll('th').find((t) => t.text() === 'Equipo');
    await th.trigger('click');
    await flushPromises();
    expect(insforgeApi.listEquiposPage).toHaveBeenCalledTimes(2);
    const [, ultimaLlamada] = insforgeApi.listEquiposPage.mock.calls;
    expect(ultimaLlamada[0].orden).toEqual({ columna: 'codigo', direccion: 'asc' });
  });

  it('columna "Asignación" (no declarada sortable) no dispara una carga extra al clickearla', async () => {
    const w = await montar();
    const th = w.findAll('th').find((t) => t.text() === 'Asignación');
    await th.trigger('click');
    await flushPromises();
    expect(insforgeApi.listEquiposPage).toHaveBeenCalledTimes(1);
  });

  it('no reconstruye un filtro sospechosamente grande al pedir la página (regresión HTTP 414)', async () => {
    const w = await montar();
    const params = insforgeApi.listEquiposPage.mock.calls[0][0];
    const serializado = JSON.stringify(params);
    // Guardrail básico: los parámetros que arma la vista/tienda hacia el
    // límite mockeado deben quedar chicos (paginación + filtros simples),
    // nunca un array de uuids armado en el cliente.
    expect(serializado.length).toBeLessThan(500);
    expect(w.text()).not.toContain('not.in.');
  });

  it('el botón "Nuevo equipo" del header es el AppButton real (severidad primaria)', async () => {
    const w = await montar();
    const boton = w.findAll('button').find((b) => b.text().includes('Nuevo equipo'));
    expect(boton).toBeTruthy();
    expect(boton.attributes('class') || '').toContain('bg-primary-500');
  });

  it('loading=true (mientras carga) no rompe el render', async () => {
    let resolver;
    insforgeApi.listEquiposPage.mockReturnValueOnce(new Promise((r) => (resolver = r)));
    const router = crearRouter();
    router.push('/equipos');
    await router.isReady();
    const w = mount(EquiposView, {
      global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { EquipoForm: true, ConfirmDialog: true } },
    });
    await Promise.resolve();
    expect(w.find('table').exists()).toBe(true);
    resolver({ items: EQUIPOS_FIXTURE, total: 2 });
    await flushPromises();
    expect(w.text()).toContain('EQ-0001');
  });
});

// La fila abre la hoja de vida (ya no un modal) y las acciones salen a
// EquipoAccionesModales sobre las RPC de la migración 101.
describe('EquiposView.vue — hoja de vida y acciones', () => {
  const EMPLEADO = { id: 'emp-9', nombres: 'Rosa', apellidos: 'Quispe', dni: '45871236', estado: 'Activo' };
  const LIBRE = { ...EQUIPOS_FIXTURE[1], id: 'eq-3', codigo: 'EQ-0003', estado: 'operativo', situacion: 'disponible', asignacion_id: null };

  it('un clic en la fila navega a /equipos/:id', async () => {
    const router = crearRouter();
    router.push('/equipos');
    await router.isReady();
    const w = mount(EquiposView, { global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { EquipoForm: true, ConfirmDialog: true } } });
    await flushPromises();
    await w.findAll('tbody tr')[0].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/equipos/eq-1');
  });

  it('entregar usa la RPC y ofrece "Ver acta" con la asignación creada (sin ventana reservada)', async () => {
    insforgeApi.listEquiposPage.mockResolvedValue({ items: [LIBRE], total: 1 });
    insforgeApi.listEmpleados.mockResolvedValue([EMPLEADO]);
    insforgeApi.asignarEquipo.mockResolvedValue({ id: 'asig-77' });
    const open = vi.spyOn(window, 'open');
    const w = await montar();
    await w.vm.acciones.abrirEntregar(LIBRE);
    await flushPromises();
    w.vm.acciones.form.empleadoId = 'emp-9';
    w.vm.acciones.form.condicion = 'con cargador';
    await w.vm.acciones.confirmarEntregar();
    await flushPromises();
    expect(insforgeApi.asignarEquipo).toHaveBeenCalledWith('eq-3', 'emp-9', 'con cargador');
    // La lista se recarga tras la acción.
    expect(insforgeApi.listEquiposPage.mock.calls.length).toBeGreaterThan(1);
    const enlace = [...document.querySelectorAll('a')].find((a) => a.textContent.includes('Ver acta'));
    expect(enlace.getAttribute('href')).toBe('/equipos/eq-3/acta/asig-77?tipo=entrega');
    expect(enlace.getAttribute('target')).toBe('_blank');
    // El enlace abre la pestaña en el clic: nada de window.open tras un await.
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
    w.unmount();
  });

  it('si el servidor rechaza la entrega, el motivo aparece dentro del diálogo y no hay "Ver acta"', async () => {
    insforgeApi.listEmpleados.mockResolvedValue([EMPLEADO]);
    insforgeApi.asignarEquipo.mockRejectedValue(Object.assign(new Error('El equipo EQ-0003 ya tiene un portador activo.'), { code: 'P0001', tipo: 'validacion', original: {} }));
    const w = await montar();
    await w.vm.acciones.abrirEntregar(LIBRE);
    await flushPromises();
    w.vm.acciones.form.empleadoId = 'emp-9';
    await w.vm.acciones.confirmarEntregar();
    await flushPromises();
    expect(w.vm.acciones.error).toBe('El equipo EQ-0003 ya tiene un portador activo.');
    expect(document.body.textContent).toContain('ya tiene un portador activo');
    expect([...document.querySelectorAll('a')].some((a) => a.textContent.includes('Ver acta'))).toBe(false);
    w.unmount();
  });

  it('devolver llama a devolver_equipo con la asignación y ofrece el acta de devolución', async () => {
    insforgeApi.devolverEquipo.mockResolvedValue({ id: 'eq-1' });
    const w = await montar();
    await w.vm.acciones.abrirDevolver({ ...EQUIPOS_FIXTURE[0], asignacion_id: 'asig-5' });
    w.vm.acciones.form.condicion = 'pantalla rota';
    w.vm.acciones.cambiarMotivo('cambio_equipo');
    w.vm.acciones.form.aReparacion = true;
    await w.vm.acciones.confirmarDevolver();
    await flushPromises();
    expect(insforgeApi.devolverEquipo).toHaveBeenCalledWith('asig-5', 'eq-1', { condicion: 'pantalla rota', motivo: 'cambio_equipo', aReparacion: true });
    const enlace = [...document.querySelectorAll('a')].find((a) => a.textContent.includes('Ver acta'));
    expect(enlace.getAttribute('href')).toBe('/equipos/eq-1/acta/asig-5?tipo=devolucion');
    w.unmount();
  });

  it('elegir "pérdida" apaga la casilla de reparación (se contradicen)', async () => {
    const w = await montar();
    await w.vm.acciones.abrirDevolver({ ...EQUIPOS_FIXTURE[0], asignacion_id: 'asig-5' });
    w.vm.acciones.form.aReparacion = true;
    w.vm.acciones.cambiarMotivo('perdida');
    expect(w.vm.acciones.form.aReparacion).toBe(false);
    w.unmount();
  });

  it('la selección de filas habilita "Imprimir etiquetas" con los ids en la URL', async () => {
    const router = crearRouter();
    router.push('/equipos');
    await router.isReady();
    const w = mount(EquiposView, { global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { EquipoForm: true, ConfirmDialog: true } } });
    await flushPromises();
    expect(w.text()).not.toContain('Imprimir etiquetas');
    const casillas = w.findAll('tbody input[type="checkbox"]');
    expect(casillas.length).toBe(2);
    await casillas[0].setValue(true);
    await casillas[1].setValue(true);
    await flushPromises();
    expect(w.text()).toContain('2 seleccionados');
    await w.findAll('button').find((b) => b.text().includes('Imprimir etiquetas')).trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/equipos/etiquetas');
    expect(router.currentRoute.value.query.ids).toBe('eq-1,eq-2');
  });
});

describe('EquiposView.vue — /equipos?nuevo=1', () => {
  it('abre el formulario de alta al llegar y quita el parámetro de la URL', async () => {
    const router = crearRouter();
    router.push('/equipos?nuevo=1');
    await router.isReady();
    const w = mount(EquiposView, {
      global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { EquipoForm: true, ConfirmDialog: true } },
    });
    await flushPromises();
    expect(w.findComponent({ name: 'EquipoForm' }).exists()).toBe(true);
    expect(router.currentRoute.value.query.nuevo).toBeUndefined();
  });
});

// Filtros V2 (2026-09-25): la situación es una VISTA (pestañas con conteo)
// y la URL es la fuente de verdad del filtro.
describe('EquiposView.vue — vistas y filtros en la URL', () => {
  function vista(w, texto) {
    const grupo = w.find('[role="group"][aria-label="Vista de equipos"]');
    return grupo.findAll('button').find((b) => b.text().startsWith(texto));
  }

  it('muestra las vistas con su conteo (reemplazan a los KPI y al select de situación)', async () => {
    const w = await montar();
    expect(vista(w, 'Todos').text()).toContain('2');
    expect(vista(w, 'Fuera de servicio').text()).toContain('1');
    expect(w.find('select[aria-label="Filtrar por situación"]').exists()).toBe(false);
  });

  it('elegir una vista recarga con esa situación y la deja en la URL', async () => {
    const router = crearRouter();
    router.push('/equipos');
    await router.isReady();
    const w = mount(EquiposView, { global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { EquipoForm: true, ConfirmDialog: true } } });
    await flushPromises();
    await vista(w, 'Libres').trigger('click');
    await flushPromises();
    expect(insforgeApi.listEquiposPage.mock.calls.at(-1)[0]).toMatchObject({ situacion: 'disponible', pagina: 1 });
    expect(router.currentRoute.value.query.situacion).toBe('disponible');
    expect(vista(w, 'Libres').attributes('aria-pressed')).toBe('true');
  });

  it('al llegar con filtros en la URL, los aplica sin que haya que tocar nada', async () => {
    const router = crearRouter();
    router.push('/equipos?situacion=en_reparacion&tipo=laptop,desktop');
    await router.isReady();
    mount(EquiposView, { global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { EquipoForm: true, ConfirmDialog: true } } });
    await flushPromises();
    expect(insforgeApi.listEquiposPage.mock.calls.at(-1)[0]).toMatchObject({
      situacion: 'en_reparacion',
      tipoIds: ['laptop', 'desktop'],
    });
    // Los conteos de las vistas respetan los chips (no la vista elegida).
    expect(insforgeApi.conteosEquiposPorSituacion.mock.calls.at(-1)[0]).toMatchObject({ tipoIds: ['laptop', 'desktop'] });
  });
});
