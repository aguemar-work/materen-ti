// Avatar de iniciales — tono e iniciales de una persona.
//
// Existe para que las 6 vistas que dibujan un avatar no vuelvan a resolver
// esto cada una por su cuenta: hasta el rediseño Materen (Fase 1) había tres
// implementaciones de CSS (.avatar, .sb-user-avatar, .emp-avatar) y cuatro
// funciones de iniciales, dos de ellas idénticas carácter por carácter
// (TicketsView.vue y TicketDetallePanel.vue).
//
// El CSS de los tonos vive en main.css (.avatar--*), documentado en
// docs/GUIA-UX-UI.md.

// El orden importa: es lo que fija qué tono le toca a cada nombre. Reordenar
// o insertar un tono en el medio le cambia el color a gente que ya lo tenía
// asignado — no es un bug, pero tampoco es gratis. Agregar al final es el
// cambio menos disruptivo.
const TONOS_AVATAR = ['avatar--azul', 'avatar--slate', 'avatar--teal', 'avatar--violeta', 'avatar--arena'];

/**
 * Deriva un tono determinístico de un nombre completo — la misma persona
 * cae siempre en el mismo tono en cualquier parte de la app. Sin nombre
 * (usuario desconocido/eliminado) devuelve el neutro, nunca uno de los 5
 * categóricos ni un color semántico (success/warning/danger): un avatar
 * teñido de "danger" leería como una alerta sobre esa persona.
 *
 * El hash es un djb2-ish con multiplicador 31 y `>>> 0` para quedarse en
 * enteros de 32 bits sin signo — no necesita ser criptográfico ni estar bien
 * distribuido, solo ser estable: el mismo string debe dar el mismo tono en
 * cada render, en cada sesión y en cada navegador.
 *
 * @param {string} nombre Nombre completo ("Nombres Apellidos"); también sirve
 *   un correo si es lo único que hay.
 * @returns {string} clase CSS a combinar con `.avatar`
 */
export function tonoAvatar(nombre) {
  if (!nombre) return 'avatar--neutro';
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0;
  return TONOS_AVATAR[hash % TONOS_AVATAR.length];
}

/**
 * Iniciales para un avatar: primera letra de las dos primeras palabras del
 * nombre completo, en mayúscula.
 *
 * Mayúsculas en JS y no con `text-transform` en CSS a propósito: `.avatar` no
 * trae text-transform, así que una vista que lo diera por sentado renderizaba
 * minúsculas (le pasaba a .emp-avatar, que sí lo traía en su CSS local, antes
 * de unificar la familia).
 *
 * Para un empleado, cuyos nombres y apellidos son campos separados, pasar
 * `nombreCompleto(emp)` de core/dominio-empleados.js: devuelve
 * "Nombres Apellidos", el mismo orden que asume esta función.
 *
 * @param {string} nombre
 * @returns {string} 0, 1 o 2 letras — nunca más
 */
export function inicialesDe(nombre) {
  if (!nombre) return '';
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase();
}
