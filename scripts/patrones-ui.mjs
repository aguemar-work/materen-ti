// Invariantes estructurales de la UI, verificadas sobre el <template>.
//
// Tercer eje de los guardrails de diseño:
//   contraste.mjs        — el VALOR de un token cumple WCAG
//   tokens-vs-guia.mjs   — el NOMBRE de un token es coherente entre código,
//                          uso y documentación (+ referencias var() rotas)
//   literales-vs-tokens.mjs — un VALOR escrito a mano que debería ser token
//   patrones-ui.mjs      — la ESTRUCTURA del marcado respeta las reglas que
//                          el proyecto ya pagó caro por descubrir
//
// Dos familias de reglas:
//   · las 4 de accesibilidad/estructura del ciclo 2026-08-31 (modal a mano,
//     <img> sin alt, th sin texto, botón solo-ícono): HOY en verde;
//   · las 15 de la "Versión Expediente" (plan de mejora Ciclo 21, §3.5): cada
//     una cita en su `porque` el número de la regla de docs/SISTEMA-DISENO.md
//     que hace cumplir, para que una regla sin script o un script sin regla
//     salten a la vista.
//
// No son un cazador de bugs: son un TRINQUETE.
//
// ── Línea base ───────────────────────────────────────────────────────────
// Las reglas de la Versión Expediente ya se incumplen en el árbol de hoy
// (font-mono en códigos, cajas de ícono azules...); corregirlas es trabajo de
// rediseño por módulo, no de este script. Por eso existe una línea base:
//
//   scripts/patrones-ui.baseline.json  →  { "regla": ["archivo.vue", ...] }
//
//   · Un incumplimiento en un archivo que ESTÁ en la línea base para esa regla
//     es "heredado": se cuenta, no falla.
//   · Uno en un archivo/regla que NO está es NUEVO: falla (exit 1). Así CI
//     frena lo nuevo sin exigir arreglar lo viejo.
//   · La línea base solo puede ENCOGERSE. Si un archivo ya no incumple y sigue
//     listado, el script avisa para que se retire (`--actualizar-baseline`).
//     `--actualizar-baseline` NUNCA agrega entradas a una línea base que ya
//     existe: si hay hallazgos nuevos, se arreglan o se declaran como
//     excepción (formato motivo/alcance/impacto); no se "perdonan".
//     Solo si el archivo no existe se genera completo (primera vez).
//   · Limitación conocida: la línea base es por (regla, archivo), no por
//     cantidad: un archivo heredado puede sumar más ocurrencias de la misma
//     regla sin que el script falle. Se compensa con revisión; el contador
//     por regla del resumen baja cuando se limpia.
//
// Uso:
//   node scripts/patrones-ui.mjs                        verifica (CI)
//   node scripts/patrones-ui.mjs --verbose              lista también lo heredado
//   node scripts/patrones-ui.mjs --actualizar-baseline  genera / encoge la línea base
//
// Las reglas heurísticas documentan sus falsos positivos conocidos al lado de
// su `buscar`. Un falso positivo se resuelve con una excepción motivada, no
// aflojando el patrón.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(RAIZ, 'frontend/src');
const RUTA_BASELINE = join(RAIZ, 'scripts/patrones-ui.baseline.json');

