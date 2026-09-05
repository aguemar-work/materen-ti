// @vitest-environment happy-dom
//
// Estados de la interfaz (vacío, sin dato, paginación, badge de dominio),
// montados de verdad.
//
// Los 4 componentes son chicos, pero los consume casi toda vista del sistema:
// un fallo acá no se ve en un módulo, se ve en todos a la vez. Y ninguno tenía
// cobertura: los tests existentes de `badges.test.js` prueban la FUNCIÓN
// `badgeInfo`, no que el componente aplique lo que esa función devuelve.

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BadgeEstado from '../../src/components/shared/BadgeEstado.vue';
import EmptyState from '../../src/components/shared/EmptyState.vue';
import TextoVacio from '../../src/components/shared/TextoVacio.vue';
import Pagination from '../../src/components/shared/Pagination.vue';
import { badgeInfo } from '../../src/core/badges.js';

describe('TextoVacio.vue', () => {
  it('muestra el guion largo y el tono apagado cuando no hay valor', () => {
    const w = mount(TextoVacio, { props: { valor: '' } });
    expect(w.text()).toBe('—');
    expect(w.classes()).toContain('text-muted');
  });

  it('NO trata el cero como vacío', () => {
    // Trampa clásica: con una comprobación por falsy, un contador en 0, un
    // costo de 0 o un stock de 0 se mostrarían como "sin dato".
    const w = mount(TextoVacio, { props: { valor: 0 } });
    expect(w.text()).toBe('0');
    expect(w.classes()).not.toContain('text-muted');
  });

  it('con valor real no aplica el tono apagado', () => {
    const w = mount(TextoVacio, { props: { valor: 'Lenovo' } });
    expect(w.text()).toBe('Lenovo');
    expect(w.classes()).not.toContain('text-muted');
  });

  it('acepta un placeholder propio', () => {
    const w = mount(TextoVacio, { props: { valor: null, placeholder: 'Sin asignar' } });
    expect(w.text()).toBe('Sin asignar');
  });
});

describe('EmptyState.vue', () => {
  it('renderiza título, ícono decorativo y mensaje opcional', () => {
    const w = mount(EmptyState, { props: { titulo: 'Sin equipos', mensaje: 'Registre el primero.' } });
    expect(w.find('h3').text()).toBe('Sin equipos');
    expect(w.find('p').text()).toBe('Registre el primero.');
    // El ícono es decorativo: si perdiera aria-hidden, un lector de pantalla
    // anunciaría basura antes del título.
    expect(w.find('.empty-icon i').attributes('aria-hidden')).toBe('true');
  });

  it('sin mensaje no deja un párrafo vacío', () => {
    const w = mount(EmptyState, { props: { titulo: 'Sin equipos' } });
    expect(w.find('p').exists()).toBe(false);
  });

  it('el slot permite una acción dentro del estado vacío', () => {
    const w = mount(EmptyState, {
      props: { titulo: 'Sin equipos' },
      slots: { default: '<button class="btn">Agregar equipo</button>' },
    });
    expect(w.find('button.btn').text()).toBe('Agregar equipo');
  });
});

