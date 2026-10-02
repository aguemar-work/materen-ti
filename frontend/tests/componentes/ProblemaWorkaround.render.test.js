// @vitest-environment happy-dom
//
// Workaround y error conocido de un problema (KEDB, migración 106), montado de
// verdad con el store del detalle real. Solo api/insforge.js está mockeado.
// Se verifica lo que el servidor haría de otra forma: el botón de publicar solo
// se ofrece con los módulos problemas y base_conocimiento, exige workaround, y
// el aviso depende de quién publicó (jefe publica; otro rol deja en revisión).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ProblemaWorkaround from '../../src/modules/problemas/ProblemaWorkaround.vue';
import { useAuthStore } from '../../src/stores/auth.js';
import { useProblemaDetalleStore } from '../../src/stores/problemaDetalle.js';
import { toasts } from '../../src/core/toast.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    publicarWorkaroundProblema: vi.fn(),
    actualizarProblema: vi.fn(),
    getProblema: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const PROBLEMA = (extra = {}) => ({
  id: 'p1', titulo: 'Caídas de internet', severidad: 'alta', estado: 'diagnostico', descripcion: 'd', causa_raiz: '',
  workaround: '', error_conocido: false, kb_articulo_id: null, ...extra,
});

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar({ problema = PROBLEMA(), rol = 'JEFE', modulos = ['problemas', 'base_conocimiento'] } = {}) {
  const auth = useAuthStore();
  auth.rol = rol;
  auth.modulosVisibles = modulos;
  useProblemaDetalleStore().problema = problema;
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:resto(.*)*', component: { template: '<div />' } }] });
  router.push('/');
  await router.isReady();
  wrapper = mount(ProblemaWorkaround, { attachTo: document.body, global: { plugins: [router] } });
  await espera();
  return wrapper;
}

