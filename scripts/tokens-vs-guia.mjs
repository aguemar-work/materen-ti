// Verificador de deriva entre los tokens reales (main.css), sus consumidores
// (frontend/src) y lo que documenta docs/GUIA-UX-UI.md.
//
// Por qué existe: los ciclos de docs/HISTORIAL-AUDITORIAS.md repiten el mismo
// hallazgo con distinto nombre (DS-01..DS-05, INV-05, DP-04, DP-05, DP-06,
// Q-01): la guía afirma un estado que el código ya no tiene, o el código
// define tokens que la guía no menciona y nadie consume. Cada vez se corrigió
// a mano el caso puntual, nunca el mecanismo. Esto lo hace ejecutable, igual
// que scripts/contraste.mjs hizo ejecutable el umbral de contraste.
//
// Ejecutar: node scripts/tokens-vs-guia.mjs
// Salida distinta de 0 = hay deriva. Se corre en CI (.github/workflows/ci.yml).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Rutas resueltas desde la ubicación del propio script, no desde el cwd: en CI
// el job corre con working-directory en frontend/ (ver ci.yml).
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const CSS = join(RAIZ, 'frontend/src/styles/main.css');
// Capa vendor de Carbon v11 (2026-09-02): los valores `--cds-*`. Se lee para
// que la guia pueda NOMBRARLOS sin que el check los reporte como fantasma
// (documentar los tokens de shell es obligatorio: son la unica excepcion a
// "ningun componente consume --cds-*"). No entra al check MUERTO — ver
// ES_VENDOR mas abajo.
const CSS_VENDOR = join(RAIZ, 'frontend/src/styles/carbon-theme.css');
const GUIA = join(RAIZ, 'docs/GUIA-UX-UI.md');
const SRC = join(RAIZ, 'frontend/src');

// Un token de la capa vendor es un VALOR de la especificacion de Carbon, no
// un rol del producto. Eso cambia dos de los tres checks:
//
//   MUERTO          no aplica. Una escala de color es completa por
//                   definicion: Blue 30 existe porque Carbon define 10 pasos
//                   de azul, no porque una regla lo pinte hoy. Se reportan
//                   aparte, como inventario.
//   CAPA DUPLICADA  no aplica a la indireccion rol -> vendor
//                   (`--color-accent: var(--cds-blue-60)`). Ese check se
//                   escribio para dos nombres del MISMO rol con un prefijo
//                   de espacio de nombres (`--mat-color-accent` vs
//                   `--color-accent`, la capa que se colapso el 2026-09-01).
//                   Un rol que apunta a un valor de escala es la indireccion
//                   para la que sirve un design system, no su duplicacion:
//                   --color-accent puede dejar de ser Blue 60 sin que Blue 60
//                   deje de ser #0f62fe. Dos nombres de ROL para el mismo rol
//                   siguen fallando.
const ES_VENDOR = (t) => t.startsWith('--cds-');

// ── Tokens vivos por decisión explícita, sin consumidor en código ─────────
// Solo entran acá con una razón escrita. No es una vía para silenciar
// hallazgos: un token sin razón es un token muerto y debe borrarse.
const VIVOS_POR_DECISION = {
  '--color-brand':
    'Reservado a piezas de marca (logo), no es color de sistema — ver GUIA-UX-UI "Identidad de marca".',
};

