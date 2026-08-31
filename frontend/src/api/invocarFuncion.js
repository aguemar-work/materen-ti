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
      throw new Error(error.message || `Error en el servidor de ${nombre}`);
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
