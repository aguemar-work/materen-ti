// Regla (pedido del dueño, 2026-10-21): en todo listado, búsqueda, filtros y
// vistas van en UNA línea, en ese orden: AppBuscador · AppFiltros (un solo
// menú) · [Limpiar] · AppVistas `en-barra` a la derecha. Este test recorre los
// módulos para que un listado nuevo (o uno editado) no vuelva a poner las
// pestañas en una fila aparte ni cambie el orden.
// Inicio (DashboardView) no es un listado: no tiene barra de filtros.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '../src/modules');
const EXCEPCIONES = ['dashboard/DashboardView.vue'];

function vues(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? vues(p) : p.endsWith('.vue') ? [p] : [];
  });
}

describe('vistas en la barra', () => {
  const conVistas = vues(RAIZ)
    .map((p) => ({ p, rel: p.slice(RAIZ.length + 1).replaceAll('\\', '/'), src: readFileSync(p, 'utf8') }))
    .filter((f) => f.src.includes('<AppVistas') && !EXCEPCIONES.includes(f.rel));

  it('hay listados que verificar', () => {
    expect(conVistas.length).toBeGreaterThan(5);
  });

  it.each(conVistas.map((f) => [f.rel, f.src]))('%s: búsqueda · Filtros · vistas en-barra, en la misma AppBarraFiltros', (_rel, src) => {
    const barra = src.match(/<AppBarraFiltros\b[\s\S]*?<\/AppBarraFiltros>/);
    expect(barra, 'el listado tiene AppBarraFiltros').toBeTruthy();
    const b = barra[0];
    const iVistas = b.indexOf('<AppVistas');
    expect(iVistas, 'AppVistas va dentro de AppBarraFiltros').toBeGreaterThan(-1);
    expect(b.slice(iVistas)).toMatch(/^<AppVistas\b[^>]*\sen-barra\b/);
    const iFiltros = b.indexOf('<AppFiltros');
    expect(iFiltros, 'hay un menú de filtros').toBeGreaterThan(-1);
    expect(iFiltros, 'Filtros va antes que las vistas').toBeLessThan(iVistas);
    const iBuscador = b.indexOf('<AppBuscador');
    if (iBuscador > -1) expect(iBuscador, 'el buscador va primero').toBeLessThan(iFiltros);
  });
});
