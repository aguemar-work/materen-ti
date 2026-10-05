// Maqueta de los reportes centralizados (migración 117): las RPC simuladas
// devuelven la misma forma que el SQL (secciones + filas_csv), rechazan como
// el servidor (42501 sin el módulo fuente, auditoría solo JEFE, P0001 con un
// período o una ronda inválidos) y nunca exponen DNI ni contacto. La paridad
// número a número con PGlite (Inventario y Personal) la hace el escenario S17
// de scripts/sql-local/verificar-migraciones.mjs.
import { describe, it, expect } from 'vitest';
import { TABLAS, RPC } from '../src/maqueta/datos.js';
import { reporteInventarioDe, reporteLicenciasDe, reporteCorreosDe } from '../src/maqueta/rpc-reportes-custodia.js';
import { reportePersonalDe, reporteSolicitudesDe, reporteEncuestasDe } from '../src/maqueta/rpc-reportes-personas.js';
import { reporteCambiosDe, reporteProblemasDe, reporteAuditoriaDe } from '../src/maqueta/rpc-reportes-gestion.js';

const db = () => JSON.parse(JSON.stringify(TABLAS));
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const haceUnAnio = new Date(Date.parse(`${hoy}T00:00:00Z`) - 365 * 86400000).toISOString().slice(0, 10);
const P = { desde: haceUnAnio, hasta: hoy };
const rechazo = (fn) => { try { fn(); } catch (e) { return e; } return null; };

const REPORTES = {
  inventario: (d, user) => reporteInventarioDe(d, { user }),
  licencias: (d, user) => reporteLicenciasDe(d, { user }),
  correos: (d, user) => reporteCorreosDe(d, { user }),
  personal: (d, user) => reportePersonalDe(d, { user, ...P }),
  solicitudes: (d, user) => reporteSolicitudesDe(d, { user, ...P }),
  cambios: (d, user) => reporteCambiosDe(d, { user, ...P }),
  problemas: (d, user) => reporteProblemasDe(d, { user, ...P }),
  encuestas: (d, user) => reporteEncuestasDe(d, { user }),
  auditoria: (d, user) => reporteAuditoriaDe(d, { user, ...P }),
};
const MODULO = {
  inventario: 'equipos', licencias: 'licencias', correos: 'correos', personal: 'empleados', solicitudes: 'empleados',
  cambios: 'tickets', problemas: 'problemas', encuestas: 'encuestas',
};

describe('forma común de los reportes de la 117 (maqueta)', () => {
  for (const [id, fn] of Object.entries(REPORTES)) {
    it(`${id}: cabecera, secciones con filas de sus columnas y CSV rectangular`, () => {
      const r = fn(db(), 'u-jefe');
      expect(r).toMatchObject({ reporte: id === 'inventario' ? 'inventario' : id, definiciones_version: 'reportes-2026-10-05', generado_por: { user_id: 'u-jefe', nombre: 'Alejandro Guevara' } });
      expect(Array.isArray(r.avisos)).toBe(true);
      expect(r.secciones.length).toBeGreaterThan(0);
      for (const s of r.secciones) {
        for (const t of s.tablas) {
          const claves = new Set(t.columnas.map((c) => c.clave));
          for (const f of t.filas) for (const k of Object.keys(f)) expect(claves.has(k), `${id}/${t.id}: ${k}`).toBe(true);
          for (const c of t.columnas) expect(['texto', 'codigo', 'numero', 'decimal', 'pct', 'fecha', 'fecha_hora']).toContain(c.tipo);
        }
      }
      for (const fila of r.filas_csv.filas) expect(fila).toHaveLength(r.filas_csv.columnas.length);
      if (['personal', 'solicitudes', 'cambios', 'problemas', 'auditoria'].includes(id)) {
        expect(r.periodo).toMatchObject({ desde: P.desde, hasta: P.hasta, en_curso: true, completo: false });
        expect(r.periodo_completo).toBe(false);
      } else {
        expect(r.periodo).toBeNull();
        expect(r.periodo_completo).toBeNull();
      }
    });
  }

  it('ninguna salida lleva DNI, teléfono, WhatsApp ni correo personal de los empleados', () => {
    const d = db();
    const privados = d.empleados.flatMap((e) => [e.dni, e.telefono, e.whatsapp, e.correo_personal]).filter(Boolean);
    for (const [id, fn] of Object.entries(REPORTES)) {
      const texto = JSON.stringify(fn(db(), 'u-jefe'));
      for (const v of privados) expect(texto.includes(v), `${id} expone ${v}`).toBe(false);
      expect(texto).not.toMatch(/"(dni|telefono|whatsapp|correo_personal|ip|user_agent)"/);
    }
  });
});

