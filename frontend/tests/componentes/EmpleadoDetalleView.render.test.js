// @vitest-environment happy-dom
//
// Prueba puntual de la sección "Actividad reciente" agregada a la ficha de
// empleado (propuesta UX/UI V2): responde a la pregunta de si los chips
// Todo/Accesos/Equipos/Licencias realmente filtran distinto o son
// decorativos. Alcance deliberado: solo esa sección — el resto de la ficha
// (CuentasPanel real, modales) se stubea, no se re-verifica acá.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import EmpleadoDetalleView from '../../src/modules/empleados/EmpleadoDetalleView.vue';
import { useCuentasStore } from '../../src/stores/cuentas.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    getEmpleado: vi.fn(),
    licenciasPorEmpleado: vi.fn(),
    equiposPorEmpleado: vi.fn(),
    tieneEntrega: vi.fn().mockResolvedValue(false),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const EMPLEADO = {
  id: 'e01',
  nombres: 'Ana',
  apellidos: 'Torres',
  dni: '12345678',
  estado: 'Activo',
  cargo: 'Analista',
  empresa_nombre: 'Materen',
  area_obra_nombre: null,
  ubicacion_nombre: null,
  fecha_alta: '2024-01-10',
  whatsapp: '',
  telefono: '',
  correo_personal: '',
  notas: '',
};

// Mismo mix que el empleado e01 de la maqueta: 2 cuentas, 1 equipo, 1 licencia.
const CUENTAS = [
  { asignacion_id: 'ac01', plataforma_nombre: 'Gmail', usuario: 'ana@correo.com', fecha_inicio: '2024-01-11', tipo_cuenta: 'personal', requiere_rotacion: false },
  { asignacion_id: 'ac02', plataforma_nombre: 'ERP', usuario: 'ana.erp', fecha_inicio: '2024-01-12', tipo_cuenta: 'personal', requiere_rotacion: false },
];
const EQUIPOS = [
  { asignacion_id: 'ae01', codigo: 'EQ-001', tipo: 'Laptop', marca: 'Lenovo', modelo: 'X1', fecha_inicio: '2024-02-01', estado: 'operativo', situacion: 'asignado' },
];
const LICENCIAS = [
  { asignacion_id: 'al01', software: 'Office 365', fecha_inicio: '2024-01-15', tipo: 'suscripcion', fecha_vencimiento: '2025-01-15' },
];

function crearRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/empleados', name: 'empleados', component: { template: '<div />' } },
      { path: '/empleados/:id', name: 'empleado-detalle', component: { template: '<div />' } },
    ],
  });
  return router;
}

function flushPromises() {
  return new Promise((r) => setTimeout(r, 0));
}

async function montar() {
  const router = crearRouter();
  router.push('/empleados/e01');
  await router.isReady();

  // cuentasStore.lista se puebla a mano (mismo dato que CuentasPanel real
  // cargaría vía listCuentasPorEmpleado) — CuentasPanel se stubea, así que
  // nadie más lo hace por nosotros.
  const cuentasStore = useCuentasStore();
  cuentasStore.lista = CUENTAS;
  cuentasStore.empleadoActual = 'e01';

  const w = mount(EmpleadoDetalleView, {
    global: {
      plugins: [router],
      stubs: {
        CuentasPanel: true,
        EmpleadoForm: true,
        BajaEmpleadoModal: true,
        AsignarEquipoModal: true,
        AsignarLicenciaModal: true,
        ConfirmDialog: true,
      },
    },
  });
  await flushPromises();
  return w;
}

function segmento(w, texto) {
  const grupo = w.find('[role="group"][aria-label="Filtrar actividad"]');
  return grupo.findAll('button').find((b) => b.text().trim() === texto);
}

function seccionActividad(w) {
  return w.findAll('section').find((s) => s.find('h2').text().includes('Actividad reciente'));
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.getEmpleado.mockResolvedValue(EMPLEADO);
  insforgeApi.licenciasPorEmpleado.mockResolvedValue(LICENCIAS);
  insforgeApi.equiposPorEmpleado.mockResolvedValue(EQUIPOS);
});

describe('EmpleadoDetalleView.vue — "Actividad reciente" (propuesta V2)', () => {
  it('en "Todo" muestra los 4 tipos de evento (2 cuentas + 1 equipo + 1 licencia + el alta)', async () => {
    const w = await montar();
    const seccion = seccionActividad(w);
    expect(seccion.text()).toContain('Cuenta asignada — Gmail');
    expect(seccion.text()).toContain('Cuenta asignada — ERP');
    expect(seccion.text()).toContain('Equipo entregado — EQ-001');
    expect(seccion.text()).toContain('Licencia asignada — Office 365');
    expect(seccion.text()).toContain('Registrado en el sistema');
  });

  it('"Accesos" muestra solo las 2 cuentas — nada de equipos, licencias ni el alta', async () => {
    const w = await montar();
    await segmento(w, 'Accesos').trigger('click');
    const seccion = seccionActividad(w);
    expect(seccion.text()).toContain('Cuenta asignada — Gmail');
    expect(seccion.text()).toContain('Cuenta asignada — ERP');
    expect(seccion.text()).not.toContain('Equipo entregado');
    expect(seccion.text()).not.toContain('Licencia asignada');
    expect(seccion.text()).not.toContain('Registrado en el sistema');
  });

  it('"Equipos" muestra solo el equipo — nada de cuentas ni licencias', async () => {
    const w = await montar();
    await segmento(w, 'Equipos').trigger('click');
    const seccion = seccionActividad(w);
    expect(seccion.text()).toContain('Equipo entregado — EQ-001');
    expect(seccion.text()).not.toContain('Cuenta asignada');
    expect(seccion.text()).not.toContain('Licencia asignada');
  });

  it('"Licencias" muestra solo la licencia — nada de cuentas ni equipos', async () => {
    const w = await montar();
    await segmento(w, 'Licencias').trigger('click');
    const seccion = seccionActividad(w);
    expect(seccion.text()).toContain('Licencia asignada — Office 365');
    expect(seccion.text()).not.toContain('Cuenta asignada');
    expect(seccion.text()).not.toContain('Equipo entregado');
  });

  it('un empleado sin accesos/equipos/licencias solo muestra el alta en "Todo" y "Sin actividad todavía" en los demás chips', async () => {
    insforgeApi.licenciasPorEmpleado.mockResolvedValue([]);
    insforgeApi.equiposPorEmpleado.mockResolvedValue([]);
    const router = crearRouter();
    router.push('/empleados/e01');
    await router.isReady();
    const cuentasStore = useCuentasStore();
    cuentasStore.lista = [];
    cuentasStore.empleadoActual = 'e01';
    const w = mount(EmpleadoDetalleView, {
      global: {
        plugins: [router],
        stubs: { CuentasPanel: true, EmpleadoForm: true, BajaEmpleadoModal: true, AsignarEquipoModal: true, AsignarLicenciaModal: true, ConfirmDialog: true },
      },
    });
    await flushPromises();

    expect(seccionActividad(w).text()).toContain('Registrado en el sistema');
    await segmento(w, 'Equipos').trigger('click');
    expect(seccionActividad(w).text()).toContain('Sin actividad todavía');
  });
});
