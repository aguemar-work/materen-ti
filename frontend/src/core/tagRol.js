// Normaliza la `variante` de un tag/badge — función pura, sin componente.
// Extraída de components/carbon/CarbonTag.vue (reinicio de diseño,
// 2026-09-05). Acepta tanto el rol semántico solo ('success') como la clase
// completa que devuelven los `core/dominio-*` ('badge--success'), y cae a
// 'neutral' si viene vacío (dos resolvers de dominio devuelven `clase: ''`
// cuando el valor no está en su mapa — "no sabemos qué es esto" reusa el
// gris neutro en vez de quedar sin ningún estado visual).
export function rolDeTag(variante) {
  return String(variante ?? '').replace('badge--', '') || 'neutral';
}