describe('Pagination.vue', () => {
  it('con lista vacía no renderiza nada', () => {
    // Una paginación "Mostrando 0–0 de 0" debajo de un estado vacío es ruido.
    const w = mount(Pagination, { props: { modelValue: 1, totalItems: 0 } });
    expect(w.find('.pagination').exists()).toBe(false);
  });

  it('con una sola página muestra el conteo pero oculta los controles', () => {
    const w = mount(Pagination, { props: { modelValue: 1, totalItems: 12 } });
    expect(w.text()).toContain('Mostrando 1–12 de 12');
    expect(w.find('.pagination-controls').exists()).toBe(false);
  });

  it('calcula el rango de la página actual', () => {
    const w = mount(Pagination, { props: { modelValue: 3, totalItems: 45, pageSize: 20 } });
    expect(w.text()).toContain('Mostrando 41–45 de 45');
    expect(w.text()).toContain('Página 3 de 3');
  });

  it('deshabilita "anterior" en la primera página y "siguiente" en la última', () => {
    const primera = mount(Pagination, { props: { modelValue: 1, totalItems: 45, pageSize: 20 } });
    expect(primera.find('[aria-label="Página anterior"]').attributes('disabled')).toBeDefined();
    expect(primera.find('[aria-label="Página siguiente"]').attributes('disabled')).toBeUndefined();

    const ultima = mount(Pagination, { props: { modelValue: 3, totalItems: 45, pageSize: 20 } });
    expect(ultima.find('[aria-label="Página siguiente"]').attributes('disabled')).toBeDefined();
  });

  it('los botones de flecha tienen nombre accesible', () => {
    const w = mount(Pagination, { props: { modelValue: 1, totalItems: 45, pageSize: 20 } });
    expect(w.find('[aria-label="Página anterior"]').exists()).toBe(true);
    expect(w.find('[aria-label="Página siguiente"]').exists()).toBe(true);
  });

  it('anuncia el cambio de rango con aria-live', () => {
    const w = mount(Pagination, { props: { modelValue: 1, totalItems: 45 } });
    expect(w.find('.pagination').attributes('aria-live')).toBe('polite');
  });

  it('emite el cambio de página al pulsar siguiente', async () => {
    const w = mount(Pagination, { props: { modelValue: 1, totalItems: 45, pageSize: 20 } });
    await w.find('[aria-label="Página siguiente"]').trigger('click');
    expect(w.emitted('update:modelValue')).toEqual([[2]]);
  });

  it('se repliega a la última página válida si el total encoge por debajo de la actual', async () => {
    // Caso real: se está en la página 3 y un filtro reduce el resultado a 5
    // filas. Sin este repliegue la vista queda en una página que ya no existe
    // y se ve vacía sin motivo aparente.
    const w = mount(Pagination, { props: { modelValue: 3, totalItems: 45, pageSize: 20 } });
    await w.setProps({ totalItems: 5 });
    expect(w.emitted('update:modelValue')).toEqual([[1]]);
  });
});

describe('BadgeEstado.vue', () => {
  // Delega el render en CarbonTag desde el 2026-09-02, asi que lo que se
  // verifica aca es el contrato de DOMINIO: que el label y el color salgan
  // de badgeInfo() sin reinterpretarse. La presentacion (geometria, par de
  // color, punto) se verifica en carbon.render.test.js, no dos veces.
  it('aplica el label y la variante que devuelve badgeInfo, sin reinterpretarlos', () => {
    const esperado = badgeInfo('empleado', 'Activo');
    const w = mount(BadgeEstado, { props: { tipo: 'empleado', valor: 'Activo' } });
    expect(w.text()).toBe(esperado.label);
    expect(w.classes()).toContain('cds-tag');
    // badgeInfo devuelve 'badge--success'; CarbonTag lo normaliza al rol.
    expect(w.classes()).toContain(`cds-tag--${esperado.clase.replace('badge--', '')}`);
  });

  it('`status` es el punto de estado vivo, no un reemplazo del tag', () => {
    const w = mount(BadgeEstado, { props: { tipo: 'empleado', valor: 'Activo', status: true } });
    expect(w.classes()).toContain('cds-tag');
    expect(w.find('.cds-tag__punto').exists()).toBe(true);

    const sin = mount(BadgeEstado, { props: { tipo: 'empleado', valor: 'Activo' } });
    expect(sin.find('.cds-tag__punto').exists()).toBe(false);
  });

  it('un valor desconocido degrada a neutral, no rompe el render', () => {
    // El dominio evoluciona (un estado nuevo en la base antes que en el
    // frontend); el badge debe degradar, no tumbar la fila. Y tiene que
    // VERSE como un estado: hasta el 2026-09-02 los fallbacks con
    // `clase: ''` renderizaban un badge sin fondo.
    const w = mount(BadgeEstado, { props: { tipo: 'situacion', valor: 'SituacionQueNoExiste' } });
    expect(w.exists()).toBe(true);
    expect(badgeInfo('situacion', 'SituacionQueNoExiste').clase).toBe('');
    expect(w.classes()).toContain('cds-tag--neutral');
    expect(w.text()).toBe('SituacionQueNoExiste');
  });

  it('una clase pasada desde la vista llega al tag (fallthrough de atributos)', () => {
    // TicketDetalleView pasa `class="badge-inline"` para meterlo en una
    // linea de texto; con un solo nodo raiz eso tiene que caer en el tag.
    const w = mount(BadgeEstado, {
      props: { tipo: 'ticket', valor: 'abierto' },
      attrs: { class: 'badge-inline' },
    });
    expect(w.classes()).toContain('cds-tag');
    expect(w.classes()).toContain('badge-inline');
  });
});
