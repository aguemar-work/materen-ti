// @vitest-environment happy-dom
//
// ActaView.vue — acta de entrega / devolución como ruta imprimible
// (`/equipos/:id/acta/:asignacionId?tipo=`). Reemplaza a los tests de
// `construirActa` de las actas viejas (ventana + document.write): fija lo que
// el acta debe seguir diciendo (datos, cláusula, firmas, DNI completo), el QR
// del equipo, el pie, que los botones no salgan en papel, y el flujo de subir
// el acta firmada (PDF directo, foto convertida a PDF, errores en español).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import ActaView from '../../src/modules/equipos/ActaView.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    getEquipo: vi.fn(),
    asignacionesDeEquipo: vi.fn(),
    getEmpleado: vi.fn(),
    listActasEquipo: vi.fn(),
    subirActa: vi.fn(),
    urlActa: vi.fn(),
  },
}));
// La conversión foto → PDF usa canvas y createImageBitmap, que happy-dom no
// trae: se simula la compresión y el documento de jsPDF.
vi.mock('../../src/core/imagenes.js', () => ({
  comprimirImagen: vi.fn(async (f) => new File([new Uint8Array([255, 216, 255])], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })),
  archivoABase64: vi.fn(),
}));
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(opciones) { this.opciones = opciones; globalThis.__pdfOpciones = opciones; }
    addImage() {}
    output() { return new Blob(['%PDF-1.4 falso'], { type: 'application/pdf' }); }
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const EQUIPO = {
  id: 'q1', codigo: 'LAP-001', codigo_almacen: 'AF-00231', serie: 'SN-XYZ', tipo_nombre: 'Laptop', marca: 'Dell',
  modelo: 'Latitude 5420', empresa_nombre: 'Constructora <Nufago>', estado: 'operativo',
  accesorios_lineas: [{ codigo: 'ACC-1', descripcion: 'Cargador', cantidad: 1 }, { descripcion: 'Mouse', cantidad: 2 }],
};
const EMPLEADO = { id: 'e1', nombres: 'Ana', apellidos: 'Quispe', dni: '12345678', cargo: 'Analista', empresa_nombre: 'Constructora Nufago' };
const ABIERTA = { id: 'asig-1', empleado_id: 'e1', ubicacion_id: null, fecha_inicio: '2026-08-30', fecha_fin: null, condicion_entrega: 'Operativo' };
const CERRADA = { ...ABIERTA, fecha_fin: '2026-09-15', condicion_devolucion: 'Con rayones', motivo_cierre: 'baja_empleado' };
const ACTA = { id: 'act-1', asignacionId: 'asig-1', tipo: 'entrega', creadaEn: '2026-08-31T10:00:00Z', firmadoAt: '2026-08-30' };

const flush = () => new Promise((r) => setTimeout(r, 0));

async function montar(url = '/equipos/q1/acta/asig-1?tipo=entrega') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/equipos', component: { template: '<div />' } },
      { path: '/equipos/:id', component: { template: '<div />' } },
      { path: '/equipos/:id/acta/:asignacionId', component: ActaView },
    ],
  });
  router.push(url);
  await router.isReady();
  const w = mount(ActaView, { attachTo: document.body, global: { plugins: [router] } });
  await flush();
  await flush();
  return w;
}

const texto = (w) => w.text().replace(/\s+/g, ' ');

beforeEach(() => {
  vi.clearAllMocks();
  insforgeApi.getEquipo.mockResolvedValue(EQUIPO);
  insforgeApi.asignacionesDeEquipo.mockResolvedValue([ABIERTA]);
  insforgeApi.getEmpleado.mockResolvedValue(EMPLEADO);
  insforgeApi.listActasEquipo.mockResolvedValue([]);
});

