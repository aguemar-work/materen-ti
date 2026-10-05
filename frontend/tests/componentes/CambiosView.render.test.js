// @vitest-environment happy-dom
//
// Listado de Cambios (migración 107), montado de verdad: Pinia, router, store
// paginado, vistas con conteo, chips de tipo y servicio, tabla de libro y la URL como
// fuente de verdad de los filtros, más la franja de indicadores (emergencias sin
// aprobar y resumen de 90 días). Solo api/insforge.js está mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import CambiosView from '../../src/modules/cambios/CambiosView.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listCambiosPage: vi.fn(),
    conteosCambiosPorVista: vi.fn(),
    kpiCambios: vi.fn(),
    cambiosAprobacionVencida: vi.fn(),
    listServicios: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const ACTIVOS = ['borrador', 'solicitado', 'aprobado', 'en_ejecucion', 'implementado'];
const cambio = (extra = {}) => ({
  id: 'c1', codigo: 'CHG-0004', titulo: 'Reemplazo del router principal', tipo: 'normal', riesgo: 'medio', servicio_id: 'red',
  servicio_nombre: 'Internet y red', estado: 'solicitado', ventana_inicio: '2026-10-03T08:00:00', ventana_fin: '2026-10-03T10:00:00',
  aprobado_por: null, aprobacion_pendiente_hasta: null, created_at: '2026-10-01T15:00:00', ...extra,
});
const FILAS = [
  cambio(),
  cambio({
    id: 'c2', codigo: 'CHG-0005', titulo: 'Reinicio del concentrador VPN', tipo: 'emergencia', riesgo: 'alto', servicio_nombre: 'VPN y acceso remoto', estado: 'implementado',
    ventana_inicio: null, ventana_fin: null, aprobacion_pendiente_hasta: new Date(Date.now() - 5 * 3600000).toISOString(),
  }),
];

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar(url = '/cambios') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cambios', component: { template: '<div />' } },
      { path: '/cambios/:id', component: { template: '<div />' } },
    ],
  });
  router.push(url);
  await router.isReady();
  wrapper = mount(CambiosView, {
    attachTo: document.body,
    global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { CambioForm: true } },
  });
  for (let i = 0; i < 5; i += 1) await espera();
  return { w: wrapper, router };
}

