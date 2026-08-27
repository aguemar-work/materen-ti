// Preferencia de vista (Tabla/Lista/Tarjetas/Isla, según el módulo),
// guardada por navegador en localStorage — mismo patrón que el tema
// claro/oscuro (core/tema.js) y el colapso del sidebar (AppLayout.vue).
// Arranca siempre en 'tabla' salvo que el usuario ya haya elegido otra
// cosa antes PARA ESE módulo — nunca por defecto en Isla/Lista/Tarjetas.
import { ref, watch } from 'vue';

function claveVista(modulo) {
  return `sistema-ti-vista-${modulo}`;
}

// valoresValidos: opciones que ese módulo realmente soporta (ej. Tickets
// solo 'tabla'/'isla'; Empleados 'tabla'/'lista'/'tarjetas') — si el
// localStorage trae un valor de otro módulo o de una versión anterior con
// menos opciones, se ignora y cae al default en vez de dejar la vista en
// un estado inválido.
export function useVistaModulo(modulo, valoresValidos) {
  const clave = claveVista(modulo);
  const guardado = localStorage.getItem(clave);
  const vista = ref(guardado && valoresValidos.includes(guardado) ? guardado : 'tabla');

  watch(vista, (nuevo) => {
    localStorage.setItem(clave, nuevo);
  });

  return { vista };
}
