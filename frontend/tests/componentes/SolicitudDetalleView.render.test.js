// @vitest-environment happy-dom
//
// Expediente de una solicitud (migración 108), montado de verdad: carátula con
// el rótulo y el código (regla 20), sello solo en estados terminales (regla 15),
// la lista de pasos con lo que se ofrece a cada rol, y el libro de movimientos
// (regla 19). Solo api/insforge.js está mockeado; store, router y auth son reales.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import SolicitudDetalleView from '../../src/modules/solicitudes/SolicitudDetalleView.vue';
import { useAuthStore } from '../../src/stores/auth.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    getSolicitud: vi.fn(),
    objetivosDePasosSolicitud: vi.fn(),
    nombresStaff: vi.fn(),
    completarPasoSolicitud: vi.fn(),
    omitirPasoSolicitud: vi.fn(),
    cancelarSolicitud: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const paso = (orden, clave, label, extra = {}) => ({
  id: `p${orden}`, solicitud_id: 's1', orden, clave, label, obligatorio: true, modulo: 'empleados', referencia_tipo: null,
  objetivo_id: null, autocompleta: false, estado: 'pendiente', referencia_id: null, automatico: false, hecho_por: null,
  hecho_at: null, nota: '', motivo_omision: '', ...extra,
});

const ALTA = (extra = {}) => ({
  id: 's1', codigo: 'SOL-0012', tipo_id: 'alta_empleado', tipo_nombre: 'Alta de empleado', empleado_id: 'e7',
  empleado_nombre: 'Ana Torres', empleado_estado: 'Activo', estado: 'abierta', origen: 'rrhh_correo',
  nota: 'Pedido de RRHH por correo del lunes', datos: {}, ticket_id: null, ticket: null, creada_por: 'u1',
  completada_at: null, cancelada_at: null, cancelada_por: null, motivo_cancelacion: '', created_at: '2026-09-28T09:00:00',
  pasos: [
    paso(1, 'registrar_empleado', 'Registrar a la persona', { estado: 'hecho', automatico: true, hecho_por: 'u1', hecho_at: '2026-09-28T09:00:00' }),
    paso(2, 'crear_cuenta', 'Crear la cuenta de correo', { modulo: 'correos', referencia_tipo: 'cuenta', autocompleta: true }),
    paso(3, 'asignar_equipo', 'Asignar el equipo', { obligatorio: false, modulo: 'equipos', referencia_tipo: 'equipo', autocompleta: true }),
    paso(4, 'confirmar_recepcion', 'Confirmar la recepción con la persona'),
  ],
  ...extra,
});

const BAJA = () => ALTA({
  id: 's3', codigo: 'SOL-0003', tipo_id: 'baja_empleado', tipo_nombre: 'Baja de empleado', empleado_id: 'e6', empleado_nombre: 'Pedro Ticona', origen: 'sistema', nota: 'Término de contrato',
  pasos: [
    paso(1, 'cerrar_accesos', 'Cerrar los accesos y los asientos de licencia', { estado: 'hecho', automatico: true, hecho_at: '2026-09-01T09:00:00', nota: '1 asignaciones de cuenta y 0 de licencia cerradas.' }),
    paso(2, 'rotar_contrasenas', 'Rotar la contraseña de soporte@materen.pe · Gmail', { modulo: 'correos', referencia_tipo: 'cuenta', objetivo_id: 'c1', autocompleta: true }),
    paso(3, 'devolver_equipo', 'Recuperar el equipo CEL-001 · Samsung', { modulo: 'equipos', referencia_tipo: 'equipo', objetivo_id: 'ae1', autocompleta: true }),
  ],
});

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar({ solicitud = ALTA(), rol = 'JEFE', modulos = ['empleados', 'correos', 'equipos', 'licencias'] } = {}) {
  insforgeApi.getSolicitud.mockResolvedValue(solicitud);
  const auth = useAuthStore();
  auth.rol = rol;
  auth.modulosVisibles = modulos;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/solicitudes', component: { template: '<div />' } },
      { path: '/solicitudes/:id', component: { template: '<div />' } },
      { path: '/:resto(.*)*', component: { template: '<div />' } },
    ],
  });
  router.push(`/solicitudes/${solicitud?.id || 'x'}`);
  await router.isReady();
  wrapper = mount(SolicitudDetalleView, {
    attachTo: document.body,
    global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { SolicitudMotivoDialog: true } },
  });
  for (let i = 0; i < 6; i += 1) await espera();
  return { w: wrapper, router };
}

