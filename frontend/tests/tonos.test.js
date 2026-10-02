// Mapa único de tonos (core/tonos.js, plan Ciclo 21 §3.8, regla 24).
//
// Dos garantías que antes dependían de que alguien se acordara:
//   1. Todo estado de core/dominio-*.js tiene un tono ASIGNADO en el mapa:
//      ninguno cae al tono por defecto (gris) sin que se haya decidido.
//   2. Una prioridad (o severidad) nunca comparte clase con un estado. Antes
//      reabierto/urgente/sin_vincular eran los tres rojos y rechazado/baja los
//      dos grises; ahora lo que separa a la prioridad del estado neutro es el
//      modificador `badge--rango` (tipografía de rango escrito).
import { describe, it, expect } from 'vitest';
import {
  TONOS,
  NOMBRES_TONO,
  TONO_POR_DEFECTO,
  MAPAS_DE_TONO,
  TONO_ESTADO_TICKET,
  TONO_PRIORIDAD,
  TONO_RELOJ_TICKET,
  claseBadge,
  clasesTag,
  clasesSello,
  esTono,
  normalizarTono,
  tonoAppTag,
} from '../src/core/tonos.js';
import { badgeInfo } from '../src/core/badges.js';
import { rolDeTag, esRango } from '../src/core/tagRol.js';
import { ESTADOS_TICKET, PRIORIDADES_TICKET } from '../src/core/dominio-tickets.js';
import { ESTADOS_EMPLEADO } from '../src/core/dominio-empleados.js';
import { SITUACIONES_EQUIPO, ESTADOS_FISICO_EQUIPO } from '../src/core/dominio-equipos.js';
import { ESTADOS_KB } from '../src/core/dominio-kb.js';
import { ESTADOS_PROBLEMA, SEVERIDADES_PROBLEMA, ESTADOS_ACCION } from '../src/core/dominio-problemas.js';
import { CATEGORIAS_ACCESO_SENSIBLE } from '../src/core/dominio-accesos-sensibles.js';
import { CLASE_VENCIMIENTO_LICENCIA } from '../src/core/dominio-licencias.js';
import { ESTADOS_SOLICITUD, ESTADOS_PASO } from '../src/core/dominio-solicitudes.js';
import { ESTADOS_CAMBIO, TIPOS_CAMBIO, RIESGOS_CAMBIO, CRITICIDADES_SERVICIO } from '../src/core/dominio-cambios.js';

// dominio → [mapa de tono, claves que el dominio conoce, ¿es de rango?]
const DOMINIOS = [
  ['ticket', 'ticket', ESTADOS_TICKET, false],
  ['prioridad', 'prioridad', PRIORIDADES_TICKET, true],
  ['empleado', 'empleado', ESTADOS_EMPLEADO, false],
  ['situacion', 'situacion_equipo', SITUACIONES_EQUIPO, false],
  ['kb_estado', 'kb_estado', ESTADOS_KB, false],
  ['problema_estado', 'problema_estado', ESTADOS_PROBLEMA, false],
  ['problema_severidad', 'problema_severidad', SEVERIDADES_PROBLEMA, true],
  ['accion_estado', 'accion_estado', ESTADOS_ACCION, false],
  ['categoria_acceso_sensible', 'categoria_acceso_sensible', CATEGORIAS_ACCESO_SENSIBLE, false],
  ['solicitud', 'solicitud_estado', ESTADOS_SOLICITUD, false],
  ['paso_solicitud', 'solicitud_paso_estado', ESTADOS_PASO, false],
  ['cambio', 'cambio_estado', ESTADOS_CAMBIO, false],
  ['tipo_cambio', 'cambio_tipo', TIPOS_CAMBIO, false],
  ['riesgo_cambio', 'cambio_riesgo', RIESGOS_CAMBIO, true],
  ['criticidad_servicio', 'servicio_criticidad', CRITICIDADES_SERVICIO, true],
];

