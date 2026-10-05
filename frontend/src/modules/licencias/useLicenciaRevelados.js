// Revelado de la credencial de cada licencia del listado. La petición a la edge
// function `credenciales` (auditoría en accesos_log con el motivo, cuenta
// regresiva de 8 segundos y ocultado automático) vive en
// composables/useRevelado.js; acá solo se declara QUÉ credencial se revela
// (una instancia por licencia) y se oculta todo al perder el permiso, al
// cambiar de pestaña o al desmontar. Extraído de LicenciasView.vue.
import { watch, onBeforeUnmount } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { revelarClaveLicencia, revelarPassword } from '../../api/passwords.js';
import { crearRevelado, escucharOcultamientoPorCambioDePestana } from '../../composables/useRevelado.js';

// La contraseña de la licencia: la propia (clave) si tiene una; si es una
// licencia con login sin clave propia, se entra con la contraseña del correo
async function revelarDeLicencia(licencia, motivo) {
  if (licencia.tiene_clave) return revelarClaveLicencia(licencia.id, motivo);
  if (licencia.cuenta_id) return revelarPassword(licencia.cuenta_id, motivo);
  return '';
}

export function useLicenciaRevelados() {
  const auth = useAuthStore();
  const revelados = new Map();

  function revelarDe(lic) {
    if (!revelados.has(lic.id)) {
      revelados.set(lic.id, crearRevelado({
        revelar: (motivo) => revelarDeLicencia(lic, motivo),
        etiqueta: lic.tiene_clave ? 'contraseña del software' : 'contraseña del correo',
      }));
    }
    return revelados.get(lic.id);
  }

  watch(() => auth.puedeVerCredenciales, (puede) => {
    if (!puede) revelados.forEach((r) => r.ocultar());
  });
  const detenerOcultamiento = escucharOcultamientoPorCambioDePestana(() => [...revelados.values()]);
  onBeforeUnmount(() => {
    detenerOcultamiento();
    revelados.forEach((r) => r.ocultar());
  });

  return { revelarDe };
}
