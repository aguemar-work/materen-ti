// @vitest-environment happy-dom
//
// DashboardView.vue — el Inicio como "mesa del día" (Versión Expediente).
// Se monta con Pinia, router y el store REAL sobre un cliente FALSO que cuenta
// cada consulta: el presupuesto del Inicio es UNA llamada de datos (la RPC
// `dashboard_resumen`), y nunca una consulta directa a tablas.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import { resumenVacio, resumenCompleto } from '../stubs/resumen-inicio.js';

const cliente = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(() => { throw new Error('el Inicio no debe consultar tablas'); }),
}));
vi.mock('../../src/api/client.js', () => ({
  getClient: () => ({ database: { rpc: cliente.rpc, from: cliente.from } }),
}));

import DashboardView from '../../src/modules/dashboard/DashboardView.vue';
import { useAuthStore } from '../../src/stores/auth.js';
import { useDashboardStore } from '../../src/stores/dashboard.js';

// Jueves 1 de octubre de 2026, 08:30 en Lima (UTC-5).
const MANANA = new Date('2026-10-01T13:30:00Z');

const responde = (data) => cliente.rpc.mockResolvedValue({ data, error: null });
const fallaEntera = () => cliente.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
const asentar = () => new Promise((r) => setTimeout(r, 0));

function usuario({ rol = 'JEFE', nombre = 'Alejandro Guevara', modulos = [] } = {}) {
  const auth = useAuthStore();
  auth.user = { id: 'u-1' };
  auth.rol = rol;
  auth.nombre = nombre;
  auth.modulosVisibles = modulos;
}

async function montar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  router.push('/dashboard');
  await router.isReady();
  const w = mount(DashboardView, { global: { plugins: [router, [PrimeVue, { unstyled: true, ripple: false }]] } });
  await asentar();
  await asentar();
  return w;
}

const filas = (w) => w.findAll('[data-pendiente]');
const href = (fila) => fila.find('a').attributes('href');
const vistas = (w) => w.findAll('[role="group"][aria-label="Vista del Inicio"] button');
const boton = (w, texto) => w.findAll('button').find((b) => b.text().startsWith(texto));

beforeEach(() => {
  setActivePinia(createPinia());
  cliente.rpc.mockReset();
  cliente.from.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MANANA);
  usuario();
});
afterEach(() => vi.useRealTimers());

describe('Inicio — encabezado', () => {
  it('saluda con el nombre y escribe la fecha de Lima con el total y los críticos del feed', async () => {
    responde(resumenCompleto());
    const w = await montar();
    expect(w.find('h1').text()).toBe('Buenos días, Alejandro');
    const subtitulo = w.find('header p').text();
    expect(subtitulo).toMatch(/^Jueves 1 de octubre · \d+ asuntos pendientes, \d+ críticos$/);
    // El número sale del feed: coincide con las filas que hay en pantalla.
    const total = Number(subtitulo.match(/· (\d+) asuntos/)[1]);
    const mostradas = filas(w).length;
    expect(total).toBeGreaterThanOrEqual(mostradas);
    expect(w.find('[data-bloque] h3').text()).toContain('Crítico');
  });

  it.each([
    ['2026-10-01T13:30:00Z', 'Buenos días, Alejandro'],     // 08:30 Lima
    ['2026-10-01T18:00:00Z', 'Buenas tardes, Alejandro'],   // 13:00 Lima
    ['2026-10-02T01:30:00Z', 'Buenas noches, Alejandro'],   // 20:30 Lima (ya es 2 en UTC)
  ])('el saludo depende de la hora de Lima (%s)', async (instante, esperado) => {
    vi.setSystemTime(new Date(instante));
    responde(resumenVacio());
    const w = await montar();
    expect(w.find('h1').text()).toBe(esperado);
  });

  it('sin nombre solo saluda', async () => {
    usuario({ nombre: '' });
    responde(resumenVacio());
    const w = await montar();
    expect(w.find('h1').text()).toBe('Buenos días');
  });

  it('el botón sólido "Ticket interno" solo existe con el módulo tickets', async () => {
    responde(resumenVacio());
    expect((await montar()).text()).toContain('Ticket interno');
    setActivePinia(createPinia());
    usuario({ rol: 'ASISTENTE', modulos: ['equipos'] });
    responde(resumenVacio({ tickets: null }));
    expect((await montar()).text()).not.toContain('Ticket interno');
  });

  it('1 asunto pendiente, 1 crítico: singular', async () => {
    responde(resumenVacio({ cuentas_sin_password: [{ cuenta_id: 'c1', usuario: 'x', tipo_cuenta: 'personal', plataforma: 'P', titulares: [] }] }));
    const w = await montar();
    expect(w.find('header p').text()).toBe('Jueves 1 de octubre · 1 asunto pendiente, 1 crítico');
  });
});

