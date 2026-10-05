// Módulo Reportes centralizado (migración 117): el catálogo único de reportes
// (quién ve cada uno, con el mismo permiso que su RPC), el formato de las
// celdas y del CSV a partir del jsonb del servidor, la hoja de Satisfacción y
// el glosario atado a la versión de definiciones del SQL. Nada de esto calcula
// métricas: eso vive en Postgres (tests/db, bloques 117a-117e).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { REPORTES, AREAS_REPORTES, REPORTE_POR_ID, MODULOS_CON_REPORTE, puedeVerReporte, reportesPorArea, rutaReporte } from '../src/core/reportes.js';
import { MODULOS } from '../src/core/modulos.js';
import { reportesApi } from '../src/api/domains/reportes.js';
import { textoValor, celdaDe, tablaParaHoja, seccionesParaHoja, csvDeReporte, nombreArchivo } from '../src/modules/reportes/celdas.js';
import { seccionesSatisfaccion, csvSatisfaccion, caratulaSatisfaccion } from '../src/modules/reportes/hoja-satisfaccion.js';
import { GLOSARIOS, VERSION_DEFINICIONES_117 } from '../src/modules/reportes/glosario.js';
import { VERSION_DEFINICIONES_117 as VERSION_MAQUETA } from '../src/maqueta/reportes-forma.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/117_reportes_centralizados.sql', import.meta.url)), 'utf8');
const API = readFileSync(fileURLToPath(new URL('../src/api/domains/reportes.js', import.meta.url)), 'utf8');
const SRC = fileURLToPath(new URL('../src', import.meta.url));

const sesion = (rol, modulos = []) => ({ esJefe: rol === 'JEFE', puedeVerModulo: (m) => rol === 'JEFE' || modulos.includes(m) });

describe('catálogo de reportes (core/reportes.js)', () => {
  it('11 reportes únicos, cada uno en un área conocida y con su ruta /reportes/<id>', () => {
    expect(REPORTES).toHaveLength(11);
    expect(new Set(REPORTES.map((r) => r.id)).size).toBe(11);
    const areas = AREAS_REPORTES.map((a) => a.id);
    expect(areas).toEqual(['mesa-de-ayuda', 'personas', 'custodia', 'administracion']);
    for (const r of REPORTES) {
      expect(areas).toContain(r.area);
      expect(rutaReporte(r.id)).toBe(`/reportes/${r.id}`);
      expect(r.titulo && r.descripcion, r.id).toBeTruthy();
    }
  });

  it('el permiso de cada reporte es el de la RPC: módulo fuente o, para la auditoría, rol:jefe', () => {
    const modulos = MODULOS.map((m) => m.id);
    const esperado = {
      tickets: 'tickets', satisfaccion: 'tickets', cambios: 'tickets', problemas: 'problemas', personal: 'empleados',
      solicitudes: 'empleados', encuestas: 'encuestas', inventario: 'equipos', licencias: 'licencias', correos: 'correos',
    };
    for (const [id, modulo] of Object.entries(esperado)) {
      expect(REPORTE_POR_ID[id].modulo, id).toBe(modulo);
      expect(modulos).toContain(modulo);
    }
    expect(REPORTE_POR_ID.auditoria).toMatchObject({ rol: 'jefe' });
    expect(REPORTE_POR_ID.auditoria.modulo).toBeUndefined();
    expect([...MODULOS_CON_REPORTE].sort()).toEqual(['correos', 'empleados', 'encuestas', 'equipos', 'licencias', 'problemas', 'tickets']);
    // El guard de cada RPC nueva en el SQL es el mismo permiso del catálogo.
    const rpc = {
      inventario: 'reporte_inventario_equipos', licencias: 'reporte_licencias', correos: 'reporte_correos', personal: 'reporte_personal',
      solicitudes: 'reporte_solicitudes', cambios: 'reporte_cambios', problemas: 'reporte_problemas', encuestas: 'reporte_encuestas',
      auditoria: 'reporte_auditoria',
    };
    for (const [id, nombre] of Object.entries(rpc)) {
      const r = REPORTE_POR_ID[id];
      const permiso = r.rol ? `rol:${r.rol}` : `modulo:${r.modulo}`;
      const cuerpo = SQL.split(`create or replace function public.${nombre}(`)[1] || '';
      expect(cuerpo.slice(0, 400), id).toContain(`exigir_permiso('${permiso}')`);
      expect(SQL).toContain(`create or replace function public.${nombre}_de(`);
      expect(API).toContain(`'${nombre}'`);
      expect(typeof reportesApi[r.metodo], id).toBe('function');
    }
  });

  it('JEFE ve los 11 en 4 áreas; un asistente solo los de sus módulos y nunca la auditoría', () => {
    const jefe = reportesPorArea(sesion('JEFE'));
    expect(jefe.map((a) => a.label)).toEqual(['Mesa de ayuda', 'Personas', 'Custodia', 'Administración']);
    expect(jefe.flatMap((a) => a.reportes)).toHaveLength(11);
    const soloEquipos = reportesPorArea(sesion('ASISTENTE', ['equipos']));
    expect(soloEquipos.map((a) => [a.label, a.reportes.map((r) => r.id)])).toEqual([['Custodia', ['inventario']]]);
    const mesa = reportesPorArea(sesion('ASISTENTE', ['tickets', 'empleados', 'correos', 'equipos', 'base_conocimiento', 'encuestas', 'licencias', 'problemas']));
    expect(mesa.flatMap((a) => a.reportes).map((r) => r.id)).not.toContain('auditoria');
    expect(mesa.flatMap((a) => a.reportes)).toHaveLength(10);
    expect(reportesPorArea(sesion('ASISTENTE', ['base_conocimiento']))).toEqual([]);
    expect(puedeVerReporte(sesion('ASISTENTE', ['tickets']), REPORTE_POR_ID.auditoria)).toBe(false);
  });
});