const vistas = (w) => w.findAll('[role="group"][aria-label="Vista de cambios"] button');
const filas = (w) => w.findAll('tbody tr');
const llamadaLista = () => insforgeApi.listCambiosPage.mock.calls.at(-1)[0];

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listCambiosPage.mockResolvedValue({ items: FILAS, total: 2 });
  insforgeApi.conteosCambiosPorVista.mockResolvedValue({ activos: 8, por_aprobar: 1, en_ejecucion: 2, cerrados: 14, todos: 22 });
  insforgeApi.kpiCambios.mockResolvedValue([]);
  insforgeApi.cambiosAprobacionVencida.mockResolvedValue([]);
  insforgeApi.listServicios.mockImplementation(async () => [{ id: 'red', nombre: 'Internet y red' }, { id: 'vpn', nombre: 'VPN y acceso remoto' }]);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('CambiosView — listado', () => {
  it('por defecto muestra los cambios EN CURSO: código, título con servicio, tipo, riesgo, ventana y estado', async () => {
    const { w } = await montar();
    expect(llamadaLista()).toMatchObject({ estados: ACTIVOS, q: '', tipos: [], servicios: [], pagina: 1 });
    expect(w.find('h1').text()).toBe('Cambios');
    const f = filas(w);
    expect(f).toHaveLength(2);
    expect(f[0].find('a[href="/cambios/c1"] [data-codigo]').text()).toBe('CHG-0004');
    expect(f[0].text()).toContain('Reemplazo del router principal');
    expect(f[0].text()).toContain('Internet y red');
    expect(f[0].text()).toContain('Normal');
    expect(f[0].text()).toContain('Medio');
    expect(f[0].text()).toContain('03/10/26');
    expect(f[0].text()).toContain('Por aprobar');
    expect(f[1].text()).toContain('Emergencia');
    expect(f[1].text()).toContain('Alto');
    expect(f[1].text()).toContain('Sin ventana');
    expect(f[1].text()).toContain('Implementado');
  });

  it('una emergencia sin aprobar muestra su plazo vencido en la fila', async () => {
    const { w } = await montar();
    expect(filas(w)[1].text()).toContain('Sin aprobar · Plazo vencido hace 5 horas');
    expect(filas(w)[0].text()).not.toContain('Sin aprobar');
  });

  it('las vistas llevan su conteo y «En curso» viene elegida', async () => {
    const { w } = await montar();
    const etiquetas = vistas(w).map((b) => b.text().replace(/\s+/g, ' ').trim());
    expect(etiquetas).toEqual(['En curso 8', 'Por aprobar 1', 'En ejecución 2', 'Terminados 14', 'Todos 22']);
    expect(vistas(w)[0].attributes('aria-pressed')).toBe('true');
    expect(vistas(w)[1].attributes('aria-pressed')).toBe('false');
  });

  it('elegir una vista pide sus estados y la deja en la URL; «Todos» no filtra; el defecto no ensucia la URL', async () => {
    const { w, router } = await montar();
    await vistas(w)[1].trigger('click');
    await espera(10);
    expect(llamadaLista().estados).toEqual(['solicitado']);
    expect(router.currentRoute.value.query.vista).toBe('por_aprobar');
    // en una vista de un solo estado la columna Estado repetiría la pestaña
    expect(w.findAll('thead th').map((t) => t.text())).not.toContain('Estado');
    await vistas(w)[4].trigger('click');
    await espera(10);
    expect(llamadaLista().estados).toEqual([]);
    expect(w.findAll('thead th').map((t) => t.text())).toContain('Estado');
    await vistas(w)[3].trigger('click');
    await espera(10);
    expect(llamadaLista().estados).toEqual(['cerrado', 'rechazado', 'cancelado', 'revertido']);
    await vistas(w)[0].trigger('click');
    await espera(10);
    expect(router.currentRoute.value.query.vista).toBeUndefined();
  });

  it('la URL manda: vista, tipo, servicio y búsqueda del enlace se aplican al servidor y a los conteos', async () => {
    const { w } = await montar('/cambios?vista=en_ejecucion&tipo=emergencia,normal&servicio=vpn&q=router');
    expect(llamadaLista()).toMatchObject({ estados: ['en_ejecucion'], tipos: ['emergencia', 'normal'], servicios: ['vpn'], q: 'router' });
    expect(insforgeApi.conteosCambiosPorVista).toHaveBeenCalledWith({ q: 'router', tipos: ['emergencia', 'normal'], servicios: ['vpn'] });
    expect(vistas(w)[2].attributes('aria-pressed')).toBe('true');
    expect(w.find('input[type="search"], input[type="text"]').element.value).toBe('router');
    expect(w.text()).toContain('Limpiar');
  });

  it('un filtro sin resultados dice «Sin resultados»; una vista vacía no finge que no hay cambios', async () => {
    insforgeApi.listCambiosPage.mockResolvedValue({ items: [], total: 0 });
    const { w } = await montar('/cambios?q=zzz');
    expect(w.text()).toContain('Sin resultados');
    expect(w.text()).toContain('Limpiar filtros');
    wrapper.unmount();
    const { w: w2 } = await montar('/cambios?vista=por_aprobar');
    expect(w2.text()).toContain('Sin cambios en «por aprobar»');
    expect(w2.text()).toContain('Las demás pestañas muestran el resto de los cambios');
  });

  it('sin ningún cambio en el sistema invita a registrar el primero', async () => {
    insforgeApi.listCambiosPage.mockResolvedValue({ items: [], total: 0 });
    insforgeApi.conteosCambiosPorVista.mockResolvedValue({ activos: 0, por_aprobar: 0, en_ejecucion: 0, cerrados: 0, todos: 0 });
    const { w } = await montar();
    expect(w.text()).toContain('Sin cambios todavía');
    expect(w.text()).toContain('Registre el primer cambio antes de tocar producción');
  });

  it('un fallo del servidor se muestra como alerta en español, no como un listado vacío', async () => {
    insforgeApi.listCambiosPage.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    const { w } = await montar();
    expect(w.find('[role="alert"]').text()).toContain('No tiene permiso');
    expect(w.find('table').exists()).toBe(false);
  });

  it('la fila entera abre el cambio', async () => {
    const { w, router } = await montar();
    await filas(w)[1].trigger('click');
    await espera(10);
    expect(router.currentRoute.value.path).toBe('/cambios/c2');
  });

  it('los chips ofrecen tipo y los servicios del catálogo', async () => {
    const { w } = await montar();
    expect(insforgeApi.listServicios).toHaveBeenCalled();
    const boton = w.findAll('button').find((b) => b.text().includes('Filtro'));
    expect(boton).toBeTruthy();
    await boton.trigger('click');
    await espera(10);
    const panel = document.body.textContent;
    expect(panel).toContain('Tipo');
    expect(panel).toContain('Servicio');
  });
});

