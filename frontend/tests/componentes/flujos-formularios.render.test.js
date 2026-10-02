// @vitest-environment happy-dom
//
// Mejoras de flujo de 2026-09-24 que viven dentro de formularios/modales:
//   - EmpleadoForm: DNI duplicado → quién lo tiene, estado y enlace a su ficha.
//   - CorreosView + CorreoForm: "Rotar contraseña" en el menú ⋮ (solo si
//     requiere_rotacion), formulario con foco en "Nueva contraseña", sin
//     precargarla, y segmento "Requieren rotación" server-side.
//   - AsignarEquipoModal / AsignarLicenciaModal: estados vacíos con salida,
//     y oferta de "Ver acta" (ruta imprimible) al entregar un equipo.
//
// Mismo arnés que las vistas: se mockea solo api/insforge.js; Pinia, router
// y AppDialog.vue (Teleport a <body>) son reales.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import EmpleadoForm from '../../src/modules/empleados/EmpleadoForm.vue';
import CorreoForm from '../../src/modules/correos/CorreoForm.vue';
import CorreosView from '../../src/modules/correos/CorreosView.vue';
import AsignarEquipoModal from '../../src/modules/equipos/AsignarEquipoModal.vue';
import AsignarLicenciaModal from '../../src/modules/licencias/AsignarLicenciaModal.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listEmpresas: vi.fn().mockResolvedValue([]),
    listAreasObras: vi.fn().mockResolvedValue([]),
    listUbicaciones: vi.fn().mockResolvedValue([]),
    listPlataformas: vi.fn().mockResolvedValue([]),
    createEmpleado: vi.fn(),
    updateEmpleado: vi.fn(),
    buscarPorDni: vi.fn(),
    getEmpleado: vi.fn(),
    listCorreosPage: vi.fn(),
    conteosCorreosPorVista: vi.fn().mockResolvedValue({ todos: 2, compartida: 1, reutilizable: 1, rotar: 1 }),
    updateCorreo: vi.fn(),
    listEquipos: vi.fn(),
    asignarEquipo: vi.fn(),
    listLicencias: vi.fn(),
    asignarUsuario: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

function flushPromises() {
  return new Promise((r) => setTimeout(r, 0));
}

function crearRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/correos', component: { template: '<div />' } },
      { path: '/empleados/:id', component: { template: '<div />' } },
      { path: '/equipos', component: { template: '<div />' } },
      { path: '/licencias', component: { template: '<div />' } },
    ],
  });
}

async function montar(componente, { props = {}, url = '/', stubs = {} } = {}) {
  const router = crearRouter();
  router.push(url);
  await router.isReady();
  const w = mount(componente, { props, attachTo: document.body, global: { plugins: [router], stubs } });
  await flushPromises();
  return { w, router };
}

const cuerpo = () => document.body.textContent.replace(/\s+/g, ' ');
const botonPorTexto = (texto) => [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim() === texto);

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listEmpresas.mockResolvedValue([]);
  insforgeApi.listAreasObras.mockResolvedValue([]);
  insforgeApi.listUbicaciones.mockResolvedValue([]);
  insforgeApi.listPlataformas.mockResolvedValue([]);
});

afterEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

// ── EmpleadoForm ────────────────────────────────────────────────────────────
describe('EmpleadoForm — DNI duplicado', () => {
  const ERROR_UNIQUE = { message: 'duplicate key value violates unique constraint "empleados_dni_key"' };

  async function enviarAlta(existente) {
    insforgeApi.createEmpleado.mockRejectedValue(ERROR_UNIQUE);
    insforgeApi.buscarPorDni.mockResolvedValue(existente);
    const { w } = await montar(EmpleadoForm);
    const dni = document.querySelector('input[inputmode="numeric"]');
    dni.value = '46325874';
    dni.dispatchEvent(new Event('input'));
    document.querySelector('#empleado-form').dispatchEvent(new Event('submit'));
    await flushPromises();
    return w;
  }

  it('Inactivo: dice quién es, su estado, sugiere reactivar y enlaza a su ficha', async () => {
    await enviarAlta({ id: 'e06', nombres: 'Pedro', apellidos: 'Ticona Apaza', dni: '46325874', estado: 'Inactivo' });
    expect(insforgeApi.buscarPorDni).toHaveBeenCalledWith('46325874');
    expect(cuerpo()).toContain('Pedro Ticona Apaza');
    expect(cuerpo()).toContain('Inactivo');
    expect(cuerpo()).toContain('reactívelo desde su ficha');
    const enlace = document.querySelector('a[href="/empleados/e06"]');
    expect(enlace).not.toBeNull();
    expect(enlace.textContent).toContain('reactivarlo');
  });

  it('Activo: no sugiere reactivar, pero sí abrir su ficha', async () => {
    await enviarAlta({ id: 'e01', nombres: 'Rosa', apellidos: 'Quispe Mamani', dni: '46325874', estado: 'Activo' });
    expect(cuerpo()).toContain('Rosa Quispe Mamani');
    expect(cuerpo()).not.toContain('reactívelo');
    expect(document.querySelector('a[href="/empleados/e01"]')?.textContent).toContain('Abrir su ficha');
  });

  it('si la búsqueda del existente falla, queda el aviso genérico (sin enlace)', async () => {
    insforgeApi.createEmpleado.mockRejectedValue(ERROR_UNIQUE);
    insforgeApi.buscarPorDni.mockRejectedValue(new Error('red'));
    await montar(EmpleadoForm);
    document.querySelector('#empleado-form').dispatchEvent(new Event('submit'));
    await flushPromises();
    expect(cuerpo()).toContain('Ya existe un empleado con ese DNI');
    expect(document.querySelector('a[href^="/empleados/"]')).toBeNull();
  });
});

