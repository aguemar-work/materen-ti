// @vitest-environment happy-dom
//
// «Nueva solicitud» (migración 108) sobre AppDialog real: tipo + persona (nueva
// o ya registrada, solo en el alta) + de dónde vino el pedido + nota. Las tres
// formas de llegar: desde Solicitudes, desde el expediente (persona fija) y
// desde un ticket (convertir). Solo api/insforge.js está mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import SolicitudForm from '../../src/modules/solicitudes/SolicitudForm.vue';
import BuscadorCombo from '../../src/components/shared/BuscadorCombo.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    crearSolicitud: vi.fn(),
    convertirTicketEnSolicitud: vi.fn(),
    listEmpleados: vi.fn(),
    listEmpresas: vi.fn(),
    listAreasObras: vi.fn(),
    listUbicaciones: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const EMPLEADOS = [
  { id: 'e1', nombres: 'Rosa', apellidos: 'Quispe', dni: '45871236', estado: 'Activo', cargo: 'Asistente' },
  { id: 'e6', nombres: 'Pedro', apellidos: 'Ticona', dni: '46325874', estado: 'Inactivo', cargo: 'Almacenero' },
  { id: 'e8', nombres: 'Miguel', apellidos: 'Rojas', dni: '44785213', estado: 'Suspendido', cargo: 'SSOMA' },
];

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const montados = [];

async function montar(props = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:resto(.*)*', component: { template: '<div />' } }] });
  router.push('/');
  await router.isReady();
  const w = mount(SolicitudForm, {
    props,
    attachTo: document.body,
    global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { transition: false } },
  });
  montados.push(w);
  for (let i = 0; i < 5; i += 1) await espera();
  return w;
}

const dialogo = () => document.querySelector('[role="dialog"]');
const campo = (rotulo) => {
  const label = [...dialogo().querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(rotulo));
  return label ? document.getElementById(label.getAttribute('for')) : null;
};
const boton = (texto) => [...dialogo().querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(texto));
async function escribir(el, valor) {
  el.value = valor;
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  await espera();
}
async function completarPersona() {
  await escribir(campo('Nombres'), 'Nueva');
  await escribir(campo('Apellidos'), 'Persona');
  await escribir(campo('DNI'), '70123456');
  await escribir(campo('Empresa'), 'emp1');
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.crearSolicitud.mockResolvedValue({ id: 's9', codigo: 'SOL-0009' });
  insforgeApi.convertirTicketEnSolicitud.mockResolvedValue({ id: 's10', codigo: 'SOL-0010' });
  insforgeApi.listEmpleados.mockResolvedValue(EMPLEADOS);
  insforgeApi.listEmpresas.mockResolvedValue([{ id: 'emp1', nombre: 'Materen' }]);
  insforgeApi.listAreasObras.mockResolvedValue([{ id: 'ao1', nombre: 'Logística' }]);
  insforgeApi.listUbicaciones.mockResolvedValue([{ id: 'ub1', nombre: 'Almacén' }]);
});

