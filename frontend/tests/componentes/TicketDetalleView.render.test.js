// @vitest-environment happy-dom
//
// TicketDetalleView.vue — Fase 2 (detalle + timeline) de la migración de
// Tickets a AppButton. Cubre lo que de verdad importa después de convertir
// ~10 botones: que cada uno siga disparando la transición correcta en
// useTicketDetalleLogica.js/stores/ticketDetalle.js (la "máquina de
// estados" que esta fase tenía que proteger) — no solo que se vea bien.
//
// Mockea api/insforge.js en el límite; useTicketDetalleLogica.js y
// stores/ticketDetalle.js corren de verdad, sin tocar.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import TicketDetalleView from '../../src/modules/tickets/TicketDetalleView.vue';
import { useAuthStore } from '../../src/stores/auth.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    getTicket: vi.fn(),
    listComentariosTicket: vi.fn().mockResolvedValue([]),
    nombresStaff: vi.fn().mockResolvedValue([]),
    listEventosTicket: vi.fn().mockResolvedValue([]),
    getSatisfaccionTicket: vi.fn().mockResolvedValue(null),
    equiposPorEmpleado: vi.fn().mockResolvedValue([]),
    listArticulosRelacionados: vi.fn().mockResolvedValue([]),
    getProblemaAbiertoDeTicket: vi.fn().mockResolvedValue(null),
    actualizarTicket: vi.fn().mockResolvedValue(undefined),
    resolverTicket: vi.fn(),
    reabrirTicket: vi.fn(),
    revisarCalificacionBaja: vi.fn(),
    crearComentarioTicket: vi.fn().mockResolvedValue(undefined),
    crearKbDesdeTicket: vi.fn().mockResolvedValue(undefined),
    listCategoriasTicket: vi.fn(),
    listSubcategoriasTicket: vi.fn(),
    reclasificarTicket: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

function ticketBase(overrides = {}) {
  return {
    id: 'tck-1',
    codigo: 'TCK-0001',
    titulo: 'No enciende el monitor',
    descripcion: 'El monitor no prende desde ayer.',
    categoria_nombre: 'Hardware',
    subcategoria_nombre: null,
    categoria_id: 'cat-1',
    subcategoria_tipo_sugerido: null,
    estado: 'abierto',
    prioridad: 'media',
    nivel_atencion: null,
    asignado_a: null,
    tipo: 'incidente',
    vinculado: true,
    empleado_id: 'emp-1',
    empleado_nombre: 'Juan Pérez',
    empleado_dni: '12345678',
    empleado_correo: null,
    contacto_ingresado: null,
    equipo_desc: null,
    cuenta_desc: null,
    licencia_desc: null,
    tiene_adjunto: false,
    token: 'tok-abc',
    ...overrides,
  };
}

function crearRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tickets', name: 'tickets', component: { template: '<div />' } },
      { path: '/tickets/:id', name: 'ticket-detalle', component: TicketDetalleView },
      { path: '/empleados/:id', name: 'empleado-detalle', component: { template: '<div />' } },
      { path: '/problemas/:id', name: 'problema-detalle', component: { template: '<div />' } },
    ],
  });
}

function flushPromises() {
  return new Promise((r) => setTimeout(r, 0));
}