const pasos = (w) => w.findAll('[data-paso]');
const textoPaso = (li) => li.text().replace(/\s+/g, ' ').trim();
const botones = (li) => li.findAll('button, a').map((b) => b.text());

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.objetivosDePasosSolicitud.mockResolvedValue({});
  insforgeApi.nombresStaff.mockResolvedValue([{ user_id: 'u1', nombre: 'Alejandro Guevara' }, { user_id: 'u2', nombre: 'Diego Huamán' }]);
  insforgeApi.completarPasoSolicitud.mockResolvedValue({});
  insforgeApi.omitirPasoSolicitud.mockResolvedValue({});
  insforgeApi.cancelarSolicitud.mockResolvedValue({});
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('SolicitudDetalleView — carátula', () => {
  it('abre con rótulo SOLICITUD · código (AppCodigo), el tipo como único h1, el estado y el dl de datos', async () => {
    const { w } = await montar();
    const c = w.find('[data-caratula]');
    expect(c.find('p').text()).toContain('SOLICITUD');
    expect(c.find('p [data-codigo]').text()).toBe('SOL-0012');
    expect(w.findAll('h1')).toHaveLength(1);
    expect(c.find('h1').text()).toBe('Alta de empleado');
    expect(c.findAll('dt').map((d) => d.text())).toEqual(['Persona', 'Origen', 'Abierta', 'Avance']);
    expect(c.find('dd a[href="/empleados/e7"]').text()).toBe('Ana Torres');
    const valores = c.findAll('dd').map((d) => d.text());
    expect(valores[1]).toBe('Pedido de RRHH por correo');
    expect(valores[2]).toBe('28/09/2026');
    expect(valores[3]).toBe('1 de 4 pasos');
  });

  it('abierta: tag de estado, sin sello (el sello es de los estados terminales)', async () => {
    const { w } = await montar();
    const c = w.find('[data-caratula]');
    expect(c.find('[data-tag]').text()).toBe('Abierta');
    expect(c.find('[data-sello]').exists()).toBe(false);
  });

  it('completada y cancelada llevan SELLO con la fecha; la cancelada muestra su motivo', async () => {
    const { w } = await montar({ solicitud: ALTA({ estado: 'completada', completada_at: '2026-10-02T10:00:00' }) });
    expect(w.find('[data-caratula] [data-sello]').text()).toBe('COMPLETADA 02/10/26');
    wrapper.unmount();
    const { w: w2 } = await montar({ solicitud: ALTA({ estado: 'cancelada', cancelada_at: '2026-10-03T10:00:00', cancelada_por: 'u2', motivo_cancelacion: 'Pedido duplicado' }) });
    expect(w2.find('[data-caratula] [data-sello]').text()).toBe('CANCELADA 03/10/26');
    expect(w2.text()).toContain('Pedido duplicado');
  });

  it('el pedido (nota) se muestra aparte y el ticket de origen es un enlace', async () => {
    const { w } = await montar({ solicitud: ALTA({ ticket_id: 't9', ticket: { id: 't9', codigo: 'TCK-0116', titulo: 'Laptop' } }) });
    expect(w.text()).toContain('Pedido de RRHH por correo del lunes');
    expect(w.find('[data-caratula] dd a[href="/tickets/t9"] [data-codigo]').text()).toBe('TCK-0116');
  });

  it('«Más» ofrece Imprimir y Cancelar solicitud (solo abierta)', async () => {
    const { w } = await montar();
    await w.find('button[aria-label="Más acciones de la solicitud"]').trigger('click');
    expect([...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim())).toEqual(['Imprimir solicitud', 'Cancelar solicitud']);
    wrapper.unmount();
    document.body.innerHTML = '';
    const { w: w2 } = await montar({ solicitud: ALTA({ estado: 'completada', completada_at: '2026-10-02T10:00:00' }) });
    await w2.find('button[aria-label="Más acciones de la solicitud"]').trigger('click');
    expect([...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim())).toEqual(['Imprimir solicitud']);
  });
});

