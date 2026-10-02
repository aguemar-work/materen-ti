// @vitest-environment happy-dom
//
// Listado de Solicitudes de servicio (migración 108), montado de verdad: Pinia,
// router, store paginado, vistas con conteo, chip de tipo, tabla de libro y la
// URL como fuente de verdad de los filtros. Solo api/insforge.js está mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import SolicitudesView from '../../src/modules/solicitudes/SolicitudesView.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listSolicitudesPage: vi.fn(),
    conteosSolicitudesPorEstado: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const paso = (orden, estado, label) => ({ id: `p${orden}`, orden, estado, obligatorio: true, label, clave: `c${orden}` });
const solicitud = (extra = {}) => ({
  id: 's1', codigo: 'SOL-0012', tipo_id: 'alta_empleado', tipo_nombre: 'Alta de empleado', empleado_id: 'e7',
  empleado_nombre: 'Ana Torres', estado: 'abierta', origen: 'rrhh_correo', created_at: '2026-09-28T15:00:00',
  pasos: [paso(1, 'hecho', 'Registrar a la persona'), paso(2, 'pendiente', 'Crear la cuenta de correo'), paso(3, 'pendiente', 'Confirmar')],
  ...extra,
});
const FILAS = [
  solicitud(),
  solicitud({ id: 's2', codigo: 'SOL-0011', tipo_id: 'baja_empleado', tipo_nombre: 'Baja de empleado', empleado_id: 'e6', empleado_nombre: 'Pedro Ticona', origen: 'sistema', pasos: [paso(1, 'hecho', 'Cerrar accesos'), paso(3, 'pendiente', 'Recuperar el equipo CEL-001')] }),
];

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar(url = '/solicitudes') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/solicitudes', component: { template: '<div />' } },
      { path: '/solicitudes/:id', component: { template: '<div />' } },
      { path: '/empleados/:id', component: { template: '<div />' } },
    ],
  });
  router.push(url);
  await router.isReady();
  wrapper = mount(SolicitudesView, {
    attachTo: document.body,
    global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { SolicitudForm: true } },
  });
  for (let i = 0; i < 5; i += 1) await espera();
  return { w: wrapper, router };
}

