// Quinto guardrail de Design System: clases CSS definidas que nadie aplica, y
// clases aplicadas que nadie define.
//
// POR QUÉ EXISTE
// Los otros cuatro miran tokens (`contraste.mjs` sus valores,
// `tokens-vs-guia.mjs` sus nombres), literales (`literales-vs-tokens.mjs`) y
// estructura del marcado (`patrones-ui.mjs`). Ninguno mira las CLASES, y ahí
// pasan dos cosas que ya ocurrieron de verdad:
//
//   HUÉRFANA  `BadgeEstado.vue` emitía `.badge-inline` durante meses. La clase
//             estaba definida en 4 hojas scoped y se aplicaba en 8 archivos —
//             o sea que en los otros 4 no hacía absolutamente nada. Nadie lo
//             notó porque el resultado de una clase inexistente es que no
//             pasa nada, que es indistinguible de "así se diseñó".
//   MUERTA    `.btn-ghost`, `.badge-group` y `.solo-movil--flex` viven en
//             `main.css` sin un solo consumidor. Cuestan mantenimiento y
//             mienten sobre lo que el sistema ofrece: alguien lee `.btn-ghost`
//             en la hoja y asume que es un patrón vigente.
//
// Es además el MEDIDOR DE PROGRESO del plan de convergencia a Carbon: a
// medida que los módulos adoptan `components/carbon/`, las familias viejas de
// `main.css` van quedando muertas, y esta lista dice cuáles ya se pueden
// borrar sin adivinar.
//
// Ejecutar: node scripts/clases-muertas.mjs
//           node scripts/clases-muertas.mjs --detalle   (dónde se define/usa)
// Sale distinto de 0 solo si hay HUERFANAS (eso es un bug). Las MUERTAS se
// reportan como inventario y no rompen el build: durante la convergencia a
// Carbon suben a proposito. Ver la nota del final del archivo.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(RAIZ, 'frontend/src');
const DETALLE = process.argv.includes('--detalle');

// ── Prefijos que NO son nuestros ──────────────────────────────────────────
// Se aplican en el marcado pero los define un tercero, así que aparecerían
// como HUÉRFANAS para siempre.
const PREFIJOS_EXTERNOS = [
  'ti-',   // webfont Tabler Icons (index.html, CDN)
  'ti',    // la clase base de la misma webfont
];

// ── Exenciones declaradas ─────────────────────────────────────────────────
// Formato obligatorio: clase (o patrón), motivo. Una exención sin motivo no
// es una exención, es un descuido sin documentar.
const EXENCIONES = [
  {
    patron: /-(enter|leave)-(from|to|active)$/,
    motivo:
      'Clases de <transition> de Vue. Las aplica el runtime durante la animación, nunca el marcado, así que definirlas y no "usarlas" es lo normal.',
  },
  {
    clase: 'sr-only',
    motivo:
      'Utilidad de accesibilidad de uso general; no debe reportarse aunque un refactor la deje sin uso momentáneo.',
  },
  {
    patron: /-page$/,
    motivo:
      'Clase raíz de una vista (`.empleados-page`, `.kb-page`…). Es una convención de anclaje: nombra el ámbito para que la propia vista, o un test, pueda apuntarle. Que hoy no tenga regla es lo esperado — el layout lo pone `.vista-modulo`/`.page`, que sí existen.',
  },
];

// ── Archivos exentos ──────────────────────────────────────────────────────
// Las dos vitrinas del Design System, con el mismo motivo que ya tienen en
// scripts/literales-vs-tokens.mjs: existen para MOSTRAR el sistema, así que
// declaran y aplican decenas de clases de demostración que no son del
// producto. Rutas dev-only, no se sirven a usuarios.
const ARCHIVOS_EXENTOS = [
  'modules/styleLab/StyleLabView.vue',
  'modules/designSystem/DesignSystemView.vue',
];
const exento = (f) => ARCHIVOS_EXENTOS.some((x) => f.endsWith(x));

function exencionDe(clase) {
  return EXENCIONES.find((e) => (e.clase ? e.clase === clase : e.patron.test(clase)));
}

function archivos(dir, exts, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, exts, acc);
    else if (exts.includes(extname(p))) acc.push(p);
  }
  return acc;
}

const rel = (f) => relative(RAIZ, f).split('\\').join('/');

// ── 1. Clases DEFINIDAS ───────────────────────────────────────────────────
// Se leen los selectores de todo bloque CSS (main.css, carbon-theme.css y el
// <style> de cada .vue, scoped o no). Se ignora lo que hay dentro de las
// llaves: un `.x` en una declaración es un valor, no un selector.
const definidas = new Map(); // clase -> Set(archivo)

