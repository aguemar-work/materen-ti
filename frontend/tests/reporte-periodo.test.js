// Tests de la aritmética de periodos del reporte de tickets: el recorte debe
// ser de calendario (día / semana lunes-domingo / mes completo) y no debe
// permitir reportar un periodo que todavía no empezó.
import { describe, it, expect } from 'vitest';
import {
  normalizarAncla, limitarAncla, desplazarAncla, rangoDe, enCurso, puedeAvanzar,
  etiquetaRango, etiquetaPeriodo, nombreArchivoReporte, anclaDeHoy, aniosDisponibles, aISO,
} from '../src/modules/tickets/reportePeriodo.js';

// Miércoles 05/08/2026 (semana: lunes 03 → domingo 09).
const MIERCOLES = new Date(2026, 7, 5, 15, 30);

describe('normalizarAncla', () => {
  it('deja el día tal cual en diario', () => {
    expect(normalizarAncla('diario', '2026-08-05')).toBe('2026-08-05');
  });

  it('lleva al lunes de la semana (domingo cuenta para la semana que termina)', () => {
    expect(normalizarAncla('semanal', '2026-08-05')).toBe('2026-08-03');
    expect(normalizarAncla('semanal', '2026-08-03')).toBe('2026-08-03');
    expect(normalizarAncla('semanal', '2026-08-09')).toBe('2026-08-03');
    expect(normalizarAncla('semanal', '2026-08-10')).toBe('2026-08-10');
  });

  it('lleva al día 1 del mes en mensual', () => {
    expect(normalizarAncla('mensual', '2026-08-31')).toBe('2026-08-01');
  });
});

describe('rangoDe', () => {
  it('diario cubre un solo día completo', () => {
    const { desde, hasta } = rangoDe('diario', '2026-08-05');
    expect(aISO(desde)).toBe('2026-08-05');
    expect(aISO(hasta)).toBe('2026-08-05');
    expect(desde.getHours()).toBe(0);
    expect(hasta.getHours()).toBe(23);
    expect(hasta.getMinutes()).toBe(59);
    expect(hasta.getMilliseconds()).toBe(999);
  });

  it('semanal cubre lunes a domingo aunque el ancla sea otro día', () => {
    const { desde, hasta } = rangoDe('semanal', '2026-08-06');
    expect(aISO(desde)).toBe('2026-08-03');
    expect(aISO(hasta)).toBe('2026-08-09');
  });

  it('mensual cubre el mes completo, con el último día correcto', () => {
    expect(aISO(rangoDe('mensual', '2026-08-15').hasta)).toBe('2026-08-31');
    expect(aISO(rangoDe('mensual', '2026-02-10').hasta)).toBe('2026-02-28');
    expect(aISO(rangoDe('mensual', '2028-02-10').hasta)).toBe('2028-02-29'); // bisiesto
    expect(aISO(rangoDe('mensual', '2026-04-10').hasta)).toBe('2026-04-30');
  });
});

describe('desplazarAncla', () => {
  it('avanza y retrocede un día', () => {
    expect(desplazarAncla('diario', '2026-08-05', -1)).toBe('2026-08-04');
    expect(desplazarAncla('diario', '2026-08-31', 1)).toBe('2026-09-01');
    expect(desplazarAncla('diario', '2026-01-01', -1)).toBe('2025-12-31');
  });

  it('avanza y retrocede semanas completas', () => {
    expect(desplazarAncla('semanal', '2026-08-05', -1)).toBe('2026-07-27');
    expect(desplazarAncla('semanal', '2026-08-05', 1)).toBe('2026-08-10');
  });

  it('avanza meses sin desbordar por la cantidad de días', () => {
    // 31/01 + 1 mes no debe caer en marzo (por eso el ancla mensual es el día 1).
    expect(desplazarAncla('mensual', '2026-01-31', 1)).toBe('2026-02-01');
    expect(desplazarAncla('mensual', '2026-12-10', 1)).toBe('2027-01-01');
    expect(desplazarAncla('mensual', '2026-01-10', -1)).toBe('2025-12-01');
  });
});

