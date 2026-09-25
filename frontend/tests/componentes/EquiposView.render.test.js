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
import EquiposView from '../../src/modules/equipos/EquiposView.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listEquiposPage: vi.fn(),
    listTiposEquipo: vi.fn().mockResolvedValue([]),
    listUbicaciones: vi.fn().mockResolvedValue([{ id: 'ub-1', nombre: 'Almacén TI' }]),
    conteosEquiposPorSituacion: vi.fn(),
    listEmpresas: vi.fn().mockResolvedValue([]),
    listEmpleados: vi.fn().mockResolvedValue([]),
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
      plugins: [router],
      stubs: { EquipoForm: true, Modal: true, ConfirmDialog: true },
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
    const headers = w.findAll('th').map((th) => th.text());
    expect(headers).toEqual(['Equipo', 'Serie', 'Estado', 'Asignación', 'Acciones']);
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
      global: { plugins: [router], stubs: { EquipoForm: true, Modal: true, ConfirmDialog: true } },
    });
    await Promise.resolve();
    expect(w.find('table').exists()).toBe(true);
    resolver({ items: EQUIPOS_FIXTURE, total: 2 });
    await flushPromises();
    expect(w.text()).toContain('EQ-0001');
  });
});

// Acta de ENTREGA automática al entregar a un empleado (2026-09-24), mismo
// patrón que la de devolución: ventana reservada en el clic, antes del await.
describe('EquiposView.vue — acta de entrega al entregar', () => {
  const EMPLEADO = {
    id: 'emp-9', nombres: 'Rosa', apellidos: 'Quispe', dni: '45871236', cargo: 'Asistente',
    empresa_nombre: 'Materen', estado: 'Activo',
  };

  function ventanaFalsa() {
    return { document: { write: vi.fn(), open: vi.fn(), close: vi.fn() }, close: vi.fn() };
  }

  async function prepararEntrega(w) {
    w.vm.equipoAsignar = { ...EQUIPOS_FIXTURE[1], id: 'eq-3', codigo: 'EQ-0003', situacion: 'disponible' };
    w.vm.empleadosActivos = [EMPLEADO];
    w.vm.empleadoSelId = 'emp-9';
    w.vm.condicionEntrega = 'con cargador';
  }

  it('reserva la ventana ANTES de registrar la entrega y escribe el acta con los datos del empleado', async () => {
    const orden = [];
    const win = ventanaFalsa();
    const open = vi.spyOn(window, 'open').mockImplementation(() => { orden.push('open'); return win; });
    insforgeApi.asignarEquipo = vi.fn(async () => { orden.push('asignar'); });
    const w = await montar();
    await prepararEntrega(w);
    await w.vm.confirmarAsignar();
    await flushPromises();
    expect(orden).toEqual(['open', 'asignar']);
    const html = win.document.write.mock.calls.map((c) => c[0]).join('');
    expect(html).toContain('Acta de Entrega de Equipo');
    expect(html).toContain('45871236');
    expect(html).toContain('con cargador');
    expect(win.close).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('si la entrega falla, cierra la ventana reservada y no escribe ningún acta', async () => {
    const win = ventanaFalsa();
    const open = vi.spyOn(window, 'open').mockReturnValue(win);
    insforgeApi.asignarEquipo = vi.fn().mockRejectedValue(new Error('El equipo ya tiene portador'));
    const w = await montar();
    await prepararEntrega(w);
    await w.vm.confirmarAsignar();
    await flushPromises();
    expect(win.close).toHaveBeenCalled();
    expect(win.document.write.mock.calls.map((c) => c[0]).join('')).not.toContain('Acta de Entrega');
    expect(w.vm.errorAsignar).toBe('El equipo ya tiene portador');
    open.mockRestore();
  });
});

describe('EquiposView.vue — /equipos?nuevo=1', () => {
  it('abre el formulario de alta al llegar y quita el parámetro de la URL', async () => {
    const router = crearRouter();
    router.push('/equipos?nuevo=1');
    await router.isReady();
    const w = mount(EquiposView, {
      global: { plugins: [router], stubs: { EquipoForm: true, Modal: true, ConfirmDialog: true } },
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
    const w = mount(EquiposView, { global: { plugins: [router], stubs: { EquipoForm: true, Modal: true, ConfirmDialog: true } } });
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
    mount(EquiposView, { global: { plugins: [router], stubs: { EquipoForm: true, Modal: true, ConfirmDialog: true } } });
    await flushPromises();
    expect(insforgeApi.listEquiposPage.mock.calls.at(-1)[0]).toMatchObject({
      situacion: 'en_reparacion',
      tipoIds: ['laptop', 'desktop'],
    });
    // Los conteos de las vistas respetan los chips (no la vista elegida).
    expect(insforgeApi.conteosEquiposPorSituacion.mock.calls.at(-1)[0]).toMatchObject({ tipoIds: ['laptop', 'desktop'] });
  });
});
