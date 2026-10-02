// @vitest-environment happy-dom
//
// Catálogo de servicios (migración 107) en Configuración: lo ve cualquier staff,
// solo un JEFE crea, edita y elimina; tope de 15; el identificador sale del
// nombre. Y el selector opcional de servicio del formulario de categorías de
// ticket. Solo api/insforge.js está mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ServiciosPanel from '../../src/modules/configuracion/ServiciosPanel.vue';
import CategoriasTicketPanel from '../../src/modules/configuracion/CategoriasTicketPanel.vue';
import { useAuthStore } from '../../src/stores/auth.js';

vi.mock('../../src/core/toast.js', () => ({ showToast: vi.fn() }));
vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listServicios: vi.fn(),
    createServicio: vi.fn(),
    updateServicio: vi.fn(),
    softDeleteServicio: vi.fn(),
    nombresStaff: vi.fn(),
    listCategoriasTicket: vi.fn(),
    listSubcategoriasTicket: vi.fn(),
    createCategoriaTicket: vi.fn(),
    updateCategoriaTicket: vi.fn(),
    softDeleteCategoriaTicket: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';
import { showToast } from '../../src/core/toast.js';

const SERVICIOS = [
  { id: 'correo', nombre: 'Correo corporativo', descripcion: 'Buzones de la empresa', dueno_user_id: 'u1', criticidad: 'alta', horario: '24 x 7' },
  { id: 'erp', nombre: 'ERP', descripcion: null, dueno_user_id: null, criticidad: 'critica', horario: null },
];

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const montados = [];

async function montar(componente, { rol = 'JEFE' } = {}) {
  useAuthStore().rol = rol;
  const w = mount(componente, {
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
// Abre el menú ⋮ de una fila y elige una acción (el panel se teletransporta a <body>).
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
  insforgeApi.listServicios.mockImplementation(async () => SERVICIOS.map((s) => ({ ...s })));
  insforgeApi.createServicio.mockImplementation(async (d) => ({ ...d }));
  insforgeApi.updateServicio.mockImplementation(async (id, d) => ({ id, ...d }));
  insforgeApi.softDeleteServicio.mockResolvedValue();
  insforgeApi.nombresStaff.mockResolvedValue([{ user_id: 'u1', nombre: 'Alejandro Guevara' }, { user_id: 'u2', nombre: 'Diego Huamán' }]);
  insforgeApi.listCategoriasTicket.mockImplementation(async () => [
    { id: 'red', nombre: 'Redes', servicio_id: 'correo' },
    { id: 'otro', nombre: 'Otros', servicio_id: null },
  ]);
  insforgeApi.listSubcategoriasTicket.mockResolvedValue([]);
  insforgeApi.createCategoriaTicket.mockImplementation(async (d) => ({ ...d }));
  insforgeApi.updateCategoriaTicket.mockImplementation(async (id, d) => ({ id, ...d }));
});

afterEach(() => {
  while (montados.length) {
    try { montados.pop().unmount(); } catch { /* ya desmontado */ }
  }
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('ServiciosPanel', () => {
  it('lista los servicios con criticidad, dueño y horario, y el conteo contra el tope de 15', async () => {
    const w = await montar(ServiciosPanel);
    expect(w.find('h2').text()).toContain('Servicios');
    expect(w.find('h2').text()).toContain('2 de 15');
    const items = w.findAll('[data-servicio]');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('Correo corporativo');
    expect(items[0].text()).toContain('Alta');
    expect(items[0].text()).toContain('Dueño: Alejandro Guevara');
    expect(items[0].text()).toContain('Horario: 24 x 7');
    expect(items[1].text()).toContain('Crítica');
    expect(items[1].text()).toContain('Dueño: Sin asignar');
    expect(items[1].text()).toContain('Horario: Sin registrar');
  });

  it('un jefe ve «Nuevo servicio» y las acciones de cada fila', async () => {
    const w = await montar(ServiciosPanel);
    expect(w.findAll('button').some((b) => b.text() === 'Nuevo servicio')).toBe(true);
    expect(w.find('button[aria-label="Acciones de Correo corporativo"]').exists()).toBe(true);
    expect(w.find('[data-solo-jefe]').exists()).toBe(false);
  });

  it('quien no es jefe solo lee: sin crear, editar ni eliminar, y con el aviso', async () => {
    const w = await montar(ServiciosPanel, { rol: 'ASISTENTE' });
    expect(w.findAll('[data-servicio]')).toHaveLength(2);
    expect(w.findAll('button').some((b) => b.text() === 'Nuevo servicio')).toBe(false);
    expect(w.find('button[aria-label^="Acciones de"]').exists()).toBe(false);
    expect(w.find('[data-solo-jefe]').text()).toContain('Solo un jefe');
  });

  it('crear: el identificador sale del nombre y la fila se agrega al catálogo', async () => {
    const w = await montar(ServiciosPanel);
    await w.findAll('button').find((b) => b.text() === 'Nuevo servicio').trigger('click');
    await espera();
    await escribir(campo('Nombre'), '  Cámaras de   seguridad ');
    await escribir(campo('Criticidad'), 'media');
    await escribir(campo('Dueño'), 'u2');
    await escribir(campo('Horario'), '24 x 7');
    botonDeDialogo('Guardar').click();
    await espera(40);
    expect(insforgeApi.createServicio).toHaveBeenCalledTimes(1);
    expect(insforgeApi.createServicio.mock.calls[0][0]).toMatchObject({
      id: 'camaras_de_seguridad', nombre: '  Cámaras de   seguridad ', criticidad: 'media', dueno_user_id: 'u2', horario: '24 x 7',
    });
    await espera(500);
    expect(w.findAll('[data-servicio]')).toHaveLength(3);
  });

  it('un nombre repetido sale en español dentro del formulario', async () => {
    insforgeApi.createServicio.mockRejectedValue({ code: '23505', message: 'duplicate key value violates unique constraint "servicios_nombre_unico"' });
    await montar(ServiciosPanel);
    const nuevo = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Nuevo servicio');
    nuevo.click();
    await espera();
    await escribir(campo('Nombre'), 'ERP');
    botonDeDialogo('Guardar').click();
    await espera(40);
    expect(dialogo().querySelector('[role="alert"]').textContent).toContain('Ya existe un servicio con ese nombre');
  });

  it('si el identificador lo ocupa un servicio dado de baja, reintenta con un sufijo', async () => {
    insforgeApi.createServicio
      .mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "servicios_pkey"' })
      .mockImplementation(async (d) => ({ ...d }));
    await montar(ServiciosPanel);
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Nuevo servicio').click();
    await espera();
    await escribir(campo('Nombre'), 'Telefonía');
    botonDeDialogo('Guardar').click();
    await espera(40);
    expect(insforgeApi.createServicio).toHaveBeenCalledTimes(2);
    expect(insforgeApi.createServicio.mock.calls[0][0].id).toBe('telefonia');
    expect(insforgeApi.createServicio.mock.calls[1][0].id).toMatch(/^telefonia_[a-z0-9]{1,5}$/);
  });

  it('con 15 servicios el botón se deshabilita y lo explica', async () => {
    insforgeApi.listServicios.mockImplementation(async () => Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, nombre: `Servicio ${i}`, criticidad: 'media' })));
    const w = await montar(ServiciosPanel);
    expect(w.findAll('button').find((b) => b.text() === 'Nuevo servicio').attributes('disabled')).toBeDefined();
    expect(w.find('[data-tope]').text()).toContain('15 servicios');
  });

  it('editar manda los datos sin el identificador; eliminar es baja lógica con confirmación', async () => {
    const w = await montar(ServiciosPanel);
    await elegirAccion(w, 'Acciones de ERP', 'Editar');
    expect(campo('Nombre').value).toBe('ERP');
    await escribir(campo('Horario'), 'Lunes a sábado 8:00 a 18:00');
    botonDeDialogo('Guardar').click();
    await espera(40);
    expect(insforgeApi.updateServicio).toHaveBeenCalledWith('erp', expect.objectContaining({ nombre: 'ERP', horario: 'Lunes a sábado 8:00 a 18:00', criticidad: 'critica' }));
    await espera(500);
    expect(w.text()).toContain('Lunes a sábado 8:00 a 18:00');
  });

  it('eliminar pide confirmación y hace baja lógica; el servicio sale de la lista', async () => {
    const w = await montar(ServiciosPanel);
    await elegirAccion(w, 'Acciones de ERP', 'Eliminar');
    expect(document.body.textContent).toContain('¿Eliminar el servicio “ERP”?');
    expect(insforgeApi.softDeleteServicio).not.toHaveBeenCalled();
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Eliminar').click();
    await espera(40);
    expect(insforgeApi.softDeleteServicio).toHaveBeenCalledWith('erp');
    await espera(500);
    expect(w.findAll('[data-servicio]')).toHaveLength(1);
  });

  it('un error de la base al eliminar sale en español, sin tumbar la lista', async () => {
    insforgeApi.softDeleteServicio.mockRejectedValue({ code: '42501', message: 'permission denied' });
    const w = await montar(ServiciosPanel);
    await elegirAccion(w, 'Acciones de ERP', 'Eliminar');
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Eliminar').click();
    await espera(40);
    expect(w.findAll('[data-servicio]')).toHaveLength(2);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('No tiene permiso'), 'error');
  });
});