describe('límite de periodos futuros', () => {
  it('no deja elegir un periodo que aún no empezó', () => {
    expect(limitarAncla('diario', '2026-12-01', MIERCOLES)).toBe('2026-08-05');
    expect(limitarAncla('mensual', '2026-11-01', MIERCOLES)).toBe('2026-08-01');
    // Un día futuro de la semana en curso sigue siendo la semana en curso.
    expect(limitarAncla('semanal', '2026-08-09', MIERCOLES)).toBe('2026-08-03');
    expect(limitarAncla('semanal', '2026-08-17', MIERCOLES)).toBe('2026-08-03');
  });

  it('respeta periodos pasados', () => {
    expect(limitarAncla('diario', '2026-07-01', MIERCOLES)).toBe('2026-07-01');
    expect(limitarAncla('mensual', '2026-07-15', MIERCOLES)).toBe('2026-07-01');
  });

  it('puedeAvanzar solo si el siguiente periodo ya empezó', () => {
    expect(puedeAvanzar('diario', '2026-08-04', MIERCOLES)).toBe(true);
    expect(puedeAvanzar('diario', '2026-08-05', MIERCOLES)).toBe(false);
    expect(puedeAvanzar('semanal', '2026-08-03', MIERCOLES)).toBe(false);
    expect(puedeAvanzar('semanal', '2026-07-27', MIERCOLES)).toBe(true);
    expect(puedeAvanzar('mensual', '2026-08-01', MIERCOLES)).toBe(false);
    expect(puedeAvanzar('mensual', '2026-07-01', MIERCOLES)).toBe(true);
  });
});

describe('enCurso', () => {
  it('marca el periodo que contiene hoy', () => {
    expect(enCurso('diario', '2026-08-05', MIERCOLES)).toBe(true);
    expect(enCurso('diario', '2026-08-04', MIERCOLES)).toBe(false);
    expect(enCurso('semanal', '2026-08-03', MIERCOLES)).toBe(true);
    expect(enCurso('mensual', '2026-08-01', MIERCOLES)).toBe(true);
    expect(enCurso('mensual', '2026-07-01', MIERCOLES)).toBe(false);
  });
});

describe('etiquetas y nombre de archivo', () => {
  it('etiquetaRango muestra fechas explícitas', () => {
    expect(etiquetaRango('diario', '2026-08-05')).toBe('05/08/2026');
    expect(etiquetaRango('semanal', '2026-08-05')).toBe('03/08/2026 — 09/08/2026');
    expect(etiquetaRango('mensual', '2026-08-05')).toBe('01/08/2026 — 31/08/2026');
  });

  it('etiquetaPeriodo describe el recorte elegido', () => {
    expect(etiquetaPeriodo('diario', '2026-08-05')).toBe('Diario · 05/08/2026');
    expect(etiquetaPeriodo('semanal', '2026-08-05')).toBe('Semanal · 03/08/2026 al 09/08/2026');
    expect(etiquetaPeriodo('mensual', '2026-08-05')).toBe('Mensual · Agosto 2026');
  });

  it('el nombre de archivo identifica el periodo, sin "/" ni espacios', () => {
    expect(nombreArchivoReporte('diario', '2026-08-05')).toBe('ReporteDiario_2026-08-05');
    expect(nombreArchivoReporte('semanal', '2026-08-05')).toBe('ReporteSemanal_2026-08-03');
    expect(nombreArchivoReporte('mensual', '2026-08-15')).toBe('ReporteMensual_2026-08');
    expect(nombreArchivoReporte('mensual', '2026-08-15')).not.toMatch(/[/\s]/);
  });
});

describe('anclaDeHoy y aniosDisponibles', () => {
  it('anclaDeHoy usa el calendario local, no UTC', () => {
    // 15:30 en Perú (UTC-5) sigue siendo el mismo día; toISOString() daría 20:30 UTC.
    expect(anclaDeHoy('diario', MIERCOLES)).toBe('2026-08-05');
    expect(anclaDeHoy('diario', new Date(2026, 7, 5, 22, 0))).toBe('2026-08-05');
    expect(anclaDeHoy('semanal', MIERCOLES)).toBe('2026-08-03');
    expect(anclaDeHoy('mensual', MIERCOLES)).toBe('2026-08-01');
  });

  it('ofrece el año actual y los anteriores', () => {
    expect(aniosDisponibles(MIERCOLES, 3)).toEqual([2026, 2025, 2024]);
  });
});