describe('CambiosView — indicadores', () => {
  it('avisa de las emergencias sin aprobar que pasaron las 48 horas, con enlace a cada una', async () => {
    insforgeApi.cambiosAprobacionVencida.mockResolvedValue([{ cambio_id: 'c2', codigo: 'CHG-0005' }, { cambio_id: 'c7', codigo: 'CHG-0007' }]);
    const { w } = await montar();
    const aviso = w.find('[data-vencidas]');
    expect(aviso.attributes('role')).toBe('alert');
    expect(aviso.text()).toContain('2 emergencias sin aprobar pasaron el plazo de 48 horas');
    expect(aviso.find('a[href="/cambios/c2"]').text()).toBe('CHG-0005');
    expect(aviso.find('a[href="/cambios/c7"]').text()).toBe('CHG-0007');
  });

  it('en singular dice «emergencia sin aprobar pasó»', async () => {
    insforgeApi.cambiosAprobacionVencida.mockResolvedValue([{ cambio_id: 'c2', codigo: 'CHG-0005' }]);
    const { w } = await montar();
    expect(w.find('[data-vencidas]').text()).toContain('1 emergencia sin aprobar pasó el plazo de 48 horas');
  });

  it('resume los últimos 90 días: cambios, % de emergencia y revertidos', async () => {
    insforgeApi.kpiCambios.mockResolvedValue([
      { tipo: 'estandar', total_90d: 4, revertidos_90d: 0, pct_del_total_90d: 33.3 },
      { tipo: 'normal', total_90d: 6, revertidos_90d: 1, pct_del_total_90d: 50 },
      { tipo: 'emergencia', total_90d: 2, revertidos_90d: 1, pct_del_total_90d: 16.7 },
    ]);
    const { w } = await montar();
    const texto = w.find('[data-resumen-90d]').text().replace(/\s+/g, ' ');
    expect(texto).toContain('Últimos 90 días: 12 cambios');
    expect(texto).toMatch(/16[.,]7 % de emergencia/);
    expect(texto).toContain('2 revertidos');
  });

  it('sin cambios o si las vistas fallan, la franja no se dibuja y el listado funciona igual', async () => {
    insforgeApi.kpiCambios.mockRejectedValue({ code: '42501', message: 'x' });
    insforgeApi.cambiosAprobacionVencida.mockRejectedValue({ code: '42501', message: 'x' });
    const { w } = await montar();
    expect(w.find('[data-vencidas]').exists()).toBe(false);
    expect(w.find('[data-resumen-90d]').exists()).toBe(false);
    expect(filas(w)).toHaveLength(2);
  });
});

describe('CambiosView — nuevo cambio', () => {
  it('«Nuevo cambio» abre el formulario y, al registrarlo, lleva a su detalle', async () => {
    const { w, router } = await montar();
    expect(w.findComponent({ name: 'CambioForm' }).exists()).toBe(false);
    await w.findAll('button').find((b) => b.text() === 'Nuevo cambio').trigger('click');
    const form = w.findComponent({ name: 'CambioForm' });
    expect(form.exists()).toBe(true);
    form.vm.$emit('cerrar', { id: 'c99', codigo: 'CHG-0099' });
    await espera(10);
    expect(router.currentRoute.value.path).toBe('/cambios/c99');
    expect(w.findComponent({ name: 'CambioForm' }).exists()).toBe(false);
  });

  it('cerrar el formulario sin crear no navega', async () => {
    const { w, router } = await montar();
    await w.findAll('button').find((b) => b.text() === 'Nuevo cambio').trigger('click');
    w.findComponent({ name: 'CambioForm' }).vm.$emit('cerrar', false);
    await espera(10);
    expect(router.currentRoute.value.path).toBe('/cambios');
  });
});