describe('Inicio — una sola llamada', () => {
  it('montar /dashboard hace UNA llamada de datos (la RPC) y ninguna consulta a tablas', async () => {
    responde(resumenCompleto());
    await montar();
    expect(cliente.rpc).toHaveBeenCalledTimes(1);
    expect(cliente.rpc).toHaveBeenCalledWith('dashboard_resumen');
    expect(cliente.from).not.toHaveBeenCalled();
  });

  it('si el menú ya había pedido el resumen en ese instante, se comparte la misma llamada', async () => {
    // La carga del menú sigue en curso cuando el Inicio se monta.
    let resolver;
    cliente.rpc.mockReturnValue(new Promise((r) => { resolver = r; }));
    useDashboardStore().cargar({ silencioso: true }); // lo que hace AppLayout al montarse
    const w = await montar();
    resolver({ data: resumenCompleto(), error: null });
    await asentar();
    await asentar();
    expect(cliente.rpc).toHaveBeenCalledTimes(1);
    expect(filas(w).length).toBeGreaterThan(0);
  });
});

describe('Inicio — el menú ya cargó antes de que llegue el chunk del Inicio', () => {
  it('un resumen recién cargado se muestra sin repetir la llamada', async () => {
    responde(resumenCompleto());
    await useDashboardStore().cargar({ silencioso: true }); // AppLayout terminó antes de montarse la vista
    const w = await montar();
    expect(cliente.rpc).toHaveBeenCalledTimes(1);
    expect(filas(w).length).toBeGreaterThan(0);
  });

  it('un fallo recién ocurrido se muestra tal cual (no se reintenta solo)', async () => {
    fallaEntera();
    await useDashboardStore().cargar({ silencioso: true });
    const w = await montar();
    expect(cliente.rpc).toHaveBeenCalledTimes(1);
    expect(w.findAll('[role="alert"]')).toHaveLength(1);
  });
});

