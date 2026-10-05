// Maqueta del catálogo de tickets v2 (migración 116): el catálogo inventado es
// ESPEJO de la tabla de correspondencias de la migración (31 subcategorías con
// tipo y prioridad), y la RPC simulada reclasificar_ticket rechaza con el mismo
// SQLSTATE y el MISMO texto que reclasificar_ticket_nucleo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLAS, RPC } from '../src/maqueta/datos.js';
import { MENSAJES_RECLASIFICAR, calcularPorReclasificar } from '../src/maqueta/rpc-catalogo-tickets.js';
import { prioridadInfo, prioridadSugeridaDe } from '../src/core/dominio-tickets.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/116_catalogo_tickets_v2.sql', import.meta.url)), 'utf8');
const clonar = (v) => JSON.parse(JSON.stringify(v));

// Filas del bloque 2.c: ( n, 'cat', 'Nombre cat', 'origen', 'Subcategoría', array[...], 'tipo', 'prioridad', aviso)
const MAPA = [...SQL.matchAll(/^\s*\(\s*(\d+), '([a-z_]+)',\s*'([^']+)',\s*'([a-z_]+)',\s*'([^']+)',\s*array\[[^\]]*\](?:::text\[\])?,\s*'([a-z]+)',\s*'([a-z]+)',/gm)]
  .map(([, , cat, catNombre, , nombre, tipo, prioridad]) => ({ cat, catNombre, nombre, tipo, prioridad }));

function rechazo(fn) {
  try { fn(); } catch (e) { return { code: e.code, message: e.message }; }
  return null;
}

describe('el catálogo de la maqueta es espejo de la migración 116', () => {
  it('31 subcategorías con su categoría, tipo y prioridad', () => {
    expect(MAPA).toHaveLength(31);
    const maqueta = TABLAS.subcategorias_ticket.map((s) => ({ cat: s.categoria_id, nombre: s.nombre, tipo: s.tipo_sugerido, prioridad: s.prioridad_sugerida }));
    expect(maqueta).toEqual(MAPA.map(({ cat, nombre, tipo, prioridad }) => ({ cat, nombre, tipo, prioridad })));
  });

  it('7 categorías con los nombres nuevos', () => {
    const nombres = Object.fromEntries(MAPA.map((m) => [m.cat, m.catNombre]));
    expect(Object.fromEntries(TABLAS.categorias_ticket.map((c) => [c.id, c.nombre]))).toEqual(nombres);
  });

  it('los avisos de la migración están en las mismas subcategorías', () => {
    for (const nombre of ['No puedo ingresar al sistema', 'Solicitar revisión o extracción de grabación']) {
      const aviso = TABLAS.subcategorias_ticket.find((s) => s.nombre === nombre).aviso;
      expect(SQL).toContain(aviso);
    }
    expect(TABLAS.subcategorias_ticket.find((s) => s.nombre === 'Cámara sin imagen o con falla').aviso).toBeNull();
  });

  it('la prioridad máxima se lee «Crítica» y una subcategoría sin sugerencia cae a media', () => {
    expect(prioridadInfo('urgente').label).toBe('Crítica');
    expect(prioridadSugeridaDe({ prioridad_sugerida: null })).toBe('media');
    expect(prioridadSugeridaDe(null)).toBe('media');
    expect(prioridadSugeridaDe({ prioridad_sugerida: 'urgente' })).toBe('urgente');
    expect(prioridadSugeridaDe({ prioridad_sugerida: 'critica' })).toBe('media');
  });
});

