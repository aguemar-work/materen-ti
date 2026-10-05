// timelineUnificado: merge cronológico de hitos del sistema + comentarios,
// pieza de la revisión "Filas con foco" (2026-09-04) que unifica Historial y
// Conversación en un solo feed dentro del panel de Triage. Se ejercita fuera
// de un componente, con el store de detalle poblado directo.
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTicketDetalleLogica } from '../../src/composables/useTicketDetalleLogica.js';
import { useTicketDetalleStore } from '../../src/stores/ticketDetalle.js';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('timelineUnificado', () => {
  it('intercala eventos y comentarios en orden cronológico estricto', () => {
    const store = useTicketDetalleStore();
    store.ticket = { id: 't1', estado: 'en_progreso', asignado_a: null };
    store.eventos = [
      { id: 'ev1', evento: 'creado', created_at: '2026-09-04T09:15:00Z' },
      { id: 'ev2', evento: 'estado_cambiado', detalle: 'De "abierto" a "en_progreso"', created_at: '2026-09-04T09:20:00Z' },
    ];
    store.comentarios = [
      { id: 'c1', autor_id: 'u1', mensaje: 'Hola', interno: false, created_at: '2026-09-04T09:25:00Z' },
      { id: 'c2', autor_id: 'u1', mensaje: 'Nota', interno: true, created_at: '2026-09-04T09:27:00Z' },
    ];

    const { timelineUnificado } = useTicketDetalleLogica();

    expect(timelineUnificado.value.map((f) => f.id)).toEqual(['ev1', 'ev2', 'c1', 'c2']);
    expect(timelineUnificado.value.map((f) => f.tipo)).toEqual(['evento', 'evento', 'comentario', 'comentario']);
  });

  it('preserva el flag `interno` de cada comentario dentro del feed unificado', () => {
    const store = useTicketDetalleStore();
    store.ticket = { id: 't1', estado: 'en_progreso', asignado_a: null };
    store.eventos = [];
    store.comentarios = [
      { id: 'c1', autor_id: 'u1', mensaje: 'Público', interno: false, created_at: '2026-09-04T09:00:00Z' },
      { id: 'c2', autor_id: 'u1', mensaje: 'Interno', interno: true, created_at: '2026-09-04T09:01:00Z' },
    ];

    const { timelineUnificado } = useTicketDetalleLogica();
    const filas = timelineUnificado.value;

    expect(filas.find((f) => f.id === 'c1').interno).toBe(false);
    expect(filas.find((f) => f.id === 'c2').interno).toBe(true);
  });

  it('no descarta ningún evento/comentario aunque compartan el mismo timestamp', () => {
    const store = useTicketDetalleStore();
    store.ticket = { id: 't1', estado: 'abierto', asignado_a: null };
    store.eventos = [{ id: 'ev1', evento: 'creado', created_at: '2026-09-04T09:00:00Z' }];
    store.comentarios = [{ id: 'c1', autor_id: 'u1', mensaje: 'Hola', interno: false, created_at: '2026-09-04T09:00:00Z' }];

    const { timelineUnificado } = useTicketDetalleLogica();

    expect(timelineUnificado.value).toHaveLength(2);
  });
});