describe('Inicio — contenido normal', () => {
  it('el feed es una lista de libro CRÍTICO / ATENCIÓN con códigos, antigüedad y contexto', async () => {
    responde(resumenCompleto());
    const w = await montar();
    const bloques = w.findAll('[data-bloque]');
    expect(bloques.map((b) => b.find('h3').text())).toEqual([expect.stringContaining('Crítico'), expect.stringContaining('Atención')]);
    const sinDevolver = filas(w).find((f) => f.text().includes('LAP-0142'));
    expect(sinDevolver.text()).toContain('Sin devolver');
    expect(sinDevolver.find('[data-codigo]').exists()).toBe(true);
    expect(sinDevolver.find('[data-antiguedad]').text()).toBe('—');
    expect(href(sinDevolver)).toBe('/equipos?q=LAP-0142');
    const ticketFila = filas(w).find((f) => f.text().includes('TCK-0281'));
    expect(ticketFila.find('[data-antiguedad]').text()).toBe('3 d');
    expect(ticketFila.text()).toContain('Sin asignar');
  });

  it('muestra "Acta sin adjuntar" con enlace a la ruta imprimible del acta de entrega', async () => {
    responde(resumenCompleto());
    const w = await montar();
    const acta = filas(w).find((f) => f.text().includes('Acta sin adjuntar'));
    expect(href(acta)).toBe('/equipos/q9/acta/as1?tipo=entrega');
  });

  it('muestra la solicitud abierta con su código, el tipo, la persona, el avance y a dónde se resuelve', async () => {
    responde(resumenCompleto());
    const w = await montar();
    const alta = filas(w).find((f) => f.text().includes('Alta de empleado'));
    expect(alta.text()).toContain('SOL-0012');
    expect(alta.text()).toContain('Ana Torres');
    expect(alta.text()).toContain('1 de 7 pasos');
    expect(alta.text()).toContain('falta: Crear la cuenta de correo');
    expect(href(alta)).toBe('/solicitudes/s1');
  });

  it('"Mis tickets": prioridad y estado, y el enlace dice el total real', async () => {
    responde(resumenCompleto());
    const w = await montar();
    const mios = w.findAll('[data-mio]');
    expect(mios).toHaveLength(2);
    expect(mios[0].text()).toContain('TCK-0287');
    expect(mios[0].text()).toContain('Alta');
    expect(mios[0].text()).toContain('En progreso');
    expect(mios[1].text()).toContain('Urgente');
    // La prioridad se escribe como rango (mayúsculas por estilo), no como color.
    expect(mios[1].find('[data-tag]').classes()).toContain('uppercase');
    const enlace = w.find('a[href="/tickets?asignado=yo"]');
    expect(enlace.text()).toBe('Ver mis 7 tickets →');
  });

  it('"Vence esta semana": licencias y garantías de los próximos 7 días, con su listado filtrado', async () => {
    responde(resumenCompleto());
    const w = await montar();
    const filasVence = w.findAll('[data-vencimiento]');
    expect(filasVence.map(href)).toEqual(['/licencias?q=AutoCAD%202026', '/equipos?q=LAP-001']);
    expect(filasVence[0].text()).toContain('03/10/26');
    expect(w.text()).toContain('1 más vencen después de esta semana.');
  });

  it('"Hoy en custodia": hora, Entregado/Devuelto, equipo y persona', async () => {
    responde(resumenCompleto());
    const w = await montar();
    const movs = w.findAll('[data-movimiento]');
    expect(movs).toHaveLength(2);
    expect(movs[0].text()).toContain('10:12');
    expect(movs[0].text()).toContain('Entregado');
    expect(movs[0].text()).toContain('LAP-0150');
    expect(movs[0].text()).toContain('→');
    expect(movs[0].text()).toContain('R. Salas');
    expect(movs[1].text()).toContain('Devuelto');
    expect(movs[1].text()).toContain('←');
    expect(movs[0].find('a').attributes('href')).toBe('/equipos?q=LAP-0150');
  });

  it('retira lo del tablero anterior: KPI con ícono, bloque Inventario, esqueletos y círculo verde', async () => {
    responde(resumenCompleto());
    const w = await montar();
    const html = w.html();
    expect(w.text()).not.toContain('Inventario');
    expect(html).not.toContain('animate-pulse');
    expect(html).not.toContain('bg-green-50');
    expect(w.text()).not.toContain('Todo al día');
    // Los vacíos y avisos son filas del libro, sin cajas de ícono.
    expect(html).not.toMatch(/<span[^>]*rounded-(?:md|lg|full)[^>]*bg-\w+-(?:50|100)[^>]*>\s*<i /);
  });
});

describe('Inicio — filtro por vista', () => {
  it('la fila de vistas lleva conteo y solo ofrece lo que el servidor entregó', async () => {
    responde(resumenCompleto());
    const w = await montar();
    const etiquetas = vistas(w).map((b) => b.text().replace(/\s+/g, ' ').trim());
    expect(etiquetas).toHaveLength(6);
    expect(etiquetas.map((e) => e.replace(/\d+$/, '').trim())).toEqual(['Todos', 'Tickets', 'Solicitudes', 'Accesos', 'Custodia', 'Problemas']);
    const total = Number(etiquetas[0].match(/\d+$/)[0]);
    const suma = etiquetas.slice(1).reduce((n, e) => n + Number(e.match(/\d+$/)[0]), 0);
    expect(suma).toBe(total); // cada asunto cae en exactamente una vista
  });

  it('elegir una vista filtra el feed en el lugar y "Todos" la vuelve a mostrar', async () => {
    responde(resumenCompleto());
    const w = await montar();
    await boton(w, 'Custodia').trigger('click');
    const claves = filas(w).map((f) => f.text());
    expect(claves.length).toBeGreaterThan(0);
    expect(claves.every((t) => /LAP-0142|ESET|AutoCAD|S10|LAP-001|DES-002/.test(t))).toBe(true);
    expect(boton(w, 'Custodia').attributes('aria-pressed')).toBe('true');
    expect(w.find('section[aria-labelledby] h2').text()).toContain('Pendientes');
    await boton(w, 'Todos').trigger('click');
    expect(filas(w).length).toBeGreaterThan(claves.length);
  });

  it('una vista sin pendientes dice cuál es', async () => {
    responde(resumenCompleto({ }));
    const r = resumenCompleto();
    r.problemas = { acciones_vencidas: [], recurrentes: [] };
    responde(r);
    const w = await montar();
    await boton(w, 'Problemas').trigger('click');
    expect(w.find('[data-vacio]').text()).toBe('— Sin pendientes en problemas.');
  });
});

