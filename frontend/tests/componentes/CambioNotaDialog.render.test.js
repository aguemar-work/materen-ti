// @vitest-environment happy-dom
//
// Diálogo de la nota (migración 107): rechazar, revertir y cancelar piden motivo
// OBLIGATORIO; aprobar, implementar y cerrar lo piden opcional. Cada acción llama
// a su RPC (transicionar, aprobar o rechazar); los rechazos del servidor salen
// traducidos dentro del diálogo, que sigue abierto.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import CambioNotaDialog from '../../src/modules/cambios/CambioNotaDialog.vue';
import { accionesDeCambio } from '../../src/core/dominio-cambios.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    transicionarCambio: vi.fn(),
    aprobarCambio: vi.fn(),
    rechazarCambio: vi.fn(),
    getCambio: vi.fn(),
    listEventosCambio: vi.fn(),
    ticketsDeCambio: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const CAMBIO = (extra = {}) => ({ id: 'c1', codigo: 'CHG-0004', titulo: 'Cambio del router', tipo: 'normal', estado: 'solicitado', aprobado_por: null, ...extra });
const accion = (cambio, id) => accionesDeCambio(cambio, { esJefe: true, puedeTickets: true }).find((a) => a.id === id);

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const montados = [];

async function montar(cambio, id) {
  const w = mount(CambioNotaDialog, {
    props: { accion: accion(cambio, id), cambio },
    attachTo: document.body,
    global: { plugins: [[PrimeVue, { unstyled: true }]], stubs: { transition: false } },
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
  insforgeApi.transicionarCambio.mockResolvedValue({});
  insforgeApi.aprobarCambio.mockResolvedValue({});
  insforgeApi.rechazarCambio.mockResolvedValue({});
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

describe('CambioNotaDialog — motivo obligatorio', () => {
  it('rechazar nombra el cambio, exige motivo (≤ 1000) y no deja confirmar sin él', async () => {
    await montar(CAMBIO(), 'rechazar:rechazado');
    expect(dialogo().textContent).toContain('Rechazar');
    expect(dialogo().textContent).toContain('CHG-0004');
    expect(dialogo().textContent).toContain('Cambio del router');
    expect(dialogo().querySelector('label').textContent).toContain('Motivo del rechazo');
    expect(textarea().required).toBe(true);
    expect(textarea().getAttribute('maxlength')).toBe('1000');
    expect(boton('Rechazar').disabled).toBe(true);
    await escribir(textarea(), '   ');
    expect(boton('Rechazar').disabled).toBe(true);
    expect(insforgeApi.rechazarCambio).not.toHaveBeenCalled();
  });

  it('con motivo llama a rechazar_cambio y cierra avisando que hubo cambio', async () => {
    const w = await montar(CAMBIO(), 'rechazar:rechazado');
    await escribir(textarea(), '  La ventana coincide con el cierre contable ');
    expect(dialogo().textContent).toContain('/1000');
    boton('Rechazar').click();
    await espera(30);
    expect(insforgeApi.rechazarCambio).toHaveBeenCalledWith('c1', 'La ventana coincide con el cierre contable');
    await espera(500);
    expect(w.emitted('cerrar')[0]).toEqual([true]);
  });

  it('revertir y cancelar usan la transición de su destino con el motivo', async () => {
    await montar(CAMBIO({ estado: 'en_ejecucion' }), 'transicionar:revertido');
    expect(dialogo().querySelector('label').textContent).toContain('Por qué se revierte');
    await escribir(textarea(), 'Degradó la red de obra');
    boton('Revertir').click();
    await espera(30);
    expect(insforgeApi.transicionarCambio).toHaveBeenCalledWith('c1', 'revertido', 'Degradó la red de obra');
    montados.pop().unmount();
    document.body.innerHTML = '';

    await montar(CAMBIO({ estado: 'aprobado' }), 'transicionar:cancelado');
    expect(dialogo().querySelector('label').textContent).toContain('Motivo de la cancelación');
    expect(boton('Cancelar cambio').disabled).toBe(true);
    await escribir(textarea(), 'Ya no hace falta');
    boton('Cancelar cambio').click();
    await espera(30);
    expect(insforgeApi.transicionarCambio).toHaveBeenLastCalledWith('c1', 'cancelado', 'Ya no hace falta');
  });

  it('«un jefe puede aprobar o rechazar» del servidor sale en el diálogo, que sigue abierto', async () => {
    insforgeApi.rechazarCambio.mockRejectedValue({ code: 'P0001', message: 'Solo un jefe puede aprobar o rechazar un cambio.' });
    const w = await montar(CAMBIO(), 'rechazar:rechazado');
    await escribir(textarea(), 'No');
    boton('Rechazar').click();
    await espera(30);
    expect(dialogo().querySelector('[role="alert"]').textContent).toContain('Solo un jefe puede aprobar o rechazar');
    expect(w.emitted('cerrar')).toBeUndefined();
  });

  it('un 42501 se muestra como «sin permiso»', async () => {
    insforgeApi.rechazarCambio.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    await montar(CAMBIO(), 'rechazar:rechazado');
    await escribir(textarea(), 'x');
    boton('Rechazar').click();
    await espera(30);
    expect(dialogo().textContent).toContain('No tiene permiso');
  });

  it('«Volver» cierra sin llamar a nada', async () => {
    const w = await montar(CAMBIO(), 'rechazar:rechazado');
    boton('Volver').click();
    await espera(500);
    expect(insforgeApi.rechazarCambio).not.toHaveBeenCalled();
    expect(w.emitted('cerrar')[0]).toEqual([false]);
  });
});

describe('CambioNotaDialog — nota opcional', () => {
  it('aprobar se puede confirmar sin nota y manda null; con nota la limpia', async () => {
    await montar(CAMBIO(), 'aprobar:aprobado');
    expect(textarea().required).toBe(false);
    expect(boton('Aprobar').disabled).toBe(false);
    boton('Aprobar').click();
    await espera(30);
    expect(insforgeApi.aprobarCambio).toHaveBeenCalledWith('c1', null);
    montados.pop().unmount();
    document.body.innerHTML = '';

    await montar(CAMBIO(), 'aprobar:aprobado');
    await escribir(textarea(), '  Autorizado ');
    boton('Aprobar').click();
    await espera(30);
    expect(insforgeApi.aprobarCambio).toHaveBeenLastCalledWith('c1', 'Autorizado');
  });

  it('la aprobación a posteriori de una emergencia usa aprobar_cambio, no una transición', async () => {
    await montar(CAMBIO({ tipo: 'emergencia', estado: 'implementado' }), 'aprobar:posteriori');
    expect(dialogo().textContent).toContain('Aprobar a posteriori');
    boton('Aprobar a posteriori').click();
    await espera(30);
    expect(insforgeApi.aprobarCambio).toHaveBeenCalledWith('c1', null);
    expect(insforgeApi.transicionarCambio).not.toHaveBeenCalled();
  });

  it('implementar pide el resultado como nota opcional', async () => {
    await montar(CAMBIO({ estado: 'en_ejecucion' }), 'transicionar:implementado');
    expect(dialogo().querySelector('label').textContent).toContain('Resultado');
    await escribir(textarea(), 'Router cambiado sin incidentes');
    boton('Marcar como implementado').click();
    await espera(30);
    expect(insforgeApi.transicionarCambio).toHaveBeenCalledWith('c1', 'implementado', 'Router cambiado sin incidentes');
  });
});
