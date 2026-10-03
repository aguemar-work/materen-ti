// Lógica del módulo Reportes que NO es cálculo de métricas (eso vive en SQL y
// se prueba en tests/db): el período que se elige y navega, la hoja que se
// arma a partir del jsonb de la RPC, el CSV y el glosario atado a la versión
// de definiciones del SQL.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  rangoMes, rangoSemana, periodoInicial, normalizarPeriodo, desplazarPeriodo, diasEntre, esFuturo,
  etiquetaPeriodo, nombreArchivoPeriodo, mesesDisponibles,
} from '../src/modules/reportes/periodo.js';
import { armarSecciones, datosCaratula, textoCsat, textoDelta } from '../src/modules/reportes/hoja.js';
import { filasCsvReporte } from '../src/modules/reportes/csv.js';
import { GLOSARIO, VERSION_DEFINICIONES } from '../src/modules/reportes/glosario.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/115_reportes.sql', import.meta.url)), 'utf8');

describe('periodo.js', () => {
  it('mes y semana de calendario', () => {
    expect(rangoMes('2026-02-10')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(rangoMes('2024-02-10')).toEqual({ desde: '2024-02-01', hasta: '2024-02-29' });
    expect(rangoSemana('2026-10-03')).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' }); // sábado → lunes 28
    expect(rangoSemana('2026-09-28')).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' }); // lunes
    expect(rangoSemana('2026-10-04')).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' }); // domingo
  });

  it('el período por defecto es el mes en curso de Lima', () => {
    expect(periodoInicial('2026-10-03')).toEqual({ tipo: 'mes', desde: '2026-10-01', hasta: '2026-10-31' });
  });

  it('normaliza lo que llega por URL: tipo desconocido o fecha inválida vuelven al mes en curso', () => {
    expect(normalizarPeriodo({ tipo: 'x', desde: '2026-09-01', hasta: '2026-09-30' }, '2026-10-03')).toEqual(periodoInicial('2026-10-03'));
    expect(normalizarPeriodo({ tipo: 'mes', desde: 'ayer' }, '2026-10-03')).toEqual(periodoInicial('2026-10-03'));
    expect(normalizarPeriodo({ tipo: 'mes', desde: '2026-09-15' }, '2026-10-03')).toEqual({ tipo: 'mes', desde: '2026-09-01', hasta: '2026-09-30' });
    expect(normalizarPeriodo({ tipo: 'rango', desde: '2026-09-20', hasta: '2026-09-10' })).toEqual({ tipo: 'rango', desde: '2026-09-10', hasta: '2026-09-20' });
    const largo = normalizarPeriodo({ tipo: 'rango', desde: '2024-01-01', hasta: '2026-09-30' });
    expect(diasEntre(largo.desde, largo.hasta)).toBe(366);
  });

  it('navega por períodos del mismo tipo y sabe cuándo el siguiente es futuro', () => {
    expect(desplazarPeriodo({ tipo: 'mes', desde: '2026-01-01', hasta: '2026-01-31' }, -1)).toEqual({ tipo: 'mes', desde: '2025-12-01', hasta: '2025-12-31' });
    expect(desplazarPeriodo({ tipo: 'semana', desde: '2026-09-28', hasta: '2026-10-04' }, 1)).toEqual({ tipo: 'semana', desde: '2026-10-05', hasta: '2026-10-11' });
    expect(desplazarPeriodo({ tipo: 'rango', desde: '2026-09-01', hasta: '2026-09-10' }, -1)).toEqual({ tipo: 'rango', desde: '2026-08-22', hasta: '2026-08-31' });
    expect(esFuturo({ tipo: 'mes', desde: '2026-11-01', hasta: '2026-11-30' }, '2026-10-03')).toBe(true);
    expect(esFuturo({ tipo: 'mes', desde: '2026-10-01', hasta: '2026-10-31' }, '2026-10-03')).toBe(false);
  });

  it('etiquetas y nombre de archivo', () => {
    expect(etiquetaPeriodo({ tipo: 'mes', desde: '2026-09-01', hasta: '2026-09-30' })).toBe('Septiembre 2026');
    expect(etiquetaPeriodo({ tipo: 'semana', desde: '2026-09-28', hasta: '2026-10-04' })).toBe('Semana del 28/09 al 04/10/2026');
    expect(etiquetaPeriodo({ tipo: 'rango', desde: '2026-09-01', hasta: '2026-09-15' })).toBe('Del 01/09/2026 al 15/09/2026');
    expect(nombreArchivoPeriodo({ tipo: 'mes', desde: '2026-09-01', hasta: '2026-09-30' })).toBe('Reporte_tickets_2026-09');
    expect(nombreArchivoPeriodo({ tipo: 'rango', desde: '2026-09-01', hasta: '2026-09-15' })).toBe('Reporte_tickets_2026-09-01_2026-09-15');
  });

  it('los meses del selector van desde el primer ticket hasta hoy, el más reciente primero', () => {
    expect(mesesDisponibles('2026-07-14', '2026-10-03').map((m) => m.valor)).toEqual(['2026-10-01', '2026-09-01', '2026-08-01', '2026-07-01']);
    expect(mesesDisponibles('', '2026-10-03').map((m) => m.valor)).toEqual(['2026-10-01']);
  });
});

const REPORTE = {
  generado_en: '2026-10-03T15:00:00Z', generado_por: { user_id: 'u1', nombre: 'Jefe Prueba' }, definiciones_version: VERSION_DEFINICIONES,
  periodo: { desde: '2026-09-01', hasta: '2026-09-30', completo: true, en_curso: false }, periodo_completo: true,
  alcance: { tipo: 'equipo', tecnico_id: null, tecnico_nombre: null },
  parametros: { csat_muestra_minima: 5, dias_corte_reapertura: 30 },
  volumen: { creados: 10, rechazados: 1, resueltos: 8, resueltos_mismo_periodo: 6, resueltos_arrastrados: 2, cerrados_sin_encuesta: 1,
    backlog: { referencia: 'cierre', total: 3, dias_mas_antiguo: 12, tramos: [{ clave: 'hasta_3', etiqueta: '0 a 3 días', cantidad: 1 }, { clave: 'de_8_a_30', etiqueta: '8 a 30 días', cantidad: 2 }] } },
  por: { categoria: [{ clave: 'red', nombre: 'Red', creados: 4, resueltos: 3 }], subcategoria: [], prioridad: [{ clave: 'urgente', nombre: 'urgente', creados: 1, resueltos: 1 }], tipo: [{ clave: 'incidente', nombre: 'incidente', creados: 7, resueltos: 5 }], nivel: [], area: [{ clave: '', nombre: 'Sin registrar', creados: 10, resueltos: 8 }] },
  atencion: { unidad: 'horas corridas', resolucion: { n: 8, mediana_horas: 1.5, promedio_horas: 30.25 }, primera_respuesta: { n: 5, mediana_horas: 0.5, promedio_horas: 2 }, por_prioridad: [{ prioridad: 'urgente', n: 1, mediana_horas: 0.25, promedio_horas: 0.25 }] },
  calidad: {
    reaperturas: { base: 8, reabiertos: 1, tasa_pct: 13, eventos: 1, corte_dias: 30, ventana_completa: false },
    csat: { generadas: 7, respondidas: 4, tasa_respuesta_pct: 57, n: 4, promedio: null, insuficiente: true, minimo: 5, niveles: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 2 }, insatisfechos: 1 },
    comentarios_bajos: [{ codigo: 'TCK-0001', nivel: 2, comentario: 'Tardó', fecha: '2026-09-10T12:00:00Z' }], comentarios_bajos_total: 1,
  },
  por_tecnico: [{ tecnico_id: 'u2', nombre: 'Asis Uno', resueltos: 5, mismo_periodo: 4, arrastrados: 1, tiempos: { n: 5, mediana_horas: 2, promedio_horas: 3 }, csat: { n: 6, promedio: 4.2, insuficiente: false }, reaperturas: { base: 5, reabiertos: 1 }, asignados_hoy: 2 }],
  anexos: { arrastrados: [{ codigo: 'TCK-0002', titulo: 'Viejo', created_at: '2026-08-10T12:00:00Z', resuelto_at: '2026-09-02T12:00:00Z', dias_abierto: 23, tecnico_id: 'u2' }], cerrados_sin_encuesta: [{ codigo: 'TCK-0003', titulo: 'Sin encuesta', resuelto_at: '2026-09-05T12:00:00Z', motivo: 'sin_solicitante' }] },
  tickets: [
    { codigo: 'TCK-0002', titulo: 'Viejo', estado: 'cerrado', prioridad: 'media', tipo: 'incidente', nivel_atencion: 'N1', categoria: 'Red', subcategoria: null, area: null, solicitante: 'Ana Prueba', created_at: '2026-08-10T12:00:00Z', resuelto_at: '2026-09-02T12:00:00Z', horas_resolucion: 552, tecnico_id: 'u2', encuesta_nivel: 4, en_periodo: 'resuelto' },
  ],
  comparacion: { periodo: { desde: '2026-08-01', hasta: '2026-08-31' }, parcial: false, volumen: { creados: 12, rechazados: 0, resueltos: 9 }, atencion: { n: 9, mediana_horas: 2 }, csat: { n: 6, promedio: 4.5, insuficiente: false }, reaperturas: { base: 9, reabiertos: 0, tasa_pct: 0, eventos: 0 } },
};

