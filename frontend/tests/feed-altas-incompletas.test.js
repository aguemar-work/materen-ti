// La categoría "Alta sin completar" dentro del feed de pendientes.
//
// El feed es el núcleo del Dashboard: fusiona todas las categorías y las
// ordena por urgencia real. Una categoría nueva que se cuele en el tier
// equivocado no rompe nada visiblemente — simplemente empuja hacia abajo algo
// más urgente, y eso no se nota hasta que alguien no atiende lo que debía.

import { describe, it, expect } from 'vitest';
import { construirFeedPendientes } from '../src/modules/dashboard/pendientesFeed.js';

const VACIO = {
  porRotar: [], sinPassword: [], licenciasPorVencer: [],
  equiposSinDevolver: [], garantiasPorVencer: [],
};
const SIN_TICKETS = { sinAsignar: [], sinVincular: [], abiertosViejos: [] };

function alta(extra = {}) {
  return {
    empleado_id: 'e1', nombre: 'Rosa Quispe', cargo: 'Asistente',
    fecha_alta: '2026-08-28', dias: 1, faltan: ['cuenta'], ...extra,
  };
}

function soloAltas(altas) {
  return construirFeedPendientes(VACIO, SIN_TICKETS, {}, altas);
}

describe('Alta sin completar — presencia y contenido', () => {
  it('produce un ítem con destino a la ficha de la persona', () => {
    const [i] = soloAltas([alta()]);
    expect(i.categoriaLabel).toBe('Alta sin completar');
    expect(i.titulo).toBe('Rosa Quispe');
    // El destino es donde se resuelve: la ficha, que es desde donde se le
    // crea la cuenta.
    expect(i.destino).toBe('/empleados/e1');
    expect(i.key).toBe('alta-e1');
  });

  it('el contexto dice cuánto lleva así, en singular y plural', () => {
    expect(soloAltas([alta({ dias: 0 })])[0].contexto).toContain('Entró hoy');
    expect(soloAltas([alta({ dias: 1 })])[0].contexto).toContain('hace 1 día');
    expect(soloAltas([alta({ dias: 5 })])[0].contexto).toContain('hace 5 días');
  });

  it('incluye el cargo cuando existe y no deja basura cuando no', () => {
    expect(soloAltas([alta({ cargo: 'Asistente' })])[0].contexto).toContain('Asistente');
    const sinCargo = soloAltas([alta({ cargo: '' })])[0].contexto;
    expect(sinCargo).not.toContain('·  ·');
    expect(sinCargo).toContain('sin cuenta');
  });

  it('sin altas incompletas no agrega nada, y el argumento es opcional', () => {
    expect(soloAltas([])).toHaveLength(0);
    // Firma retrocompatible: quien no pase el 4.º argumento no debe romperse.
    expect(construirFeedPendientes(VACIO, SIN_TICKETS, {})).toEqual([]);
  });
});

describe('Alta sin completar — urgencia', () => {
  it('los primeros días son atención, no crisis: un alta en curso no es un olvido', () => {
    for (const dias of [0, 1, 3]) {
      const [i] = soloAltas([alta({ dias })]);
      expect(i.tier).toBe(2);
      expect(i.colorFamilia).toBe('warning');
    }
  });

  it('pasados 3 días sube a crítico: son días de alguien sin poder trabajar', () => {
    const [i] = soloAltas([alta({ dias: 4 })]);
    expect(i.tier).toBe(1);
    expect(i.colorFamilia).toBe('danger');
  });

  it('dentro del feed completo, un alta vieja se ordena entre lo crítico', () => {
    const feed = construirFeedPendientes(
      { ...VACIO, sinPassword: [{ cuenta_id: 'c1', usuario: 'x@y.pe', plataforma: 'P', titulares: [] }] },
      SIN_TICKETS, {},
      [alta({ dias: 9 })],
    );
    expect(feed.map((i) => i.tier)).toEqual([1, 1]);
    // `sinPassword` no tiene fecha confiable (diasUrgencia null) y por regla
    // del feed queda al final de su tier; el alta con 9 días la precede.
    expect(feed[0].categoriaLabel).toBe('Alta sin completar');
  });

  it('un alta reciente NO se cuela por delante de algo crítico', () => {
    const feed = construirFeedPendientes(
      { ...VACIO, equiposSinDevolver: [{ asignacion_id: 'a1', codigo: 'TI-1', equipo: 'Laptop', empleado: 'N' }] },
      SIN_TICKETS, {},
      [alta({ dias: 1 })],
    );
    expect(feed[0].categoriaLabel).toBe('Equipo sin devolver');
    expect(feed[1].categoriaLabel).toBe('Alta sin completar');
  });

  it('varias altas se ordenan por antigüedad, la más vieja primero', () => {
    const feed = soloAltas([
      alta({ empleado_id: 'a', nombre: 'Reciente', dias: 5 }),
      alta({ empleado_id: 'b', nombre: 'Vieja', dias: 20 }),
    ]);
    expect(feed.map((i) => i.titulo)).toEqual(['Vieja', 'Reciente']);
  });
});