const boton = (w, texto) => w.findAll('button').find((b) => b.text().includes(texto));
const ultimoToast = () => toasts.at(-1);

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  toasts.length = 0;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('ProblemaWorkaround — lectura', () => {
  it('sin workaround dice que falta y no deja publicar', async () => {
    const w = await montar();
    expect(w.text()).toContain('Todavía sin workaround documentado.');
    const publicar = boton(w, 'Publicar workaround en la base de conocimiento');
    expect(publicar.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('Escriba el workaround para poder publicarlo.');
  });

  it('con workaround conserva los saltos de línea y habilita publicar', async () => {
    const w = await montar({ problema: PROBLEMA({ workaround: 'Paso 1\nPaso 2' }) });
    const p = w.find('p.whitespace-pre-wrap');
    expect(p.text()).toBe('Paso 1\nPaso 2');
    expect(boton(w, 'Publicar workaround en la base de conocimiento').attributes('disabled')).toBeUndefined();
  });

  it('un error conocido con artículo publicado enlaza al artículo y recuerda la regla de cierre', async () => {
    const w = await montar({ problema: PROBLEMA({ workaround: 'Reiniciar', error_conocido: true, kb_articulo_id: 'k9' }) });
    expect(w.text()).toContain('no se puede cerrar sin workaround ni causa raíz');
    const enlace = w.find('a[href="/base-conocimiento/k9"]');
    expect(enlace.exists()).toBe(true);
    expect(enlace.text()).toContain('Ver el artículo');
  });

  it('sin el módulo base_conocimiento no se ofrece publicar (el servidor respondería 42501) pero el enlace sí se muestra', async () => {
    const w = await montar({ rol: 'ASISTENTE', modulos: ['problemas'], problema: PROBLEMA({ workaround: 'Reiniciar', kb_articulo_id: 'k9' }) });
    expect(boton(w, 'Publicar workaround')).toBeUndefined();
    expect(w.find('a[href="/base-conocimiento/k9"]').exists()).toBe(true);
  });

  it('un asistente con ambos módulos sí ve el botón', async () => {
    const w = await montar({ rol: 'ASISTENTE', modulos: ['problemas', 'base_conocimiento'], problema: PROBLEMA({ workaround: 'x' }) });
    expect(boton(w, 'Publicar workaround')).toBeDefined();
  });
});

describe('ProblemaWorkaround — publicar', () => {
  it('un jefe publica: llama a la RPC, recarga el problema y avisa que quedó publicado', async () => {
    insforgeApi.publicarWorkaroundProblema.mockResolvedValue({ id: 'k1', estado: 'publicado' });
    insforgeApi.getProblema.mockResolvedValue(PROBLEMA({ workaround: 'Reiniciar', error_conocido: true, kb_articulo_id: 'k1' }));
    const w = await montar({ problema: PROBLEMA({ workaround: 'Reiniciar' }) });
    await boton(w, 'Publicar workaround').trigger('click');
    await espera(); await espera();
    expect(insforgeApi.publicarWorkaroundProblema).toHaveBeenCalledWith('p1', {});
    expect(ultimoToast()).toMatchObject({ msg: 'Workaround publicado en la base de conocimiento', tipo: 'success' });
    expect(w.find('a[href="/base-conocimiento/k1"]').exists()).toBe(true);
  });

  it('si el artículo quedó en revisión lo dice (otro rol no publica)', async () => {
    insforgeApi.publicarWorkaroundProblema.mockResolvedValue({ id: 'k1', estado: 'en_revision' });
    insforgeApi.getProblema.mockResolvedValue(PROBLEMA({ workaround: 'Reiniciar', error_conocido: true, kb_articulo_id: 'k1' }));
    const w = await montar({ rol: 'ASISTENTE', problema: PROBLEMA({ workaround: 'Reiniciar' }) });
    await boton(w, 'Publicar workaround').trigger('click');
    await espera(); await espera();
    expect(ultimoToast().msg).toContain('enviado a revisión');
  });

  it('un rechazo del servidor sale traducido y el problema no cambia', async () => {
    insforgeApi.publicarWorkaroundProblema.mockRejectedValue({ code: '42501', message: 'No autorizado' });
    const w = await montar({ problema: PROBLEMA({ workaround: 'Reiniciar' }) });
    await boton(w, 'Publicar workaround').trigger('click');
    await espera(); await espera();
    expect(ultimoToast()).toMatchObject({ msg: 'No tiene permiso para esta acción.', tipo: 'error' });
    expect(insforgeApi.getProblema).not.toHaveBeenCalled();
  });
});

describe('ProblemaWorkaround — edición', () => {
  it('guarda el workaround recortado y la bandera de error conocido', async () => {
    insforgeApi.actualizarProblema.mockResolvedValue(PROBLEMA({ workaround: 'Reiniciar', error_conocido: true }));
    const w = await montar();
    await boton(w, 'Editar workaround').trigger('click');
    const area = w.find('textarea');
    expect(area.attributes('maxlength')).toBe('5000');
    await area.setValue('  Reiniciar el router  ');
    await w.find('input[type="checkbox"]').setValue(true);
    await w.find('form').trigger('submit');
    await espera(); await espera();
    expect(insforgeApi.actualizarProblema).toHaveBeenCalledWith('p1', { workaround: 'Reiniciar el router', error_conocido: true });
    expect(ultimoToast().msg).toBe('Workaround guardado');
    expect(w.find('textarea').exists()).toBe(false);
  });

  it('un workaround vacío viaja como null', async () => {
    insforgeApi.actualizarProblema.mockResolvedValue(PROBLEMA());
    const w = await montar({ problema: PROBLEMA({ workaround: 'Antes' }) });
    await boton(w, 'Editar workaround').trigger('click');
    await w.find('textarea').setValue('   ');
    await w.find('form').trigger('submit');
    await espera(); await espera();
    expect(insforgeApi.actualizarProblema).toHaveBeenCalledWith('p1', { workaround: null, error_conocido: false });
  });

  it('el rechazo del trigger (P0001) se muestra tal cual, en español, y la edición sigue abierta', async () => {
    insforgeApi.actualizarProblema.mockRejectedValue({
      code: 'P0001',
      message: 'No se puede cerrar el problema: es un error conocido y necesita un workaround o una causa raíz documentada.',
    });
    const w = await montar();
    await boton(w, 'Editar workaround').trigger('click');
    await w.find('form').trigger('submit');
    await espera(); await espera();
    expect(ultimoToast()).toMatchObject({ tipo: 'error' });
    expect(ultimoToast().msg).toContain('es un error conocido');
    expect(w.find('textarea').exists()).toBe(true);
  });

  it('Cancelar descarta los cambios sin llamar al servidor', async () => {
    const w = await montar({ problema: PROBLEMA({ workaround: 'Original' }) });
    await boton(w, 'Editar workaround').trigger('click');
    await w.find('textarea').setValue('Cambiado');
    await boton(w, 'Cancelar').trigger('click');
    expect(insforgeApi.actualizarProblema).not.toHaveBeenCalled();
    expect(w.text()).toContain('Original');
  });
});
