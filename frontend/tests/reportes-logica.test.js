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
import { armarSecciones, datosCaratula, textoCsat, textoDelta, resumenTexto, textoPctSatisfaccion } from '../src/modules/reportes/hoja.js';
import { filasCsvReporte } from '../src/modules/reportes/csv.js';
import { GLOSARIO, VERSION_DEFINICIONES } from '../src/modules/reportes/glosario.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/118_tablero_mesa_de_ayuda.sql', import.meta.url)), 'utf8');

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

  it('día (118): un solo día, se navega de a uno, etiqueta con el día de la semana', () => {
    expect(normalizarPeriodo({ tipo: 'dia', desde: '2026-10-06' })).toEqual({ tipo: 'dia', desde: '2026-10-06', hasta: '2026-10-06' });
    expect(normalizarPeriodo({ tipo: 'dia', desde: 'x' }, '2026-10-06')).toEqual({ tipo: 'dia', desde: '2026-10-06', hasta: '2026-10-06' });
    expect(desplazarPeriodo({ tipo: 'dia', desde: '2026-10-01', hasta: '2026-10-01' }, -1)).toEqual({ tipo: 'dia', desde: '2026-09-30', hasta: '2026-09-30' });
    expect(etiquetaPeriodo({ tipo: 'dia', desde: '2026-10-06', hasta: '2026-10-06' })).toBe('Martes 6 de octubre de 2026');
    expect(nombreArchivoPeriodo({ tipo: 'dia', desde: '2026-10-06', hasta: '2026-10-06' })).toBe('Reporte_tickets_2026-10-06');
  });

  it('todo el historial (Satisfacción) solo si se permite; si no, vuelve al mes en curso', () => {
    expect(normalizarPeriodo({ tipo: 'todo' }, '2026-10-06', { permitirTodo: true })).toEqual({ tipo: 'todo', desde: '', hasta: '' });
    expect(normalizarPeriodo({ tipo: 'todo' }, '2026-10-06')).toEqual(periodoInicial('2026-10-06'));
    expect(etiquetaPeriodo({ tipo: 'todo', desde: '', hasta: '' })).toBe('Todo el historial');
    expect(nombreArchivoPeriodo({ tipo: 'todo', desde: '', hasta: '' }, 'satisfaccion')).toBe('Reporte_satisfaccion_historico');
    expect(esFuturo({ tipo: 'todo', desde: '', hasta: '' })).toBe(true);
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

// Forma 118: tablero, por día, pendientes, solicitantes y por técnico agrupado.
const REPORTE_118 = {
  ...REPORTE,
  definiciones_version: VERSION_DEFINICIONES,
  periodo: { desde: '2026-09-28', hasta: '2026-10-04', dias: 7, completo: true, en_curso: false },
  tablero: { ingresaron: 10, rechazados: 1, validos: 9, resueltos: 8, resueltos_de_ingresados: 6, pct_resuelto: 67, pendientes_inicio: 2, pendientes_cierre: 3 },
  por_dia: ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
    .map((dia, i) => ({ dia, ingresaron: i < 5 ? 2 : 0, rechazados: i === 0 ? 1 : 0, resueltos: i < 4 ? 2 : 0 })),
  pendientes: { referencia: 'cierre', total: 3, sin_asignar_hoy: 1, lista: [
    { codigo: 'TCK-0009', titulo: 'Licencia vencida', prioridad: 'alta', estado_hoy: 'en_progreso', created_at: '2026-09-22T12:00:00Z', dias: 12, asignado_a: 'u2', solicitante: 'Ana Prueba' },
    { codigo: 'TCK-0010', titulo: 'Mouse', prioridad: 'baja', estado_hoy: 'abierto', created_at: '2026-10-03T12:00:00Z', dias: 1, asignado_a: null, solicitante: 'Luis Prueba' },
  ] },
  solicitantes: { total: 2, top: [{ solicitante: 'Ana Prueba', area: 'Obra Lurín', tickets: 6, sin_resolver: 1 }, { solicitante: 'Sin vincular', area: null, tickets: 4, sin_resolver: 0 }] },
  calidad: { ...REPORTE.calidad, csat: { ...REPORTE.calidad.csat, satisfechos: 3, regulares: 0, pct_satisfaccion: null } },
  por_tecnico: [
    { grupo: 'tecnico', tecnico_id: 'u2', nombre: 'Asis Uno', resueltos: 6, mismo_periodo: 5, arrastrados: 1, tiempos: { n: 6, mediana_horas: 2, promedio_horas: 3 }, csat: { n: 6, promedio: 4.2, insuficiente: false, satisfechos: 5, pct_satisfaccion: 83 }, reaperturas: { base: 6, reabiertos: 1 }, asignados_hoy: 2 },
    { grupo: 'tecnico', tecnico_id: 'u3', nombre: 'Asis Dos', resueltos: 0, mismo_periodo: 0, arrastrados: 0, tiempos: { n: 0, mediana_horas: null, promedio_horas: null }, csat: { n: 0, promedio: null, insuficiente: true, satisfechos: 0, pct_satisfaccion: null }, reaperturas: { base: 0, reabiertos: 0 }, asignados_hoy: 0 },
    { grupo: 'otros', tecnico_id: null, nombre: null, resueltos: 2, mismo_periodo: 1, arrastrados: 1, tiempos: { n: 2, mediana_horas: 5, promedio_horas: 5 }, csat: { n: 1, promedio: null, insuficiente: true, satisfechos: 1, pct_satisfaccion: null }, reaperturas: { base: 2, reabiertos: 0 }, asignados_hoy: 0 },
  ],
  tickets: [
    ...REPORTE.tickets,
    { codigo: 'TCK-0011', titulo: 'Rápido', estado: 'cerrado', prioridad: 'media', tipo: 'incidente', nivel_atencion: 'N1', categoria: 'Red', subcategoria: null, area: null, solicitante: 'Ana Prueba', created_at: '2026-09-29T12:00:00Z', resuelto_at: '2026-09-29T13:00:00Z', horas_resolucion: 1, tecnico_id: 'u-jefe', encuesta_nivel: 5, en_periodo: 'ambos' },
    { codigo: 'TCK-0012', titulo: 'Abierto', estado: 'abierto', prioridad: 'media', tipo: 'incidente', nivel_atencion: 'N1', categoria: 'Red', subcategoria: null, area: null, solicitante: 'Ana Prueba', created_at: '2026-09-30T12:00:00Z', resuelto_at: null, horas_resolucion: null, tecnico_id: null, encuesta_nivel: null, en_periodo: 'creado' },
  ],
  comparacion: { ...REPORTE.comparacion, periodo: { desde: '2026-09-21', hasta: '2026-09-27' }, tablero: { ingresaron: 12, resueltos: 9, pct_resuelto: 75 } },
};

describe('hoja.js (tablero de mesa de ayuda, 118)', () => {
  it('el jefe ve el tablero primero y el detalle después, numerado en orden', () => {
    const s = armarSecciones(REPORTE_118);
    expect(s.map((x) => x.id)).toEqual(['resumen', 'por-dia', 'tecnicos', 'pendientes', 'solicitantes', 'tiempos', 'atencion', 'calidad', 'distribuciones', 'anexos']);
    expect(s.map((x) => x.titulo.split('.')[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(s.find((x) => x.id === 'atencion').titulo).toContain('horas corridas');
  });

  it('las cifras del resumen son las del servidor: % resuelto de lo que ingresó sin rechazar y comparación', () => {
    const cifras = armarSecciones(REPORTE_118)[0].cifras;
    expect(cifras.map((c) => c.rotulo)).toEqual(['Ingresaron', 'Resueltos', '% resuelto', 'Pendientes', 'Tiempo mediano', 'Satisfacción']);
    const porRotulo = Object.fromEntries(cifras.map((c) => [c.rotulo, c]));
    expect(porRotulo.Ingresaron).toMatchObject({ valor: 10 });
    expect(porRotulo.Ingresaron.detalle).toBe('1 rechazado · anterior: 12');
    expect(porRotulo.Resueltos.detalle).toBe('6 de este período · 2 de antes');
    expect(porRotulo['% resuelto']).toMatchObject({ valor: 67, unidad: '%' });
    expect(porRotulo['% resuelto'].detalle).toContain('6 de 9 ingresados sin rechazar');
    expect(porRotulo.Pendientes).toMatchObject({ valor: 3, detalle: 'al cierre · al inicio: 2' });
    expect(porRotulo['Satisfacción']).toMatchObject({ valor: '—', unidad: '' });
    expect(porRotulo['Satisfacción'].detalle).toBe('n insuficiente (4 de 5)');
  });

  it('por día: el gráfico y la tabla con los mismos números; un solo día no lleva gráfico', () => {
    const dia = armarSecciones(REPORTE_118).find((x) => x.id === 'por-dia');
    expect(dia.dias).toHaveLength(7);
    expect(dia.dias[0]).toEqual({ etiqueta: 'Lun 28', ingresaron: 2, resueltos: 2 });
    expect(dia.tablas[0].filas[0].map((c) => c.texto)).toEqual(['28/09/2026', '2', '1', '2']);
    const unDia = armarSecciones({ ...REPORTE_118, por_dia: [REPORTE_118.por_dia[0]] });
    expect(unDia.map((x) => x.id)).not.toContain('por-dia');
  });

  it('por técnico: cada técnico de mesa, «Jefatura y otros», sin asignar y el total del servidor', () => {
    const t = armarSecciones(REPORTE_118).find((x) => x.id === 'tecnicos').tablas[0];
    expect(t.columnas.map((c) => c.titulo)).toEqual(['Técnico', 'Resueltos', 'Del período', 'De antes', 'Mediana', 'Satisfacción', 'Reabiertos', 'A cargo hoy']);
    expect(t.filas.map((f) => f[0].texto)).toEqual(['Asis Uno', 'Asis Dos', 'Jefatura y otros', 'Sin asignar', 'Total']);
    expect(t.filas[0].map((c) => c.texto)).toEqual(['Asis Uno', '6', '5', '1', '2.0 h', '83 %', '1 de 6', '2']);
    expect(t.filas[3][7].texto).toBe('1');
    expect(t.filas[4].slice(0, 4).map((c) => c.texto)).toEqual(['Total', '8', '6', '2']);
  });

  it('pendientes, solicitantes y tiempo por ticket (del más lento al más rápido)', () => {
    const s = armarSecciones(REPORTE_118, { nombresStaff: { u2: 'Asis Uno' } });
    const pend = s.find((x) => x.id === 'pendientes');
    expect(pend.titulo).toContain('Pendientes al cierre');
    expect(pend.nota).toContain('3 tickets sin resolver');
    expect(pend.tablas[0].filas.map((f) => f.map((c) => c.texto))).toEqual([
      ['TCK-0009', 'Licencia vencida', 'Alta', 'Ana Prueba', 'Asis Uno', 'En progreso', '12'],
      ['TCK-0010', 'Mouse', 'Baja', 'Luis Prueba', 'Sin asignar', 'Abierto', '1'],
    ]);
    const sol = s.find((x) => x.id === 'solicitantes').tablas[0];
    expect(sol.filas.map((f) => f.map((c) => c.texto))).toEqual([['Ana Prueba', 'Obra Lurín', '6', '1'], ['Sin vincular', 'Sin registrar', '4', '0']]);
    const tiempos = s.find((x) => x.id === 'tiempos').tablas[0];
    expect(tiempos.columnas.map((c) => c.titulo)).toContain('Resolvió');
    expect(tiempos.filas.map((f) => f[0].texto)).toEqual(['TCK-0002', 'TCK-0011']);
    // el técnico de mesa por su nombre; el jefe (no marcado) como «Jefatura y otros»
    expect(tiempos.filas.map((f) => f[3].texto)).toEqual(['Asis Uno', 'Jefatura y otros']);
  });

  it('sin la sección por técnico (asistente) no hay tabla de técnicos ni columna «Resolvió»', () => {
    const s = armarSecciones({ ...REPORTE_118, por_tecnico: null });
    expect(s.map((x) => x.id)).not.toContain('tecnicos');
    expect(s.find((x) => x.id === 'tiempos').tablas[0].columnas.map((c) => c.titulo)).not.toContain('Resolvió');
    expect(s.find((x) => x.id === 'anexos').tablas[0].columnas.map((c) => c.titulo)).not.toContain('Resolvió');
  });

  it('mediana antes que promedio, siempre con n, y satisfacción insuficiente como texto', () => {
    const s = armarSecciones(REPORTE_118);
    const atencion = s.find((x) => x.id === 'atencion').tablas[0];
    expect(atencion.columnas.map((c) => c.titulo)).toEqual(['Tiempo', 'Mediana', 'Promedio', 'n', 'Mediana anterior']);
    expect(atencion.filas[0].map((c) => c.texto)).toEqual(['Resolución (creación → resolución)', '1.5 h', '1 d 6 h', '8', '2.0 h']);
    expect(textoCsat(REPORTE.calidad.csat)).toBe('n insuficiente (4)');
    expect(textoCsat({ n: 6, promedio: 4.25, insuficiente: false })).toBe('4,3 / 5');
    expect(textoPctSatisfaccion({ n: 6, pct_satisfaccion: 83 })).toBe('83 %');
    expect(textoPctSatisfaccion({ n: 2, pct_satisfaccion: null })).toBe('n insuficiente (2)');
    const csat = s.find((x) => x.id === 'calidad').tablas[1];
    expect(csat.filas.find((f) => f[0].texto === 'Insatisfechos (nivel 1 o 2)')[1].texto).toBe('1');
  });

  it('en curso: sin comparación, pendientes «ahora» y la nota lo dice', () => {
    const s = armarSecciones({ ...REPORTE_118, comparacion: null, periodo: { ...REPORTE_118.periodo, en_curso: true, completo: false }, pendientes: { ...REPORTE_118.pendientes, referencia: 'ahora' } });
    expect(s[0].nota).toContain('no terminó');
    expect(s.find((x) => x.id === 'pendientes').titulo).toContain('Pendientes ahora');
    expect(s.find((x) => x.id === 'atencion').tablas[0].columnas.map((c) => c.titulo)).toEqual(['Tiempo', 'Mediana', 'Promedio', 'n']);
  });

  it('alcance técnico (sin tablero): la hoja abre con el volumen, sin creados y con la nota', () => {
    const s = armarSecciones({ ...REPORTE, alcance: { tipo: 'tecnico', tecnico_id: 'u2', tecnico_nombre: 'Asis Uno' }, volumen: { ...REPORTE.volumen, creados: null, rechazados: null, backlog: null }, por_tecnico: null, comparacion: null });
    expect(s[0].id).toBe('volumen');
    expect(s[0].tablas).toHaveLength(1);
    expect(s[0].tablas[0].filas.map((f) => f[0].texto)).not.toContain('Creados en el período');
    expect(s[0].nota).toContain('técnico');
    expect(s.map((x) => x.id)).not.toContain('pendientes');
    expect(datosCaratula(REPORTE, 'Septiembre 2026').map((d) => d.rotulo)).toEqual(['Período', 'Alcance', 'Generado por', 'Generado el', 'Definiciones']);
  });

  it('el resumen en texto repite las cifras del tablero, de usted y sin exclamaciones', () => {
    const texto = resumenTexto(REPORTE_118, 'Semana del 28/09 al 04/10/2026');
    expect(texto.split('\n')).toEqual([
      'Mesa de ayuda TI · Semana del 28/09 al 04/10/2026',
      'Ingresaron 10 tickets (1 rechazado).',
      'Se resolvieron 8: 6 de este período y 2 de antes.',
      'De los 9 ingresados sin rechazar, el 67 % ya está resuelto. Quedan 3 pendientes.',
      'Tiempo mediano de resolución: 1.5 h.',
      'Resueltos por técnico: Asis Uno 6 · Asis Dos 0 · Jefatura y otros 2.',
    ]);
    expect(texto).not.toMatch(/!|¡/);
    expect(resumenTexto({ ...REPORTE, tablero: null }, 'x')).toBe('');
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
    const conTecnico = filasCsvReporte(REPORTE_118, { nombresStaff: { 'u-jefe': 'Jefe Prueba' } });
    expect(conTecnico.cabecera).toContain('Resolvió');
    expect(conTecnico.cabecera.join()).not.toMatch(/DNI|Contacto/i);
    expect(conTecnico.filas[0][0]).toBe('TCK-0002');
    expect(conTecnico.filas[0][conTecnico.cabecera.indexOf('Resolvió')]).toBe('Asis Uno');
    expect(conTecnico.filas[0][conTecnico.cabecera.indexOf('Horas corridas')]).toBe('552');
    // el CSV es el detalle: quien no es técnico de mesa va con su nombre, no como «Jefatura y otros»
    expect(conTecnico.filas.find((f) => f[0] === 'TCK-0011')[conTecnico.cabecera.indexOf('Resolvió')]).toBe('Jefe Prueba');
    const sinTecnico = filasCsvReporte({ ...REPORTE, por_tecnico: null });
    expect(sinTecnico.cabecera).not.toContain('Resolvió');
    expect(sinTecnico.filas[0]).toHaveLength(sinTecnico.cabecera.length);
  });
});

describe('glosario.js', () => {
  it('describe la misma versión de definiciones que fija la migración 118', () => {
    expect(SQL).toContain(`c_version   constant text := '${VERSION_DEFINICIONES}'`);
  });

  it('una línea por término, sin tutear ni exclamar', () => {
    expect(GLOSARIO.length).toBeGreaterThanOrEqual(12);
    for (const g of GLOSARIO) {
      expect(g.termino).toBeTruthy();
      expect(g.definicion).not.toMatch(/\n|!|¡|\btu\b|\btus\b|puedes|tienes/);
    }
    const terminos = GLOSARIO.map((g) => g.termino);
    for (const t of ['Ingresaron', '% resuelto', 'Pendientes', 'Técnico de mesa', 'Satisfacción', 'Resuelto en el período', 'Horas corridas', 'CSAT', 'Insatisfecho', 'Tasa de reapertura', 'Backlog', 'Período comparable']) {
      expect(terminos).toContain(t);
    }
  });
});
