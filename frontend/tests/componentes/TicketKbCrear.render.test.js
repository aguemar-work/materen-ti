// @vitest-environment happy-dom
//
// «Crear artículo desde este ticket» (KEDB, migración 106): solo se ofrece donde
// el servidor no lo rechazaría (ticket resuelto o cerrado, con los módulos
// tickets y base_conocimiento) y el rechazo de crear_kb_desde_ticket sale
// traducido en el propio formulario. Solo api/insforge.js está mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TicketKbCrear from '../../src/modules/tickets/TicketKbCrear.vue';
import { useAuthStore } from '../../src/stores/auth.js';
import { toasts } from '../../src/core/toast.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: { crearKbDesdeTicket: vi.fn() },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar({ rol = 'JEFE', modulos = ['tickets', 'base_conocimiento'], estado = 'cerrado' } = {}) {
  const auth = useAuthStore();
  auth.rol = rol;
  auth.modulosVisibles = modulos;
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:resto(.*)*', component: { template: '<div />' } }] });
  router.push('/');
  await router.isReady();
  wrapper = mount(TicketKbCrear, { props: { ticket: { id: 't1', estado } }, attachTo: document.body, global: { plugins: [router] } });
  await espera();
  return wrapper;
}

const boton = (w, texto) => w.findAll('button').find((b) => b.text().includes(texto));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  toasts.length = 0;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('TicketKbCrear', () => {
  it.each(['resuelto', 'cerrado'])('con el ticket %s ofrece crear el artículo', async (estado) => {
    const w = await montar({ estado });
    expect(boton(w, 'Crear artículo desde este ticket')).toBeDefined();
  });

  it.each(['abierto', 'en_progreso', 'reabierto', 'rechazado'])('con el ticket %s no se ofrece (el servidor lo rechazaría)', async (estado) => {
    const w = await montar({ estado });
    expect(w.html()).toBe('<!--v-if-->');
  });

  it('sin base_conocimiento o sin tickets no se ofrece', async () => {
    expect((await montar({ rol: 'ASISTENTE', modulos: ['tickets'] })).html()).toBe('<!--v-if-->');
    wrapper.unmount();
    expect((await montar({ rol: 'ASISTENTE', modulos: ['base_conocimiento'] })).html()).toBe('<!--v-if-->');
  });

  it('crea el borrador con la solución escrita, avisa y enlaza al artículo', async () => {
    insforgeApi.crearKbDesdeTicket.mockResolvedValue({ id: 'k5', estado: 'borrador' });
    const w = await montar();
    await boton(w, 'Crear artículo desde este ticket').trigger('click');
    await w.find('textarea').setValue('Reiniciar el spooler\nProbar de nuevo');
    await w.find('form').trigger('submit');
    await espera(); await espera();
    expect(insforgeApi.crearKbDesdeTicket).toHaveBeenCalledWith('t1', { solucion: 'Reiniciar el spooler\nProbar de nuevo' });
    expect(toasts.at(-1)).toMatchObject({ msg: 'Borrador creado en la base de conocimiento', tipo: 'success' });
    expect(w.find('a[href="/base-conocimiento/k5"]').text()).toBe('Abrir el artículo');
    expect(w.find('form').exists()).toBe(false);
    expect(w.emitted('creado')[0][0]).toMatchObject({ id: 'k5' });
  });

  it('sin solución escrita la manda vacía: el servidor decide (usa la nota de resolución si existe)', async () => {
    insforgeApi.crearKbDesdeTicket.mockResolvedValue({ id: 'k6' });
    const w = await montar();
    await boton(w, 'Crear artículo desde este ticket').trigger('click');
    await w.find('form').trigger('submit');
    await espera(); await espera();
    expect(insforgeApi.crearKbDesdeTicket).toHaveBeenCalledWith('t1', { solucion: '' });
  });

  it('el rechazo "sin nota de resolución" se muestra en el formulario, que sigue abierto', async () => {
    insforgeApi.crearKbDesdeTicket.mockRejectedValue({
      code: 'P0001',
      message: 'El ticket no tiene nota de resolución. Escriba la solución para crear el artículo.',
    });
    const w = await montar();
    await boton(w, 'Crear artículo desde este ticket').trigger('click');
    await w.find('form').trigger('submit');
    await espera(); await espera();
    expect(w.find('[role="alert"]').text()).toBe('El ticket no tiene nota de resolución. Escriba la solución para crear el artículo.');
    expect(w.find('form').exists()).toBe(true);
    expect(w.emitted('creado')).toBeUndefined();
  });

  it('sin permiso, el error sale en español y no en crudo', async () => {
    insforgeApi.crearKbDesdeTicket.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    const w = await montar();
    await boton(w, 'Crear artículo desde este ticket').trigger('click');
    await w.find('form').trigger('submit');
    await espera(); await espera();
    expect(w.find('[role="alert"]').text()).toBe('No tiene permiso para esta acción.');
  });

  it('Cancelar cierra el formulario y deja el botón', async () => {
    const w = await montar();
    await boton(w, 'Crear artículo desde este ticket').trigger('click');
    await boton(w, 'Cancelar').trigger('click');
    expect(w.find('form').exists()).toBe(false);
    expect(boton(w, 'Crear artículo desde este ticket')).toBeDefined();
    expect(insforgeApi.crearKbDesdeTicket).not.toHaveBeenCalled();
  });
});
