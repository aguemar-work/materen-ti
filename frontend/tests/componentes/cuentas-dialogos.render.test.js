// @vitest-environment happy-dom
//
// Diálogos de cuentas migrados a AppDialog al pasar las cuentas a la tabla
// "En custodia": Traspasar (RPC traspasar_cuenta), Historial (AppLibro) y el
// formulario de cuenta (RPC crear_cuenta_asignada). Mismo arnés que los demás
// diálogos: solo api/insforge.js mockeado; AppDialog, stores y la traducción de
// errores son reales.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import TraspasarCuentaDialog from '../../src/modules/cuentas/TraspasarCuentaDialog.vue';
import HistorialCuentaDialog from '../../src/modules/cuentas/HistorialCuentaDialog.vue';
import CuentaForm from '../../src/modules/cuentas/CuentaForm.vue';
import { useCuentasStore } from '../../src/stores/cuentas.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listEmpleados: vi.fn(),
    traspasarCuenta: vi.fn(),
    historialCuenta: vi.fn(),
    createCuenta: vi.fn(),
    updateCuenta: vi.fn(),
    listPlataformas: vi.fn(),
    listCorreosAsignables: vi.fn(),
    asignarCuentaExistente: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const CUENTA = { asignacion_id: 'ac9', cuenta_id: 'cu9', plataforma_nombre: 'Gmail', usuario: 'obra@materen.pe', tipo_cuenta: 'reutilizable' };
const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const montados = [];

async function montar(componente, props) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:resto(.*)*', component: { template: '<div />' } }],
  });
  router.push('/');
  await router.isReady();
  const w = mount(componente, {
    props,
    attachTo: document.body,
    global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { transition: false } },
  });
  montados.push(w);
  for (let i = 0; i < 4; i += 1) await espera();
  return w;
}

const dialogo = () => document.querySelector('[role="dialog"]');
const boton = (texto) => [...dialogo().querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
async function escribir(el, valor) {
  el.value = valor;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await espera();
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listEmpleados.mockResolvedValue([
    { id: 'e1', nombres: 'Titular', apellidos: 'Actual', estado: 'Activo', dni: '1' },
    { id: 'e2', nombres: 'Rosa', apellidos: 'Quispe', estado: 'Activo', dni: '2', cargo: 'Asistente' },
    { id: 'e3', nombres: 'Pedro', apellidos: 'Ticona', estado: 'Inactivo', dni: '3' },
    { id: 'e4', nombres: 'Miguel', apellidos: 'Rojas', estado: 'Suspendido', dni: '4' },
  ]);
  insforgeApi.traspasarCuenta.mockResolvedValue({ id: 'nueva' });
  insforgeApi.listPlataformas.mockResolvedValue([{ id: 'gmail', nombre: 'Gmail' }]);
  insforgeApi.createCuenta.mockResolvedValue({ asignacion_id: 'a-nueva', id: 'cu-nueva', usuario: 'x' });
});