describe('definición de los tonos', () => {
  it('son exactamente los siete del plan', () => {
    expect([...NOMBRES_TONO].sort()).toEqual(
      ['accion', 'categoria', 'critico', 'espera', 'neutro', 'ok', 'trabajando'].sort(),
    );
  });

  it('cada tono es fondo 50 + texto 800 de la paleta existente (neutro: gray-100 + gray-700)', () => {
    const esperado = {
      accion: 'amber',
      trabajando: 'sky',
      espera: 'violet',
      ok: 'green',
      critico: 'red',
      categoria: 'teal',
    };
    for (const [tono, color] of Object.entries(esperado)) {
      expect(TONOS[tono].tag).toBe(`bg-${color}-50 text-${color}-800`);
    }
    expect(TONOS.neutro.tag).toBe('bg-gray-100 text-gray-700');
  });

  it('el azul de marca no es un tono de estado', () => {
    for (const t of Object.values(TONOS)) expect(t.tag).not.toMatch(/primary/);
  });

  it('solo neutro, ok y critico tienen sello (regla 15)', () => {
    expect(NOMBRES_TONO.filter((t) => clasesSello(t)).sort()).toEqual(['critico', 'neutro', 'ok']);
    for (const t of ['neutro', 'ok', 'critico']) {
      expect(clasesSello(t)).toMatch(/^border-\w+-\d+ text-\w+-\d+$/);
    }
  });

  it('acepta el nombre histórico de AppTag y el semántico', () => {
    expect(normalizarTono('success')).toBe('ok');
    expect(normalizarTono('warning')).toBe('accion');
    expect(normalizarTono('danger')).toBe('critico');
    expect(normalizarTono('purple')).toBe('espera');
    expect(normalizarTono('sky')).toBe('trabajando');
    expect(normalizarTono('teal')).toBe('categoria');
    expect(normalizarTono('neutral')).toBe('neutro');
    expect(normalizarTono('ok')).toBe('ok');
    expect(normalizarTono('algo-raro')).toBe(TONO_POR_DEFECTO);
    expect(esTono('ok')).toBe(true);
    expect(esTono('success')).toBe(false);
    expect(clasesTag('success')).toBe(clasesTag('ok'));
    expect(clasesTag('inexistente')).toBe(TONOS.neutro.tag);
  });

  it('claseBadge ida y vuelta con rolDeTag', () => {
    for (const nombre of NOMBRES_TONO) {
      const clase = claseBadge(nombre);
      expect(clase).toBe(`badge--${tonoAppTag(nombre)}`);
      expect(rolDeTag(clase)).toBe(tonoAppTag(nombre));
      expect(esRango(clase)).toBe(false);
      expect(esRango(claseBadge(nombre, { rango: true }))).toBe(true);
      expect(rolDeTag(claseBadge(nombre, { rango: true }))).toBe(tonoAppTag(nombre));
    }
  });

  it('rolDeTag conserva su contrato previo', () => {
    expect(rolDeTag('badge--success')).toBe('success');
    expect(rolDeTag('success')).toBe('success');
    expect(rolDeTag('badge--info')).toBe('info');
    expect(rolDeTag('')).toBe('neutral');
    expect(rolDeTag(undefined)).toBe('neutral');
    // Un tono semántico se traduce al nombre histórico que entiende AppTag.
    expect(rolDeTag('ok')).toBe('success');
  });
});

describe('todo valor de todos los mapas es un tono válido', () => {
  for (const [nombre, mapa] of Object.entries(MAPAS_DE_TONO)) {
    it(nombre, () => {
      for (const [clave, tono] of Object.entries(mapa)) {
        expect(esTono(tono), `${nombre}.${clave} = ${tono}`).toBe(true);
      }
    });
  }
});

