// Maqueta de la KEDB (migración 106): las RPC simuladas rechazan con el mismo
// SQLSTATE y el mismo texto que el servidor, aplican la misma regla de quién
// publica y mantienen v_kpi_kb. Sin esto, la maqueta (lo que ve el dueño al
// revisar la pantalla) podría enseñar un comportamiento que el servidor no tiene.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLAS, RPC } from '../src/maqueta/datos.js';
import { RPC_KB, definirActorKb, calcularKpiKb } from '../src/maqueta/rpc-kb.js';
import { TIPOS_KB, OPCIONES_TIPO_KB, tipoKbInfo, TIPO_KB_POR_DEFECTO } from '../src/core/dominio-kb.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/106_kedb.sql', import.meta.url)), 'utf8');
const FUENTE = readFileSync(fileURLToPath(new URL('../src/maqueta/rpc-kb.js', import.meta.url)), 'utf8');

const base = () => JSON.parse(JSON.stringify(TABLAS));
const rechazo = (fn) => { try { fn(); } catch (e) { return e; } return null; };

describe('los textos de la maqueta son los de la migración 106', () => {
  const MENSAJES = [
    'El problema no existe.',
    'El ticket no existe.',
    'El artículo no existe.',
    'Escriba el workaround antes de publicarlo en la base de conocimiento.',
    'El workaround no puede superar los 5000 caracteres.',
    'El título no puede superar los 200 caracteres.',
    'El síntoma no puede superar los 1000 caracteres.',
    'Solo se puede crear un artículo desde un ticket resuelto o cerrado.',
    'El ticket no tiene nota de resolución. Escriba la solución para crear el artículo.',
    'Este ticket ya tiene un artículo en la base de conocimiento. Complételo desde allí.',
    'Solo se registra el uso de artículos publicados.',
  ];
  it.each(MENSAJES)('«%s» existe en el SQL y en la maqueta', (m) => {
    expect(SQL).toContain(m);
    expect(FUENTE).toContain(m);
  });

  it('los tipos de artículo son los del CHECK de la migración', () => {
    const m = SQL.match(/check \(tipo in \(([^)]*)\)\)/);
    const enSql = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    expect(Object.keys(TIPOS_KB)).toEqual(enSql);
    expect(OPCIONES_TIPO_KB.map((o) => o.valor)).toEqual(enSql);
  });
});

describe('dominio-kb: tipo de artículo', () => {
  it('tipoKbInfo resuelve los tres tipos y un valor desconocido no rompe', () => {
    expect(tipoKbInfo('workaround')).toMatchObject({ label: 'Workaround', tono: 'categoria' });
    expect(tipoKbInfo('procedimiento').label).toBe('Procedimiento');
    expect(tipoKbInfo(undefined).label).toBe(TIPOS_KB[TIPO_KB_POR_DEFECTO].label);
    expect(tipoKbInfo('otro').label).toBe('otro');
  });
});

