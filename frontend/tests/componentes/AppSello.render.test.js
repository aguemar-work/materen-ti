// @vitest-environment happy-dom
//
// AppSello (regla 15): solo borde, sin fondo, rounded-sm, 11px semibold
// mayúsculas con tracking; tonos neutro / ok / critico; el texto va siempre.
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppSello from '../../src/components/ui/AppSello.vue';

const montar = (props = {}, texto = 'Cerrado · conforme 30/09') =>
  mount(AppSello, { props, slots: { default: texto } });

describe('AppSello.vue', () => {
  it('el texto siempre está presente (el color no es el único portador)', () => {
    expect(montar({ tono: 'ok' }).text()).toBe('Cerrado · conforme 30/09');
  });

  it('solo borde de 1px: sin fondo, rounded-sm, 11px semibold uppercase tracking-wider', () => {
    const clases = montar({ tono: 'ok' }).classes();
    expect(clases).toEqual(expect.arrayContaining([
      'border', 'rounded-sm', 'text-[11px]', 'font-semibold', 'uppercase', 'tracking-wider',
    ]));
    expect(clases.some((c) => c.startsWith('bg-'))).toBe(false);
    expect(clases.some((c) => /^border-[lrtbxy]-/.test(c))).toBe(false);
  });

  it('cada tono pinta borde y texto del mismo color', () => {
    expect(montar({ tono: 'ok' }).classes()).toEqual(expect.arrayContaining(['border-green-700', 'text-green-800']));
    expect(montar({ tono: 'critico' }).classes()).toEqual(expect.arrayContaining(['border-red-700', 'text-red-800']));
    expect(montar({ tono: 'neutro' }).classes()).toEqual(expect.arrayContaining(['border-gray-500', 'text-gray-700']));
  });

  it('por defecto es neutro', () => {
    expect(montar().classes()).toContain('border-gray-500');
  });

  it('lleva data-sello para que la impresión conserve el borde', () => {
    expect(montar().attributes('data-sello')).toBeDefined();
  });

  it('solo acepta neutro, ok y critico', () => {
    const validador = AppSello.props.tono.validator;
    expect(['neutro', 'ok', 'critico'].every(validador)).toBe(true);
    expect(['accion', 'espera', 'trabajando', 'categoria', 'warning'].some(validador)).toBe(false);
  });
});
