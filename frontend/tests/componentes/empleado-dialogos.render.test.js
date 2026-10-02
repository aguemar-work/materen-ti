// @vitest-environment happy-dom
//
// Diálogos del ciclo de vida del empleado (migración 102), montados de verdad
// sobre AppDialog (primevue/dialog real): Suspender (motivo obligatorio),
// Reactivar (motivo opcional), Revisar accesos (nota opcional), Reingresar
// (datos opcionales: solo viajan los que cambian) y Dar de baja (resumen,
// motivo opcional y, al terminar, el RESULTADO real de la RPC: la solicitud de
// baja con sus pasos hechos y pendientes, cada pendiente con su enlace). Se mockea solo api/insforge.js; los stores, el router y la capa de
// traducción de errores son reales.
//
// Dialog se teletransporta a <body> después de su propio mounted(): se busca
// con querySelector sobre el documento. `cerrado` llega cuando termina la
// animación o, a más tardar, por el temporizador de respaldo de 400 ms.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import EmpleadoMotivoDialog from '../../src/modules/empleados/EmpleadoMotivoDialog.vue';
import ReingresarEmpleadoDialog from '../../src/modules/empleados/ReingresarEmpleadoDialog.vue';
import BajaEmpleadoModal from '../../src/modules/empleados/BajaEmpleadoModal.vue';
import { MENSAJE_SIN_PERMISO } from '../../src/api/erroresDb.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    suspenderEmpleado: vi.fn(),
    reactivarEmpleado: vi.fn(),
    reingresarEmpleado: vi.fn(),
    registrarRevisionAccesos: vi.fn(),
    bajaEmpleado: vi.fn(),
    resumenBaja: vi.fn(),
    listEmpresas: vi.fn(),
    listAreasObras: vi.fn(),
    listUbicaciones: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

// Lo que devuelve `bajaEmpleado` desde la migración 108: la solicitud de baja con
// los pasos REALES (cerrar accesos ya hecho; el equipo, pendiente).
const SOLICITUD_BAJA = {
  id: 's1', codigo: 'SOL-0007',
  pasos: [
    { id: 'p1', orden: 1, clave: 'cerrar_accesos', label: 'Cerrar los accesos y los asientos de licencia', obligatorio: true, estado: 'hecho', nota: '1 asignaciones de cuenta y 0 de licencia cerradas.', objetivo_id: null, referencia_tipo: null, modulo: 'empleados' },
    { id: 'p2', orden: 3, clave: 'devolver_equipo', label: 'Recuperar el equipo CEL-001 · Samsung A34', obligatorio: true, estado: 'pendiente', nota: '', objetivo_id: 'ae1', referencia_tipo: 'equipo', modulo: 'equipos' },
  ],
};

const EMPLEADO = {
  id: 'e1', nombres: 'Pedro', apellidos: 'Ticona Apaza', estado: 'Activo', cargo: 'Almacenero',
  empresa_id: 'emp1', area_obra_id: 'ao1', ubicacion_id: 'ub1',
};

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
const textarea = () => dialogo().querySelector('textarea');
const boton = (texto) => [...dialogo().querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(texto));
async function escribir(el, valor) {
  el.value = valor;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await espera();
}
async function cerrada(w) {
  await espera(500);
  return w.emitted('cerrar');
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.suspenderEmpleado.mockResolvedValue({ ...EMPLEADO, estado: 'Suspendido' });
  insforgeApi.reactivarEmpleado.mockResolvedValue({ ...EMPLEADO, estado: 'Activo' });
  insforgeApi.reingresarEmpleado.mockResolvedValue({ ...EMPLEADO, estado: 'Activo' });
  insforgeApi.registrarRevisionAccesos.mockResolvedValue({ id: 'rev1' });
  insforgeApi.bajaEmpleado.mockResolvedValue({ empleado: { ...EMPLEADO, estado: 'Inactivo' }, resumen: {}, solicitud: SOLICITUD_BAJA });
  insforgeApi.resumenBaja.mockResolvedValue({
    cuentas: [{ asignacion_id: 'a1', cuenta_id: 'c1', usuario: 'pticona', tipo_cuenta: 'personal', plataforma: 'Gmail' }],
    licencias: [],
    equipos: [{ asignacion_id: 'ae1', equipo_id: 'q1', codigo: 'CEL-001', tipo: 'Celular', marca: 'Samsung', modelo: 'A34' }],
  });
  insforgeApi.listEmpresas.mockResolvedValue([{ id: 'emp1', nombre: 'Materen' }, { id: 'emp2', nombre: 'Los Andes' }]);
  insforgeApi.listAreasObras.mockResolvedValue([{ id: 'ao1', nombre: 'Logística' }, { id: 'ao2', nombre: 'TI' }]);
  insforgeApi.listUbicaciones.mockResolvedValue([{ id: 'ub1', nombre: 'Almacén' }]);
});

