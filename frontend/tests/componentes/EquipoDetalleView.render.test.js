// @vitest-environment happy-dom
//
// EquipoDetalleView.vue — la hoja de vida de un equipo (`/equipos/:id`),
// expediente con URL que reemplaza al modal del listado. Se verifica lo que el
// plan §3.3 (pantalla 5) fija: carátula con rótulo de expediente, acción sólida
// única según la situación, línea "en custodia de", sello solo si es terminal,
// kardex con AppLibro y los tres estados de carga (ok, no encontrado, error).
// Mockea solo api/insforge.js; Pinia, router, AppCaratula y AppLibro son reales.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import EquipoDetalleView from '../../src/modules/equipos/EquipoDetalleView.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    getEquipo: vi.fn(),
    eventosEquipo: vi.fn(),
    asignacionesDeEquipo: vi.fn(),
    listActasEquipo: vi.fn(),
    nombresStaff: vi.fn(),
    getEmpleado: vi.fn(),
    listTiposEquipo: vi.fn().mockResolvedValue([]),
    listUbicaciones: vi.fn().mockResolvedValue([]),
    listEmpleados: vi.fn().mockResolvedValue([]),
    verificarEquipo: vi.fn(),
    guardarFotosEquipo: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const BASE = {
  id: 'q1', codigo: 'LAP-001', codigo_almacen: 'AF-00231', serie: '5CD1234XYZ', tipo_nombre: 'Laptop', marca: 'HP',
  modelo: 'ProBook 450 G8', empresa_nombre: 'Materen Constructora', estado: 'operativo', situacion: 'disponible',
  garantia_hasta: '2099-10-05', fotos: [], specs: { Procesador: 'i5-1135G7', RAM: '16 GB' }, notas: '',
  accesorios_lineas: [{ id: 'a1', codigo: 'ACC-0012', descripcion: 'Cargador', cantidad: 1 }],
  empleado_id: null, portador: '', portador_inactivo: false, ubicacion_id: null, ubicacion_nombre: '',
  asignacion_id: null, fecha_asignacion: null,
};
const CON_PORTADOR = {
  ...BASE, situacion: 'asignado', empleado_id: 'e1', portador: 'Rosa Quispe', asignacion_id: 'asig-2', fecha_asignacion: '2025-03-12',
};
const D = (iso) => `${iso}T15:00:00.000Z`;
const EVENTOS = [
  { id: 'v1', evento: 'registrado', detalle: 'Código LAP-001', user_id: null, user_email: null, created_at: D('2025-01-01') },
  { id: 'v2', evento: 'asignado', detalle: 'Entregado a Rosa Quispe — Buen estado', user_id: 'u1', user_email: 'd@m.pe', created_at: D('2025-03-12') },
  { id: 'v3', evento: 'verificado', detalle: 'Verificado físicamente en Sede', user_id: 'u1', user_email: 'd@m.pe', created_at: D('2026-05-01') },
];
const ASIGNACIONES = [
  { id: 'asig-2', empleado_id: 'e1', fecha_inicio: '2025-03-12', fecha_fin: null, created_at: D('2025-03-12'), empleados: { nombres: 'Rosa', apellidos: 'Quispe' } },
];
const ACTA = { id: 'act1', asignacionId: 'asig-2', tipo: 'entrega', creadaEn: D('2025-03-13'), firmadoAt: '2025-03-12' };

function crearRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/equipos', name: 'equipos', component: { template: '<div />' } },
      { path: '/equipos/etiquetas', component: { template: '<div />' } },
      { path: '/equipos/:id', name: 'equipo-detalle', component: EquipoDetalleView },
      { path: '/equipos/:id/acta/:asignacionId', component: { template: '<div />' } },
      { path: '/empleados/:id', component: { template: '<div />' } },
    ],
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function montar(id = 'q1') {
  const router = crearRouter();
  router.push(`/equipos/${id}`);
  await router.isReady();
  const w = mount(EquipoDetalleView, { attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
  await flush();
  await flush();
  return { w, router };
}

const texto = (w) => w.text().replace(/\s+/g, ' ');
const boton = (w, etiqueta) => w.findAll('button, a').find((b) => b.text().trim() === etiqueta);

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.getEquipo.mockResolvedValue(BASE);
  insforgeApi.eventosEquipo.mockResolvedValue(EVENTOS);
  insforgeApi.asignacionesDeEquipo.mockResolvedValue(ASIGNACIONES);
  insforgeApi.listActasEquipo.mockResolvedValue([ACTA]);
  insforgeApi.nombresStaff.mockResolvedValue([{ user_id: 'u1', nombre: 'Diego Huamán Rojas' }]);
  insforgeApi.getEmpleado.mockResolvedValue({ id: 'e1', dni: '45678912' });
  insforgeApi.listTiposEquipo.mockResolvedValue([]);
});

