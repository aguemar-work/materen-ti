// api/domains/equipos.js tras la migración 101 (RPC transaccionales) y la 110
// (actas firmadas): cada acción es UNA llamada `rpc(nombre, {argumentos
// nombrados})`, un rechazo del servidor llega traducido al español (42501 → sin
// permiso; P0001 pasa tal cual) y las lecturas nuevas (getEquipo, actas) tienen
// la forma que espera la hoja de vida.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
let respuestaConsulta = { data: null, error: null };
const consultas = [];

// Query builder mínimo: registra la cadena y se resuelve (thenable) con
// `respuestaConsulta`.
function consulta(tabla) {
  const q = { tabla, pasos: [] };
  const b = new Proxy({}, {
    get(_, nombre) {
      if (nombre === 'then') {
        return (resolver, rechazar) => {
          consultas.push(q);
          return Promise.resolve(respuestaConsulta).then(resolver, rechazar);
        };
      }
      return (...args) => { q.pasos.push([nombre, ...args]); return b; };
    },
  });
  return b;
}

vi.mock('../src/api/client.js', () => ({
  getClient: () => ({ database: { rpc, from: consulta }, functions: { invoke } }),
}));

const { equiposApi } = await import('../src/api/domains/equipos.js');

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const paso = (q, nombre) => q.pasos.find((p) => p[0] === nombre);

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  consultas.length = 0;
  respuestaConsulta = { data: null, error: null };
});

describe('RPC de equipos (migración 101): argumentos nombrados', () => {
  it('asignarEquipo → asignar_equipo con p_equipo_id, p_empleado_id y p_condicion_entrega', async () => {
    rpc.mockResolvedValue({ data: { id: 'asig-1' }, error: null });
    const r = await equiposApi.asignarEquipo(U(1), U(2), '  con cargador  ');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('asignar_equipo', {
      p_equipo_id: U(1),
      p_empleado_id: U(2),
      p_condicion_entrega: 'con cargador',
    });
    // Devuelve la asignación creada: su id es lo que necesita el acta.
    expect(r).toEqual({ id: 'asig-1' });
  });

  it('una condición vacía viaja como null (no como cadena vacía)', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await equiposApi.asignarEquipo(U(1), U(2), '   ');
    expect(rpc.mock.calls[0][1].p_condicion_entrega).toBeNull();
  });

  it('devolverEquipo → devolver_equipo (el equipoId de la firma ya no viaja)', async () => {
    rpc.mockResolvedValue({ data: { id: U(1), estado: 'en_reparacion' }, error: null });
    const r = await equiposApi.devolverEquipo(U(3), U(1), { condicion: 'pantalla rota', motivo: 'cambio_equipo', aReparacion: true });
    expect(rpc).toHaveBeenCalledWith('devolver_equipo', {
      p_asignacion_id: U(3),
      p_condicion: 'pantalla rota',
      p_motivo: 'cambio_equipo',
      p_a_reparacion: true,
    });
    expect(r.estado).toBe('en_reparacion');
  });

  it('devolverEquipo sin motivo usa "devolucion" y sin reparación manda false', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await equiposApi.devolverEquipo(U(3), U(1), { condicion: 'operativo' });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_motivo: 'devolucion', p_a_reparacion: false });
  });

  it('moverEquipo → mover_equipo', async () => {
    rpc.mockResolvedValue({ data: { id: 'asig-2' }, error: null });
    await equiposApi.moverEquipo(U(1), U(4));
    expect(rpc).toHaveBeenCalledWith('mover_equipo', { p_equipo_id: U(1), p_ubicacion_id: U(4) });
  });

  it('verificarEquipo → verificar_equipo con ubicación y nota opcionales', async () => {
    rpc.mockResolvedValue({ data: { evento: 'verificado' }, error: null });
    await equiposApi.verificarEquipo(U(1), { ubicacionId: U(4), nota: ' conforme ' });
    expect(rpc).toHaveBeenCalledWith('verificar_equipo', { p_equipo_id: U(1), p_ubicacion_id: U(4), p_nota: 'conforme' });
    await equiposApi.verificarEquipo(U(1));
    expect(rpc).toHaveBeenLastCalledWith('verificar_equipo', { p_equipo_id: U(1), p_ubicacion_id: null, p_nota: null });
  });

  it('migrarImportacionEquipo / migrarImportacionEquipos', async () => {
    const { equiposImportacionApi } = await import('../src/api/domains/equiposImportacion.js');
    rpc.mockResolvedValue({ data: { id: U(9) }, error: null });
    await equiposImportacionApi.migrarImportacionEquipo(U(5), { codigo: 'LAP-9' });
    expect(rpc).toHaveBeenCalledWith('migrar_importacion_equipo', { p_fila_id: U(5), p_datos: { codigo: 'LAP-9' } });

    rpc.mockResolvedValue({ data: { ok: true, migrados: 2, bloqueados: [] }, error: null });
    const r = await equiposImportacionApi.migrarImportacionEquipos([U(5), U(6)]);
    expect(rpc).toHaveBeenLastCalledWith('migrar_importacion_equipos', { p_fila_ids: [U(5), U(6)] });
    expect(r.migrados).toBe(2);
  });
});

