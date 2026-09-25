// @vitest-environment happy-dom
//
// AppFiltros.vue — chips de filtro bajo demanda (V2, 2026-09-25). Cubre el
// contrato con la vista: el componente solo edita `{ [dimensión]: valores[] }`
// (O dentro de una dimensión, Y entre dimensiones lo resuelve el servidor) y
// cada chip se puede quitar entero con su ×.
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AppFiltros from '../../src/components/ui/AppFiltros.vue';

const DIMENSIONES = [
  { id: 'empresa', label: 'Empresa', icono: 'ti ti-building', opciones: [
    { valor: 'e1', label: 'Materen' }, { valor: 'e2', label: 'Andes' }, { valor: 'e3', label: 'Vial Sur' },
  ] },
  { id: 'area', label: 'Área/Obra', icono: 'ti ti-briefcase', opciones: [{ valor: 'a1', label: 'Obra Surco' }] },
];

function montar(modelValue = { empresa: [], area: [] }) {
  return mount(AppFiltros, {
    props: { dimensiones: DIMENSIONES, modelValue, 'onUpdate:modelValue': (v) => w.setProps({ modelValue: v }) },
    attachTo: document.body,
  });
}
let w;

function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

afterEach(() => {
  w?.unmount();
  document.body.innerHTML = '';
});

describe('AppFiltros.vue', () => {
  it('sin filtros no muestra chips, solo "+ Filtro"', () => {
    w = montar();
    expect(w.find('button[aria-label="Agregar filtro"]').exists()).toBe(true);
    expect(w.findAll('button[aria-label^="Quitar filtro"]')).toHaveLength(0);
  });

  it('"+ Filtro" → elegir dimensión → marcar dos valores emite la lista (O dentro de la dimensión)', async () => {
    w = montar();
    await w.find('button[aria-label="Agregar filtro"]').trigger('click');
    await flush();
    const dimension = [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes('Empresa'));
    dimension.click();
    await flush();
    const checks = document.body.querySelectorAll('fieldset input[type="checkbox"]');
    expect(checks).toHaveLength(3);
    checks[0].click();
    await flush();
    document.body.querySelectorAll('fieldset input[type="checkbox"]')[1].click();
    await flush();
    const emitido = w.emitted('update:modelValue').at(-1)[0];
    expect(emitido).toEqual({ empresa: ['e1', 'e2'], area: [] });
  });

  it('el chip resume lo elegido y su × quita la dimensión entera', async () => {
    w = montar({ empresa: ['e1', 'e2'], area: [] });
    const chip = w.find('button[aria-label^="Filtro Empresa"]');
    expect(chip.text()).toContain('Materen, Andes');
    await w.find('button[aria-label="Quitar filtro Empresa"]').trigger('click');
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual({ empresa: [], area: [] });
  });

  it('con más de dos valores resume como "X y N más"', () => {
    w = montar({ empresa: ['e1', 'e2', 'e3'], area: [] });
    expect(w.find('button[aria-label^="Filtro Empresa"]').text()).toContain('Materen y 2 más');
  });

  it('cuando todas las dimensiones están en uso, "+ Filtro" desaparece', () => {
    w = montar({ empresa: ['e1'], area: ['a1'] });
    expect(w.find('button[aria-label="Agregar filtro"]').exists()).toBe(false);
  });
});
