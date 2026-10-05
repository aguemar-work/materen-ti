// @vitest-environment happy-dom
//
// TicketNuevoView.vue (portal público): el aviso fijo de la categoría /
// subcategoría (migración 114) aparece al elegirla, desaparece al cambiar a
// una sin aviso y el de la subcategoría gana al de la categoría. Solo
// api/ticketsPublicos.js está mockeado (la edge function `catalogo`).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import TicketNuevoView from '../../src/modules/tickets/TicketNuevoView.vue';

vi.mock('../../src/api/ticketsPublicos.js', () => ({
  catalogoTickets: vi.fn(),
  crearTicket: vi.fn(),
  MENSAJES_ERROR_TICKETS: { dni_invalido: 'Ingrese un DNI válido (8 dígitos)' },
}));
import { catalogoTickets } from '../../src/api/ticketsPublicos.js';

const AVISO_SUB = 'Deberá adjuntar la autorización de gerencia. TI no es responsable del contenido: solo administra el sistema.';
const CATALOGO = {
  categorias: [
    { id: 'camaras', nombre: 'Cámaras', aviso: null },
    { id: 'otro', nombre: 'Otros', aviso: null },
    { id: 'red', nombre: 'Redes', aviso: 'Indique la sede y el punto de red afectado.' },
  ],
  subcategorias: [
    { id: 's-corto', categoria_id: 'camaras', nombre: 'Solicitud de imagen o corto', tipo_sugerido: 'solicitud', aviso: AVISO_SUB },
    { id: 's-senal', categoria_id: 'camaras', nombre: 'Cámara sin señal', tipo_sugerido: 'incidente', aviso: null },
    { id: 's-vpn', categoria_id: 'red', nombre: 'VPN no conecta', tipo_sugerido: 'incidente', aviso: null },
  ],
};

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let w;

async function montar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/soporte', name: 'soporte', component: { template: '<div />' } },
      { path: '/soporte/nuevo', name: 'ticket-nuevo', component: TicketNuevoView },
      { path: '/soporte/buscar', name: 'ticket-buscar', component: { template: '<div />' } },
      { path: '/soporte/t/:token', name: 'ticket-seguimiento', component: { template: '<div />' } },
    ],
  });
  router.push('/soporte/nuevo');
  await router.isReady();
  w = mount(TicketNuevoView, { attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
  await espera();
  await nextTick();
  return w;
}

const selectPorEtiqueta = (texto) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(texto));
  return label ? document.getElementById(label.getAttribute('for')) : null;
};
async function elegir(select, valor) {
  select.value = valor;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}
const aviso = () => document.querySelector('[data-aviso-categoria]');

beforeEach(() => {
  vi.clearAllMocks();
  catalogoTickets.mockResolvedValue(JSON.parse(JSON.stringify(CATALOGO)));
});

afterEach(() => {
  w?.unmount();
  document.body.innerHTML = '';
});

describe('TicketNuevoView.vue — aviso fijo por categoría/subcategoría (114)', () => {
  it('sin categoría elegida no hay aviso; al elegir una con aviso aparece como nota ámbar', async () => {
    await montar();
    expect(aviso()).toBeNull();
    await elegir(selectPorEtiqueta('Tipo de solicitud'), 'red');
    const nota = aviso();
    expect(nota).toBeTruthy();
    expect(nota.getAttribute('role')).toBe('note');
    expect(nota.textContent).toContain('Indique la sede y el punto de red afectado.');
    expect(nota.className).toContain('bg-amber-50');
    expect(nota.className).toContain('text-gray-900');
    expect(nota.className).not.toMatch(/border-l/);
    expect(nota.querySelector('i.ti-alert-triangle')).toBeTruthy();
  });

  it('desaparece al cambiar a una categoría sin aviso', async () => {
    await montar();
    await elegir(selectPorEtiqueta('Tipo de solicitud'), 'red');
    expect(aviso()).toBeTruthy();
    await elegir(selectPorEtiqueta('Tipo de solicitud'), 'otro');
    expect(aviso()).toBeNull();
  });

  it('el aviso de la subcategoría gana: Cámaras no tiene aviso, «Solicitud de imagen o corto» sí', async () => {
    await montar();
    await elegir(selectPorEtiqueta('Tipo de solicitud'), 'camaras');
    expect(aviso()).toBeNull();
    await elegir(selectPorEtiqueta('Subcategoría'), 's-corto');
    expect(aviso().textContent).toContain('Deberá adjuntar la autorización de gerencia');
    await elegir(selectPorEtiqueta('Subcategoría'), 's-senal');
    expect(aviso()).toBeNull();
  });

  it('cambiar de categoría descarta la subcategoría elegida (y su aviso)', async () => {
    await montar();
    await elegir(selectPorEtiqueta('Tipo de solicitud'), 'camaras');
    await elegir(selectPorEtiqueta('Subcategoría'), 's-corto');
    expect(aviso().textContent).toContain('autorización de gerencia');
    await elegir(selectPorEtiqueta('Tipo de solicitud'), 'red');
    // Ahora manda el aviso de Redes, no el de la subcategoría de Cámaras.
    expect(aviso().textContent).toContain('Indique la sede');
    expect(aviso().textContent).not.toContain('autorización de gerencia');
    expect(selectPorEtiqueta('Subcategoría').value).toBe('');
  });
});
