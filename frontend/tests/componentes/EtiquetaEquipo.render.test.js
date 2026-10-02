// @vitest-environment happy-dom
//
// EtiquetaEquipo.vue (etiqueta física 50 × 25 mm) y la hoja de etiquetas por
// lote. Lo importante (plan §3.6): el SVG codifica EXACTAMENTE la URL esperada
// `<origen>/e/<código>` —y nada más—, con corrección de errores M; la etiqueta
// lleva el código con AppCodigo y la empresa; y la hoja arma una etiqueta por
// equipo a partir de ?ids= o ?todos=1.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import * as QR from 'qrcode';
import EtiquetaEquipo from '../../src/components/ui/EtiquetaEquipo.vue';
import EtiquetasEquiposView from '../../src/modules/equipos/EtiquetasEquiposView.vue';
import { matrizDeTrazo } from '../../src/core/qr.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: { listEquiposPorIds: vi.fn(), listEquiposFiltrados: vi.fn() },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const ORIGEN = 'https://ti.materen.pe';

// Matriz que dibuja el SVG de una etiqueta montada.
function matrizDelSvg(svg) {
  const tamano = Number(svg.attributes('data-qr-tamano'));
  return { tamano, oscuros: matrizDeTrazo(svg.find('path').attributes('d'), tamano) };
}

describe('EtiquetaEquipo', () => {
  it('el SVG codifica exactamente la URL <origen>/e/<código> (compara con el generador)', () => {
    const w = mount(EtiquetaEquipo, { props: { codigo: 'LAP-0142', empresa: 'Materen', origen: ORIGEN } });
    const svg = w.find('svg');
    const url = `${ORIGEN}/e/LAP-0142`;
    expect(svg.attributes('data-qr-url')).toBe(url);

    // Lo que el SVG dibuja == la matriz del QR de ESA url (nivel M).
    const esperada = QR.create(url, { errorCorrectionLevel: 'M' });
    const dibujada = matrizDelSvg(svg);
    expect(dibujada.tamano).toBe(esperada.modules.size);
    expect(Array.from(dibujada.oscuros)).toEqual(Array.from(esperada.modules.data));

    // Y el texto que el QR lleva por dentro es la URL, sin nada más (modo mixto:
    // los segmentos de bytes y de alfanumérico juntos son el texto íntegro).
    const texto = esperada.segments
      .map((seg) => (typeof seg.data === 'string' ? seg.data : String.fromCharCode(...seg.data)))
      .join('');
    expect(texto).toBe(url);
    expect(esperada.errorCorrectionLevel.bit).toBe(0); // 0 = M
  });

  it('no codifica ningún dato además del código: ni empresa, ni serie, ni ids', () => {
    const w = mount(EtiquetaEquipo, { props: { codigo: 'LAP-0142', empresa: 'Materen Constructora', origen: ORIGEN } });
    const url = w.find('svg').attributes('data-qr-url');
    expect(url).toBe('https://ti.materen.pe/e/LAP-0142');
    expect(url).not.toMatch(/Materen Constructora|serie|token|\?/i);
  });

  it('dos equipos distintos dibujan QR distintos', () => {
    const a = mount(EtiquetaEquipo, { props: { codigo: 'LAP-0001', origen: ORIGEN } }).find('path').attributes('d');
    const b = mount(EtiquetaEquipo, { props: { codigo: 'LAP-0002', origen: ORIGEN } }).find('path').attributes('d');
    expect(a).not.toBe(b);
  });

  it('mide 50 × 25 mm y muestra el código con AppCodigo y la empresa', () => {
    const w = mount(EtiquetaEquipo, { props: { codigo: 'LAP-0142', empresa: 'Materen', origen: ORIGEN } });
    const clases = w.find('[data-etiqueta]').attributes('class');
    expect(clases).toContain('h-[25mm]');
    expect(clases).toContain('w-[50mm]');
    expect(w.find('[data-codigo]').text()).toBe('LAP-0142');
    expect(w.find('[data-codigo]').classes()).toContain('tabular-nums');
    expect(w.text()).toContain('Materen');
    expect(w.find('svg').attributes('aria-label')).toBe('Código QR de LAP-0142');
  });

  it('sin empresa no deja un hueco', () => {
    const w = mount(EtiquetaEquipo, { props: { codigo: 'LAP-0142', origen: ORIGEN } });
    expect(w.text()).toBe('LAP-0142');
  });

  it('usa el origen del navegador cuando no se inyecta uno', () => {
    const w = mount(EtiquetaEquipo, { props: { codigo: 'LAP-0142' } });
    expect(w.find('svg').attributes('data-qr-url')).toBe(`${window.location.origin}/e/LAP-0142`);
  });
});

