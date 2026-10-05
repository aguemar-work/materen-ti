// Lado servidor FALSO de lo público y de los adjuntos de la edge function
// `tickets` para la maqueta (`npm run dev:maqueta`): el seguimiento por token y
// la captura adjunta en un bucket PRIVADO (migración 111), que solo se abre con
// una URL firmada de corta vida. Opera sobre la base en memoria de client.js.
// NADA de esto entra al bundle de producción (solo lo importa client.js, que
// solo carga el plugin del modo maqueta).

const SEGUNDOS_URL = 300;

// "URL firmada" de la maqueta: un objeto local con una imagen de ejemplo. No
// sale nada del navegador ni hay un bucket real detrás.
function capturaDeMaqueta() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">',
    '<rect width="640" height="360" fill="#f3f4f6"/>',
    '<rect x="24" y="24" width="592" height="40" rx="6" fill="#d1d5db"/>',
    '<text x="320" y="190" font-family="Inter, Arial, sans-serif" font-size="22" text-anchor="middle" fill="#374151">Captura de ejemplo (maqueta)</text>',
    '<text x="320" y="222" font-family="Inter, Arial, sans-serif" font-size="14" text-anchor="middle" fill="#6b7280">Sin datos reales. En producción: URL firmada de 5 minutos.</text>',
    '</svg>',
  ].join('');
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}

export function funcionTickets(db, body = {}) {
  const accion = body.action;

  // Staff con el módulo tickets abre la captura de un ticket (el JEFE ficticio siempre puede).
  if (accion === 'adjuntoStaff') {
    const t = (db.tickets || []).find((x) => x.id === body.ticketId);
    if (!t?.adjunto_key) return { ok: false, code: 'no_existe' };
    return { ok: true, url: capturaDeMaqueta(), expiraSegundos: SEGUNDOS_URL };
  }

  // Seguimiento público por token: lo mismo que devuelve la function, con la
  // captura como URL firmada (nunca la key del objeto).
  if (accion === 'seguimiento') {
    const t = (db.tickets || []).find((x) => x.token === body.token);
    if (!t) return { ok: false, code: 'no_existe' };
    const cat = (db.categorias_ticket || []).find((c) => c.id === t.categoria_id);
    const sub = (db.subcategorias_ticket || []).find((c) => c.id === t.subcategoria_id);
    const comentarios = (db.ticket_comentarios || [])
      .filter((c) => c.ticket_id === t.id && !c.interno)
      .map((c) => ({ mensaje: c.mensaje, fecha: c.created_at, autor: 'Soporte TI' }));
    return {
      ok: true,
      codigo: t.codigo,
      titulo: t.titulo,
      descripcion: t.descripcion,
      estado: t.estado,
      categoria: cat?.nombre || '',
      subcategoria: sub?.nombre || '',
      creado: t.created_at,
      actualizado: t.updated_at,
      comentarios,
      adjuntoUrl: t.adjunto_key ? capturaDeMaqueta() : null,
      adjuntoExpiraSegundos: t.adjunto_key ? SEGUNDOS_URL : null,
    };
  }

  return null;
}
