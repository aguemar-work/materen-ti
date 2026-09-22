// @vitest-environment happy-dom
//
// TicketTimelineUnificado.vue — Fase 2, paso 4 ("Timeline Unificado").
// Hallazgo, no supuesto: este componente NO usa ninguna clase de Tailwind
// (es 100% clases semánticas .timeline/.tk-timeline/.tk-comentario-bubble/
// etc., ninguna con respaldo en main.css desde el reinicio de diseño del
// 2026-09-05) y no tiene ni un solo <table>, <button> o modal — nada que
// migrar a AppTable/AppButton/ConfirmDialog. La premisa de "verificar que
// hereda tipografía/fondos tenues de Tailwind" no aplica literalmente: no
// hay ninguna regla de Tailwind apuntando a estas clases todavía (main.css
// sigue vacío salvo el tema de color), así que no hay nada que "heredar" —
// ver el hallazgo completo en el reporte de la Fase 2. Este test verifica
// que la migración de los archivos que SÍ se tocaron (TicketDetalleView/
// TicketDetallePanel) no rompió la estructura ni las clases de este
// componente compartido, que ninguno de los dos modifica.
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

describe('TicketTimelineUnificado.vue — sin cambios en Fase 2 (verificado, no migrado)', () => {
  it('sigue sin usar ninguna clase de Tailwind (nada que migrar acá)', () => {
    const w = montar();
    const clasesTailwindLike = /\b(bg-|text-|border-|flex|grid|p-\d|m-\d)/;
    expect(w.html()).not.toMatch(clasesTailwindLike);
  });

  it('renderiza eventos y comentarios en el mismo feed, en orden', () => {
    const w = montar();
    const items = w.findAll('.timeline-item');
    expect(items.length).toBe(2);
    expect(items[0].text()).toContain('Ticket creado');
    expect(items[1].text()).toContain('Ya reviso esto.');
  });

  it('distingue nota interna vs visible para el empleado (señal de control de acceso, no solo estética)', () => {
    const w = montar();
    const burbuja = w.find('.tk-comentario-bubble');
    expect(burbuja.classes()).toContain('tk-comentario-bubble--interno');
    expect(burbuja.text()).toContain('Nota interna');
  });

  it('sin filas muestra el estado vacío', () => {
    const w = montar({ filas: [] });
    expect(w.text()).toContain('Sin actividad todavía');
  });
});
