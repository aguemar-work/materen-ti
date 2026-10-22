// destinoDeCambio es el único punto del sistema que conoce el formato del
// detalle que escriben los triggers ('De "x" a "y"', migración 035). Lo usan la
// hoja de vida del ticket y el reporte para saber a qué estado se transicionó,
// así que si el texto del trigger cambia, estos tests son los que avisan.
import { describe, it, expect } from 'vitest';
import {
  destinoDeCambio, ESTADOS_TICKET, PRIORIDADES_TICKET, resolverAvisoCategoria, AVISO_CATEGORIA_MAX,
  partesCambioNivel, nivelesParaEscalar, nivelesParaDevolver, nivelSugeridoDe, fechaEstimadaVencida, NIVEL_PUBLICO, NIVELES_ATENCION,
} from '../src/core/dominio-tickets.js';

// Aviso al solicitante por categoría/subcategoría (migración 114): la regla
// "gana la subcategoría; si no tiene, la categoría" vive solo acá.
describe('resolverAvisoCategoria', () => {
  const camaras = { id: 'camaras', nombre: 'Cámaras', aviso: 'Aviso general de cámaras' };
  const corto = { id: 's1', categoria_id: 'camaras', nombre: 'Solicitud de imagen o corto', aviso: 'Deberá adjuntar la autorización de gerencia.' };
  const sinSenal = { id: 's2', categoria_id: 'camaras', nombre: 'Cámara sin señal', aviso: null };

  it('el aviso de la subcategoría gana al de la categoría', () => {
    expect(resolverAvisoCategoria(camaras, corto)).toBe('Deberá adjuntar la autorización de gerencia.');
  });

  it('sin aviso en la subcategoría, hereda el de la categoría', () => {
    expect(resolverAvisoCategoria(camaras, sinSenal)).toBe('Aviso general de cámaras');
    expect(resolverAvisoCategoria(camaras, null)).toBe('Aviso general de cámaras');
    expect(resolverAvisoCategoria(camaras, undefined)).toBe('Aviso general de cámaras');
  });

  it('sin aviso en ninguna de las dos devuelve cadena vacía (nada que mostrar)', () => {
    expect(resolverAvisoCategoria({ id: 'otro', aviso: null }, sinSenal)).toBe('');
    expect(resolverAvisoCategoria(null, null)).toBe('');
    expect(resolverAvisoCategoria(undefined, undefined)).toBe('');
  });

  it('un aviso en blanco cuenta como ausente y no tapa el de la categoría', () => {
    expect(resolverAvisoCategoria(camaras, { aviso: '   \n ' })).toBe('Aviso general de cámaras');
    expect(resolverAvisoCategoria({ aviso: '  ' }, { aviso: '' })).toBe('');
  });

  it('devuelve el texto recortado y conserva los saltos de línea internos', () => {
    expect(resolverAvisoCategoria({ aviso: '  Línea 1\nLínea 2  ' }, null)).toBe('Línea 1\nLínea 2');
  });

  it('el tope coincide con el CHECK de la base (600)', () => {
    expect(AVISO_CATEGORIA_MAX).toBe(600);
  });
});

describe('destinoDeCambio', () => {
  it('devuelve el estado destino de un cambio de estado', () => {
    expect(destinoDeCambio('De "en_progreso" a "resuelto"')).toBe('resuelto');
    expect(destinoDeCambio('De "resuelto" a "cerrado"')).toBe('cerrado');
    expect(destinoDeCambio('De "cerrado" a "reabierto"')).toBe('reabierto');
    expect(destinoDeCambio('De "abierto" a "rechazado"')).toBe('rechazado');
  });

  it('no confunde el estado de origen con el destino', () => {
    // El caso que rompería el conteo de resueltos: "resuelto" aparece primero.
    expect(destinoDeCambio('De "resuelto" a "reabierto"')).toBe('reabierto');
    expect(destinoDeCambio('De "resuelto" a "cerrado"')).not.toBe('resuelto');
  });

  it('sirve igual para los cambios de prioridad', () => {
    expect(destinoDeCambio('De "baja" a "urgente"')).toBe('urgente');
  });

  it('devuelve null cuando el detalle no tiene ese formato', () => {
    expect(destinoDeCambio(null)).toBeNull();
    expect(destinoDeCambio('')).toBeNull();
    expect(destinoDeCambio('Reasignado')).toBeNull();
    expect(destinoDeCambio('De "N1" a "sin definir"')).toBeNull();  // valor con espacio
  });

  it('todos los estados y prioridades del dominio se parsean', () => {
    for (const estado of Object.keys(ESTADOS_TICKET)) {
      expect(destinoDeCambio(`De "abierto" a "${estado}"`)).toBe(estado);
    }
    for (const prioridad of Object.keys(PRIORIDADES_TICKET)) {
      expect(destinoDeCambio(`De "media" a "${prioridad}"`)).toBe(prioridad);
    }
  });
});

// Escalamiento por niveles (migración 121).
describe('escalamiento: niveles, detalle del evento y fecha estimada', () => {
  it('se escala solo hacia arriba (nunca a N1) y se devuelve solo hacia abajo', () => {
    expect(nivelesParaEscalar('N1').map((n) => n.valor)).toEqual(['N2', 'N3']);
    expect(nivelesParaEscalar(null).map((n) => n.valor)).toEqual(['N2', 'N3']);
    expect(nivelesParaEscalar('N2').map((n) => n.valor)).toEqual(['N3']);
    expect(nivelesParaEscalar('N3')).toEqual([]);
    expect(nivelesParaDevolver('N3').map((n) => n.valor)).toEqual(['N1', 'N2']);
    expect(nivelesParaDevolver('N1')).toEqual([]);
  });

  it('lee el detalle de escalado y devuelto (el destino ya no va al final)', () => {
    expect(partesCambioNivel('De "N1" a "N2". Motivo: Se reinició el router')).toEqual({ desde: 'N1', hacia: 'N2', resto: 'Motivo: Se reinició el router' });
    expect(destinoDeCambio('De "N1" a "N2". Motivo: x')).toBeNull();
    expect(partesCambioNivel('texto libre')).toBeNull();
  });

  it('el nivel sugerido de la subcategoría precarga Iniciar; sin él, N1', () => {
    expect(nivelSugeridoDe({ nivel_sugerido: 'N2' })).toBe('N2');
    expect(nivelSugeridoDe({ nivel_sugerido: null })).toBe('N1');
    expect(nivelSugeridoDe({ nivel_sugerido: 'N9' })).toBe('N1');
    expect(nivelSugeridoDe(null)).toBe('N1');
  });

  it('una fecha estimada vence cuando ya pasó (hoy todavía no)', () => {
    const hoy = new Date(2026, 9, 21, 15);
    expect(fechaEstimadaVencida('2026-10-20', hoy)).toBe(true);
    expect(fechaEstimadaVencida('2026-10-21', hoy)).toBe(false);
    expect(fechaEstimadaVencida(null, hoy)).toBe(false);
  });

  it('cada nivel tiene su etiqueta pública (la misma que escribe el SQL)', () => {
    expect(Object.keys(NIVEL_PUBLICO)).toEqual(NIVELES_ATENCION.map((n) => n.valor));
    expect(NIVEL_PUBLICO.N3).toBe('Nivel 3 – Especialista');
  });
});