describe('hoja.js', () => {
  it('arma las seis secciones del jefe, con "por técnico" cuando el servidor la mandó', () => {
    const s = armarSecciones(REPORTE);
    expect(s.map((x) => x.id)).toEqual(['volumen', 'atencion', 'calidad', 'tecnicos', 'distribuciones', 'anexos']);
    expect(s[1].titulo).toContain('horas corridas');
    const volumen = s[0].tablas[0];
    expect(volumen.columnas.map((c) => c.titulo)).toEqual(['Indicador', 'Cantidad', 'Anterior', 'Diferencia']);
    expect(volumen.filas[0].map((c) => c.texto)).toEqual(['Creados en el período', '10', '12', '−2']);
    expect(s[0].tablas[1].titulo).toContain('al cierre');
  });

  it('sin la sección por técnico (asistente) no hay tabla de técnicos ni nombres en los anexos', () => {
    const s = armarSecciones({ ...REPORTE, por_tecnico: null });
    expect(s.map((x) => x.id)).toEqual(['volumen', 'atencion', 'calidad', 'distribuciones', 'anexos']);
    const arrastrados = s.find((x) => x.id === 'anexos').tablas[0];
    expect(arrastrados.columnas.map((c) => c.titulo)).not.toContain('Resolvió');
    expect(s.find((x) => x.id === 'distribuciones').titulo).toMatch(/^4\./);
  });

  it('mediana antes que promedio, siempre con n, y CSAT insuficiente como texto', () => {
    const atencion = armarSecciones(REPORTE)[1].tablas[0];
    expect(atencion.columnas.map((c) => c.titulo)).toEqual(['Tiempo', 'Mediana', 'Promedio', 'n', 'Mediana anterior']);
    expect(atencion.filas[0].map((c) => c.texto)).toEqual(['Resolución (creación → resolución)', '1.5 h', '1 d 6 h', '8', '2.0 h']);
    expect(textoCsat(REPORTE.calidad.csat)).toBe('n insuficiente (4)');
    expect(textoCsat({ n: 6, promedio: 4.25, insuficiente: false })).toBe('4,3 / 5');
    const csat = armarSecciones(REPORTE)[2].tablas[1];
    expect(csat.filas.find((f) => f[0].texto === 'Insatisfechos (nivel 1 o 2)')[1].texto).toBe('1');
  });

  it('sin comparación no hay columnas "Anterior"; en curso el backlog es "ahora"', () => {
    const s = armarSecciones({ ...REPORTE, comparacion: null, periodo: { ...REPORTE.periodo, en_curso: true, completo: false }, volumen: { ...REPORTE.volumen, backlog: { ...REPORTE.volumen.backlog, referencia: 'ahora' } } });
    expect(s[0].tablas[0].columnas.map((c) => c.titulo)).toEqual(['Indicador', 'Cantidad']);
    expect(s[0].tablas[1].titulo).toContain('ahora');
  });

  it('alcance técnico: sin creados ni backlog y con la nota', () => {
    const s = armarSecciones({ ...REPORTE, alcance: { tipo: 'tecnico', tecnico_id: 'u2', tecnico_nombre: 'Asis Uno' }, volumen: { ...REPORTE.volumen, creados: null, rechazados: null, backlog: null }, por_tecnico: null, comparacion: null });
    expect(s[0].tablas).toHaveLength(1);
    expect(s[0].tablas[0].filas.map((f) => f[0].texto)).not.toContain('Creados en el período');
    expect(s[0].nota).toContain('técnico');
    expect(datosCaratula(REPORTE, 'Septiembre 2026').map((d) => d.rotulo)).toEqual(['Período', 'Alcance', 'Generado por', 'Generado el', 'Definiciones']);
  });

  it('textoDelta', () => {
    expect(textoDelta(10, 12)).toBe('−2');
    expect(textoDelta(12, 10)).toBe('+2');
    expect(textoDelta(5, 5)).toBe('igual');
    expect(textoDelta(5, null)).toBe('');
  });
});

