// Feed de pendientes del Inicio con la forma de `dashboard_resumen` (103):
// niveles (crítico / atención), orden, textos, un solo asunto por ticket,
// "acta sin adjuntar" y ningún umbral de días escrito en el cliente. Las altas
// a medias tienen su propio archivo (feed-altas-incompletas.test.js).
import { describe, it, expect } from 'vitest';
import { construirFeedPendientes, GRUPOS_INICIO } from '../src/modules/dashboard/pendientesFeed.js';
import { resumenVacio, resumenCompleto, cuenta, ticket, AHORA } from './stubs/resumen-inicio.js';

const feed = (resumen) => construirFeedPendientes(resumen, { ahora: AHORA });
const porKey = (items, prefijo) => items.filter((i) => i.key.startsWith(prefijo));

describe('feed — niveles', () => {
  const items = feed(resumenCompleto());

  it('crítico: sin contraseña, equipo sin devolver, licencia vencida y acción vencida', () => {
    const criticos = items.filter((i) => i.tier === 1).map((i) => i.key.split('-')[0] + (i.key.includes('vencida') ? '-vencida' : ''));
    expect(criticos).toEqual(expect.arrayContaining(['sinpw', 'equipo', 'lic', 'accion-vencida']));
    expect(items.find((i) => i.key === 'lic-l3').tier).toBe(1);
  });

  it('atención: por rotar, licencia por vencer, garantía por vencer, tickets, acta y recurrencia', () => {
    for (const k of ['rotar-c1', 'lic-l2', 'garantia-q1', 'tk-t1', 'tk-t3', 'acta-as1', 'recurrencia-red']) {
      expect(items.find((i) => i.key === k).tier, k).toBe(2);
    }
  });

  it('una garantía vencida es crítica y una por vencer no', () => {
    const r = resumenVacio({
      garantias_por_vencer: [
        { equipo_id: 'a', codigo: 'LAP-1', equipo: 'X', garantia_hasta: '2026-09-25', vencida: true },
        { equipo_id: 'b', codigo: 'LAP-2', equipo: 'Y', garantia_hasta: '2026-10-10', vencida: false },
      ],
    });
    const [a, b] = feed(r);
    expect(a).toMatchObject({ key: 'garantia-a', tier: 1, titulo: 'Garantía vencida' });
    expect(b).toMatchObject({ key: 'garantia-b', tier: 2, titulo: 'Garantía por vencer' });
  });

  it('cada ítem declara su grupo (vista) y todos los grupos existen', () => {
    for (const i of items) expect(Object.keys(GRUPOS_INICIO)).toContain(i.grupo);
    expect(new Set(items.map((i) => i.grupo))).toEqual(new Set(['tickets', 'accesos', 'custodia', 'problemas']));
  });
});