// ── Excepciones ────────────────────────────────────────────────────────────
// Formato obligatorio del proyecto: motivo/alcance/impacto (el script falla si
// falta alguno o si el archivo ya no existe). `archivo` es un sufijo de ruta
// relativa a frontend/src.
export const EXCEPCIONES = [
  {
    archivo: 'components/shared/Modal.vue',
    reglas: ['modal-a-mano'],
    motivo: 'Es LA implementación del modal: centraliza role=dialog, aria-modal, foco atrapado y cierre con Escape.',
    alcance: 'El componente compartido.',
    impacto: 'Ninguno: es la fuente de la regla, no su excepción.',
  },
  {
    archivo: 'components/ui/AppAvatar.vue',
    reglas: ['caja-de-icono'],
    motivo: 'El avatar de iniciales es un círculo tonal por diseño (regla 20: vive en listas y menú de usuario).',
    alcance: 'Solo AppAvatar.vue; lleva texto (iniciales), no un ícono.',
    impacto: 'Ninguno: el patrón que la regla busca (círculo tenue con un único <i>) no es el avatar.',
  },
  {
    archivo: 'components/ui/AppPortal.vue',
    reglas: ['caja-de-icono'],
    motivo: 'El círculo de ícono del portal público se conserva SOLO para pantallas de error y resultado (plan §3.3, pantalla 6).',
    alcance: 'Solo AppPortal.vue, y únicamente cuando recibe `icono`.',
    impacto: 'Hasta que el portal pase a "comprobante" el círculo sigue disponible para todas sus páginas de resultado.',
  },
  {
    archivo: 'components/ui/AppVacio.vue',
    reglas: ['caja-de-icono'],
    motivo: 'Regla 21: `AppVacio` con ícono es solo para páginas completas (variante `pagina`).',
    alcance: 'Solo AppVacio.vue.',
    impacto: 'Las secciones sin filas usan una fila de AppLibro, no AppVacio con ícono (se vigila en revisión).',
  },
  {
    archivo: 'components/ui/AppFiltros.vue',
    reglas: ['azul-decorativo'],
    motivo: 'El chip de filtro aplicado es tinta del usuario: `bg-primary-50` marca lo que el usuario puso (regla 17).',
    alcance: 'Solo AppFiltros.vue.',
    impacto: 'Ninguno: es exactamente el uso permitido.',
  },
  {
    archivo: 'components/ui/AppVistas.vue',
    reglas: ['azul-decorativo'],
    motivo: 'La vista activa lleva la marca azul de 2px: "estoy acá" es tinta (regla 17).',
    alcance: 'Solo AppVistas.vue.',
    impacto: 'Ninguno: es exactamente el uso permitido.',
  },
  {
    archivo: 'components/shared/AppNav.vue',
    reglas: ['azul-decorativo'],
    motivo: 'El ícono del ítem activo del menú va en `primary-600` (regla 17: único ícono azul permitido).',
    alcance: 'Solo AppNav.vue.',
    impacto: 'Ninguno: es exactamente el uso permitido.',
  },
  {
    archivo: 'components/ui/AppSegmentado.vue',
    reglas: ['azul-decorativo'],
    motivo: 'La opción activa de un segmentado es selección del usuario (regla 17: `bg-primary-50` solo en lo que el usuario puso).',
    alcance: 'Solo AppSegmentado.vue.',
    impacto: 'Ninguno: es exactamente el uso permitido.',
  },
  {
    archivo: 'modules/entregas/EntregaView.vue',
    reglas: ['mono-fuera-de-credenciales'],
    motivo: 'Regla 14: `font-mono` queda para lo que se transcribe; la entrega muestra usuario y contraseña ya reveladas.',
    alcance: 'Los valores de usuario y contraseña de EntregaView.vue.',
    impacto: 'Un código de ticket o de equipo ahí seguiría mal; se vigila en revisión (el resto del archivo no usa mono).',
  },
  {
    archivo: 'components/ui/AppTag.vue',
    reglas: ['punto-de-color'],
    motivo: 'El `punto` de AppTag es el indicador de estado "vivo" (Activo/Inactivo) del único render de tag.',
    alcance: 'Solo AppTag.vue.',
    impacto: 'La regla 15 retira el punto de los tags de estado; hasta entonces sigue siendo una prop opcional.',
  },
  {
    archivo: 'modules/tickets/TarjetaTicket.vue',
    reglas: ['punto-de-color'],
    motivo: 'La tarjeta móvil usa un círculo punteado/ámbar para el responsable ausente (no es un punto de estado de historial).',
    alcance: 'Solo TarjetaTicket.vue.',
    impacto: 'Desaparece cuando el triage de tickets se rehaga sobre la tabla única (plan §3.3, pantalla 3).',
  },
  ...[
    'components/shared/AppLayout.vue',
    'components/ui/AppMenu.vue',
    'components/shared/Modal.vue',
    'components/ui/AppDialog.vue',
    'components/shared/BuscadorCombo.vue',
    'components/shared/AppSearch.vue',
    'components/shared/NotificacionesCampana.vue',
    'components/shared/AppNotifications.vue',
  ].map((archivo) => ({
    archivo,
    reglas: ['sombra-flotante'],
    motivo: 'Es una superficie que flota sobre el contenido (panel móvil, menú, popover, modal, aviso): necesita despegarse (regla 9).',
    alcance: 'Solo esta superficie flotante.',
    impacto: 'Ninguno: las sombras grandes son para lo que flota; en la hoja y las cards siguen prohibidas.',
  })),
  {
    archivo: 'modules/equipos/EquipoForm.vue',
    reglas: ['sombra-flotante'],
    motivo: 'La lista desplegable del tipo de equipo es un popover absoluto que flota sobre el formulario (regla 9: sombra grande solo en lo que flota).',
    alcance: 'Solo EquipoForm.vue.',
    impacto: 'Una sombra grande nueva en el resto del formulario pasaría sin aviso; se vigila en revisión.',
  },
  {
    archivo: 'modules/tickets/TicketSeguimientoView.vue',
    reglas: ['historial-a-mano'],
    motivo: 'El seguimiento público del ticket es un historial a mano hasta migrarlo a AppLibro (plan §3.3, pantalla 6).',
    alcance: 'Solo TicketSeguimientoView.vue.',
    impacto: 'Temporal: se retira al migrar el portal; mientras tanto no figura en la línea base.',
  },
];

// ── Archivos ───────────────────────────────────────────────────────────────

function archivos(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, acc);
    else if (['.vue', '.js'].includes(extname(p))) acc.push(p);
  }
  return acc;
}

const aRelativa = (ruta) => relative(SRC, ruta).split(String.fromCharCode(92)).join('/');

// Solo el <template>: un `modal-bg` citado en un comentario de <style> (como
// hace BuscadorCombo.vue para explicar su z-index) no es un modal hecho a mano.
export function plantilla(fuente) {
  const m = fuente.match(/<template>([\s\S]*)<\/template>/);
  if (!m) return '';
  return m[1].replace(/<!--[\s\S]*?-->/g, '');
}

function exceptuado(rel, regla) {
  return EXCEPCIONES.some((e) => rel.endsWith(e.archivo) && e.reglas.includes(regla));
}

// ── Lector de etiquetas ────────────────────────────────────────────────────
// Un <template> de Vue lleva `>` dentro de los atributos (`v-if="a > 1"`,
// `@click="x => y"`): una regex `<[^>]*>` corta las etiquetas por la mitad.
// Este lector recorre el texto respetando las comillas y arma un árbol mínimo
// (padre / cierre) para las reglas que miran el contexto. No es un parser de
// HTML: no valida nada, solo no se deja engañar por un `>` entre comillas.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * @returns {{ nombre: string, attrs: string, abre: boolean, cierra: boolean,
 *   autocierre: boolean, inicio: number, fin: number, padre: number,
 *   cierre: number }[]}  `fin` es el índice posterior al `>`; `padre` es el
 *   índice (en este arreglo) de la etiqueta que la contiene, o -1; `cierre`
 *   (solo en las que abren) es el índice de su etiqueta de cierre, o -1.
 */
