// Las solicitudes de servicio abiertas (migración 108) dentro del feed de
// pendientes del Inicio. Reemplazan a la vieja categoría "Alta a medias", que se
// adivinaba en el cliente (30 días sin cuenta): ahora el servidor guarda el
// trámite y manda su avance; acá solo se prueba cómo se presenta y se ordena.
//
// El feed fusiona todas las categorías y las ordena por urgencia real: una
// categoría que se cuele en el tier equivocado empuja hacia abajo algo más
// urgente sin que nada se rompa a la vista.
import { describe, it, expect } from 'vitest';
import { construirFeedPendientes, GRUPOS_INICIO } from '../src/modules/dashboard/pendientesFeed.js';
import { DIAS_SOLICITUD_CRITICA } from '../src/core/dominio-solicitudes.js';
import { normalizarResumen } from '../src/core/resumen-inicio.js';
import { resumenVacio, cuenta, solicitud, AHORA } from './stubs/resumen-inicio.js';

const soloSolicitudes = (lista) => construirFeedPendientes(resumenVacio({ solicitudes_abiertas: lista }), { ahora: AHORA });

describe('Solicitudes abiertas — presencia y contenido', () => {
  it('un ítem por solicitud, con su código, el tipo, la persona y el destino al expediente de la solicitud', () => {
    const [i] = soloSolicitudes([solicitud()]);
    expect(i).toMatchObject({
      key: 'sol-s1', grupo: 'solicitudes', codigo: 'SOL-0012', codigoTitulo: 'Número de solicitud',
      titulo: 'Alta de empleado', sujeto: 'Ana Torres', destino: '/solicitudes/s1',
    });
  });

  it('el contexto dice cuánto avanzó, qué falta y desde cuándo está abierta', () => {
    expect(soloSolicitudes([solicitud()])[0].contexto)
      .toBe('1 de 7 pasos · falta: Crear la cuenta de correo · abierta el 28/09/2026');
    expect(soloSolicitudes([solicitud({ dias: 0, creada_at: '2026-10-01T13:00:00Z' })])[0].contexto).toContain('abierta hoy');
  });

  it('con un solo paso habla en singular y sin paso siguiente no inventa "falta"', () => {
    const c = soloSolicitudes([solicitud({ pasos_total: 1, pasos_hechos: 0, siguiente: null })])[0].contexto;
    expect(c).toContain('0 de 1 paso ');
    expect(c).not.toContain('falta');
    expect(c).not.toContain('·  ·');
  });

  it('la antigüedad de la columna sale de los días de la solicitud', () => {
    expect(soloSolicitudes([solicitud({ dias: 0 })])[0].antiguedad).toBe('hoy');
    expect(soloSolicitudes([solicitud({ dias: 4 })])[0].antiguedad).toBe('4 d');
  });

  it('sin solicitudes no agrega nada; sin resumen o sin módulo (null) devuelve un feed vacío', () => {
    expect(soloSolicitudes([])).toHaveLength(0);
    expect(construirFeedPendientes(null)).toEqual([]);
    expect(construirFeedPendientes(normalizarResumen(resumenVacio({ solicitudes_abiertas: null })))).toEqual([]);
  });

  it('el grupo existe en las vistas del Inicio y lee solicitudes_abiertas', () => {
    expect(GRUPOS_INICIO.solicitudes).toEqual({ label: 'Solicitudes', secciones: ['solicitudes_abiertas'] });
  });
});

describe('Solicitudes abiertas — urgencia', () => {
  it('los primeros días son atención, no crisis: un trámite en curso no es un olvido', () => {
    for (const dias of [0, 1, DIAS_SOLICITUD_CRITICA]) {
      expect(soloSolicitudes([solicitud({ dias })])[0].tier).toBe(2);
    }
  });

  it('un alta o una baja pasados 3 días suben a crítico (alguien sin poder trabajar / accesos de quien se fue)', () => {
    expect(soloSolicitudes([solicitud({ dias: 4 })])[0].tier).toBe(1);
    expect(soloSolicitudes([solicitud({ tipo_id: 'baja_empleado', tipo: 'Baja de empleado', dias: 4 })])[0].tier).toBe(1);
  });

  it('los demás tipos siguen siendo atención aunque pasen los días', () => {
    for (const tipo_id of ['cambio_puesto', 'acceso_nuevo', 'entrega_equipo', 'devolucion_equipo', 'licencia']) {
      expect(soloSolicitudes([solicitud({ tipo_id, dias: 30 })])[0].tier, tipo_id).toBe(2);
    }
  });

  it('dentro del feed completo, un alta vieja se ordena entre lo crítico', () => {
    const feed = construirFeedPendientes(
      resumenVacio({
        cuentas_sin_password: [cuenta({ cuenta_id: 'c1', usuario: 'x@y.pe', plataforma: 'P' })],
        solicitudes_abiertas: [solicitud({ dias: 9 })],
      }),
      { ahora: AHORA },
    );
    expect(feed.map((i) => i.tier)).toEqual([1, 1]);
    // `cuentas_sin_password` no tiene fecha confiable (diasUrgencia null) y por
    // regla del feed queda al final de su tier; la solicitud con 9 días la precede.
    expect(feed[0].grupo).toBe('solicitudes');
  });

  it('una solicitud reciente NO se cuela por delante de algo crítico', () => {
    const feed = construirFeedPendientes(
      resumenVacio({
        equipos_sin_devolver: [{ asignacion_id: 'a1', codigo: 'TI-1', equipo: 'Laptop', empleado: 'N', empleado_id: 'e9', desde: '2026-01-01' }],
        solicitudes_abiertas: [solicitud({ dias: 1 })],
      }),
      { ahora: AHORA },
    );
    expect(feed[0].titulo).toBe('Sin devolver');
    expect(feed[1].grupo).toBe('solicitudes');
  });

  it('varias solicitudes se ordenan por antigüedad, la más vieja primero', () => {
    const feed = soloSolicitudes([
      solicitud({ solicitud_id: 'a', empleado: 'Reciente', dias: 5 }),
      solicitud({ solicitud_id: 'b', empleado: 'Vieja', dias: 20 }),
    ]);
    expect(feed.map((i) => i.sujeto)).toEqual(['Vieja', 'Reciente']);
  });
});
