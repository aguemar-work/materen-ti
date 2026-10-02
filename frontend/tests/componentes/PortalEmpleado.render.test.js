// @vitest-environment happy-dom
//
// Portal del empleado por enlace (migración 109), montado de verdad: la vista
// pública /mi/:token sobre AppPortal (con sus tres secciones reales) y el
// diálogo del staff «Enlace del portal del empleado». Se mockean solo las capas
// de API (api/portalEmpleado.js y api/insforge.js).
//
// Cubre: lo que el empleado ve según el alcance, la confirmación de recepción
// (fecha escrita, botón que desaparece, errores en línea), el estado de enlace
// no válido (sin distinguir el motivo) y el error transitorio; y del lado del
// staff: alcance y vigencia elegibles, el enlace mostrado UNA vez, copiar,
// revocar y el aviso de que no se envía solo.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import PortalEmpleadoView from '../../src/modules/portal/PortalEmpleadoView.vue';
import PortalEnlaceDialog from '../../src/modules/empleados/PortalEnlaceDialog.vue';

vi.mock('../../src/api/portalEmpleado.js', async (importOriginal) => ({
  ...(await importOriginal()),
  abrirPortal: vi.fn(),
  confirmarEquipoPortal: vi.fn(),
}));
vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: { emitirEnlacePortal: vi.fn(), revocarEnlacePortal: vi.fn() },
}));
import { abrirPortal, confirmarEquipoPortal, MENSAJES_ERROR_PORTAL } from '../../src/api/portalEmpleado.js';
import { insforgeApi } from '../../src/api/insforge.js';

const TOKEN = 'Ab3_dEf-Gh1jKlMnOpQrStUv';
const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const montados = [];

const PORTAL = {
  nombre: 'Rosa Quispe Mamani',
  vence: '2099-10-09T12:00:00Z',
  alcance: ['ver_accesos', 'ver_equipos', 'ver_tickets', 'confirmar_equipo'],
  equipos: [
    { asignacion_id: 'a1', codigo: 'LAP-0142', tipo: 'Laptop', entregado: '2026-03-12', condicion: 'Buen estado, con cargador', confirmado_at: null },
    { asignacion_id: 'a2', codigo: 'MON-0031', tipo: 'Monitor', entregado: '2026-03-12', condicion: null, confirmado_at: '2026-03-13T14:00:00Z' },
  ],
  accesos: [{ plataforma: 'Gmail', usuario: 'rquispe@materen.pe' }, { plataforma: 'Bitrix24', usuario: 'rquispe' }],
  tickets: [{ codigo: 'TCK-0281', titulo: 'Impresora de obra sin tinta', estado: 'abierto', creado: '2026-09-28T14:02:00Z' }],
};

async function montarVista(url = `/mi/${TOKEN}`) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/mi/:token', component: PortalEmpleadoView },
      { path: '/soporte/nuevo', name: 'ticket-nuevo', component: { template: '<div />' } },
    ],
  });
  router.push(url);
  await router.isReady();
  const w = mount(PortalEmpleadoView, { attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
  montados.push(w);
  for (let i = 0; i < 4; i += 1) await espera();
  return w;
}

const seccion = (w, titulo) => w.findAll('section').find((s) => s.find('h2')?.text() === titulo);
const botones = (w) => w.findAll('button').map((b) => b.text());

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  abrirPortal.mockResolvedValue(structuredClone(PORTAL));
  confirmarEquipoPortal.mockResolvedValue({ yaConfirmada: false, confirmadoAt: '2026-10-02T15:30:00Z' });
});