// ── Correos: rotar contraseña ───────────────────────────────────────────────
describe('CorreoForm — modo "Rotar contraseña"', () => {
  const CORREO = {
    id: 'c12', plataforma_id: 'gmail', usuario: 'rrhh@materen.pe', url: '', notas: '',
    tipo_cuenta: 'reutilizable', requiere_rotacion: true,
  };

  it('entra con el foco en "Nueva contraseña", vacía, y con el aviso del motivo', async () => {
    await montar(CorreoForm, { props: { correo: CORREO, rotar: true } });
    const pass = document.querySelector('input[autocomplete="new-password"]');
    expect(pass.value).toBe('');
    expect(document.activeElement).toBe(pass);
    expect(cuerpo()).toContain('Rotar contraseña');
    expect(cuerpo()).toContain('Un titular dejó esta cuenta');
  });

  it('guardar sin escribir contraseña NO marca password_cambiada', async () => {
    insforgeApi.updateCorreo.mockResolvedValue({});
    insforgeApi.listCorreosPage.mockResolvedValue({ items: [], total: 0 });
    await montar(CorreoForm, { props: { correo: CORREO, rotar: true } });
    document.querySelector('#correo-form').dispatchEvent(new Event('submit'));
    await flushPromises();
    expect(insforgeApi.updateCorreo).toHaveBeenCalledWith('c12', expect.objectContaining({ password_cambiada: false }));
  });

  it('guardar con una contraseña nueva sí la marca como cambiada', async () => {
    insforgeApi.updateCorreo.mockResolvedValue({});
    insforgeApi.listCorreosPage.mockResolvedValue({ items: [], total: 0 });
    await montar(CorreoForm, { props: { correo: CORREO, rotar: true } });
    const pass = document.querySelector('input[autocomplete="new-password"]');
    pass.value = 'Nueva-Clave-2026';
    pass.dispatchEvent(new Event('input'));
    document.querySelector('#correo-form').dispatchEvent(new Event('submit'));
    await flushPromises();
    expect(insforgeApi.updateCorreo).toHaveBeenCalledWith('c12', expect.objectContaining({
      password_cambiada: true, password: 'Nueva-Clave-2026',
    }));
  });

  it('sin `rotar` es la edición de siempre: sin aviso ni título de rotación', async () => {
    await montar(CorreoForm, { props: { correo: CORREO } });
    expect(cuerpo()).toContain('Editar correo compartido');
    expect(cuerpo()).not.toContain('Un titular dejó esta cuenta');
  });
});

describe('CorreosView — acción y filtro de rotación', () => {
  const FILAS = [
    { id: 'c12', usuario: 'rrhh@materen.pe', plataforma_nombre: 'Gmail', tipo_cuenta: 'reutilizable', requiere_rotacion: true, asignados: [], url: '', notas: '' },
    { id: 'c10', usuario: 'ti@materen.pe', plataforma_nombre: 'Gmail', tipo_cuenta: 'compartida', requiere_rotacion: false, asignados: [], url: '', notas: '' },
  ];

  beforeEach(() => {
    insforgeApi.listCorreosPage.mockResolvedValue({ items: FILAS, total: 2 });
  });

  it('"Rotar contraseña" solo aparece en el menú de filas que lo requieren', async () => {
    const { w } = await montar(CorreosView, { url: '/correos', stubs: { CorreoForm: true, ConfirmDialog: true } });
    const rotar = (fila) => w.vm.accionesDe(fila).find((a) => a.label === 'Rotar contraseña');
    expect(rotar(FILAS[0]).visible).toBe(true);
    expect(rotar(FILAS[1]).visible).toBe(false);
  });

  it('la acción abre el formulario en modo rotar sobre esa cuenta', async () => {
    const { w } = await montar(CorreosView, { url: '/correos', stubs: { CorreoForm: true, ConfirmDialog: true } });
    w.vm.accionesDe(FILAS[0]).find((a) => a.label === 'Rotar contraseña').onClick();
    await flushPromises();
    const form = w.findComponent({ name: 'CorreoForm' });
    expect(form.exists()).toBe(true);
    expect(form.props('rotar')).toBe(true);
    expect(form.props('correo')).toMatchObject({ id: 'c12' });
  });

  it('la vista "Por rotar" recarga desde el servidor con soloRotacion=true', async () => {
    await montar(CorreosView, { url: '/correos', stubs: { CorreoForm: true, ConfirmDialog: true } });
    const grupo = document.querySelector('[role="group"][aria-label="Vista de correos"]');
    [...grupo.querySelectorAll('button')].find((b) => b.textContent.includes('Por rotar')).click();
    await flushPromises();
    expect(insforgeApi.listCorreosPage.mock.calls.at(-1)[0]).toMatchObject({ soloRotacion: true, pagina: 1 });
  });
});

