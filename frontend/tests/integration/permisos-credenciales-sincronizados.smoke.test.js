// Smoke test de INTEGRACIÓN: ata los DOS lugares donde vive la regla de
// "quién puede ver contraseñas" (permiso credenciales.ver), que hoy no
// sincroniza nada:
//   A. tiene_permiso_credenciales_ver(uuid) — función SQL SECURITY DEFINER
//      (migración 060). Ninguna policy de RLS la consume: existe por
//      paralelismo con tiene_permiso_acceso_sensible.
//   B. tienePermisoCredenciales() en functions/credenciales.ts — consulta
//      DIRECTA a staff_permisos. No puede ir por RPC a la de arriba: esa
//      edge function corre con createAdminClient, así que auth.uid()
//      dentro de la función SQL sería NULL (ver la cabecera de la
//      migración 060 y la advertencia de AGENTS.md).
// La duplicación es deliberada y documentada; lo que faltaba era algo que
// se ponga en rojo si alguien mueve una de las dos y se olvida de la otra.
// Este archivo compara las dos respuestas para la MISMA cuenta y falla si
// difieren.
//
// Cómo se lee cada ruta:
//   A: RPC directa con la sesión de la cuenta (authenticated tiene EXECUTE
//      desde la migración 062), pasando su propio user_id. Devuelve el
//      booleano tal cual.
//   B: no hay forma de preguntarle a la edge function "¿tengo el permiso?"
//      — hay que ejercer una acción que lo exija y traducir la respuesta.
//      Se usa `revelar` con un cuentaId que NO existe, y el orden de los
//      chequeos de credenciales.ts (verificado leyendo el archivo) es lo
//      que hace la traducción determinista:
//        1) cuentaId vacío → cuenta_requerida   (no aplica, se manda uuid)
//        2) tienePermisoCredenciales → 403      ← "no me dejó"
//        3) tienePermisoModulo('correos') → 403 ← confusor, ver abajo
//        4) lookup de la cuenta → 200 {code:'no_existe'} ← "me dejó pasar
//           los dos gates de permiso"
//        5) tipo_cuenta personal / rate-limit → inalcanzables con un id
//           inexistente (van después del lookup)
//      Por eso el caso se construye con un uuid inexistente A PROPÓSITO:
//      con una cuenta real, un permiso concedido terminaría descifrando y
//      auditando una contraseña real; con el uuid inventado, "concedido"
//      se manifiesta como un no_existe limpio y el servidor nunca llega a
//      descifrar nada. Y NO se usa data?.ok===false como prueba de nada:
//      un no_existe también tiene ok:false — lo que distingue es el status
//      HTTP real (403) frente a 200+no_existe, mismo criterio que
//      _autorizacion-helpers.js.
//
// LÍMITE CONOCIDO (por eso este test es angosto a propósito): TODAS las
// acciones de credenciales.ts que exigen credenciales.ver exigen además un
// permiso de módulo ('correos' en revelar/entregaCrear, 'licencias' en
// revelarClaveLicencia), y los dos rechazos son 403 indistinguibles. No se
// puede aislar credenciales.ver por la respuesta sola. Entonces:
//   - si la cuenta NO tiene el módulo 'correos', el 403 está confundido y
//     la comparación se omite en runtime (ctx.skip) en vez de "pasar" por
//     el motivo equivocado;
//   - si la cuenta es JEFE, la ruta B corta por rol (`if (rol === 'JEFE')
//     return true`) y la función SQL NO tiene ese atajo — la igualdad no
//     aplica. Ahí se verifica lo único determinista y con valor: que la
//     edge function sí la deja pasar. Ese atajo por rol es, de hecho, un
//     tercer lugar donde vive la regla; queda anotado acá porque el test no
//     lo puede comparar contra la función SQL sin volver a codificarlo.
//   - la cuenta de staff INACTIVO no se incluye: se cae en no_es_staff
//     (403) antes de mirar ningún permiso, así que su 403 tampoco dice
//     nada sobre credenciales.ver.
//
// REQUIERE CUENTAS DE STAFF DE PRUEBA DEDICADAS QUE HOY NO EXISTEN EN EL
// ENTORNO (hallazgo P0-04: tampoco están los secrets de CI). Cada bloque se
// omite independientemente si faltan las suyas — mismo patrón
// describe.skipIf que el resto de tests/integration/. Que hoy se salte
// entero es lo esperado, no una falla. La provisión de cada cuenta está
// documentada en autorizacion-roles.smoke.test.js (mismas variables, no se
// agrega ninguna nueva).
//
// Ninguna prueba de este archivo revela una contraseña real ni escribe en
// accesos_log: el camino que se ejerce termina en un rechazo de permiso o
// en un no_existe, los dos antes del descifrado y antes del log. Los
// mensajes de fallo imprimen solo booleanos, status HTTP y códigos de error
// constantes — nunca el payload devuelto (ver la autoauditoría en la
// cabecera de _autorizacion-helpers.js).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getClient } from '../../src/api/client.js';

