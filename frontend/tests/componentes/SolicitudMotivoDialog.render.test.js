// @vitest-environment happy-dom
//
// Diálogo del motivo (migración 108): omitir un paso o cancelar una solicitud.
// El motivo es OBLIGATORIO en las dos; el servidor repite la regla y sus
// rechazos (un paso obligatorio solo lo omite un jefe, una solicitud cerrada no
// se cancela) salen traducidos dentro del diálogo, que sigue abierto.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import SolicitudMotivoDialog from '../../src/modules/solicitudes/SolicitudMotivoDialog.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    omitirPasoSolicitud: vi.fn(),
    cancelarSolicitud: vi.fn(),
    getSolicitud: vi.fn(),
    objetivosDePasosSolicitud: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const SOLICITUD = { id: 's1', codigo: 'SOL-0012' };
const PASO = { id: 'p3', label: 'Asignar el equipo' };

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const montados = [];

async function montar(props) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:resto(.*)*', component: { template: '<div />' } }] });
  router.push('/');
  await router.isReady();
  const w = mount(SolicitudMotivoDialog, {
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

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.omitirPasoSolicitud.mockResolvedValue({});
  insforgeApi.cancelarSolicitud.mockResolvedValue({});
  insforgeApi.getSolicitud.mockResolvedValue(null);
  insforgeApi.objetivosDePasosSolicitud.mockResolvedValue({});
});

afterEach(() => {
  while (montados.length) {
    try { montados.pop().unmount(); } catch { /* ya desmontado */ }
  }
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('Omitir un paso', () => {
  it('nombra la solicitud y el paso, exige motivo (≤ 500) y no deja confirmar sin él', async () => {
    await montar({ accion: 'omitir', solicitud: SOLICITUD, paso: PASO });
    expect(dialogo().textContent).toContain('Omitir paso');
    expect(dialogo().textContent).toContain('SOL-0012');
    expect(dialogo().textContent).toContain('Asignar el equipo');
    expect(textarea().required).toBe(true);
    expect(textarea().getAttribute('maxlength')).toBe('500');
    expect(boton('Omitir paso').disabled).toBe(true);
    await escribir(textarea(), '   ');
    expect(boton('Omitir paso').disabled).toBe(true);
    expect(insforgeApi.omitirPasoSolicitud).not.toHaveBeenCalled();
  });

  it('con motivo llama a la RPC con el paso y cierra avisando que hubo cambio', async () => {
    const w = await montar({ accion: 'omitir', solicitud: SOLICITUD, paso: PASO });
    await escribir(textarea(), '  No usa equipo  ');
    expect(dialogo().textContent).toContain('17/500');
    boton('Omitir paso').click();
    await espera(30);
    expect(insforgeApi.omitirPasoSolicitud).toHaveBeenCalledWith('p3', 'No usa equipo');
    await espera(500);
    expect(w.emitted('cerrar')[0]).toEqual([true]);
  });

  it('«un paso obligatorio solo lo omite un jefe» sale en el diálogo, que sigue abierto', async () => {
    insforgeApi.omitirPasoSolicitud.mockRejectedValue({ code: 'P0001', message: 'El paso es obligatorio: solo un jefe puede omitirlo.' });
    const w = await montar({ accion: 'omitir', solicitud: SOLICITUD, paso: PASO });
    await escribir(textarea(), 'No aplica');
    boton('Omitir paso').click();
    await espera(30);
    expect(dialogo().querySelector('[role="alert"]').textContent).toContain('solo un jefe puede omitirlo');
    expect(w.emitted('cerrar')).toBeUndefined();
  });
});

describe('Cancelar la solicitud', () => {
  it('motivo obligatorio; cancela con el id de la solicitud y cierra', async () => {
    const w = await montar({ accion: 'cancelar', solicitud: SOLICITUD });
    expect(dialogo().textContent).toContain('Cancelar solicitud');
    expect(boton('Cancelar solicitud').disabled).toBe(true);
    await escribir(textarea(), 'Pedido duplicado');
    boton('Cancelar solicitud').click();
    await espera(30);
    expect(insforgeApi.cancelarSolicitud).toHaveBeenCalledWith('s1', 'Pedido duplicado');
    await espera(500);
    expect(w.emitted('cerrar')[0]).toEqual([true]);
  });

  it('«Volver» cierra sin cancelar nada', async () => {
    const w = await montar({ accion: 'cancelar', solicitud: SOLICITUD });
    boton('Volver').click();
    await espera(500);
    expect(insforgeApi.cancelarSolicitud).not.toHaveBeenCalled();
    expect(w.emitted('cerrar')[0]).toEqual([false]);
  });

  it('un 42501 se muestra como «sin permiso»', async () => {
    insforgeApi.cancelarSolicitud.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    await montar({ accion: 'cancelar', solicitud: SOLICITUD });
    await escribir(textarea(), 'x');
    boton('Cancelar solicitud').click();
    await espera(30);
    expect(dialogo().textContent).toContain('No tiene permiso');
  });
});
