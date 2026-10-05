// @vitest-environment happy-dom
//
// «Nuevo cambio» (migración 107) sobre AppDialog real: tipo, servicio, riesgo,
// descripción, plan de retroceso y ventana. Lo que se pide depende del tipo
// (estándar sin plan, emergencia sin ventana) y el botón de enviar dice qué
// falta. Guardar borrador exige solo título, servicio y descripción. Solo
// api/insforge.js está mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import CambioForm from '../../src/modules/cambios/CambioForm.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    crearCambio: vi.fn(),
    actualizarCambio: vi.fn(),
    transicionarCambio: vi.fn(),
    getCambio: vi.fn(),
    listEventosCambio: vi.fn(),
    ticketsDeCambio: vi.fn(),
    listServicios: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const SERVICIOS = [
  { id: 'correo', nombre: 'Correo corporativo', criticidad: 'alta' },
  { id: 'red', nombre: 'Internet y red', criticidad: 'critica' },
];

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const montados = [];

async function montar(props = {}) {
  const w = mount(CambioForm, {
    props,
    attachTo: document.body,
    global: { plugins: [[PrimeVue, { unstyled: true }]], stubs: { transition: false } },
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
async function completarBorrador() {
  await escribir(campo('Título'), '  Cambio del router principal ');
  await escribir(campo('Servicio afectado'), 'red');
  await escribir(campo('Descripción'), 'Reemplazar el router de la sede');
}
async function completarTodo() {
  await completarBorrador();
  await escribir(campo('Plan de retroceso'), 'Volver al router anterior');
  await escribir(campo('Inicio de la ventana'), '2026-10-03T08:00');
  await escribir(campo('Fin de la ventana'), '2026-10-03T10:00');
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listServicios.mockResolvedValue(SERVICIOS);
  insforgeApi.crearCambio.mockResolvedValue({ id: 'c9', codigo: 'CHG-0009' });
  insforgeApi.actualizarCambio.mockResolvedValue({ id: 'c1', codigo: 'CHG-0001' });
  insforgeApi.transicionarCambio.mockResolvedValue({ id: 'c1', codigo: 'CHG-0001', estado: 'solicitado' });
  insforgeApi.getCambio.mockResolvedValue(null);
  insforgeApi.listEventosCambio.mockResolvedValue([]);
  insforgeApi.ticketsDeCambio.mockResolvedValue([]);
});

afterEach(() => {
  while (montados.length) {
    try { montados.pop().unmount(); } catch { /* ya desmontado */ }
  }
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('CambioForm — nuevo cambio', () => {
  it('arranca como cambio normal de riesgo medio, con los servicios del catálogo y la ayuda del tipo', async () => {
    await montar();
    expect(dialogo().textContent).toContain('Nuevo cambio');
    expect([...campo('Servicio afectado').options].map((o) => o.value)).toEqual(['', 'correo', 'red']);
    expect(campo('Riesgo').value).toBe('medio');
    expect(dialogo().querySelector('[data-ayuda-tipo]').textContent).toContain('lo aprueba un jefe');
    expect(boton('Normal').getAttribute('aria-pressed')).toBe('true');
    expect(boton('Enviar a aprobación')).toBeTruthy();
  });

  it('sin datos no se puede guardar ni enviar, y el formulario dice qué falta', async () => {
    await montar();
    expect(boton('Guardar borrador').disabled).toBe(true);
    expect(boton('Enviar a aprobación').disabled).toBe(true);
    expect(dialogo().querySelector('[data-falta]').textContent).toContain('título, servicio y descripción');
  });

  it('guardar borrador pide solo título, servicio y descripción; enviar además plan y ventana', async () => {
    await montar();
    await completarBorrador();
    expect(boton('Guardar borrador').disabled).toBe(false);
    expect(boton('Enviar a aprobación').disabled).toBe(true);
    const falta = dialogo().querySelector('[data-falta]').textContent;
    expect(falta).toContain('el plan de retroceso');
    expect(falta).toContain('la ventana de ejecución');
    await escribir(campo('Plan de retroceso'), 'Volver al router anterior');
    expect(boton('Enviar a aprobación').disabled).toBe(true); // falta la ventana
    await escribir(campo('Inicio de la ventana'), '2026-10-03T10:00');
    await escribir(campo('Fin de la ventana'), '2026-10-03T08:00');
    expect(boton('Enviar a aprobación').disabled).toBe(true); // fin antes del inicio
    await escribir(campo('Fin de la ventana'), '2026-10-03T12:00');
    expect(boton('Enviar a aprobación').disabled).toBe(false);
    expect(dialogo().querySelector('[data-falta]')).toBeNull();
  });

  it('«Guardar borrador» llama a la RPC sin enviar y cierra avisando con la fila creada', async () => {
    const w = await montar();
    await completarBorrador();
    boton('Guardar borrador').click();
    await espera(30);
    expect(insforgeApi.crearCambio).toHaveBeenCalledTimes(1);
    expect(insforgeApi.crearCambio.mock.calls[0][0]).toMatchObject({
      titulo: '  Cambio del router principal ', tipo: 'normal', riesgo: 'medio', servicioId: 'red', descripcion: 'Reemplazar el router de la sede', enviar: false,
    });
    await espera(500);
    expect(w.emitted('cerrar')[0][0]).toMatchObject({ id: 'c9', codigo: 'CHG-0009' });
  });

  it('«Enviar a aprobación» manda todo con enviar=true y las horas como ISO', async () => {
    await montar();
    await completarTodo();
    boton('Enviar a aprobación').click();
    await espera(30);
    const arg = insforgeApi.crearCambio.mock.calls[0][0];
    expect(arg.enviar).toBe(true);
    expect(arg.planRetroceso).toBe('Volver al router anterior');
    expect(new Date(arg.ventanaInicio).getHours()).toBe(8);
    expect(new Date(arg.ventanaFin).getHours()).toBe(10);
    expect(arg.ventanaInicio).toMatch(/Z$/);
  });

  it('estándar: no pide plan de retroceso y el botón dice «Autorizar cambio»', async () => {
    await montar();
    await completarBorrador();
    boton('Estándar').click();
    await espera();
    expect(dialogo().querySelector('[data-ayuda-tipo]').textContent).toContain('no necesita aprobación');
    expect(campo('Plan de retroceso').getAttribute('placeholder')).toContain('Opcional');
    expect(boton('Enviar a aprobación')).toBeUndefined();
    expect(boton('Autorizar cambio').disabled).toBe(true); // falta la ventana
    await escribir(campo('Inicio de la ventana'), '2026-10-03T08:00');
    await escribir(campo('Fin de la ventana'), '2026-10-03T09:00');
    expect(boton('Autorizar cambio').disabled).toBe(false);
  });

  it('emergencia: la ventana es opcional, pero el plan de retroceso sigue siendo obligatorio', async () => {
    await montar();
    await completarBorrador();
    boton('Emergencia').click();
    await espera();
    expect(dialogo().textContent).toContain('la ventana es opcional');
    expect(boton('Registrar y enviar').disabled).toBe(true);
    await escribir(campo('Plan de retroceso'), 'Volver al enlace de respaldo');
    expect(boton('Registrar y enviar').disabled).toBe(false);
  });

  it('una regla del servidor se muestra dentro del formulario, que sigue abierto', async () => {
    insforgeApi.crearCambio.mockRejectedValue({ code: 'P0001', message: 'El servicio indicado no existe o fue dado de baja.' });
    const w = await montar();
    await completarBorrador();
    boton('Guardar borrador').click();
    await espera(30);
    expect(dialogo().querySelector('[role="alert"]').textContent).toContain('El servicio indicado no existe');
    expect(w.emitted('cerrar')).toBeUndefined();
  });

  it('un 42501 sale como «sin permiso» y no en inglés', async () => {
    insforgeApi.crearCambio.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    await montar();
    await completarBorrador();
    boton('Guardar borrador').click();
    await espera(30);
    expect(dialogo().textContent).toContain('No tiene permiso');
  });

  it('sin servicios en el catálogo lo dice y manda a Configuración', async () => {
    insforgeApi.listServicios.mockResolvedValue([]);
    await montar();
    expect(dialogo().textContent).toContain('No hay servicios');
    expect(dialogo().textContent).toContain('Configuración');
  });
});

describe('CambioForm — editar un borrador', () => {
  const BORRADOR = {
    id: 'c1', codigo: 'CHG-0001', titulo: 'Cambio del router', tipo: 'normal', riesgo: 'alto', servicio_id: 'correo',
    descripcion: 'Linea 1\nLinea 2', plan_retroceso: 'Plan A', ventana_inicio: '2026-10-03T13:00:00Z', ventana_fin: '2026-10-03T15:00:00Z', estado: 'borrador',
  };

  it('precarga el borrador, guarda con la RPC de edición y cierra con la fila', async () => {
    const w = await montar({ cambio: BORRADOR });
    expect(dialogo().textContent).toContain('Editar CHG-0001');
    expect(campo('Título').value).toBe('Cambio del router');
    expect(campo('Servicio afectado').value).toBe('correo');
    expect(campo('Riesgo').value).toBe('alto');
    expect(campo('Descripción').value).toBe('Linea 1\nLinea 2');
    expect(campo('Plan de retroceso').value).toBe('Plan A');
    expect(boton('Guardar cambios')).toBeTruthy();
    await escribir(campo('Título'), 'Cambio del router principal');
    boton('Guardar cambios').click();
    await espera(30);
    expect(insforgeApi.actualizarCambio).toHaveBeenCalledWith('c1', expect.objectContaining({ titulo: 'Cambio del router principal', servicioId: 'correo', riesgo: 'alto' }));
    expect(insforgeApi.crearCambio).not.toHaveBeenCalled();
    expect(insforgeApi.transicionarCambio).not.toHaveBeenCalled();
    await espera(500);
    expect(w.emitted('cerrar')[0][0]).toMatchObject({ id: 'c1' });
  });

  it('«Enviar a aprobación» desde la edición guarda y luego solicita; un estándar se autoriza', async () => {
    await montar({ cambio: BORRADOR });
    boton('Enviar a aprobación').click();
    await espera(30);
    expect(insforgeApi.actualizarCambio).toHaveBeenCalledTimes(1);
    expect(insforgeApi.transicionarCambio).toHaveBeenCalledWith('c1', 'solicitado', null);
    montados.pop().unmount();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    insforgeApi.listServicios.mockResolvedValue(SERVICIOS);
    insforgeApi.actualizarCambio.mockResolvedValue({ id: 'c1' });
    insforgeApi.transicionarCambio.mockResolvedValue({ id: 'c1' });
    insforgeApi.getCambio.mockResolvedValue(null);
    insforgeApi.listEventosCambio.mockResolvedValue([]);
    insforgeApi.ticketsDeCambio.mockResolvedValue([]);
    await montar({ cambio: { ...BORRADOR, tipo: 'estandar', plan_retroceso: '' } });
    boton('Autorizar cambio').click();
    await espera(30);
    expect(insforgeApi.transicionarCambio).toHaveBeenCalledWith('c1', 'aprobado', null);
  });
});
