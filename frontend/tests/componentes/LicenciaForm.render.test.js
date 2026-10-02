// @vitest-environment happy-dom
//
// LicenciaForm.vue partido en LicenciaAccesoCampos / LicenciaCorreoNuevo
// (2026-10-02): el estado del acceso sigue viviendo en el formulario y entra
// por v-model. Estas pruebas fijan el contrato de guardado que no puede
// perderse al partirlo:
//   - alta con correo NUEVO → una sola llamada a la RPC (sin correo huérfano);
//   - alta con correo existente → el insert de siempre;
//   - validación del correo y la plataforma antes de tocar la red;
//   - edición con correo nuevo → se crea el correo y se actualiza la licencia.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LicenciaForm from '../../src/modules/licencias/LicenciaForm.vue';
import LicenciaAccesoCampos from '../../src/modules/licencias/LicenciaAccesoCampos.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listEmpresas: vi.fn(),
    listCorreosCompartidos: vi.fn(),
    listPlataformas: vi.fn(),
    createCorreo: vi.fn(),
    createLicencia: vi.fn(),
    createLicenciaConCuenta: vi.fn(),
    updateLicencia: vi.fn(),
    listLicenciasPage: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));
let wrapper;

async function montar(props = {}) {
  wrapper = mount(LicenciaForm, { props, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

// El estado del acceso lo maneja el formulario; se simula lo que el usuario
// hace en LicenciaAccesoCampos emitiendo sus eventos de v-model.
async function acceso(w, cambios) {
  const hijo = w.findComponent(LicenciaAccesoCampos);
  for (const [clave, valor] of Object.entries(cambios)) hijo.vm.$emit(`update:${clave}`, valor);
  await w.vm.$nextTick();
}

async function escribirSoftware(w, texto) {
  const input = document.body.querySelector('input[placeholder^="ej:"]');
  input.value = texto;
  input.dispatchEvent(new Event('input'));
  await w.vm.$nextTick();
}

async function guardar(w) {
  document.getElementById('lic-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flushPromises();
  return w;
}

const cuerpo = () => document.body.textContent.replace(/\s+/g, ' ');

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listEmpresas.mockResolvedValue([]);
  insforgeApi.listCorreosCompartidos.mockResolvedValue([{ id: 'c10', usuario: 'licencias@materen.pe', plataforma_nombre: 'Office 365' }]);
  insforgeApi.listPlataformas.mockResolvedValue([{ id: 'p1', nombre: 'Gmail' }]);
  insforgeApi.createLicencia.mockResolvedValue('lic-1');
  insforgeApi.createLicenciaConCuenta.mockResolvedValue('lic-2');
  insforgeApi.createCorreo.mockResolvedValue({ id: 'c-nuevo', usuario: 'nuevo@materen.pe' });
  insforgeApi.updateLicencia.mockResolvedValue();
  insforgeApi.listLicenciasPage.mockResolvedValue({ items: [], total: 0 });
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('LicenciaForm — alta con correo nuevo', () => {
  it('crea licencia y correo con UNA llamada a la RPC, sin pasar por createCorreo', async () => {
    const w = await montar();
    await escribirSoftware(w, 'AutoCAD');
    await acceso(w, {
      modo: 'login',
      busqueda: 'Nuevo@Materen.pe',
      registrando: true,
      correoNuevo: { plataforma_id: 'p1', tipo_cuenta: 'reutilizable', password: 'Secreta#1' },
    });
    await guardar(w);

    expect(insforgeApi.createCorreo).not.toHaveBeenCalled();
    expect(insforgeApi.createLicencia).not.toHaveBeenCalled();
    expect(insforgeApi.createLicenciaConCuenta).toHaveBeenCalledTimes(1);
    const [datos, cuenta] = insforgeApi.createLicenciaConCuenta.mock.calls[0];
    expect(datos).toMatchObject({ software: 'AutoCAD', cuenta_id: '' });
    expect(cuenta).toEqual({ plataforma_id: 'p1', usuario: 'Nuevo@Materen.pe', password: 'Secreta#1', tipo_cuenta: 'reutilizable' });
    expect(w.emitted('cerrar')).toBeUndefined(); // el cierre espera la animación de salida
  });

  it('sin plataforma no toca la red y avisa del campo', async () => {
    const w = await montar();
    await escribirSoftware(w, 'AutoCAD');
    await acceso(w, { modo: 'login', busqueda: 'nuevo@materen.pe', registrando: true });
    await guardar(w);

    expect(insforgeApi.createLicenciaConCuenta).not.toHaveBeenCalled();
    expect(cuerpo()).toContain('Seleccione la plataforma del correo nuevo');
  });

  it('un correo mal escrito no se registra', async () => {
    const w = await montar();
    await escribirSoftware(w, 'AutoCAD');
    await acceso(w, { modo: 'login', busqueda: 'sin-arroba', registrando: true });
    await guardar(w);

    expect(insforgeApi.createLicenciaConCuenta).not.toHaveBeenCalled();
    expect(cuerpo()).toContain('Escriba un correo válido para registrarlo');
  });

  it('en modo login sin elegir correo pide seleccionarlo', async () => {
    const w = await montar();
    await escribirSoftware(w, 'AutoCAD');
    await acceso(w, { modo: 'login' });
    await guardar(w);

    expect(insforgeApi.createLicencia).not.toHaveBeenCalled();
    expect(cuerpo()).toContain('Seleccione el correo que da acceso a la licencia');
  });
});

describe('LicenciaForm — otros caminos de guardado', () => {
  it('alta con un correo existente usa el insert directo con cuenta_id', async () => {
    const w = await montar();
    await escribirSoftware(w, 'Office');
    await acceso(w, { modo: 'login', cuentaId: 'c10' });
    await guardar(w);

    expect(insforgeApi.createLicenciaConCuenta).not.toHaveBeenCalled();
    expect(insforgeApi.createLicencia).toHaveBeenCalledWith(expect.objectContaining({ software: 'Office', cuenta_id: 'c10' }));
  });

  it('en edición con correo nuevo crea el correo y actualiza la licencia vinculada', async () => {
    const licencia = {
      id: 'lic-9', software: 'Revit', tipo: 'suscripcion', cantidad: 2, empresa_id: null, proveedor: '',
      fecha_vencimiento: '2027-01-01', renovacion_meses: 12, costo: null, moneda: '', cuenta_id: null,
      tiene_clave: false, notas: '', cuenta_usuario: '',
    };
    const w = await montar({ licencia });
    await acceso(w, {
      modo: 'login',
      busqueda: 'nuevo@materen.pe',
      registrando: true,
      correoNuevo: { plataforma_id: 'p1', tipo_cuenta: 'compartida', password: '' },
    });
    await guardar(w);

    expect(insforgeApi.createLicenciaConCuenta).not.toHaveBeenCalled();
    expect(insforgeApi.createCorreo).toHaveBeenCalledWith({ plataforma_id: 'p1', usuario: 'nuevo@materen.pe', password: '', tipo_cuenta: 'compartida' });
    expect(insforgeApi.updateLicencia).toHaveBeenCalledWith('lic-9', expect.objectContaining({ cuenta_id: 'c-nuevo' }));
  });

  it('sin acceso (modo ninguno) guarda sin cuenta ni clave', async () => {
    const w = await montar();
    await escribirSoftware(w, 'WinRAR');
    await guardar(w);

    expect(insforgeApi.createLicencia).toHaveBeenCalledWith(expect.objectContaining({ software: 'WinRAR', cuenta_id: null, clave: '' }));
  });
});