const BASE_URL = import.meta.env.VITE_INSFORGE_URL;
const ANON_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY;

// uuid v4 sintácticamente válido y con certeza inexistente (el mismo que ya
// usa autorizacion-roles.smoke.test.js para este propósito).
const CUENTA_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

// Todas las cuentas de staff de prueba que el repo ya define, menos la
// inactiva (ver LÍMITE CONOCIDO). Cada una aporta un caso distinto: la
// genérica nace con credenciales.ver otorgado (migración 060, default
// opt-out) → las dos rutas deben decir "sí"; la restringida lo tiene
// revocado a mano → las dos deben decir "no".
const CUENTAS = [
  {
    etiqueta: 'staff genérico de CI (credenciales.ver otorgado por defecto)',
    envs: 'INSFORGE_TEST_STAFF_EMAIL/PASSWORD',
    email: process.env.INSFORGE_TEST_STAFF_EMAIL,
    password: process.env.INSFORGE_TEST_STAFF_PASSWORD,
  },
  {
    etiqueta: 'ASISTENTE con credenciales.ver revocado',
    envs: 'INSFORGE_TEST_ASISTENTE_SIN_MODULO_EMAIL/PASSWORD',
    email: process.env.INSFORGE_TEST_ASISTENTE_SIN_MODULO_EMAIL,
    password: process.env.INSFORGE_TEST_ASISTENTE_SIN_MODULO_PASSWORD,
  },
  {
    etiqueta: 'JEFE con fila de accesos_sensibles',
    envs: 'INSFORGE_TEST_JEFE_CON_FILA_EMAIL/PASSWORD',
    email: process.env.INSFORGE_TEST_JEFE_CON_FILA_EMAIL,
    password: process.env.INSFORGE_TEST_JEFE_CON_FILA_PASSWORD,
  },
  {
    etiqueta: 'JEFE sin fila de accesos_sensibles',
    envs: 'INSFORGE_TEST_JEFE_SIN_FILA_EMAIL/PASSWORD',
    email: process.env.INSFORGE_TEST_JEFE_SIN_FILA_EMAIL,
    password: process.env.INSFORGE_TEST_JEFE_SIN_FILA_PASSWORD,
  },
];

async function iniciarSesion(email, password, etiqueta) {
  const { error } = await getClient().auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`No se pudo iniciar sesión con la cuenta "${etiqueta}": ${error.message}`);
  }
}

async function cerrarSesion() {
  await getClient().auth.signOut();
}

// user_id + rol de la sesión actual. El rol sale de la propia fila de staff
// (la RLS de `staff` deja a cada staff leer la suya, migración 061), igual
// que hace el store de auth al arrancar la app.
async function identidadDeLaSesion() {
  const { data: userData, error: eUser } = await getClient().auth.getCurrentUser();
  if (eUser || !userData?.user?.id) {
    throw new Error(`no se pudo resolver la sesión: ${eUser?.message || 'sin usuario'}`);
  }
  const userId = userData.user.id;
  const { data: fila, error: eStaff } = await getClient().database
    .from('staff')
    .select('rol')
    .eq('user_id', userId)
    .maybeSingle();
  if (eStaff || !fila?.rol) {
    throw new Error(`no se pudo leer la fila de staff propia: ${eStaff?.code || 'sin fila'}`);
  }
  return { userId, rol: fila.rol };
}