describe('errores del servidor traducidos', () => {
  it('42501 (sin permiso sobre el módulo) llega como mensaje en español, con su código', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'No autorizado' } });
    await expect(equiposApi.asignarEquipo(U(1), U(2), '')).rejects.toMatchObject({
      message: 'No tiene permiso para esta acción.',
      code: '42501',
      tipo: 'permiso',
    });
  });

  it('P0001 (rechazo de negocio) conserva el mensaje en español del servidor', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'El equipo LAP-001 ya tiene un portador activo. Registre la devolución antes de reasignar.' },
    });
    await expect(equiposApi.asignarEquipo(U(1), U(2), '')).rejects.toMatchObject({
      message: 'El equipo LAP-001 ya tiene un portador activo. Registre la devolución antes de reasignar.',
      tipo: 'validacion',
    });
  });

  it('la misma traducción rige para devolver, mover y verificar', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'No autorizado' } });
    for (const llamada of [
      () => equiposApi.devolverEquipo(U(3), U(1), { condicion: 'x' }),
      () => equiposApi.moverEquipo(U(1), U(4)),
      () => equiposApi.verificarEquipo(U(1)),
    ]) {
      await expect(llamada()).rejects.toMatchObject({ message: 'No tiene permiso para esta acción.' });
    }
  });
});

describe('lecturas de la hoja de vida', () => {
  it('getEquipo devuelve null cuando no existe (distinto de un error de red)', async () => {
    respuestaConsulta = { data: null, error: null };
    await expect(equiposApi.getEquipo(U(1))).resolves.toBeNull();
    const q = consultas[0];
    expect(q.tabla).toBe('equipos');
    expect(paso(q, 'eq')).toEqual(['eq', 'id', U(1)]);
    expect(paso(q, 'is')).toEqual(['is', 'deleted_at', null]);
  });

  it('getEquipo propaga el error cuando la consulta falla', async () => {
    respuestaConsulta = { data: null, error: { message: 'Failed to fetch' } };
    await expect(equiposApi.getEquipo(U(1))).rejects.toMatchObject({ message: 'Failed to fetch' });
  });

  it('getEquipo mapea la fila al mismo shape del listado (portador, situación, accesorios)', async () => {
    respuestaConsulta = {
      data: {
        id: U(1), codigo: 'LAP-001', estado: 'operativo', tipo_id: 'laptop', tipos_equipo: { nombre: 'Laptop' },
        asignaciones_equipo: [{ id: U(7), fecha_fin: null, fecha_inicio: '2026-03-12', empleado_id: U(2), empleados: { nombres: 'Rosa', apellidos: 'Quispe', estado: 'Activo' } }],
        equipo_accesorios: [{ id: 'a1', descripcion: 'Cargador', cantidad: 1, orden: 0 }],
      },
      error: null,
    };
    const eq = await equiposApi.getEquipo(U(1));
    expect(eq).toMatchObject({
      codigo: 'LAP-001', tipo_nombre: 'Laptop', situacion: 'asignado', portador: 'Rosa Quispe',
      asignacion_id: U(7), empleado_id: U(2), fecha_asignacion: '2026-03-12',
    });
    expect(eq.accesorios_lineas).toHaveLength(1);
  });

  it('buscarEquipoPorCodigo normaliza a mayúsculas y devuelve null sin coincidencia', async () => {
    respuestaConsulta = { data: null, error: null };
    await expect(equiposApi.buscarEquipoPorCodigo(' lap-0142 ')).resolves.toBeNull();
    expect(paso(consultas[0], 'eq')).toEqual(['eq', 'codigo', 'LAP-0142']);
    consultas.length = 0;
    await expect(equiposApi.buscarEquipoPorCodigo('   ')).resolves.toBeNull();
    expect(consultas).toHaveLength(0); // un código vacío ni consulta
  });

  it('listEquiposPorIds consulta en tandas de 40 (la URL de PostgREST no admite listas largas)', async () => {
    const ids = Array.from({ length: 95 }, (_, i) => U(i + 1));
    respuestaConsulta = { data: [], error: null };
    await equiposApi.listEquiposPorIds(ids);
    expect(consultas).toHaveLength(3);
    expect(paso(consultas[0], 'in')[2]).toHaveLength(40);
    expect(paso(consultas[2], 'in')[2]).toHaveLength(15);
  });

  it('listActasEquipo: solo vigentes y con la forma camelCase', async () => {
    respuestaConsulta = {
      data: [{ id: 'act-1', asignacion_equipo_id: U(7), tipo: 'entrega', empleado_id: U(2), equipo_id: U(1), tamano_bytes: 1200, firmado_at: '2026-03-12', created_at: '2026-03-13T10:00:00Z' }],
      error: null,
    };
    const actas = await equiposApi.listActasEquipo(U(1));
    expect(paso(consultas[0], 'is')).toEqual(['is', 'deleted_at', null]);
    expect(actas).toEqual([{
      id: 'act-1', asignacionId: U(7), tipo: 'entrega', empleadoId: U(2), equipoId: U(1),
      tamanoBytes: 1200, firmadoAt: '2026-03-12', creadaEn: '2026-03-13T10:00:00Z',
    }]);
    // La consulta nunca pide la key del PDF.
    expect(paso(consultas[0], 'select')[1]).not.toMatch(/pdf_key|sha256/);
  });
});

