// Registro único de módulos (core/modulos.js). Antes había dos listas que
// nada sincronizaba (constants/modulos.js y la navegación del sidebar); este
// test ata el registro a las tres cosas que deben coincidir con él: el CHECK
// de la base, las rutas del router y los ítems del menú.
import { describe, it, expect } from 'vitest';
import { MODULOS, MODULOS_CONFIGURABLES } from '../src/core/modulos.js';
import { MODULOS_CONFIGURABLES as DESDE_CONSTANTS } from '../src/constants/modulos.js';
import { AREAS_NAV, migasDeRuta } from '../src/components/shared/navegacion.js';
import { REPORTES, MODULOS_CON_REPORTE } from '../src/core/reportes.js';

// Fixture LITERAL del CHECK de `staff_modulos_permisos.modulo` (migración
// 056). No se deriva de MODULOS a propósito: si se agrega o quita un módulo,
// hay que tocar acá Y escribir la migración que cambie el CHECK.
const IDS_CHECK_MIGRACION_056 = [
  'tickets',
  'empleados',
  'correos',
  'licencias',
  'equipos',
  'base_conocimiento',
  'problemas',
  'encuestas',
];

// Todas las rutas declaradas (aplanando children, con el path absoluto).
const archivos = import.meta.glob('../src/router/routes/*.routes.js', { eager: true });
function aplanar(rutas, base = '') {
  return rutas.flatMap((r) => {
    const path = r.path.startsWith('/') ? r.path : `${base}/${r.path}`;
    return [{ ...r, path }, ...aplanar(r.children || [], path)];
  });
}
const RUTAS = Object.values(archivos).flatMap((m) => aplanar(m.default));

describe('registro único de módulos', () => {
  it('los ids son exactamente el CHECK de staff_modulos_permisos (migración 056)', () => {
    expect([...MODULOS.map((m) => m.id)].sort()).toEqual([...IDS_CHECK_MIGRACION_056].sort());
  });

  it('no hay ids, paths ni labels duplicados y cada módulo trae todos sus campos', () => {
    for (const campo of ['id', 'path', 'label']) {
      const valores = MODULOS.map((m) => m[campo]);
      expect(new Set(valores).size, `${campo} duplicado`).toBe(valores.length);
    }
    for (const m of MODULOS) {
      expect(m.id && m.label && m.path && m.icon && m.grupo, m.id).toBeTruthy();
      expect(m.path.startsWith('/')).toBe(true);
    }
  });

  it('cada meta.modulo de las rutas pertenece a MODULOS', () => {
    const ids = new Set(MODULOS.map((m) => m.id));
    const usados = RUTAS.map((r) => r.meta?.modulo).filter(Boolean);
    expect(usados.length).toBeGreaterThan(0);
    for (const modulo of usados) expect(ids.has(modulo), `meta.modulo desconocido: ${modulo}`).toBe(true);
  });

  it('cada módulo tiene su ruta raíz protegida con su propio meta.modulo', () => {
    for (const m of MODULOS) {
      const ruta = RUTAS.find((r) => r.path === m.path);
      expect(ruta, `sin ruta para ${m.path}`).toBeDefined();
      expect(ruta.meta?.modulo, m.path).toBe(m.id);
    }
  });

  it('MODULOS_CONFIGURABLES se deriva de MODULOS y constants/modulos.js lo re-exporta', () => {
    expect(MODULOS_CONFIGURABLES).toEqual(MODULOS.map(({ id, label }) => ({ id, label })));
    expect(DESDE_CONSTANTS).toBe(MODULOS_CONFIGURABLES);
  });
});