// Ruta A — la función SQL. Un error acá también es una divergencia real
// (la edge function seguiría funcionando mientras la ruta SQL quedó
// inservible), así que se falla con el código, no se omite.
async function rutaFuncionSql(userId) {
  const { data, error } = await getClient().database
    .rpc('tiene_permiso_credenciales_ver', { p_staff_user_id: userId });
  if (error) {
    throw new Error(
      `la RPC tiene_permiso_credenciales_ver falló para una sesión de staff válida — ${error.code}: ${error.message}`,
    );
  }
  // Algunas versiones del SDK envuelven el escalar en un array de una fila;
  // cualquier otra forma es drift del contrato y tiene que verse en rojo.
  const valor = Array.isArray(data) ? data[0] : data;
  if (typeof valor !== 'boolean') {
    throw new Error(
      `tiene_permiso_credenciales_ver ya no devuelve un booleano (llegó ${typeof valor}) — cambió la firma de la función SQL`,
    );
  }
  return valor;
}

// Ruta B — la edge function. true = pasó los gates de permiso; false = 403.
async function rutaEdgeFunction() {
  const { data, error } = await getClient().functions.invoke('credenciales', {
    body: { action: 'revelar', cuentaId: CUENTA_INEXISTENTE, motivo: 'ver' },
  });
  if (error) {
    if (error.statusCode === 403) return false;
    throw new Error(
      `la acción "revelar" de "credenciales" respondió un status no concluyente para este test: ${error.statusCode}`,
    );
  }
  if (data?.code === 'no_existe') return true;
  throw new Error(
    `la acción "revelar" de "credenciales" respondió 200 con un code inesperado: ${data?.code || '(sin code)'}`,
  );
}

async function tieneModulo(userId, modulo) {
  const { data, error } = await getClient().database
    .from('staff_modulos_permisos')
    .select('modulo')
    .eq('staff_user_id', userId)
    .eq('modulo', modulo)
    .maybeSingle();
  if (error) {
    throw new Error(`no se pudo leer staff_modulos_permisos propio: ${error.code}: ${error.message}`);
  }
  return !!data;
}

function mensajeDivergencia(etiqueta, rutaA, rutaB) {
  return (
    `credenciales.ver quedó DESINCRONIZADO para "${etiqueta}": ` +
    `tiene_permiso_credenciales_ver (SQL, migración 060) dice ${rutaA} y ` +
    `tienePermisoCredenciales (functions/credenciales.ts) dice ${rutaB}. ` +
    'Las dos implementaciones son copias deliberadas de la misma regla: mover una exige mover la otra.'
  );
}

for (const cuenta of CUENTAS) {
  const listo = Boolean(cuenta.email && cuenta.password && BASE_URL && ANON_KEY);

  if (!listo) {
    // eslint-disable-next-line no-console
    console.warn(
      `[integración] Falta ${cuenta.envs} (o VITE_INSFORGE_URL/ANON_KEY): se omite la comparación de credenciales.ver para "${cuenta.etiqueta}".`,
    );
  }

  describe.skipIf(!listo)(`credenciales.ver sincronizado — ${cuenta.etiqueta}`, () => {
    beforeAll(() => iniciarSesion(cuenta.email, cuenta.password, cuenta.etiqueta));
    afterAll(cerrarSesion);

    it('la función SQL y functions/credenciales.ts responden lo mismo', async (ctx) => {
      const { userId, rol } = await identidadDeLaSesion();
      const rutaA = await rutaFuncionSql(userId);

      if (rol === 'JEFE') {
        // La edge function corta por rol antes de mirar staff_permisos; la
        // función SQL no. La igualdad no aplica — se verifica lo que sí es
        // determinista: el atajo por rol sigue en pie.
        const rutaB = await rutaEdgeFunction();
        expect(
          rutaB,
          'un JEFE fue rechazado por credenciales.ver: desapareció el atajo `rol === "JEFE"` de tienePermisoCredenciales',
        ).toBe(true);
        return;
      }

      if (!(await tieneModulo(userId, 'correos'))) {
        ctx.skip(
          'la cuenta no tiene el módulo "correos": el 403 de "revelar" no distingue credenciales.ver del gate de módulo, ' +
            'y un test que igual comparara pasaría por el motivo equivocado.',
        );
        return;
      }

      const rutaB = await rutaEdgeFunction();
      expect(rutaB, mensajeDivergencia(cuenta.etiqueta, rutaA, rutaB)).toBe(rutaA);
    });
  });
}
