// Dominio del portal del empleado (migración 109): alcance, vigencia, estado del
// enlace y el enlace público que se entrega.
import { describe, it, expect } from 'vitest';
import {
  ALCANCES_PORTAL, ALCANCE_COMPLETO, VIGENCIAS_PORTAL, VIGENCIA_PORTAL_DEFECTO, textoVigencia,
  normalizarAlcance, urlPortal, estadoEnlacePortal, fechaLocal, resumenAlcance, equiposSinConfirmar, primerNombre,
} from '../src/core/dominio-portal.js';

describe('alcance del enlace', () => {
  it('ofrece exactamente los cuatro alcances del servidor (sin confirmar_ticket, pendiente de V2)', () => {
    expect([...ALCANCE_COMPLETO].sort()).toEqual(['confirmar_equipo', 'ver_accesos', 'ver_equipos', 'ver_tickets']);
    expect(ALCANCE_COMPLETO).not.toContain('confirmar_ticket');
    for (const a of ALCANCES_PORTAL) expect(a.etiqueta.length).toBeGreaterThan(5);
  });

  it('confirmar la recepción suma ver los equipos y descarta lo desconocido', () => {
    expect(normalizarAlcance(['confirmar_equipo'])).toEqual(['ver_equipos', 'confirmar_equipo']);
    expect(normalizarAlcance(['ver_accesos', 'inventado'])).toEqual(['ver_accesos']);
    expect(normalizarAlcance([])).toEqual([]);
    expect(normalizarAlcance(undefined)).toEqual([]);
  });

  it('el resumen nombra lo que el empleado verá', () => {
    expect(resumenAlcance(['ver_accesos'])).toBe('cuentas asignadas');
    expect(resumenAlcance([])).toBe('nada');
  });
});

describe('vigencia', () => {
  it('7 días por defecto y todas las opciones dentro del rango del servidor', () => {
    expect(VIGENCIA_PORTAL_DEFECTO).toBe(7);
    expect(VIGENCIAS_PORTAL).toContain(7);
    for (const d of VIGENCIAS_PORTAL) expect(d >= 1 && d <= 30).toBe(true);
  });
  it('el plural es correcto', () => {
    expect(textoVigencia(1)).toBe('1 día');
    expect(textoVigencia(7)).toBe('7 días');
  });
});

describe('estado del enlace', () => {
  const ahora = new Date('2026-10-02T12:00:00Z').getTime();
  it('sin enlace o revocado: null', () => {
    expect(estadoEnlacePortal(null, ahora)).toBeNull();
    expect(estadoEnlacePortal({ expires_at: '2026-10-09T00:00:00Z', revocado_at: '2026-10-01T00:00:00Z' }, ahora)).toBeNull();
  });
  it('vigente o vencido según su fecha', () => {
    expect(estadoEnlacePortal({ expires_at: '2026-10-09T00:00:00Z', revocado_at: null }, ahora)).toBe('vigente');
    expect(estadoEnlacePortal({ expires_at: '2026-10-01T00:00:00Z', revocado_at: null }, ahora)).toBe('vencido');
  });
});

describe('textos y enlace', () => {
  it('arma el enlace público con el origen dado', () => {
    expect(urlPortal('AbC_123', 'https://ti.materen.pe')).toBe('https://ti.materen.pe/mi/AbC_123');
  });
  it('una fecha ISO se muestra en hora local, no con el prefijo UTC', () => {
    const iso = new Date(2026, 9, 2, 23, 30).toISOString(); // 23:30 locales: en UTC puede ser el día siguiente
    expect(fechaLocal(iso)).toBe('02/10/2026');
    expect(fechaLocal(null)).toBe('');
    expect(fechaLocal('no-es-fecha')).toBe('');
  });
  it('cuenta los equipos sin confirmar y toma el primer nombre', () => {
    expect(equiposSinConfirmar([{ confirmado_at: null }, { confirmado_at: '2026-10-01' }, {}])).toBe(2);
    expect(equiposSinConfirmar()).toBe(0);
    expect(primerNombre('  María Fernanda Salazar ')).toBe('María');
    expect(primerNombre('')).toBe('');
  });
});
