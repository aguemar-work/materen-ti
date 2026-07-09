// PostgREST interpreta , . ( ) * : % como sintaxis dentro del string de
// .or()/.ilike(); se neutralizan para que un término con esos caracteres
// no pueda alterar el filtro (auditoría H-07). Un buscador de nombres/
// códigos/DNI no los necesita. Único punto de saneado para TODA búsqueda
// que viaje al servidor (búsqueda global y listados paginados).
export function sanitizarTermino(query) {
  return String(query || '')
    .trim()
    .toLowerCase()
    .replace(/[,.()*:%\\"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