describe('EquipoDetalleView — equipo libre', () => {
  it('abre con la carátula del expediente: rótulo, título y datos', async () => {
    const { w } = await montar();
    expect(w.find('h1').text()).toBe('Laptop HP ProBook 450 G8');
    const rotulo = texto(w.find('[data-caratula]'));
    expect(rotulo).toContain('EQUIPO · LAP-001');
    expect(rotulo).toContain('ALMACÉN AF-00231');
    expect(rotulo).toContain('SERIE 5CD1234XYZ');
    for (const par of ['Empresa', 'Tipo', 'Garantía', 'Estado', 'Situación']) expect(rotulo).toContain(par);
    expect(rotulo).toContain('Materen Constructora');
    expect(rotulo).toContain('Operativo');
    expect(rotulo).toContain('Libre, sin ubicación');
    w.unmount();
  });

  it('la acción sólida es Entregar (y no hay Devolver ni acta)', async () => {
    const { w } = await montar();
    const entregar = boton(w, 'Entregar');
    expect(entregar).toBeTruthy();
    expect(entregar.attributes('class')).toContain('bg-primary-500');
    expect(boton(w, 'Devolver')).toBeUndefined();
    expect(boton(w, 'Acta')).toBeUndefined();
    // Una sola acción sólida en la carátula.
    expect(w.find('[data-caratula]').findAll('button').filter((b) => b.attributes('class').includes('bg-primary-500'))).toHaveLength(1);
    w.unmount();
  });

  it('sin estado terminal no hay sello', async () => {
    const { w } = await montar();
    expect(w.find('[data-sello]').exists()).toBe(false);
    w.unmount();
  });

  it('muestra especificaciones, accesorios y el kardex con su actor', async () => {
    const { w } = await montar();
    const t = texto(w);
    expect(t).toContain('i5-1135G7');
    expect(t).toContain('ACC-0012');
    expect(t).toContain('Cargador');
    const filas = w.findAll('[data-libro] tbody tr');
    expect(filas).toHaveLength(3);
    expect(filas[0].text()).toContain('Verificado');
    expect(filas[0].text()).toContain('Diego Huamán');
    expect(filas[2].text()).toContain('no registrado (legado)');
    w.unmount();
  });
});

describe('EquipoDetalleView — con portador', () => {
  beforeEach(() => insforgeApi.getEquipo.mockResolvedValue(CON_PORTADOR));

  it('dice quién lo tiene, desde cuándo y si el acta está firmada, con enlace al expediente', async () => {
    const { w } = await montar();
    const car = w.find('[data-caratula]');
    const enlace = car.find('a[href="/empleados/e1"]');
    expect(enlace.text()).toContain('Rosa Quispe');
    const t = texto(car);
    expect(t).toContain('En custodia de');
    expect(t).toContain('desde 12/03/2025');
    expect(t).toContain('acta de entrega firmada ✓');
    w.unmount();
  });

  it('la acción sólida pasa a ser Devolver y aparece el botón Acta hacia la ruta imprimible', async () => {
    const { w } = await montar();
    expect(boton(w, 'Devolver').attributes('class')).toContain('bg-primary-500');
    expect(boton(w, 'Entregar')).toBeUndefined();
    expect(boton(w, 'Acta').attributes('href')).toBe('/equipos/q1/acta/asig-2?tipo=entrega');
    w.unmount();
  });

  it('el DNI del portador solo aparece enmascarado (y solo en papel)', async () => {
    const { w } = await montar();
    const t = w.html();
    expect(t).toContain('DNI ****8912');
    expect(t).not.toContain('45678912');
    w.unmount();
  });

  it('el kardex enlaza la entrega con su acta firmada', async () => {
    const { w } = await montar();
    const enlace = w.find('[data-libro] a[href="/equipos/q1/acta/asig-2?tipo=entrega"]');
    expect(enlace.text()).toBe('Acta firmada');
    w.unmount();
  });

  it('sin acta firmada lo dice y el kardex ofrece el acta sin firmar', async () => {
    insforgeApi.listActasEquipo.mockResolvedValue([]);
    const { w } = await montar();
    expect(texto(w.find('[data-caratula]'))).toContain('acta de entrega sin firmar');
    expect(w.find('[data-libro] a[href="/equipos/q1/acta/asig-2?tipo=entrega"]').text()).toBe('Acta');
    w.unmount();
  });

  it('si las actas no se pueden leer, la hoja y el kardex se muestran igual', async () => {
    insforgeApi.listActasEquipo.mockRejectedValue(new Error('relation "actas" does not exist'));
    const { w } = await montar();
    expect(w.findAll('[data-libro] tbody tr')).toHaveLength(3);
    w.unmount();
  });
});