describe('publicar_workaround_problema', () => {
  it('un jefe crea el artículo publicado, vinculado al problema, y lo deja como error conocido', () => {
    definirActorKb({ id: 'u-jefe', esJefe: true });
    const db = base();
    const art = RPC_KB.publicar_workaround_problema(db, { p_problema_id: 'p01', p_workaround: ' 1. Cambiar de operador\n2. Reiniciar ' });
    expect(art).toMatchObject({
      tipo: 'workaround', estado: 'publicado', problema_id: 'p01', solucion: '1. Cambiar de operador\n2. Reiniciar',
      titulo: 'Workaround: Caídas recurrentes de internet en obras', ticket_origen_id: 't107', created_by: 'u-jefe',
    });
    const p = db.problemas.find((x) => x.id === 'p01');
    expect(p).toMatchObject({ error_conocido: true, kb_articulo_id: art.id, workaround: art.solucion });
    expect(db.v_kpi_kb.some((k) => k.kb_articulo_id === art.id && k.usos_total === 0)).toBe(true);
  });

  it('un no-jefe lo deja en revisión; reenviarlo igual no lo despublica; cambiarlo lo devuelve a revisión', () => {
    const db = base();
    definirActorKb({ id: 'u-asis-1', esJefe: false });
    const a1 = RPC_KB.publicar_workaround_problema(db, { p_problema_id: 'p01', p_workaround: 'Paso' });
    expect(a1.estado).toBe('en_revision');
    definirActorKb({ id: 'u-jefe', esJefe: true });
    expect(RPC_KB.publicar_workaround_problema(db, { p_problema_id: 'p01' }).estado).toBe('publicado');
    definirActorKb({ id: 'u-asis-1', esJefe: false });
    expect(RPC_KB.publicar_workaround_problema(db, { p_problema_id: 'p01' }).estado).toBe('publicado');
    const a2 = RPC_KB.publicar_workaround_problema(db, { p_problema_id: 'p01', p_workaround: 'Otro paso' });
    expect(a2).toMatchObject({ id: a1.id, estado: 'en_revision', solucion: 'Otro paso' });
    expect(db.kb_articulos.filter((a) => a.problema_id === 'p01' && a.tipo === 'workaround')).toHaveLength(1);
    definirActorKb({ id: 'u-jefe', esJefe: true });
  });

  it('rechaza como el servidor: sin workaround, demasiado largo, problema inexistente o eliminado', () => {
    definirActorKb({ id: 'u-jefe', esJefe: true });
    const db = base();
    expect(rechazo(() => RPC_KB.publicar_workaround_problema(db, { p_problema_id: 'p03', p_workaround: '  ' }))).toMatchObject({ code: 'P0001', message: 'Escriba el workaround antes de publicarlo en la base de conocimiento.' });
    expect(rechazo(() => RPC_KB.publicar_workaround_problema(db, { p_problema_id: 'p03', p_workaround: 'x'.repeat(5001) }))).toMatchObject({ code: 'P0001' });
    expect(rechazo(() => RPC_KB.publicar_workaround_problema(db, { p_problema_id: 'nope', p_workaround: 'x' }))).toMatchObject({ code: 'P0002' });
    db.problemas.find((p) => p.id === 'p03').deleted_at = new Date().toISOString();
    expect(rechazo(() => RPC_KB.publicar_workaround_problema(db, { p_problema_id: 'p03', p_workaround: 'x' }))).toMatchObject({ code: 'P0002' });
  });

  it('con workaround ya guardado en el problema no hace falta reenviarlo', () => {
    definirActorKb({ id: 'u-jefe', esJefe: true });
    const db = base();
    db.kb_articulos = db.kb_articulos.filter((a) => a.id !== 'kb07');
    const art = RPC_KB.publicar_workaround_problema(db, { p_problema_id: 'p02' });
    expect(art.solucion).toContain('Limitar el estado máximo del procesador');
    expect(art.categoria_id).toBe('equipos');
  });
});

describe('crear_kb_desde_ticket', () => {
  it('desde un ticket cerrado crea el borrador con síntoma y título del ticket', () => {
    definirActorKb({ id: 'u-asis-1', esJefe: false });
    const db = base();
    const t = db.tickets.find((x) => x.estado === 'cerrado' && !db.kb_articulos.some((a) => a.ticket_origen_id === x.id));
    const art = RPC_KB.crear_kb_desde_ticket(db, { p_ticket_id: t.id, p_solucion: 'Pasos\nSiguiente' });
    expect(art).toMatchObject({ estado: 'borrador', tipo: 'solucion', problema_id: null, titulo: t.titulo, ticket_origen_id: t.id, solucion: 'Pasos\nSiguiente', created_by: 'u-asis-1' });
    expect(rechazo(() => RPC_KB.crear_kb_desde_ticket(db, { p_ticket_id: t.id, p_solucion: 'otra' }))).toMatchObject({ code: 'P0001' });
    definirActorKb({ id: 'u-jefe', esJefe: true });
  });

  it('rechaza: ticket abierto, sin solución e inexistente', () => {
    const db = base();
    const abierto = db.tickets.find((x) => x.estado === 'abierto');
    const cerrado = db.tickets.find((x) => x.estado === 'cerrado' && !db.kb_articulos.some((a) => a.ticket_origen_id === x.id));
    expect(rechazo(() => RPC_KB.crear_kb_desde_ticket(db, { p_ticket_id: abierto.id, p_solucion: 'x' }))).toMatchObject({ code: 'P0001' });
    expect(rechazo(() => RPC_KB.crear_kb_desde_ticket(db, { p_ticket_id: cerrado.id, p_solucion: '   ' }))).toMatchObject({ code: 'P0001' });
    expect(rechazo(() => RPC_KB.crear_kb_desde_ticket(db, { p_ticket_id: 'nope', p_solucion: 'x' }))).toMatchObject({ code: 'P0002' });
  });
});

