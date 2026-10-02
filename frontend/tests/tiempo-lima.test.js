// Fechas del Inicio en hora de Lima: el saludo, la fecha larga y los "hace N
// días" no dependen del reloj ni de la zona del navegador.
import { describe, it, expect } from 'vitest';
import {
  hoyLimaISO, horaLima, diaLima, diasDesde, tramoDelDia, fechaLarga, textoAntiguedad,
} from '../src/modules/dashboard/tiempoLima.js';

// Lima es UTC-5 todo el año (sin horario de verano).
const lima = (hhmm, dia = '2026-10-01') => new Date(`${dia}T${hhmm}:00-05:00`);

describe('hora y día de Lima', () => {
  it('a las 20:30 de Lima ya es otro día en UTC, pero sigue siendo el mismo día', () => {
    const ahora = new Date('2026-10-02T01:30:00Z');
    expect(hoyLimaISO(ahora)).toBe('2026-10-01');
    expect(horaLima(ahora)).toBe(20);
  });

  it('a las 23:59 de Lima y a las 00:00 siguientes cambia el día', () => {
    expect(hoyLimaISO(lima('23:59'))).toBe('2026-10-01');
    expect(hoyLimaISO(lima('00:00', '2026-10-02'))).toBe('2026-10-02');
  });

  it('diaLima respeta una fecha sola y lleva un timestamp a Lima', () => {
    expect(diaLima('2026-09-28')).toBe('2026-09-28');
    expect(diaLima('2026-09-29T02:00:00Z')).toBe('2026-09-28'); // 21:00 del 28 en Lima
    expect(diaLima(null)).toBeNull();
    expect(diaLima('no es fecha')).toBeNull();
  });

  it('diasDesde cuenta días calendario de Lima (positivo = ya pasó)', () => {
    const ahora = lima('08:00');
    expect(diasDesde('2026-10-01', ahora)).toBe(0);
    expect(diasDesde('2026-09-28T15:00:00Z', ahora)).toBe(3);
    expect(diasDesde('2026-10-04', ahora)).toBe(-3);
    expect(diasDesde(undefined, ahora)).toBeNull();
  });
});

describe('saludo según la hora de Lima', () => {
  it.each([
    ['00:00', 'Buenos días'], ['08:30', 'Buenos días'], ['11:59', 'Buenos días'],
    ['12:00', 'Buenas tardes'], ['15:00', 'Buenas tardes'], ['18:59', 'Buenas tardes'],
    ['19:00', 'Buenas noches'], ['23:30', 'Buenas noches'],
  ])('a las %s: %s', (hhmm, esperado) => {
    expect(tramoDelDia(lima(hhmm))).toBe(esperado);
  });

  it('usa la hora de Lima aunque el reloj UTC marque otro tramo', () => {
    // 01:30 UTC del 2 de octubre = 20:30 en Lima → noche (no madrugada).
    expect(tramoDelDia(new Date('2026-10-02T01:30:00Z'))).toBe('Buenas noches');
    // 14:00 UTC = 09:00 en Lima → mañana.
    expect(tramoDelDia(new Date('2026-10-01T14:00:00Z'))).toBe('Buenos días');
  });
});

describe('fecha larga', () => {
  it('"Jueves 1 de octubre", con mayúscula inicial y sin coma', () => {
    expect(fechaLarga(lima('08:00'))).toBe('Jueves 1 de octubre');
    expect(fechaLarga(lima('09:00', '2026-12-25'))).toBe('Viernes 25 de diciembre');
  });

  it('a las 20:30 de Lima sigue siendo el día de Lima', () => {
    expect(fechaLarga(new Date('2026-10-02T01:30:00Z'))).toBe('Jueves 1 de octubre');
  });
});

describe('texto de antigüedad', () => {
  it('"3 d", "hoy" y "—" para sin fecha o fecha futura', () => {
    expect(textoAntiguedad(3)).toBe('3 d');
    expect(textoAntiguedad(0)).toBe('hoy');
    expect(textoAntiguedad(null)).toBe('—');
    expect(textoAntiguedad(undefined)).toBe('—');
    expect(textoAntiguedad(-5)).toBe('—');
  });
});