// Espera a que se cumpla una condición, con tope (la suite completa corre en
// paralelo: un tiempo fijo resulta corto).
async function hastaQue(cond, tope = 3000) {
  const desde = Date.now();
  while (!cond() && Date.now() - desde < tope) {
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function montar(id = 'tck-1', { rol = 'ASISTENTE', userId = 'staff-1', modulos = ['tickets'] } = {}) {
  const router = crearRouter();
  router.push(`/tickets/${id}`);
  await router.isReady();
  const auth = useAuthStore();
  auth.$patch({ user: { id: userId }, rol, modulosVisibles: modulos });
  const w = mount(TicketDetalleView, {
    global: {
      plugins: [router, [PrimeVue, { unstyled: true }]],
      stubs: { ProblemaForm: true },
    },
  });
  await flushPromises();
  return w;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.getTicket.mockResolvedValue(ticketBase());
});

describe('TicketDetalleView.vue — botones migrados a AppButton (Fase 2)', () => {
  // Rediseño 2026-09-23: en una página, lo destructivo es outline + danger
  // (SISTEMA-DISENO §1.5; el rojo sólido queda para el botón de confirmar).
  // Se sigue verificando que Rechazar lleve la severidad de peligro.
  it('estado "abierto": Rechazar (danger) e Iniciar atención (primary) se renderizan', async () => {
    const w = await montar();
    const rechazar = w.findAll('button').find((b) => b.text() === 'Rechazar');
    const iniciar = w.findAll('button').find((b) => b.text().includes('Iniciar atención'));
    expect(rechazar.classes().join(' ')).toContain('text-red-600');
    expect(rechazar.classes().join(' ')).toContain('border-red-300');
    expect(iniciar.classes().join(' ')).toContain('bg-primary-500');
  });

  it('"Iniciar atención" llama a actualizarTicket con estado en_progreso (máquina de estados intacta)', async () => {
    const w = await montar();
    const iniciar = w.findAll('button').find((b) => b.text().includes('Iniciar atención'));
    await iniciar.trigger('click');
    await flushPromises();
    expect(insforgeApi.actualizarTicket).toHaveBeenCalledWith('tck-1', expect.objectContaining({ estado: 'en_progreso' }));
  });

  it('"Rechazar" abre el formulario inline; "Confirmar rechazo" comenta y cierra el ticket', async () => {
    const w = await montar();
    await w.findAll('button').find((b) => b.text() === 'Rechazar').trigger('click');
    await flushPromises();

    const textarea = w.find('textarea');
    expect(textarea.exists()).toBe(true);
    await textarea.setValue('El usuario canceló el pedido');

    await w.findAll('button').find((b) => b.text().includes('Confirmar rechazo')).trigger('click');
    await flushPromises();

    expect(insforgeApi.crearComentarioTicket).toHaveBeenCalledWith('tck-1', 'El usuario canceló el pedido', false);
    expect(insforgeApi.actualizarTicket).toHaveBeenCalledWith('tck-1', { estado: 'rechazado' });
  });

  // Procedimiento de cierre (120): «Resolver» pide la solución aplicada, que el
  // solicitante ve; sin solución no llama a la RPC. El ticket queda resuelto.
  it('estado "en_progreso": "Resolver" pide la solución y llama a resolverTicket con ella', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'en_progreso', asignado_a: 'staff-1' }));
    insforgeApi.resolverTicket.mockResolvedValue(ticketBase({ estado: 'resuelto', asignado_a: 'staff-1' }));
    const w = await montar();

    expect(w.findAll('button').some((b) => b.text().includes('Marcar como resuelto'))).toBe(false);
    await w.findAll('button').find((b) => b.text() === 'Resolver').trigger('click');
    await flushPromises();

    expect(document.body.textContent).toContain('Solución aplicada');
    expect(document.body.textContent).toContain('Cerrado automático – Sin validación');
    document.querySelector('#resolver-ticket-form').dispatchEvent(new Event('submit'));
    await flushPromises();
    expect(insforgeApi.resolverTicket).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Escriba la solución aplicada');

    const nota = document.querySelector('#resolver-ticket-form textarea');
    nota.value = 'Se cambió el cable de video y se probó el monitor';
    nota.dispatchEvent(new Event('input'));
    document.querySelector('#resolver-ticket-form').dispatchEvent(new Event('submit'));
    await flushPromises();

    expect(insforgeApi.resolverTicket).toHaveBeenCalledWith('tck-1', 'Se cambió el cable de video y se probó el monitor');
    w.unmount();
    document.body.innerHTML = '';
  });

  it('estado "resuelto": no ofrece Resolver otra vez y avisa que espera la calificación', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'resuelto', resuelto_at: '2026-10-21T10:00:00Z' }));
    const w = await montar();
    expect(w.findAll('button').some((b) => b.text() === 'Resolver')).toBe(false);
    expect(w.text()).toContain('espera la calificación del solicitante');
    expect(w.text()).toContain('Cerrado automático – Sin validación');
  });

  // Calificación de 1 o 2 (120): quien tiene el módulo tickets la revisa una vez
  // desde la ficha; reabrir por esta vía no exige ser JEFE.
  it('calificación 2/5 sin revisar: «Revisar» abre el diálogo y reabre el ticket con la nota', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'cerrado', cerrado_por: 'usuario' }));
    insforgeApi.getSatisfaccionTicket.mockResolvedValue({ id: 'enc-1', nivel: 2, comentario: 'Sigue fallando', fecha_envio: '2026-10-21T15:00:00Z', revision_desenlace: null });
    insforgeApi.revisarCalificacionBaja.mockResolvedValue({ ok: true, desenlace: 'reabierto', estado: 'reabierto' });
    const w = await montar();

    expect(w.text()).toContain('Validado por el solicitante');
    expect(w.findAll('button').some((b) => b.text().includes('Reabrir ticket'))).toBe(false);
    await w.findAll('button').find((b) => b.text() === 'Revisar').trigger('click');
    await flushPromises();

    const form = document.querySelector('#revisar-calificacion-form');
    expect(form.textContent).toContain('Sigue fallando');
    expect(form.querySelector('input[value="reabierto"]').checked).toBe(true);
    const nota = form.querySelector('textarea');
    nota.value = 'El monitor vuelve a apagarse: se cambia la fuente';
    nota.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    await hastaQue(() => insforgeApi.revisarCalificacionBaja.mock.calls.length > 0 && !document.querySelector('#revisar-calificacion-form'));

    expect(insforgeApi.revisarCalificacionBaja).toHaveBeenCalledWith('enc-1', 'reabierto', 'El monitor vuelve a apagarse: se cambia la fuente');
    expect(document.querySelector('#revisar-calificacion-form')).toBeNull();
    w.unmount();
    document.body.innerHTML = '';
  });

  it('cierre automático: la ficha lo dice y no ofrece revisar ni reenviar la encuesta anulada', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'cerrado', cerrado_por: 'sistema', cerrado_at: '2026-10-21T15:00:00Z' }));
    insforgeApi.getSatisfaccionTicket.mockResolvedValue({ id: 'enc-2', nivel: null, fecha_envio: null, anulada_at: '2026-10-21T15:00:00Z' });
    const w = await montar();
    expect(w.text()).toContain('Cerrado automático – Sin validación');
    expect(w.text()).not.toContain('Encuesta sin responder');
    expect(w.findAll('button').some((b) => b.text() === 'Revisar')).toBe(false);
  });

  it('estado terminal + JEFE: "Reabrir ticket" abre el form inline; confirmar reabre con motivo (RPC reabrir_ticket)', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'cerrado' }));
    insforgeApi.reabrirTicket.mockResolvedValue(ticketBase({ estado: 'reabierto' }));
    const w = await montar('tck-1', { rol: 'JEFE' });

    const abrir = w.findAll('button').find((b) => b.text().includes('Reabrir ticket'));
    expect(abrir).toBeTruthy();
    await abrir.trigger('click');
    await flushPromises();

    await w.find('textarea').setValue('Se reporta el mismo problema otra vez');
    await w.findAll('button').find((b) => b.text().includes('Confirmar reabrir')).trigger('click');
    await flushPromises();

    // Estado + nota interna en UNA transacción de servidor (antes, dos llamadas del cliente).
    expect(insforgeApi.reabrirTicket).toHaveBeenCalledWith('tck-1', 'Se reporta el mismo problema otra vez');
    expect(insforgeApi.actualizarTicket).not.toHaveBeenCalledWith('tck-1', { estado: 'reabierto' });
  });

  it('estado terminal, sin ser JEFE: no muestra "Reabrir ticket"', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'cerrado' }));
    const w = await montar('tck-1', { rol: 'ASISTENTE' });
    expect(w.findAll('button').find((b) => b.text().includes('Reabrir ticket'))).toBeFalsy();
    expect(w.text()).toContain('Solo el jefe puede reabrir este ticket');
  });

  it('el composer envía comentarios reales al backend', async () => {
    const w = await montar();
    // Por su nombre accesible (nuevo en el rediseño 2026-09-23), no por la
    // clase `.tk-comentario-input`, que ya no existe.
    const textarea = w.find('textarea[aria-label="Mensaje del comentario"]');
    await textarea.setValue('Ya llegó el técnico');
    await w.findAll('button').find((b) => b.text().includes('Comentar')).trigger('click');
    await flushPromises();
    expect(insforgeApi.crearComentarioTicket).toHaveBeenCalledWith('tck-1', 'Ya llegó el técnico', true);
  });
});

