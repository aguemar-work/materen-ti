// Preferencia de vista (Tabla/Lista/Tarjetas/Triage, según el módulo),
// guardada por navegador en localStorage — mismo patrón que el colapso del
// sidebar (AppLayout.vue).
// Arranca en `defecto` (default 'tabla') salvo que el usuario ya haya
// elegido otra cosa antes PARA ESE módulo — quien ya tiene una preferencia
// guardada la conserva siempre, sin importar cuál sea `defecto`.
import { ref, watch } from 'vue';

function claveVista(modulo) {
  return `sistema-ti-vista-${modulo}`;
}

// valoresValidos: opciones que ese módulo realmente soporta (ej. Tickets
// solo 'tabla'/'triage'; Empleados 'tabla'/'lista'/'tarjetas') — si el
// localStorage trae un valor de otro módulo o de una versión anterior con
// menos opciones, se ignora y cae al default en vez de dejar la vista en
// un estado inválido.
//
// `defecto` (Plan Maestro v2, Frente 2, 2026-09-04): con qué vista arranca
// alguien SIN preferencia guardada. Sigue siendo 'tabla' para todos los
// módulos existentes (Empleados, Equipos) — Tickets es el único que pasa
// 'triage', el workspace de 3 columnas es ahora su modo principal.
export function useVistaModulo(modulo, valoresValidos, defecto = 'tabla') {
  const clave = claveVista(modulo);
  const guardado = localStorage.getItem(clave);
  const vista = ref(guardado && valoresValidos.includes(guardado) ? guardado : defecto);

  watch(vista, (nuevo) => {
    localStorage.setItem(clave, nuevo);
  });

  return { vista };
}