export function etiquetas(tpl) {
  const tokens = [];
  const pila = [];
  let i = 0;
  while (i < tpl.length) {
    const lt = tpl.indexOf('<', i);
    if (lt === -1) break;
    const m = /^<(\/?)([A-Za-z][\w:.-]*)/.exec(tpl.slice(lt, lt + 120));
    if (!m) {
      i = lt + 1;
      continue;
    }
    let j = lt + m[0].length;
    let comilla = null;
    for (; j < tpl.length; j++) {
      const c = tpl[j];
      if (comilla) {
        if (c === comilla) comilla = null;
      } else if (c === '"' || c === "'") comilla = c;
      else if (c === '>') break;
    }
    const attrs = tpl.slice(lt + m[0].length, j);
    const cierra = m[1] === '/';
    const nombre = m[2];
    const autocierre = !cierra && (/\/\s*$/.test(attrs) || VOID.has(nombre.toLowerCase()));
    const tok = {
      nombre,
      attrs,
      abre: !cierra,
      cierra,
      autocierre,
      inicio: lt,
      fin: j + 1,
      padre: pila.length ? pila[pila.length - 1] : -1,
      cierre: -1,
    };
    const idx = tokens.push(tok) - 1;
    if (cierra) {
      // Cierra hasta la última apertura del mismo nombre (tolera cierres que
      // faltan en el marcado, p. ej. <li> sin </li>).
      for (let k = pila.length - 1; k >= 0; k--) {
        if (tokens[pila[k]].nombre === nombre) {
          tokens[pila[k]].cierre = idx;
          pila.length = k;
          break;
        }
      }
    } else if (!autocierre) {
      pila.push(idx);
    }
    i = j + 1;
  }
  return tokens;
}

/** Clases de una etiqueta: `class="..."` estático + el texto de `:class="..."`. */
export function clasesDe(attrs) {
  const partes = [];
  const re = /(?:^|\s)(?::class|v-bind:class|class)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(attrs))) partes.push(m[1] ?? m[2]);
  return partes.join(' ');
}

const claseEstatica = (attrs) => (/(?:^|\s)class\s*=\s*"([^"]*)"/.exec(attrs) ?? [])[1] ?? '';
const tieneClaseDinamica = (attrs) => /(?:^|\s)(?::class|v-bind:class)\s*=/.test(attrs);

/** Texto visible de una plantilla: nodos de texto + cadenas dentro de {{ }}. */
function textoVisible(tpl, tokens) {
  const trozos = [];
  let cursor = 0;
  const volcar = (texto) => {
    trozos.push(
      texto.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
        const cadenas = expr.match(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g) || [];
        return ` ${cadenas.map((c) => c.slice(1, -1)).join(' ')} `;
      }),
    );
  };
  for (const t of tokens) {
    if (t.inicio > cursor) volcar(tpl.slice(cursor, t.inicio));
    cursor = t.fin;
  }
  if (cursor < tpl.length) volcar(tpl.slice(cursor));
  return trozos.join('\n');
}

// Atributos estáticos que son texto para la persona (no clases ni rutas).
const ATRIBUTOS_DE_TEXTO = [
  'title', 'placeholder', 'aria-label', 'label', 'alt', 'titulo', 'mensaje',
  'descripcion', 'subtitulo', 'texto', 'detalle', 'aviso', 'ayuda', 'hint',
];