describe('EquipoDetalleView — estado terminal', () => {
  it('un equipo de baja lleva sello DE BAJA y la acción sólida es Reactivar', async () => {
    insforgeApi.getEquipo.mockResolvedValue({ ...BASE, estado: 'de_baja', situacion: 'de_baja' });
    const { w } = await montar();
    expect(w.find('[data-sello]').text()).toBe('De baja');
    expect(boton(w, 'Reactivar equipo')).toBeTruthy();
    expect(boton(w, 'Entregar')).toBeUndefined();
    w.unmount();
  });

  it('un equipo perdido lleva sello en tono crítico', async () => {
    insforgeApi.getEquipo.mockResolvedValue({ ...BASE, estado: 'perdido', situacion: 'perdido' });
    const { w } = await montar();
    const sello = w.find('[data-sello]');
    expect(sello.text()).toBe('Perdido o robado');
    expect(sello.attributes('class')).toContain('border-red-700');
    w.unmount();
  });
});

describe('EquipoDetalleView — errores honestos', () => {
  it('equipo inexistente: "no encontrado", distinto de un error, con reintento', async () => {
    insforgeApi.getEquipo.mockResolvedValue(null);
    const { w } = await montar('no-existe');
    expect(texto(w)).toContain('Equipo no encontrado');
    expect(texto(w)).not.toContain('No se pudo cargar el equipo');
    expect(boton(w, 'Reintentar')).toBeTruthy();
    expect(w.find('[data-caratula]').exists()).toBe(false);
    // Reintentar vuelve a consultar y, si ahora existe, abre la hoja.
    insforgeApi.getEquipo.mockResolvedValue(BASE);
    await boton(w, 'Reintentar').trigger('click');
    await flush();
    await flush();
    expect(w.find('h1').text()).toBe('Laptop HP ProBook 450 G8');
    w.unmount();
  });

  it('error de red: mensaje del error (no "no encontrado") y reintento', async () => {
    insforgeApi.getEquipo.mockRejectedValue(Object.assign(new Error('Failed to fetch'), { error: 'NETWORK_ERROR' }));
    const { w } = await montar();
    const t = texto(w);
    expect(t).toContain('Sin conexión con el servidor.');
    expect(t).not.toContain('Equipo no encontrado');
    expect(boton(w, 'Reintentar')).toBeTruthy();
    w.unmount();
  });

  it('si el kardex falla, la hoja queda y la sección ofrece reintentar', async () => {
    insforgeApi.eventosEquipo.mockRejectedValue(Object.assign(new Error('Failed to fetch'), { error: 'NETWORK_ERROR' }));
    const { w } = await montar();
    expect(w.find('h1').exists()).toBe(true);
    expect(texto(w)).toContain('Sin conexión con el servidor.');
    insforgeApi.eventosEquipo.mockResolvedValue(EVENTOS);
    const reintentar = w.findAll('button').find((b) => b.text() === 'Reintentar');
    await reintentar.trigger('click');
    await flush();
    await flush();
    expect(w.findAll('[data-libro] tbody tr')).toHaveLength(3);
    w.unmount();
  });
});

describe('EquipoDetalleView — acciones rápidas en móvil', () => {
  it('Verificar abre el diálogo con nota opcional y ubicación, y llama a verificar_equipo', async () => {
    insforgeApi.verificarEquipo.mockResolvedValue({});
    const { w } = await montar();
    await w.vm.acciones.abrirVerificar(BASE);
    await flush();
    w.vm.acciones.form.nota = 'conforme';
    await w.vm.acciones.confirmarVerificar();
    await flush();
    expect(insforgeApi.verificarEquipo).toHaveBeenCalledWith('q1', { ubicacionId: '', nota: 'conforme' });
    w.unmount();
  });

  it('con portador ofrece adjuntar el acta con la cámara; sin portador no', async () => {
    const libre = (await montar()).w;
    expect(libre.find('input[capture="environment"]').exists()).toBe(true); // el input existe pero el botón no
    expect(libre.findAll('button').some((b) => b.text() === 'Adjuntar acta')).toBe(false);
    libre.unmount();
    insforgeApi.getEquipo.mockResolvedValue(CON_PORTADOR);
    const { w } = await montar();
    expect(w.findAll('button').some((b) => b.text() === 'Adjuntar acta')).toBe(true);
    w.unmount();
  });
});
