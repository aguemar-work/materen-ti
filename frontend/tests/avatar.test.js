import { describe, it, expect } from 'vitest';
import { tonoAvatar, inicialesDe } from '../src/core/avatar.js';

const TONOS = ['avatar--azul', 'avatar--slate', 'avatar--teal', 'avatar--violeta', 'avatar--arena'];

describe('tonoAvatar', () => {
  it('es determinístico: el mismo nombre da siempre el mismo tono', () => {
    // Es LA propiedad que justifica usar un hash en vez de un índice o un
    // random: si esto se rompe, una persona cambia de color entre pantallas
    // (o entre renders de la misma tabla) y el color deja de identificarla.
    const uno = tonoAvatar('Alejandro Guevara');
    for (let i = 0; i < 50; i++) expect(tonoAvatar('Alejandro Guevara')).toBe(uno);
  });

  it('devuelve siempre uno de los 5 tonos categóricos', () => {
    const nombres = [
      'Ana Torres', 'Bruno Díaz', 'Carla Núñez', 'Diego Fernández', 'Elena Ruiz',
      'Sofía Medina', 'Martín Silva', 'Lucía Paz', 'Javier Ortiz', 'Valeria Soto',
      'X', 'nombre con muchas palabras que no debería importar', 'ñÑáÉ',
    ];
    for (const n of nombres) expect(TONOS).toContain(tonoAvatar(n));
  });

  it('sin nombre cae en el neutro, nunca en un tono categórico', () => {
    // Un avatar teñido de un color categórico para "no sabemos quién es"
    // inventaría una identidad que no existe.
    for (const vacio of ['', null, undefined]) {
      expect(tonoAvatar(vacio)).toBe('avatar--neutro');
    }
  });

  it('nunca devuelve un color semántico', () => {
    // El color del avatar es identidad, no estado: un avatar "danger" leería
    // como una alerta sobre esa persona.
    const semanticos = ['success', 'warning', 'danger', 'info'];
    for (const n of ['Ana Torres', 'Bruno Díaz', '', 'Zoe']) {
      for (const s of semanticos) expect(tonoAvatar(n)).not.toContain(s);
    }
  });

  it('reparte sobre los 5 tonos, no colapsa en uno', () => {
    // No exige uniformidad (un hash simple no la garantiza), solo que la
    // escala se use de verdad: si todos los nombres cayeran en el mismo tono,
    // la paleta de 5 sería decorado inútil.
    const nombres = Array.from({ length: 200 }, (_, i) => `Persona Numero${i}`);
    const usados = new Set(nombres.map(tonoAvatar));
    expect(usados.size).toBe(5);
  });

  it('distingue nombres parecidos', () => {
    // El multiplicador 31 es sensible al orden, así que un anagrama no
    // colisiona por construcción (sí puede colisionar por módulo 5, que es
    // aceptable: son 5 tonos para N personas).
    expect(tonoAvatar('Ana Torres')).not.toBe(tonoAvatar('Torres Ana'));
  });
});

describe('inicialesDe', () => {
  it('toma la primera letra de las dos primeras palabras, en mayúscula', () => {
    expect(inicialesDe('Alejandro Guevara')).toBe('AG');
    expect(inicialesDe('sofía medina')).toBe('SM');
  });

  it('ignora palabras a partir de la tercera', () => {
    expect(inicialesDe('María del Carmen Pérez')).toBe('MD');
  });

  it('tolera espacios de sobra', () => {
    expect(inicialesDe('  Ana   Torres  ')).toBe('AT');
  });

  it('con una sola palabra devuelve una letra', () => {
    expect(inicialesDe('Cher')).toBe('C');
  });

  it('con un correo (único dato disponible) devuelve su primera letra', () => {
    expect(inicialesDe('soporte@empresa.com')).toBe('S');
  });

  it('sin nombre devuelve cadena vacía, no undefined ni "?"', () => {
    for (const vacio of ['', null, undefined, '   ']) {
      expect(inicialesDe(vacio)).toBe('');
    }
  });

  it('pone las mayúsculas en JS, no en CSS', () => {
    // .avatar no trae text-transform: si esta función no normalizara, las
    // iniciales se renderizarían en minúscula (le pasaba a .emp-avatar, que
    // dependía de su text-transform local).
    expect(inicialesDe('ana torres')).toBe(inicialesDe('ANA TORRES'));
  });
});