describe('registrar_uso_kb_ticket y v_kpi_kb', () => {
  it('registra una vez por par, actualiza la vista y rechaza lo que el servidor rechaza', () => {
    definirActorKb({ id: 'u-asis-1', esJefe: false });
    const db = base();
    const antes = db.v_kpi_kb.find((k) => k.kb_articulo_id === 'kb03');
    expect(antes).toMatchObject({ usos_total: 0, ultimo_uso_at: null });
    const uso = RPC_KB.registrar_uso_kb_ticket(db, { p_ticket_id: 't109', p_kb_articulo_id: 'kb03' });
    expect(uso).toMatchObject({ ticket_id: 't109', kb_articulo_id: 'kb03', usado_por: 'u-asis-1' });
    RPC_KB.registrar_uso_kb_ticket(db, { p_ticket_id: 't109', p_kb_articulo_id: 'kb03' });
    expect(db.ticket_kb_usos.filter((u) => u.ticket_id === 't109' && u.kb_articulo_id === 'kb03')).toHaveLength(1);
    expect(db.v_kpi_kb.find((k) => k.kb_articulo_id === 'kb03')).toMatchObject({ usos_90d: 1, usos_total: 1 });
    expect(rechazo(() => RPC_KB.registrar_uso_kb_ticket(db, { p_ticket_id: 't109', p_kb_articulo_id: 'kb04' }))).toMatchObject({ code: 'P0001', message: 'Solo se registra el uso de artículos publicados.' });
    expect(rechazo(() => RPC_KB.registrar_uso_kb_ticket(db, { p_ticket_id: 'nope', p_kb_articulo_id: 'kb03' }))).toMatchObject({ code: 'P0002' });
    expect(rechazo(() => RPC_KB.registrar_uso_kb_ticket(db, { p_ticket_id: 't109', p_kb_articulo_id: 'nope' }))).toMatchObject({ code: 'P0002' });
    definirActorKb({ id: 'u-jefe', esJefe: true });
  });

  it('calcularKpiKb separa los 90 días del total, omite lo eliminado y deja en cero lo que no se usó', () => {
    const hace = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const d10 = hace(10);
    const kpi = calcularKpiKb(
      [{ id: 'a', titulo: 'A', estado: 'publicado' }, { id: 'b', titulo: 'B', estado: 'publicado' }, { id: 'c', titulo: 'C', estado: 'publicado', deleted_at: 'x' }],
      [{ ticket_id: 't1', kb_articulo_id: 'a', created_at: d10 }, { ticket_id: 't2', kb_articulo_id: 'a', created_at: hace(100) }],
    );
    expect(kpi.map((k) => k.kb_articulo_id)).toEqual(['a', 'b']);
    expect(kpi[0]).toMatchObject({ usos_90d: 1, usos_total: 2, tipo: 'solucion' });
    expect(kpi[0].ultimo_uso_at).toBe(d10);
    expect(kpi[1]).toMatchObject({ usos_90d: 0, usos_total: 0, ultimo_uso_at: null });
  });

  it('las tres RPC están registradas en la maqueta', () => {
    for (const n of ['publicar_workaround_problema', 'crear_kb_desde_ticket', 'registrar_uso_kb_ticket']) {
      expect(typeof RPC[n]).toBe('function');
    }
  });
});