// ── Deuda declarada: definido, sin consumidor, y a propósito ──────────────
// Distinto de MUERTO (hay que borrarlo) y de VIVOS_POR_DECISION (se queda
// para siempre): esto es intención pendiente de ejecutar. Se reporta aparte
// y no rompe el check, pero queda a la vista en el código con su motivo — no
// enterrada en un documento. Vaciar esta lista es trabajo real, no limpieza.
const DEUDA_DECLARADA = {
  // La escala de espaciado existe declarada desde el inicio y NUNCA se
  // consumió: todo el espaciado del sistema está hardcodeado en px. Borrarla
  // sería aceptar que no hay escala; adoptarla toca ~100 archivos. Se
  // conserva como el objetivo, con la deuda visible acá.
  '--space-1': 'Escala de espaciado sin adoptar — solo space-7 y space-9 tienen consumidor.',
  '--space-2': 'Escala de espaciado sin adoptar.',
  '--space-3': 'Escala de espaciado sin adoptar.',
  '--space-4': 'Escala de espaciado sin adoptar.',
  '--space-5': 'Escala de espaciado sin adoptar.',
  '--space-6': 'Escala de espaciado sin adoptar.',
  '--space-8': 'Escala de espaciado sin adoptar.',
  '--space-10': 'Escala de espaciado sin adoptar.',
  '--space-11': 'Escala de espaciado sin adoptar.',
  '--space-12': 'Escala de espaciado sin adoptar.',
  // Huérfanos de las familias categóricas: sus -bg/-text sí se usan, el
  // -border nunca. Ya diagnosticado como DP-05 en HISTORIAL-AUDITORIAS,
  // marcado allí como "decisión de producto pendiente". Retirarlos toca
  // main.css, que hoy tiene trabajo en vuelo — se deja anotado, no ejecutado.
  '--color-teal-border': 'Huérfano categórico (DP-05): la familia usa -bg/-text, nunca -border.',
  '--color-teal-border': 'Alias de un huérfano categórico (DP-05).',
  '--color-purple-border': 'Huérfano categórico (DP-05).',
  '--color-purple-border': 'Alias de un huérfano categórico (DP-05).',
  '--color-sky-border': 'Huérfano categórico (DP-05).',
  '--color-sky-border': 'Alias de un huérfano categórico (DP-05).',
  '--color-neutral-border': 'Huérfano categórico (DP-05).',
  '--color-neutral-border': 'Alias de un huérfano categórico (DP-05).',
  '--color-teal-bg-subtle': 'Huérfano categórico (DP-05).',
  '--color-teal-bg-subtle': 'Alias de un huérfano categórico (DP-05).',
  // Duplicados de acento: -alt/-subtle-bg/-subtle-text son alias internos
  // sin ningún consumidor propio tras la migración de marca a azul.
  '--color-accent-alt': 'Alias interno de acento sin consumidor tras la migración a azul.',
  '--color-accent-subtle-bg': 'Alias interno de acento sin consumidor.',
  '--color-accent-subtle-text': 'Alias interno de acento sin consumidor.',
  '--z-modal-stacked': 'Nivel de z-index reservado para modal sobre modal, caso que hoy no existe.',
};

// ── Menciones de la guía que NO son tokens ────────────────────────────────
// Modificadores de clase CSS escritos entre backticks (`--ok` por
// `.capacidad--ok`). Lista explícita a propósito: filtrarlos por forma
// también se tragaría tokens reales cortos.
const MENCIONES_NO_TOKEN = new Set([
  '--activa', '--full', '--isla', '--max-w', '--ok', '--warning',
]);

function archivos(dir, exts, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, exts, acc);
    else if (exts.includes(extname(p))) acc.push(p);
  }
  return acc;
}

const css = readFileSync(CSS, 'utf8');
const cssVendor = readFileSync(CSS_VENDOR, 'utf8');

// 1. Definiciones de token: `--nombre: valor;`. Se guarda el valor para poder
//    seguir las referencias var() de un token a otro (capa de alias).
const definidos = new Map();
for (const fuente of [css, cssVendor]) {
  for (const m of fuente.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim)) {
    const [, nombre, valor] = m;
    if (!definidos.has(nombre)) definidos.set(nombre, []);
    definidos.get(nombre).push(valor.trim());
  }
}

// 2. Consumidores reales. Un token está "usado en regla" si aparece como
//    var(--x) en una posición que NO es el valor de otra custom property:
//    esos son los usos que pintan algo en pantalla.
const usadoEnRegla = new Set();
function registrarUsosDeReglas(texto) {
  const sinDefs = texto.replace(/^\s*--[a-z0-9-]+\s*:[^;]+;/gim, '');
  for (const m of sinDefs.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) usadoEnRegla.add(m[1]);
}
registrarUsosDeReglas(css);
registrarUsosDeReglas(cssVendor);
for (const f of archivos(SRC, ['.vue', '.js', '.css'])) {
  if (f.endsWith('main.css')) continue;
  registrarUsosDeReglas(readFileSync(f, 'utf8'));
}

// 3. Alcanzabilidad: si un token vivo referencia a otro en su valor, ese otro
//    también está vivo (así sobrevive la capa de alias --color-* que envuelve
//    a los --*, cuyo consumidor real es el alias, no una regla).
const vivos = new Set(usadoEnRegla);
for (const t of Object.keys(VIVOS_POR_DECISION)) vivos.add(t);
for (let cambio = true; cambio; ) {
  cambio = false;
  for (const t of [...vivos]) {
    for (const valor of definidos.get(t) || []) {
      for (const m of valor.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        if (!vivos.has(m[1])) { vivos.add(m[1]); cambio = true; }
      }
    }
  }
}

