// @vitest-environment happy-dom
//
// Expediente de un cambio (migración 107), montado de verdad: carátula con el
// rótulo y el código (regla 20), sello solo en estados terminales (regla 15), el dl
// con servicio / tipo / riesgo / ventana / aprobador, las acciones según estado, tipo
// y rol (el servidor rechazaría las demás), el aviso de la emergencia sin aprobar y el
// libro de movimientos (regla 19). Solo api/insforge.js está mockeado; store, router
// y auth son reales.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import CambioDetalleView from '../../src/modules/cambios/CambioDetalleView.vue';
import { useAuthStore } from '../../src/stores/auth.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    getCambio: vi.fn(),
    listEventosCambio: vi.fn(),
    ticketsDeCambio: vi.fn(),
    nombresStaff: vi.fn(),
    transicionarCambio: vi.fn(),
    aprobarCambio: vi.fn(),
    rechazarCambio: vi.fn(),
    vincularCambioTicket: vi.fn(),
    desvincularCambioTicket: vi.fn(),
    buscarTicketPorCodigo: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const CAMBIO = (extra = {}) => ({
  id: 'c1', codigo: 'CHG-0004', titulo: 'Reemplazo del router principal', tipo: 'normal', riesgo: 'alto', servicio_id: 'red',
  servicio_nombre: 'Internet y red', servicio_criticidad: 'critica', servicio_horario: '24 x 7', servicio_dueno: 'u2',
  descripcion: 'El router actual no recibe actualizaciones.\nSe cambia fuera de horario.', plan_retroceso: 'Volver a conectar el router anterior.',
  ventana_inicio: '2026-10-03T08:00:00', ventana_fin: '2026-10-03T10:30:00', estado: 'solicitado', solicitado_por: 'u2',
  solicitado_at: '2026-10-02T09:00:00', aprobado_por: null, aprobado_at: null, aprobacion_pendiente_hasta: null,
  inicio_real_at: null, fin_real_at: null, resultado: '', created_at: '2026-10-02T08:00:00', updated_at: '2026-10-02T09:00:00', ...extra,
});

const EVENTOS = [
  { id: 'e2', orden: 2, cambio_id: 'c1', evento: 'solicitado', user_id: 'u2', user_email: 'diego@materen.pe', rol_actor: 'tecnico', detalle: null, created_at: '2026-10-02T09:00:00' },
  { id: 'e1', orden: 1, cambio_id: 'c1', evento: 'creado', user_id: 'u2', user_email: 'diego@materen.pe', rol_actor: 'tecnico', detalle: 'Cambio normal · riesgo alto', created_at: '2026-10-02T08:00:00' },
];

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar({ cambio = CAMBIO(), rol = 'JEFE', modulos = ['tickets'], tickets = [] } = {}) {
  insforgeApi.getCambio.mockResolvedValue(cambio);
  insforgeApi.ticketsDeCambio.mockResolvedValue(tickets);
  const auth = useAuthStore();
  auth.rol = rol;
  auth.modulosVisibles = modulos;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cambios', component: { template: '<div />' } },
      { path: '/cambios/:id', component: { template: '<div />' } },
      { path: '/:resto(.*)*', component: { template: '<div />' } },
    ],
  });
  router.push(`/cambios/${cambio?.id || 'x'}`);
  await router.isReady();
  wrapper = mount(CambioDetalleView, {
    attachTo: document.body,
    global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { CambioNotaDialog: true, CambioForm: true } },
  });
  for (let i = 0; i < 6; i += 1) await espera();
  return { w: wrapper, router };
}

