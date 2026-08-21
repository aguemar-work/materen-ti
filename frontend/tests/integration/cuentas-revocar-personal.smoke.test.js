// Smoke test de INTEGRACIÓN: revocar_cuenta_personal() (migración 077),
// contra el backend real — no tests/db/triggers.test.sql, porque esa
// conexión (project_admin, BYPASSRLS, sin auth.uid()) solo puede probar el
// guard de rechazo, nunca la lógica de negocio real (ver bloque [077] de
// ese archivo). Acá se verifica lo que sí importa: que cerrar la
// asignación y hacer soft-delete de la cuenta ocurre en la MISMA llamada,
// y que eso realmente libera el usuario+plataforma para volver a
// registrarlo — el bug original (2026-08-20, reportado con
// almacen.nufago.06@gmail.com / VPN) era exactamente que esto NO pasaba.
//
// Reutiliza la cuenta JEFE ya documentada en el README
// (INSFORGE_TEST_JEFE_CON_FILA_EMAIL/_PASSWORD, pensada originalmente para
// el caso "accesos_sensibles fila por fila") en vez de provisionar una
// cuenta nueva: el fixture de este archivo necesita insertar en
// empresas/empleados/plataformas/cuentas/asignaciones_cuenta, lo que exige
// los módulos "correos" y "empleados" a la vez — un JEFE real evita tener
// que otorgar dos módulos a una cuenta de prueba solo para el setup. No
// depende de nada específico de la fila de accesos_sensibles de esa cuenta.
//
// Toda la evidencia de fixtures usa el prefijo "__test_ci_077__" y se
// limpia en afterAll, incluida la cuenta soft-eliminada (delete real, no
// soft-delete, para no dejar basura de prueba en producción).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getClient } from '../../src/api/client.js';
import { insforgeApi } from '../../src/api/insforge.js';

const EMAIL_JEFE = process.env.INSFORGE_TEST_JEFE_CON_FILA_EMAIL;
const PASSWORD_JEFE = process.env.INSFORGE_TEST_JEFE_CON_FILA_PASSWORD;
const BASE_URL = import.meta.env.VITE_INSFORGE_URL;
const ANON_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY;
const listo = Boolean(EMAIL_JEFE && PASSWORD_JEFE && BASE_URL && ANON_KEY);

if (!listo) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integración] Falta INSFORGE_TEST_JEFE_CON_FILA_EMAIL/PASSWORD (cuenta JEFE real, ver README): se omiten las pruebas de revocar_cuenta_personal.',
  );
}

const PLATAFORMA_ID = '__test_ci_077__';
const USUARIO = '__test_ci_077__@correo.test';