// 4. Lo que menciona la guía. Solo cuentan las menciones entre `backticks`
//    que ARRANCAN con `--`, más las definiciones dentro de sus bloques ```css.
//    Así no entran los modificadores BEM (`.fila-ticket--activa`), las reglas
//    horizontales de markdown (`---`) ni los prefijos truncados (`--color-`).
// La región <!-- tokens-retirados:inicio/fin --> nombra tokens ya borrados a
// propósito (registro de qué se retiró y por qué): se recorta antes de leer,
// o cada retiro bien documentado se reportaría como deriva. Es opt-in por
// región, así que no puede tapar deriva nueva en el resto del documento.
const guia = readFileSync(GUIA, 'utf8')
  .replace(/<!--\s*tokens-retirados:inicio[\s\S]*?tokens-retirados:fin\s*-->/g, '');
const mencionados = new Set();
for (const m of guia.matchAll(/`(--[a-z0-9-]+)`/g)) mencionados.add(m[1]);
for (const m of guia.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) mencionados.add(m[1]);
for (const t of [...mencionados]) if (t.endsWith('-')) mencionados.delete(t);

// ── Capa duplicada ────────────────────────────────────────────────────────
// Dos nombres para el MISMO concepto: `--P-x: var(--x)` o `--x: var(--P-x)`,
// donde un nombre es el otro más un prefijo de espacio de nombres. Es el
// patrón que el sistema arrastró hasta el 2026-09-01 — 190 tokens para 104
// conceptos, con el código usando la capa marcada "no usar" el 86% de las
// veces. Se colapsó; este check impide que vuelva a crecer.
//
// NO confunde esto con un alias semántico legítimo (`--color-accent:
// var(--color-brand-600)`): ahí los dos nombres dicen cosas distintas —
// un rol y un valor de escala—, y esa indirección es justamente para lo que
// sirve un design system. Solo se reporta cuando un nombre es el otro con un
// prefijo pegado delante.
const capaDuplicada = [];
for (const [t, valores] of definidos) {
  for (const v of valores) {
    const m = v.trim().match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/);
    if (!m) continue;
    const otro = m[1];
    // Rol -> valor de escala: la indireccion legitima (ver ES_VENDOR arriba).
    if (ES_VENDOR(otro) && !ES_VENDOR(t)) continue;
    const a = t.slice(2);
    const b = otro.slice(2);
    if (a.endsWith('-' + b) || b.endsWith('-' + a)) {
      capaDuplicada.push(`${t}: ${v}  — un nombre es el otro con prefijo`);
    }
  }
}

// ── Referencias rotas ─────────────────────────────────────────────────────
// Un `var(--x)` cuyo token no existe en ninguna parte es INVÁLIDO en tiempo de
// cómputo: el navegador descarta la declaración entera y el elemento hereda lo
// del padre. No falla el build, no lo ve ESLint, no lo ve ningún test — se ve
// solo mirando la pantalla, y a veces ni ahí. Así vivió sin detectarse que
// `--color-text-disabled` nunca se definiera pese a tener dos consumidores.
//
// Con fallback (`var(--x, algo)`) el caso es distinto: degrada bien. Se
// informa como indirección muerta, pero no falla.
//
// Se resuelve contra los tokens definidos en CUALQUIER archivo, no solo en
// main.css: las custom properties heredan por el DOM, así que un token que
// AppLayout declara en su ámbito lo consume legítimamente AppNav (los --sb-*).
const definidosEnCualquierParte = new Set(definidos.keys());
const contextosCss = [];
for (const f of archivos(SRC, ['.vue', '.css'])) {
  const txt = readFileSync(f, 'utf8');
  const css = f.endsWith('.css')
    ? txt
    : [...txt.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  if (!css.trim()) continue;
  contextosCss.push({ f, css });
  for (const m of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) definidosEnCualquierParte.add(m[1]);
}

const rotasSinFallback = [];
const indireccionMuerta = [];
for (const { f, css } of contextosCss) {
  const rel = relative(RAIZ, f).split(String.fromCharCode(92)).join('/');
  for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)) {
    if (definidosEnCualquierParte.has(m[1])) continue;
    (m[2] === ',' ? indireccionMuerta : rotasSinFallback).push(`${rel} → var(${m[1]})`);
  }
}

// ── Los 3 checks ──────────────────────────────────────────────────────────
const fantasma = [...mencionados]
  .filter((t) => !definidos.has(t) && !MENCIONES_NO_TOKEN.has(t))
  .sort();
const muerto = [...definidos.keys()]
  .filter((t) => !vivos.has(t) && !(t in DEUDA_DECLARADA) && !ES_VENDOR(t))
  .sort();
