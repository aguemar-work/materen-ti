// Detector de literales que deberían ser tokens del Design System.
//
// Hermano de scripts/tokens-vs-guia.mjs, que compara NOMBRES de token entre
// main.css, el código y la guía. Este mira lo que aquel no puede ver: los
// VALORES escritos a mano dentro de los <style> de los componentes.
//
// No es una persecución de cualquier literal. Distingue dos cosas:
//
//   Literal legítimo         — el valor no puede salir de un token por una
//                              razón técnica real (un scrim sobre una foto
//                              arbitraria, un 50% de círculo, la vitrina que
//                              tiene que mostrar valores crudos). Va en
//                              EXCEPCIONES, con motivo/alcance/impacto.
//   Literal que es una regla — el valor codifica una decisión de diseño que
//                              ya tiene token (un radio de 8px, un color de
//                              marca, un paso de espaciado). Ese es el que se
//                              reporta.
//
// Dos regímenes, según lo que el árbol real aguanta hoy:
//
//   ESTRICTO — color, radio, sombra y tipografía. Medidos: casi cero
//              hallazgos. Se exige 0 y falla el build. Es un trinquete que
//              impide que una categoría limpia se ensucie.
//   TRINQUETE — espaciado. Hay ~600 literales; exigir 0 hoy sería pedir una
//              sustitución masiva ciega, justo lo que NO se quiere. Se fija
//              una línea base y el check falla solo si el número SUBE. La
//              deuda solo puede encogerse, nunca crecer.
//
// Ejecutar: node scripts/literales-vs-tokens.mjs
//           node scripts/literales-vs-tokens.mjs --detalle   (lista cada caso)
//           node scripts/literales-vs-tokens.mjs --fijar-base (reescribe la
//           línea base tras una migración; solo baja, nunca sube)

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(RAIZ, 'frontend/src');
const BASE = join(RAIZ, 'scripts/literales-base.json');

// ── Excepciones declaradas ────────────────────────────────────────────────
// Formato obligatorio por entrada: motivo / alcance / impacto. Una excepción
// sin las tres cosas no es una excepción, es un descuido sin documentar.
const EXCEPCIONES = [
  {
    archivo: 'modules/styleLab/StyleLabView.vue',
    categorias: ['color', 'radio', 'sombra', 'tipografia', 'espaciado'],
    motivo:
      'Vitrina del Design System: redefine los tokens en su propio ámbito para poder mostrar el sistema real y variantes lado a lado. Si consumiera los tokens no podría mostrar nada.',
    alcance: 'Archivo completo. Ruta dev-only, no existe en el router de producción.',
    impacto: 'Ninguno en producción: no se sirve a usuarios.',
  },
  {
    archivo: 'modules/designSystem/DesignSystemView.vue',
    categorias: ['color', 'radio', 'sombra', 'tipografia', 'espaciado'],
    motivo:
      'Misma razón que el Style Lab: documenta los tokens mostrando sus valores crudos.',
    alcance: 'Archivo completo. Ruta dev-only.',
    impacto: 'Ninguno en producción.',
  },
  {
    archivo: 'modules/equipos/EquipoForm.vue',
    categorias: ['color'],
    valores: ['rgba(0, 0, 0, 0.55)', '#fff'],
    motivo:
      'Scrim de un botón que flota SOBRE UNA FOTO subida por el usuario, no sobre una superficie del sistema. Un token de tema no sirve: el contraste debe garantizarse contra una imagen arbitraria, igual en claro y en oscuro. No es el overlay de modal (ese sí es rgba(12,15,17,.55) y vive en main.css).',
    alcance: 'Botón de quitar foto en la miniatura.',
    impacto: 'Ninguno: invariante entre temas a propósito.',
  },
  {
    archivo: 'modules/tickets/TicketNuevoView.vue',
    categorias: ['color'],
    valores: ['rgba(0, 0, 0, 0.55)', '#fff'],
    motivo: 'Mismo scrim sobre foto adjunta que EquipoForm.vue.',
    alcance: 'Botón de quitar adjunto en la miniatura.',
    impacto: 'Ninguno: invariante entre temas a propósito.',
  },
  {
    archivo: 'components/shared/AppLayout.vue',
    categorias: ['sombra', 'color'],
    valores: ['4px 0 16px rgba(22, 22, 22, 0.4)'],
    motivo:
      'Sombra DIRECCIONAL del panel deslizante del SideNav en móvil (proyecta hacia la derecha para despegarlo del contenido). --shadow-overlay es de elevación vertical y no expresa dirección. El valor se recalculó sobre Gray 100 (#161616) en el rediseno a Carbon: era rgba(12, 15, 17, .4), el gris del sistema anterior.',
    alcance: 'Solo .cds-side-nav--abierto en el breakpoint móvil.',
    impacto:
      'Si algún día aparece un segundo panel deslizante, conviene tokenizarla como --shadow-drawer en vez de copiarla.',
  },
  {
    archivo: 'modules/tickets/EncuestaSatisfaccionForm.vue',
    categorias: ['tipografia'],
    valores: ['24px'],
    motivo:
      'Tamaño del control de estrellas de satisfacción: es un objetivo táctil, no texto. La escala --fs-* gobierna texto; dimensionar un control por su escala tipográfica ataría dos cosas que cambian por motivos distintos.',
    alcance: 'Solo las estrellas del formulario de satisfacción.',
    impacto: 'Ninguno. Si aparece un segundo control así, tokenizar como tamaño de control.',
  },
];


