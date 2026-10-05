// @vitest-environment happy-dom
//
// CategoriasTicketPanel.vue — aviso al solicitante (migración 114): campo con
// contador en el formulario de categoría y en el de subcategoría, y quién
// puede editarlo (la regla vigente de la RLS: módulo `tickets`, JEFE exento).
// Solo api/insforge.js está mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import CategoriasTicketPanel from '../../src/modules/configuracion/CategoriasTicketPanel.vue';
import { useAuthStore } from '../../src/stores/auth.js';

vi.mock('../../src/core/toast.js', () => ({ showToast: vi.fn() }));
vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listServicios: vi.fn(),
    listCategoriasTicket: vi.fn(),
    listSubcategoriasTicket: vi.fn(),
    createCategoriaTicket: vi.fn(),
    updateCategoriaTicket: vi.fn(),
    softDeleteCategoriaTicket: vi.fn(),
    createSubcategoriaTicket: vi.fn(),
    updateSubcategoriaTicket: vi.fn(),
    softDeleteSubcategoriaTicket: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const AVISO = 'Deberá adjuntar la autorización de gerencia. TI no es responsable del contenido: solo administra el sistema.';
const CATEGORIAS = [
  { id: 'camaras', nombre: 'Cámaras', servicio_id: null, aviso: null },
  { id: 'red', nombre: 'Redes', servicio_id: null, aviso: 'Indique la sede afectada.' },
];
const SUBCATEGORIAS = [
  { id: 's-corto', categoria_id: 'camaras', nombre: 'Solicitud de imagen o corto', tipo_sugerido: 'solicitud', aviso: AVISO },
  { id: 's-senal', categoria_id: 'camaras', nombre: 'Cámara sin señal', tipo_sugerido: 'incidente', aviso: null },
];

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const montados = [];

async function montar({ rol = 'JEFE', modulos = [] } = {}) {
  const auth = useAuthStore();
  auth.rol = rol;
  auth.modulosVisibles = modulos;
  const w = mount(CategoriasTicketPanel, {
    attachTo: document.body,
    global: { plugins: [[PrimeVue, { unstyled: true }]], stubs: { transition: false } },
  });
  montados.push(w);
  for (let i = 0; i < 5; i += 1) await espera();
  return w;
}

const dialogo = () => document.querySelector('[role="dialog"]');
const campo = (rotulo) => {
  const label = [...dialogo().querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(rotulo));
  return label ? document.getElementById(label.getAttribute('for')) : null;
};
const botonDeDialogo = (texto) => [...dialogo().querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(texto));
const boton = (texto) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
async function elegirAccion(w, etiquetaBoton, texto) {
  await w.find(`button[aria-label="${etiquetaBoton}"]`).trigger('click');
  await espera();
  [...document.querySelectorAll('[data-pc-section="itemcontent"]')].find((e) => e.textContent.trim() === texto).click();
  await espera();
}
async function escribir(el, valor) {
  el.value = valor;
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  await espera();
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listServicios.mockResolvedValue([]);
  insforgeApi.listCategoriasTicket.mockImplementation(async () => CATEGORIAS.map((c) => ({ ...c })));
  insforgeApi.listSubcategoriasTicket.mockImplementation(async () => SUBCATEGORIAS.map((s) => ({ ...s })));
  insforgeApi.createCategoriaTicket.mockImplementation(async (d) => ({ ...d }));
  insforgeApi.updateCategoriaTicket.mockImplementation(async (id, d) => ({ id, ...d }));
  insforgeApi.updateSubcategoriaTicket.mockImplementation(async (id, d) => ({ id, categoria_id: 'camaras', ...d }));
});

