// La categoría "Alta a medias" dentro del feed de pendientes del Inicio.
//
// El feed es el núcleo del Inicio: fusiona todas las categorías y las
// ordena por urgencia real. Una categoría nueva que se cuele en el tier
// equivocado no rompe nada visiblemente — simplemente empuja hacia abajo algo
// más urgente, y eso no se nota hasta que alguien no atiende lo que debía.
//
// Desde la migración 103 el feed se arma a partir del resumen de la RPC
// `dashboard_resumen` (`altas_incompletas`): la ventana de 30 días ya la
// aplica el servidor; acá solo se prueba cómo se presenta y se ordena.

import { describe, it, expect } from 'vitest';
import { construirFeedPendientes } from '../src/modules/dashboard/pendientesFeed.js';
import { resumenVacio, cuenta, AHORA } from './stubs/resumen-inicio.js';

function alta(extra = {}) {
  return {
    empleado_id: 'e1', nombre: 'Rosa Quispe', cargo: 'Asistente',
    fecha_alta: '2026-09-30', dias: 1, faltan: ['cuenta'], ...extra,
  };
}

function soloAltas(altas) {
  return construirFeedPendientes(resumenVacio({ altas_incompletas: altas }), { ahora: AHORA });
}

describe('Alta a medias — presencia y contenido', () => {
  it('produce un ítem con destino a la ficha de la persona', () => {
    const [i] = soloAltas([alta()]);
    expect(i.titulo).toBe('Alta a medias');
    expect(i.sujeto).toBe('Rosa Quispe');
    // El destino es donde se resuelve: la ficha, que es desde donde se le
    // crea la cuenta.
    expect(i.destino).toBe('/empleados/e1');
    expect(i.key).toBe('alta-e1');
    expect(i.grupo).toBe('accesos');
  });

  it('el contexto dice qué falta y desde cuándo entró', () => {
    expect(soloAltas([alta({ dias: 0, fecha_alta: '2026-10-01' })])[0].contexto).toContain('entró hoy');
    const c = soloAltas([alta({ dias: 5, fecha_alta: '2026-09-26' })])[0].contexto;
    expect(c).toContain('Sin cuenta');
    expect(c).toContain('entró el 26/09/2026');
  });

  it('incluye el cargo cuando existe y no deja basura cuando no', () => {
    expect(soloAltas([alta({ cargo: 'Asistente' })])[0].contexto).toContain('Asistente');
    const sinCargo = soloAltas([alta({ cargo: '' })])[0].contexto;
    expect(sinCargo).not.toContain('·  ·');
    expect(sinCargo.endsWith('·')).toBe(false);
    expect(sinCargo).toContain('Sin cuenta');
  });

  it('sin altas incompletas no agrega nada, y sin resumen devuelve un feed vacío', () => {
    expect(soloAltas([])).toHaveLength(0);
    expect(construirFeedPendientes(null)).toEqual([]);
    expect(construirFeedPendientes(resumenVacio({ altas_incompletas: null }))).toEqual([]);
  });

  it('la antigüedad de la columna sale de los días del alta', () => {
    expect(soloAltas([alta({ dias: 0 })])[0].antiguedad).toBe('hoy');
    expect(soloAltas([alta({ dias: 4 })])[0].antiguedad).toBe('4 d');
  });
});

describe('Alta a medias — urgencia', () => {
  it('los primeros días son atención, no crisis: un alta en curso no es un olvido', () => {
    for (const dias of [0, 1, 3]) {
      const [i] = soloAltas([alta({ dias })]);
      expect(i.tier).toBe(2);
    }
  });

  it('pasados 3 días sube a crítico: son días de alguien sin poder trabajar', () => {
    const [i] = soloAltas([alta({ dias: 4 })]);
    expect(i.tier).toBe(1);
  });

  it('dentro del feed completo, un alta vieja se ordena entre lo crítico', () => {
    const feed = construirFeedPendientes(
      resumenVacio({
        cuentas_sin_password: [cuenta({ cuenta_id: 'c1', usuario: 'x@y.pe', plataforma: 'P' })],
        altas_incompletas: [alta({ dias: 9 })],
      }),
      { ahora: AHORA },
    );
    expect(feed.map((i) => i.tier)).toEqual([1, 1]);
    // `cuentas_sin_password` no tiene fecha confiable (diasUrgencia null) y por
    // regla del feed queda al final de su tier; el alta con 9 días la precede.
    expect(feed[0].titulo).toBe('Alta a medias');
  });

  it('un alta reciente NO se cuela por delante de algo crítico', () => {
    const feed = construirFeedPendientes(
      resumenVacio({
        equipos_sin_devolver: [{ asignacion_id: 'a1', codigo: 'TI-1', equipo: 'Laptop', empleado: 'N', empleado_id: 'e9', desde: '2026-01-01' }],
        altas_incompletas: [alta({ dias: 1 })],
      }),
      { ahora: AHORA },
    );
    expect(feed[0].titulo).toBe('Sin devolver');
    expect(feed[1].titulo).toBe('Alta a medias');
  });

  it('varias altas se ordenan por antigüedad, la más vieja primero', () => {
    const feed = soloAltas([
      alta({ empleado_id: 'a', nombre: 'Reciente', dias: 5 }),
      alta({ empleado_id: 'b', nombre: 'Vieja', dias: 20 }),
    ]);
    expect(feed.map((i) => i.sujeto)).toEqual(['Vieja', 'Reciente']);
  });
});