// ── Decisiones pendientes ─────────────────────────────────────────────────
// Ni excepción legítima ni hallazgo a corregir: valores FUERA de la escala
// del sistema cuya resolución cambia lo que se ve, así que exige una decisión
// de producto y no un criterio técnico. No fallan el check, pero se imprimen
// siempre: quedan nombrados en el código, no olvidados en un documento.
// Vaciar esta lista es trabajo real.
const DECISIONES_PENDIENTES = [
  // Vaciada el 2026-09-02 por el rediseno a Carbon v11. Los cuatro casos que
  // vivian aca eran radios fuera de escala (10px en AppSearch y
  // DashboardView, 20px en LicenciasView, 4px en PlataformasView) y la
  // decision pendiente era "ajustar al paso mas cercano o aceptar un paso
  // nuevo". Con la geometria de Carbon la pregunta desaparecio: hay UN radio
  // y vale 0 (--radius-base), no una escala de la que elegir un paso. Los
  // cuatro se normalizaron.
  //
  // La lista se conserva vacia a proposito: el mecanismo sirve —un valor
  // fuera de escala cuya resolucion cambia lo que se ve exige una decision de
  // producto, no un criterio tecnico— y volvera a hacer falta. Lo que no debe
  // volver es una entrada sin `evidencia` y `decision`.
];

// Sin archivo asociado: decisiones de escala/identidad que no son un literal
// puntual sino una propiedad del sistema. Solo se imprimen.
const PENDIENTES_DE_SISTEMA = [
  {
    caso: 'espaciado 14px, sin token',
    evidencia:
      'La escala salta de space-6 (12px) a space-7 (16px). 14px es uno de los valores mas usados del arbol (~55 veces) y no tiene paso. O a la escala le falta uno, o esos usos deberian normalizarse.',
    decision:
      'Insertar un paso rompe la numeracion correlativa 1..12; normalizar cambia el render en 55 sitios. Decision de producto, no tecnica.',
  },
];

// ── Marca retirada ────────────────────────────────────────────────────────
// Valores de identidad ya retirados que no deben reaparecer en una regla.
// Solo entran los REALMENTE ausentes del arbol: #072E2A sigue vivo como
// --color-whatsapp-text (ver arriba) y #34D399 coincide con
// --color-success en oscuro. Incluirlos daria falsos positivos, que es
// justo lo que vuelve inutil a un check.
const MARCA_RETIRADA = {
  '#0A2E28': '--color-brand-elevated, retirado el 2026-09-01',
  '#00203F': 'navy de la identidad anterior a la migracion a azul',
  '#36ECDE': 'mint de la identidad anterior a la migracion a azul',
};