describe('ActaView — acta de entrega', () => {
  it('abre con carátula de expediente, datos del receptor y del equipo, y la cláusula', async () => {
    const w = await montar();
    expect(w.find('h1').text()).toBe('Acta de entrega de equipo');
    expect(texto(w.find('[data-caratula]'))).toContain('ACTA DE ENTREGA · EQUIPO LAP-001 · ALMACÉN AF-00231');
    const t = texto(w);
    expect(t).toContain('1. Datos del receptor');
    expect(t).toContain('2. Datos del equipo');
    expect(t).toContain('Ana Quispe');
    expect(t).toContain('Dell Latitude 5420');
    expect(t).toContain('Accesorios entregados');
    expect(t).toMatch(/ACC-1\s*Cargador/);
    expect(t).toMatch(/Mouse\s*×2/);
    expect(t).toContain('me comprometo a');
    expect(t).toContain('30/08/2026');
    w.unmount();
  });

  it('el DNI va COMPLETO (documento legal) y las dos firmas están en su sitio', async () => {
    const w = await montar();
    expect(texto(w)).toContain('12345678');
    expect(texto(w)).not.toContain('****');
    const firmas = w.findAll('.border-t.pt-1\\.5');
    expect(firmas.map((f) => f.text())).toEqual([expect.stringContaining('Entrega — Área de TI'), expect.stringContaining('Recibe conforme')]);
    expect(firmas[1].text()).toContain('DNI: 12345678');
    w.unmount();
  });

  it('lleva el QR del equipo (la URL pública /e/<código>) y el pie del documento', async () => {
    const w = await montar();
    const qr = w.find('svg[data-qr-url]');
    expect(qr.attributes('data-qr-url')).toMatch(/\/e\/LAP-001$/);
    expect(texto(w)).toMatch(/Documento generado por Materen — Sistema TI el \d{2}\/\d{2}\/\d{4} · equipo LAP-001/);
    w.unmount();
  });

  it('escapa el HTML de los datos de negocio (se pinta como texto)', async () => {
    const w = await montar();
    expect(w.html()).toContain('Constructora &lt;Nufago&gt;');
    expect(w.html()).not.toContain('Constructora <Nufago>');
    w.unmount();
  });

  it('sin accesorios dice "Ninguno"', async () => {
    insforgeApi.getEquipo.mockResolvedValue({ ...EQUIPO, accesorios_lineas: [], accesorios: [] });
    const w = await montar();
    expect(texto(w)).toContain('Ninguno');
    w.unmount();
  });

  it('los botones no salen en papel (data-no-print) y Imprimir llama a window.print()', async () => {
    const w = await montar();
    const barra = w.find('[data-no-print]');
    const imprimir = barra.findAll('button').find((b) => b.text() === 'Imprimir / Guardar PDF');
    expect(imprimir).toBeTruthy();
    expect(w.find('[data-acta]').find('[data-no-print]').exists()).toBe(false);
    window.print = vi.fn();
    await imprimir.trigger('click');
    expect(window.print).toHaveBeenCalledTimes(1);
    w.unmount();
  });
});

describe('ActaView — acta de devolución', () => {
  beforeEach(() => insforgeApi.asignacionesDeEquipo.mockResolvedValue([CERRADA]));

  it('suma la sección de la devolución con motivo, condición y fecha', async () => {
    const w = await montar('/equipos/q1/acta/asig-1?tipo=devolucion');
    expect(w.find('h1').text()).toBe('Acta de devolución de equipo');
    const t = texto(w);
    expect(t).toContain('3. Datos de la devolución');
    expect(t).toContain('Con rayones');
    expect(t).toContain('Baja del empleado');
    expect(t).toContain('15/09/2026');
    expect(t).toContain('Accesorios devueltos');
    expect(t).toContain('quedando liberado de la');
    w.unmount();
  });

  it('si el equipo sigue con la persona, no hay devolución que documentar', async () => {
    insforgeApi.asignacionesDeEquipo.mockResolvedValue([ABIERTA]);
    const w = await montar('/equipos/q1/acta/asig-1?tipo=devolucion');
    expect(texto(w)).toContain('No hay acta que mostrar');
    expect(texto(w)).toContain('todavía no hay devolución');
    w.unmount();
  });
});

describe('ActaView — estados de carga', () => {
  it('una asignación inexistente es "no encontrada"', async () => {
    insforgeApi.asignacionesDeEquipo.mockResolvedValue([]);
    const w = await montar();
    expect(texto(w)).toContain('Acta no encontrada');
    w.unmount();
  });

  it('una asignación a una ubicación no tiene acta', async () => {
    insforgeApi.asignacionesDeEquipo.mockResolvedValue([{ ...ABIERTA, empleado_id: null, ubicacion_id: 'ub1' }]);
    const w = await montar();
    expect(texto(w)).toContain('es a una ubicación, no a una persona');
    w.unmount();
  });

  it('un error de red muestra el mensaje y permite reintentar', async () => {
    insforgeApi.getEquipo.mockRejectedValue(Object.assign(new Error('Failed to fetch'), { error: 'NETWORK_ERROR' }));
    const w = await montar();
    expect(texto(w)).toContain('Sin conexión con el servidor.');
    insforgeApi.getEquipo.mockResolvedValue(EQUIPO);
    await w.findAll('button').find((b) => b.text() === 'Reintentar').trigger('click');
    await flush();
    await flush();
    expect(w.find('h1').text()).toBe('Acta de entrega de equipo');
    w.unmount();
  });
});

