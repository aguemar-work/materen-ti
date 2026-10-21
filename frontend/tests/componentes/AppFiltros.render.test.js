// @vitest-environment happy-dom
//
// AppFiltros.vue — filtros de un listado (V2, 2026-09-25; rediseño
// 2026-10-21: un botón por dimensión en la línea, un clic abre sus opciones,
// sin menú intermedio). Cubre el contrato con la vista: el componente solo
// edita `{ [dimensión]: valores[] }` (O dentro de una dimensión, Y entre
// dimensiones lo resuelve el servidor) y cada filtro puesto se quita entero
// con su ×.
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AppFiltros from '../../src/components/ui/AppFiltros.vue';

const DIMENSIONES = [
  { id: 'empresa', label: 'Empresa', icono: 'ti ti-building', opciones: [
    { valor: 'e1', label: 'Materen' }, { valor: 'e2', label: 'Andes' }, { valor: 'e3', label: 'Vial Sur' },
  ] },
  { id: 'area', label: 'Área/Obra', icono: 'ti ti-briefcase', opciones: [{ valor: 'a1', label: 'Obra Surco' }] },
];

let w;
function montar(modelValue = { empresa: [], area: [] }, dimensiones = DIMENSIONES) {
  w = mount(AppFiltros, {
    props: { dimensiones, modelValue, 'onUpdate:modelValue': (v) => w.setProps({ modelValue: v }) },
    attachTo: document.body,
  });
  return w;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const botonLibre = (texto) => w.findAll('button').find((b) => b.text().trim() === texto);
const casillas = () => document.body.querySelectorAll('fieldset input[type="checkbox"]');

afterEach(() => {
  w?.unmount();
  document.body.innerHTML = '';
});

describe('AppFiltros.vue', () => {
  it('cada dimensión es un botón en la línea, en el orden que manda la vista', () => {
    montar();
    expect(botonLibre('Empresa')).toBeTruthy();
    expect(botonLibre('Área/Obra')).toBeTruthy();
    expect(w.findAll('button[aria-label^="Quitar filtro"]')).toHaveLength(0);
    // Ya no existe el "+ Filtro" con su menú de dimensiones.
    expect(w.find('button[aria-label="Agregar filtro"]').exists()).toBe(false);
  });

  it('un clic abre las opciones de ESA dimensión, sin menú intermedio; marcar dos emite la lista (O)', async () => {
    montar();
    await botonLibre('Empresa').trigger('click');
    await flush();
    expect(casillas()).toHaveLength(3);
    expect(document.body.querySelector('[aria-label="Volver a la lista de filtros"]')).toBeNull();
    casillas()[0].click();
    await flush();
    casillas()[1].click();
    await flush();
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual({ empresa: ['e1', 'e2'], area: [] });
  });

  it('con algo elegido el botón cambia: dice qué filtra y su × quita la dimensión entera', async () => {
    montar({ empresa: ['e1', 'e2'], area: [] });
    const activo = w.find('button[aria-label^="Filtro Empresa"]');
    expect(activo.text()).toContain('Materen, Andes');
    expect(activo.element.closest('[data-chip]')).toBeTruthy();
    expect(botonLibre('Área/Obra').element.closest('[data-chip]')).toBeNull();
    await w.find('button[aria-label="Quitar filtro Empresa"]').trigger('click');
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual({ empresa: [], area: [] });
  });

  it('con más de dos valores resume como "X y N más"', () => {
    montar({ empresa: ['e1', 'e2', 'e3'], area: [] });
    expect(w.find('button[aria-label^="Filtro Empresa"]').text()).toContain('Materen y 2 más');
  });

  it('al elegir el primer valor el panel sigue abierto y anclado al botón que ahora dice qué filtra', async () => {
    montar();
    await botonLibre('Empresa').trigger('click');
    await flush();
    casillas()[0].click();
    await flush();
    await flush();
    expect(casillas()).toHaveLength(3); // el panel no se cerró
    expect(w.find('button[aria-label^="Filtro Empresa"]').attributes('aria-expanded')).toBe('true');
  });

  it('dimensión de rango: el atajo fija [desde, hasta] y el botón lo resume como fechas', async () => {
    montar({ creado: ['', ''] }, [{ id: 'creado', label: 'Creado', icono: 'ti ti-calendar', tipo: 'rango' }]);
    // Sin fechas, el rango no cuenta como filtro puesto.
    expect(w.findAll('button[aria-label^="Quitar filtro"]')).toHaveLength(0);
    await botonLibre('Creado').trigger('click');
    await flush();
    [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes('Hoy')).click();
    await flush();
    const [desde, hasta] = w.emitted('update:modelValue').at(-1)[0].creado;
    expect(desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hasta).toBe(desde);
    await w.setProps({ modelValue: { creado: ['2026-09-01', '2026-09-20'] } });
    expect(w.find('button[aria-label^="Filtro Creado"]').text()).toContain('01/09 – 20/09');
    await w.find('button[aria-label="Quitar filtro Creado"]').trigger('click');
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual({ creado: ['', ''] });
  });
});

describe('AppFiltros.vue — "Más filtros"', () => {
  const DIMS = [
    ...DIMENSIONES,
    { id: 'tipo', label: 'Tipo', icono: 'ti ti-tag', mas: true, opciones: [{ valor: 'incidente', label: 'Incidente' }] },
    { id: 'nivel', label: 'Nivel', icono: 'ti ti-stairs', mas: true, opciones: [{ valor: 'N1', label: 'N1 — Soporte básico' }] },
  ];

  it('las dimensiones `mas` no ocupan la línea: van juntas en un solo panel, todas a la vista', async () => {
    montar({ empresa: [], area: [], tipo: [], nivel: [] }, DIMS);
    expect(botonLibre('Tipo')).toBeFalsy();
    await botonLibre('Más filtros').trigger('click');
    await flush();
    expect(document.body.querySelectorAll('fieldset')).toHaveLength(2);
    expect(casillas()).toHaveLength(2);
    casillas()[1].click();
    await flush();
    expect(w.emitted('update:modelValue').at(-1)[0].nivel).toEqual(['N1']);
  });

  it('una de "Más filtros" con algo elegido aparece en la línea: lo que filtra nunca queda escondido', () => {
    montar({ empresa: [], area: [], tipo: ['incidente'], nivel: [] }, DIMS);
    expect(w.find('button[aria-label^="Filtro Tipo"]').text()).toContain('Incidente');
    expect(botonLibre('Más filtros')).toBeTruthy();
  });
});