describe('csv.js', () => {
  it('exporta las filas del jsonb, sin DNI, con "Resolvió" solo si llegó la sección por técnico', () => {
    const conTecnico = filasCsvReporte(REPORTE);
    expect(conTecnico.cabecera).toContain('Resolvió');
    expect(conTecnico.cabecera.join()).not.toMatch(/DNI|Contacto/i);
    expect(conTecnico.filas[0][0]).toBe('TCK-0002');
    expect(conTecnico.filas[0][conTecnico.cabecera.indexOf('Resolvió')]).toBe('Asis Uno');
    expect(conTecnico.filas[0][conTecnico.cabecera.indexOf('Horas corridas')]).toBe('552');
    const sinTecnico = filasCsvReporte({ ...REPORTE, por_tecnico: null });
    expect(sinTecnico.cabecera).not.toContain('Resolvió');
    expect(sinTecnico.filas[0]).toHaveLength(sinTecnico.cabecera.length);
  });
});

describe('glosario.js', () => {
  it('describe la misma versión de definiciones que fija la migración 115', () => {
    expect(SQL).toContain(`c_version   constant text := '${VERSION_DEFINICIONES}'`);
  });

  it('una línea por término, sin tutear ni exclamar', () => {
    expect(GLOSARIO.length).toBeGreaterThanOrEqual(12);
    for (const g of GLOSARIO) {
      expect(g.termino).toBeTruthy();
      expect(g.definicion).not.toMatch(/\n|!|¡|\btu\b|\btus\b|puedes|tienes/);
    }
    const terminos = GLOSARIO.map((g) => g.termino);
    for (const t of ['Resuelto en el período', 'Horas corridas', 'CSAT', 'Insatisfecho', 'Tasa de reapertura', 'Backlog', 'Período comparable']) {
      expect(terminos).toContain(t);
    }
  });
});