describe('SolicitudDetalleView — pasos', () => {
  it('cada paso con su estado y, los pendientes, con enlace al módulo, «Marcar hecho» y «Omitir» (solo si es opcional o hay jefe)', async () => {
    const { w } = await montar();
    const p = pasos(w);
    expect(p).toHaveLength(4);
    expect(p[0].attributes('data-estado')).toBe('hecho');
    expect(textoPaso(p[0])).toContain('Registrar a la persona');
    expect(textoPaso(p[0])).toContain('Hecho · Alejandro Guevara');
    expect(botones(p[0])).toEqual([]);
    // Un paso que el sistema marca solo lo avisa, y aun así se puede marcar a mano.
    expect(textoPaso(p[1])).toContain('Se marca solo al asignar una cuenta');
    expect(botones(p[1])).toEqual(['Abrir expediente', 'Marcar hecho', 'Omitir']); // JEFE: puede omitir un obligatorio
    expect(textoPaso(p[2])).toContain('opcional');
    expect(p[1].find('a[href="/empleados/e7"]').exists()).toBe(true);
  });

  it('un ASISTENTE no puede omitir un paso obligatorio (solo el opcional) ni abrir módulos que no tiene', async () => {
    const { w } = await montar({ rol: 'ASISTENTE', modulos: ['empleados'] });
    const p = pasos(w);
    // crear_cuenta (obligatorio, módulo correos): el enlace va al expediente (módulo empleados), sin Omitir.
    expect(botones(p[1])).toEqual(['Abrir expediente', 'Marcar hecho']);
    // asignar_equipo (opcional): sí se puede omitir.
    expect(botones(p[2])).toEqual(['Abrir expediente', 'Marcar hecho', 'Omitir']);
  });

  it('en la baja, rotar una cuenta enlaza a Correos filtrado por su usuario y recuperar el equipo a su hoja de vida', async () => {
    insforgeApi.objetivosDePasosSolicitud.mockResolvedValue({ c1: { usuario: 'soporte@materen.pe' }, ae1: { equipo_id: 'q1', codigo: 'CEL-001' } });
    const { w } = await montar({ solicitud: BAJA() });
    const p = pasos(w);
    expect(p[1].find('a[href="/correos?q=soporte%40materen.pe"]').exists()).toBe(true);
    expect(p[2].find('a[href="/equipos/q1"]').exists()).toBe(true);
  });

  it('sin el módulo correos o equipos no se ofrece abrirlos (el servidor lo rechazaría)', async () => {
    insforgeApi.objetivosDePasosSolicitud.mockResolvedValue({ c1: { usuario: 'soporte@materen.pe' }, ae1: { equipo_id: 'q1', codigo: 'CEL-001' } });
    const { w } = await montar({ solicitud: BAJA(), rol: 'ASISTENTE', modulos: ['empleados'] });
    const p = pasos(w);
    expect(p[1].find('a[href^="/correos"]').exists()).toBe(false);
    expect(p[2].find('a[href^="/equipos"]').exists()).toBe(false);
    expect(botones(p[1])).toContain('Marcar hecho');
  });

  it('«Marcar hecho» llama a la RPC, relee la solicitud y, si era la última, avisa que se completó', async () => {
    const { w } = await montar();
    insforgeApi.getSolicitud.mockResolvedValue(ALTA({
      estado: 'completada', completada_at: '2026-10-02T10:00:00',
      pasos: ALTA().pasos.map((x) => ({ ...x, estado: 'hecho', hecho_at: '2026-10-02T10:00:00' })),
    }));
    await pasos(w)[3].findAll('button').find((b) => b.text() === 'Marcar hecho').trigger('click');
    await espera(20);
    expect(insforgeApi.completarPasoSolicitud).toHaveBeenCalledWith('p4', {});
    expect(insforgeApi.getSolicitud).toHaveBeenCalledTimes(2);
    expect(w.find('[data-caratula] [data-sello]').text()).toMatch(/^COMPLETADA/);
    // Cerrada: ya no se ofrece nada en los pasos.
    expect(w.findAll('[data-paso] button')).toHaveLength(0);
  });

  it('un rechazo del servidor al marcar un paso sale como aviso en español y la pantalla sigue igual', async () => {
    insforgeApi.completarPasoSolicitud.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    const { w } = await montar();
    await pasos(w)[3].findAll('button').find((b) => b.text() === 'Marcar hecho').trigger('click');
    await espera(20);
    expect(pasos(w)[3].attributes('data-estado')).toBe('pendiente');
  });

  it('«Omitir» abre el diálogo del motivo con ESE paso', async () => {
    const { w } = await montar();
    await pasos(w)[2].findAll('button').find((b) => b.text() === 'Omitir').trigger('click');
    const dlg = w.findComponent({ name: 'SolicitudMotivoDialog' });
    expect(dlg.exists()).toBe(true);
    expect(dlg.props('accion')).toBe('omitir');
    expect(dlg.props('paso').id).toBe('p3');
  });

  it('un paso omitido muestra el motivo y quién lo omitió', async () => {
    const solicitud = ALTA();
    solicitud.pasos[2] = paso(3, 'asignar_equipo', 'Asignar el equipo', { obligatorio: false, estado: 'omitido', hecho_por: 'u2', hecho_at: '2026-09-29T09:00:00', motivo_omision: 'Usa equipo propio' });
    const { w } = await montar({ solicitud });
    const t = textoPaso(pasos(w)[2]);
    expect(t).toContain('Omitido · Diego Huamán');
    expect(t).toContain('Motivo: Usa equipo propio');
  });
});

