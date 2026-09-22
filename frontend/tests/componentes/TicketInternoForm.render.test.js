// @vitest-environment happy-dom
//
// TicketInternoForm.vue — Fase 3 (cierre del módulo Tickets): el modal
// pasó de components/shared/Modal.vue a components/ui/AppDialog.vue
// (primevue/dialog Unstyled + Tailwind, mismo preset pt/dialog.pt.js que
// ConfirmDialog.vue) y sus 2 botones a AppButton. Verifica lo que pide la
// Fase 4 del plan: que el Dialog real se monta en el DOM (no un stub) y
// que la emisión del formulario (crearTicket + @cerrar) sigue intacta.
//
// Dialog renderiza vía primevue/portal (teletransporta a <body> recién
// después de SU PROPIO mounted(), ver AppDialog.vue/ConfirmDialog.vue) —
// un nextTick tras montar alcanza para que aparezca; de ahí en más se
// busca con querySelector sobre el documento real, no con wrapper.find().
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PrimeVue from 'primevue/config';
import TicketInternoForm from '../../src/modules/tickets/TicketInternoForm.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listCategoriasTicket: vi.fn().mockResolvedValue([{ id: 'cat-1', nombre: 'Hardware' }]),
    listSubcategoriasTicket: vi.fn().mockResolvedValue([]),
    listEmpleados: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/api/ticketsPublicos.js', () => ({
  crearTicket: vi.fn().mockResolvedValue({ id: 'tck-nuevo' }),
}));
import { insforgeApi } from '../../src/api/insforge.js';
import { crearTicket } from '../../src/api/ticketsPublicos.js';

function flushPromises() {
  return new Promise((r) => setTimeout(r, 0));
}

function botonPorTexto(texto) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
}

async function montar() {
  const w = mount(TicketInternoForm, {
    global: { plugins: [[PrimeVue, { unstyled: true }]] },
  });
  await flushPromises(); // onMounted: catálogos
  await nextTick(); // Portal de Dialog
  return w;
}

beforeEach(() => {
  vi.clearAllMocks();
  insforgeApi.listCategoriasTicket.mockResolvedValue([{ id: 'cat-1', nombre: 'Hardware' }]);
  insforgeApi.listSubcategoriasTicket.mockResolvedValue([]);
  insforgeApi.listEmpleados.mockResolvedValue([]);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TicketInternoForm.vue — modal migrado a AppDialog (primevue/dialog)', () => {
  it('monta el Dialog real de PrimeVue en el DOM, con el título correcto', async () => {
    await montar();
    // role="dialog" + aria-modal es de primevue/dialog, no de Modal.vue —
    // confirma que es el componente nuevo, no un remanente del viejo.
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.body.textContent).toContain('Nuevo ticket interno');
  });

  it('los botones del footer son AppButton (texto/secondary para Cancelar, primary para Crear)', async () => {
    await montar();
    const cancelar = botonPorTexto('Cancelar');
    const crear = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Crear ticket'));
    expect(cancelar.className).not.toContain('bg-primary-500');
    expect(crear.className).toContain('bg-primary-500');
    // El botón de submit sigue asociado al <form> aunque viva en el footer
    // del Dialog, fuera del <form> en el DOM (atributo form= de HTML).
    expect(crear.getAttribute('type')).toBe('submit');
    expect(crear.getAttribute('form')).toBe('ti-form');
  });

  it('completar el formulario y enviar llama a crearTicket con los datos correctos y emite "cerrar"', async () => {
    const w = await montar();

    const selects = document.querySelectorAll('select');
    selects[0].value = 'cat-1'; // Tipo de solicitud (única categoría del fixture)
    selects[0].dispatchEvent(new Event('change'));

    const titulo = document.querySelector('input[type="text"]');
    titulo.value = 'Se cayó la red del piso 2';
    titulo.dispatchEvent(new Event('input'));

    const descripcion = document.querySelector('textarea');
    descripcion.value = 'Desde las 9am no hay conexión en todo el piso.';
    descripcion.dispatchEvent(new Event('input'));
    await nextTick();

    botonPorTexto('Crear ticket').click();
    await flushPromises();

    expect(crearTicket).toHaveBeenCalledWith(expect.objectContaining({
      titulo: 'Se cayó la red del piso 2',
      descripcion: 'Desde las 9am no hay conexión en todo el piso.',
      categoriaId: 'cat-1',
      origen: 'staff_interno',
    }));
    expect(w.emitted('cerrar')).toEqual([[true]]);
  });

  it('sin tocar el form, Cancelar cierra directo (sin cambios sin guardar) y emite "cerrar"', async () => {
    const w = await montar();
    botonPorTexto('Cancelar').click();
    await flushPromises();
    expect(w.emitted('cerrar')).toBeTruthy();
    expect(crearTicket).not.toHaveBeenCalled();
  });

  it('con cambios sin guardar, Cancelar abre el ConfirmDialog de descarte (ya migrado, sigue funcionando)', async () => {
    const w = await montar();
    const titulo = document.querySelector('input[type="text"]');
    titulo.value = 'Algo que no se guardó';
    titulo.dispatchEvent(new Event('input'));
    await nextTick();

    botonPorTexto('Cancelar').click();
    await flushPromises();

    expect(document.body.textContent).toContain('Cambios sin guardar');
    expect(w.emitted('cerrar')).toBeFalsy(); // no cerró todavía, está preguntando

    botonPorTexto('Descartar y salir').click();
    await flushPromises();
    expect(w.emitted('cerrar')).toBeTruthy();
  });
});