describe('celdas.js: formato del jsonb de la 117', () => {
  it('cada tipo de columna con su formato; el vacío se registra', () => {
    expect(textoValor('fecha', '2026-10-05')).toBe('05/10/2026');
    expect(textoValor('pct', 67)).toBe('67 %');
    expect(textoValor('decimal', 3)).toBe('3,0');
    expect(textoValor('numero', 0)).toBe('0');
    expect(textoValor('texto', null)).toBeNull();
    expect(celdaDe({ tipo: 'texto' }, null)).toEqual({ texto: 'Sin registrar', num: false, tenue: true });
    expect(celdaDe({ tipo: 'numero' }, null)).toEqual({ texto: '—', num: true, tenue: true });
    expect(celdaDe({ tipo: 'codigo' }, 'LAP-001')).toEqual({ texto: 'LAP-001', num: false, codigo: true });
  });

  it('tabla, secciones, CSV y nombre de archivo salen del mismo jsonb', () => {
    const t = { id: 'x', titulo: 'T', nota: null, columnas: [{ clave: 'a', titulo: 'A', tipo: 'texto' }, { clave: 'n', titulo: 'N', tipo: 'numero' }], filas: [{ a: 'uno', n: 2 }] };
    expect(tablaParaHoja(t)).toEqual({ titulo: 'T', nota: '', columnas: [{ titulo: 'A', num: false }, { titulo: 'N', num: true }], filas: [[{ texto: 'uno', num: false, codigo: false }, { texto: '2', num: true, codigo: false }]] });
    expect(seccionesParaHoja([{ id: 's', titulo: '1. S', nota: null, tablas: [t] }])[0]).toMatchObject({ id: 's', titulo: '1. S', nota: '' });
    const r = {
      periodo: { desde: '2026-09-01', hasta: '2026-09-30' },
      filas_csv: { columnas: [{ clave: 'f', titulo: 'Fecha', tipo: 'fecha' }, { clave: 'n', titulo: 'N', tipo: 'numero' }, { clave: 't', titulo: 'T', tipo: 'texto' }], filas: [['2026-09-05', 3, null]] },
    };
    expect(csvDeReporte(r)).toEqual({ cabecera: ['Fecha', 'N', 'T'], filas: [['05/09/2026', '3', '']] });
    expect(nombreArchivo('personal', r)).toBe('Reporte_personal_2026-09-01_2026-09-30');
    expect(nombreArchivo('inventario', { corte_at: '2026-10-05T10:00:00-05:00' })).toBe('Reporte_inventario_2026-10-05');
    expect(nombreArchivo('encuestas', { ronda: { abierta_el: '2026-09-28' } })).toBe('Reporte_encuestas_ronda_2026-09-28');
  });
});