describe('Inicio — al día', () => {
  it('es una línea de texto: en el encabezado y como fila del libro, sin círculo verde', async () => {
    responde(resumenVacio());
    const w = await montar();
    expect(w.find('header p').text()).toBe('Jueves 1 de octubre · al día');
    expect(w.find('[data-vacio]').text()).toBe('— Al día. Ningún asunto pendiente.');
    expect(w.html()).not.toContain('bg-green-50');
    expect(filas(w)).toHaveLength(0);
  });
});

describe('Inicio — errores', () => {
  it('una sección con error muestra su aviso con "Reintentar" y NO dice "al día"', async () => {
    responde(resumenVacio({ problemas: null, errores: ['problemas'] }));
    const w = await montar();
    const aviso = w.find('[role="alert"]');
    expect(aviso.text()).toContain('No se pudo calcular los problemas.');
    expect(w.text()).not.toContain('Al día');
    expect(w.find('header p').text()).toBe('Jueves 1 de octubre');
  });

  it('"Reintentar" vuelve a llamar la RPC y el aviso desaparece cuando se corrige', async () => {
    responde(resumenVacio({ problemas: null, errores: ['problemas'] }));
    const w = await montar();
    expect(cliente.rpc).toHaveBeenCalledTimes(1);
    responde(resumenVacio());
    await w.find('[role="alert"] button').trigger('click');
    await asentar();
    expect(cliente.rpc).toHaveBeenCalledTimes(2);
    expect(w.find('[role="alert"]').exists()).toBe(false);
    expect(w.find('[data-vacio]').text()).toContain('Al día');
  });

  it('un error de sección también aparece en su vista y los demás datos siguen visibles', async () => {
    const r = resumenCompleto();
    r.problemas = null;
    r.errores = ['problemas'];
    responde(r);
    const w = await montar();
    expect(filas(w).length).toBeGreaterThan(0);
    await boton(w, 'Problemas').trigger('click');
    expect(w.find('[role="alert"]').text()).toContain('los problemas');
    expect(w.find('[data-vacio]').exists()).toBe(false); // no hay "sin pendientes": se explica con el aviso
  });

  it('un error en "Mis tickets" o "Hoy en custodia" se avisa en su panel con reintento', async () => {
    const r = resumenCompleto();
    r.custodia_hoy = null;
    r.tickets = null;
    r.errores = ['custodia_hoy', 'tickets'];
    responde(r);
    const w = await montar();
    const avisos = w.findAll('aside [role="alert"]').map((a) => a.text());
    expect(avisos.some((t) => t.includes('la custodia de hoy'))).toBe(true);
    expect(avisos.some((t) => t.includes('los tickets'))).toBe(true);
    expect(w.findAll('aside [role="alert"] button').length).toBe(avisos.length);
  });

  it('si la RPC falla ENTERA: UN aviso con reintento, nunca "al día", sin feed ni paneles', async () => {
    fallaEntera();
    const w = await montar();
    const avisos = w.findAll('[role="alert"]');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].text()).toContain('No se pudo cargar el resumen del Inicio.');
    expect(w.text()).not.toContain('Al día');
    expect(w.find('header p').text()).toBe('Jueves 1 de octubre');
    expect(filas(w)).toHaveLength(0);
    expect(w.find('aside').exists()).toBe(false);
  });

  it('el reintento tras un fallo total carga el Inicio', async () => {
    fallaEntera();
    const w = await montar();
    responde(resumenCompleto());
    await w.find('[role="alert"] button').trigger('click');
    await asentar();
    expect(cliente.rpc).toHaveBeenCalledTimes(2);
    expect(w.find('[role="alert"]').exists()).toBe(false);
    expect(filas(w).length).toBeGreaterThan(0);
  });

  it('un fallo al ACTUALIZAR conserva lo cargado y lo avisa', async () => {
    responde(resumenCompleto());
    const w = await montar();
    const antes = filas(w).length;
    fallaEntera();
    await useDashboardStore().cargar();
    await asentar();
    expect(filas(w)).toHaveLength(antes);
    expect(w.find('[data-error-actualizacion]').text()).toContain('No se pudo actualizar el Inicio');
    expect(w.text()).not.toContain('Al día');
  });
});