describe('SolicitudDetalleView — libro y cancelación', () => {
  it('el libro de movimientos suma la apertura y cada paso resuelto, lo más reciente arriba', async () => {
    const { w } = await montar();
    const libro = w.find('[data-libro]');
    const movs = libro.findAll('tbody tr').map((f) => f.find('td:nth-child(2)').text());
    expect(movs).toEqual(['Paso hecho', 'Abierta']);
    expect(libro.text()).toContain('Alta de empleado · Pedido de RRHH por correo · Pedido de RRHH por correo del lunes');
  });

  it('«Cancelar solicitud» abre el diálogo de motivo', async () => {
    const { w } = await montar();
    await w.find('button[aria-label="Más acciones de la solicitud"]').trigger('click');
    [...document.querySelectorAll('[data-pc-section="itemcontent"]')].find((i) => i.textContent.includes('Cancelar solicitud')).click();
    await espera();
    expect(w.findComponent({ name: 'SolicitudMotivoDialog' }).props('accion')).toBe('cancelar');
  });

  it('una solicitud inexistente avisa y vuelve al listado; un fallo de lectura se muestra sin redirigir', async () => {
    const { router } = await montar({ solicitud: null });
    expect(router.currentRoute.value.path).toBe('/solicitudes');
    wrapper.unmount();
    insforgeApi.getSolicitud.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    const router2 = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/solicitudes/:id', component: { template: '<div />' } }, { path: '/solicitudes', component: { template: '<div />' } }],
    });
    router2.push('/solicitudes/s1');
    await router2.isReady();
    wrapper = mount(SolicitudDetalleView, { attachTo: document.body, global: { plugins: [router2, [PrimeVue, { unstyled: true }]] } });
    for (let i = 0; i < 6; i += 1) await espera();
    expect(wrapper.find('[role="alert"]').text()).toContain('No tiene permiso');
    expect(router2.currentRoute.value.path).toBe('/solicitudes/s1');
  });
});
