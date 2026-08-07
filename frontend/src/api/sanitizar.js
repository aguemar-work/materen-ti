// PostgREST usa , ( ) para delimitar condiciones y listas dentro del string
// de .or()/.in(); se neutralizan para que un término con esos caracteres no
// pueda alterar el filtro (auditoría H-07, que señala específicamente
// ",()" como lo peligroso). El punto NO se neutraliza: buscar una cuenta o
// correo por su dirección completa (ej. "usuario@dominio.com") es un caso de
// uso real y el punto no rompe la sintaxis del filtro. Único punto de
// saneado para TODA búsqueda que viaje al servidor (búsqueda global y
// listados paginados).
export function sanitizarTermino(query) {
  return String(query || '')
    .trim()
    .toLowerCase()
    .replace(/[,()*:%\\"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
