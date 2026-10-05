// Lectura del resumen para la pantalla del Inicio: qué vistas existen, qué
// avisos de error se muestran dónde y qué vence esta semana.
import { describe, it, expect } from 'vitest';
import {
  vistasDisponibles, erroresDelFeed, erroresDe, hayAlguna, vencimientosDeLaSemana,
  SECCIONES_LATERALES, DIAS_SEMANA, ETIQUETA_SECCION,
} from '../src/modules/dashboard/vistasInicio.js';
import { SECCIONES_RESUMEN, normalizarResumen, ticketsSinAsignar } from '../src/core/resumen-inicio.js';
import { resumenVacio, resumenCompleto, ticket, AHORA } from './stubs/resumen-inicio.js';

describe('vistas disponibles', () => {
  it('un JEFE (todo presente) ve las cinco vistas, en orden fijo', () => {
    expect(vistasDisponibles(resumenVacio())).toEqual(['tickets', 'solicitudes', 'accesos', 'custodia', 'problemas']);
  });

  it('sin los módulos correos, empleados y problemas esas vistas no existen', () => {
    const r = resumenVacio({
      rotaciones_pendientes: null, cuentas_sin_password: null, solicitudes_abiertas: null, problemas: null,
    });
    expect(vistasDisponibles(r)).toEqual(['tickets', 'custodia']);
  });

  it('custodia existe con solo el módulo licencias o solo el módulo equipos', () => {
    const soloLicencias = resumenVacio({ equipos_sin_devolver: null, garantias_por_vencer: null, actas_pendientes: null });
    const soloEquipos = resumenVacio({ licencias_por_vencer: null });
    expect(vistasDisponibles(soloLicencias)).toContain('custodia');
    expect(vistasDisponibles(soloEquipos)).toContain('custodia');
  });

  it('una sección que falló (null + en errores) mantiene su vista, para poder mostrar el aviso', () => {
    const r = resumenVacio({ problemas: null, errores: ['problemas'] });
    expect(vistasDisponibles(r)).toContain('problemas');
  });

  it('sin resumen no hay vistas', () => {
    expect(vistasDisponibles(null)).toEqual([]);
  });

  it('un ASISTENTE sin tickets: nada de tickets ni de Mis tickets', () => {
    const r = resumenVacio({ tickets: null });
    expect(vistasDisponibles(r)).not.toContain('tickets');
    expect(hayAlguna(r, SECCIONES_LATERALES.mios)).toBe(false);
  });
});

describe('avisos de error por sección', () => {
  const r = resumenVacio({ problemas: null, custodia_hoy: null, errores: ['problemas', 'custodia_hoy', 'kpis'] });

  it('en "Todos" se muestran todos menos el de "Hoy en custodia" (tiene su panel)', () => {
    expect(erroresDelFeed(r, 'todos')).toEqual(['problemas', 'kpis']);
  });

  it('en una vista solo los de sus secciones', () => {
    expect(erroresDelFeed(r, 'problemas')).toEqual(['problemas']);
    expect(erroresDelFeed(r, 'tickets')).toEqual([]);
    expect(erroresDelFeed(r, 'custodia')).toEqual([]);
  });

  it('los paneles laterales reciben solo lo suyo', () => {
    expect(erroresDe(r, SECCIONES_LATERALES.custodiaHoy)).toEqual(['custodia_hoy']);
    expect(erroresDe(r, SECCIONES_LATERALES.mios)).toEqual([]);
  });

  it('toda sección de la RPC tiene un nombre legible para el aviso', () => {
    for (const s of SECCIONES_RESUMEN) expect(ETIQUETA_SECCION[s], s).toBeTruthy();
  });
});

describe('Vence esta semana', () => {
  it('trae las que vencen en los próximos 7 días, por fecha, y cuenta las de más adelante', () => {
    const { items, mas } = vencimientosDeLaSemana(resumenCompleto(), AHORA);
    expect(items.map((i) => i.key)).toEqual(['lic-l2', 'garantia-q1']); // 03/10 y 05/10
    expect(mas).toBe(1); // S10, 25/10
    expect(items[0]).toMatchObject({ tipo: 'licencia', titulo: 'AutoCAD 2026', destino: '/licencias?q=AutoCAD%202026' });
    expect(items[1]).toMatchObject({ tipo: 'garantia', codigo: 'LAP-001', destino: '/equipos?q=LAP-001' });
  });

  it('las ya vencidas no entran (están en el feed como críticas)', () => {
    const { items } = vencimientosDeLaSemana(resumenCompleto(), AHORA);
    expect(items.some((i) => i.key === 'lic-l3')).toBe(false);
  });

  it('vence hoy entra; vence en 7 días entra; en 8 no', () => {
    const r = resumenVacio({
      licencias_por_vencer: [
        { licencia_id: 'h', software: 'Hoy', cantidad: 1, fecha_vencimiento: '2026-10-01', empresa: '', vencida: false },
        { licencia_id: 'd7', software: 'Siete', cantidad: 1, fecha_vencimiento: '2026-10-08', empresa: '', vencida: false },
        { licencia_id: 'd8', software: 'Ocho', cantidad: 1, fecha_vencimiento: '2026-10-09', empresa: '', vencida: false },
      ],
    });
    expect(DIAS_SEMANA).toBe(7);
    const { items, mas } = vencimientosDeLaSemana(r, AHORA);
    expect(items.map((i) => i.key)).toEqual(['lic-h', 'lic-d7']);
    expect(mas).toBe(1);
  });

  it('sin licencias ni garantías (o sin módulos) devuelve vacío', () => {
    expect(vencimientosDeLaSemana(resumenVacio(), AHORA)).toEqual({ items: [], mas: 0 });
    expect(vencimientosDeLaSemana(resumenVacio({ licencias_por_vencer: null, garantias_por_vencer: null }), AHORA)).toEqual({ items: [], mas: 0 });
  });
});

describe('normalizarResumen', () => {
  it('conserva null en las secciones ausentes (no inventa un "vacío")', () => {
    const r = normalizarResumen({ tickets: null, problemas: null, rotaciones_pendientes: null, errores: ['problemas'] });
    expect(r.tickets).toBeNull();
    expect(r.problemas).toBeNull();
    expect(r.rotaciones_pendientes).toBeNull();
    expect(r.errores).toEqual(['problemas']);
  });

  it('errores siempre es un arreglo y descarta lo que no es texto', () => {
    expect(normalizarResumen({}).errores).toEqual([]);
    expect(normalizarResumen({ errores: 'x' }).errores).toEqual([]);
    expect(normalizarResumen({ errores: ['a', 3, null, 'b'] }).errores).toEqual(['a', 'b']);
  });

  it('completa los arreglos internos de tickets y problemas', () => {
    const r = normalizarResumen({ tickets: { sin_asignar: [ticket()] }, problemas: {} });
    expect(r.tickets).toMatchObject({ sin_vincular: [], viejos: [], mios: [], mios_total: 0, vencidos: null, por_vencer: null });
    expect(r.problemas).toEqual({ acciones_vencidas: [], recurrentes: null });
  });
});

describe('contador de tickets del menú', () => {
  it('es la cola de tickets vigentes sin asignar del resumen', () => {
    expect(ticketsSinAsignar(resumenCompleto())).toBe(1);
  });

  it('sin módulo tickets, sin resumen o con la sección caída: 0', () => {
    expect(ticketsSinAsignar(resumenVacio({ tickets: null }))).toBe(0);
    expect(ticketsSinAsignar(null)).toBe(0);
  });
});