// Detalle V2 (2026-09-25): encabezado con quién lo pide / atiende / resolvió
// y cuánto tardó; feed "Todo · Mensajes"; los mensajes sin autor son del
// solicitante (no "Sistema").
describe('TicketDetalleView.vue — encabezado y feed V2', () => {
  const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

  it('un ticket resuelto dice quién lo resolvió, hace cuánto y cuánto tardó', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'cerrado', asignado_a: 'staff-2', created_at: hace(5) }));
    insforgeApi.nombresStaff.mockResolvedValue([{ user_id: 'staff-2', nombre: 'Diego Huamán' }]);
    insforgeApi.listEventosTicket.mockResolvedValue([
      { id: 'e1', evento: 'estado_cambiado', detalle: 'De "en_progreso" a "resuelto"', user_id: 'staff-2', created_at: hace(3) },
      { id: 'e2', evento: 'estado_cambiado', detalle: 'De "resuelto" a "cerrado"', user_id: 'staff-9', created_at: hace(3) },
    ]);
    insforgeApi.getSatisfaccionTicket.mockResolvedValue({ nivel: 4, comentario: 'Rápido', fecha_envio: hace(2) });
    const w = await montar();
    const resumen = w.find('ul[aria-label="Resumen del ticket"]');
    const texto = resumen.text();
    expect(texto).toContain('Juan Pérez');
    expect(texto).toContain('Diego Huamán');
    expect(texto).toContain('2 d');
    expect(texto).toContain('4/5');
    // Prioridad/nivel/tipo/responsable ya están en Gestión: no se repiten.
    expect(texto).not.toContain('Media');
    expect(texto).not.toContain('Incidente');
    // Íconos con guía: cada dato explica qué es al pasar el mouse.
    expect(resumen.findAll('li').every((li) => li.attributes('title') || li.find('button[title]').exists())).toBe(true);
    // La satisfacción ya no ocupa una sección abajo en la columna.
    expect(w.findAll('h2').some((h) => h.text() === 'Satisfacción')).toBe(false);
  });

  it('"Mensajes" oculta los hitos del sistema y el mensaje sin autor lleva el nombre del solicitante', async () => {
    insforgeApi.listEventosTicket.mockResolvedValue([
      { id: 'e1', evento: 'creado', detalle: '', user_id: null, created_at: hace(2) },
    ]);
    insforgeApi.listComentariosTicket.mockResolvedValue([
      { id: 'c1', mensaje: 'Gracias', interno: false, autor_id: null, created_at: hace(1) },
    ]);
    const w = await montar();
    expect(w.findAll('[data-tipo="evento"]').length).toBe(1);
    expect(w.find('[data-tipo="comentario"]').text()).toContain('Juan Pérez');
    expect(w.find('[data-tipo="comentario"]').text()).not.toContain('Sistema');
    const mensajes = w.find('[role="group"][aria-label="Qué mostrar en la conversación"]').findAll('button').find((b) => b.text().includes('Mensajes'));
    await mensajes.trigger('click');
    expect(w.findAll('[data-tipo="evento"]').length).toBe(0);
    expect(w.findAll('[data-tipo="comentario"]').length).toBe(1);
  });

  // Aviso de la categoría/subcategoría (migración 114): el técnico ve en el
  // contexto la misma regla que vio el solicitante al registrar el ticket.
  it('muestra en Contexto el aviso de la categoría del ticket, y nada si no tiene', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ aviso: 'Deberá adjuntar la autorización de gerencia.' }));
    let w = await montar();
    const nota = w.find('[data-aviso-categoria]');
    expect(nota.exists()).toBe(true);
    expect(nota.attributes('role')).toBe('note');
    expect(nota.text()).toContain('Deberá adjuntar la autorización de gerencia.');
    w.unmount();

    insforgeApi.getTicket.mockResolvedValue(ticketBase({ aviso: '' }));
    w = await montar();
    expect(w.find('[data-aviso-categoria]').exists()).toBe(false);
  });
});