describe('reclasificar_ticket y v_tickets_por_reclasificar (maqueta)', () => {
  it('los mensajes de rechazo son los del SQL', () => {
    for (const m of Object.values(MENSAJES_RECLASIFICAR)) {
      expect(SQL.includes(m) || SQL.includes(m.replace('500', '%'))).toBe(true);
    }
  });

  it('la vista lista los tickets anteriores a la marca sin subcategoría o en «Otro (no clasificado)»', () => {
    const vista = TABLAS.v_tickets_por_reclasificar;
    expect(vista.map((v) => v.codigo)).toEqual(expect.arrayContaining(['TCK-0103', 'TCK-0106']));
    expect(vista.find((v) => v.codigo === 'TCK-0103').motivo).toBe('no_clasificado');
    expect(vista.find((v) => v.codigo === 'TCK-0106').motivo).toBe('sin_subcategoria');
    // El ticket de hoy en «Otro (no clasificado)» no aparece (es posterior a la marca).
    expect(vista.every((v) => Date.parse(v.created_at) < Date.parse(TABLAS.config_parametros.find((p) => p.clave === 'catalogo_tickets_v2').valor.aplicada_at))).toBe(true);
  });

  it('reclasifica: cambia categoría y subcategoría (no tipo ni prioridad), deja el evento y saca el ticket de la vista', () => {
    const db = clonar(TABLAS);
    const antes = clonar(db.tickets.find((t) => t.id === 't103'));
    const r = RPC.reclasificar_ticket(db, { p_ticket_id: 't103', p_subcategoria_id: 'sub-04', p_motivo: '  Es un equipo por recoger  ' });
    expect(r).toMatchObject({ ticket_id: 't103', categoria_id: 'equipos', subcategoria_id: 'sub-04', cambio: true });
    const t = db.tickets.find((x) => x.id === 't103');
    expect([t.categoria_id, t.subcategoria_id, t.tipo, t.prioridad, t.estado]).toEqual(['equipos', 'sub-04', antes.tipo, antes.prioridad, antes.estado]);
    const ev = db.ticket_eventos.at(-1);
    expect(ev).toMatchObject({ ticket_id: 't103', evento: 'categoria_cambiada', user_id: 'u-jefe' });
    expect(ev.detalle).toBe('De "Consultas y Capacitación › Otro (no clasificado)" a "Hardware y Periféricos › Solicitar equipo o accesorio nuevo". Motivo: Es un equipo por recoger');
    expect(db.v_tickets_por_reclasificar.some((v) => v.ticket_id === 't103')).toBe(false);
  });

  it('misma subcategoría = clasificación confirmada; el ticket también sale de la vista', () => {
    const db = clonar(TABLAS);
    const r = RPC.reclasificar_ticket(db, { p_ticket_id: 't103', p_subcategoria_id: 'sub-09', p_motivo: 'Es otro de verdad' });
    expect(r.cambio).toBe(false);
    expect(db.ticket_eventos.at(-1).detalle).toMatch(/^Clasificación confirmada: "Consultas y Capacitación › Otro \(no clasificado\)"/);
    expect(calcularPorReclasificar(db).some((v) => v.ticket_id === 't103')).toBe(false);
  });

  it('rechazos con el SQLSTATE del SQL', () => {
    const db = clonar(TABLAS);
    expect(rechazo(() => RPC.reclasificar_ticket(db, { p_ticket_id: 't103', p_subcategoria_id: 'sub-04', p_motivo: '  ' }))).toEqual({ code: 'P0001', message: MENSAJES_RECLASIFICAR.sinMotivo });
    expect(rechazo(() => RPC.reclasificar_ticket(db, { p_ticket_id: 't103', p_subcategoria_id: 'sub-04', p_motivo: 'x'.repeat(501) }))).toEqual({ code: 'P0001', message: MENSAJES_RECLASIFICAR.motivoLargo });
    expect(rechazo(() => RPC.reclasificar_ticket(db, { p_ticket_id: 'no-existe', p_subcategoria_id: 'sub-04', p_motivo: 'x' }))).toEqual({ code: 'P0002', message: MENSAJES_RECLASIFICAR.sinTicket });
    expect(rechazo(() => RPC.reclasificar_ticket(db, { p_ticket_id: 't103', p_subcategoria_id: 'no-existe', p_motivo: 'x' }))).toEqual({ code: 'P0002', message: MENSAJES_RECLASIFICAR.sinSubcategoria });
  });
});
