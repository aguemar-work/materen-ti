// @vitest-environment happy-dom
//
// AppTag consume el mapa único de core/tonos.js (fondo 50 + texto 800).
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppTag from '../../src/components/ui/AppTag.vue';
import { TONOS, NOMBRES_TONO } from '../../src/core/tonos.js';

const montar = (props = {}) => mount(AppTag, { props, slots: { default: 'Abierto' } });

describe('AppTag.vue', () => {
  it('cada tono semántico pinta sus clases del mapa único', () => {
    for (const tono of NOMBRES_TONO) {
      const w = montar({ tono });
      for (const clase of TONOS[tono].tag.split(' ')) expect(w.classes(), tono).toContain(clase);
    }
  });

  it('los nombres históricos siguen funcionando y dan el mismo tono', () => {
    const pares = {
      success: 'ok',
      warning: 'accion',
      danger: 'critico',
      purple: 'espera',
      sky: 'trabajando',
      teal: 'categoria',
      neutral: 'neutro',
    };
    for (const [viejo, nuevo] of Object.entries(pares)) {
      expect(montar({ tono: viejo }).classes(), viejo).toEqual(expect.arrayContaining(TONOS[nuevo].tag.split(' ')));
    }
  });

  it('texto 800 sobre fondo 50 (neutro: gray-100 + gray-700)', () => {
    expect(montar({ tono: 'ok' }).classes()).toEqual(expect.arrayContaining(['bg-green-50', 'text-green-800']));
    expect(montar({ tono: 'accion' }).classes()).toEqual(expect.arrayContaining(['bg-amber-50', 'text-amber-800']));
    expect(montar({ tono: 'neutro' }).classes()).toEqual(expect.arrayContaining(['bg-gray-100', 'text-gray-700']));
  });

  it('`rango` escribe el tag en mayúsculas semibold; por defecto es font-medium', () => {
    const rango = montar({ tono: 'neutro', rango: true }).classes();
    expect(rango).toEqual(expect.arrayContaining(['font-semibold', 'uppercase', 'tracking-wider']));
    expect(rango).not.toContain('font-medium');
    const normal = montar({ tono: 'neutro' }).classes();
    expect(normal).toContain('font-medium');
    expect(normal).not.toContain('uppercase');
  });

  it('mantiene 20px, punto e ícono, y el gancho de impresión', () => {
    const w = mount(AppTag, { props: { punto: true, icono: 'ti ti-x' }, slots: { default: 'x' } });
    expect(w.classes()).toContain('h-5');
    expect(w.find('span[aria-hidden="true"]').exists()).toBe(true);
    expect(w.find('i.ti').exists()).toBe(true);
    expect(w.attributes('data-tag')).toBeDefined();
  });
});