describe('ActaView — subir el acta firmada', () => {
  async function elegir(w, archivo) {
    const entrada = w.find('input[type="file"]:not([capture])');
    Object.defineProperty(entrada.element, 'files', { value: [archivo], configurable: true });
    await entrada.trigger('change');
    await flush();
    await flush();
  }

  it('sin acta firmada lo dice y ofrece "Subir acta firmada"', async () => {
    const w = await montar();
    expect(texto(w)).toContain('Sin acta firmada');
    expect(w.findAll('button').some((b) => b.text() === 'Subir acta firmada')).toBe(true);
    w.unmount();
  });

  it('un PDF se sube tal cual con la asignación, el tipo y la fecha de firma', async () => {
    insforgeApi.subirActa.mockResolvedValue({ ...ACTA, creadaEn: '2026-09-01T09:00:00Z' });
    const w = await montar();
    await w.find('input[type="date"]').setValue('2026-08-30');
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'firmada.pdf', { type: 'application/pdf' });
    await elegir(w, pdf);
    expect(insforgeApi.subirActa).toHaveBeenCalledWith(expect.objectContaining({
      asignacionId: 'asig-1', tipo: 'entrega', archivo: pdf, firmadoAt: '2026-08-30',
    }));
    expect(texto(w)).toContain('Acta firmada ✓');
    expect(texto(w)).toContain('firmada el 30/08/2026');
    expect(w.findAll('button').some((b) => b.text() === 'Ver acta firmada')).toBe(true);
    w.unmount();
  });

  it('una foto se convierte a PDF en el navegador antes de subir', async () => {
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 3000, height: 2000, close() {} }));
    insforgeApi.subirActa.mockResolvedValue(ACTA);
    const w = await montar();
    await elegir(w, new File([new Uint8Array([255, 216, 255])], 'foto-acta.jpg', { type: 'image/jpeg' }));
    const enviado = insforgeApi.subirActa.mock.calls[0][0].archivo;
    expect(enviado.type).toBe('application/pdf');
    expect(enviado.name).toBe('foto-acta.pdf');
    // Foto apaisada → hoja A4 horizontal.
    expect(globalThis.__pdfOpciones.orientation).toBe('landscape');
    w.unmount();
  });

  it('un archivo que no es PDF ni foto se rechaza sin llamar al servidor', async () => {
    const w = await montar();
    await elegir(w, new File(['hola'], 'nota.txt', { type: 'text/plain' }));
    expect(insforgeApi.subirActa).not.toHaveBeenCalled();
    expect(texto(w)).toContain('PDF o una foto');
    w.unmount();
  });

  it('el rechazo del servidor se muestra en español', async () => {
    insforgeApi.subirActa.mockRejectedValue(Object.assign(new Error('El acta supera el tope de 10 MB. Escanéela con menor resolución.'), { code: 'archivo_muy_grande' }));
    const w = await montar();
    await elegir(w, new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'grande.pdf', { type: 'application/pdf' }));
    expect(w.find('[role="alert"]').text()).toContain('El acta supera el tope de 10 MB');
    w.unmount();
  });

  it('con acta ya subida el botón pasa a "Reemplazar" y "Ver acta firmada" abre la URL firmada', async () => {
    insforgeApi.listActasEquipo.mockResolvedValue([ACTA]);
    insforgeApi.urlActa.mockResolvedValue('https://almacen/firmada.pdf');
    const ventana = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(ventana);
    const w = await montar();
    expect(w.findAll('button').some((b) => b.text() === 'Reemplazar acta firmada')).toBe(true);
    await w.findAll('button').find((b) => b.text() === 'Ver acta firmada').trigger('click');
    await flush();
    // La pestaña se abre en el clic y se redirige cuando llega la URL.
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(insforgeApi.urlActa).toHaveBeenCalledWith('act-1');
    expect(ventana.location.href).toBe('https://almacen/firmada.pdf');
    open.mockRestore();
    w.unmount();
  });
});
