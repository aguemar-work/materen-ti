// Verificador de contraste WCAG de los pares de color del design system.
//
// Ejecutar: node scripts/contraste.mjs
// Sale distinto de 0 si algun par no llega a su umbral. Se corre en CI
// (.github/workflows/ci.yml).
//
// Cuatro tablas, con dos umbrales:
//   CLARO / OSCURO   4.5:1 - texto (WCAG AA, texto normal)
//   SHELL            4.5:1 - texto del header y del SideNav, que son
//                    Gray 100/90 en AMBOS temas y por eso no entran en las
//                    dos tablas de arriba
//   BORDES Y FOCO    3:1   - WCAG 1.4.11, componentes no textuales
//
// Actualizar la tabla correspondiente al tocar un token semantico en
// frontend/src/styles/main.css o un token de shell en
// frontend/src/styles/carbon-theme.css.
//
// El `process.exit` del final se agrego el 2026-09-02: hasta entonces el
// script imprimia "Total fallas: N" y salia con codigo 0 SIEMPRE, asi que
// el paso de CI pasaba en verde con pares en rojo. El umbral estaba
// documentado y medido, pero no era exigible - el mismo modo de fallo que
// scripts/tokens-vs-guia.mjs existe para cerrar. Se enciende ahora porque
// con los pares de Carbon las cuatro tablas estan en verde con margen
// (5.8-7.8:1 en las semanticas); encenderlo antes habria requerido
// arreglar el sistema anterior primero.
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(n, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function luminancia([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [f(r), f(g), f(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contraste(hex1, hex2) {
  const l1 = luminancia(hexToRgb(hex1));
  const l2 = luminancia(hexToRgb(hex2));
  const [claro, oscuro] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (oscuro + 0.05);
}

// ── Tabla de pares a verificar ────────────────────────────────────────────
// Los valores son los de los tokens de Carbon v11 tal como los resuelve
// frontend/src/styles/main.css sobre frontend/src/styles/carbon-theme.css.
// Si se toca un token semántico, actualizar acá.
//
// Por qué siguen escritos a mano y no se leen del CSS: el par que hay que
// verificar es una decisión de diseño ("este texto se usa SOBRE esta
// superficie"), no algo deducible del archivo de tokens — main.css no dice
// en ningún lado que --color-sky-text vaya a aparecer sobre
// --color-accent-subtle dentro de una fila seleccionada. Cada entrada de
// abajo es esa afirmación, hecha explícita.

// TEMA CLARO — Gray 10. La superficie de un badge es --color-bg-elevated
// (blanco, layer-01); la de un texto suelto de tabla también.
const CLARO = {
  // Los siete pares semánticos son los `tag-*` de Carbon (paso 20 de fondo,
  // 70 de texto). Vienen verificados de origen y quedan entre 5.8 y 5.9:1 —
  // el sistema anterior estaba entre 4.6 y 5.3.
  success: { bg: '#a7f0ba', text: '#0e6027' },
  danger:  { bg: '#ffd7d9', text: '#a2191f' },
  info:    { bg: '#d0e2ff', text: '#0043ce' },
  purple:  { bg: '#e8daff', text: '#6929c4' },
  sky:     { bg: '#bae6ff', text: '#00539a' },
  teal:    { bg: '#9ef0f0', text: '#005d5d' },
  neutral: { bg: '#e0e0e0', text: '#161616' },
  // Advertencia: Carbon NO publica un `tag-yellow`, así que este par se
  // armó acá con Yellow 10 + Yellow 70. Es el único de los ocho que no
  // viene verificado de origen, y por eso el que más importa vigilar.
  warning: { bg: '#fcf4d6', text: '#684e00' },
  // No es un badge: --color-text-tertiary sobre --color-bg-elevated, el par
  // más ajustado de la jerarquía de texto.
  textoTerciario: { bg: '#ffffff', text: '#6f6f6f' },
  // Encabezado de tabla: --color-text-secondary sobre --color-bg-accent
  // (layer-accent-01, Gray 20). Par NUEVO del rediseño a Carbon — antes el
  // <th> se apoyaba en --color-bg-subtle, la misma superficie que un campo.
  encabezadoTabla: { bg: '#e0e0e0', text: '#525252' },
  // Los 4 niveles de IndicadorPrioridad.vue. alta/urgente son badges y ya
  // los cubren purple/danger; baja/media son TEXTO SUELTO sobre la
  // superficie de la fila.
  prioridadBaja:  { bg: '#ffffff', text: '#00539a' },
  prioridadMedia: { bg: '#ffffff', text: '#005d5d' },
  // Los mismos dos sobre la fila/tarjeta seleccionada de Tickets
  // (--color-accent-subtle = Blue 20, el `highlight` de Carbon).
  prioridadBajaFilaActiva:  { bg: '#d0e2ff', text: '#00539a' },
  prioridadMediaFilaActiva: { bg: '#d0e2ff', text: '#005d5d' },
  // Tonos de avatar (--color-avatar-*). Familia aparte de las semánticas a
  // propósito: el color de un avatar identifica a una persona, no comunica
  // estado. Usan los pasos 10/70 de Carbon, un escalón por fuera de los
  // pares 20/70 de los tags, para que un avatar violeta no se lea como un
  // tag de prioridad Alta. Se verifica el par bg/text, que es el que se lee
  // (las iniciales sobre el círculo) — no el bg contra la fila: el avatar no
  // lleva borde y su fondo mide ~1.1:1 contra blanco, lo cual es intencional
  // (el círculo es decorativo, el nombre siempre está al lado).
  avatarAzul:    { bg: '#edf5ff', text: '#0043ce' },
  avatarSlate:   { bg: '#f2f4f8', text: '#4d5358' },
  avatarTeal:    { bg: '#d9fbfb', text: '#005d5d' },
  avatarVioleta: { bg: '#f6f2ff', text: '#6929c4' },
  avatarArena:   { bg: '#fff2e8', text: '#8a3800' },
  // Chip de cuentas de un alta sin completar (.vinculo--pendiente,
  // EmpleadosView.vue): --color-warning-text como TEXTO SUELTO sobre la
  // superficie de la tabla, no dentro de una píldora --warning-bg.
  altaPendiente: { bg: '#ffffff', text: '#684e00' },
  // Fila/tarjeta seleccionada en Tickets (.fila-ticket--activa): sobre
  // --color-accent-subtle, text-tertiary NO llega, por eso la vista sube
  // esos tonos a text-secondary dentro de la fila activa. Este check vigila
  // justamente ese reemplazo.
  filaActivaTexto: { bg: '#d0e2ff', text: '#525252' },
  // Control segmentado con TEXTO (ListaVistas.vue, variante 'segmento').
  // SelectorVista.vue usa el mismo contenedor --color-bg-subtle pero sus
  // botones son solo-ícono (umbral 3:1, indicador no textual); acá los
  // segmentos llevan etiqueta, así que el mismo fondo exige 4.5:1.
  segmentoReposo:   { bg: '#f4f4f4', text: '#525252' },
  segmentoContador: { bg: '#f4f4f4', text: '#525252' },
  segmentoActivo:   { bg: '#ffffff', text: '#0043ce' },
};

// TEXTO SOBRE RELLENO SÓLIDO — tabla aparte, y el motivo es un bug real.
//
// Estos fondos son INVARIANTES entre temas (Blue 60 es Blue 60 en los cuatro
// temas de Carbon), así que su texto también tiene que serlo. Hasta el
// 2026-09-02 el botón primario usaba `--color-text-inverse`, que SÍ cambia
// con el tema: en oscuro renderizaba #161616 sobre #0f62fe, **3.41:1**, por
// debajo de AA. Y este script no lo veía porque estos pares vivían en la
// tabla CLARO afirmando el blanco que se ASUMÍA, no el que el CSS producía.
//
// Estar en su propia tabla es la corrección estructural: dice que el par no
// depende del tema, y que si alguien vuelve a atar uno de estos textos a un
// token que sí depende, el par de abajo deja de describir la realidad. El
// token correcto es `--color-text-on-color` (blanco en todos los temas).
const SOLIDOS = {
  botonPrimario:      { bg: '#0f62fe', text: '#ffffff' },  // --color-accent
  botonPrimarioHover: { bg: '#0353e9', text: '#ffffff' },  // --color-accent-hover
  botonDanger:        { bg: '#ba1b23', text: '#ffffff' },  // --color-danger-hover
  botonDangerSolido:  { bg: '#da1e28', text: '#ffffff' },  // --color-danger-solid
  // Los dos contadores del shell (badge de "sin asignar" del SideNav, conteo
  // de la campana): mismo par, y tenían el mismo bug.
  contadorShell:      { bg: '#0f62fe', text: '#ffffff' },
  // Botón secundario de Carbon: gris SÓLIDO con texto blanco, no un contorno.
  // Es el único relleno sólido cuyo color SÍ cambia por tema (Gray 80 en
  // claro, Gray 60 en oscuro) — está en esta tabla igual porque el TEXTO es
  // invariante, que es lo que esta tabla vigila.
  botonSecundarioClaro:       { bg: '#393939', text: '#ffffff' },
  botonSecundarioClaroHover:  { bg: '#4c4c4c', text: '#ffffff' },
  botonSecundarioOscuro:      { bg: '#6f6f6f', text: '#ffffff' },
  botonSecundarioOscuroHover: { bg: '#606060', text: '#ffffff' },
  // Marca externa, fuera de Carbon (ver --color-whatsapp en main.css): el
  // blanco sobre el verde de WhatsApp da 2.4:1, de ahí el verde oscuro.
  whatsapp:           { bg: '#25d366', text: '#072E2A' },
  // El par que NO debe volver: así se veía el botón primario en oscuro antes
  // del arreglo. Se deja documentado con su medida en el comentario de arriba;
  // no se agrega como entrada porque una entrada que se espera en rojo
  // convertiría este script en una lista de fallas toleradas.
};

// TEMA OSCURO — Gray 100. La superficie de un badge es --color-bg-elevated
// (#262626, layer-01).
//
// Diferencia con el tema oscuro anterior: los -bg semánticos eran `rgba()`
// que había que pre-componer a mano sobre la superficie para poder
// verificarlos (y acordarse de recomponerlos al tocarlos). Acá son los
// `tag-*` de Carbon en oscuro —paso 70 de fondo, 20 de texto— y son
// opacos: se verifican directo.
const OSCURO = {
  success: { bg: '#0e6027', text: '#a7f0ba' },
  warning: { bg: '#684e00', text: '#fddc69' },
  danger:  { bg: '#a2191f', text: '#ffd7d9' },
  info:    { bg: '#0043ce', text: '#d0e2ff' },
  purple:  { bg: '#6929c4', text: '#e8daff' },
  sky:     { bg: '#00539a', text: '#bae6ff' },
  teal:    { bg: '#005d5d', text: '#9ef0f0' },
  neutral: { bg: '#525252', text: '#f4f4f4' },
  // Gray 40 y no Gray 50: el texto terciario también cae sobre
  // --color-bg-subtle (Gray 80), donde Gray 50 da 3.48:1. Ver la nota del
  // token en main.css.
  textoTerciario: { bg: '#262626', text: '#a8a8a8' },
  // Encabezado de tabla en oscuro: en Gray 100, layer-accent-01 coincide
  // con layer-02 (los dos Gray 80) — eso es de Carbon, no un descuido.
  encabezadoTabla: { bg: '#393939', text: '#c6c6c6' },
  prioridadBaja:  { bg: '#262626', text: '#bae6ff' },
  prioridadMedia: { bg: '#262626', text: '#9ef0f0' },
  // Fila seleccionada en oscuro: --color-accent-subtle es Blue 80, el
  // `highlight` de Carbon en g100.
  prioridadBajaFilaActiva:  { bg: '#002d9c', text: '#bae6ff' },
  prioridadMediaFilaActiva: { bg: '#002d9c', text: '#9ef0f0' },
  // Tonos de avatar en oscuro: pasos 80/30, el espejo del 10/70 del claro.
  avatarAzul:    { bg: '#002d9c', text: '#a6c8ff' },
  avatarSlate:   { bg: '#343a3f', text: '#c1c7cd' },
  avatarTeal:    { bg: '#004144', text: '#3ddbd9' },
  avatarVioleta: { bg: '#491d8b', text: '#d4bbff' },
  avatarArena:   { bg: '#5e2900', text: '#ffb784' },
  altaPendiente: { bg: '#262626', text: '#fddc69' },
  filaActivaTexto: { bg: '#002d9c', text: '#c6c6c6' },
  segmentoReposo:   { bg: '#393939', text: '#c6c6c6' },
  segmentoContador: { bg: '#393939', text: '#c6c6c6' },
  // El activo usa --color-accent-text de oscuro (Blue 40), no el Blue 60
  // del botón: es texto, y ese es justo el motivo por el que
  // --color-primary no es alias directo de --color-accent.
  segmentoActivo:   { bg: '#262626', text: '#78a9ff' },
};

// UI SHELL — header en Gray 100 y SideNav en Gray 90, en AMBOS temas (en
// Carbon el shell no sigue al tema: el tema gobierna el workspace). Tabla
// aparte por eso mismo: estos pares no tienen versión clara y oscura, son
// uno solo. Los consumen AppLayout.vue, AppNav.vue, AppSearch.vue y
// NotificacionesCampana.vue vía los tokens --cds-shell-*.
const SHELL = {
  headerTexto:      { bg: '#161616', text: '#f4f4f4' },  // HeaderName, íconos de acción
  headerApagado:    { bg: '#161616', text: '#a8a8a8' },  // --cds-shell-text-muted
  navTexto:         { bg: '#262626', text: '#f4f4f4' },  // ítem activo / hover
  navSecundario:    { bg: '#262626', text: '#c6c6c6' },  // ítem en reposo
  navRotuloGrupo:   { bg: '#262626', text: '#a8a8a8' },  // "Día a día", "Administración"
  navActivo:        { bg: '#393939', text: '#f4f4f4' },  // sobre --cds-shell-selected
  navHover:         { bg: '#353535', text: '#f4f4f4' },  // sobre --cds-shell-hover
  campoBusqueda:    { bg: '#393939', text: '#f4f4f4' },  // valor escrito
  // El placeholder ES texto: le corresponde 4.5:1, no el 3:1 de un
  // indicador no textual. Es el par que forzó a que
  // --cds-shell-text-muted sea Gray 40 y no Gray 50 (que daba 3.48:1).
  campoPlaceholder: { bg: '#393939', text: '#a8a8a8' },
};

// Bordes de controles interactivos (WCAG 1.4.11 — umbral 3:1, no 4.5:1: no
// son texto, son el límite de un componente que sí debe distinguirse del
// fondo por sí solo). bg-elevated en ambos temas: input/select/textarea/
// botón secundario viven sobre esa superficie, nunca sobre --color-bg.
//
// Los bordes -subtle NO están acá y es deliberado: son separadores y bordes
// de contenedor (tarjeta, tabla, modal), decorativos, y WCAG 1.4.11 no les
// exige umbral. Con radios en 0 y elevación plana son además el recurso de
// jerarquía más usado del sistema — exigirles 3:1 los volvería líneas
// duras que compiten con el contenido.
const BORDES = {
  claroDefault:  { bg: '#ffffff', text: '#8d8d8d' },
  claroStrong:   { bg: '#ffffff', text: '#6f6f6f' },
  oscuroDefault: { bg: '#262626', text: '#8d8d8d' },
  oscuroStrong:  { bg: '#262626', text: '#a8a8a8' },
  // Foco. En claro es Blue 60 sobre la superficie del control; en oscuro es
  // BLANCO, no el azul (Blue 60 sobre layer-01 da 2.0:1 y no se ve). Mismo
  // umbral de 3:1: es un indicador no textual.
  focoClaro:  { bg: '#ffffff', text: '#0f62fe' },
  focoOscuro: { bg: '#262626', text: '#ffffff' },
  focoShell:  { bg: '#161616', text: '#ffffff' },
};

function reportar(nombre, tabla, umbral = 4.5) {
  console.log(`\n== ${nombre} ==`);
  let fallas = 0;
  for (const [familia, { bg, text }] of Object.entries(tabla)) {
    const ratio = contraste(bg, text);
    const ok = ratio >= umbral;
    if (!ok) fallas++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${familia.padEnd(25)} bg=${bg} text=${text}  ratio=${ratio.toFixed(2)}:1${ok ? '' : `  <-- bajo ${umbral}:1`}`);
  }
  return fallas;
}

const f0 = reportar('TEXTO SOBRE RELLENO SÓLIDO (invariante entre temas)', SOLIDOS);
const f1 = reportar('TEMA CLARO (Gray 10)', CLARO);
const f2 = reportar('TEMA OSCURO (Gray 100)', OSCURO);
const f3 = reportar('UI SHELL (Gray 100/90 en ambos temas)', SHELL);
const f4 = reportar('BORDES Y FOCO (umbral 3:1, WCAG 1.4.11)', BORDES, 3.0);
const total = f0 + f1 + f2 + f3 + f4;
console.log(`\nTotal fallas: ${total}`);
process.exit(total > 0 ? 1 : 0);
