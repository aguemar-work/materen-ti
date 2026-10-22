// @vitest-environment happy-dom
//
// AppFiltros.vue — filtros de un listado (V2, 2026-09-25; rediseño
// 2026-10-21, pedido del dueño: UN botón "Filtros" que abre UN panel con todas
// las dimensiones a la vista, sin menú que lleve a otro menú). Cubre el
// contrato con la vista: el componente solo edita `{ [dimensión]: valores[] }`
// (O dentro de una dimensión, Y entre dimensiones lo resuelve el servidor) y
// cada dimensión puesta se quita entera.
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
const boton = () => w.find('button[aria-haspopup="dialog"]');
const panel = () => document.body.querySelector('[role="dialog"][aria-label="Filtros"]');
const casillas = () => panel().querySelectorAll('input[type="checkbox"]');
async function abrir() {
  await boton().trigger('click');
  await flush();
}

afterEach(() => {
  w?.unmount();
  document.body.innerHTML = '';
});

describe('AppFiltros.vue', () => {
  it('es un solo botón "Filtros", no uno por dimensión', () => {
    montar();
    expect(w.findAll('button')).toHaveLength(1);
    expect(boton().text()).toContain('Filtros');
  });

  it('un clic abre UN panel con todas las dimensiones a la vista, en su orden', async () => {
    montar();
    await abrir();
    const secciones = [...panel().querySelectorAll('fieldset legend')].map((l) => l.textContent.trim());
    expect(secciones).toEqual(['Filtrar por Empresa', 'Filtrar por Área/Obra']);
    expect(casillas()).toHaveLength(4);
    expect(document.body.querySelector('[aria-label="Volver a la lista de filtros"]')).toBeNull();
  });

  it('marcar dos valores emite la lista (O dentro de la dimensión) y el panel sigue abierto', async () => {
    montar();
    await abrir();
    casillas()[0].click();
    await flush();
    casillas()[1].click();
    await flush();
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual({ empresa: ['e1', 'e2'], area: [] });
    expect(panel()).toBeTruthy();
  });

  it('con algo elegido el botón se tiñe, cuenta las dimensiones puestas y dice cuáles', () => {
    montar({ empresa: ['e1', 'e2', 'e3'], area: ['a1'] });
    expect(boton().attributes('data-chip')).toBeDefined();
    expect(boton().text()).toContain('2');
    expect(boton().attributes('aria-label')).toBe('Filtros: Empresa Materen y 2 más; Área/Obra Obra Surco');
  });

  it('sin nada elegido el botón no se tiñe', () => {
    montar();
    expect(boton().attributes('data-chip')).toBeUndefined();
  });

  it('"Quitar" en una sección quita esa dimensión entera', async () => {
    montar({ empresa: ['e1', 'e2'], area: ['a1'] });
    await abrir();
    panel().querySelector('[aria-label="Quitar filtro Empresa"]').click();
    await flush();
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual({ empresa: [], area: ['a1'] });
  });

  it('una sección con muchas opciones trae su buscador', async () => {
    const muchas = Array.from({ length: 9 }, (_, i) => ({ valor: `p${i}`, label: `Persona ${i}` }));
    montar({ quien: [] }, [{ id: 'quien', label: 'Quién', icono: 'ti ti-user', opciones: muchas }]);
    await abrir();
    const buscador = panel().querySelector('input[type="search"]');
    buscador.value = 'Persona 3';
    buscador.dispatchEvent(new Event('input'));
    await flush();
    expect(casillas()).toHaveLength(1);
  });

  it('dimensión de rango: el atajo fija [desde, hasta] y cuenta como filtro puesto', async () => {
    montar({ creado: ['', ''] }, [{ id: 'creado', label: 'Creado', icono: 'ti ti-calendar', tipo: 'rango' }]);
    // Sin fechas, el rango no cuenta como filtro puesto.
    expect(boton().attributes('data-chip')).toBeUndefined();
    await abrir();
    [...panel().querySelectorAll('button')].find((b) => b.textContent.includes('Hoy')).click();
    await flush();
    const [desde, hasta] = w.emitted('update:modelValue').at(-1)[0].creado;
    expect(desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hasta).toBe(desde);
    await w.setProps({ modelValue: { creado: ['2026-09-01', '2026-09-20'] } });
    expect(boton().attributes('aria-label')).toBe('Filtros: Creado 01/09 – 20/09');
  });
});