describe('cada estado de core/dominio-*.js tiene tono asignado', () => {
  for (const [tipo, mapaTono, dominio, rango] of DOMINIOS) {
    it(`${tipo}: ninguno cae al tono por defecto sin estar asignado`, () => {
      const claves = Object.keys(dominio);
      expect(claves.length).toBeGreaterThan(0);
      for (const clave of claves) {
        const tono = MAPAS_DE_TONO[mapaTono][clave];
        expect(tono, `${tipo}.${clave} no está en el mapa de tonos`).toBeDefined();
        // Lo que el dominio devuelve ES lo que dice el mapa (no una copia).
        expect(dominio[clave].clase, `${tipo}.${clave}`).toBe(claseBadge(tono, { rango }));
        expect(badgeInfo(tipo, clave).clase).toBe(claseBadge(tono, { rango }));
      }
    });
  }

  it('estado físico del equipo (operativo incluido)', () => {
    for (const clave of Object.keys(ESTADOS_FISICO_EQUIPO)) {
      const tono = MAPAS_DE_TONO.estado_fisico_equipo[clave];
      expect(tono, clave).toBeDefined();
      expect(ESTADOS_FISICO_EQUIPO[clave].clase).toBe(claseBadge(tono));
    }
  });

  it('vencimiento de licencias', () => {
    for (const clave of Object.keys(CLASE_VENCIMIENTO_LICENCIA)) {
      const tono = MAPAS_DE_TONO.vencimiento_licencia[clave];
      expect(tono, clave).toBeDefined();
      expect(CLASE_VENCIMIENTO_LICENCIA[clave]).toBe(claseBadge(tono));
    }
  });

  it('categorías: tipo de cuenta y de ubicación salen del mapa', () => {
    for (const [tipo, mapa] of [['tipo_cuenta', 'tipo_cuenta'], ['tipo_ubicacion', 'tipo_ubicacion']]) {
      for (const [clave, tono] of Object.entries(MAPAS_DE_TONO[mapa])) {
        expect(badgeInfo(tipo, clave).clase).toBe(claseBadge(tono));
      }
    }
    expect(badgeInfo('tipo_cuenta', 'compartida').clase).toBe('badge--teal');
  });

  it('staff activo / inactivo', () => {
    expect(badgeInfo('activo_staff', true).clase).toBe(claseBadge('ok'));
    expect(badgeInfo('activo_staff', false).clase).toBe(claseBadge('neutro'));
  });

  it('el mapa del ticket anticipa en_espera_usuario (plan V2) y el reloj', () => {
    expect(TONO_ESTADO_TICKET.en_espera_usuario).toBe('espera');
    expect(TONO_RELOJ_TICKET).toEqual({
      en_plazo: 'ok',
      por_vencer: 'accion',
      vencido: 'critico',
      pausado: 'neutro',
    });
  });

  it('licencia: vigente ok, por vencer acción, vencida crítico', () => {
    expect(CLASE_VENCIMIENTO_LICENCIA.vigente).toBe('badge--success');
    expect(CLASE_VENCIMIENTO_LICENCIA.por_vencer).toBe('badge--warning');
    expect(CLASE_VENCIMIENTO_LICENCIA.vencida).toBe('badge--danger');
  });

  it('empleado: Activo ok, Inactivo neutro, Suspendido acción', () => {
    expect(ESTADOS_EMPLEADO.Activo.clase).toBe('badge--success');
    expect(ESTADOS_EMPLEADO.Inactivo.clase).toBe('badge--neutral');
    expect(ESTADOS_EMPLEADO.Suspendido.clase).toBe('badge--warning');
  });
});

describe('colisiones estado ↔ prioridad (regla 24)', () => {
  const clasesEstadoTicket = Object.values(ESTADOS_TICKET).map((e) => e.clase);
  const clasesEstadoProblema = Object.values(ESTADOS_PROBLEMA).map((e) => e.clase);

  it('la clase de una prioridad nunca coincide con la de un estado de ticket', () => {
    for (const [p, info] of Object.entries(PRIORIDADES_TICKET)) {
      expect(clasesEstadoTicket, `prioridad ${p}`).not.toContain(info.clase);
      expect(info.clase, `prioridad ${p}`).toContain('badge--rango');
    }
  });

  it('la severidad de un problema nunca coincide con un estado de problema ni de ticket', () => {
    for (const [s, info] of Object.entries(SEVERIDADES_PROBLEMA)) {
      expect(clasesEstadoProblema, `severidad ${s}`).not.toContain(info.clase);
      expect(clasesEstadoTicket, `severidad ${s}`).not.toContain(info.clase);
    }
  });

  it('ningún estado de ticket es "rango" ni ningún rango es estado', () => {
    for (const c of clasesEstadoTicket) expect(esRango(c)).toBe(false);
    for (const info of Object.values(PRIORIDADES_TICKET)) expect(esRango(info.clase)).toBe(true);
  });

  it('solo urgente es roja entre las prioridades; el rojo ya no es de un estado de ticket', () => {
    const rojas = Object.entries(TONO_PRIORIDAD).filter(([, t]) => t === 'critico').map(([p]) => p);
    expect(rojas).toEqual(['urgente']);
    // reabierto era rojo (igual que urgente): ahora pide acción (ámbar).
    expect(Object.values(TONO_ESTADO_TICKET)).not.toContain('critico');
  });

  it('baja/media/alta ya no usan teal ni violeta (reservados a categoría y espera)', () => {
    for (const p of ['baja', 'media', 'alta']) {
      expect(rolDeTag(PRIORIDADES_TICKET[p].clase)).toBe('neutral');
    }
    expect(rolDeTag(PRIORIDADES_TICKET.urgente.clase)).toBe('danger');
  });

  it('ticket sin vincular no comparte tono con urgente', () => {
    expect(badgeInfo('ticket_sin_vincular', true).clase).not.toBe(PRIORIDADES_TICKET.urgente.clase);
    expect(rolDeTag(badgeInfo('ticket_sin_vincular', true).clase)).not.toBe('danger');
  });
});