describe.skipIf(!listo)('revocar_cuenta_personal (migración 077)', () => {
  let empresaId;
  let empleadoId;
  const cuentasCreadas = []; // para limpieza final, incluida la soft-eliminada

  beforeAll(async () => {
    const { error: eLogin } = await getClient().auth.signInWithPassword({ email: EMAIL_JEFE, password: PASSWORD_JEFE });
    if (eLogin) throw new Error(`No se pudo iniciar sesión con la cuenta JEFE de prueba: ${eLogin.message}`);

    const db = getClient().database;
    const { data: empresa, error: e1 } = await db
      .from('empresas').insert([{ nombre: '__TEST_CI_077__ Empresa' }]).select('id').single();
    if (e1) throw new Error(`No se pudo crear la empresa fixture: ${e1.message}`);
    empresaId = empresa.id;

    const { data: empleado, error: e2 } = await db
      .from('empleados')
      .insert([{ nombres: '__TEST_CI_077__', apellidos: 'Fixture', dni: '99999077', empresa_id: empresaId }])
      .select('id').single();
    if (e2) throw new Error(`No se pudo crear el empleado fixture: ${e2.message}`);
    empleadoId = empleado.id;

    await db.from('plataformas').upsert([{ id: PLATAFORMA_ID, nombre: '__TEST_CI_077__ Plataforma' }]);
  });

  afterAll(async () => {
    const db = getClient().database;
    // Hard delete real de todo lo creado (incluida la fila ya soft-eliminada
    // por el propio test) — no queremos basura de prueba ni siquiera "borrada".
    for (const cuentaId of cuentasCreadas) {
      await db.from('asignaciones_cuenta').delete().eq('cuenta_id', cuentaId);
      await db.from('cuentas').delete().eq('id', cuentaId);
    }
    await db.from('plataformas').delete().eq('id', PLATAFORMA_ID);
    if (empleadoId) await db.from('empleados').delete().eq('id', empleadoId);
    if (empresaId) await db.from('empresas').delete().eq('id', empresaId);
    await getClient().auth.signOut();
  });

  it('cierra la asignación Y hace soft-delete de la cuenta en la misma llamada', async () => {
    const db = getClient().database;
    const { data: cuenta, error: eC } = await db
      .from('cuentas')
      .insert([{ plataforma_id: PLATAFORMA_ID, usuario: USUARIO, tipo_cuenta: 'personal' }])
      .select('id').single();
    if (eC) throw new Error(`No se pudo crear la cuenta fixture: ${eC.message}`);
    cuentasCreadas.push(cuenta.id);

    const { data: asignacion, error: eA } = await db
      .from('asignaciones_cuenta')
      .insert([{ cuenta_id: cuenta.id, empleado_id: empleadoId }])
      .select('id').single();
    if (eA) throw new Error(`No se pudo crear la asignación fixture: ${eA.message}`);

    await insforgeApi.revocarCuentaPersonal(asignacion.id);

    const { data: asigDespues } = await db
      .from('asignaciones_cuenta').select('fecha_fin').eq('id', asignacion.id).single();
    const { data: cuentaDespues } = await db
      .from('cuentas').select('deleted_at').eq('id', cuenta.id).single();

    expect(asigDespues?.fecha_fin, 'revocar_cuenta_personal no cerró la asignación').not.toBeNull();
    expect(cuentaDespues?.deleted_at, 'revocar_cuenta_personal no hizo soft-delete de la cuenta').not.toBeNull();
  });

  it('libera usuario+plataforma para volver a registrarlo (el caso reportado)', async () => {
    // Reutiliza el mismo usuario+plataforma del test anterior a propósito:
    // es exactamente el escenario reportado ("elimino la cuenta y sigo sin
    // poder crearla de nuevo"). Si uq_cuentas_usuario_plataforma todavía
    // contara la fila soft-eliminada, este insert fallaría con 23505.
    const db = getClient().database;
    const { data: cuenta, error } = await db
      .from('cuentas')
      .insert([{ plataforma_id: PLATAFORMA_ID, usuario: USUARIO, tipo_cuenta: 'personal' }])
      .select('id').single();
    expect(error, `no se pudo recrear usuario+plataforma tras revocar_cuenta_personal: ${error?.message}`).toBeNull();
    if (cuenta) cuentasCreadas.push(cuenta.id);
  });

  it('rechaza una cuenta tipo "reutilizable" sin tocar nada', async () => {
    const db = getClient().database;
    const { data: cuenta, error: eC } = await db
      .from('cuentas')
      .insert([{ plataforma_id: PLATAFORMA_ID, usuario: `reutilizable-${USUARIO}`, tipo_cuenta: 'reutilizable' }])
      .select('id').single();
    if (eC) throw new Error(`No se pudo crear la cuenta reutilizable fixture: ${eC.message}`);
    cuentasCreadas.push(cuenta.id);

    const { data: asignacion, error: eA } = await db
      .from('asignaciones_cuenta')
      .insert([{ cuenta_id: cuenta.id, empleado_id: empleadoId }])
      .select('id').single();
    if (eA) throw new Error(`No se pudo crear la asignación fixture: ${eA.message}`);

    const { error } = await db.rpc('revocar_cuenta_personal', { p_asignacion_id: asignacion.id });
    expect(error, 'revocar_cuenta_personal no rechazó una cuenta tipo "reutilizable"').toBeTruthy();
    expect(error?.message || '', 'el rechazo no fue por tipo_cuenta (mensaje inesperado)').toMatch(/tipo.*personal/i);

    // Confirma que "sin tocar nada" es real: ni se cerró la asignación
    // ni se soft-eliminó la cuenta.
    const { data: asigDespues } = await db
      .from('asignaciones_cuenta').select('fecha_fin').eq('id', asignacion.id).single();
    const { data: cuentaDespues } = await db
      .from('cuentas').select('deleted_at').eq('id', cuenta.id).single();
    expect(asigDespues?.fecha_fin, 'el rechazo cerró la asignación de todos modos').toBeNull();
    expect(cuentaDespues?.deleted_at, 'el rechazo hizo soft-delete de la cuenta de todos modos').toBeNull();
  });
});