describe('CategoriasTicketPanel — servicio opcional', () => {
  it('muestra el servicio de cada categoría y ofrece «Sin servicio» + el catálogo', async () => {
    const w = await montar(CategoriasTicketPanel);
    expect(w.text()).toContain('Servicio: Correo corporativo');
    await w.findAll('button').find((b) => b.text() === 'Nueva categoría').trigger('click');
    await espera();
    const select = campo('Servicio de TI');
    expect([...select.options].map((o) => [o.value, o.textContent.trim()])).toEqual([
      ['', 'Sin servicio'], ['correo', 'Correo corporativo'], ['erp', 'ERP'],
    ]);
  });

  it('crear manda el servicio elegido (o null) junto con el nombre', async () => {
    await montar(CategoriasTicketPanel);
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Nueva categoría').click();
    await espera();
    await escribir(campo('Nombre'), 'Telefonía');
    await escribir(campo('Servicio de TI'), 'erp');
    botonDeDialogo('Guardar').click();
    await espera(40);
    expect(insforgeApi.createCategoriaTicket).toHaveBeenCalledWith({ id: 'telefonia', nombre: 'Telefonía', servicio_id: 'erp' });
  });

  it('editar precarga el servicio y lo guarda; vaciarlo lo quita', async () => {
    const w = await montar(CategoriasTicketPanel);
    await elegirAccion(w, 'Acciones de Redes', 'Editar');
    expect(campo('Servicio de TI').value).toBe('correo');
    await escribir(campo('Servicio de TI'), '');
    botonDeDialogo('Guardar').click();
    await espera(40);
    expect(insforgeApi.updateCategoriaTicket).toHaveBeenCalledWith('red', expect.objectContaining({ nombre: 'Redes', servicio_id: '' }));
  });
});
