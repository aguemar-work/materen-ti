// Capa única de traducción de errores (api/erroresDb.js). Cada fila de la
// tabla es un caso real de PostgREST/Postgres que antes llegaba crudo al
// formulario (anexo E §6 de la auditoría Ciclo 21).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  traducirErrorDb,
  anotarErrorDb,
  mensajeSiUsuarioDuplicado,
  MENSAJE_GENERICO,
} from '../src/api/erroresDb.js';
import { crearStorePaginado } from '../src/stores/crearStorePaginado.js';
import { useFormularioModal } from '../src/composables/useFormularioModal.js';

const dup = (constraint) => ({
  code: '23505',
  message: `duplicate key value violates unique constraint "${constraint}"`,
  details: 'Key (x)=(1) already exists.',
});

describe('traducirErrorDb', () => {
  it.each([
    [{ code: '42501', message: 'new row violates row-level security policy for table "equipos"' }, 'No tiene permiso para esta acción.', 'permiso'],
    [{ code: 'P0002', message: 'no data found' }, 'El registro ya no existe.', 'no_encontrado'],
    [{ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 'No se encontró el registro.', 'no_encontrado'],
    [dup('empleados_dni_key'), 'Ya existe un empleado con ese DNI.', 'conflicto'],
    [dup('equipos_codigo_key'), 'Ya existe un equipo con ese código.', 'conflicto'],
    [dup('uq_equipos_serie'), 'Ya existe un equipo con ese número de serie.', 'conflicto'],
    // `uq_equipos_codigo_almacen` contiene "codigo": gana el nombre más largo.
    [dup('uq_equipos_codigo_almacen'), 'Ya existe un equipo con ese código de almacén.', 'conflicto'],
    [dup('asignaciones_equipo_una_activa'), 'El equipo ya tiene un portador activo.', 'conflicto'],
    [dup('indice_que_no_conocemos'), 'Ya existe un registro con esos datos.', 'conflicto'],
    [{ code: '23514', message: 'new row for relation "equipos" violates check constraint "equipos_fotos_max"' }, 'Un equipo admite hasta 4 fotos.', 'validacion'],
    [{ code: '23514', message: 'violates check constraint "otra_regla"' }, 'Los datos no cumplen una regla del sistema.', 'validacion'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'La sesión expiró. Vuelva a iniciar sesión.', 'sesion'],
    [{ statusCode: 401, message: 'Unauthorized' }, 'La sesión expiró. Vuelva a iniciar sesión.', 'sesion'],
    [{ error: 'NETWORK_ERROR', statusCode: 0, message: 'x' }, 'Sin conexión con el servidor.', 'red'],
    [new TypeError('Failed to fetch'), 'Sin conexión con el servidor.', 'red'],
  ])('%j → %s', (error, mensaje, tipo) => {
    expect(traducirErrorDb(error)).toMatchObject({ mensaje, tipo });
  });

  it('el CHECK de cuentas.password conserva su nombre en `restriccion`', () => {
    const r = traducirErrorDb({ code: '23514', message: 'violates check constraint "cuentas_password_formato_cifrado"' });
    expect(r.restriccion).toBe('cuentas_password_formato_cifrado');
    expect(r.codigo).toBe('23514');
  });

  it('23503 distingue borrar algo referenciado de apuntar a algo inexistente', () => {
    expect(
      traducirErrorDb({
        code: '23503',
        message: 'update or delete on table "empresas" violates foreign key constraint "empleados_empresa_id_fkey" on table "empleados"',
        details: 'Key (id)=(1) is still referenced from table "empleados".',
      }).mensaje,
    ).toBe('No se puede eliminar: tiene registros relacionados.');
    expect(
      traducirErrorDb({
        code: '23503',
        message: 'insert or update on table "equipos" violates foreign key constraint "equipos_tipo_id_fkey"',
        details: 'Key (tipo_id)=(9) is not present in table "tipos_equipo".',
      }).mensaje,
    ).toBe('El elemento relacionado ya no existe.');
  });

  it('P0001 deja pasar el texto del RAISE EXCEPTION tal cual', () => {
    const mensaje = 'El equipo lo tiene una persona. Registre la devolución antes de moverlo.';
    expect(traducirErrorDb({ code: 'P0001', message: mensaje })).toMatchObject({ mensaje, tipo: 'validacion', codigo: 'P0001' });
  });

  it('un mensaje ya en español sin código pasa; uno en inglés o sin texto, no', () => {
    expect(traducirErrorDb(new Error('La descripción es obligatoria')).mensaje).toBe('La descripción es obligatoria');
    expect(traducirErrorDb({ message: 'Request failed: Bad Gateway' }).mensaje).toBe(MENSAJE_GENERICO);
    expect(traducirErrorDb({ message: 'duplicate key value violates unique constraint "x"' }).mensaje).toBe(MENSAJE_GENERICO);
    expect(traducirErrorDb({}).mensaje).toBe(MENSAJE_GENERICO);
    expect(traducirErrorDb(null).mensaje).toBe(MENSAJE_GENERICO);
    expect(traducirErrorDb({ message: '' }, { porDefecto: 'Error al guardar' }).mensaje).toBe('Error al guardar');
  });

  it('un código de Postgres sin mapear nunca muestra su texto (siempre en inglés)', () => {
    const r = traducirErrorDb({ code: '42703', message: 'column "resuelto_at" does not exist' });
    expect(r).toMatchObject({ mensaje: MENSAJE_GENERICO, tipo: 'desconocido', codigo: '42703' });
  });

  it('un código de edge function (minúsculas) no se confunde con un SQLSTATE', () => {
    expect(traducirErrorDb({ code: 'no_existe', message: 'El enlace no existe.' }).mensaje).toBe('El enlace no existe.');
  });

  it('con `entidad`, un único desconocido nombra el recurso', () => {
    expect(traducirErrorDb(dup('x'), { entidad: 'correo' }).mensaje).toBe('Ya existe un registro de correo con esos datos.');
  });

  it('sin código pero con el nombre de una restricción conocida, la traduce igual', () => {
    expect(traducirErrorDb({ message: 'violates unique constraint "empleados_dni_key"' })).toMatchObject({
      mensaje: 'Ya existe un empleado con ese DNI.',
      restriccion: 'empleados_dni_key',
    });
  });
});

describe('anotarErrorDb', () => {
  it('devuelve el mismo Error si el mensaje ya era legible', () => {
    const e = new Error('La descripción es obligatoria');
    expect(anotarErrorDb(e)).toBe(e);
  });

  it('envuelve un error de PostgREST con mensaje traducido, code, restriccion y original', () => {
    const crudo = dup('uq_equipos_serie');
    const e = anotarErrorDb(crudo);
    expect(e).toBeInstanceOf(Error);
    expect(e).toMatchObject({
      message: 'Ya existe un equipo con ese número de serie.',
      code: '23505',
      tipo: 'conflicto',
      restriccion: 'uq_equipos_serie',
    });
    expect(e.original).toBe(crudo);
  });

  it('es idempotente: re-traducir un error ya anotado no pierde la restricción', () => {
    const e = anotarErrorDb(dup('empleados_dni_key'));
    expect(anotarErrorDb(e)).toBe(e);
    expect(traducirErrorDb(e)).toMatchObject({
      mensaje: 'Ya existe un empleado con ese DNI.',
      tipo: 'conflicto',
      restriccion: 'empleados_dni_key',
    });
  });
});

describe('mensajeSiUsuarioDuplicado (compatibilidad)', () => {
  it('sigue devolviendo el texto para uq_cuentas_usuario_plataforma y null para el resto', () => {
    expect(mensajeSiUsuarioDuplicado(dup('uq_cuentas_usuario_plataforma'))).toMatch(/^Ya existe una cuenta registrada/);
    expect(mensajeSiUsuarioDuplicado(dup('empleados_dni_key'))).toBeNull();
    expect(mensajeSiUsuarioDuplicado({ code: '42501', message: 'x' })).toBeNull();
  });

  it('usa usted, no tuteo', () => {
    expect(mensajeSiUsuarioDuplicado(dup('uq_cuentas_usuario_plataforma'))).not.toMatch(/Búscala/);
  });
});

describe('crearStorePaginado: errores traducidos', () => {
  beforeEach(() => setActivePinia(createPinia()));

  function crearStore(listarPagina, actions = {}) {
    return crearStorePaginado('t-errores', {
      listarPagina,
      filtrosIniciales: () => ({ q: '' }),
      mensajeError: 'Error al cargar equipos',
      entidad: 'equipo',
      actions,
    })();
  }

  it('cargar() deja el mensaje traducido en `error` y relanza un error con code', async () => {
    const store = crearStore(vi.fn().mockRejectedValue({ code: '42501', message: 'permission denied for table equipos' }));
    await expect(store.cargar()).rejects.toMatchObject({ message: 'No tiene permiso para esta acción.', code: '42501' });
    expect(store.error).toBe('No tiene permiso para esta acción.');
    expect(store.cargando).toBe(false);
  });

  it('cargar() con error sin texto ni código usa el mensaje del store', async () => {
    const store = crearStore(vi.fn().mockRejectedValue({}));
    await expect(store.cargar()).rejects.toBeDefined();
    expect(store.error).toBe('Error al cargar equipos');
  });

  it('crear/actualizar/softDelete relanzan traducido, sin tocar `error` (no tumba el listado)', async () => {
    const store = crearStore(vi.fn().mockResolvedValue({ items: [], total: 0 }), {
      async crear() {
        throw dup('uq_equipos_serie');
      },
      async actualizar() {
        throw { code: '23514', message: 'violates check constraint "equipos_fotos_max"' };
      },
      async softDelete() {
        throw { code: '23503', message: 'update or delete on table "t" violates foreign key', details: 'still referenced from table "u"' };
      },
      async darDeBaja() {
        throw dup('uq_equipos_serie');
      },
    });
    await expect(store.crear({})).rejects.toMatchObject({
      message: 'Ya existe un equipo con ese número de serie.',
      restriccion: 'uq_equipos_serie',
    });
    await expect(store.actualizar(1, {})).rejects.toMatchObject({ message: 'Un equipo admite hasta 4 fotos.' });
    await expect(store.softDelete(1)).rejects.toMatchObject({
      message: 'No se puede eliminar: tiene registros relacionados.',
    });
    expect(store.error).toBeNull();
    // Las acciones con otro nombre no se envuelven.
    await expect(store.darDeBaja()).rejects.toMatchObject({ code: '23505', details: 'Key (x)=(1) already exists.' });
  });

  it('las acciones envueltas conservan `this` y los argumentos', async () => {
    const store = crearStore(vi.fn().mockResolvedValue({ items: [], total: 0 }), {
      async crear(datos) {
        this.total = datos.n;
        return 'ok';
      },
    });
    await expect(store.crear({ n: 5 })).resolves.toBe('ok');
    expect(store.total).toBe(5);
  });
});

describe('useFormularioModal: errores de guardado', () => {
  it('mensajeError traduce y ejecutarGuardado deja el texto en `error`', async () => {
    const { mensajeError, ejecutarGuardado, error, guardando } = useFormularioModal(() => ({}));
    expect(mensajeError({ code: '42501', message: 'x' })).toBe('No tiene permiso para esta acción.');
    expect(mensajeError({}, { porDefecto: 'Error al guardar' })).toBe('Error al guardar');

    const resultado = await ejecutarGuardado(async () => {
      throw dup('empleados_dni_key');
    });
    expect(resultado).toBeUndefined();
    expect(error.value).toBe('Ya existe un empleado con ese DNI.');
    expect(guardando.value).toBe(false);

    await expect(ejecutarGuardado(async () => 'listo')).resolves.toBe('listo');
    expect(error.value).toBe('');
  });
});
