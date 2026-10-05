// Normaliza la `variante` de un tag/badge — función pura, sin componente.
// Extraída de components/carbon/CarbonTag.vue (reinicio de diseño,
// 2026-09-05). Acepta tanto el rol semántico solo ('success') como la clase
// completa que devuelven los `core/dominio-*` ('badge--success'), y cae a
// 'neutral' si viene vacío (dos resolvers de dominio devuelven `clase: ''`
// cuando el valor no está en su mapa — "no sabemos qué es esto" reusa el
// gris neutro en vez de quedar sin ningún estado visual).
//
// La clase puede traer modificadores después del rol ('badge--neutral
// badge--rango': prioridad y severidad); el rol es SIEMPRE el primer token.
// Acepta también un tono semántico de core/tonos.js ('ok', 'accion'...) y lo
// traduce al nombre histórico que entiende AppTag.
import { esTono, TONOS } from './tonos.js';

export function rolDeTag(variante) {
  const primero = String(variante ?? '').trim().split(/\s+/)[0].replace('badge--', '');
  if (!primero) return 'neutral';
  return esTono(primero) ? TONOS[primero].apptag : primero;
}

// ¿La clase de dominio pide el tag "de rango" (mayúsculas semibold con
// tracking)? Solo prioridad y severidad (core/tonos.js → claseBadge).
export function esRango(variante) {
  return String(variante ?? '').split(/\s+/).includes('badge--rango');
}