describe('actas firmadas (edge function equipos-fotos)', () => {
  it('subirActa envía el PDF en base64 con asignación, tipo y fecha, y devuelve el acta', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, acta: { id: 'act-9', tipo: 'devolucion', tamanoBytes: 5, firmadoAt: '2026-03-20', creadaEn: '2026-03-21T09:00:00Z' } },
      error: null,
    });
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'acta.pdf', { type: 'application/pdf' });
    const acta = await equiposApi.subirActa({ asignacionId: U(7), tipo: 'devolucion', archivo: pdf, nombre: 'acta.pdf', firmadoAt: '2026-03-20' });
    const [nombre, { body }] = invoke.mock.calls[0];
    expect(nombre).toBe('equipos-fotos');
    expect(body).toMatchObject({ action: 'subirActa', asignacionId: U(7), tipo: 'devolucion', firmadoAt: '2026-03-20', archivo: 'JVBERi0=' });
    // La function no devuelve la asignación: la completa quien llama.
    expect(acta).toMatchObject({ id: 'act-9', tipo: 'devolucion', asignacionId: U(7), tamanoBytes: 5, firmadoAt: '2026-03-20' });
  });

  it('un código de la function se traduce al mensaje del dominio', async () => {
    const pdf = new File([new Uint8Array([1])], 'x.pdf');
    invoke.mockResolvedValue({ data: { ok: false, code: 'archivo_muy_grande' }, error: null });
    await expect(equiposApi.subirActa({ asignacionId: U(7), tipo: 'entrega', archivo: pdf })).rejects.toMatchObject({
      message: 'El acta supera el tope de 10 MB. Escanéela con menor resolución.',
      code: 'archivo_muy_grande',
    });
    invoke.mockResolvedValue({ data: { ok: false, code: 'archivo_invalido' }, error: null });
    await expect(equiposApi.subirActa({ asignacionId: U(7), tipo: 'entrega', archivo: pdf })).rejects.toMatchObject({ code: 'archivo_invalido' });
  });

  it('urlActa pide la URL firmada y devuelve solo la URL', async () => {
    invoke.mockResolvedValue({ data: { ok: true, url: 'https://x/firmada', expiraSegundos: 120 }, error: null });
    await expect(equiposApi.urlActa('act-9')).resolves.toBe('https://x/firmada');
    expect(invoke.mock.calls[0][1].body).toEqual({ action: 'urlActa', actaId: 'act-9' });
  });
});
