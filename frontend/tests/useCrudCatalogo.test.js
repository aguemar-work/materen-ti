// Plomería compartida por las pantallas de catálogo (Áreas/Obras,
// Ubicaciones, Tipos de equipo). Se ejercita fuera de un componente: lo
// único que eso deja afuera es el `onMounted` (la carga inicial), todo el
// resto —abrir, guardar, eliminar— es lógica pura de refs.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia, defineStore } from 'pinia';
import { useCrudCatalogo } from '../src/composables/useCrudCatalogo.js';

// onMounted fuera de un componente avisa por consola; es esperado acá.
beforeEach(() => {
  setActivePinia(createPinia());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const llamadas = [];

const useStoreFalso = defineStore('catalogo-falso', {
  state: () => ({ lista: [{ id: '1', nombre: 'Sede Central' }], cargando: false }),
  actions: {
    async cargar() {
      llamadas.push(['cargar']);
    },
    async actualizar(id, datos) {
      llamadas.push(['actualizar', id, datos]);
    },
    async softDelete(id) {
      llamadas.push(['softDelete', id]);
    },
  },
});

function montar(opciones = {}) {
  llamadas.length = 0;
  const store = useStoreFalso();
  const crud = useCrudCatalogo(store, {
    formVacio: () => ({ nombre: '', descripcion: '' }),
    aForm: (i) => ({ nombre: i.nombre, descripcion: i.descripcion || '' }),
    crear: (f) => {
      llamadas.push(['crear', { ...f }]);
      return Promise.resolve();
    },
    textos: { creado: 'Creado', actualizado: 'Actualizado', eliminado: 'Eliminado', errorCargar: 'Error' },
    ...opciones,
  });
  return { store, crud };
}

describe('useCrudCatalogo', () => {
  it('abrirNueva() deja el form en blanco y sin item en edición', () => {
    const { crud } = montar();
    crud.form.value = { nombre: 'sucio', descripcion: 'sucio' };
    crud.errorForm.value = 'viejo';

    crud.abrirNueva();

    expect(crud.editar.value).toBeNull();
    expect(crud.esEdicion.value).toBe(false);
    expect(crud.form.value).toEqual({ nombre: '', descripcion: '' });
    expect(crud.errorForm.value).toBe('');
    expect(crud.mostrarForm.value).toBe(true);
  });

  it('abrirEditar() llena el form con aForm()', () => {
    const { crud } = montar();
    crud.abrirEditar({ id: '9', nombre: 'Almacén', descripcion: null });

    expect(crud.esEdicion.value).toBe(true);
    expect(crud.form.value).toEqual({ nombre: 'Almacén', descripcion: '' });
  });

  it('guardar() en alta llama a crear(), no a actualizar()', async () => {
    const { crud } = montar();
    crud.abrirNueva();
    crud.form.value.nombre = 'Obra Norte';

    await crud.guardar();

    expect(llamadas).toEqual([['crear', { nombre: 'Obra Norte', descripcion: '' }]]);
    expect(crud.guardando.value).toBe(false);
  });

  it('guardar() en edición usa el actualizar del store con el id correcto', async () => {
    const { crud } = montar();
    crud.abrirEditar({ id: '9', nombre: 'Almacén' });
    crud.form.value.nombre = 'Almacén TI';

    await crud.guardar();

    expect(llamadas).toEqual([['actualizar', '9', { nombre: 'Almacén TI', descripcion: '' }]]);
  });

  it('`actualizar` propio pisa al del store (Tipos de equipo transforma el form)', async () => {
    const propio = vi.fn().mockResolvedValue(undefined);
    const { crud } = montar({ actualizar: propio });
    crud.abrirEditar({ id: '9', nombre: 'Laptop' });

    await crud.guardar();

    expect(propio).toHaveBeenCalledWith('9', { nombre: 'Laptop', descripcion: '' });
    expect(llamadas).toEqual([]); // el del store no se tocó
  });

  it('un error al guardar queda en errorForm y libera el botón', async () => {
    const { crud } = montar({ crear: () => Promise.reject(new Error('duplicate key')) });
    crud.abrirNueva();

    await crud.guardar();

    expect(crud.errorForm.value).toBe('duplicate key');
    expect(crud.guardando.value).toBe(false);
    expect(crud.mostrarForm.value).toBe(true); // no se cierra si falló
  });

  it('mensajeErrorGuardar() traduce el error conocido y deja pasar el resto', async () => {
    const traducir = (e) => (e?.message?.includes('duplicate') ? 'Ya existe un tipo con ese nombre' : undefined);

    const a = montar({ crear: () => Promise.reject(new Error('duplicate key')), mensajeErrorGuardar: traducir });
    a.crud.abrirNueva();
    await a.crud.guardar();
    expect(a.crud.errorForm.value).toBe('Ya existe un tipo con ese nombre');

    const b = montar({ crear: () => Promise.reject(new Error('otra cosa')), mensajeErrorGuardar: traducir });
    b.crud.abrirNueva();
    await b.crud.guardar();
    expect(b.crud.errorForm.value).toBe('otra cosa');
  });

  it('confirmarEliminar() borra y dispara el efecto posterior', async () => {
    const despues = vi.fn();
    const { crud } = montar({ despuesDeEliminar: despues });
    crud.porEliminar.value = { id: '1', nombre: 'Sede Central' };

    await crud.confirmarEliminar();

    expect(llamadas).toEqual([['softDelete', '1']]);
    expect(despues).toHaveBeenCalledWith({ id: '1', nombre: 'Sede Central' });
    expect(crud.eliminando.value).toBe(false);
  });

  it('confirmarEliminar() sin nada seleccionado no hace nada', async () => {
    const { crud } = montar();
    await crud.confirmarEliminar();
    expect(llamadas).toEqual([]);
  });

  it('la tabla arranca ordenada y paginada sobre la lista del store', () => {
    const { crud } = montar();
    expect(crud.listaPaginada.value).toEqual([{ id: '1', nombre: 'Sede Central' }]);
    expect(crud.totalItems.value).toBe(1);
    expect(crud.paginaActual.value).toBe(1);
  });
});
