// Revelado auditado de las contraseñas de una lista de cuentas (la lógica que
// vivía en CuentasPanel.vue, extraída al pasar las cuentas a la tabla "En
// custodia" del expediente). El revelado en sí (temporizador de 8 s, distinguir
// "ver" de "copiar" para el log de seguridad) es composables/useRevelado.js: una
// instancia por fila, creada perezosamente. La barrera real está en la edge
// function `credenciales`; esto solo pide y muestra.
//
// Reglas del servidor (functions/credenciales.ts), en orden:
//  1. Permiso individual "credenciales.ver" (migración 060): sin él, nadie que
//     no sea JEFE revela ninguna contraseña, sin importar el tipo.
//  2. Una cuenta "personal" se entrega a un empleado, no la revela el ASISTENTE
//     aunque tenga el permiso de arriba: solo JEFE. Compartida y reutilizable
//     sí, porque el ASISTENTE las opera directamente.
import { onBeforeUnmount, watch } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { revelarPassword } from '../../api/passwords.js';
import { crearRevelado, escucharOcultamientoPorCambioDePestana } from '../../composables/useRevelado.js';

export function useRevelados() {
  const auth = useAuthStore();
  const revelados = new Map();

  function revelarDe(cuenta) {
    if (!revelados.has(cuenta.asignacion_id)) {
      revelados.set(cuenta.asignacion_id, crearRevelado({
        revelar: (motivo) => revelarPassword(cuenta.cuenta_id, motivo),
        etiqueta: 'contraseña',
      }));
    }
    return revelados.get(cuenta.asignacion_id);
  }

  // Cambiar de pestaña oculta cualquier contraseña a la vista.
  const detenerOcultamiento = escucharOcultamientoPorCambioDePestana(() => [...revelados.values()]);
  onBeforeUnmount(() => {
    detenerOcultamiento();
    revelados.forEach((r) => r.ocultar());
  });

  // Si el permiso se cae mientras una credencial está a la vista, se oculta.
  watch(() => auth.puedeVerCredenciales, (puede) => {
    if (!puede) revelados.forEach((r) => r.ocultar());
  });

  function puedeRevelar(cuenta) {
    return auth.puedeVerCredenciales && (auth.esJefe || cuenta.tipo_cuenta !== 'personal');
  }

  // Motivo del candado, para el título/aria-label del ícono: distingue las dos
  // reglas de arriba en vez de un mensaje genérico.
  function motivoBloqueo() {
    if (!auth.puedeVerCredenciales) return 'Sin permiso para ver contraseñas.';
    return 'Solo un JEFE puede ver esta contraseña. Use "Enviar accesos" para entregarla al empleado.';
  }

  return { revelarDe, puedeRevelar, motivoBloqueo };
}