// Reclasificar desde la ficha (119): quien atiende corrige la categoría que
// eligió el solicitante; un ticket cerrado o rechazado solo lo mueve el JEFE.
describe('TicketDetalleView.vue — reclasificar la categoría (119)', () => {
  const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  const dialogo = () => document.querySelector('[role="dialog"]');
  const campo = (rotulo) => {
    const label = [...dialogo().querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(rotulo));
    return label ? document.getElementById(label.getAttribute('for')) : null;
  };
  const botonDeDialogo = (texto) => [...dialogo().querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(texto));
  async function escribir(el, valor) {
    el.value = valor;
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    await espera();
  }
  const botonReclasificar = (w) => w.find('[data-clasificacion]').findAll('button').find((b) => b.text().includes('Reclasificar'));

  beforeEach(() => {
    insforgeApi.listCategoriasTicket.mockResolvedValue([
      { id: 'software', nombre: 'Software y Aplicaciones' },
      { id: 'accesos_cuentas', nombre: 'Accesos y Cuentas' },
    ]);
    insforgeApi.listSubcategoriasTicket.mockResolvedValue([
      { id: 's-error', categoria_id: 'software', nombre: 'Error o falla en aplicación' },
      { id: 's-permisos', categoria_id: 'accesos_cuentas', nombre: 'Solicitar permisos o accesos (sistemas / carpetas)' },
    ]);
    insforgeApi.reclasificarTicket.mockResolvedValue({ ticket_id: 'tck-1', cambio: true });
  });
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('un técnico con el módulo tickets reclasifica un ticket en curso y la ficha muestra la categoría nueva', async () => {
    const enCurso = { estado: 'en_progreso', asignado_a: 'staff-1', categoria_id: 'software', categoria_nombre: 'Software y Aplicaciones', subcategoria_id: 's-error', subcategoria_nombre: 'Error o falla en aplicación' };
    insforgeApi.getTicket.mockResolvedValue(ticketBase(enCurso));
    const w = await montar();
    expect(w.find('[data-clasificacion]').text()).toContain('Software y Aplicaciones › Error o falla en aplicación');

    await botonReclasificar(w).trigger('click');
    await espera(20);
    expect(dialogo().textContent).toContain('Reclasificar ticket');
    expect(dialogo().textContent).toContain('Software y Aplicaciones › Error o falla en aplicación');
    await escribir(campo('Subcategoría correcta'), 's-permisos');
    await escribir(campo('Motivo'), 'No es una falla: le faltan permisos en la carpeta');

    insforgeApi.getTicket.mockResolvedValue(ticketBase({ ...enCurso, categoria_id: 'accesos_cuentas', categoria_nombre: 'Accesos y Cuentas', subcategoria_id: 's-permisos', subcategoria_nombre: 'Solicitar permisos o accesos (sistemas / carpetas)' }));
    botonDeDialogo('Reclasificar').click();
    await espera(40);
    expect(insforgeApi.reclasificarTicket).toHaveBeenCalledWith('tck-1', 's-permisos', 'No es una falla: le faltan permisos en la carpeta');
    await espera(500);
    expect(w.find('[data-clasificacion]').text()).toContain('Accesos y Cuentas › Solicitar permisos o accesos');
    // Tipo y prioridad no se mandan: la RPC no los toca.
    expect(insforgeApi.actualizarTicket).not.toHaveBeenCalled();
  });

  it('un técnico no ve «Reclasificar» en un ticket cerrado; el JEFE sí', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'cerrado' }));
    let w = await montar('tck-1', { rol: 'ASISTENTE' });
    expect(w.find('[data-clasificacion]').text()).toContain('Hardware');
    expect(botonReclasificar(w)).toBeFalsy();
    w.unmount();

    w = await montar('tck-1', { rol: 'JEFE', modulos: [] });
    expect(botonReclasificar(w)).toBeTruthy();
  });

  it('sin el módulo tickets no se ofrece', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'en_progreso', asignado_a: 'staff-1' }));
    const w = await montar('tck-1', { rol: 'ASISTENTE', modulos: ['equipos'] });
    expect(botonReclasificar(w)).toBeFalsy();
  });
});