const vendorSinUso = [...definidos.keys()].filter((t) => ES_VENDOR(t) && !vivos.has(t)).sort();
const deuda = [...definidos.keys()].filter((t) => t in DEUDA_DECLARADA).sort();
// La capa vendor queda fuera: la guia documenta la CAPA (que es, donde vive,
// que rol de Carbon cumple cada grupo) y los tokens de shell uno por uno,
// pero no tiene sentido exigirle una entrada por cada paso de cada escala de
// color. Lo que si tiene que estar documentado es el ROL del producto que lo
// consume, y eso lo sigue vigilando esta lista.
const noDocumentado = [...definidos.keys()]
  .filter((t) => vivos.has(t) && !mencionados.has(t) && !ES_VENDOR(t))
  .sort();

function bloque(titulo, lista, explicacion) {
  console.log(`\n== ${titulo} (${lista.length}) ==`);
  if (lista.length === 0) return console.log('   sin hallazgos');
  console.log(`   ${explicacion}`);
  for (const t of lista) console.log(`   - ${t}`);
}

bloque(
  'FANTASMA — la guía nombra un token que main.css no define',
  fantasma,
  'Deriva de documentación: la guía describe algo que el código ya no tiene.',
);
bloque(
  'MUERTO — token definido en main.css sin ningún consumidor',
  muerto,
  'Deriva de código: se mantiene un token que no pinta nada. Borrarlo, o declararlo en VIVOS_POR_DECISION con su razón.',
);
bloque(
  'NO DOCUMENTADO — token vivo que la guía nunca menciona',
  noDocumentado,
  'La guía es la fuente de verdad del design system: un token que pinta algo y que ella no nombra es un pedazo del sistema que solo existe en el código.',
);

console.log(`
== DEUDA DECLARADA — definido a propósito, sin consumidor todavía (${deuda.length}) ==`);
for (const t of deuda) console.log(`   - ${t}  ·  ${DEUDA_DECLARADA[t]}`);

bloque(
  'PALETA VENDOR — paso de Carbon transcrito sin mapear todavía (inventario)',
  vendorSinUso,
  'No es deuda ni error: una escala es completa por definición. Si la lista crece mucho, es señal de que carbon-theme.css está transcribiendo pasos que nadie va a usar.',
);
bloque(
  'CAPA DUPLICADA — dos nombres para el mismo concepto',
  [...new Set(capaDuplicada)].sort(),
  'Un nombre por concepto. Si el segundo nombre expresa un ROL distinto (accent → brand-600), no es esto; si solo agrega un prefijo, es la capa que se colapsó el 2026-09-01.',
);
bloque(
  'REFERENCIA ROTA — var(--x) sin fallback de un token que no existe',
  [...new Set(rotasSinFallback)].sort(),
  'La declaración se descarta en el navegador y el elemento hereda del padre: bug visible que ningún test ve.',
);
bloque(
  'INDIRECCIÓN MUERTA — var(--x, fallback) de un token inexistente (aviso)',
  [...new Set(indireccionMuerta)].sort(),
  'Degrada bien porque tiene fallback, pero el token nunca existió: el fallback ES el valor. Simplificar o crear el token.',
);

// NO DOCUMENTADO entra en las fallas desde el 2026-09-02. Era un aviso
// porque había 101 tokens vivos sin mencionar y exigir 0 habría sido pedir
// que alguien escribiera la guía entera en un solo cambio — la Fase 2 del
// PLAN-MAESTRO existe justamente para bajarlo. Llegó a 0 con el rediseno a
// Carbon (la guía se reescribió entera y se agregó el inventario por
// familia), así que ahora se puede exigir: mantenerlo en 0 cuesta una línea
// por token nuevo, volver a subirlo cuesta otra pasada de documentación
// completa.
const fallas = fantasma.length + muerto.length + noDocumentado.length
  + new Set(rotasSinFallback).size + new Set(capaDuplicada).size;
const vivosDefinidos = [...definidos.keys()].filter((t) => vivos.has(t)).length;
console.log(`Capa vendor (--cds-*): ${[...definidos.keys()].filter(ES_VENDOR).length} tokens, ${vendorSinUso.length} sin mapear`);
console.log(`\nTokens definidos: ${definidos.size} · vivos: ${vivosDefinidos} · sin documentar: ${noDocumentado.length}`);
console.log(`Fallas (fantasma + muerto + sin documentar + rotas + duplicadas): ${fallas}`);
process.exit(fallas > 0 ? 1 : 0);