afterEach(() => {
  while (montados.length) {
    try { montados.pop().unmount(); } catch { /* ya desmontado */ }
  }
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('Suspender — motivo obligatorio', () => {
  it('no deja confirmar sin motivo y avisa en el campo', async () => {
    await montar(EmpleadoMotivoDialog, { accion: 'suspender', empleado: EMPLEADO });
    expect(dialogo().textContent).toContain('Suspender empleado');
    expect(dialogo().textContent).toContain('Pedro Ticona Apaza');
    expect(textarea().required).toBe(true);
    expect(boton('Suspender').disabled).toBe(true);
    await escribir(textarea(), '   ');
    expect(boton('Suspender').disabled).toBe(true);
    expect(insforgeApi.suspenderEmpleado).not.toHaveBeenCalled();
  });

  it('con motivo llama a la RPC y cierra avisando que hubo cambio', async () => {
    const w = await montar(EmpleadoMotivoDialog, { accion: 'suspender', empleado: EMPLEADO });
    await escribir(textarea(), 'Investigación interna');
    expect(boton('Suspender').disabled).toBe(false);
    boton('Suspender').click();
    await espera();
    expect(insforgeApi.suspenderEmpleado).toHaveBeenCalledWith('e1', 'Investigación interna');
    expect((await cerrada(w))[0]).toEqual([true]);
  });

  it('limita el motivo a 500 caracteres y los cuenta', async () => {
    await montar(EmpleadoMotivoDialog, { accion: 'suspender', empleado: EMPLEADO });
    expect(textarea().getAttribute('maxlength')).toBe('500');
    await escribir(textarea(), 'abc');
    expect(dialogo().textContent).toContain('3/500');
  });

  it('un 42501 se muestra como "sin permiso" y el diálogo sigue abierto', async () => {
    insforgeApi.suspenderEmpleado.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    const w = await montar(EmpleadoMotivoDialog, { accion: 'suspender', empleado: EMPLEADO });
    await escribir(textarea(), 'x');
    boton('Suspender').click();
    await espera(20);
    expect(dialogo().textContent).toContain(MENSAJE_SIN_PERMISO);
    expect(dialogo().querySelector('[role="alert"]')).not.toBeNull();
    expect(w.emitted('cerrar')).toBeUndefined();
  });

  it('un rechazo de negocio (P0001) conserva el texto del servidor', async () => {
    insforgeApi.suspenderEmpleado.mockRejectedValue({ code: 'P0001', message: 'Solo se puede suspender a un empleado Activo (estado actual: Inactivo).' });
    await montar(EmpleadoMotivoDialog, { accion: 'suspender', empleado: EMPLEADO });
    await escribir(textarea(), 'x');
    boton('Suspender').click();
    await espera(20);
    expect(dialogo().textContent).toContain('Solo se puede suspender a un empleado Activo');
  });
});

describe('Reactivar — motivo opcional', () => {
  it('se puede confirmar sin motivo (null) y con motivo', async () => {
    const w = await montar(EmpleadoMotivoDialog, { accion: 'reactivar', empleado: { ...EMPLEADO, estado: 'Suspendido' } });
    expect(dialogo().textContent).toContain('Reactivar empleado');
    expect(textarea().required).toBe(false);
    expect(boton('Reactivar').disabled).toBe(false);
    boton('Reactivar').click();
    await espera();
    expect(insforgeApi.reactivarEmpleado).toHaveBeenCalledWith('e1', null);
    expect((await cerrada(w))[0]).toEqual([true]);
  });

  it('el motivo escrito viaja a la RPC', async () => {
    await montar(EmpleadoMotivoDialog, { accion: 'reactivar', empleado: { ...EMPLEADO, estado: 'Inactivo' } });
    await escribir(textarea(), 'Caso cerrado sin sanción');
    boton('Reactivar').click();
    await espera();
    expect(insforgeApi.reactivarEmpleado).toHaveBeenCalledWith('e1', 'Caso cerrado sin sanción');
  });

  it('explica que la fecha de alta no cambia y manda a "Reingresar" para una etapa nueva', async () => {
    await montar(EmpleadoMotivoDialog, { accion: 'reactivar', empleado: { ...EMPLEADO, estado: 'Inactivo' } });
    expect(dialogo().textContent).toContain('La fecha de alta no cambia');
    expect(dialogo().textContent).toContain('Reingresar');
  });
});

describe('Revisar accesos — nota opcional', () => {
  it('registra la revisión con el conteo de lo que había y la nota', async () => {
    const w = await montar(EmpleadoMotivoDialog, {
      accion: 'revisar', empleado: EMPLEADO, resumen: { cuentas: 2, equipos: 1, licencias: 0 },
    });
    expect(dialogo().textContent).toContain('2 cuentas · 1 equipo · 0 licencias');
    await escribir(textarea(), 'Sin observaciones');
    boton('Registrar revisión').click();
    await espera();
    expect(insforgeApi.registrarRevisionAccesos).toHaveBeenCalledWith('e1', { cuentas: 2, equipos: 1, licencias: 0 }, 'Sin observaciones');
    expect((await cerrada(w))[0]).toEqual([true]);
  });

  it('la nota es opcional y admite hasta 1000 caracteres', async () => {
    await montar(EmpleadoMotivoDialog, { accion: 'revisar', empleado: EMPLEADO, resumen: {} });
    expect(textarea().getAttribute('maxlength')).toBe('1000');
    boton('Registrar revisión').click();
    await espera();
    expect(insforgeApi.registrarRevisionAccesos).toHaveBeenCalledWith('e1', {}, null);
  });
});

describe('Reingresar — datos opcionales', () => {
  const select = (n) => dialogo().querySelectorAll('select')[n];

  it('sin cambios manda un objeto vacío: todo se conserva', async () => {
    const w = await montar(ReingresarEmpleadoDialog, { empleado: { ...EMPLEADO, estado: 'Inactivo' } });
    expect(dialogo().textContent).toContain('vuelve a Activo con la fecha de alta de hoy');
    boton('Reingresar').click();
    await espera();
    expect(insforgeApi.reingresarEmpleado).toHaveBeenCalledWith('e1', {});
    expect((await cerrada(w))[0]).toEqual([true]);
  });

  it('solo viajan las claves que cambiaron (cargo y área), incluida la que se limpia', async () => {
    await montar(ReingresarEmpleadoDialog, { empleado: { ...EMPLEADO, estado: 'Inactivo' } });
    await escribir(dialogo().querySelector('input[type="text"]'), ' Jefe de Almacén ');
    select(1).value = 'ao2';
    select(1).dispatchEvent(new Event('change', { bubbles: true }));
    select(2).value = '';
    select(2).dispatchEvent(new Event('change', { bubbles: true }));
    await espera();
    boton('Reingresar').click();
    await espera();
    expect(insforgeApi.reingresarEmpleado).toHaveBeenCalledWith('e1', { cargo: 'Jefe de Almacén', area_obra_id: 'ao2', ubicacion_id: '' });
  });

  it('la empresa es obligatoria: sin ella no se puede confirmar', async () => {
    await montar(ReingresarEmpleadoDialog, { empleado: { ...EMPLEADO, estado: 'Inactivo', empresa_id: '' } });
    expect(boton('Reingresar').disabled).toBe(true);
  });

  it('el rechazo del servidor (solo desde Inactivo) se muestra y no cierra', async () => {
    insforgeApi.reingresarEmpleado.mockRejectedValue({ code: 'P0001', message: 'Solo se puede reingresar a un empleado Inactivo (estado actual: Activo).' });
    const w = await montar(ReingresarEmpleadoDialog, { empleado: { ...EMPLEADO, estado: 'Inactivo' } });
    boton('Reingresar').click();
    await espera(20);
    expect(dialogo().textContent).toContain('Solo se puede reingresar a un empleado Inactivo');
    expect(w.emitted('cerrar')).toBeUndefined();
  });
});

describe('Dar de baja — resumen, motivo y equipos pendientes', () => {
  it('muestra qué hace la baja y los equipos como pendientes con enlace a su hoja de vida', async () => {
    await montar(BajaEmpleadoModal, { empleado: EMPLEADO });
    const texto = dialogo().textContent.replace(/\s+/g, ' ');
    expect(texto).toContain('Dar de baja a Pedro Ticona Apaza');
    expect(texto).toContain('Elimina 1 cuenta personal');
    expect(texto).toContain('Recuperar 1 equipo');
    const enlace = dialogo().querySelector('a[href="/equipos/q1"]');
    expect(enlace.textContent).toContain('CEL-001');
    expect(texto).toContain('registre la devolución en la hoja de vida de cada equipo');
  });

  it('el motivo es opcional (máx. 500), se ve contado y viaja a la baja', async () => {
    const w = await montar(BajaEmpleadoModal, { empleado: EMPLEADO });
    expect(textarea().getAttribute('maxlength')).toBe('500');
    expect(textarea().required).toBe(false);
    await escribir(textarea(), 'Término de contrato');
    expect(dialogo().textContent).toContain('19/500');
    boton('Confirmar baja').click();
    await espera(50);
    expect(insforgeApi.bajaEmpleado).toHaveBeenCalledWith('e1', 'Término de contrato');
    // El diálogo se queda mostrando el resultado; se avisa al padre al cerrarlo.
    expect(w.emitted('cerrar')).toBeUndefined();
    boton('Cerrar').click();
    expect((await cerrada(w))[0]).toEqual([true]);
  });

  it('sin motivo la baja viaja con null', async () => {
    await montar(BajaEmpleadoModal, { empleado: EMPLEADO });
    boton('Confirmar baja').click();
    await espera(50);
    expect(insforgeApi.bajaEmpleado).toHaveBeenCalledWith('e1', null);
  });

  it('el resultado es la solicitud de baja de la RPC: lo hecho, lo pendiente (reloj) y su enlace, nunca el equipo como hecho', async () => {
    await montar(BajaEmpleadoModal, { empleado: EMPLEADO });
    boton('Confirmar baja').click();
    await espera(50);
    const texto = dialogo().textContent.replace(/\s+/g, ' ');
    expect(texto).toContain('Baja registrada · Pedro Ticona Apaza');
    const solicitud = dialogo().querySelector('a[href="/solicitudes/s1"]');
    expect(solicitud.textContent).toContain('SOL-0007');
    expect(texto).toContain('1 de 2 pasos hechos');
    const pasos = [...dialogo().querySelectorAll('ol li')];
    expect(pasos.map((p) => p.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Hecho: Cerrar los accesos y los asientos de licencia 1 asignaciones de cuenta y 0 de licencia cerradas.',
      'Pendiente: Recuperar el equipo CEL-001 · Samsung A34 Abrir equipo',
    ]);
    expect(pasos[0].querySelector('i.ti-circle-check')).not.toBeNull();
    const equipo = pasos[1];
    expect(equipo.querySelector('i.ti-clock')).not.toBeNull();
    expect(equipo.querySelector('i.ti-circle-check')).toBeNull();
    expect(equipo.querySelector('a[href="/equipos/q1"]')).not.toBeNull();
    // Ya no hay checklist animado ni "Confirmar baja": solo ver la solicitud o cerrar.
    expect(boton('Confirmar baja')).toBeUndefined();
    expect([...dialogo().querySelectorAll('a')].some((a) => a.textContent.trim() === 'Ver solicitud')).toBe(true);
  });

  it('si el backend aún no devuelve la solicitud (sin la 108), la baja igual se confirma con un aviso', async () => {
    insforgeApi.bajaEmpleado.mockResolvedValue({ empleado: { ...EMPLEADO, estado: 'Inactivo' }, resumen: {}, solicitud: null });
    const w = await montar(BajaEmpleadoModal, { empleado: EMPLEADO });
    boton('Confirmar baja').click();
    await espera(50);
    expect(dialogo().textContent).toContain('La baja quedó registrada');
    expect(dialogo().querySelector('a[href^="/solicitudes/"]')).toBeNull();
    boton('Cerrar').click();
    expect((await cerrada(w))[0]).toEqual([true]);
  });

  it('un 42501 vuelve al resumen con el mensaje de "sin permiso"', async () => {
    insforgeApi.bajaEmpleado.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    const w = await montar(BajaEmpleadoModal, { empleado: EMPLEADO });
    boton('Confirmar baja').click();
    await espera(50);
    expect(dialogo().textContent).toContain(MENSAJE_SIN_PERMISO);
    expect(boton('Confirmar baja')).toBeTruthy();
    expect(w.emitted('cerrar')).toBeUndefined();
  });

  it('Cancelar cierra sin baja ni cambio', async () => {
    const w = await montar(BajaEmpleadoModal, { empleado: EMPLEADO });
    boton('Cancelar').click();
    await espera(500);
    expect(insforgeApi.bajaEmpleado).not.toHaveBeenCalled();
    expect(w.emitted('cerrar')[0]).toEqual([false]);
  });
});