function textosDeAtributos(tokens) {
  const salida = [];
  for (const t of tokens) {
    if (!t.abre) continue;
    for (const nombre of ATRIBUTOS_DE_TEXTO) {
      const m = new RegExp(`(?:^|\\s)${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(t.attrs);
      if (m) salida.push(m[1] ?? m[2]);
    }
  }
  return salida;
}

const recorte = (s, n = 90) => s.replace(/\s+/g, ' ').trim().slice(0, n);

// Un token de clase de Tailwind, con o sin variantes (`hover:`, `md:`...).
// Se escribe como `(?<![\w-])` + variantes opcionales + utilidad + `(?![\w-])`.
const VARIANTES = String.raw`(?:[\w[\]-]+:)*`;
const utilidad = (cuerpo) => new RegExp(String.raw`(?<![\w-])${VARIANTES}(?:${cuerpo})(?![\w-])`, 'g');

// ── Reglas ─────────────────────────────────────────────────────────────────
// Cada regla: titulo / porque (cita el número de regla de SISTEMA-DISENO) /
// arreglo / buscar(tpl, ctx) → hallazgos (cadenas). `ctx` = { rel, fuente, tpl,
// tokens }. `aplica(rel)` opcional recorta los archivos que se miran (por
// defecto, los .vue).
const SOLO_VUE = (rel) => rel.endsWith('.vue');

export const REGLAS = {
  // ── Accesibilidad / estructura (ciclo 2026-08-31) ────────────────────────
  'modal-a-mano': {
    titulo: 'Modal hecho a mano en vez del componente compartido',
    porque:
      'Un modal propio se salta role=dialog, aria-modal, el foco atrapado y el cierre con Escape. Es el hallazgo más serio del ciclo 2026-08-31 (7 archivos, 8 modales) y el mismo hueco que UX6-03. SISTEMA-DISENO §6.',
    arreglo: 'Usar <Modal> de components/shared/Modal.vue.',
    buscar: (tpl) => (/class="[^"]*\bmodal-bg\b/.test(tpl) ? ['class="modal-bg"'] : []),
  },
  'img-sin-alt': {
    titulo: '<img> sin atributo alt',
    porque: 'Un lector de pantalla anuncia la URL del archivo, o nada. SISTEMA-DISENO §6.',
    arreglo: 'Agregar alt="" si es decorativa, o un alt descriptivo si no lo es.',
    buscar: (tpl) =>
      [...tpl.matchAll(/<img\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((t) => !/\s:?alt\s*=/.test(t)),
  },
  'th-sin-texto-visible': {
    titulo: 'Cabecera de columna sin texto visible',
    porque:
      'Un <th> cuyo único contenido es sr-only deja un hueco en blanco entre encabezados con texto y rompe la lectura de la fila. La regla del sistema (GUIA-UX-UI, "Reglas de tabla") es texto a la vista: el sr-only tampoco aporta al lector de pantalla, porque cada botón de la celda ya lleva su propio aria-label. El 2026-09-01 había 7 tablas con el header oculto y 7 con él visible — la misma columna, escrita de dos formas según el módulo. SISTEMA-DISENO §6.',
    arreglo: 'Reemplazar por <th scope="col">Acciones</th> (o el texto que corresponda).',
    buscar: (tpl) =>
      [...tpl.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
        .filter(([, cuerpo]) => {
          // Se quitan los <span class="sr-only">…</span> COMPLETOS (con su
          // texto). Si lo que sobra no tiene texto, el header no muestra nada
          // al usuario. Quitar solo las etiquetas dejaba el texto del sr-only
          // contando como visible — el bug que este propio check tuvo primero.
          const sinSrOnly = cuerpo.replace(/<span[^>]*class="sr-only"[^>]*>[\s\S]*?<\/span>/g, '');
          return /class="sr-only"/.test(cuerpo) && sinSrOnly.replace(/<[^>]*>/g, '').trim() === '';
        })
        .map(([t]) => t.replace(/\s+/g, ' ').slice(0, 90)),
  },
  'boton-icono-sin-nombre': {
    titulo: 'Botón solo-ícono sin nombre accesible',
    porque:
      'Un <button> cuyo único contenido es un <i> decorativo no tiene texto que anunciar. El ciclo 2026-08-31 encontró 4 casos equivalentes en campos de alta rápida. SISTEMA-DISENO §6.',
    arreglo: 'Agregar aria-label (o title, si además debe verse al pasar el cursor).',
    buscar: (tpl) =>
      [...tpl.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
        .filter(([, attrs, cuerpo]) => {
          const soloIconos = cuerpo.replace(/<i\b[^>]*>[\s\S]*?<\/i>/g, '').replace(/<i\b[^>]*\/>/g, '').trim();
          if (soloIconos !== '' || !/<i\b/.test(cuerpo)) return false;
          return !/\s:?(aria-label|title)\s*=/.test(attrs) && !/v-bind=/.test(attrs);
        })
        .map(([t]) => t.replace(/\s+/g, ' ').slice(0, 90)),
  },

  // ── Versión Expediente (plan Ciclo 21 §3.5) ─────────────────────────────
  'borde-lateral': {
    titulo: 'Borde lateral o línea vertical decorativa',
    porque:
      'Regla dura del dueño y regla 7 de SISTEMA-DISENO ("Qué NO se toca"): cero bordes laterales — ni acentos a la izquierda ni líneas verticales como separador. Hasta hoy ningún script lo cuidaba.',
    arreglo:
      'Separar con espacio, con `divide-y` o con un fondo tenue; un acento va en el texto o en el ícono, nunca en el borde.',
    // Falsos positivos conocidos: ninguno esperado. `border-l-0`/`border-x-0`
    // (que QUITAN un borde) se ignoran a propósito.
    buscar: (tpl) =>
      [...tpl.matchAll(utilidad(String.raw`border-(?:[lrse]|x)(?:-[\w[\]/.%#-]+)?|divide-x(?:-[\w.-]+)?`))]
        .map((m) => m[0])
        .filter((c) => !/-0$/.test(c)),
  },
  'caja-de-icono': {
    titulo: 'Caja de ícono tonal (círculo o cuadrado tenue con un solo ícono)',
    porque:
      'Regla 17 de SISTEMA-DISENO ("El azul es tinta") y regla 19: las cajas de ícono `bg-primary-50 text-primary-600` y los íconos de color en historiales son el patrón "dashboard SaaS" que la Versión Expediente retira. Los íconos informativos son grises y escasos.',
    arreglo:
      'Quitar la caja: ícono gris suelto o, mejor, nada (la palabra ya dice lo que el ícono repetía). Para un vacío de página completa, AppVacio.',
    // Heurística: un <span> con tamaño fijo (h-N w-N), `rounded-(md|lg|full)` y
    // fondo tenue (`bg-X-50/100` estático, o un `:class` dinámico que se asume
    // fondo) cuyo ÚNICO hijo es un <i> y no tiene texto.
    // Falsos positivos conocidos: un `:class` dinámico que no pone fondo
    // (marcado por prudencia); un contador de tamaño fijo con un solo ícono
    // que no es decorativo. Se resuelve con una excepción.
    buscar: (tpl, ctx) => {
      const tokens = ctx?.tokens ?? etiquetas(tpl);
      const salida = [];
      tokens.forEach((t, idx) => {
        if (!t.abre || t.autocierre || t.nombre !== 'span' || t.cierre === -1) return;
        const clases = clasesDe(t.attrs);
        const estatica = claseEstatica(t.attrs);
        const conTamano =
          (/(?<![\w:-])h-\d/.test(clases) && /(?<![\w:-])w-\d/.test(clases)) || /(?<![\w:-])size-\d/.test(clases);
        const redondeado = /(?<![\w:-])rounded-(?:md|lg|full)(?![\w-])/.test(clases);
        const conFondo = /(?<![\w:-])bg-[a-z]+-(?:50|100)(?![\w-])/.test(estatica) || tieneClaseDinamica(t.attrs);
        if (!(conTamano && redondeado && conFondo)) return;
        // Único hijo = un <i> sin hijos, y nada de texto alrededor.
        const hijos = tokens.map((h, k) => ({ h, k })).filter(({ h, k }) => k > idx && k < t.cierre && h.padre === idx);
        if (hijos.length !== 1 || hijos[0].h.nombre !== 'i') return;
        const icono = hijos[0].h;
        const finIcono = icono.cierre === -1 ? icono.fin : tokens[icono.cierre].fin;
        const resto = tpl.slice(t.fin, icono.inicio) + tpl.slice(finIcono, tokens[t.cierre].inicio);
        if (resto.trim() === '') salida.push(recorte(`<span class="${estatica}">`));
      });
      return salida;
    },
  },
  'azul-decorativo': {
    titulo: 'Azul de marca usado como decoración',
    porque:
      'Regla 17 de SISTEMA-DISENO ("El azul es tinta"): `text-primary-*` solo en texto interactivo y en el ícono del ítem activo del menú; `bg-primary-50/100` solo en lo que el usuario puso (chip aplicado, fila seleccionada, opción activa).',
    arreglo:
      'Ícono gris (`text-gray-500`) en vez de azul; fondo azul solo si el elemento declara su estado (`aria-pressed`, `aria-current`, `aria-selected`, `data-chip`).',
    // Dos señales sobre la clase ESTÁTICA (la que está siempre puesta): (a) un
    // <i> con `text-primary-N`; (b) un elemento con `bg-primary-50/100` sin
    // variante de estado y sin atributo de estado.
    // No se mira el `:class`: un azul que depende de una condición ES un
    // estado (opción elegida, fila abierta) y es justo lo que la regla permite.
    // Falsos positivos conocidos: un azul estático que SÍ es de estado pero el
    // elemento no lo declara (se agrega `aria-selected`/`aria-current`, o se
    // exceptúa); un <a> con `text-primary-*` NO se cuenta (el enlace es tinta).
    // Falso negativo conocido: un azul siempre puesto desde un `:class` sin
    // condición real.
    buscar: (tpl, ctx) => {
      const tokens = ctx?.tokens ?? etiquetas(tpl);
      const salida = [];
      for (const t of tokens) {
        if (!t.abre) continue;
        const clases = claseEstatica(t.attrs);
        if (t.nombre === 'i' && /(?<![\w:[-])text-primary-\d/.test(clases)) {
          salida.push(recorte(`<i class="${clases}">`));
          continue;
        }
        const fondo = /(?<![\w:[-])bg-primary-(?:50|100)(?![\w-])/.test(clases);
        const declaraEstado = /(?:^|\s):?(?:aria-pressed|aria-current|aria-selected|aria-checked|data-chip|data-activo|data-active)(?:\s*=|\s|$)/.test(t.attrs);
        if (fondo && !declaraEstado) salida.push(recorte(`<${t.nombre} class="${clases}">`));
      }
      return salida;
    },
  },
  'mono-fuera-de-credenciales': {
    titulo: '`font-mono` fuera de lo que se transcribe',
    porque:
      'Regla 14 de SISTEMA-DISENO: los códigos (TCK-0281, código de equipo, serie, DNI) se componen con AppCodigo en Inter `tabular-nums`; `font-mono` queda reservado a lo que se transcribe: contraseñas, usuarios y URLs (`.cred__valor`, EntregaView).',
    arreglo: 'Usar <AppCodigo :valor="..."> para códigos. Para un usuario o contraseña revelados, la primitiva `.cred__valor`.',
    // Falsos positivos conocidos: un usuario o una URL mostrados fuera de las
    // credenciales (p. ej. el usuario de una cuenta en una tabla) son
    // transcribibles, pero aún no hay primitiva para ellos: se heredan.
    buscar: (tpl) => [...tpl.matchAll(utilidad('font-mono'))].map((m) => m[0]),
  },
  'codigo-sin-tabular': {
    titulo: 'Identificador mostrado sin AppCodigo ni `tabular-nums`',
    porque:
      'Regla 14 de SISTEMA-DISENO: todo código del dominio (codigo, dni, serie, codigo_almacen) se compone con un único render, AppCodigo (Inter `font-medium tabular-nums`, prefijo gris), o al menos queda dentro de un elemento `tabular-nums`.',
    arreglo: 'Reemplazar `{{ x.codigo }}` por <AppCodigo :valor="x.codigo" titulo="..."/>.',
    // Heurística: una interpolación que menciona codigo/dni/serie/codigo_almacen
    // sin un ancestro con `tabular-nums` ni un ancestro <AppCodigo>.
    // Falsos positivos conocidos: `{{ dni }}` dentro de un texto corrido (una
    // frase que menciona el DNI, no una columna de identificadores); `serie`
    // como palabra de una serie de datos de un reporte. El `html` global ya
    // fija `font-feature-settings: 'tnum'`, así que el número sale tabular
    // igual: la regla exige hacerlo explícito (y el prefijo en gris).
    buscar: (tpl, ctx) => {
      const tokens = ctx?.tokens ?? etiquetas(tpl);
      const salida = [];
      const re = /\{\{[^}]*?(?<![\w])(?:codigo|dni|serie|codigo_almacen)(?![\w])[^}]*\}\}/g;
      let m;
      while ((m = re.exec(tpl))) {
        // Ancestros de la interpolación: etiquetas abiertas que la contienen.
        const cubierto = tokens.some((t) => {
          if (!t.abre || t.autocierre || t.inicio > m.index) return false;
          const fin = t.cierre === -1 ? tpl.length : tokens[t.cierre].inicio;
          if (fin < m.index) return false;
          return t.nombre === 'AppCodigo' || /(?<![\w-])tabular-nums(?![\w-])/.test(clasesDe(t.attrs));
        });
        if (!cubierto) salida.push(recorte(m[0]));
      }
      return salida;
    },
  },
  'punto-de-color': {
    titulo: 'Punto de color decorativo',
    porque:
      'Reglas 15 y 19 de SISTEMA-DISENO: un estado es una palabra, no una pastilla con punto; el libro de movimientos no lleva puntos de color ni riel vertical.',
    arreglo: 'Quitar el punto: el estado va en texto (AppTag) y el historial en AppLibro.',
    // Falsos positivos conocidos: un indicador de presencia/no leído de 6-8px
    // que no es de estado (hoy ninguno). El punto `bg-current` de un tag de
    // estado "vivo" es solo de AppTag (exceptuado).
    buscar: (tpl, ctx) => {
      const tokens = ctx?.tokens ?? etiquetas(tpl);
      return tokens
        .filter((t) => t.abre)
        .filter((t) => {
          const c = clasesDe(t.attrs);
          return (
            /(?<![\w:-])h-(?:1\.5|2)(?![\w.-])/.test(c) &&
            /(?<![\w:-])w-(?:1\.5|2)(?![\w.-])/.test(c) &&
            /(?<![\w:-])rounded-full(?![\w-])/.test(c)
          );
        })
        .map((t) => recorte(`<${t.nombre} class="${clasesDe(t.attrs)}">`));
    },
  },
  'peso-700': {
    titulo: '`font-bold` / `font-extrabold` en la UI',
    porque:
      'Regla 16 de SISTEMA-DISENO: la jerarquía de expediente usa tres pesos (400, 500, 600). `font-bold` está prohibido en UI (el negrita de las actas en papel se mantiene, fuera de .vue).',
    arreglo: 'Usar `font-semibold` (600) para el énfasis fuerte.',
    buscar: (tpl) => [...tpl.matchAll(utilidad('font-(?:bold|extrabold|black)'))].map((m) => m[0]),
  },
  'sombra-flotante': {
    titulo: 'Sombra grande en algo que no flota',
    porque:
      'Regla 9 de SISTEMA-DISENO (profundidad mínima): `shadow-xs` en controles, cards y la hoja; `shadow-md/lg/xl` solo en lo que flota (menús, popovers, modales, panel móvil).',
    arreglo: 'Usar `shadow-xs`, o quitar la sombra y apoyarse en el borde `gray-200`.',
    buscar: (tpl) => [...tpl.matchAll(utilidad('shadow-(?:md|lg|xl|2xl)'))].map((m) => m[0]),
  },
  'radio-enorme-o-gradiente': {
    titulo: 'Radio enorme, degradado o desenfoque',
    porque:
      'Restricción del dueño y reglas 6 y 9 de SISTEMA-DISENO: nada de gradientes ni adornos; radios hasta `rounded-xl` (la hoja y los modales).',
    arreglo: 'Usar `rounded-lg`/`rounded-xl` y colores planos; sin `backdrop-blur`.',
    // Falsos positivos conocidos: ninguno esperado; `from-`/`to-`/`via-`
    // seguidos de un color o un valor son siempre parte de un degradado.
    buscar: (tpl) =>
      [
        ...tpl.matchAll(
          utilidad(
            String.raw`rounded-(?:2xl|3xl)|bg-gradient-[\w-]+|bg-linear-[\w-]+|(?:from|via|to)-(?:[a-z]+-\d+|\[[^\]]+\]|\d+%?)|backdrop-blur(?:-[\w-]+)?`,
          ),
        ),
      ].map((m) => m[0]),
  },
  'animacion-no-permitida': {
    titulo: 'Animación decorativa',
    porque:
      'Regla 22 de SISTEMA-DISENO: se anima lo que se mueve de lugar; prohibidos los esqueletos `animate-pulse` con forma de tarjeta, `animate-bounce` y `animate-ping`. Permitido: `animate-spin` en un botón cargando.',
    arreglo: 'Cargar con una línea de 2px en el borde superior de la hoja y conservar el contenido anterior.',
    buscar: (tpl) => [...tpl.matchAll(utilidad('animate-(?:pulse|bounce|ping)'))].map((m) => m[0]),
  },
  'kpi-fuera-de-reporte': {
    titulo: '<AppKpi> fuera de un reporte',
    porque:
      'Regla 16 de SISTEMA-DISENO ("una cifra `text-2xl` solo existe en un reporte") y plan §3.4: las tarjetas KPI de Inicio no deciden nada; AppKpi queda para los reportes (`modules/*/Reporte*.vue`).',
    arreglo: 'Usar una fila de AppVistas con conteo (filtra en el lugar) o un texto en el subtítulo.',
    buscar: (tpl, ctx) => {
      if (/^modules\/[^/]+\/Reporte[^/]*\.vue$/.test(ctx?.rel ?? '')) return [];
      return [...tpl.matchAll(/<AppKpi\b/g)].map(() => '<AppKpi');
    },
  },
  'copy-entusiasta-o-tuteo': {
    titulo: 'Copy entusiasta o con tuteo',
    porque:
      'Regla 25 y §5 de SISTEMA-DISENO: español impersonal y de usted, sin signos de exclamación ni "¡Listo!", "Genial", "Bienvenido"; nunca tutear.',
    arreglo:
      'Reescribir en impersonal/usted y sin exclamaciones: "Complete el campo", "Ticket creado". Verbos de libro en participio, botones en infinitivo.',
    // Mira SOLO el texto que ve la persona: nodos de texto, cadenas dentro de
    // {{ }} y atributos de texto estáticos (title, placeholder, label...).
    // Falsos positivos conocidos: una cadena con `!` que no es copy (hoy
    // ninguna); la palabra "tu" en un nombre propio o una cita textual.
    // Falsos negativos conocidos, a propósito: el imperativo de tú de los
    // verbos regulares ("Confirma", "Busca", "Ingresa") es idéntico al
    // presente de usted/tercera persona ("¿Confirma que quedó resuelto?"), así
    // que NO se vigila con regex; tampoco "Excelente", que es una opción
    // legítima de las escalas de satisfacción de las encuestas. Los captura la
    // revisión de copy.
    buscar: (tpl, ctx) => {
      const tokens = ctx?.tokens ?? etiquetas(tpl);
      const textos = [textoVisible(tpl, tokens), ...textosDeAtributos(tokens)].join('\n');
      const hallazgos = [];
      const patrones = [
        /¡/g,
        /!/g,
        /\b(?:Genial|Bienvenid[oa]s?|Fantástico|Perfecto)\b/g,
        /\b(?:puedes|tienes|quieres|necesitas|debes|sabes|haz clic)\b/gi,
        /\b[Tt]us?\b|\b(?:tuyo|tuya|tuyos|tuyas)\b/g,
        /\bHaz\b/g,
      ];
      for (const re of patrones) {
        for (const m of textos.matchAll(re)) {
          const ini = Math.max(0, m.index - 25);
          hallazgos.push(recorte(textos.slice(ini, m.index + m[0].length + 25)));
        }
      }
      return hallazgos;
    },
  },
  'historial-a-mano': {
    titulo: 'Historial armado a mano en vez de AppLibro',
    porque:
      'Regla 19 de SISTEMA-DISENO: un solo libro de movimientos, AppLibro. Hoy conviven cinco renders de historial (empleado, hoja de vida, cuenta, ticket, actividad).',
    arreglo: 'Usar <AppLibro :filas="..."/> con Fecha · Movimiento · Detalle · Por · Ref.',
    // Heurística: un <ol>/<ul> con `divide-y` cuyo contenido llama a
    // formatFecha*(...). Falsos positivos conocidos: una LISTA de registros con
    // fecha (cuentas, licencias, entregas) que no es un historial de
    // movimientos; se heredan hasta que se rediseñen y, si se decide que no
    // son historial, se exceptúan con motivo.
    buscar: (tpl, ctx) => {
      if (ctx?.rel?.endsWith('components/ui/AppLibro.vue')) return [];
      const tokens = ctx?.tokens ?? etiquetas(tpl);
      const salida = [];
      for (const t of tokens) {
        if (!t.abre || !['ol', 'ul'].includes(t.nombre) || t.cierre === -1) continue;
        if (!/(?<![\w-])divide-y(?![\w-])/.test(clasesDe(t.attrs))) continue;
        const cuerpo = tpl.slice(t.fin, tokens[t.cierre].inicio);
        if (/formatFecha\w*\(/.test(cuerpo)) salida.push(recorte(`<${t.nombre} class="${clasesDe(t.attrs)}">`));
      }
      return salida;
    },
  },
  'error-crudo': {
    titulo: 'Mensaje de error crudo mostrado o propagado',
    porque:
      'Regla 25 y §5 de SISTEMA-DISENO (copy de registro: mensajes en español, de usted) y plan §6: `e.message` es texto de Postgres o de la red, en inglés y con detalles internos. Todo error pasa por la capa de traducción (`api/erroresDb.js`).',
    arreglo: 'Traducir el error con la capa común y mostrar su mensaje, no el de la excepción.',
    // Solo `modules/**` (.vue y .js). Falsos positivos conocidos: un
    // `error.message` que se loguea a consola y no se muestra; un objeto
    // `error` que no es una excepción (p. ej. el de una validación propia).
    aplica: (rel) => rel.startsWith('modules/'),
    buscar: (tpl, ctx) => {
      const fuente = (ctx?.fuente ?? tpl)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');
      return [...fuente.matchAll(/(?<![\w.$])(?:e|err|error|ex|exc)\??\.message\b/g)].map((m) => m[0]);
    },
  },
  'vue-mayor-400-lineas': {
    titulo: 'Componente .vue de más de 400 líneas',
    porque:
      'Plan Ciclo 21 §3.5 y frente F-G (god-components): un archivo de más de 400 líneas mezcla datos, lógica y varias pantallas; los rediseños por módulo parten estos archivos antes de rehacerlos. Sostiene las reglas 14 a 25: no se rediseña lo que no se puede leer.',
    arreglo: 'Partir en subcomponentes y composables (el contenido compartido de tickets es el modelo: `modules/tickets/Ticket*.vue`).',
    // Cuenta TODAS las líneas del archivo (template + script). Falsos
    // positivos conocidos: un archivo largo solo por datos estáticos o por
    // plantillas de texto (hoy ninguno).
    aplica: SOLO_VUE,
    buscar: (tpl, ctx) => {
      const lineas = (ctx?.fuente ?? '').split('\n').length;
      return lineas > 400 ? [`${lineas} líneas`] : [];
    },
  },
};

// ── Análisis ───────────────────────────────────────────────────────────────

/**
 * Hallazgos de UN archivo, por regla, ya sin las excepciones.
 * @returns {Record<string, string[]>}
 */
export function analizar(rel, fuente) {
  const tpl = plantilla(fuente);
  const tokens = etiquetas(tpl);
  const ctx = { rel, fuente, tokens, tpl };
  const salida = {};
  for (const [id, regla] of Object.entries(REGLAS)) {
    if (exceptuado(rel, id)) continue;
    if (!(regla.aplica ?? SOLO_VUE)(rel)) continue;
    const hallazgos = regla.buscar(tpl, ctx);
    if (hallazgos.length) salida[id] = hallazgos;
  }
  return salida;
}

function validarExcepciones() {
  const errores = [];
  for (const e of EXCEPCIONES) {
    for (const campo of ['archivo', 'motivo', 'alcance', 'impacto']) {
      if (!e[campo]?.trim()) errores.push(`Excepción sin ${campo}: ${JSON.stringify(e).slice(0, 80)}`);
    }
    if (!existsSync(join(SRC, e.archivo))) errores.push(`Excepción de un archivo que no existe: ${e.archivo}`);
    for (const r of e.reglas) {
      if (!REGLAS[r]) errores.push(`Excepción de una regla que no existe: ${r} (${e.archivo})`);
    }
  }
  return errores;
}

const ordenar = (a) => [...a].sort((x, y) => x.localeCompare(y));

function leerBaseline() {
  if (!existsSync(RUTA_BASELINE)) return null;
  return JSON.parse(readFileSync(RUTA_BASELINE, 'utf8'));
}

function escribirBaseline(mapa) {
  const salida = {};
  for (const id of ordenar(Object.keys(mapa))) if (mapa[id].length) salida[id] = ordenar(mapa[id]);
  writeFileSync(RUTA_BASELINE, `${JSON.stringify(salida, null, 2)}\n`);
}

function resumen(base, conTitulo) {
  if (conTitulo) console.log(`\n${'─'.repeat(60)}\nIncumplimientos heredados (línea base) por regla:`);
  let total = 0;
  for (const id of Object.keys(REGLAS)) {
    const n = (base[id] || []).length;
    total += n;
    if (n || !conTitulo) console.log(`   ${id.padEnd(30)} ${String(n).padStart(3)} archivo(s)`);
  }
  console.log(`   ${'TOTAL'.padEnd(30)} ${String(total).padStart(3)} archivo(s)-regla`);
}

function main(argv) {
  const actualizar = argv.includes('--actualizar-baseline');
  const verbose = argv.includes('--verbose');

  // Hallazgos reales: regla → archivo → [hallazgos].
  const reales = Object.fromEntries(Object.keys(REGLAS).map((id) => [id, new Map()]));
  for (const f of archivos(SRC)) {
    const rel = aRelativa(f);
    const porRegla = analizar(rel, readFileSync(f, 'utf8'));
    for (const [id, h] of Object.entries(porRegla)) reales[id].set(rel, h);
  }

  const errores = validarExcepciones();
  const baseline = leerBaseline();

  if (actualizar) {
    const actuales = Object.fromEntries(Object.entries(reales).map(([id, m]) => [id, [...m.keys()]]));
    if (baseline) {
      const nuevos = [];
      for (const [id, lista] of Object.entries(actuales)) {
        for (const rel of lista) if (!(baseline[id] || []).includes(rel)) nuevos.push(`${id} → ${rel}`);
      }
      if (nuevos.length) {
        console.log('La línea base solo puede encogerse. Estos incumplimientos son NUEVOS:');
        for (const n of nuevos) console.log(`   ✗ ${n}`);
        console.log('Corríjalos, o declare una excepción con motivo/alcance/impacto. No se actualizó nada.');
        process.exit(1);
      }
      // Solo se conserva lo que sigue incumpliendo (encoger).
      escribirBaseline(
        Object.fromEntries(
          Object.entries(baseline).map(([id, lista]) => [id, lista.filter((rel) => (actuales[id] || []).includes(rel))]),
        ),
      );
      console.log('Línea base actualizada (encogida).');
    } else {
      escribirBaseline(actuales);
      console.log('Línea base generada por primera vez en scripts/patrones-ui.baseline.json.');
    }
    resumen(leerBaseline() ?? {}, false);
    process.exit(errores.length ? 1 : 0);
  }

  const base = baseline ?? {};
  let fallas = errores.length;
  const obsoletas = [];

  for (const [id, regla] of Object.entries(REGLAS)) {
    const nuevos = [];
    const heredados = [];
    for (const [rel, h] of reales[id]) {
      ((base[id] || []).includes(rel) ? heredados : nuevos).push({ rel, h });
    }
    const conteo = heredados.length ? `${nuevos.length} nuevos, ${heredados.length} heredados` : String(nuevos.length);
    console.log(`\n== ${regla.titulo} (${conteo}) ==`);
    if (nuevos.length === 0) {
      console.log(heredados.length ? '   sin incumplimientos nuevos' : '   sin hallazgos');
    } else {
      fallas += nuevos.reduce((n, x) => n + x.h.length, 0);
      console.log(`   Por qué importa: ${regla.porque}`);
      console.log(`   Arreglo: ${regla.arreglo}`);
      for (const { rel, h } of nuevos) for (const t of h) console.log(`   ✗ ${rel}\n       ${t}`);
    }
    if (verbose) for (const { rel, h } of heredados) console.log(`   · heredado: ${rel} (${h.length})`);
    for (const rel of base[id] || []) if (!reales[id].has(rel)) obsoletas.push(`${id} → ${rel}`);
  }

  if (errores.length) {
    console.log('\n== Configuración de excepciones ==');
    for (const e of errores) console.log(`   ✗ ${e}`);
  }
  if (obsoletas.length) {
    console.log('\n== Línea base obsoleta (ya no incumplen: retírelos) ==');
    for (const o of obsoletas) console.log(`   ! ${o}`);
    console.log('   Ejecute: node scripts/patrones-ui.mjs --actualizar-baseline');
  }

  resumen(base, true);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(
    `Reglas verificadas: ${Object.keys(REGLAS).length} · excepciones declaradas: ${EXCEPCIONES.length} · línea base: ${baseline ? 'sí' : 'NO (todo incumplimiento es nuevo)'}`,
  );
  console.log(`Fallas: ${fallas}`);
  process.exit(fallas > 0 ? 1 : 0);
}

// Solo corre como script; importable (los tests de las reglas lo importan).
const esPrincipal = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (esPrincipal) main(process.argv.slice(2));