describe('navegación del shell', () => {
  const items = AREAS_NAV.flatMap((a) => a.grupos.flatMap((g) => g.items.map((i) => ({ ...i, grupo: g.id }))));

  it('estructura decidida: Inicio · Mesa de ayuda · Personas · Custodia · Administración', () => {
    const grupos = AREAS_NAV[0].grupos.map((g) => [g.label, g.items.map((i) => i.label)]);
    expect(grupos).toEqual([
      ['', ['Inicio', 'Reportes']],
      ['Mesa de ayuda', ['Tickets', 'Conocimiento', 'Problemas', 'Cambios']],
      ['Personas', ['Empleados', 'Solicitudes', 'Encuestas']],
      ['Custodia', ['Equipos', 'Licencias', 'Correos']],
      ['Administración', ['Registro de actividad', 'Accesos sensibles', 'Configuración']],
    ]);
  });

  // Solicitudes (migración 108) NO es un módulo: es un ítem extra que cuelga del
  // módulo `empleados` (mismo meta.modulo en su ruta). El CHECK de la 056 admite
  // 8 módulos y ninguno es «solicitudes».
  // Cambios (migración 107) tampoco lo es: cuelga del módulo `tickets`.
  // Reportes (115/117) no cuelga de un módulo: se ve con cualquiera que tenga un reporte.
  const EXTRAS_DE_MODULO = ['/solicitudes', '/cambios'];

  it('los ítems con módulo salen del registro y caen en el grupo que éste declara', () => {
    const conModulo = items.filter((i) => i.modulo && !EXTRAS_DE_MODULO.includes(i.path));
    expect(conModulo.map((i) => i.modulo).sort()).toEqual(MODULOS.map((m) => m.id).sort());
    for (const i of conModulo) {
      const m = MODULOS.find((x) => x.id === i.modulo);
      expect(i.grupo, i.modulo).toBe(m.grupo);
      expect(i.path).toBe(m.path);
    }
  });

  // El sidebar es el reflejo del guard, nunca la barrera: un ítem visible
  // cuya ruta el guard bloquea (o al revés) es un enlace roto para el usuario.
  it('cada ítem refleja el guard de su ruta (meta.modulo / meta.roles)', () => {
    for (const i of items) {
      const ruta = RUTAS.find((r) => r.path === i.path);
      expect(ruta, `sin ruta para ${i.path}`).toBeDefined();
      expect(i.modulo ?? null, `${i.path}: modulo`).toBe(ruta.meta?.modulo ?? null);
      expect(i.algunModulo ?? null, `${i.path}: algunModulo`).toEqual(ruta.meta?.algunModulo ?? null);
      expect(Boolean(i.soloJefe), `${i.path}: soloJefe`).toBe(Boolean(ruta.meta?.roles?.includes('jefe')));
    }
  });

  it('Solicitudes cuelga del módulo empleados, sin inventar un permiso nuevo', () => {
    const extra = items.filter((i) => i.path === '/solicitudes');
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ label: 'Solicitudes', modulo: 'empleados', grupo: 'personas' });
    for (const ruta of RUTAS.filter((r) => r.path.startsWith('/solicitudes'))) {
      expect(ruta.meta?.modulo, ruta.path).toBe('empleados');
    }
    expect(MODULOS.map((m) => m.id)).not.toContain('solicitudes');
  });

  it('Cambios cuelga del módulo tickets, en Mesa de ayuda, sin inventar un permiso nuevo', () => {
    const extra = items.filter((i) => i.path === '/cambios');
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ label: 'Cambios', modulo: 'tickets', grupo: 'mesa-de-ayuda' });
    expect(extra[0].soloJefe).toBeFalsy();
    for (const ruta of RUTAS.filter((r) => r.path.startsWith('/cambios'))) {
      expect(ruta.meta?.modulo, ruta.path).toBe('tickets');
    }
    expect(MODULOS.map((m) => m.id)).not.toContain('cambios');
    expect(migasDeRuta('/cambios')).toEqual([{ label: 'Mesa de ayuda' }, { label: 'Cambios' }]);
    expect(migasDeRuta('/cambios/c1')).toEqual([{ label: 'Mesa de ayuda' }, { label: 'Cambios', to: '/cambios' }]);
  });

  it('Reportes va junto a Inicio, se ve con cualquier módulo que tenga un reporte y cada hoja exige el permiso de su RPC', () => {
    const extra = items.filter((i) => i.path === '/reportes');
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ label: 'Reportes', grupo: 'general' });
    expect(extra[0].modulo).toBeUndefined();
    expect([...extra[0].algunModulo].sort()).toEqual([...MODULOS_CON_REPORTE].sort());
    expect(MODULOS.map((m) => m.id)).not.toContain('reportes');
    // Una ruta por reporte del catálogo, con el MISMO permiso que exige su RPC.
    const rutas = RUTAS.filter((r) => r.path.startsWith('/reportes/'));
    expect(rutas.map((r) => r.path).sort()).toEqual(REPORTES.map((r) => `/reportes/${r.id}`).sort());
    for (const r of REPORTES) {
      const ruta = RUTAS.find((x) => x.path === `/reportes/${r.id}`);
      if (r.rol) expect(ruta.meta?.roles, r.id).toEqual([r.rol]);
      else expect(ruta.meta?.modulo, r.id).toBe(r.modulo);
    }
    expect(REPORTES.find((r) => r.id === 'auditoria')).toMatchObject({ rol: 'jefe' });
    expect(migasDeRuta('/reportes')).toEqual([{ label: 'Reportes' }]);
    expect(migasDeRuta('/reportes/inventario')).toEqual([{ label: 'Reportes', to: '/reportes' }, { label: 'Inventario de equipos' }]);
  });

  it('la ruta vieja de Satisfacción redirige a su reporte', () => {
    const vieja = RUTAS.find((r) => r.path === '/tickets/satisfaccion');
    expect(vieja?.redirect).toBe('/reportes/satisfaccion');
  });

  it('las migas usan los nombres nuevos', () => {
    expect(migasDeRuta('/tickets')).toEqual([{ label: 'Mesa de ayuda' }, { label: 'Tickets' }]);
    expect(migasDeRuta('/base-conocimiento')).toEqual([{ label: 'Mesa de ayuda' }, { label: 'Conocimiento' }]);
    expect(migasDeRuta('/encuestas')).toEqual([{ label: 'Personas' }, { label: 'Encuestas' }]);
    expect(migasDeRuta('/solicitudes')).toEqual([{ label: 'Personas' }, { label: 'Solicitudes' }]);
    expect(migasDeRuta('/solicitudes/s1')).toEqual([{ label: 'Personas' }, { label: 'Solicitudes', to: '/solicitudes' }]);
    expect(migasDeRuta('/equipos')).toEqual([{ label: 'Custodia' }, { label: 'Equipos' }]);
    expect(migasDeRuta('/actividad')).toEqual([{ label: 'Administración' }, { label: 'Registro de actividad' }]);
    expect(migasDeRuta('/equipos/importar')).toEqual([
      { label: 'Custodia' },
      { label: 'Equipos', to: '/equipos' },
      { label: 'Importar desde Excel' },
    ]);
    expect(migasDeRuta('/dashboard')).toEqual([{ label: 'Inicio' }]);
  });
});
