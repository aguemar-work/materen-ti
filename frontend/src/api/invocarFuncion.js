// Mecánica compartida de las 3 vías del frontend a una edge function
// (credenciales, tickets, encuestas): invocar, distinguir fallo de
// transporte de error de negocio, y reintentar la MISMA petición tras el
// fallback global de "sin conexión".
//
// Hasta 2026-08-31 cada uno de esos 3 archivos tenía su propia copia de
// esta función, casi idéntica pero ya divergida (solo `passwords.js`
// soportaba `reintentarRed`; solo `tickets`/`encuestas` adjuntaban `.code`
// al error). Un fix del reintento había que aplicarlo tres veces a mano y
// nada avisaba si se olvidaba una. Lo que sigue viviendo en cada archivo es
// lo que de verdad es propio del dominio: su mapa de códigos → mensaje.
// `client.js` directo y no el barrel `insforge.js`: mismo criterio que los
// 18 `domains/*.js`, y acá además rompe un ciclo real de imports —
// insforge.js → domains/cuentas.js → passwords.js → este archivo →
// insforge.js. Funcionaba solo porque `getClient()` se llama en runtime y
// no al inicializar el módulo (ARQ-15, ver docs/HISTORIAL-AUDITORIAS.md).
import { getClient } from './client.js';
import { esErrorRed, esperarReintento, MENSAJE_ERROR_RED } from '../core/error-red.js';
import { traducirErrorDb } from './erroresDb.js';

// nombre: edge function a invocar ('credenciales' | 'tickets' | 'encuestas').
// mensajeError: (code) => texto para el usuario ante { ok:false, code }.
export function crearInvocador(nombre, mensajeError) {
  // reintentarRed: false para llamadas en segundo plano (ej. auditoría fire
  // and forget) que no deben disparar el fallback global de "sin conexión".
  async function invocar(body, opciones = {}) {
    const { reintentarRed = true } = opciones;
    const { data, error } = await getClient().functions.invoke(nombre, { body });
    if (error) {
      // Fallo de transporte (sin red, DNS caído, timeout): fallback global
      // con reintento de ESTA misma petición (core/error-red.js). Distinto
      // de un error de negocio { ok:false, code }, que maneja cada vista.
      if (esErrorRed(error)) {
        if (!reintentarRed) throw new Error(MENSAJE_ERROR_RED);
        try {
          await esperarReintento();
        } catch {
          throw new Error(MENSAJE_ERROR_RED);
        }
        return invocar(body, opciones);
      }
      // Error de negocio con status >= 400 (401/403/429/500...): desde que
      // las 4 edge functions espejan `code` en `error` (Ciclo 20 bis), el SDK
      // conserva las claves del body sobre el InsForgeError que lanza. Mismo
      // tratamiento que el `!data?.ok` de abajo — antes de este cambio,
      // CUALQUIER código de error no-2xx (sesión expirada, sin permiso,
      // rate-limit, error interno) llegaba como "Request failed: <statusText>"
      // en inglés, nunca como el mensaje en español del dominio.
      if (error.code) {
        const e = new Error(mensajeError(error.code));
        e.code = error.code;
        throw e;
      }
      // Sin `code` de dominio: sesión vencida, 403, texto técnico en inglés del
      // gateway… se traducen con la capa única (erroresDb.js). Un mensaje ya
      // legible en español pasa tal cual.
      throw new Error(traducirErrorDb(error, { porDefecto: `Error en el servidor de ${nombre}` }).mensaje);
    }
    if (!data?.ok) {
      const e = new Error(mensajeError(data?.code));
      e.code = data?.code;
      throw e;
    }
    return data;
  }

  return invocar;
}
