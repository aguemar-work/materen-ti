// Formateadores que alimentan el reporte de tickets: tiempos de atención y
// variación contra el periodo anterior. Los usan a la vez la pantalla y el PDF,
// así que un cambio acá cambia los dos.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { formatHoras, formatDelta, fechaISO, fechaLocalISO } from '../src/core/formatters.js';

// T-01 (auditoría 2026-08-05): `new Date().toISOString().split('T')[0]` convierte
// a UTC — en Lima (UTC-5) eso devuelve el día SIGUIENTE para cualquier hora local
// a partir de las 19:00. fechaISO()/fechaLocalISO() deben usar getters locales,
// no toISOString(), y este test fija TZ=America/Lima para probarlo de verdad
// (Node respeta process.env.TZ dinámicamente, no solo al arrancar).
describe('fechaISO / fechaLocalISO — no reproducen el corte UTC', () => {
  const tzOriginal = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Lima';
  });

  afterAll(() => {
    if (tzOriginal === undefined) delete process.env.TZ;
    else process.env.TZ = tzOriginal;
  });

  it('a las 20:00 hora de Lima, toISOString() ya cruzó a "mañana" pero fechaISO no', () => {
    const fecha = new Date(2026, 7, 5, 20, 0); // 05/08/2026 20:00 hora Lima
    expect(fecha.toISOString().split('T')[0]).toBe('2026-08-06'); // el bug, si se usara esto
    expect(fechaISO(fecha)).toBe('2026-08-05'); // la fecha real en Lima
  });

  it('fechaLocalISO() usa el reloj del sistema en hora local, no UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 5, 23, 30)); // 23:30 hora Lima, mismo día
    expect(fechaLocalISO()).toBe('2026-08-05');
    vi.useRealTimers();
  });

  it('fechaLocalISO admite desplazamiento en días, hacia el futuro y el pasado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 5, 12, 0));
    expect(fechaLocalISO(30)).toBe('2026-09-04');
    expect(fechaLocalISO(-10)).toBe('2026-07-26');
    vi.useRealTimers();
  });
});

describe('formatHoras', () => {
  it('usa minutos cuando la atención fue de menos de una hora', () => {
    expect(formatHoras(0.25)).toBe('15 min');
    expect(formatHoras(0.98)).toBe('59 min');
    expect(formatHoras(0)).toBe('0 min');
  });

  it('usa horas con un decimal por debajo de un día', () => {
    expect(formatHoras(1)).toBe('1.0 h');
    expect(formatHoras(6.25)).toBe('6.3 h');
    expect(formatHoras(23.9)).toBe('23.9 h');
  });

  it('usa días y horas cuando ya no se lee de un vistazo', () => {
    expect(formatHoras(24)).toBe('1 d');
    expect(formatHoras(30)).toBe('1 d 6 h');
    expect(formatHoras(72.5)).toBe('3 d 1 h');
  });

  it('no inventa un cero cuando no hay dato', () => {
    expect(formatHoras(null)).toBe('—');
    expect(formatHoras(undefined)).toBe('—');
    expect(formatHoras(NaN)).toBe('—');
  });
});

describe('formatDelta', () => {
  it('marca el signo de la variación', () => {
    expect(formatDelta(12, 8)).toBe('+4');
    expect(formatDelta(9, 11)).toBe('-2');
  });

  it('dice "sin cambio" en vez de "+0"', () => {
    expect(formatDelta(7, 7)).toBe('sin cambio');
    expect(formatDelta(4.02, 4.0, 1)).toBe('sin cambio');
  });

  it('respeta los decimales y el sufijo pedidos', () => {
    expect(formatDelta(4.3, 3.9, 1)).toBe('+0.4');
    expect(formatDelta(48, 30, 0, ' pp')).toBe('+18 pp');
  });

  it('devuelve null cuando no hay con qué comparar', () => {
    expect(formatDelta(5, null)).toBeNull();
    expect(formatDelta(null, 5)).toBeNull();
    expect(formatDelta(5, undefined)).toBeNull();
  });

  // U+2212 no existe en la codificación de los PDF que genera jsPDF y saldría
  // como un carácter roto en el documento descargado.
  it('usa el guión ASCII, no el signo menos tipográfico', () => {
    expect(formatDelta(1, 5)).not.toContain('−');
  });
});