describe('guards como el servidor', () => {
  it('sin el módulo fuente: 42501 (asistente con solo base de conocimiento)', () => {
    const d = db();
    d.staff_modulos_permisos = d.staff_modulos_permisos.filter((m) => m.staff_user_id !== 'u-asis-2' || m.modulo === 'base_conocimiento');
    for (const [id, fn] of Object.entries(REPORTES)) expect(rechazo(() => fn(d, 'u-asis-2'))?.code, id).toBe('42501');
  });

  it('con SOLO su módulo, cada reporte llega; la auditoría nunca a un asistente', () => {
    for (const [id, modulo] of Object.entries(MODULO)) {
      const d = db();
      d.staff_modulos_permisos = [{ staff_user_id: 'u-asis-1', modulo }];
      expect(rechazo(() => REPORTES[id](d, 'u-asis-1')), id).toBeNull();
    }
    expect(rechazo(() => REPORTES.auditoria(db(), 'u-asis-1'))?.code).toBe('42501');
    expect(rechazo(() => REPORTES.inventario(db(), 'u-asis-3'))?.code).toBe('42501'); // staff inactivo
  });

  it('período inválido o ronda inexistente: P0001 con el mismo mensaje del SQL', () => {
    const e = rechazo(() => reportePersonalDe(db(), { user: 'u-jefe', desde: hoy, hasta: haceUnAnio }));
    expect(e).toMatchObject({ code: 'P0001', message: 'El período no es válido: la fecha inicial debe ser anterior o igual a la final.' });
    expect(rechazo(() => reporteAuditoriaDe(db(), { user: 'u-jefe', desde: '2020-01-01', hasta: hoy }))?.code).toBe('P0001');
    expect(rechazo(() => reporteEncuestasDe(db(), { user: 'u-jefe', ronda: 'no-existe' }))).toMatchObject({ code: 'P0001', message: 'La ronda de encuesta no existe.' });
  });

  it('problemas sin conocimiento ni tickets: dos secciones y dos avisos', () => {
    const d = db();
    d.staff_modulos_permisos = [{ staff_user_id: 'u-asis-1', modulo: 'problemas' }];
    const r = reporteProblemasDe(d, { user: 'u-asis-1', ...P });
    expect(r.secciones.map((s) => s.id)).toEqual(['problemas', 'kedb']);
    expect(r.avisos).toHaveLength(2);
    expect(reporteProblemasDe(db(), { user: 'u-jefe', ...P }).secciones.map((s) => s.id)).toEqual(['problemas', 'kedb', 'conocimiento', 'recurrencias']);
  });
});

describe('cifras del fixture de la maqueta', () => {
  const tabla = (r, sec, id) => r.secciones.find((s) => s.id === sec).tablas.find((t) => t.id === id);

  it('inventario: sin devolver con la fecha de baja de la hoja de vida, actas pendientes desde el parámetro', () => {
    const r = reporteInventarioDe(db(), { user: 'u-jefe' });
    expect(tabla(r, 'situacion', 'por_situacion').filas.at(-1)).toEqual({ situacion: 'Total', equipos: 12 });
    expect(tabla(r, 'alertas', 'sin_devolver').filas).toEqual([expect.objectContaining({ codigo: 'CEL-001', persona: 'Pedro Ticona Apaza', dias_baja: 30 })]);
    expect(tabla(r, 'alertas', 'actas_pendientes').filas.map((f) => f.codigo)).toEqual(['TAB-001']);
    expect(tabla(r, 'alertas', 'garantias').filas.map((f) => f.codigo)).toContain('LAP-004');
    expect(r.filas_csv.filas).toHaveLength(12);
  });

  it('personal: revisiones de acceso pendientes con el parámetro de 180 días', () => {
    const r = reportePersonalDe(db(), { user: 'u-jefe', ...P });
    const pendientes = tabla(r, 'revisiones', 'pendientes').filas.map((f) => f.persona);
    expect(pendientes).toContain('Jorge Huamán Ccori');
    expect(pendientes).not.toContain('Rosa Quispe Mamani'); // revisada hace 12 días
    expect(pendientes).not.toContain('Ana Lucía Torres Vílchez'); // alta hace 3 días
    expect(r.filas_csv.columnas.map((c) => c.clave)).toEqual(['nombres', 'apellidos', 'empresa', 'area', 'ubicacion', 'cargo', 'estado', 'fecha_alta', 'ultima_revision']);
  });

  it('encuestas: la ronda más reciente con respuestas, porcentajes sobre quienes respondieron', () => {
    const r = reporteEncuestasDe(db(), { user: 'u-jefe' });
    expect(r.ronda).toMatchObject({ ronda_id: 'ron02', respuestas: 2 });
    const escala = r.secciones[0].tablas[0];
    expect(escala.nota).toBe('2 de 2 respondieron; promedio 4,00 sobre 5');
    expect(r.filas_csv.filas).toEqual([['5', 'Formulario web', 'Sí', 'Todo bien.'], ['3', 'Correo', 'No', '']]);
  });

  it('auditoría: «quién» sin sesión y purgas', () => {
    const r = reporteAuditoriaDe(db(), { user: 'u-jefe', ...P });
    expect(tabla(r, 'purgas', 'detalle').filas).toEqual([expect.objectContaining({ quien: 'Sistema' })]);
    expect(tabla(r, 'personas', 'por_persona').filas.map((f) => f.quien)).toContain('Empleado, vía enlace');
  });

  it('el mapa RPC de la maqueta expone las nueve RPC con la firma de la base', () => {
    for (const nombre of ['reporte_inventario_equipos', 'reporte_licencias', 'reporte_correos', 'reporte_personal', 'reporte_solicitudes',
      'reporte_cambios', 'reporte_problemas', 'reporte_encuestas', 'reporte_auditoria']) expect(typeof RPC[nombre], nombre).toBe('function');
    expect(RPC.reporte_personal(db(), { p_desde: P.desde, p_hasta: P.hasta }).reporte).toBe('personal');
    expect(RPC.reporte_encuestas(db(), { p_ronda: 'ron01' }).ronda.ronda_id).toBe('ron01');
  });
});