afterEach(() => {
  while (montados.length) {
    try { montados.pop().unmount(); } catch { /* ya desmontado */ }
  }
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('TraspasarCuentaDialog', () => {
  it('solo ofrece como destino a empleados Activos distintos del titular', async () => {
    const w = await montar(TraspasarCuentaDialog, { cuenta: CUENTA, empleadoId: 'e1' });
    expect(w.vm.destinos.map((e) => e.id)).toEqual(['e2']);
    expect(dialogo().textContent).toContain('Gmail');
    expect(dialogo().textContent).toContain('obra@materen.pe');
    expect(boton('Traspasar').disabled).toBe(true);
  });

  it('traspasa por la RPC con la nota marcada como traspaso y la contraseña nueva opcional', async () => {
    const w = await montar(TraspasarCuentaDialog, { cuenta: CUENTA, empleadoId: 'e1' });
    useCuentasStore().lista = [{ asignacion_id: 'ac9' }, { asignacion_id: 'otra' }];
    w.vm.nuevoEmpleadoId = 'e2';
    await espera();
    await escribir(dialogo().querySelector('input[placeholder="Motivo del traspaso"]'), 'Cambio de puesto');
    await escribir(dialogo().querySelector('input[placeholder="Opcional"]'), 'Nueva#Clave1');
    boton('Traspasar').click();
    await espera();
    expect(insforgeApi.traspasarCuenta).toHaveBeenCalledWith('ac9', 'e2', 'Traspaso: Cambio de puesto', 'Nueva#Clave1');
    expect(useCuentasStore().lista.map((c) => c.asignacion_id)).toEqual(['otra']);
    await espera(500);
    expect(w.emitted('cerrado')[0]).toEqual([true]);
  });

  it('sin nota ni contraseña viajan null (la RPC pone "Traspaso a otro empleado" y deja la rotación pendiente)', async () => {
    const w = await montar(TraspasarCuentaDialog, { cuenta: CUENTA, empleadoId: 'e1' });
    w.vm.nuevoEmpleadoId = 'e2';
    await espera();
    expect(dialogo().textContent).toContain('queda marcada “Rotar contraseña”');
    boton('Traspasar').click();
    await espera();
    expect(insforgeApi.traspasarCuenta).toHaveBeenCalledWith('ac9', 'e2', null, null);
  });

  it('un rechazo del servidor se muestra en español y el diálogo no se cierra', async () => {
    insforgeApi.traspasarCuenta.mockRejectedValue({ code: 'P0001', message: 'El empleado destino no está activo.' });
    const w = await montar(TraspasarCuentaDialog, { cuenta: CUENTA, empleadoId: 'e1' });
    w.vm.nuevoEmpleadoId = 'e2';
    await espera();
    boton('Traspasar').click();
    await espera(20);
    expect(dialogo().textContent).toContain('El empleado destino no está activo.');
    expect(w.emitted('cerrado')).toBeUndefined();
  });

  it('un 42501 se traduce a "sin permiso"', async () => {
    insforgeApi.traspasarCuenta.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    const w = await montar(TraspasarCuentaDialog, { cuenta: CUENTA, empleadoId: 'e1' });
    w.vm.nuevoEmpleadoId = 'e2';
    await espera();
    boton('Traspasar').click();
    await espera(20);
    expect(dialogo().textContent).toContain('No tiene permiso para esta acción.');
  });
});

describe('HistorialCuentaDialog', () => {
  it('pinta el historial de titulares con AppLibro: apertura y cierre por asignación, lo más reciente arriba', async () => {
    insforgeApi.historialCuenta.mockResolvedValue([
      { id: 'h1', empleado_id: 'e2', empleado_nombre: 'Rosa Quispe', fecha_inicio: '2026-09-01', fecha_fin: null, notas: '', activa: true },
      { id: 'h0', empleado_id: 'e5', empleado_nombre: 'Jorge Huamán', fecha_inicio: '2025-01-10', fecha_fin: '2026-09-01', notas: 'Traspaso: cambio de puesto', activa: false },
    ]);
    await montar(HistorialCuentaDialog, { cuenta: CUENTA });
    expect(insforgeApi.historialCuenta).toHaveBeenCalledWith('cu9');
    const filas = [...dialogo().querySelectorAll('[data-libro] tbody tr')].map((f) => f.querySelector('td:nth-child(2)').textContent.trim());
    expect(filas).toEqual(['Asignada', 'Traspasada', 'Asignada']);
    expect(dialogo().querySelector('a[href="/empleados/e2"]')).not.toBeNull();
    // Sin línea de tiempo con puntos ni riel vertical.
    expect(dialogo().querySelector('ol')).toBeNull();
    expect(dialogo().querySelector('.rounded-full')).toBeNull();
  });

  it('sin historial deja la fila vacía del libro', async () => {
    insforgeApi.historialCuenta.mockResolvedValue([]);
    await montar(HistorialCuentaDialog, { cuenta: CUENTA });
    expect(dialogo().querySelector('[data-libro-vacio]').textContent).toContain('Sin titulares registrados');
  });

  it('un fallo de lectura se muestra traducido', async () => {
    insforgeApi.historialCuenta.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    await montar(HistorialCuentaDialog, { cuenta: CUENTA });
    expect(dialogo().querySelector('[role="alert"]').textContent).toContain('No tiene permiso');
  });
});

describe('CuentaForm sobre AppDialog', () => {
  async function llenar() {
    const w = await montar(CuentaForm, { cuenta: null, empleadoId: 'e1' });
    dialogo().querySelector('select').value = 'gmail';
    dialogo().querySelector('select').dispatchEvent(new Event('change', { bubbles: true }));
    await escribir(dialogo().querySelector('input[type="text"]'), 'nuevo@materen.pe');
    return w;
  }

  it('crea la cuenta por el store (RPC) y avisa con `cerrar(true)`', async () => {
    const w = await llenar();
    expect(dialogo().textContent).toContain('Nueva cuenta');
    boton('Guardar').click();
    await espera();
    expect(insforgeApi.createCuenta).toHaveBeenCalledWith(expect.objectContaining({ plataforma_id: 'gmail', usuario: 'nuevo@materen.pe', empleado_id: 'e1' }));
    await espera(500);
    expect(w.emitted('cerrar')[0]).toEqual([true]);
  });

  it('un usuario duplicado se explica en español y no cierra', async () => {
    insforgeApi.createCuenta.mockRejectedValue({ code: '23505', message: 'duplicate key value violates unique constraint "uq_cuentas_usuario_plataforma"' });
    const w = await llenar();
    boton('Guardar').click();
    await espera(20);
    expect(dialogo().textContent).toContain('Ya existe una cuenta registrada con este usuario en esta plataforma');
    expect(w.emitted('cerrar')).toBeUndefined();
  });

  it('al editar, la contraseña no se precarga: vacío significa "mantener la actual"', async () => {
    await montar(CuentaForm, {
      cuenta: { id: 'cu9', plataforma_id: 'gmail', usuario: 'obra@materen.pe', url: '', notas: '', tipo_cuenta: 'reutilizable' },
      empleadoId: 'e1',
    });
    expect(dialogo().textContent).toContain('Editar cuenta');
    expect(dialogo().querySelector('input[autocomplete="new-password"]').value).toBe('');
  });
});
