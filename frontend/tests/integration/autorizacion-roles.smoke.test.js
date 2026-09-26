// Smoke test de INTEGRACIÓN: pruebas negativas de autorización que
// requieren una sesión de staff REAL con un rol/permiso específico — algo
// que tests/db/triggers.test.sql no puede simular (esa conexión es
// project_admin con BYPASSRLS y sin auth.uid(), ver su propio comentario
// de cabecera) y que tickets-api/embeds.smoke.test.js tampoco cubren
// (usan siempre la misma cuenta, sin variar rol/permiso).
//
// Cubre los objetivos 1, 2, 5 y 6 de la auditoría de autorización
// (2026-08-18, ver la matriz de autorización publicada y
// docs/HISTORIAL-AUDITORIAS.md):
//   1. Un ASISTENTE sin permiso de módulo no puede leer ni modificar ese
//      módulo.
//   2. Un staff inactivo no puede operar aunque su login sea válido.
//   5. credenciales.ver es obligatorio para revelar/entregar contraseñas.
//   6. accesos_sensibles mantiene su permiso fila por fila, incluso entre
//      dos JEFE distintos.
//
// REQUIERE CUENTAS DE PRUEBA DEDICADAS QUE HOY NO EXISTEN — cada describe
// se omite independientemente si faltan las suyas (mismo patrón
// describe.skipIf que el resto de tests/integration/). Ver
// "docs/PRUEBAS-AUTORIZACION.md" (o la sección equivalente del README)
// para cómo provisionar cada una; NINGUNA es la misma cuenta genérica
// INSFORGE_TEST_STAFF_EMAIL que ya usan tickets-api/embeds — esa, por el
// default "opt-out" de las migraciones 056/060, nace con LOS 8 MÓDULOS Y
// credenciales.ver ya otorgados, así que no sirve como "ASISTENTE sin
// permiso" sin que un JEFE le revoque algo primero.
//
// Ninguna prueba de este archivo revela una contraseña real: todas
// esperan un rechazo antes de que el servidor llegue a descifrar nada, y
// los datos de fixture (accesos_sensibles) se crean con nombre
// "__TEST_CI__" y se eliminan en el propio afterAll del bloque que los usa.
// Helpers de autorización endurecidos en `_autorizacion-helpers.js`
// (exigen un rechazo específico — SQLSTATE 42501, P0001+mensaje del
// guard, o el status HTTP real — nunca "hubo algún error" a secas; ver el
// comentario de cabecera de ese archivo). `iniciarSesion`/`cerrarSesion`
// quedan locales: son utilidades de setup del test, no discriminantes de
// autorización.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getClient } from '../../src/api/client.js';
import { esperarSinAcceso, esperarRpcRechazada, esperarAccionRechazada } from './_autorizacion-helpers.js';

async function iniciarSesion(email, password, etiqueta) {
  const { error } = await getClient().auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`No se pudo iniciar sesión con la cuenta "${etiqueta}": ${error.message}`);
  }
}

async function cerrarSesion() {
  await getClient().auth.signOut();
}

// ── Objetivos 1 y 5 — ASISTENTE al que un JEFE le revocó explícitamente
// el módulo "licencias", el módulo "equipos" y el permiso
// "credenciales.ver" ────────────────────────────────────────────────────
// Provisión requerida (una sola cuenta, no reutilizar la de tickets-api):
//   1. Crear el usuario desde el dashboard de InsForge (nunca por registro
//      público) y activarlo, igual que la cuenta genérica del README.
//   2. Con una sesión JEFE, en Configuración → Staff: revocar el módulo
//      "licencias", el módulo "equipos" (2026-08-20, hallazgo de
//      functions/equipos-fotos.ts sin gate de módulo) Y el permiso
//      "credenciales.ver" de esa cuenta — nacen otorgados por defecto
//      (migraciones 056/060), hay que quitarlos a mano para que sirva
//      como caso negativo.
const EMAIL_RESTRINGIDO = process.env.INSFORGE_TEST_ASISTENTE_SIN_MODULO_EMAIL;
const PASSWORD_RESTRINGIDO = process.env.INSFORGE_TEST_ASISTENTE_SIN_MODULO_PASSWORD;
const BASE_URL = import.meta.env.VITE_INSFORGE_URL;
const ANON_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY;
const listoRestringido = Boolean(EMAIL_RESTRINGIDO && PASSWORD_RESTRINGIDO && BASE_URL && ANON_KEY);