describe('EtiquetasEquiposView — hoja por lote', () => {
  const EQUIPOS = [
    { id: 'q1', codigo: 'LAP-001', empresa_nombre: 'Materen' },
    { id: 'q2', codigo: 'MON-001', empresa_nombre: '' },
  ];
  const flush = () => new Promise((r) => setTimeout(r, 0));

  async function montar(url) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/equipos', component: { template: '<div />' } },
        { path: '/equipos/etiquetas', component: EtiquetasEquiposView },
      ],
    });
    router.push(url);
    await router.isReady();
    const w = mount(EtiquetasEquiposView, { global: { plugins: [router] } });
    await flush();
    await flush();
    return w;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    insforgeApi.listEquiposPorIds.mockResolvedValue(EQUIPOS);
    insforgeApi.listEquiposFiltrados.mockResolvedValue(EQUIPOS);
  });

  it('?ids= pide esos equipos y arma una etiqueta por cada uno', async () => {
    const w = await montar('/equipos/etiquetas?ids=q1,q2');
    expect(insforgeApi.listEquiposPorIds).toHaveBeenCalledWith(['q1', 'q2']);
    expect(w.findAll('[data-etiqueta]')).toHaveLength(2);
    expect(w.text()).toContain('2 etiquetas de 50 × 25 mm · 1 hoja A4');
    expect(w.findAll('svg').map((s) => s.attributes('data-qr-url').split('/e/')[1])).toEqual(['LAP-001', 'MON-001']);
  });

  it('?todos=1 usa los filtros del listado', async () => {
    await montar('/equipos/etiquetas?todos=1&situacion=disponible&q=lap&tipo=laptop,monitor');
    expect(insforgeApi.listEquiposFiltrados).toHaveBeenCalledWith({
      q: 'lap', situacion: 'disponible', tipoIds: ['laptop', 'monitor'], empresaIds: [],
    });
  });

  it('avisa cuántos equipos pedidos no se encontraron', async () => {
    const w = await montar('/equipos/etiquetas?ids=q1,q2,q3');
    expect(w.text()).toContain('1 equipo no se encontró');
  });

  it('sin ids muestra un vacío con la salida al listado y no consulta nada', async () => {
    const w = await montar('/equipos/etiquetas');
    expect(insforgeApi.listEquiposPorIds).not.toHaveBeenCalled();
    expect(w.text()).toContain('Sin equipos que etiquetar');
  });

  it('44 etiquetas llenan una hoja A4 (4 × 11) y la 45 abre la segunda', async () => {
    const muchos = Array.from({ length: 45 }, (_, i) => ({ id: `q${i}`, codigo: `EQ-${String(i).padStart(4, '0')}`, empresa_nombre: '' }));
    insforgeApi.listEquiposPorIds.mockResolvedValue(muchos);
    const w = await montar(`/equipos/etiquetas?ids=${muchos.map((m) => m.id).join(',')}`);
    expect(w.text()).toContain('45 etiquetas de 50 × 25 mm · 2 hojas A4');
  });

  it('la hoja usa la página con nombre de impresión y los controles no salen en papel', async () => {
    const w = await montar('/equipos/etiquetas?ids=q1');
    expect(w.find('[data-hoja-etiquetas]').attributes('class')).toContain('[page:etiquetas]');
    expect(w.find('[data-no-print]').findAll('button, a').some((b) => b.text() === 'Imprimir')).toBe(true);
  });
});