describe('hoja de Satisfacción (consolidado de la 115)', () => {
  const C = {
    muestraMinima: 5,
    resumen: { encuestasGeneradas: 10, encuestasRespondidas: 8, tasaRespuestaPct: 80, muestra: 8, promedio: 4.25, insuficiente: false, insatisfechos: 1 },
    porMes: [{ mes: '2026-09-01', encuestasGeneradas: 10, encuestasRespondidas: 8, muestra: 8, promedio: 4.25, insuficiente: false, niveles: { 1: 0, 2: 1, 3: 1, 4: 2, 5: 4 }, insatisfechos: 1 }],
    porTecnico: [{ tecnico_id: 'u1', nombre: 'Técnico Uno', encuestasGeneradas: 3, encuestasRespondidas: 3, muestra: 3, promedio: null, insuficiente: true, niveles: {}, insatisfechos: 0 }],
    porSolicitante: [],
    respuestas: [{ ticket_codigo: 'TCK-0001', ticket_titulo: 'Uno', solicitante: 'Ana Prueba', tecnico_id: 'u1', nivel: 2, comentario: 'Lento', respondida: true, created_at: '2026-09-02T10:00:00Z', fecha_envio: '2026-09-03T10:00:00Z' }],
  };
  it('cinco secciones; el promedio con muestra insuficiente no se publica', () => {
    const s = seccionesSatisfaccion(C);
    expect(s.map((x) => x.titulo)).toEqual(['1. Resumen', '2. Por mes de resolución', '3. Por técnico', '4. Por solicitante', '5. Comentarios de respuestas insatisfechas']);
    expect(s[1].tablas[0].filas[0][0].texto).toBe('Septiembre 2026');
    expect(s[2].tablas[0].filas[0][4].texto).toBe('n insuficiente (3)');
    expect(s[4].tablas[0].filas[0][2].texto).toBe('Lento');
    expect(caratulaSatisfaccion(C)[1].valor).toBe('8 respondidas de 10');
  });
  it('el CSV es una fila por encuesta, con el nombre de quien resolvió y sin DNI ni contacto', () => {
    const { cabecera, filas } = csvSatisfaccion(C);
    expect(cabecera).toContain('Resolvió');
    expect(cabecera.some((c) => /dni|tel[eé]fono|whatsapp|correo/i.test(c))).toBe(false);
    expect(filas).toEqual([['TCK-0001', 'Uno', 'Ana Prueba', 'Técnico Uno', 'Sí', '2', 'Lento', '02/09/2026', '03/09/2026']]);
  });
});

describe('glosario y versión de definiciones', () => {
  it('el glosario de la 117 describe la versión que calcula el SQL y la maqueta', () => {
    expect(SQL).toContain(`'definiciones_version', '${VERSION_DEFINICIONES_117}'`);
    expect(VERSION_MAQUETA).toBe(VERSION_DEFINICIONES_117);
  });
  it('cada reporte con hoja propia de la 117 (y Satisfacción) tiene su glosario', () => {
    for (const r of REPORTES.filter((x) => x.metodo || x.id === 'satisfaccion')) {
      expect(GLOSARIOS[r.id]?.length, r.id).toBeGreaterThan(2);
    }
  });
});

describe('ningún módulo exporta ni arma reportes por su cuenta', () => {
  const archivos = [];
  const recorrer = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (/\.(vue|js)$/.test(f)) archivos.push(p);
    }
  };
  recorrer(join(SRC, 'modules'));
  const rel = (p) => p.slice(SRC.length + 1).replace(/\\/g, '/');

  it('exportarCSV solo se usa en modules/reportes', () => {
    const fuera = archivos.filter((p) => !rel(p).startsWith('modules/reportes/') && /core\/exportar\.js/.test(readFileSync(p, 'utf8')));
    expect(fuera.map(rel)).toEqual([]);
  });

  it('jsPDF solo lo usa un documento (el acta), nunca un reporte', () => {
    const conJsPdf = [...archivos, ...readdirSync(join(SRC, 'core')).map((f) => join(SRC, 'core', f))]
      .filter((p) => /\.(vue|js)$/.test(p) && /import\(['"]jspdf|from ['"]jspdf/.test(readFileSync(p, 'utf8')));
    expect(conJsPdf.map(rel)).toEqual(['core/pdfActa.js']);
  });

  it('los ocho lugares que exportaban ahora enlazan a su reporte', () => {
    const vistas = {
      'modules/tickets/TicketsView.vue': "rutaReporte('tickets')",
      'modules/equipos/EquiposView.vue': "rutaReporte('inventario')",
      'modules/licencias/LicenciasView.vue': '<EnlaceReporte reporte="licencias"',
      'modules/correos/CorreosView.vue': '<EnlaceReporte reporte="correos"',
      'modules/empleados/EmpleadosView.vue': '<EnlaceReporte reporte="personal"',
      'modules/actividad/ActividadView.vue': '<EnlaceReporte reporte="auditoria"',
      'modules/encuestas/EncuestaDetalleView.vue': '<EnlaceReporte reporte="encuestas"',
    };
    for (const [archivo, enlace] of Object.entries(vistas)) {
      const fuente = readFileSync(join(SRC, archivo), 'utf8');
      expect(fuente, archivo).toContain(enlace);
      expect(fuente, archivo).not.toMatch(/label="Exportar"|'Exportar(?: datos)?'|Descargar PDF|listaParaExportar/);
    }
    expect(readFileSync(join(SRC, 'modules/tickets/TicketsView.vue'), 'utf8')).toContain("rutaReporte('satisfaccion')");
  });
});