// ── Categorías ────────────────────────────────────────────────────────────
const CATEGORIAS = {
  color: {
    régimen: 'estricto',
    // Hex de 3/6/8 dígitos, y rgb()/rgba() con componentes numéricos.
    patrón: /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+[^)]*\)/g,
    // `currentColor`, `transparent` e `inherit` no son literales de color.
    consejo: 'Usar var(--color-*) / var(--color-*). Si el valor debe ser invariante entre temas, declararlo en main.css y consumirlo, no copiarlo.',
  },
  radio: {
    régimen: 'estricto',
    patrón: /border-radius:\s*([^;]+)/g,
    // 50% y 100% son geometría (círculo), no un paso de la escala.
    filtro: (v) => /\d+px/.test(v),
    consejo: 'Usar var(--radius-base) — la geometría de Carbon es UN radio y vale 0. 50% para círculos es legítimo y no se reporta.',
  },
  sombra: {
    régimen: 'estricto',
    patrón: /box-shadow:\s*([^;]+)/g,
    filtro: (v) => /rgba?\(/.test(v) && !/var\(/.test(v),
    consejo: 'Usar var(--shadow-overlay), y solo en una capa teletransportada (menu, popover, toast, drawer). Tarjetas, tablas, modales y campos son planos en Carbon.',
  },
  tipografia: {
    régimen: 'estricto',
    patrón: /font-size:\s*([^;]+)/g,
    filtro: (v) => /\d+px/.test(v),
    consejo: 'Usar var(--fs-*). rem/em relativos a un contenedor no se reportan.',
  },
  espaciado: {
    régimen: 'trinquete',
    patrón: /(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left))?:\s*([^;]+)/g,
    // 0, auto, %, rem y 1px (hairline, casi siempre un borde) no son pasos.
    filtro: (v) => /\b(?!1px)\d+px/.test(v),
    consejo: 'Usar var(--space-N). Ver docs/PLAN-MAESTRO-MATEREN.md §6.2 — adopción progresiva, no sustitución masiva.',
  },
};

function archivos(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, acc);
    else if (extname(p) === '.vue') acc.push(p);
  }
  return acc;
}

