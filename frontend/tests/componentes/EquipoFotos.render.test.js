// @vitest-environment happy-dom
//
// EquipoFotos.vue — las fotos de un equipo, extraídas de EquipoForm para
// compartirlas con la hoja de vida. Verifica el tope de 4, que se sube cada foto
// comprimida con el id del equipo (el servidor aplica su propio tope), que
// quitar una la borra del almacenamiento y que un fallo llega en español.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EquipoFotos from '../../src/modules/equipos/EquipoFotos.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: { subirFotoEquipo: vi.fn(), eliminarFotoEquipo: vi.fn() },
}));
vi.mock('../../src/core/imagenes.js', () => ({
  comprimirImagen: vi.fn(async (f) => new File(['x'], `c-${f.name}`, { type: 'image/jpeg' })),
}));
import { insforgeApi } from '../../src/api/insforge.js';
import { MAX_FOTOS_EQUIPO } from '../../src/core/dominio-equipos.js';

const foto = (n) => ({ url: `https://f/${n}.jpg`, key: `k${n}` });
const flush = () => new Promise((r) => setTimeout(r, 0));

async function elegir(w, archivos) {
  const entrada = w.find('input[type="file"]');
  Object.defineProperty(entrada.element, 'files', { value: archivos, configurable: true });
  await entrada.trigger('change');
  await flush();
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  insforgeApi.subirFotoEquipo.mockImplementation(async (f) => foto(f.name));
  insforgeApi.eliminarFotoEquipo.mockResolvedValue();
});

describe('EquipoFotos', () => {
  it('el tope es 4 (el mismo que el servidor) y con 4 fotos desaparece "Agregar foto"', () => {
    expect(MAX_FOTOS_EQUIPO).toBe(4);
    const w = mount(EquipoFotos, { props: { modelValue: [foto(1), foto(2), foto(3), foto(4)] } });
    expect(w.findAll('img')).toHaveLength(4);
    expect(w.text()).not.toContain('Agregar foto');
    const w2 = mount(EquipoFotos, { props: { modelValue: [foto(1)] } });
    expect(w2.text()).toContain('Agregar foto');
  });

  it('sube cada foto comprimida con el id del equipo y va emitiendo la lista completa', async () => {
    const w = mount(EquipoFotos, { props: { modelValue: [foto(1)], equipoId: 'q1' } });
    await elegir(w, [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]);
    expect(insforgeApi.subirFotoEquipo).toHaveBeenCalledTimes(2);
    expect(insforgeApi.subirFotoEquipo.mock.calls[0][1]).toBe('q1');
    expect(insforgeApi.subirFotoEquipo.mock.calls[0][0].name).toBe('c-a.jpg');
    const emitidos = w.emitted('update:modelValue');
    expect(emitidos.at(-1)[0].map((f) => f.key)).toEqual(['k1', 'kc-a.jpg', 'kc-b.jpg']);
  });

  it('solo sube las que caben en el tope', async () => {
    const w = mount(EquipoFotos, { props: { modelValue: [foto(1), foto(2), foto(3)] } });
    await elegir(w, [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg')]);
    expect(insforgeApi.subirFotoEquipo).toHaveBeenCalledTimes(1);
  });

  it('quitar una foto emite la lista sin ella y borra el objeto del almacenamiento', async () => {
    const w = mount(EquipoFotos, { props: { modelValue: [foto(1), foto(2)] } });
    await w.findAll('button[aria-label="Quitar foto"]')[0].trigger('click');
    await flush();
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual([foto(2)]);
    expect(insforgeApi.eliminarFotoEquipo).toHaveBeenCalledWith('k1');
  });

  it('un fallo al subir se avisa en español y no emite una foto fantasma', async () => {
    insforgeApi.subirFotoEquipo.mockRejectedValue(Object.assign(new Error('Máximo 4 fotos por equipo. Si acaba de quitar fotos, guarde los cambios antes de agregar otras.'), { code: 'limite_fotos' }));
    const w = mount(EquipoFotos, { props: { modelValue: [], equipoId: 'q1' } });
    await elegir(w, [new File(['a'], 'a.jpg')]);
    expect(w.emitted('error').at(-1)[0]).toContain('Máximo 4 fotos por equipo');
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });
});