function registrarDefiniciones(css, archivo) {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Cada bloque de selector: lo que hay antes de un `{` que abre reglas.
  // El `{` va entre los delimitadores de apertura a propósito: sin él, la
  // PRIMERA regla dentro de un `@media` no se registraba (venía precedida
  // por la llave del media query, no por `;` ni `}`), y todo lo que solo
  // existe en un breakpoint se reportaba como huérfano.
  for (const m of sinComentarios.matchAll(/(^|[{};])\s*([^{};@]+)\{/g)) {
    const selector = m[2];
    // `:deep(.x)`, `.a .b`, `.a.b`, `.a:hover` — todas cuentan.
    for (const c of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      if (!definidas.has(c[1])) definidas.set(c[1], new Set());
      definidas.get(c[1]).add(archivo);
    }
  }
}

// ── 2. Clases APLICADAS ───────────────────────────────────────────────────
const usadas = new Map();   // clase -> Set(archivo)
const prefijos = new Set(); // de `clase-${x}`: cualquier clase con ese prefijo cuenta como usada

function marcarUso(clase, archivo) {
  if (!clase) return;
  if (!usadas.has(clase)) usadas.set(clase, new Set());
  usadas.get(clase).add(archivo);
}

// Una clase cuenta como usada solo si el nombre aparece EN UN CONTEXTO DE
// CLASE. Buscarlo suelto en cualquier cadena del archivo daba basura: un
// `'token'` en un comentario marcaba `.token` como usada. Los contextos
// reales son tres: el atributo class/:class, el `clase:` con que los
// core/dominio-* devuelven una clase al marcado, y un template literal.
// Solo kebab-case en minúscula (con `--`/`__` de BEM). No es cosmético: el
// valor de un `:class` trae, además de las clases, los identificadores de la
// expresión — `:class="{ 'vinculo--pendiente': altaPendiente(emp) }"` deja
// suelto `altaPendiente`, y `:class="rol === 'JEFE' ? …"` deja `JEFE`.
// Ninguna clase de este sistema lleva mayúsculas (verificado sobre las 1017
// definidas), así que exigir minúscula separa las clases de los
// identificadores sin necesidad de parsear JavaScript.
const esClase = (c) => /^[a-z][a-z0-9]*([-_]{1,2}[a-z0-9]+)*$/.test(c);

// `class` estático: cada token es una clase, sin más.
function usosDeClaseEstatica(valor, archivo) {
  for (const c of valor.split(/\s+/)) if (esClase(c)) marcarUso(c, archivo);
}

// `:class` dinámico: es una EXPRESIÓN de JavaScript, y ahí un identificador
// suelto casi nunca es una clase. Solo dos formas lo son:
//
//   'una-clase'                    literal de cadena
//   { 'una-clase': cond }          clave de objeto (con o sin comillas)
//
// Todo lo demás —`cond`, `fila.estado`, `altaPendiente(emp)`, `false`— es
// código. Tomar cada token lowercase del valor entero, que es lo que hacía
// la primera versión de este check, reportaba 40 identificadores de JS como
// clases huérfanas y volvía inútil la lista.
function usosDeClaseDinamica(valor, archivo) {
  // Antes de nada, fuera los literales de COMPARACIÓN: en
  // `:class="{ 'campo-invalido': campoInvalido === 'codigo' }"` hay dos
  // cadenas y solo la primera es una clase; la segunda es el valor contra
  // el que se compara. Sin esto el check reportaba como clases huérfanas
  // los nombres de campo y los valores de enum de media docena de
  // formularios (`codigo`, `serie`, `ninguno`, `compartida`…).
  const expr = valor
    .replace(/[!=]==?\s*(?:'[^']*'|`[^`$]*`)/g, ' ')
    .replace(/(?:'[^']*'|`[^`$]*`)\s*[!=]==?/g, ' ');
  for (const m of expr.matchAll(/'([^']*)'|`([^`$]*)`/g)) {
    for (const c of (m[1] ?? m[2]).split(/\s+/)) if (esClase(c)) marcarUso(c, archivo);
  }
  // Clave de objeto sin comillas: `{ activo: esActivo }`, `, seleccionada: x`
  for (const m of expr.matchAll(/[{,]\s*([a-z][\w-]*)\s*:/g)) {
    if (esClase(m[1])) marcarUso(m[1], archivo);
  }
}

function registrarUsos(texto, archivo, { esTemplate }) {
  if (esTemplate) {
    for (const m of texto.matchAll(/(^|[\s"'])(:|v-bind:)?class\s*=\s*"([^"]*)"/gm)) {
      if (m[2]) usosDeClaseDinamica(m[3], archivo);
      else usosDeClaseEstatica(m[3], archivo);
    }
    // <transition name="x"> genera x-enter-from, x-leave-active, etc.
    for (const m of texto.matchAll(/<transition(?:-group)?[^>]*\bname\s*=\s*"([\w-]+)"/g)) {
      for (const s of ['enter-from', 'enter-active', 'enter-to', 'leave-from', 'leave-active', 'leave-to']) {
        marcarUso(`${m[1]}-${s}`, archivo);
      }
    }
  }
  // `clase: 'badge--sky'` — cómo los core/dominio-*.js y core/badges.js
  // devuelven una clase, y cómo la reciben BadgeEstado y las vistas.
  for (const m of texto.matchAll(/\bclase\s*:\s*'([^']*)'/g)) {
    for (const c of m[1].split(/\s+/)) if (esClase(c)) marcarUso(c, archivo);
  }
  // Devolución directa de una clase modificadora: `return 'avatar--neutro'`,
  // y los arreglos de tonos de core/avatar.js.
  for (const m of texto.matchAll(/'([\w-]+--[\w-]+)'/g)) marcarUso(m[1], archivo);
  // Prefijos dinámicos: `cds-tag--${rol}`, `avatar--${tono}`, `col-${n}`.
  for (const m of texto.matchAll(/`([\w-]+)\$\{/g)) prefijos.add(m[1]);
}

// ── Recorrido ─────────────────────────────────────────────────────────────
const fuentes = archivos(SRC, ['.vue', '.js', '.css']);

for (const f of fuentes) {
  if (exento(rel(f))) continue;
  const txt = readFileSync(f, 'utf8');
  if (f.endsWith('.css')) registrarDefiniciones(txt, rel(f));
  else if (f.endsWith('.vue')) {
    for (const m of txt.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) registrarDefiniciones(m[1], rel(f));
  }
}

for (const f of fuentes) {
  if (exento(rel(f))) continue;
  const txt = readFileSync(f, 'utf8');
  if (f.endsWith('.css')) continue;
  if (f.endsWith('.js')) { registrarUsos(txt, rel(f), { esTemplate: false }); continue; }
  const sinEstilos = txt.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
  registrarUsos(sinEstilos, rel(f), { esTemplate: true });
}

const cubiertaPorPrefijo = (c) => [...prefijos].some((p) => c.startsWith(p) && c !== p);

// Base de BEM: `.selector-vista__btn` no tiene reglas propias, pero
// `.selector-vista__btn--activo` sí. La base existe para que el modificador
// signifique algo y para que el marcado se lea — quitarla dejaría un
// `class="…--activo"` sin sustantivo. No es una clase huérfana, es la mitad
// de un par. Se resuelve como regla y no como lista a mano porque la lista
// habría que mantenerla cada vez que aparece un modificador nuevo.
const definidasArr = [...definidas.keys()];
const esBaseBem = (c) => definidasArr.some((d) => d.startsWith(`${c}--`) || d.startsWith(`${c}__`));

// ── 3. Los dos hallazgos ──────────────────────────────────────────────────
const muertas = [...definidas.keys()]
  .filter((c) => !usadas.has(c) && !cubiertaPorPrefijo(c) && !exencionDe(c))
  .sort();

const huerfanas = [...usadas.keys()]
  .filter((c) => !definidas.has(c) && !cubiertaPorPrefijo(c) && !exencionDe(c) && !esBaseBem(c))
  .filter((c) => !PREFIJOS_EXTERNOS.some((p) => c === p || c.startsWith(p)))
  .sort();

function bloque(titulo, lista, explicacion, mapa) {
  console.log(`\n== ${titulo} (${lista.length}) ==`);
  if (!lista.length) return console.log('   sin hallazgos');
  console.log(`   ${explicacion}`);
  for (const c of lista) {
    console.log(`   - .${c}`);
    if (DETALLE) for (const f of mapa.get(c)) console.log(`       ${f}`);
  }
}

bloque(
  'HUÉRFANA — el marcado aplica una clase que ninguna hoja define',
  huerfanas,
  'No pasa nada al aplicarla, y "no pasa nada" es indistinguible de "así se diseñó". O se define, o se saca del marcado.',
  usadas,
);
bloque(
  'MUERTA — clase definida que nadie aplica (inventario, NO falla)',
  muertas,
  'Lista de trabajo para la Fase D del plan de convergencia: son las que ya se pueden borrar sin adivinar.',
  definidas,
);

console.log(`\n== EXENCIONES DECLARADAS (${EXENCIONES.length}) ==`);
for (const e of EXENCIONES) console.log(`   - ${e.clase ? `.${e.clase}` : e.patron}  ·  ${e.motivo}`);

console.log(`\nClases definidas: ${definidas.size} · aplicadas: ${usadas.size} · prefijos dinámicos: ${prefijos.size}`);
console.log(`Muertas (inventario): ${muertas.length} · Huérfanas (fallan): ${huerfanas.length}`);
if (!DETALLE && (muertas.length || huerfanas.length)) {
  console.log('Correr con --detalle para ver en qué archivo está cada una.');
}

// Solo las HUÉRFANAS rompen el build, y la asimetría es deliberada:
//
//   Huérfana = BUG. Una clase aplicada sin regla no hace nada, y "no hace
//   nada" es indistinguible de "así se diseñó". Se exige 0.
//
//   Muerta = INVENTARIO. Durante la convergencia a Carbon las clases muertas
//   van a SUBIR a propósito: cada módulo que adopta components/carbon/ deja
//   atrás la familia vieja de main.css, y recién la Fase D la borra. Un
//   trinquete "solo puede bajar" bloquearía exactamente el trabajo que este
//   plan quiere que ocurra, y exigir 0 obligaría a borrar main.css en el
//   mismo cambio que migra la primera vista. Se reporta y no se exige.
process.exit(huerfanas.length > 0 ? 1 : 0);