// Solo se mira el contenido de <style>: un literal dentro del <template> o
// del <script> (un color de dato, un ancho calculado) es otra discusión.
function bloquesDeEstilo(fuente, { conComentarios = false } = {}) {
  const css = [...fuente.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  // Un hex dentro de un comentario CSS es documentación, no una regla. Se
  // quitan antes de buscar literales de valor; la deriva de marca escrita en
  // comentarios la cubre el check `marca-retirada`, que sí los lee.
  return conComentarios ? css : css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function esPendiente(rel, categoria, valor) {
  return DECISIONES_PENDIENTES.some(
    (d) => rel.endsWith(d.archivo) && d.categorias.includes(categoria) && d.valores.includes(valor),
  );
}

function exceptuado(rel, categoria, valor) {
  return EXCEPCIONES.some(
    (e) =>
      rel.endsWith(e.archivo) &&
      e.categorias.includes(categoria) &&
      (!e.valores || e.valores.some((v) => valor.includes(v) || v.includes(valor))),
  );
}

const hallazgos = {};
for (const cat of Object.keys(CATEGORIAS)) hallazgos[cat] = [];

for (const f of archivos(SRC)) {
  const rel = relative(SRC, f).replace(/\\/g, '/');
  const css = bloquesDeEstilo(readFileSync(f, 'utf8'));
  if (!css.trim()) continue;

  // Las líneas que definen una custom property son declaraciones de token en
  // ámbito local, no consumo de literal suelto: se excluyen del barrido.
  const limpio = css
    .split('\n')
    .filter((l) => !/^\s*--[a-z0-9-]+\s*:/i.test(l))
    .join('\n');

  for (const [cat, def] of Object.entries(CATEGORIAS)) {
    for (const m of limpio.matchAll(def.patrón)) {
      const valor = (m[1] ?? m[0]).trim();
      if (def.filtro && !def.filtro(valor)) continue;
      if (/var\(/.test(valor) && cat !== 'sombra') continue;
      if (exceptuado(rel, cat, valor)) continue;
      if (esPendiente(rel, cat, valor)) continue;
      hallazgos[cat].push({ archivo: rel, valor });
    }
  }
}

// ── Línea base del trinquete ──────────────────────────────────────────────
let base = {};
try {
  base = JSON.parse(readFileSync(BASE, 'utf8'));
} catch {
  base = {};
}

const detalle = process.argv.includes('--detalle');
const fijar = process.argv.includes('--fijar-base');

let fallas = 0;
const resumen = [];

for (const [cat, def] of Object.entries(CATEGORIAS)) {
  const lista = hallazgos[cat];
  const n = lista.length;

  if (def.régimen === 'estricto') {
    const ok = n === 0;
    if (!ok) fallas += n;
    resumen.push({ cat, régimen: 'estricto', n, límite: 0, ok });
    console.log(`\n== ${cat.toUpperCase()} · estricto (se exige 0) ==`);
    if (ok) console.log('   sin hallazgos');
    else {
      console.log(`   ${def.consejo}`);
      for (const h of lista) console.log(`   ✗ ${h.archivo}  →  ${h.valor}`);
    }
  } else {
    const límite = base[cat] ?? n;
    const ok = n <= límite;
    if (!ok) fallas += n - límite;
    resumen.push({ cat, régimen: 'trinquete', n, límite, ok });
    console.log(`\n== ${cat.toUpperCase()} · trinquete (línea base ${límite}) ==`);
    console.log(`   ${n} literales. ${ok ? (n < límite ? `↓ ${límite - n} menos que la base — correr --fijar-base para consolidar` : 'igual a la base') : `✗ ${n - límite} MÁS que la base`}`);
    console.log(`   ${def.consejo}`);
    if (detalle) {
      const porArchivo = {};
      for (const h of lista) porArchivo[h.archivo] = (porArchivo[h.archivo] || 0) + 1;
      for (const [a, c] of Object.entries(porArchivo).sort((x, y) => y[1] - x[1])) {
        console.log(`     ${String(c).padStart(3)}  ${a}`);
      }
    }
  }
}

// ── Marca retirada: no debe reaparecer en una regla ───────────────────────
// Este check SI lee comentarios, pero distingue: en una regla es un fallo
// (la identidad vieja volvio al render); en un comentario es solo una
// mencion historica, que es legitima y se informa sin fallar.
const marcaEnRegla = [];
const marcaEnComentario = [];
const fuentesMarca = [...archivos(SRC), join(SRC, 'styles/main.css')];
for (const f of fuentesMarca) {
  const rel = relative(SRC, f).split(String.fromCharCode(92)).join('/');
  const bruto = readFileSync(f, 'utf8');
  const conComentarios = f.endsWith('.vue') ? bloquesDeEstilo(bruto, { conComentarios: true }) : bruto;
  const sinComentarios = conComentarios.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [valor, motivo] of Object.entries(MARCA_RETIRADA)) {
    const re = new RegExp(valor, 'i');
    if (re.test(sinComentarios)) marcaEnRegla.push({ rel, valor, motivo });
    else if (re.test(conComentarios)) marcaEnComentario.push({ rel, valor });
  }
}

console.log(`
== MARCA RETIRADA · estricto (no debe volver a una regla) ==`);
if (marcaEnRegla.length === 0) {
  console.log(`   sin hallazgos (${Object.keys(MARCA_RETIRADA).length} valores vigilados)`);
} else {
  for (const m of marcaEnRegla) console.log(`   ✗ ${m.rel}  →  ${m.valor}  (${m.motivo})`);
}
if (marcaEnComentario.length) {
  console.log(`   menciones en comentarios (historicas, no fallan): ${marcaEnComentario.map((m) => `${m.rel}:${m.valor}`).join(', ')}`);
}

console.log(`
== DECISIONES PENDIENTES (no fallan; exigen decision de producto) ==`);
for (const d of DECISIONES_PENDIENTES) {
  console.log(`   • ${d.archivo} → ${d.categorias.join('/')} ${d.valores.join(', ')}`);
  console.log(`     evidencia: ${d.evidencia}`);
  console.log(`     decision:  ${d.decision}`);
}
for (const d of PENDIENTES_DE_SISTEMA) {
  console.log(`   • ${d.caso}`);
  console.log(`     evidencia: ${d.evidencia}`);
  console.log(`     decision:  ${d.decision}`);
}

if (fijar) {
  const nueva = { ...base };
  for (const r of resumen) {
    if (r.régimen !== 'trinquete') continue;
    // La base solo baja. Subirla a mano sería quitarle el sentido al trinquete.
    nueva[r.cat] = Math.min(r.n, base[r.cat] ?? r.n);
  }
  writeFileSync(BASE, JSON.stringify(nueva, null, 2) + '\n');
  console.log(`\nLínea base actualizada en ${relative(RAIZ, BASE)}: ${JSON.stringify(nueva)}`);
  process.exit(0);
}

console.log(`\n${'─'.repeat(60)}`);
for (const r of resumen) {
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.cat.padEnd(12)} ${String(r.n).padStart(4)} literales  (${r.régimen}, límite ${r.límite})`);
}
console.log(`Excepciones declaradas: ${EXCEPCIONES.length}`);
console.log(`Marca retirada en reglas: ${marcaEnRegla.length}`);
console.log(`Decisiones pendientes: ${DECISIONES_PENDIENTES.length + PENDIENTES_DE_SISTEMA.length}`);
console.log(`Fallas: ${fallas + marcaEnRegla.length}`);
process.exit(fallas + marcaEnRegla.length > 0 ? 1 : 0);