if (!listoRestringido) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integración] Falta INSFORGE_TEST_ASISTENTE_SIN_MODULO_EMAIL/PASSWORD (cuenta dedicada, con el módulo "licencias" y "credenciales.ver" revocados a mano): se omiten las pruebas de ASISTENTE sin permiso y de credenciales.ver.',
  );
}

describe.skipIf(!listoRestringido)('autorización — ASISTENTE sin permiso de módulo ni credenciales.ver', () => {
  beforeAll(() => iniciarSesion(EMAIL_RESTRINGIDO, PASSWORD_RESTRINGIDO, 'ASISTENTE sin módulo'));
  afterAll(cerrarSesion);

  it('lectura de licencias — sin el módulo, 0 filas', async () => {
    await esperarSinAcceso('licencias');
  });

  it('lectura de asignaciones_licencia — sin el módulo, 0 filas', async () => {
    await esperarSinAcceso('asignaciones_licencia');
  });

  it('creación de licencia — rechazada (with check tiene_permiso_modulo)', async () => {
    const { error } = await getClient().database.from('licencias').insert([
      { plataforma_id: '__test_ci__', asientos_totales: 1 },
    ]);
    // AUTH-TEST-004: expectativa sin endurecer — acepta cualquier error,
    // no valida específicamente el código de rechazo de autorización
    // (42501/P0001+mensaje). Endurecer para exigir esa condición
    // específica, igual que esperarInsertRechazado. Fuera del alcance de
    // esta tarea.
    expect(error, 'pudo crear una licencia sin el módulo "licencias"').toBeTruthy();
  });

  it('revelarPassword (credenciales.ver ausente) — rechazada aunque la cuenta exista', async () => {
    // cuentaId inventado a propósito: el chequeo de permiso en
    // credenciales.ts (tienePermisoCredenciales) corre ANTES de buscar la
    // cuenta real (verificado leyendo functions/credenciales.ts:523-533),
    // así que nunca hace falta una cuenta real ni se acerca a descifrar
    // ninguna contraseña real.
    await esperarAccionRechazada('credenciales', {
      action: 'revelar',
      cuentaId: '00000000-0000-4000-8000-000000000000',
      motivo: 'ver',
    });
  });

  it('revelarClaveLicencia (credenciales.ver ausente) — rechazada', async () => {
    await esperarAccionRechazada('credenciales', {
      action: 'revelarClaveLicencia',
      licenciaId: '00000000-0000-4000-8000-000000000000',
      motivo: 'ver',
    });
  });

  it('entregaCrear (credenciales.ver ausente) — rechazada', async () => {
    // ENTREGACREAR-TEST-BUG (docs/HISTORIAL-AUDITORIAS.md, detectado
    // 2026-08-20): con cuentaIds: [] el handler cortaba antes por
    // datos_requeridos (200), sin llegar nunca al gate tienePermisoCredenciales
    // que este test quiere ejercitar. Un uuid inventado sí llega al gate —
    // mismo patrón que 'revelar'/'revelarClaveLicencia' arriba, sin acercarse
    // a descifrar ninguna contraseña real.
    await esperarAccionRechazada('credenciales', {
      action: 'entregaCrear',
      empleadoId: '00000000-0000-4000-8000-000000000000',
      cuentaIds: ['00000000-0000-4000-8000-000000000000'],
      horas: 1,
    });
  });

  // equipos-fotos: hallazgo de auditoría externa (2026-08-20) — la función
  // solo exigía staff activo, sin mirar el módulo "equipos". Content
  // inventado a propósito en subirFoto: el gate de módulo corre ANTES de
  // decodificar/validar el archivo (verificado leyendo
  // functions/equipos-fotos.ts), así que nunca hace falta una imagen real.
  it('subirFoto (sin módulo "equipos") — rechazada', async () => {
    await esperarAccionRechazada('equipos-fotos', {
      action: 'subirFoto',
      contenidoBase64: 'AA==',
    });
  });

  it('eliminarFoto (sin módulo "equipos") — rechazada', async () => {
    await esperarAccionRechazada('equipos-fotos', {
      action: 'eliminarFoto',
      key: 'equipos/00000000-0000-4000-8000-000000000000.jpg',
    });
  });
});