// ── Modales de asignación desde la ficha del empleado ───────────────────────
describe('AsignarEquipoModal — estado vacío y acta de entrega', () => {
  it('sin equipos en almacén ofrece "Registrar un equipo" (→ /equipos?nuevo=1)', async () => {
    insforgeApi.listEquipos.mockResolvedValue([{ id: 'q1', situacion: 'asignado' }]);
    await montar(AsignarEquipoModal, { props: { empleadoId: 'e01', empleadoNombre: 'Rosa' } });
    expect(cuerpo()).toContain('No hay equipos disponibles');
    expect(document.querySelector('a[href="/equipos?nuevo=1"]')?.textContent).toContain('Registrar un equipo');
  });

  it('al entregar usa la RPC y ofrece "Ver acta" (enlace a la ruta imprimible, sin ventana reservada)', async () => {
    const open = vi.spyOn(window, 'open');
    insforgeApi.listEquipos.mockResolvedValue([
      { id: 'q1', codigo: 'EQ-0001', situacion: 'disponible', tipo_nombre: 'Laptop', marca: 'Dell', modelo: 'X' },
    ]);
    insforgeApi.asignarEquipo.mockResolvedValue({ id: 'asig-1' });
    const { w } = await montar(AsignarEquipoModal, { props: { empleadoId: 'e01', empleadoNombre: 'Rosa' } });
    w.vm.equipoSelId = 'q1';
    w.vm.condicionEntrega = 'con cargador';
    await w.vm.confirmar();
    await flushPromises();
    expect(insforgeApi.asignarEquipo).toHaveBeenCalledWith('q1', 'e01', 'con cargador');
    expect(w.emitted('asignado')).toBeTruthy();
    expect(cuerpo()).toContain('EQ-0001 quedó a cargo de Rosa');
    const enlace = document.querySelector('a[href="/equipos/q1/acta/asig-1?tipo=entrega"]');
    expect(enlace?.textContent).toContain('Ver acta');
    expect(enlace.getAttribute('target')).toBe('_blank');
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
    w.unmount();
  });

  it('si la entrega falla, muestra el rechazo del servidor en el diálogo y no ofrece el acta', async () => {
    insforgeApi.listEquipos.mockResolvedValue([{ id: 'q1', codigo: 'EQ-0001', situacion: 'disponible' }]);
    insforgeApi.asignarEquipo.mockRejectedValue(new Error('El equipo EQ-0001 no está operativo.'));
    const { w } = await montar(AsignarEquipoModal, { props: { empleadoId: 'e01' } });
    w.vm.equipoSelId = 'q1';
    await w.vm.confirmar();
    await flushPromises();
    expect(cuerpo()).toContain('El equipo EQ-0001 no está operativo.');
    expect(cuerpo()).not.toContain('Ver acta');
    expect(w.emitted('asignado')).toBeFalsy();
    w.unmount();
  });
});

describe('AsignarLicenciaModal — estado vacío con salida', () => {
  it('sin licencias registradas ofrece registrar una (→ /licencias?nuevo=1)', async () => {
    insforgeApi.listLicencias.mockResolvedValue([]);
    await montar(AsignarLicenciaModal, { props: { empleadoId: 'e01' } });
    expect(document.querySelector('a[href="/licencias?nuevo=1"]')?.textContent).toContain('Registrar una licencia');
  });

  it('con todas llenas explica qué hacer y lleva a Licencias', async () => {
    insforgeApi.listLicencias.mockResolvedValue([{ id: 'l1', software: 'X', usados: 2, cantidad: 2 }]);
    await montar(AsignarLicenciaModal, { props: { empleadoId: 'e01' } });
    expect(cuerpo()).toContain('Libere un asiento o amplíe la cantidad');
    expect(botonPorTexto('Ir a Licencias')?.getAttribute('href')).toBe('/licencias');
  });
});
