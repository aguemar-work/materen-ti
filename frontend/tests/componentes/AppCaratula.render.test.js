// @vitest-environment happy-dom
//
// AppCaratula (regla 20): rótulo + h1 (+ sello) + dl horizontal de 3-6 pares
// + acciones, con regla horizontal a sangre. Sin avatar, sin bordes laterales.
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppCaratula from '../../src/components/ui/AppCaratula.vue';

const DATOS = [
  { rotulo: 'Empresa', valor: 'Materen' },
  { rotulo: 'Área / obra', valor: 'Obra Lurín' },
  { rotulo: 'Cargo', valor: 'Residente' },
  { rotulo: 'Alta', valor: '14/03/24' },
];

function montar(props = {}, slots = {}) {
  return mount(AppCaratula, {
    props: { rotulo: 'Empleado · DNI 45678912', titulo: 'Juan Carlos Quispe Mamani', datos: DATOS, ...props },
    slots,
  });
}

describe('AppCaratula.vue', () => {
  it('el h1 es el título y va precedido del rótulo en mayúsculas', () => {
    const w = montar();
    expect(w.findAll('h1')).toHaveLength(1);
    expect(w.get('h1').text()).toBe('Juan Carlos Quispe Mamani');
    const rotulo = w.get('p');
    expect(rotulo.text()).toBe('Empleado · DNI 45678912');
    expect(rotulo.classes()).toEqual(expect.arrayContaining(['uppercase', 'tracking-wider', 'font-semibold', 'text-gray-500']));
    // El rótulo está ANTES del h1 en el documento.
    const html = w.html();
    expect(html.indexOf('Empleado · DNI')).toBeLessThan(html.indexOf('<h1'));
  });

  it('los datos son un <dl> horizontal de pares rótulo/valor', () => {
    const w = montar();
    const dl = w.get('dl');
    expect(dl.classes()).toContain('flex');
    expect(dl.classes()).toContain('flex-wrap');
    expect(dl.findAll('dt').map((d) => d.text())).toEqual(['Empresa', 'Área / obra', 'Cargo', 'Alta']);
    expect(dl.findAll('dd').map((d) => d.text())).toEqual(['Materen', 'Obra Lurín', 'Residente', '14/03/24']);
  });

  it('un valor ausente se muestra "Sin registrar" en gris', () => {
    const w = montar({ datos: [{ rotulo: 'Cargo', valor: '' }, { rotulo: 'Alta', valor: '14/03/24' }] });
    const dd = w.findAll('dd');
    expect(dd[0].text()).toBe('Sin registrar');
    expect(dd[0].classes()).toContain('text-gray-500');
    expect(dd[1].classes()).toContain('text-gray-900');
  });

  it('un valor con formato propio entra por el slot valor-<i>', () => {
    const w = montar({}, { 'valor-1': '<a href="/x">Lurín</a>' });
    expect(w.findAll('dd')[1].find('a').exists()).toBe(true);
  });

  it('sin datos no dibuja el dl', () => {
    expect(montar({ datos: [] }).find('dl').exists()).toBe(false);
  });

  it('regla horizontal a sangre abajo, nunca bordes laterales ni avatar', () => {
    const w = montar({}, { acciones: '<button>Editar</button>', sello: '<span>x</span>' });
    expect(w.classes()).toEqual(expect.arrayContaining(['border-b', 'border-gray-200']));
    const todas = [w.element, ...w.element.querySelectorAll('*')].flatMap((e) => [...e.classList]);
    expect(todas.filter((c) => /^(border-[lr]-|border-x|divide-x)/.test(c))).toEqual([]);
    expect(w.find('img').exists()).toBe(false);
    expect(w.html()).not.toMatch(/avatar|rounded-full/i);
  });

  it('el sello va junto al título y las acciones a la derecha', () => {
    const w = montar({}, {
      sello: '<span data-test="sello">CERRADO</span>',
      acciones: '<button data-test="accion">Editar</button>',
    });
    expect(w.get('h1').element.parentElement.querySelector('[data-test="sello"]')).not.toBeNull();
    expect(w.find('[data-test="accion"]').exists()).toBe(true);
  });

  it('el rótulo admite marcado propio por slot', () => {
    const w = montar({ rotulo: '' }, { rotulo: '<b data-test="r">TICKET</b>' });
    expect(w.find('[data-test="r"]').exists()).toBe(true);
  });

  it('las acciones no se imprimen', () => {
    const w = montar({}, { acciones: '<button>Editar</button>' });
    expect(w.get('[data-no-print]').text()).toBe('Editar');
  });
});