// ── Objetivo adicional — ASISTENTE con módulo revocado PERO credenciales.ver
// intacto, para aislar tienePermisoModulo() de tienePermisoCredenciales()
// en functions/credenciales.ts (hallazgo TIENE-PERMISO-MODULO-COBERTURA,
// ver docs/HISTORIAL-AUDITORIAS.md) ──────────────────────────────────────
// La cuenta de arriba (INSFORGE_TEST_ASISTENTE_SIN_MODULO) tiene el módulo
// Y credenciales.ver revocados A LA VEZ: como tienePermisoCredenciales() se
// evalúa antes que tienePermisoModulo() en revelar/revelarClaveLicencia/
// entregaCrear (functions/credenciales.ts:647→650, 695→698, 740→743), esas
// 3 pruebas de arriba se rechazan siempre en el primer gate — nunca llegan
// a ejercitar tienePermisoModulo() de verdad. Esta cuenta separa las dos
// causas: credenciales.ver SIGUE otorgado, así que si la petición se
// rechaza, el único gate que pudo haberla parado es tienePermisoModulo().
//
// Provisión requerida (cuenta nueva y distinta de todas las de arriba):
//   1. Crear el usuario desde el dashboard de InsForge (nunca por registro
//      público) y activarlo.
//   2. Con una sesión JEFE, en Configuración → Staff: revocar el módulo
//      "Licencias" y el módulo "Correos" de esta cuenta. NO tocar "Ver
//      contraseñas" — nace otorgado (migración 060) y debe quedar así.
const EMAIL_SIN_MODULO_CON_VER = process.env.INSFORGE_TEST_ASISTENTE_SIN_MODULO_CON_CREDENCIALES_EMAIL;
const PASSWORD_SIN_MODULO_CON_VER = process.env.INSFORGE_TEST_ASISTENTE_SIN_MODULO_CON_CREDENCIALES_PASSWORD;
const listoModuloAislado = Boolean(EMAIL_SIN_MODULO_CON_VER && PASSWORD_SIN_MODULO_CON_VER && BASE_URL && ANON_KEY);

if (!listoModuloAislado) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integración] Falta INSFORGE_TEST_ASISTENTE_SIN_MODULO_CON_CREDENCIALES_EMAIL/PASSWORD (cuenta dedicada, con los módulos "Licencias"/"Correos" revocados pero "Ver contraseñas" intacto): se omiten las pruebas de aislamiento de tienePermisoModulo() en credenciales.ts.',
  );
}

describe.skipIf(!listoModuloAislado)('autorización — ASISTENTE sin módulo pero con credenciales.ver (aísla tienePermisoModulo)', () => {
  beforeAll(() => iniciarSesion(EMAIL_SIN_MODULO_CON_VER, PASSWORD_SIN_MODULO_CON_VER, 'ASISTENTE sin módulo, con credenciales.ver'));
  afterAll(cerrarSesion);

  it('revelarClaveLicencia (módulo "licencias" ausente, credenciales.ver presente) — rechazada por tienePermisoModulo', async () => {
    await esperarAccionRechazada('credenciales', {
      action: 'revelarClaveLicencia',
      licenciaId: '00000000-0000-4000-8000-000000000000',
      motivo: 'ver',
    });
  });

  it('revelar (módulo "correos" ausente, credenciales.ver presente) — rechazada por tienePermisoModulo', async () => {
    await esperarAccionRechazada('credenciales', {
      action: 'revelar',
      cuentaId: '00000000-0000-4000-8000-000000000000',
      motivo: 'ver',
    });
  });

  it('entregaCrear (módulo "correos" ausente, credenciales.ver presente) — rechazada por tienePermisoModulo', async () => {
    await esperarAccionRechazada('credenciales', {
      action: 'entregaCrear',
      empleadoId: '00000000-0000-4000-8000-000000000000',
      cuentaIds: ['00000000-0000-4000-8000-000000000000'],
      horas: 1,
    });
  });
});

