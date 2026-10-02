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
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    cerrarTicket: vi.fn(),
    crearComentarioTicket: vi.fn().mockResolvedValue(undefined),
    crearKbArticulo: vi.fn().mockResolvedValue(undefined),
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

async function montar(id = 'tck-1', { rol = 'ASISTENTE', userId = 'staff-1' } = {}) {
  const router = crearRouter();
  router.push(`/tickets/${id}`);
  await router.isReady();
  const auth = useAuthStore();
  auth.$patch({ user: { id: userId }, rol });
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

  it('estado "en_progreso": "Marcar como resuelto" abre ConfirmDialog; confirmar cierra el ticket', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'en_progreso', asignado_a: 'staff-1' }));
    insforgeApi.cerrarTicket.mockResolvedValue(ticketBase({ estado: 'cerrado' }));
    const w = await montar();

    const abrirResolver = w.findAll('button').find((b) => b.text().includes('Marcar como resuelto'));
    await abrirResolver.trigger('click');
    await flushPromises();

    expect(document.body.textContent).toContain('cierra el ticket de inmediato');
    const confirmar = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Marcar como resuelto');
    expect(confirmar).toBeTruthy();
    confirmar.click();
    await flushPromises();

    expect(insforgeApi.cerrarTicket).toHaveBeenCalledWith('tck-1');
  });

  it('estado terminal + JEFE: "Reabrir ticket" abre el form inline; confirmar reabre con motivo', async () => {
    insforgeApi.getTicket.mockResolvedValue(ticketBase({ estado: 'cerrado' }));
    const w = await montar('tck-1', { rol: 'JEFE' });

    const abrir = w.findAll('button').find((b) => b.text().includes('Reabrir ticket'));
    expect(abrir).toBeTruthy();
    await abrir.trigger('click');
    await flushPromises();

    await w.find('textarea').setValue('Se reporta el mismo problema otra vez');
    await w.findAll('button').find((b) => b.text().includes('Confirmar reabrir')).trigger('click');
    await flushPromises();

    expect(insforgeApi.actualizarTicket).toHaveBeenCalledWith('tck-1', { estado: 'reabierto' });
    expect(insforgeApi.crearComentarioTicket).toHaveBeenCalledWith('tck-1', 'Se reporta el mismo problema otra vez', true);
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
});
