// Filtros de un listado sincronizados con la URL (V2, 2026-09-25).
//
// La URL es la fuente de verdad del filtro: `?estado=Inactivo&empresa=a,b`.
// Recargar, volver atrás, abrir en otra pestaña o compartir el enlace
// muestra exactamente la misma vista filtrada, y los enlaces de Inicio
// ("Dados de baja" → /empleados?estado=Inactivo) usan el mismo mecanismo
// que cualquier otro filtro, en vez de un parámetro leído a mano por vista.
//
// Efecto de arquitectura: el "filtro fantasma" (el store paginado conserva
// un filtro que la pantalla ya no muestra, gotcha de `resetearFiltros()`
// en AGENTS.md) deja de ser posible por construcción — lo que se aplica es
// siempre lo que dice la URL.
//
// esquema: { clave: { tipo, defecto? } }
//   tipo 'valor' — un string (vista, estado). Igual a `defecto` = no va a la URL.
//   tipo 'texto' — búsqueda libre.
//   tipo 'lista' — varios valores (chips de AppFiltros), `a,b,c` en la URL.
//
// Usa `router.replace` (no push): cambiar un filtro no agrega una entrada
// de historial — "atrás" vuelve a la página anterior, no al filtro anterior.
import { reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function useFiltrosUrl(esquema) {
  const route = useRoute();
  const router = useRouter();
  // Los watchers solo actúan sobre la ruta donde se montó el listado: al
  // navegar a otra pantalla, el query nuevo no es de este listado (sin esta
  // guarda, el watcher podía reescribir la URL de la página de destino).
  const rutaPropia = route.path;
  const claves = Object.keys(esquema);

  function vacio(clave) {
    return esquema[clave].tipo === 'lista' ? [] : (esquema[clave].defecto ?? '');
  }

  function leer(query) {
    const estado = {};
    for (const clave of claves) {
      const crudo = Array.isArray(query[clave]) ? query[clave][0] : query[clave];
      const texto = crudo == null ? '' : String(crudo);
      if (esquema[clave].tipo === 'lista') estado[clave] = texto ? texto.split(',').filter(Boolean) : [];
      else estado[clave] = texto || vacio(clave);
    }
    return estado;
  }

  function aQuery(estado) {
    const query = { ...route.query };
    for (const clave of claves) {
      const v = estado[clave];
      const esVacio = esquema[clave].tipo === 'lista' ? !v.length : v === vacio(clave);
      if (esVacio) delete query[clave];
      else query[clave] = esquema[clave].tipo === 'lista' ? v.join(',') : v;
    }
    return query;
  }

  const firma = (q) => JSON.stringify(claves.map((k) => q[k] ?? null));

  const filtros = reactive(leer(route.query));

  watch(filtros, () => {
    if (route.path !== rutaPropia) return;
    const query = aQuery(filtros);
    if (firma(query) !== firma(route.query)) router.replace({ query });
  }, { deep: true });

  // Cambios que llegan desde afuera: atrás/adelante, o un enlace a esta
  // misma pantalla con otro filtro mientras ya estaba abierta.
  watch(() => route.query, (query) => {
    if (route.path !== rutaPropia) return;
    const nuevo = leer(query);
    for (const clave of claves) {
      if (JSON.stringify(nuevo[clave]) !== JSON.stringify(filtros[clave])) filtros[clave] = nuevo[clave];
    }
  });

  // Vuelve a los valores por defecto (todas las claves, o las indicadas).
  function limpiar(soloClaves = claves) {
    for (const clave of soloClaves) filtros[clave] = vacio(clave);
  }

  // ¿Alguna de estas claves se aparta de su valor por defecto?
  function hayActivos(soloClaves = claves) {
    return soloClaves.some((clave) => {
      const v = filtros[clave];
      return esquema[clave].tipo === 'lista' ? v.length > 0 : v !== vacio(clave);
    });
  }

  return { filtros, limpiar, hayActivos };
}