// ── Objetivo 2 — staff inactivo (login válido, pero sin operar nada) ────
// Provisión requerida: crear el usuario desde el dashboard de InsForge y
// NO activarlo (es el estado por defecto — migración 018 — así que este
// es, de las cuatro cuentas de este archivo, la más simple de dejar lista:
// basta con no pulsar "Activar").
const EMAIL_INACTIVO = process.env.INSFORGE_TEST_STAFF_INACTIVO_EMAIL;
const PASSWORD_INACTIVO = process.env.INSFORGE_TEST_STAFF_INACTIVO_PASSWORD;
const listoInactivo = Boolean(EMAIL_INACTIVO && PASSWORD_INACTIVO && BASE_URL && ANON_KEY);

if (!listoInactivo) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integración] Falta INSFORGE_TEST_STAFF_INACTIVO_EMAIL/PASSWORD (cuenta creada y nunca activada): se omiten las pruebas de staff inactivo.',
  );
}

describe.skipIf(!listoInactivo)('autorización — staff inactivo no puede operar', () => {
  beforeAll(() => iniciarSesion(EMAIL_INACTIVO, PASSWORD_INACTIVO, 'staff inactivo'));
  afterAll(cerrarSesion);

  // La autenticación en sí (JWT válido) es independiente de la columna
  // `staff.activo` — Auth no sabe nada de esa tabla de negocio. El login
  // de beforeAll debe tener éxito; lo que se prueba acá es que, aun con
  // sesión válida, es_staff()/es_jefe() devuelven false (exigen activo=true)
  // y por lo tanto el trato real es idéntico al de un anónimo.
  it('lectura de empleados — inactivo tratado como sin sesión, 0 filas', async () => {
    await esperarSinAcceso('empleados');
  });

  it('lectura de tickets — inactivo tratado como sin sesión, 0 filas', async () => {
    await esperarSinAcceso('tickets');
  });

  it('RPC staff_nombres — rechazada para staff inactivo', async () => {
    await esperarRpcRechazada('staff_nombres', undefined);
  });

  it('RPC cerrar_ticket — rechazada para staff inactivo', async () => {
    await esperarRpcRechazada('cerrar_ticket', { p_ticket_id: '00000000-0000-4000-8000-000000000000' });
  });
});

// ── Objetivo 6 — accesos_sensibles: permiso fila por fila entre dos JEFE
// distintos, no solo "ser JEFE" ──────────────────────────────────────────
// Provisión requerida (dos cuentas JEFE reales — la más costosa de las
// cuatro, requiere una decisión organizativa, no solo un checkbox de CI):
//   JEFE_A crea el fixture (queda auto-otorgado el permiso de esa fila por
//   el trigger bootstrap de la migración 024); JEFE_B NO debe tener ningún
//   permiso sobre esa fila puntual.
const EMAIL_JEFE_A = process.env.INSFORGE_TEST_JEFE_CON_FILA_EMAIL;
const PASSWORD_JEFE_A = process.env.INSFORGE_TEST_JEFE_CON_FILA_PASSWORD;
const EMAIL_JEFE_B = process.env.INSFORGE_TEST_JEFE_SIN_FILA_EMAIL;
const PASSWORD_JEFE_B = process.env.INSFORGE_TEST_JEFE_SIN_FILA_PASSWORD;
const listoFilaPorFila = Boolean(EMAIL_JEFE_A && PASSWORD_JEFE_A && EMAIL_JEFE_B && PASSWORD_JEFE_B && BASE_URL && ANON_KEY);

if (!listoFilaPorFila) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integración] Faltan INSFORGE_TEST_JEFE_CON_FILA_*/INSFORGE_TEST_JEFE_SIN_FILA_* (dos cuentas JEFE reales): se omiten las pruebas de accesos_sensibles fila por fila.',
  );
}