afterEach(() => {
  while (montados.length) {
    try { montados.pop().unmount(); } catch { /* ya desmontado */ }
  }
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('Portal del empleado — vista pública', () => {
  it('abre con el token de la URL y muestra al empleado con UN solo h1', async () => {
    const w = await montarVista();
    expect(abrirPortal).toHaveBeenCalledWith(TOKEN);
    expect(w.findAll('h1')).toHaveLength(1);
    expect(w.find('h1').text()).toBe('Rosa Quispe Mamani');
    expect(w.text()).toContain('Portal del empleado');
    expect(w.text()).toContain('Este enlace es personal: no lo comparta.');
    expect(w.text()).toContain('Vence el');
  });

  it('nunca pinta el token ni una contraseña', async () => {
    const w = await montarVista();
    expect(w.html()).not.toContain(TOKEN);
    expect(w.text()).not.toMatch(/contraseña:|password/i);
  });

  it('«Mis equipos»: código, tipo, fecha de entrega, condición y botón solo en el que falta confirmar', async () => {
    const w = await montarVista();
    const s = seccion(w, 'Mis equipos');
    const filas = s.findAll('li');
    expect(filas).toHaveLength(2);
    expect(filas[0].text()).toContain('LAP-0142');
    expect(filas[0].text()).toContain('Laptop');
    expect(filas[0].text()).toContain('Entregado el 12/03/2026');
    expect(filas[0].text()).toContain('Buen estado, con cargador');
    expect(filas[0].find('button').text()).toBe('Confirmar recepción');
    expect(filas[1].text()).toContain('Recepción confirmada el');
    expect(filas[1].find('button').exists()).toBe(false);
  });

  it('el botón de cada equipo tiene un nombre accesible que lo distingue', async () => {
    const w = await montarVista();
    expect(seccion(w, 'Mis equipos').find('button').attributes('aria-label')).toBe('Confirmar recepción del equipo LAP-0142');
  });

  it('«Mis accesos»: plataforma y usuario, con la aclaración de que la contraseña se entrega aparte', async () => {
    const w = await montarVista();
    const s = seccion(w, 'Mis accesos');
    expect(s.findAll('li').map((l) => l.text())).toEqual(['Gmailrquispe@materen.pe', 'Bitrix24rquispe']);
    expect(s.text()).toContain('La contraseña no aparece en esta página');
    expect(s.text()).toContain('enlace de entrega de un solo uso');
  });

  it('«Mis tickets»: código, asunto y estado, y un camino para crear otro', async () => {
    const w = await montarVista();
    const s = seccion(w, 'Mis tickets');
    expect(s.text()).toContain('TCK-0281');
    expect(s.text()).toContain('Impresora de obra sin tinta');
    expect(s.find('a[href="/soporte/nuevo"]').exists()).toBe(true);
  });

  it('confirmar la recepción llama a la function, escribe la fecha y quita el botón', async () => {
    const w = await montarVista();
    await seccion(w, 'Mis equipos').find('button').trigger('click');
    await espera();
    expect(confirmarEquipoPortal).toHaveBeenCalledWith(TOKEN, 'a1');
    const fila = seccion(w, 'Mis equipos').findAll('li')[0];
    expect(fila.text()).toContain('Recepción confirmada el 02/10/2026');
    expect(fila.text()).toContain('Recibido');
    expect(fila.find('button').exists()).toBe(false);
  });

  it('mientras confirma no se puede pulsar otro botón (un envío a la vez)', async () => {
    abrirPortal.mockResolvedValue({ ...structuredClone(PORTAL), equipos: [
      { asignacion_id: 'a1', codigo: 'LAP-0142', tipo: 'Laptop', entregado: '2026-03-12', condicion: null, confirmado_at: null },
      { asignacion_id: 'a3', codigo: 'CEL-0007', tipo: 'Celular', entregado: '2026-04-01', condicion: null, confirmado_at: null },
    ] });
    let liberar;
    confirmarEquipoPortal.mockReturnValue(new Promise((r) => { liberar = r; }));
    const w = await montarVista();
    const bs = seccion(w, 'Mis equipos').findAll('button');
    await bs[0].trigger('click');
    await espera();
    expect(bs[1].attributes('disabled')).toBeDefined();
    liberar({ yaConfirmada: false, confirmadoAt: '2026-10-02T15:30:00Z' });
    await espera();
    expect(confirmarEquipoPortal).toHaveBeenCalledTimes(1);
  });

  it('un error al confirmar se avisa en línea y deja el botón para reintentar', async () => {
    confirmarEquipoPortal.mockRejectedValue(Object.assign(new Error(MENSAJES_ERROR_PORTAL.no_encontrada), { code: 'no_encontrada' }));
    const w = await montarVista();
    await seccion(w, 'Mis equipos').find('button').trigger('click');
    await espera();
    const s = seccion(w, 'Mis equipos');
    expect(s.find('[role="alert"]').text()).toContain('No se encontró ese equipo');
    expect(s.findAll('li')[0].find('button').exists()).toBe(true);
  });

  it('si el enlace deja de valer mientras tanto, pasa a «Enlace no disponible»', async () => {
    confirmarEquipoPortal.mockRejectedValue(Object.assign(new Error(MENSAJES_ERROR_PORTAL.no_existe), { code: 'no_existe' }));
    const w = await montarVista();
    await seccion(w, 'Mis equipos').find('button').trigger('click');
    await espera();
    expect(w.find('h1').text()).toBe('Enlace no disponible');
    expect(w.findAll('section')).toHaveLength(0);
  });

  it('sin equipos, accesos ni tickets muestra un texto claro por sección', async () => {
    abrirPortal.mockResolvedValue({ ...PORTAL, equipos: [], accesos: [], tickets: [] });
    const w = await montarVista();
    expect(seccion(w, 'Mis equipos').text()).toContain('No tiene equipos a su cargo.');
    expect(seccion(w, 'Mis accesos').text()).toContain('No tiene cuentas asignadas.');
    expect(seccion(w, 'Mis tickets').text()).toContain('No tiene tickets activos.');
  });

  it('con un alcance reducido solo aparece lo permitido', async () => {
    abrirPortal.mockResolvedValue({ nombre: 'Rosa Quispe Mamani', vence: PORTAL.vence, alcance: ['ver_accesos'], accesos: PORTAL.accesos });
    const w = await montarVista();
    expect(seccion(w, 'Mis accesos')).toBeTruthy();
    expect(seccion(w, 'Mis equipos')).toBeFalsy();
    expect(seccion(w, 'Mis tickets')).toBeFalsy();
  });

  it('sin confirmar_equipo se ven los equipos pero no el botón', async () => {
    abrirPortal.mockResolvedValue({ ...PORTAL, alcance: ['ver_equipos'] });
    const w = await montarVista();
    expect(seccion(w, 'Mis equipos').findAll('li')).toHaveLength(2);
    expect(botones(w)).not.toContain('Confirmar recepción');
  });
});

describe('Portal del empleado — enlace no válido y errores', () => {
  it('un enlace inexistente, vencido o revocado se ve igual: «Enlace no disponible», sin secciones ni nombre', async () => {
    abrirPortal.mockRejectedValue(Object.assign(new Error(MENSAJES_ERROR_PORTAL.no_existe), { code: 'no_existe' }));
    const w = await montarVista();
    expect(w.findAll('h1')).toHaveLength(1);
    expect(w.find('h1').text()).toBe('Enlace no disponible');
    expect(w.text()).toContain('Este enlace no es válido o ya venció. Solicite uno nuevo a TI.');
    expect(w.findAll('section')).toHaveLength(0);
    expect(w.find('a[href="/soporte/nuevo"]').exists()).toBe(true);
  });

  it('un fallo transitorio ofrece reintentar y vuelve a pedir el portal', async () => {
    abrirPortal.mockRejectedValueOnce(Object.assign(new Error(MENSAJES_ERROR_PORTAL.demasiados_intentos), { code: 'demasiados_intentos' }));
    const w = await montarVista();
    expect(w.find('h1').text()).toBe('No se pudo abrir el portal');
    expect(w.text()).toContain('Demasiados intentos');
    const reintentar = w.findAll('button').find((b) => b.text() === 'Intentar de nuevo');
    await reintentar.trigger('click');
    for (let i = 0; i < 3; i += 1) await espera();
    expect(abrirPortal).toHaveBeenCalledTimes(2);
    expect(w.find('h1').text()).toBe('Rosa Quispe Mamani');
  });

  it('un enlace sin ninguna sección visible lo dice y manda a pedir otro', async () => {
    abrirPortal.mockResolvedValue({ nombre: 'Rosa Quispe', vence: PORTAL.vence, alcance: [] });
    const w = await montarVista();
    expect(w.text()).toContain('Este enlace no muestra información. Solicite uno nuevo a TI.');
  });
});

// ── Staff: diálogo del enlace ────────────────────────────────────────────────
const EMPLEADO = { id: 'e1', nombres: 'Rosa', apellidos: 'Quispe Mamani', estado: 'Activo' };

async function montarDialogo(props = {}) {
  const w = mount(PortalEnlaceDialog, {
    props: { empleado: EMPLEADO, enlace: null, ...props },
    attachTo: document.body,
    global: { plugins: [[PrimeVue, { unstyled: true }]], stubs: { transition: false } },
  });
  montados.push(w);
  for (let i = 0; i < 4; i += 1) await espera();
  return w;
}
const dialogo = () => document.querySelector('[role="dialog"]');
const boton = (texto) => [...dialogo().querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(texto));
const checks = () => [...dialogo().querySelectorAll('input[type="checkbox"]')];
const marcados = () => checks().map((c) => c.checked);
async function pulsar(el) {
  el.click();
  await espera(20);
}

describe('Enlace del portal — diálogo del staff', () => {
  beforeEach(() => {
    insforgeApi.emitirEnlacePortal.mockResolvedValue({ id: 'l1', token: TOKEN, expiraEn: '2099-10-09T12:00:00Z', alcance: [], dias: 7 });
    insforgeApi.revocarEnlacePortal.mockResolvedValue(true);
  });

  it('abre con todo el alcance marcado, 7 días y la advertencia de que nunca va la contraseña', async () => {
    await montarDialogo();
    expect(dialogo().textContent).toContain('Enlace del portal del empleado');
    expect(dialogo().textContent).toContain('Rosa Quispe Mamani');
    expect(dialogo().textContent).toContain('nunca la contraseña');
    expect(marcados()).toEqual([true, true, true, true]);
    expect(dialogo().querySelector('select').value).toBe('7');
    expect(boton('Revocar enlace')).toBeUndefined();
  });

  it('quitar los equipos quita también la confirmación; marcar la confirmación vuelve a marcar los equipos', async () => {
    await montarDialogo();
    const [equipos, confirmar] = checks();
    await pulsar(equipos);
    expect(marcados()).toEqual([false, false, true, true]);
    await pulsar(confirmar);
    expect(marcados()).toEqual([true, true, true, true]);
  });

  it('sin ningún alcance no deja generar', async () => {
    await montarDialogo();
    for (const c of checks()) if (c.checked) await pulsar(c);
    expect(marcados()).toEqual([false, false, false, false]);
    expect(boton('Generar enlace').disabled).toBe(true);
  });

  it('genera con el alcance y los días elegidos y muestra el enlace UNA vez', async () => {
    const w = await montarDialogo();
    const select = dialogo().querySelector('select');
    select.value = '3';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await espera();
    await pulsar(checks()[3]); // quita ver_tickets
    await pulsar(boton('Generar enlace'));
    expect(insforgeApi.emitirEnlacePortal).toHaveBeenCalledWith('e1', { alcance: ['ver_equipos', 'confirmar_equipo', 'ver_accesos'], dias: 3 });
    const url = dialogo().querySelector('#portal-enlace-url');
    expect(url.value).toBe(`${window.location.origin}/mi/${TOKEN}`);
    expect(url.readOnly).toBe(true);
    expect(dialogo().textContent).toContain('Se muestra una sola vez');
    expect(dialogo().textContent).toContain('el sistema no lo envía solo');
    expect(boton('Copiar enlace')).toBeTruthy();
    expect(boton('Generar enlace')).toBeUndefined();
    expect(w.emitted('cerrar')).toBeUndefined();
  });

  it('copiar el enlace usa el portapapeles y lo confirma', async () => {
    const escribirPortapapeles = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribirPortapapeles }, configurable: true });
    await montarDialogo();
    await pulsar(boton('Generar enlace'));
    await pulsar(boton('Copiar enlace'));
    expect(escribirPortapapeles).toHaveBeenCalledWith(`${window.location.origin}/mi/${TOKEN}`);
    expect(boton('Enlace copiado')).toBeTruthy();
  });

  it('al cerrar tras generar avisa que hubo cambio (para releer el estado)', async () => {
    const w = await montarDialogo();
    await pulsar(boton('Generar enlace'));
    await pulsar(boton('Listo'));
    await espera(500);
    expect(w.emitted('cerrar')[0]).toEqual([true]);
  });

  it('cancelar sin generar cierra sin cambio', async () => {
    const w = await montarDialogo();
    await pulsar(boton('Cancelar'));
    await espera(500);
    expect(w.emitted('cerrar')[0]).toEqual([false]);
    expect(insforgeApi.emitirEnlacePortal).not.toHaveBeenCalled();
  });

  it('un rechazo del servidor se muestra en español y no se genera nada', async () => {
    insforgeApi.emitirEnlacePortal.mockRejectedValue({ code: 'P0001', message: 'Solo se emite el enlace del portal a un empleado Activo (estado actual: Suspendido).' });
    await montarDialogo();
    await pulsar(boton('Generar enlace'));
    expect(dialogo().textContent).toContain('Solo se emite el enlace del portal a un empleado Activo');
    expect(dialogo().querySelector('#portal-enlace-url')).toBeNull();
  });

  it('con un enlace vigente avisa que el nuevo anula al anterior y ofrece «Revocar enlace»', async () => {
    await montarDialogo({ enlace: { id: 'l0', empleado_id: 'e1', alcance: ['ver_equipos'], expires_at: '2099-10-01T00:00:00Z', revocado_at: null } });
    expect(dialogo().textContent).toContain('Ya hay un enlace vigente hasta el');
    expect(dialogo().textContent).toContain('el anterior deja de funcionar');
    expect(boton('Revocar enlace')).toBeTruthy();
  });

  it('revocar pide confirmación, llama a la RPC y cierra avisando el cambio', async () => {
    const w = await montarDialogo({ enlace: { id: 'l0', empleado_id: 'e1', alcance: ['ver_equipos'], expires_at: '2099-10-01T00:00:00Z', revocado_at: null } });
    await pulsar(boton('Revocar enlace'));
    expect(insforgeApi.revocarEnlacePortal).not.toHaveBeenCalled();
    const confirmacion = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.textContent.includes('dejará de funcionar de inmediato'));
    expect(confirmacion).toBeTruthy();
    const confirmar = [...confirmacion.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Revocar enlace');
    confirmar.click();
    await espera(20);
    expect(insforgeApi.revocarEnlacePortal).toHaveBeenCalledWith('e1');
    await espera(500);
    expect(w.emitted('cerrar')[0]).toEqual([true]);
  });
});
