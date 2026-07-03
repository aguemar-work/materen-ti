// Tema claro/oscuro del panel. La preferencia se guarda por navegador
// en localStorage; sin preferencia guardada se respeta la del sistema.

const CLAVE = 'sistema-ti-tema';

export function temaActual() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function aplicarTema(tema) {
  if (tema === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function alternarTema() {
  const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
  aplicarTema(nuevo);
  localStorage.setItem(CLAVE, nuevo);
  return nuevo;
}

// Llamar ANTES de montar la app para evitar el parpadeo de tema
export function initTema() {
  const guardado = localStorage.getItem(CLAVE);
  const preferido = guardado
    || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  aplicarTema(preferido);
}
