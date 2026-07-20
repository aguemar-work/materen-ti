// Flecha "volver" de las fichas de detalle: retrocede al historial real
// dentro de la app (Vue Router deja rastro en window.history.state.back)
// para no romper el contexto de quien llegó desde un link externo a su
// listado propio (ej. nombre de empleado enlazado desde Tickets, Correos,
// Licencias, Equipos, Dashboard). Sin historial propio (link directo,
// refresco, pestaña nueva), cae al listado canónico de la entidad.
import { useRouter } from 'vue-router';

export function useVolverContextual() {
  const router = useRouter();

  function volver(rutaFallback) {
    if (window.history.state?.back) router.back();
    else router.push(rutaFallback);
  }

  return { volver };
}
