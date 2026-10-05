// @vitest-environment happy-dom
//
// TicketTimelineUnificado.vue — feed único de hitos + comentarios, compartido
// por TicketDetalleView (página completa) y TicketDetallePanel (Triage).
//
// Historia: en la Fase 2 (2026-09-08) este componente NO se migró (no usaba
// ninguna clase de Tailwind ni tenía botones/tablas), y el primer test de
// este archivo lo dejaba asentado ("sigue sin usar Tailwind"). En el
// rediseño del 2026-09-23 SÍ se rediseñó sobre el sistema nuevo, así que ese
// test perdió su premisa: se reemplazó por su contraparte vigente — que no
// quede ninguna de las clases heredadas sin estilo (.timeline*, .tk-*,
// .badge-inline). Los selectores de comportamiento pasaron de clases de
// estilo a atributos de datos (data-tipo / data-visibilidad), que expresan
// lo mismo sin atarse a cómo se ve.
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TicketTimelineUnificado from '../../src/modules/tickets/TicketTimelineUnificado.vue';

const FILAS = [
  { id: 'ev-1', tipo: 'evento', fecha: '2026-09-01T10:00:00.000Z', label: 'Ticket creado', color: 'info' },
  {
    id: 'com-1', tipo: 'comentario', fecha: '2026-09-01T11:00:00.000Z',
    autor_id: 'staff-1', mensaje: 'Ya reviso esto.', interno: true,
  },
];

function montar(props = {}) {
  return mount(TicketTimelineUnificado, {
    props: { filas: FILAS, autorDe: (id) => (id === 'staff-1' ? 'Sofía Medina' : 'Sistema'), ...props },
  });
}

describe('TicketTimelineUnificado.vue — feed unificado (rediseño 2026-09-23)', () => {
  it('no usa ninguna clase heredada sin estilo (.timeline*, .tk-*, .badge-inline)', () => {
    const w = montar();
    expect(w.html()).not.toMatch(/class="(?:[^"]*\s)?(?:timeline[\w-]*|tk-[\w-]+|badge-inline)(?=[\s"])/);
  });

  it('renderiza eventos y comentarios en el mismo feed, en orden', () => {
    const w = montar();
    const items = w.findAll('li[data-tipo]');
    expect(items.length).toBe(2);
    expect(items[0].attributes('data-tipo')).toBe('evento');
    expect(items[0].text()).toContain('Ticket creado');
    expect(items[1].attributes('data-tipo')).toBe('comentario');
    expect(items[1].text()).toContain('Ya reviso esto.');
  });

  it('distingue nota interna vs visible para el empleado (señal de control de acceso, no solo estética)', () => {
    const w = montar();
    const burbuja = w.find('[data-tipo="comentario"]');
    expect(burbuja.attributes('data-visibilidad')).toBe('interno');
    expect(burbuja.text()).toContain('Nota interna');

    const visible = montar({ filas: [{ ...FILAS[1], id: 'com-2', interno: false }] });
    expect(visible.find('[data-tipo="comentario"]').attributes('data-visibilidad')).toBe('visible');
    expect(visible.text()).toContain('Visible para el empleado');
  });

  it('sin filas muestra el estado vacío', () => {
    const w = montar({ filas: [] });
    expect(w.text()).toContain('Sin actividad todavía');
  });
});