describe('feed — orden', () => {
  it('todo lo crítico va antes de lo de atención', () => {
    const tiers = feed(resumenCompleto()).map((i) => i.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });

  it('dentro de un nivel, más días de atraso primero y lo sin fecha al final', () => {
    const r = resumenVacio({
      licencias_por_vencer: [
        { licencia_id: 'a', software: 'A', cantidad: 1, fecha_vencimiento: '2026-09-29', empresa: '', vencida: true }, // 2 d
        { licencia_id: 'b', software: 'B', cantidad: 1, fecha_vencimiento: '2026-09-01', empresa: '', vencida: true }, // 30 d
      ],
      cuentas_sin_password: [cuenta()], // tier 1, sin fecha
    });
    expect(feed(r).map((i) => i.key)).toEqual(['lic-b', 'lic-a', 'sinpw-c1']);
  });

  it('una licencia que vence pronto va antes que una que vence más tarde', () => {
    const r = resumenVacio({
      licencias_por_vencer: [
        { licencia_id: 'tarde', software: 'T', cantidad: 1, fecha_vencimiento: '2026-10-25', empresa: '', vencida: false },
        { licencia_id: 'pronto', software: 'P', cantidad: 1, fecha_vencimiento: '2026-10-03', empresa: '', vencida: false },
      ],
    });
    expect(feed(r).map((i) => i.key)).toEqual(['lic-pronto', 'lic-tarde']);
  });
});

describe('feed — tickets: un asunto por ticket', () => {
  it('un ticket sin asignar, sin vincular y viejo es UNA fila con todos sus motivos', () => {
    const t = ticket({ desde: '2026-09-25T15:00:00Z' }); // 6 días
    const items = feed(resumenVacio({ tickets: { ...resumenVacio().tickets, sin_asignar: [t], sin_vincular: [t], viejos: [t] } }));
    expect(items).toHaveLength(1);
    expect(items[0].contexto).toBe('Sin asignar · Sin vincular a un empleado · Abierto hace 6 días');
    expect(items[0]).toMatchObject({ codigo: 'TCK-0281', titulo: 'Impresora obra Lurín', destino: '/tickets/t1', antiguedad: '6 d' });
  });

  it('"Abierto hace" concuerda en singular', () => {
    const t = ticket({ desde: '2026-09-30T15:00:00Z' });
    const [i] = feed(resumenVacio({ tickets: { ...resumenVacio().tickets, viejos: [t] } }));
    expect(i.contexto).toBe('Abierto hace 1 día');
  });

  it('un ticket de hoy muestra "hoy" y no hay umbral de 3 días escrito en el cliente', () => {
    const t = ticket({ desde: '2026-10-01T12:00:00Z' });
    const [i] = feed(resumenVacio({ tickets: { ...resumenVacio().tickets, sin_asignar: [t] } }));
    expect(i.antiguedad).toBe('hoy');
    // Que sea "viejo" lo decide el servidor (`tickets.viejos`), no el cliente.
    expect(i.contexto).toBe('Sin asignar');
  });

  it('la antigüedad se cuenta en días de Lima: a las 20:00 de Lima ya es otro día en UTC', () => {
    const t = ticket({ desde: '2026-10-02T01:00:00Z' }); // 20:00 del 1 de octubre en Lima
    const [i] = feed(resumenVacio({ tickets: { ...resumenVacio().tickets, sin_asignar: [t] } }));
    expect(i.antiguedad).toBe('hoy');
  });

  it('sin el módulo tickets (sección null) no hay filas de tickets', () => {
    expect(feed(resumenVacio({ tickets: null }))).toEqual([]);
  });
});

describe('feed — acta sin adjuntar', () => {
  const [acta] = porKey(feed(resumenCompleto()), 'acta-');

  it('enlaza a la ruta imprimible del acta de entrega', () => {
    expect(acta.destino).toBe('/equipos/q9/acta/as1?tipo=entrega');
  });

  it('dice qué equipo, de quién y desde cuándo, con los días del servidor', () => {
    expect(acta).toMatchObject({ codigo: 'DES-002', titulo: 'Acta sin adjuntar', antiguedad: '11 d', grupo: 'custodia' });
    expect(acta.contexto).toBe('Desktop Lenovo · M. Salazar · entregado el 20/09/2026');
  });

  it('mientras la migración 110 no exista la sección es null y no aparece', () => {
    expect(porKey(feed(resumenVacio({ actas_pendientes: null })), 'acta-')).toEqual([]);
  });
});

describe('feed — cuentas, equipos y problemas', () => {
  const items = feed(resumenCompleto());

  it('una cuenta personal con titular lleva a su ficha; sin titular, a Correos filtrado', () => {
    expect(items.find((i) => i.key === 'sinpw-c9').destino).toBe('/empleados/e5');
    expect(items.find((i) => i.key === 'rotar-c1').destino).toBe('/correos?q=soporte%40materen.pe');
  });

  it('una cuenta libre reutilizable dice que se rote antes de reasignar', () => {
    const c = items.find((i) => i.key === 'rotar-c1');
    expect(c).toMatchObject({ titulo: 'Rotar contraseña', codigo: 'soporte@materen.pe' });
    expect(c.contexto).toContain('rotar antes de reasignar');
  });

  it('equipo sin devolver: código, quién lo tiene y enlace al equipo; sin antigüedad confiable', () => {
    const e = items.find((i) => i.key === 'equipo-a1');
    expect(e).toMatchObject({ codigo: 'LAP-0142', titulo: 'Sin devolver', antiguedad: '—', destino: '/equipos?q=LAP-0142' });
    expect(e.contexto).toContain('J. Quispe (dado de baja)');
  });

  it('acción vencida: enlace al problema y días de atraso; recurrencia filtra Tickets por categoría', () => {
    expect(items.find((i) => i.key === 'accion-vencida-ac1')).toMatchObject({ destino: '/problemas/p1', antiguedad: '3 d' });
    const rec = items.find((i) => i.key === 'recurrencia-red');
    expect(rec.destino).toBe('/tickets?vista=todos&categoria=red');
    expect(rec.contexto).toBe('3 tickets recientes sin un problema abierto');
  });

  it('una licencia vencida lo dice y una por vencer también', () => {
    expect(items.find((i) => i.key === 'lic-l3').contexto).toBe('Vencida el 23/09/2026 · Materen');
    expect(items.find((i) => i.key === 'lic-l2').contexto).toBe('Vence el 03/10/2026 · Materen');
  });
});

describe('feed — resumen vacío o parcial', () => {
  it('un resumen sin pendientes produce un feed vacío', () => {
    expect(feed(resumenVacio())).toEqual([]);
  });

  it('una sección con error llega null y no rompe el resto', () => {
    const r = resumenCompleto();
    r.problemas = null;
    r.errores = ['problemas'];
    const items = feed(r);
    expect(items.some((i) => i.grupo === 'problemas')).toBe(false);
    expect(items.some((i) => i.grupo === 'tickets')).toBe(true);
  });
});

describe('feed — campos de la 103 para custodia', () => {
  it('equipo sin devolver: la antigüedad sale de la baja del empleado', () => {
    const r = resumenVacio({
      equipos_sin_devolver: [{
        asignacion_id: 'as9', codigo: 'LAP-9', equipo: 'HP', empleado: 'Ana Quispe', empleado_id: 'e9',
        desde: '2026-03-12', empleado_baja_at: '2026-09-21T15:00:00Z',
      }],
    });
    const item = feed(r).find((i) => i.key === 'equipo-as9');
    expect(item.diasUrgencia).toBe(10);
    expect(item.antiguedad).toBe('10 d');
    expect(item.contexto).toContain('baja el');
  });

  it('equipo sin devolver sin fecha de baja: sin antigüedad, con el inicio de la asignación', () => {
    const r = resumenVacio({
      equipos_sin_devolver: [{ asignacion_id: 'as8', codigo: 'LAP-8', equipo: 'HP', empleado: 'Luis Rojas', empleado_id: 'e8', desde: '2026-03-12' }],
    });
    const item = feed(r).find((i) => i.key === 'equipo-as8');
    expect(item.diasUrgencia).toBeNull();
    expect(item.contexto).toContain('desde');
  });

  it('garantía por vencer: enlaza a la hoja de vida cuando trae equipo_id', () => {
    const r = resumenVacio({
      garantias_por_vencer: [{ equipo_id: 'q7', codigo: 'LAP-7', equipo: 'Dell', garantia_hasta: '2026-10-05', vencida: false }],
    });
    expect(feed(r).find((i) => i.key === 'garantia-q7').destino).toBe('/equipos/q7');
  });
});
