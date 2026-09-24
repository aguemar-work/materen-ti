// @vitest-environment happy-dom
//
// Estados de la interfaz (vacío, paginación, badge de dominio), montados de
// verdad. Los consume casi toda vista del sistema: un fallo acá no se ve en un
// módulo, se ve en todos a la vez.

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BadgeEstado from '../../src/components/shared/BadgeEstado.vue';
import AppVacio from '../../src/components/ui/AppVacio.vue';
import AppPaginacion from '../../src/components/ui/AppPaginacion.vue';
import { badgeInfo } from '../../src/core/badges.js';

describe('AppVacio.vue', () => {
  it('renderiza título, ícono decorativo y mensaje opcional', () => {
    const w = mount(AppVacio, { props: { titulo: 'Sin equipos', mensaje: 'Registre el primero.' } });
    expect(w.find('h2').text()).toBe('Sin equipos');
    expect(w.find('p').text()).toBe('Registre el primero.');
    // El ícono es decorativo: si perdiera aria-hidden, un lector de pantalla
    // anunciaría basura antes del título.
    expect(w.find('i').attributes('aria-hidden')).toBe('true');
  });

  it('sin mensaje no deja un párrafo vacío', () => {
    const w = mount(AppVacio, { props: { titulo: 'Sin equipos' } });
    expect(w.find('p').exists()).toBe(false);
  });

  it('el slot permite la acción que resuelve el vacío, en ambas variantes', () => {
    for (const variante of ['pagina', 'seccion']) {
      const w = mount(AppVacio, {
        props: { titulo: 'Sin equipos', variante },
        slots: { default: '<button>Agregar equipo</button>' },
      });
      expect(w.find('button').text()).toBe('Agregar equipo');
    }
  });
});

describe('AppPaginacion.vue', () => {
  const props = (p) => ({ props: { pagina: 1, tamPagina: 20, total: 45, ...p } });

  it('con una sola página muestra el rango pero oculta los controles', () => {
    const w = mount(AppPaginacion, props({ total: 12 }));
    expect(w.text()).toContain('1–12 de 12');
    expect(w.find('[aria-label="Página siguiente"]').exists()).toBe(false);
  });

  it('calcula el rango de la página actual', () => {
    const w = mount(AppPaginacion, props({ pagina: 3 }));
    expect(w.text()).toContain('41–45 de 45');
    expect(w.text()).toContain('de 3');
  });

  it('deshabilita "anterior" en la primera página y "siguiente" en la última', () => {
    const primera = mount(AppPaginacion, props());
    expect(primera.find('[aria-label="Página anterior"]').attributes('disabled')).toBeDefined();
    expect(primera.find('[aria-label="Página siguiente"]').attributes('disabled')).toBeUndefined();
    const ultima = mount(AppPaginacion, props({ pagina: 3 }));
    expect(ultima.find('[aria-label="Página siguiente"]').attributes('disabled')).toBeDefined();
  });

  it('anuncia el cambio de rango con aria-live', () => {
    const w = mount(AppPaginacion, props());
    expect(w.find('[aria-live="polite"]').text()).toContain('1–20 de 45');
  });

  it('emite el cambio de página al pulsar siguiente', async () => {
    const w = mount(AppPaginacion, props());
    await w.find('[aria-label="Página siguiente"]').trigger('click');
    expect(w.emitted('update:pagina')).toEqual([[2]]);
  });

  it('se repliega a la última página válida si el total encoge por debajo de la actual', async () => {
    // Caso real: se borra la última fila de la última página. Sin este
    // repliegue la vista queda en una página que ya no existe y se ve vacía.
    const w = mount(AppPaginacion, props({ pagina: 3 }));
    await w.setProps({ total: 25 });
    expect(w.emitted('update:pagina')).toEqual([[2]]);
  });

  it('la variante compacta dice "Página X de Y"', () => {
    const w = mount(AppPaginacion, props({ pagina: 2, variante: 'compacta' }));
    expect(w.text()).toContain('Página 2 de 3');
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
