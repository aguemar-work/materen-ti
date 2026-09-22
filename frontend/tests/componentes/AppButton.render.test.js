// @vitest-environment happy-dom
//
// AppButton es el primer wrapper del patrón PrimeVue Unstyled + Tailwind
// (ver frontend/AGENTS.md, sección "UI/UX"). Este test no verifica clases de
// Tailwind (detalle de implementación, como en el resto de tests/componentes)
// salvo por una excepción: que el preset realmente se aplique (root con
// alguna clase), porque en modo unstyled un PT vacío es indistinguible de un
// `<button>` sin ningún estilo — ahí sí es el contrato del wrapper, no un
// detalle de diseño.
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import AppButton from '../../src/components/ui/AppButton.vue';

function montar(props = {}, slots = {}) {
  return mount(AppButton, {
    props,
    slots,
    global: { plugins: [[PrimeVue, { unstyled: true, ripple: false }]] },
  });
}

describe('AppButton.vue — wrapper de primevue/button', () => {
  it('renderiza un <button> nativo con el label', () => {
    const w = montar({ label: 'Guardar' });
    const btn = w.find('button');
    expect(btn.exists()).toBe(true);
    expect(w.text()).toContain('Guardar');
  });

  it('emite click al hacer clic', async () => {
    const w = montar({ label: 'Guardar' });
    await w.find('button').trigger('click');
    expect(w.emitted('click')).toBeTruthy();
  });

  it('disabled bloquea el click y marca el atributo nativo', async () => {
    const w = montar({ label: 'Guardar', disabled: true });
    const btn = w.find('button');
    expect(btn.attributes('disabled')).toBeDefined();
    await btn.trigger('click');
    expect(w.emitted('click')).toBeFalsy();
  });

  it('loading también deshabilita el botón (evita doble envío)', () => {
    const w = montar({ label: 'Guardar', loading: true });
    expect(w.find('button').attributes('disabled')).toBeDefined();
  });

  it('reenvía atributos no declarados como props (aria-label, data-testid)', () => {
    const w = montar({ label: 'Cerrar' }, {});
    // Se remonta con attrs extra vía props no declaradas -> quedan en $attrs.
    const w2 = mount(AppButton, {
      props: { label: 'Cerrar' },
      attrs: { 'data-testid': 'btn-cerrar', 'aria-label': 'Cerrar diálogo' },
      global: { plugins: [[PrimeVue, { unstyled: true }]] },
    });
    const btn = w2.find('button');
    expect(btn.attributes('data-testid')).toBe('btn-cerrar');
    expect(btn.attributes('aria-label')).toBe('Cerrar diálogo');
  });

  it('el preset de Pass-Through pinta el root (no queda sin ninguna clase)', () => {
    const w = montar({ label: 'Guardar' });
    const clase = w.find('button').attributes('class') || '';
    expect(clase.length).toBeGreaterThan(0);
  });

  it('una clase pasada desde afuera convive con el preset (no lo reemplaza)', () => {
    const w = mount(AppButton, {
      props: { label: 'Guardar' },
      attrs: { class: 'mt-4' },
      global: { plugins: [[PrimeVue, { unstyled: true }]] },
    });
    const clase = w.find('button').attributes('class') || '';
    expect(clase).toContain('mt-4');
    expect(clase).toContain('rounded-md');
  });

  it('slot por defecto reemplaza al label cuando se usa', () => {
    const w = montar({ label: 'Ignorado' }, { default: 'Contenido custom' });
    expect(w.text()).toContain('Contenido custom');
    expect(w.text()).not.toContain('Ignorado');
  });
});
