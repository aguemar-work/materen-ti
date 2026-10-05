// @vitest-environment happy-dom
//
// TicketComposer.vue — botón "Comentar" migrado a AppButton (Fase 2,
// 2026-09-08). Componente standalone (sin store, sin composable) — no
// necesita mocks de api/insforge.js.
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import TicketComposer from '../../src/modules/tickets/TicketComposer.vue';

function montar(props = {}) {
  return mount(TicketComposer, {
    props,
    global: { plugins: [[PrimeVue, { unstyled: true }]] },
  });
}

describe('TicketComposer.vue — botón "Comentar" con AppButton', () => {
  it('el botón está deshabilitado sin mensaje y se habilita al escribir', async () => {
    const w = montar({ mensaje: '' });
    const boton = w.findAll('button').find((b) => b.text().includes('Comentar'));
    expect(boton.attributes('disabled')).toBeDefined();

    await w.setProps({ mensaje: 'Ya lo revisé' });
    expect(w.findAll('button').find((b) => b.text().includes('Comentar')).attributes('disabled')).toBeUndefined();
  });

  it('clic en "Comentar" emite "enviar"', async () => {
    const w = montar({ mensaje: 'Listo' });
    await w.findAll('button').find((b) => b.text().includes('Comentar')).trigger('click');
    expect(w.emitted('enviar')).toBeTruthy();
  });

  it('enviando=true muestra "Enviando..." y deshabilita el botón', () => {
    const w = montar({ mensaje: 'Listo', enviando: true });
    const boton = w.findAll('button').find((b) => b.text().includes('Enviando...'));
    expect(boton).toBeTruthy();
    expect(boton.attributes('disabled')).toBeDefined();
  });

  it('el checkbox de "nota interna" sigue emitiendo update:interno', async () => {
    const w = montar({ mensaje: 'Listo', interno: false });
    await w.find('input[type="checkbox"]').setValue(true);
    expect(w.emitted('update:interno')).toEqual([[true]]);
  });
});
