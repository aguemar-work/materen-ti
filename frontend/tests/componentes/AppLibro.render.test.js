// @vitest-environment happy-dom
//
// AppLibro (regla 19): el único render de historial. Contrato: una <table>
// real con cabeceras, fecha dd/mm/yy + hh:mm, "no registrado (legado)" cuando
// falta el actor, el vacío como fila del libro, y NADA decorativo (sin puntos,
// sin íconos de color, sin riel vertical, sin bordes laterales).
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import AppLibro from '../../src/components/ui/AppLibro.vue';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/equipos/:id', component: { template: '<div />' } },
  ],
});

const FILAS = [
  {
    id: 'a',
    fecha: new Date(2026, 8, 12, 20, 14),
    movimiento: 'Entrega abierta',
    detalle: '1 cuenta · WhatsApp',
    por: null,
    ref: { texto: 'Entrega', to: '/equipos/1' },
  },
  {
    id: 'b',
    fecha: new Date(2025, 2, 12, 10, 30),
    movimiento: 'Equipo entregado',
    detalle: 'LAP-0142',
    por: 'D. Huamán',
    ref: { texto: 'Acta' },
  },
];

const montar = (props = {}, slots = {}) =>
  mount(AppLibro, { props: { filas: FILAS, ...props }, slots, global: { plugins: [router] } });

describe('AppLibro.vue', () => {
  it('es una <table> real con cabeceras de columna accesibles', () => {
    const w = montar();
    expect(w.find('table').exists()).toBe(true);
    const ths = w.findAll('thead th');
    expect(ths.map((t) => t.text())).toEqual(['Fecha', 'Movimiento', 'Detalle', 'Por', 'Ref.']);
    for (const th of ths) expect(th.attributes('scope')).toBe('col');
    expect(w.get('caption').text()).toBe('Libro de movimientos');
  });

  it('table-layout fixed y la columna Fecha de 88px', () => {
    const w = montar();
    expect(w.get('table').classes()).toContain('table-fixed');
    expect(w.findAll('col')[0].classes()).toContain('w-[88px]');
  });

  it('la primera celda lleva dd/mm/yy arriba y hh:mm debajo en gris, tabulares', () => {
    const celda = montar().findAll('tbody tr')[0].findAll('td')[0];
    expect(celda.classes()).toContain('tabular-nums');
    const [fecha, hora] = celda.findAll('span');
    expect(fecha.text()).toBe('12/09/26');
    expect(hora.text()).toBe('20:14');
    expect(hora.classes()).toContain('text-gray-500');
  });

  it('movimiento, detalle y actor en su columna', () => {
    const celdas = montar().findAll('tbody tr')[1].findAll('td');
    expect(celdas[1].text()).toBe('Equipo entregado');
    expect(celdas[2].text()).toContain('LAP-0142');
    expect(celdas[3].text()).toBe('D. Huamán');
  });

  it('actor ausente: "no registrado (legado)" en gris', () => {
    const celda = montar().findAll('tbody tr')[0].findAll('td')[3];
    expect(celda.text()).toBe('no registrado (legado)');
    expect(celda.classes()).toContain('text-gray-500');
  });

  it('la referencia con destino es un enlace; sin destino es texto', () => {
    const filas = montar().findAll('tbody tr');
    const enlace = filas[0].find('a');
    expect(enlace.exists()).toBe(true);
    expect(enlace.text()).toBe('Entrega');
    expect(enlace.attributes('href')).toBe('/equipos/1');
    expect(filas[1].find('a').exists()).toBe(false);
    expect(filas[1].findAll('td')[4].text()).toBe('Acta');
  });

  it('sin filas: una fila del libro "— Sin movimientos registrados"', () => {
    const w = montar({ filas: [] });
    const filas = w.findAll('tbody tr');
    expect(filas).toHaveLength(1);
    expect(filas[0].text()).toBe('— Sin movimientos registrados');
    expect(filas[0].get('td').classes()).toContain('text-gray-500');
    expect(w.find('[class*="border-dashed"]').exists()).toBe(false);
  });

  it('el vacío es configurable y admite una acción como enlace en la misma fila', () => {
    const w = montar({ filas: [], vacio: 'Sin entregas registradas' }, { vacio: '<a href="#">Enviar entrega</a>' });
    const fila = w.get('tbody tr');
    expect(fila.text()).toContain('— Sin entregas registradas');
    expect(fila.find('a').text()).toBe('Enviar entrega');
  });

  it('fila de tipo mensaje: autor, visibilidad y texto largo en el mismo libro', () => {
    const w = montar({
      filas: [{
        id: 'm',
        tipo: 'mensaje',
        fecha: new Date(2026, 8, 28, 14, 31),
        autor: 'D. Huamán',
        visibilidad: 'interna',
        texto: 'Primera línea\nSegunda línea',
      }],
    });
    const fila = w.get('tbody tr');
    expect(fila.attributes('data-fila')).toBe('mensaje');
    const celdas = fila.findAll('td');
    expect(celdas[0].text()).toContain('28/09/26');
    expect(celdas[1].text()).toContain('D. Huamán');
    expect(celdas[1].text()).toContain('Nota interna');
    expect(celdas[2].attributes('colspan')).toBe('3');
    expect(celdas[2].classes()).toContain('whitespace-pre-line');
    expect(celdas[2].text()).toContain('Segunda línea');
  });

  it('un mensaje visible lo dice con texto, no con color; una fecha sola no inventa hora', () => {
    const w = montar({
      filas: [{ tipo: 'mensaje', fecha: '2026-09-28', autor: 'J. Quispe', visibilidad: 'visible', texto: 'HP M404' }],
    });
    expect(w.get('tbody tr').text()).toContain('Mensaje visible');
    expect(w.get('tbody tr td').text()).toBe('28/09/26');
  });

  it('nada decorativo: sin puntos, sin íconos, sin cajas, sin bordes laterales ni riel', () => {
    const w = montar({
      filas: [
        ...FILAS,
        { tipo: 'mensaje', fecha: new Date(2026, 8, 28, 14, 31), autor: 'D. Huamán', visibilidad: 'visible', texto: 'Hola' },
      ],
    });
    expect(w.find('i').exists()).toBe(false);
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('svg').exists()).toBe(false);
    const clases = [w.element, ...w.element.querySelectorAll('*')].flatMap((e) => [...e.classList]);
    expect(clases.filter((c) => c === 'rounded-full' || /^rounded-(md|lg)$/.test(c))).toEqual([]);
    expect(clases.filter((c) => /^h-(1\.5|2)$/.test(c))).toEqual([]);
    expect(clases.filter((c) => /^(border-[lr]-|border-x|divide-x)/.test(c))).toEqual([]);
    // El único color de la tabla es el azul del enlace de Ref. (tinta).
    const conColor = clases.filter((c) => /^(bg|text|border)-(red|amber|green|sky|violet|teal|primary)-/.test(c));
    expect([...new Set(conColor)]).toEqual(['text-primary-600']);
    expect(clases.filter((c) => c.startsWith('bg-'))).toEqual([]);
  });

  it('el orden de las filas es el que entrega el padre', () => {
    const w = montar({ filas: [...FILAS].reverse() });
    expect(w.findAll('tbody tr')[0].text()).toContain('LAP-0142');
  });

  it('lleva data-libro para la impresión', () => {
    expect(montar().attributes('data-libro')).toBeDefined();
  });
});