describe.skipIf(!listoFilaPorFila)('autorización — accesos_sensibles exige permiso por fila, no solo ser JEFE', () => {
  let filaId;

  beforeAll(async () => {
    await iniciarSesion(EMAIL_JEFE_A, PASSWORD_JEFE_A, 'JEFE con fila');
    // Fixture sin password (columna nullable, ver migración 024): esta
    // prueba es sobre el PERMISO por fila, no sobre el cifrado — nunca se
    // escribe ni se revela una contraseña real acá.
    const { data, error } = await getClient().database
      .from('accesos_sensibles')
      .insert([{ nombre: '__TEST_CI__ Acceso fila por fila', categoria: 'otro', usuario: '__test_ci__' }])
      .select('id')
      .single();
    if (error) throw new Error(`No se pudo crear el fixture de accesos_sensibles: ${error.message}`);
    filaId = data.id;
    await cerrarSesion();
  });

  afterAll(async () => {
    if (!filaId) return;
    await iniciarSesion(EMAIL_JEFE_A, PASSWORD_JEFE_A, 'JEFE con fila (limpieza)');
    await getClient().database.from('accesos_sensibles').delete().eq('id', filaId);
    await cerrarSesion();
  });

  it('JEFE sin permiso de fila no puede editar el acceso sensible de otro JEFE', async () => {
    // ACCESOS-SENSIBLES-UPDATE-DELETE-TEST (docs/HISTORIAL-AUDITORIAS.md,
    // confirmado sin riesgo real 2026-08-24): un UPDATE bloqueado por la
    // policy USING de RLS no lanza error — solo afecta 0 filas en silencio
    // (a diferencia de un INSERT, que sí viola WITH CHECK con error real).
    // expect(error).toBeTruthy() nunca podía detectar esto. La verificación
    // real es releer la fila con la sesión de quien SÍ tiene permiso
    // (JEFE_A) y confirmar que `notas` sigue en su valor original (null) —
    // si el UPDATE de JEFE_B hubiera pasado, `notas` tendría el texto que
    // intentó escribir.
    await iniciarSesion(EMAIL_JEFE_B, PASSWORD_JEFE_B, 'JEFE sin fila');
    await getClient().database
      .from('accesos_sensibles')
      .update({ notas: '__TEST_CI__ intento de edición sin permiso' })
      .eq('id', filaId);
    await cerrarSesion();

    await iniciarSesion(EMAIL_JEFE_A, PASSWORD_JEFE_A, 'JEFE con fila (verificación)');
    const { data, error } = await getClient().database
      .from('accesos_sensibles')
      .select('notas')
      .eq('id', filaId)
      .single();
    if (error) throw new Error(`No se pudo releer el fixture para verificar el rechazo: ${error.message}`);
    expect(data.notas, 'un JEFE sin permiso de fila pudo editar el acceso sensible de otro JEFE').toBeNull();
    await cerrarSesion();
  });

  it('JEFE sin permiso de fila no puede revelarlo', async () => {
    await iniciarSesion(EMAIL_JEFE_B, PASSWORD_JEFE_B, 'JEFE sin fila');
    await esperarAccionRechazada('credenciales', { action: 'revelarAccesoSensible', accesoId: filaId, motivo: 'ver' });
    await cerrarSesion();
  });

  it('JEFE sin permiso de fila no puede eliminarlo', async () => {
    // Mismo motivo que el caso de editar, arriba (ACCESOS-SENSIBLES-UPDATE-
    // DELETE-TEST): un DELETE bloqueado por RLS tampoco lanza error, solo
    // afecta 0 filas. Se confirma releyendo la fila con la sesión de JEFE_A
    // — si sigue existiendo, el DELETE de JEFE_B no tuvo efecto real.
    await iniciarSesion(EMAIL_JEFE_B, PASSWORD_JEFE_B, 'JEFE sin fila');
    await getClient().database.from('accesos_sensibles').delete().eq('id', filaId);
    await cerrarSesion();

    await iniciarSesion(EMAIL_JEFE_A, PASSWORD_JEFE_A, 'JEFE con fila (verificación)');
    const { data, error } = await getClient().database
      .from('accesos_sensibles')
      .select('id')
      .eq('id', filaId)
      .maybeSingle();
    if (error) throw new Error(`No se pudo releer el fixture para verificar el rechazo: ${error.message}`);
    expect(data, 'un JEFE sin permiso de fila pudo eliminar el acceso sensible de otro JEFE').toBeTruthy();
    await cerrarSesion();
  });
});