const vistas = (w) => w.findAll('[role="group"][aria-label="Vista de solicitudes"] button');
const filas = (w) => w.findAll('tbody tr');
const llamadaLista = () => insforgeApi.listSolicitudesPage.mock.calls.at(-1)[0];

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listSolicitudesPage.mockResolvedValue({ items: FILAS, total: 2 });
  insforgeApi.conteosSolicitudesPorEstado.mockResolvedValue({ abierta: 2, completada: 5, cancelada: 1, todas: 8 });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('SolicitudesView — listado', () => {
  it('por defecto muestra las ABIERTAS: código con AppCodigo, tipo, persona enlazada, avance y lo que falta', async () => {
    const { w } = await montar();
    expect(llamadaLista()).toMatchObject({ estado: 'abierta', q: '', tipos: [], pagina: 1 });
    expect(w.find('h1').text()).toBe('Solicitudes');
    const f = filas(w);
    expect(f).toHaveLength(2);
    expect(f[0].find('a[href="/solicitudes/s1"] [data-codigo]').text()).toBe('SOL-0012');
    expect(f[0].text()).toContain('Alta de empleado');
    expect(f[0].text()).toContain('Pedido de RRHH por correo');
    expect(f[0].find('a[href="/empleados/e7"]').text()).toBe('Ana Torres');
    expect(f[0].text()).toContain('1 de 3 pasos');
    expect(f[0].text()).toContain('Falta: Crear la cuenta de correo');
    expect(f[1].text()).toContain('Falta: Recuperar el equipo CEL-001');
  });

  it('las vistas llevan su conteo y la de trabajo (Abiertas) viene elegida', async () => {
    const { w } = await montar();
    const etiquetas = vistas(w).map((b) => b.text().replace(/\s+/g, ' ').trim());
    expect(etiquetas).toEqual(['Abiertas 2', 'Completadas 5', 'Canceladas 1', 'Todas 8']);
    expect(vistas(w)[0].attributes('aria-pressed')).toBe('true');
    expect(vistas(w)[1].attributes('aria-pressed')).toBe('false');
  });

  it('elegir una vista pide ese estado al servidor y lo deja en la URL; "Todas" pide sin estado y suma la columna Estado', async () => {
    const { w, router } = await montar();
    expect(w.findAll('thead th').map((t) => t.text())).not.toContain('Estado');
    await vistas(w)[1].trigger('click');
    await espera(10);
    expect(llamadaLista().estado).toBe('completada');
    expect(router.currentRoute.value.query.estado).toBe('completada');
    await vistas(w)[3].trigger('click');
    await espera(10);
    expect(llamadaLista().estado).toBe('');
    expect(router.currentRoute.value.query.estado).toBe('todas');
    expect(w.findAll('thead th').map((t) => t.text())).toContain('Estado');
    await vistas(w)[0].trigger('click');
    await espera(10);
    expect(router.currentRoute.value.query.estado).toBeUndefined(); // el valor por defecto no ensucia la URL
  });

  it('la URL manda: estado, tipo y búsqueda del enlace se aplican al servidor y a los conteos', async () => {
    const { w } = await montar('/solicitudes?estado=completada&tipo=licencia,acceso_nuevo&q=ana');
    expect(llamadaLista()).toMatchObject({ estado: 'completada', tipos: ['licencia', 'acceso_nuevo'], q: 'ana' });
    expect(insforgeApi.conteosSolicitudesPorEstado).toHaveBeenCalledWith({ q: 'ana', tipos: ['licencia', 'acceso_nuevo'] });
    expect(vistas(w)[1].attributes('aria-pressed')).toBe('true');
    expect(w.find('input[type="search"], input[type="text"]').element.value).toBe('ana');
    expect(w.text()).toContain('Limpiar');
  });

  it('un filtro que no devuelve nada dice "Sin resultados" y ofrece limpiar; una vista vacía no finge que no hay solicitudes', async () => {
    insforgeApi.listSolicitudesPage.mockResolvedValue({ items: [], total: 0 });
    const { w } = await montar('/solicitudes?q=zzz');
    expect(w.text()).toContain('Sin resultados');
    expect(w.text()).toContain('Limpiar filtros');
    wrapper.unmount();
    const { w: w2 } = await montar('/solicitudes?estado=cancelada');
    expect(w2.text()).toContain('Sin solicitudes canceladas');
    expect(w2.text()).toContain('Las demás pestañas muestran el resto de los trámites');
  });

  it('sin ninguna solicitud en el sistema invita a registrar la primera', async () => {
    insforgeApi.listSolicitudesPage.mockResolvedValue({ items: [], total: 0 });
    insforgeApi.conteosSolicitudesPorEstado.mockResolvedValue({ abierta: 0, completada: 0, cancelada: 0, todas: 0 });
    const { w } = await montar();
    expect(w.text()).toContain('Sin solicitudes todavía');
    expect(w.text()).toContain('Registre la primera solicitud');
  });

  it('un fallo del servidor se muestra como alerta en español, no como un listado vacío', async () => {
    insforgeApi.listSolicitudesPage.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    const { w } = await montar();
    expect(w.find('[role="alert"]').text()).toContain('No tiene permiso');
    expect(w.find('table').exists()).toBe(false);
  });

  it('la fila entera abre la solicitud', async () => {
    const { w, router } = await montar();
    await filas(w)[1].trigger('click');
    await espera(10);
    expect(router.currentRoute.value.path).toBe('/solicitudes/s2');
  });
});

describe('SolicitudesView — nueva solicitud', () => {
  it('«Nueva solicitud» abre el formulario y, al crearla, lleva a su detalle', async () => {
    const { w, router } = await montar();
    expect(w.findComponent({ name: 'SolicitudForm' }).exists()).toBe(false);
    await w.findAll('button').find((b) => b.text() === 'Nueva solicitud').trigger('click');
    const form = w.findComponent({ name: 'SolicitudForm' });
    expect(form.exists()).toBe(true);
    form.vm.$emit('cerrar', { id: 's99', codigo: 'SOL-0099' });
    await espera(10);
    expect(router.currentRoute.value.path).toBe('/solicitudes/s99');
    expect(w.findComponent({ name: 'SolicitudForm' }).exists()).toBe(false);
  });

  it('cerrar el formulario sin crear no navega', async () => {
    const { w, router } = await montar();
    await w.findAll('button').find((b) => b.text() === 'Nueva solicitud').trigger('click');
    w.findComponent({ name: 'SolicitudForm' }).vm.$emit('cerrar', false);
    await espera(10);
    expect(router.currentRoute.value.path).toBe('/solicitudes');
  });
});