describe('Inicio — carga', () => {
  it('mientras llega el primer resumen: texto discreto y línea de 2 px, sin esqueletos', async () => {
    cliente.rpc.mockReturnValue(new Promise(() => {}));
    const w = await montar();
    expect(w.text()).toContain('Cargando el Inicio…');
    expect(w.find('[data-carga]').classes()).toContain('h-0.5');
    expect(w.find('[data-carga]').attributes('role')).toBe('progressbar');
    expect(w.html()).not.toContain('animate-pulse');
    expect(w.find('[role="alert"]').exists()).toBe(false);
    expect(w.text()).not.toContain('Al día');
  });

  it('recargar deja el contenido anterior en pantalla y solo enciende la línea', async () => {
    responde(resumenCompleto());
    const w = await montar();
    const antes = filas(w).length;
    cliente.rpc.mockReturnValue(new Promise(() => {}));
    useDashboardStore().cargar();
    await asentar();
    expect(filas(w)).toHaveLength(antes);
    expect(w.find('[data-carga]').attributes('role')).toBe('progressbar');
    expect(w.text()).not.toContain('Cargando el Inicio…');
  });
});

describe('Inicio — permisos: lo que el servidor no entrega no se muestra', () => {
  it('un ASISTENTE sin licencias ni problemas: sin vista Problemas ni "Vence esta semana" de licencias', async () => {
    usuario({ rol: 'ASISTENTE', nombre: 'Diego Huamán', modulos: ['tickets', 'empleados', 'correos', 'equipos'] });
    const r = resumenCompleto();
    r.licencias_por_vencer = null;
    r.problemas = null;
    responde(r);
    const w = await montar();
    expect(w.find('h1').text()).toBe('Buenos días, Diego');
    expect(vistas(w).map((b) => b.text().replace(/\d+$/, '').trim())).toEqual(['Todos', 'Tickets', 'Solicitudes', 'Accesos', 'Custodia']);
    expect(w.find('[role="alert"]').exists()).toBe(false); // null sin error no es un error
    expect(w.text()).not.toContain('Acción correctiva');
    expect(w.text()).not.toContain('ESET');
    expect(w.findAll('[data-vencimiento]').map(href)).toEqual(['/equipos?q=LAP-001']);
  });

  it('sin el módulo tickets no hay "Mis tickets", ni vista Tickets, ni botón; sin equipos no hay "Hoy en custodia"', async () => {
    usuario({ rol: 'ASISTENTE', modulos: ['correos'] });
    responde(resumenVacio({
      tickets: null, licencias_por_vencer: null, equipos_sin_devolver: null, garantias_por_vencer: null,
      actas_pendientes: null, custodia_hoy: null, problemas: null, solicitudes_abiertas: null,
    }));
    const w = await montar();
    const titulos = w.findAll('h2').map((h) => h.text());
    expect(titulos).not.toContain('Mis tickets');
    expect(titulos).not.toContain('Hoy en custodia');
    expect(titulos).not.toContain('Vence esta semana');
    expect(vistas(w).map((b) => b.text().replace(/\d+$/, '').trim())).toEqual(['Todos', 'Accesos']);
    expect(w.text()).not.toContain('Ticket interno');
  });
});