afterEach(() => {
  while (montados.length) {
    try { montados.pop().unmount(); } catch { /* ya desmontado */ }
  }
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('CategoriasTicketPanel — aviso al solicitante (114)', () => {
  it('la lista marca qué categorías y subcategorías tienen aviso', async () => {
    const w = await montar();
    const filas = w.findAll('ul[aria-label="Categorías de tickets"] > li');
    expect(filas[0].text()).toContain('Cámaras');
    expect(filas[0].text()).not.toContain('Con aviso');
    expect(filas[1].text()).toContain('Redes');
    expect(filas[1].text()).toContain('Con aviso');
    await filas[0].find('button[aria-expanded]').trigger('click');
    await espera();
    const subs = w.findAll('ul[aria-label="Subcategorías de Cámaras"] > li');
    expect(subs[0].text()).toContain('Solicitud de imagen o corto');
    expect(subs[0].text()).toContain('Con aviso');
    expect(subs[1].text()).not.toContain('Con aviso');
  });

  it('nueva categoría: campo «Aviso al solicitante» con contador contra 600 y ayuda con el ejemplo; se manda al crear', async () => {
    await montar();
    boton('Nueva categoría').click();
    await espera();
    const area = campo('Aviso al solicitante');
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.getAttribute('maxlength')).toBe('600');
    expect(dialogo().textContent).toContain('0/600');
    expect(dialogo().textContent).toContain('Ejemplo: «Deberá adjuntar la autorización de gerencia');
    await escribir(campo('Nombre'), 'Cámaras de obra');
    await escribir(area, AVISO);
    expect(dialogo().textContent).toContain(`${AVISO.length}/600`);
    botonDeDialogo('Guardar').click();
    await espera(40);
    expect(insforgeApi.createCategoriaTicket).toHaveBeenCalledWith(expect.objectContaining({ id: 'camaras_de_obra', nombre: 'Cámaras de obra', aviso: AVISO }));
  });

  it('editar categoría precarga el aviso y permite borrarlo (vacío → el API lo manda como null)', async () => {
    const w = await montar();
    await elegirAccion(w, 'Acciones de Redes', 'Editar');
    expect(campo('Aviso al solicitante').value).toBe('Indique la sede afectada.');
    await escribir(campo('Aviso al solicitante'), '');
    botonDeDialogo('Guardar').click();
    await espera(40);
    expect(insforgeApi.updateCategoriaTicket).toHaveBeenCalledWith('red', expect.objectContaining({ nombre: 'Redes', aviso: '' }));
  });

  it('editar subcategoría: diálogo con nombre, tipo sugerido y aviso; guarda y actualiza la fila', async () => {
    const w = await montar();
    await w.findAll('ul[aria-label="Categorías de tickets"] > li')[0].find('button[aria-expanded]').trigger('click');
    await espera();
    await w.find('button[aria-label="Editar la subcategoría Cámara sin señal"]').trigger('click');
    await espera();
    expect(dialogo().textContent).toContain('Editar subcategoría');
    expect(campo('Nombre').value).toBe('Cámara sin señal');
    expect(campo('Tipo sugerido').value).toBe('incidente');
    expect(campo('Aviso al solicitante').value).toBe('');
    await escribir(campo('Aviso al solicitante'), 'Indique la ubicación exacta de la cámara.');
    botonDeDialogo('Guardar').click();
    await espera(40);
    expect(insforgeApi.updateSubcategoriaTicket).toHaveBeenCalledWith('s-senal', {
      nombre: 'Cámara sin señal', tipo_sugerido: 'incidente', aviso: 'Indique la ubicación exacta de la cámara.',
    });
    await espera(500);
    const subs = w.findAll('ul[aria-label="Subcategorías de Cámaras"] > li');
    expect(subs[1].text()).toContain('Con aviso');
  });

  it('sin el módulo Tickets el panel es solo lectura: sin crear, editar ni eliminar, y lo explica', async () => {
    const w = await montar({ rol: 'ASISTENTE', modulos: ['empleados'] });
    expect(w.find('[data-solo-modulo]').text()).toContain('módulo Tickets');
    expect(boton('Nueva categoría')).toBeUndefined();
    expect(w.find('button[aria-label^="Acciones de"]').exists()).toBe(false);
    await w.findAll('ul[aria-label="Categorías de tickets"] > li')[0].find('button[aria-expanded]').trigger('click');
    await espera();
    expect(w.find('button[aria-label^="Editar la subcategoría"]').exists()).toBe(false);
    expect(w.find('button[aria-label^="Eliminar la subcategoría"]').exists()).toBe(false);
    expect(w.find('input[aria-label="Nombre de la subcategoría"]').exists()).toBe(false);
    // Sigue viendo el catálogo.
    expect(w.text()).toContain('Solicitud de imagen o corto');
  });

  it('un asistente con el módulo Tickets sí edita (misma regla que la RLS: no es exclusivo del JEFE)', async () => {
    const w = await montar({ rol: 'ASISTENTE', modulos: ['tickets'] });
    expect(w.find('[data-solo-modulo]').exists()).toBe(false);
    expect(boton('Nueva categoría')).toBeTruthy();
    expect(w.find('button[aria-label="Acciones de Redes"]').exists()).toBe(true);
  });
});