afterEach(() => {
  while (montados.length) {
    try { montados.pop().unmount(); } catch { /* ya desmontado */ }
  }
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('SolicitudForm — alta con persona nueva', () => {
  it('arranca en «Alta de empleado», persona nueva y origen RRHH; no ofrece la baja como tipo', async () => {
    await montar();
    expect(dialogo().textContent).toContain('Nueva solicitud');
    expect(campo('Tipo de solicitud').value).toBe('alta_empleado');
    expect([...campo('Tipo de solicitud').options].map((o) => o.value)).not.toContain('baja_empleado');
    expect(campo('Nombres')).not.toBeNull();
    expect(campo('Quién lo pidió').value).toBe('rrhh_correo');
    expect(boton('Persona nueva').getAttribute('aria-pressed')).toBe('true');
  });

  it('no deja abrir la solicitud hasta tener nombres, apellidos, DNI de 8 dígitos y empresa', async () => {
    await montar();
    const abrir = () => boton('Abrir solicitud');
    expect(abrir().disabled).toBe(true);
    await escribir(campo('Nombres'), 'Nueva');
    await escribir(campo('Apellidos'), 'Persona');
    await escribir(campo('DNI'), '7012');
    await escribir(campo('Empresa'), 'emp1');
    expect(abrir().disabled).toBe(true); // DNI corto
    await escribir(campo('DNI'), '70123456');
    expect(abrir().disabled).toBe(false);
  });

  it('abre la solicitud con la persona NUEVA (la RPC la crea en la misma transacción) y avisa con la fila creada', async () => {
    const w = await montar();
    await completarPersona();
    await escribir(campo('Cargo'), 'residente');
    await escribir(campo('Nota'), 'Pedido de RRHH por correo del 30/09');
    boton('Abrir solicitud').click();
    await espera(30);
    expect(insforgeApi.crearSolicitud).toHaveBeenCalledTimes(1);
    const arg = insforgeApi.crearSolicitud.mock.calls[0][0];
    expect(arg).toMatchObject({ tipo: 'alta_empleado', empleadoId: null, nota: 'Pedido de RRHH por correo del 30/09', origen: 'rrhh_correo' });
    expect(arg.empleado).toMatchObject({ nombres: 'Nueva', apellidos: 'Persona', dni: '70123456', empresa_id: 'emp1', cargo: 'residente' });
    await espera(500);
    expect(w.emitted('cerrar')[0]).toEqual([{ id: 's9', codigo: 'SOL-0009' }]);
  });

  it('un rechazo del servidor (p. ej. DNI repetido) se muestra en el formulario y no cierra ni pierde lo escrito', async () => {
    insforgeApi.crearSolicitud.mockRejectedValue({ code: 'P0001', message: 'Ya existe un empleado con ese DNI.' });
    const w = await montar();
    await completarPersona();
    boton('Abrir solicitud').click();
    await espera(30);
    expect(dialogo().querySelector('[role="alert"]').textContent).toContain('Ya existe un empleado con ese DNI.');
    expect(campo('Nombres').value).toBe('Nueva');
    expect(w.emitted('cerrar')).toBeUndefined();
  });

  it('un 42501 sale como «sin permiso»', async () => {
    insforgeApi.crearSolicitud.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    await montar();
    await completarPersona();
    boton('Abrir solicitud').click();
    await espera(30);
    expect(dialogo().textContent).toContain('No tiene permiso');
  });
});

describe('SolicitudForm — persona ya registrada', () => {
  it('«Ya registrada» cambia los campos de la persona nueva por el buscador de empleados', async () => {
    const w = await montar();
    await boton('Ya registrada').click();
    await espera();
    expect(campo('Nombres')).toBeNull();
    expect(w.findComponent(BuscadorCombo).exists()).toBe(true);
  });

  it('solo ofrece empleados ACTIVOS (el servidor rechaza al resto), salvo en la devolución de equipo', async () => {
    const w = await montar();
    await boton('Ya registrada').click();
    await espera();
    expect(w.findComponent(BuscadorCombo).props('items').map((e) => e.id)).toEqual(['e1']);
    await escribir(campo('Tipo de solicitud'), 'devolucion_equipo');
    expect(w.findComponent(BuscadorCombo).props('items').map((e) => e.id).sort()).toEqual(['e1', 'e6', 'e8']);
  });

  it('para un tipo distinto del alta no hay «Persona nueva» y el origen vuelve a «Otro»', async () => {
    await montar();
    await escribir(campo('Tipo de solicitud'), 'licencia');
    expect(dialogo().textContent).not.toContain('Persona nueva');
    expect(campo('Quién lo pidió').value).toBe('otro');
    expect(boton('Abrir solicitud').disabled).toBe(true); // falta elegir a la persona
  });
});

describe('SolicitudForm — desde el expediente y desde un ticket', () => {
  it('con la persona fija no hay selector: muestra su nombre y abre la solicitud para ella', async () => {
    const w = await montar({ empleado: EMPLEADOS[0] });
    expect(dialogo().textContent).toContain('Rosa Quispe');
    expect(w.findComponent(BuscadorCombo).exists()).toBe(false);
    expect(campo('Nombres')).toBeNull();
    expect(campo('Tipo de solicitud').value).toBe('acceso_nuevo');
    expect(insforgeApi.listEmpleados).not.toHaveBeenCalled(); // no hace falta la lista
    await escribir(campo('Tipo de solicitud'), 'entrega_equipo');
    boton('Abrir solicitud').click();
    await espera(30);
    expect(insforgeApi.crearSolicitud).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'entrega_equipo', empleadoId: 'e1', empleado: null }));
  });

  it('al convertir un ticket usa la RPC de conversión con la persona del ticket, sin pedir el origen', async () => {
    const w = await montar({ ticket: { id: 't1', codigo: 'TCK-0281', empleadoId: 'e1', empleadoNombre: 'Rosa Quispe' } });
    expect(dialogo().textContent).toContain('Convertir TCK-0281 en solicitud');
    expect(dialogo().textContent).toContain('Rosa Quispe');
    expect(campo('Quién lo pidió')).toBeNull();
    await escribir(campo('Nota'), 'AutoCAD 2026');
    boton('Abrir solicitud').click();
    await espera(30);
    expect(insforgeApi.convertirTicketEnSolicitud).toHaveBeenCalledWith('t1', 'acceso_nuevo', 'AutoCAD 2026');
    expect(insforgeApi.crearSolicitud).not.toHaveBeenCalled();
    await espera(500);
    expect(w.emitted('cerrar')[0][0]).toMatchObject({ codigo: 'SOL-0010' });
  });
});

describe('SolicitudForm — cancelar', () => {
  it('Cancelar sin cambios cierra directo avisando que no se creó nada', async () => {
    const w = await montar();
    boton('Cancelar').click();
    await espera(500);
    expect(insforgeApi.crearSolicitud).not.toHaveBeenCalled();
    expect(w.emitted('cerrar')[0]).toEqual([false]);
  });

  it('con datos escritos pide confirmar antes de descartarlos', async () => {
    const w = await montar();
    await escribir(campo('Nombres'), 'Nueva');
    boton('Cancelar').click();
    await espera(50);
    expect(document.body.textContent).toContain('Cambios sin guardar');
    expect(w.emitted('cerrar')).toBeUndefined();
  });
});