const acciones = (w) => w.find('[data-caratula] [data-no-print]');
const botones = (w) => acciones(w).findAll('button, a').map((b) => b.text()).filter(Boolean);
const primaria = (w) => acciones(w).findAll('button').find((b) => !b.attributes('aria-haspopup'));
const dato = (w, rotulo) => {
  const dts = w.findAll('[data-caratula] dt');
  const i = dts.findIndex((d) => d.text() === rotulo);
  return i < 0 ? null : w.findAll('[data-caratula] dd')[i].text();
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listEventosCambio.mockResolvedValue(EVENTOS);
  insforgeApi.nombresStaff.mockResolvedValue([{ user_id: 'u1', nombre: 'Alejandro Guevara' }, { user_id: 'u2', nombre: 'Diego Huamán' }]);
  insforgeApi.transicionarCambio.mockResolvedValue({});
  insforgeApi.aprobarCambio.mockResolvedValue({});
  insforgeApi.rechazarCambio.mockResolvedValue({});
  insforgeApi.vincularCambioTicket.mockResolvedValue({});
  insforgeApi.desvincularCambioTicket.mockResolvedValue(true);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('CambioDetalleView — carátula', () => {
  it('abre con rótulo CAMBIO · código (AppCodigo), el título como único h1, el estado y los datos clave', async () => {
    const { w } = await montar();
    const c = w.find('[data-caratula]');
    expect(c.find('p').text()).toContain('CAMBIO');
    expect(c.find('p [data-codigo]').text()).toBe('CHG-0004');
    expect(w.findAll('h1')).toHaveLength(1);
    expect(c.find('h1').text()).toBe('Reemplazo del router principal');
    expect(c.findAll('dt').map((d) => d.text())).toEqual(['Servicio', 'Tipo', 'Riesgo', 'Ventana', 'Registrado por', 'Aprobación']);
    expect(dato(w, 'Servicio')).toBe('Internet y red');
    expect(dato(w, 'Tipo')).toBe('Normal');
    expect(dato(w, 'Riesgo')).toBe('Alto');
    expect(dato(w, 'Ventana')).toBe('03/10/26 08:00 a 10:30');
    expect(dato(w, 'Registrado por')).toBe('Diego Huamán');
    expect(dato(w, 'Aprobación')).toBe('Pendiente de un jefe');
    expect(c.find('[data-sello]').exists()).toBe(false);
    expect(c.text()).toContain('Por aprobar');
  });

  it('un estado terminal lleva SELLO con la fecha (cerrado, rechazado, cancelado y revertido); uno vivo, un tag', async () => {
    const casos = [['cerrado', 'CERRADO'], ['rechazado', 'RECHAZADO'], ['cancelado', 'CANCELADO'], ['revertido', 'REVERTIDO']];
    for (const [estado, texto] of casos) {
      const { w } = await montar({ cambio: CAMBIO({ estado, updated_at: '2026-10-05T10:00:00' }) });
      expect(w.find('[data-sello]').text()).toBe(`${texto} 05/10/26`);
      wrapper.unmount();
    }
    const { w } = await montar({ cambio: CAMBIO({ estado: 'en_ejecucion' }) });
    expect(w.find('[data-sello]').exists()).toBe(false);
    expect(w.find('[data-caratula]').text()).toContain('En ejecución');
  });

  it('el aprobador sale con su nombre y fecha; un estándar dice «Preautorizado»', async () => {
    const { w } = await montar({ cambio: CAMBIO({ estado: 'aprobado', aprobado_por: 'u1', aprobado_at: '2026-10-02T15:00:00' }) });
    expect(dato(w, 'Aprobación')).toBe('Alejandro Guevara · 02/10/26');
    wrapper.unmount();
    const { w: w2 } = await montar({ cambio: CAMBIO({ tipo: 'estandar', estado: 'aprobado', plan_retroceso: '' }) });
    expect(dato(w2, 'Aprobación')).toBe('Preautorizado (estándar)');
  });
});

describe('CambioDetalleView — contenido', () => {
  it('descripción con sus saltos de línea, plan de retroceso, tickets enlazados y libro', async () => {
    const { w } = await montar({ tickets: [{ id: 't1', codigo: 'TCK-0007', titulo: 'Sin internet', estado: 'abierto', vinculado_at: '2026-10-02T09:30:00' }] });
    const secciones = w.findAll('section').map((s) => s.find('h2').text());
    expect(secciones).toEqual(['Descripción', 'Plan de retroceso', 'Tickets enlazados 1', 'Libro de movimientos 2']);
    expect(w.text()).toContain('El router actual no recibe actualizaciones.');
    expect(w.text()).toContain('Volver a conectar el router anterior.');
    expect(w.find('a[href="/tickets/t1"]').text()).toContain('TCK-0007');
    const libro = w.find('[data-libro]');
    expect(libro.findAll('tbody tr')).toHaveLength(2);
    expect(libro.text()).toContain('Enviado a aprobación');
    expect(libro.text()).toContain('Registrado');
    expect(libro.text()).toContain('Diego Huamán');
    expect(libro.findAll('tbody tr')[0].text()).toContain('Enviado a aprobación'); // lo más reciente arriba
  });

  it('un estándar no pide plan de retroceso; un normal sin plan lo dice', async () => {
    const { w } = await montar({ cambio: CAMBIO({ tipo: 'estandar', estado: 'aprobado', plan_retroceso: '' }) });
    expect(w.text()).toContain('No requiere: es un cambio estándar.');
    wrapper.unmount();
    const { w: w2 } = await montar({ cambio: CAMBIO({ estado: 'borrador', plan_retroceso: '' }) });
    expect(w2.text()).toContain('Sin registrar (se pide antes de enviarlo a aprobación).');
  });

  it('el resultado lleva el rótulo de su estado', async () => {
    const { w } = await montar({ cambio: CAMBIO({ estado: 'rechazado', resultado: 'La ventana coincide con el cierre contable' }) });
    expect(w.findAll('section').map((s) => s.find('h2').text())).toContain('Motivo del rechazo');
    expect(w.text()).toContain('La ventana coincide con el cierre contable');
    wrapper.unmount();
    const { w: w2 } = await montar({ cambio: CAMBIO({ estado: 'cerrado', resultado: 'Sin incidentes' }) });
    expect(w2.findAll('section').map((s) => s.find('h2').text())).toContain('Resultado');
  });

  it('una emergencia sin aprobar avisa del plazo; vencido es una alerta', async () => {
    const vence = new Date(Date.now() + 20 * 3600000).toISOString();
    const { w } = await montar({ cambio: CAMBIO({ tipo: 'emergencia', estado: 'en_ejecucion', aprobacion_pendiente_hasta: vence }) });
    const aviso = w.find('[data-plazo-aprobacion]');
    expect(aviso.attributes('role')).toBe('status');
    expect(aviso.text()).toContain('Emergencia sin aprobación de un jefe');
    expect(aviso.text()).toMatch(/Vence en (19|20) horas/);
    expect(aviso.text()).toContain('No se podrá cerrar hasta que un jefe la apruebe');
    expect(dato(w, 'Aprobación')).toMatch(/^Pendiente · Vence en/);
    wrapper.unmount();
    const vencido = new Date(Date.now() - 6 * 3600000).toISOString();
    const { w: w2 } = await montar({ cambio: CAMBIO({ tipo: 'emergencia', estado: 'implementado', aprobacion_pendiente_hasta: vencido }) });
    expect(w2.find('[data-plazo-aprobacion]').attributes('role')).toBe('alert');
    expect(w2.find('[data-plazo-aprobacion]').text()).toContain('Plazo vencido hace 6 horas');
  });

  it('una emergencia ya aprobada no muestra aviso', async () => {
    const { w } = await montar({ cambio: CAMBIO({ tipo: 'emergencia', estado: 'implementado', aprobado_por: 'u1', aprobado_at: '2026-10-03T12:00:00' }) });
    expect(w.find('[data-plazo-aprobacion]').exists()).toBe(false);
  });
});

describe('CambioDetalleView — acciones según rol y estado', () => {
  it('el JEFE ve «Aprobar» como acción principal de un cambio por aprobar, y rechazar / cancelar en «Más»', async () => {
    const { w } = await montar({ rol: 'JEFE' });
    expect(primaria(w).text()).toBe('Aprobar');
    expect(botones(w)).toContain('Más');
  });

  it('un asistente con tickets NO puede aprobar: sin acción principal en un cambio por aprobar', async () => {
    const { w } = await montar({ rol: 'ASISTENTE', modulos: ['tickets'] });
    expect(primaria(w)).toBeUndefined();
    expect(botones(w)).toEqual(['Más']);
  });

  it('un asistente envía a aprobación su borrador; sin el módulo tickets no hay acciones', async () => {
    const { w } = await montar({ cambio: CAMBIO({ estado: 'borrador' }), rol: 'ASISTENTE', modulos: ['tickets'] });
    expect(primaria(w).text()).toBe('Enviar a aprobación');
    wrapper.unmount();
    const { w: w2 } = await montar({ cambio: CAMBIO({ estado: 'borrador' }), rol: 'ASISTENTE', modulos: ['empleados'] });
    expect(primaria(w2)).toBeUndefined();
    expect(w2.find('button[aria-label="Quitar el enlace"]').exists()).toBe(false);
  });

  it('el paso natural de cada estado es la acción principal', async () => {
    const casos = [['aprobado', 'Iniciar ejecución'], ['en_ejecucion', 'Marcar como implementado'], ['implementado', 'Cerrar cambio']];
    for (const [estado, texto] of casos) {
      const { w } = await montar({ cambio: CAMBIO({ estado }), rol: 'ASISTENTE' });
      expect(primaria(w).text(), estado).toBe(texto);
      wrapper.unmount();
    }
  });

  it('un cambio terminal no ofrece acciones de estado', async () => {
    const { w } = await montar({ cambio: CAMBIO({ estado: 'cerrado' }), rol: 'JEFE' });
    expect(primaria(w)).toBeUndefined();
  });

  it('una acción sin nota (enviar a aprobación) llama a la RPC al instante y avisa del nuevo estado', async () => {
    const { w } = await montar({ cambio: CAMBIO({ estado: 'borrador' }), rol: 'ASISTENTE' });
    insforgeApi.getCambio.mockResolvedValue(CAMBIO({ estado: 'solicitado' }));
    await primaria(w).trigger('click');
    await espera(30);
    expect(insforgeApi.transicionarCambio).toHaveBeenCalledWith('c1', 'solicitado', null);
    expect(w.find('[data-caratula]').text()).toContain('Por aprobar');
  });

  it('una acción con nota (aprobar) abre el diálogo de la nota y no llama a nada todavía', async () => {
    const { w } = await montar({ rol: 'JEFE' });
    await primaria(w).trigger('click');
    await espera(10);
    const dialogo = w.findComponent({ name: 'CambioNotaDialog' });
    expect(dialogo.exists()).toBe(true);
    expect(dialogo.props('accion')).toMatchObject({ id: 'aprobar:aprobado', nota: 'opcional' });
    expect(insforgeApi.aprobarCambio).not.toHaveBeenCalled();
    dialogo.vm.$emit('cerrar', false);
    await espera(10);
    expect(w.findComponent({ name: 'CambioNotaDialog' }).exists()).toBe(false);
  });

  it('un rechazo del servidor al ejecutar una acción sin nota sale como mensaje, sin tumbar la pantalla', async () => {
    insforgeApi.transicionarCambio.mockRejectedValue({ code: 'P0001', message: 'Un cambio normal necesita un plan de retroceso.' });
    const { w } = await montar({ cambio: CAMBIO({ estado: 'borrador' }), rol: 'ASISTENTE' });
    await primaria(w).trigger('click');
    await espera(30);
    expect(w.find('h1').text()).toBe('Reemplazo del router principal');
    expect(primaria(w).attributes('disabled')).toBeUndefined();
  });
});

describe('CambioDetalleView — carga', () => {
  it('un cambio inexistente avisa y vuelve al listado', async () => {
    const { router } = await montar({ cambio: null });
    await espera(10);
    expect(router.currentRoute.value.path).toBe('/cambios');
  });

  it('un fallo del servidor se muestra como alerta en español', async () => {
    insforgeApi.getCambio.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/cambios/:id', component: { template: '<div />' } }] });
    router.push('/cambios/c1');
    await router.isReady();
    useAuthStore().rol = 'JEFE';
    wrapper = mount(CambioDetalleView, { attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
    for (let i = 0; i < 6; i += 1) await espera();
    expect(wrapper.find('[role="alert"]').text()).toContain('No tiene permiso');
  });

  it('el libro no depende de los nombres del staff: si fallan, muestra el correo', async () => {
    insforgeApi.nombresStaff.mockRejectedValue(new Error('x'));
    const { w } = await montar();
    expect(w.find('[data-libro]').text()).toContain('diego@materen.pe');
  });

  it('si el libro no carga, el cambio se muestra igual con el libro vacío', async () => {
    insforgeApi.listEventosCambio.mockRejectedValue({ code: '42501', message: 'x' });
    const { w } = await montar();
    expect(w.find('h1').text()).toBe('Reemplazo del router principal');
    expect(w.find('[data-libro]').text()).toContain('Sin movimientos registrados');
  });
});
