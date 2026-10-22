// @vitest-environment happy-dom
//
// AppVistas.vue — vistas de un listado. Desde 2026-10-21 los listados la usan
// `en-barra`: segmentado de 32px dentro de AppBarraFiltros, en la misma línea
// que el buscador y los filtros (pedido del dueño). Las pestañas a lo ancho
// quedan para Inicio.
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppVistas from '../../src/components/ui/AppVistas.vue';

const OPCIONES = [
  { valor: 'todos', label: 'Todos', conteo: 12 },
  { valor: 'Activo', label: 'Activos', conteo: 9 },
];

describe('AppVistas.vue', () => {
  it('en-barra: segmentado compacto, la activa con aria-pressed, conteos adentro y sin la marca de pestaña', async () => {
    const w = mount(AppVistas, { props: { modelValue: 'Activo', opciones: OPCIONES, label: 'Vista de empleados', enBarra: true } });
    const botones = w.findAll('[role="group"][aria-label="Vista de empleados"] button');
    expect(botones.map((b) => b.text().replace(/\s+/g, ' ').trim())).toEqual(['Todos 12', 'Activos 9']);
    expect(botones[1].attributes('aria-pressed')).toBe('true');
    expect(w.find('[role="group"]').classes()).toContain('h-8');
    expect(w.find('.bg-primary-500').exists()).toBe(false);
    await botones[0].trigger('click');
    expect(w.emitted('update:modelValue')[0]).toEqual(['todos']);
  });

  it('sin en-barra: pestañas a lo ancho con la marca de 2px (Inicio)', () => {
    const w = mount(AppVistas, { props: { modelValue: 'todos', opciones: OPCIONES, label: 'Vista del Inicio' } });
    expect(w.find('.bg-primary-500').exists()).toBe(true);
  });
});
