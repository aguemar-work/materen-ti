// useImportacionEquipos: la bandeja de importación migra con las RPC de la
// migración 101 (todo o nada en el servidor), en lugar de crear + asignar +
// mover + cambiar estado + borrar desde el cliente.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/insforge.js', () => ({
  insforgeApi: {
    listTiposEquipo: vi.fn(),
    listUbicaciones: vi.fn(),
    listEmpleados: vi.fn(),
    listEquipos: vi.fn(),
    listImportacionPendiente: vi.fn(),
    updateImportacion: vi.fn(),
    migrarImportacionEquipo: vi.fn(),
    migrarImportacionEquipos: vi.fn(),
  },
}));
vi.mock('../src/core/toast.js', () => ({ showToast: vi.fn() }));
import { insforgeApi } from '../src/api/insforge.js';
import { showToast } from '../src/core/toast.js';
import { useImportacionEquipos } from '../src/modules/equipos/useImportacionEquipos.js';

const fila = (id, extra = {}) => ({
  id, raw: {}, duplicado_kapo: false, codigo: `EQ-${id}`, tipo_id: 'laptop', marca: 'Hp', modelo: 'X', serie: `S${id}`,
  costo: 100, fecha_compra: null, estado: 'operativo', notas: '', modo: 'disponible', empleado_id: null, ubicacion_id: null, ...extra,
});

async function iniciar(filas) {
  insforgeApi.listImportacionPendiente.mockResolvedValue(filas);
  const imp = useImportacionEquipos();
  await imp.iniciar();
  return imp;
}

beforeEach(() => {
  vi.clearAllMocks();
  insforgeApi.listTiposEquipo.mockResolvedValue([{ id: 'laptop', nombre: 'Laptop' }]);
  insforgeApi.listUbicaciones.mockResolvedValue([]);
  insforgeApi.listEmpleados.mockResolvedValue([]);
  insforgeApi.listEquipos.mockResolvedValue([]);
  insforgeApi.updateImportacion.mockResolvedValue();
});

describe('migrar una fila', () => {
  it('llama a migrar_importacion_equipo con las correcciones aún sin autoguardar y la quita de la bandeja', async () => {
    const imp = await iniciar([fila('a'), fila('b')]);
    imp.filas[0].marca = 'Lenovo'; // corrección que el autoguardado de 700 ms no alcanzó a enviar
    insforgeApi.migrarImportacionEquipo.mockResolvedValue({ id: 'nuevo' });
    await imp.migrarFila(imp.filas[0]);
    expect(insforgeApi.migrarImportacionEquipo).toHaveBeenCalledWith('a', expect.objectContaining({ codigo: 'EQ-a', marca: 'Lenovo', modo: 'disponible' }));
    expect(imp.filas.map((f) => f.id)).toEqual(['b']);
    expect(imp.migradosSesion).toBe(1);
  });

  it('un rechazo del servidor queda en la fila, en español, y la fila sigue en la bandeja', async () => {
    const imp = await iniciar([fila('a')]);
    insforgeApi.migrarImportacionEquipo.mockRejectedValue(Object.assign(new Error('Ya existe un equipo con el código EQ-a.'), { code: 'P0001' }));
    await imp.migrarFila(imp.filas[0]);
    expect(imp.filas).toHaveLength(1);
    expect(imp.filas[0]).toMatchObject({ estadoFila: 'error', errorMsg: 'Ya existe un equipo con el código EQ-a.' });
    expect(imp.conErrores).toBe(1);
  });

  it('una fila que no cumple las reglas ni llama al servidor', async () => {
    const imp = await iniciar([fila('a', { codigo: '' }), fila('b', { modo: 'empleado' })]);
    await imp.migrarFila(imp.filas[0]);
    await imp.migrarFila(imp.filas[1]);
    expect(insforgeApi.migrarImportacionEquipo).not.toHaveBeenCalled();
    expect(imp.cantidadParaMigrar).toBe(0);
  });
});

describe('migrar el lote', () => {
  it('manda los ids de las filas listas a migrar_importacion_equipos y las quita si todo salió bien', async () => {
    const imp = await iniciar([fila('a'), fila('b'), fila('c', { codigo: '' })]);
    insforgeApi.migrarImportacionEquipos.mockResolvedValue({ ok: true, migrados: 2, bloqueados: [] });
    await imp.migrarTodasListas();
    expect(insforgeApi.migrarImportacionEquipos).toHaveBeenCalledTimes(1);
    expect(insforgeApi.migrarImportacionEquipos).toHaveBeenCalledWith(['a', 'b']);
    expect(imp.filas.map((f) => f.id)).toEqual(['c']);
    expect(showToast).toHaveBeenCalledWith('2 equipos migrados');
  });

  it('si el servidor bloquea alguna no migra ninguna de la tanda y deja el motivo en cada fila bloqueada', async () => {
    const imp = await iniciar([fila('a'), fila('b')]);
    insforgeApi.migrarImportacionEquipos.mockResolvedValue({
      ok: false,
      migrados: 0,
      bloqueados: [{ id: 'b', codigo: 'EQ-b', motivo: 'Ya existe un equipo con el número de serie SB.' }],
    });
    await imp.migrarTodasListas();
    expect(imp.filas).toHaveLength(2); // ninguna se fue
    expect(imp.filas.find((f) => f.id === 'b')).toMatchObject({ estadoFila: 'error', errorMsg: 'Ya existe un equipo con el número de serie SB.' });
    expect(imp.filas.find((f) => f.id === 'a').estadoFila).toBe('pendiente');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('1 bloqueados'), 'warning');
  });

  it('las filas bloqueadas quedan fuera del siguiente lote hasta que se corrijan', async () => {
    const imp = await iniciar([fila('a'), fila('b')]);
    insforgeApi.migrarImportacionEquipos.mockResolvedValueOnce({ ok: false, migrados: 0, bloqueados: [{ id: 'b', motivo: 'Falta el tipo de equipo.' }] });
    await imp.migrarTodasListas();
    insforgeApi.migrarImportacionEquipos.mockResolvedValueOnce({ ok: true, migrados: 1, bloqueados: [] });
    await imp.migrarTodasListas();
    expect(insforgeApi.migrarImportacionEquipos).toHaveBeenLastCalledWith(['a']);
    // Al corregirla vuelve a poder migrarse en lote.
    imp.marcarSucia(imp.filas[0]);
    expect(imp.filas[0].estadoFila).toBe('pendiente');
  });

  it('parte la bandeja en tandas de 100 (el tope de la RPC)', async () => {
    const filas = Array.from({ length: 230 }, (_, i) => fila(String(i).padStart(3, '0')));
    const imp = await iniciar(filas);
    insforgeApi.migrarImportacionEquipos.mockImplementation(async (ids) => ({ ok: true, migrados: ids.length, bloqueados: [] }));
    await imp.migrarTodasListas();
    expect(insforgeApi.migrarImportacionEquipos.mock.calls.map((c) => c[0].length)).toEqual([100, 100, 30]);
    expect(imp.filas).toHaveLength(0);
  });

  it('un fallo de la llamada (p. ej. sin permiso) marca la tanda con el mensaje traducido', async () => {
    const imp = await iniciar([fila('a')]);
    insforgeApi.migrarImportacionEquipos.mockRejectedValue(Object.assign(new Error('No tiene permiso para esta acción.'), { code: '42501', tipo: 'permiso', original: {} }));
    await imp.migrarTodasListas();
    expect(imp.filas[0]).toMatchObject({ estadoFila: 'error', errorMsg: 'No tiene permiso para esta acción.' });
  });
});
