// Smoke test de INTEGRACIÓN: demuestra que un usuario ANÓNIMO (sin sesión,
// solo la anon key pública) no puede leer tablas internas ni ejecutar RPC
// sensibles contra el backend real. A diferencia de tickets-api/embeds
// smoke.test.js, este archivo NO necesita la cuenta de staff dedicada a
// CI — solo VITE_INSFORGE_URL/VITE_INSFORGE_ANON_KEY, que ya hacen falta
// para el build. Corre siempre que el proyecto esté configurado, incluso
// en local sin las credenciales de staff de prueba.
//
// Alcance: demuestra los objetivos 3 (anónimo sin acceso a datos internos)
// y 4 (RPC sensibles rechazan ejecución sin autorización) de la auditoría
// de autorización — ver la matriz de autorización (artefacto publicado) y
// docs/HISTORIAL-AUDITORIAS.md. No requiere fixtures: no escribe nada que
// necesite limpieza (todos los intentos de escritura deben fallar; si
// alguno lograra insertar, sería en sí mismo el hallazgo a reportar, y se
// eliminaría a mano antes de cerrar el hallazgo, nunca en este archivo).
//
// IMPORTANTE — no convertir estas pruebas en expectativas débiles: los
// helpers de `_autorizacion-helpers.js` exigen un rechazo específico de
// autorización (SQLSTATE 42501, o P0001 con el mensaje del guard, o el
// status HTTP real de la edge function) — nunca "hubo algún error" a
// secas. Ver el comentario de cabecera de ese archivo para la evidencia
// real (verificada en vivo) de por qué. Endurecido 2026-08-18, autoauditoría
// posterior al Ciclo 11.
import { describe, it } from 'vitest';
import { esperarSinAcceso, esperarInsertRechazado, esperarRpcRechazada } from './_autorizacion-helpers.js';

const BASE_URL = import.meta.env.VITE_INSFORGE_URL;
const ANON_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY;
const listo = Boolean(BASE_URL && ANON_KEY);

if (!listo) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integración] Faltan VITE_INSFORGE_URL/VITE_INSFORGE_ANON_KEY: se omiten las pruebas negativas de autorización anónima.',
  );
}

// UUID con formato válido pero que no corresponde a ningún registro real —
// para las RPC/inserts cuyo guard de autorización se espera que rechace
// ANTES de llegar a buscar el recurso (verificado leyendo el SQL real de
// cada función: el `if not es_staff()`/`if not es_jefe()` es la primera
// línea ejecutable en las 8 funciones SECURITY DEFINER de este archivo).
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!listo)('autorización — anónimo no accede a datos internos', () => {
  it.each([
    'staff',
    'staff_modulos_permisos',
    'staff_permisos',
    'accesos_sensibles',
    'accesos_sensibles_permisos',
    'accesos_log',
    'empleados',
    'cuentas',
    'licencias',
    'equipos',
    'tickets',
    'problemas',
    'kb_articulos',
    'encuestas',
  ])('lectura de "%s" — 0 filas o error', async (tabla) => {
    await esperarSinAcceso(tabla);
  });

  it('inserción en staff_modulos_permisos — rechazada (with check es_jefe())', async () => {
    await esperarInsertRechazado('staff_modulos_permisos', {
      staff_user_id: UUID_INEXISTENTE,
      modulo: 'tickets',
    });
  });

  it('inserción en staff_permisos (credenciales.ver) — rechazada (with check es_jefe())', async () => {
    await esperarInsertRechazado('staff_permisos', {
      staff_user_id: UUID_INEXISTENTE,
      permiso: 'credenciales.ver',
    });
  });

  it('inserción en empleados — rechazada (sin sesión de staff)', async () => {
    // Fila deliberadamente incompleta (sin empresa_id): el error puede venir
    // de la RLS o de la FK/NOT NULL — no se distingue acá, y no importa para
    // esta prueba. Lo que se afirma es que un anónimo NUNCA logra insertar,
    // sea por la razón que sea; distinguir la causa exacta requeriría una
    // fila 100% válida, que un anónimo no puede armar (tampoco puede leer
    // "empresas" para conseguir un id real).
    await esperarInsertRechazado('empleados', {
      nombres: '__TEST_CI__ Anonimo',
      apellidos: 'No debería insertarse',
      dni: '00000000',
    });
  });

  it('inserción en accesos_sensibles — rechazada (with check es_jefe())', async () => {
    await esperarInsertRechazado('accesos_sensibles', {
      nombre: '__TEST_CI__ Acceso anonimo',
      categoria: 'otro',
      usuario: '__test_ci__',
    });
  });
});

describe.skipIf(!listo)('autorización — RPC sensibles rechazan ejecución sin sesión', () => {
  it('dar_baja_empleado — rechazada', async () => {
    await esperarRpcRechazada('dar_baja_empleado', { p_empleado_id: UUID_INEXISTENTE });
  });

  it('kb_registrar_feedback — rechazada', async () => {
    await esperarRpcRechazada('kb_registrar_feedback', { p_articulo_id: UUID_INEXISTENTE, p_util: true });
  });

  it('cerrar_ticket — rechazada', async () => {
    await esperarRpcRechazada('cerrar_ticket', { p_ticket_id: UUID_INEXISTENTE });
  });

  it('staff_nombres — rechazada', async () => {
    await esperarRpcRechazada('staff_nombres', undefined);
  });

  it('reporte_tickets — rechazada', async () => {
    const hoy = new Date().toISOString();
    await esperarRpcRechazada('reporte_tickets', { p_desde: hoy, p_hasta: hoy });
  });

  it('reporte_tickets_resumen — rechazada', async () => {
    const hoy = new Date().toISOString();
    await esperarRpcRechazada('reporte_tickets_resumen', { p_desde: hoy, p_hasta: hoy });
  });

  it('reporte_satisfaccion_consolidado — rechazada', async () => {
    await esperarRpcRechazada('reporte_satisfaccion_consolidado', undefined);
  });

  // HALLAZGO ya reportado en la matriz de autorización (2026-08-18):
  // tiene_permiso_modulo(text) es la única función SECURITY DEFINER del
  // sistema sin `revoke ... from public` — queda con EXECUTE abierto a
  // PUBLIC/anon por defecto. Esta prueba EXPRESA el comportamiento seguro
  // esperado (que debería rechazar), no el actual — se deja en rojo a
  // propósito en vez de debilitarla, para que quede un test ejecutable
  // del hallazgo hasta que se corrija con su propia migración (ver
  // "correcciones recomendadas", no incluidas en este cambio).
  it('tiene_permiso_modulo — debería rechazar ejecución anónima (hoy no lo hace, ver hallazgo)', async () => {
    await esperarRpcRechazada('tiene_permiso_modulo', { p_modulo: 'tickets' });
  });
});
