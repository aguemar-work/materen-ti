// Build de las edge functions (Plan Ciclo 21 §5, H2-8): arma, para cada
// functions/<nombre>.ts, un archivo AUTOCONTENIDO en functions/dist/<nombre>.ts.
//
// Por qué existe: el runtime de InsForge exige UN archivo por function (sin
// imports locales), así que los helpers comunes (CORS, respuestas, auth de staff,
// permisos, rate-limit, imágenes) estaban copiados a mano en las 4 functions y
// las copias ya habían divergido. Ahora viven una sola vez en functions/_shared/
// y este script los pega textualmente donde se piden. Un inliner de este tamaño
// es más auditable, para la pieza que cifra contraseñas, que un bundler: el dist
// es el fuente con los bloques compartidos expandidos, nada más.
//
// Uso:
//   node scripts/build-functions.mjs            escribe functions/dist/*.ts
//   node scripts/build-functions.mjs --check    falla (exit 1) si dist/ no coincide
//                                               con lo que generaría el build (CI)
//
// Marcador (una línea, columna 0, en una function o en otro módulo compartido):
//
//   // @inline ./_shared/cors.ts
//
// La ruta es relativa al archivo que contiene el marcador y debe caer dentro de
// functions/_shared/ y terminar en .ts. La línea se reemplaza por el contenido del
// módulo (con una línea-título), sin tocar su texto: conserva `export` y comentarios.
// Reglas:
//   - Cada módulo se incluye UNA vez por dist; los marcadores repetidos (porque dos
//     módulos dependen del mismo tercero) se descartan. Un ciclo es un error.
//   - Los `import { a, b } from 'x'` / `import type { c } from 'x'` (una sola línea)
//     de la function y de los módulos se FUSIONAN en uno por especificador, en el
//     lugar del primer import de la function. Cualquier otra forma de import o un
//     import relativo es un error: lo compartido se pide con el marcador.
//   - Todas las versiones de npm:@insforge/sdk de un dist deben ser la misma.
//   - Salida determinista: sin fechas ni rutas absolutas, EOL LF, imports ordenados.
//
// El dist se VERSIONA y es lo que se despliega (scripts/deploy.mjs lo exige al día)
// y lo que verifican `deno check` y las pruebas de los handlers.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DIR_FUNCTIONS = 'functions';
export const DIR_SHARED = 'functions/_shared';
export const DIR_DIST = 'functions/dist';

const RE_MARCADOR = /^\/\/ @inline (\S+)\s*$/;
const RE_MARCADOR_SUELTO = /^\s*\/\/\s*@inline\b/;
const RE_IMPORT_SIMPLE = /^import\s+(type\s+)?\{([^}]*)\}\s+from\s+(['"])([^'"]+)\3\s*;?\s*$/;
const RE_IMPORT_ALGUNO = /^import\b/;
const RE_REEXPORT_RELATIVO = /^export\b.*\bfrom\s+['"]\./;
const RE_SDK = /^npm:@insforge\/sdk(@.*)?$/;
const PLACEHOLDER_IMPORTS = Symbol('imports');

const normalizarEol = (s) => String(s).replace(/^﻿/, '').replace(/\r\n?/g, '\n');

// Divide en líneas sin el '' final que deja el \n de cierre.
function lineas(texto) {
  const t = normalizarEol(texto);
  const l = t.split('\n');
  if (l.length && l[l.length - 1] === '') l.pop();
  return l;
}

// ── Inliner (puro: `leer(rutaRelativaALaRaiz)` devuelve el texto) ───────────
// Devuelve { contenido, modulos } con `modulos` = rutas de _shared incluidas, en orden.
export function inlinar(entradaRel, leer) {
  const incluidos = new Set();
  const pila = [];
  const imports = new Map(); // especificador -> { valores:Set, tipos:Set }
  const modulos = [];

  function registrarImport(m, origen) {
    const [, esTipo, nombres, , spec] = m;
    if (spec.startsWith('.')) {
      throw new Error(`${origen}: import relativo "${spec}" no permitido; los helpers compartidos se piden con el marcador de inlinado.`);
    }
    const grupo = imports.get(spec) || { valores: new Set(), tipos: new Set() };
    for (const n of nombres.split(',').map((x) => x.trim()).filter(Boolean)) {
      (esTipo ? grupo.tipos : grupo.valores).add(n);
    }
    imports.set(spec, grupo);
  }

  // Expande un archivo; devuelve su arreglo de líneas (con PLACEHOLDER_IMPORTS donde
  // estaba el primer import, solo en la function de entrada).
  function expandir(rel, esEntrada) {
    let texto;
    try {
      texto = leer(rel);
    } catch (e) {
      throw new Error(`No se pudo leer ${rel}: ${e.message}`);
    }
    const salida = [];
    let colocoImports = false;
    let omitirBlanco = false;
    for (const [i, linea] of lineas(texto).entries()) {
      const donde = `${rel}:${i + 1}`;
      if (omitirBlanco) {
        omitirBlanco = false;
        if (linea.trim() === '') continue;
      }

      const mm = linea.match(RE_MARCADOR);
      if (mm) {
        const destino = posix.normalize(posix.join(posix.dirname(rel), mm[1]));
        if (!destino.startsWith(`${DIR_SHARED}/`) || !destino.endsWith('.ts')) {
          throw new Error(`${donde}: el marcador debe apuntar a un .ts dentro de ${DIR_SHARED}/ (recibido "${mm[1]}").`);
        }
        if (pila.includes(destino)) throw new Error(`${donde}: ciclo de inlinado (${[...pila, destino].join(' -> ')}).`);
        if (incluidos.has(destino)) {
          omitirBlanco = true;
          continue;
        }
        incluidos.add(destino);
        modulos.push(destino);
        pila.push(destino);
        const cuerpo = expandir(destino, false);
        pila.pop();
        while (cuerpo.length && cuerpo[cuerpo.length - 1] === '') cuerpo.pop();
        while (cuerpo.length && cuerpo[0] === '') cuerpo.shift();
        if (salida.length && salida[salida.length - 1] !== '') salida.push('');
        salida.push(`// ── ${destino.slice(DIR_FUNCTIONS.length + 1)} (inlinado por scripts/build-functions.mjs) ──`);
        salida.push(...cuerpo, '');
        omitirBlanco = true;
        continue;
      }
      if (RE_MARCADOR_SUELTO.test(linea)) {
        throw new Error(`${donde}: marcador de inlinado mal formado (use "// @inline ./ruta.ts" en columna 0).`);
      }

      if (RE_REEXPORT_RELATIVO.test(linea)) {
        throw new Error(`${donde}: re-export relativo no permitido; use el marcador de inlinado.`);
      }
      if (RE_IMPORT_ALGUNO.test(linea)) {
        const mi = linea.match(RE_IMPORT_SIMPLE);
        if (!mi) {
          throw new Error(`${donde}: import no soportado por el build (solo "import { a, b } from 'x';" o "import type { a } from 'x';" en UNA línea).`);
        }
        registrarImport(mi, donde);
        if (esEntrada && !colocoImports) {
          salida.push(PLACEHOLDER_IMPORTS);
          colocoImports = true;
        }
        continue;
      }
      salida.push(linea);
    }
    return salida;
  }

  const cuerpo = expandir(entradaRel, true);

  // Versión única del SDK en todo el dist.
  const versionesSdk = [...imports.keys()].filter((s) => RE_SDK.test(s));
  if (versionesSdk.length > 1) {
    throw new Error(`${entradaRel}: versiones distintas del SDK en el mismo dist (${versionesSdk.join(', ')}); deben coincidir.`);
  }

  const bloqueImports = [];
  for (const spec of [...imports.keys()].sort()) {
    const { valores, tipos } = imports.get(spec);
    const soloTipos = [...tipos].filter((n) => !valores.has(n)).sort();
    if (valores.size) bloqueImports.push(`import { ${[...valores].sort().join(', ')} } from '${spec}';`);
    if (soloTipos.length) bloqueImports.push(`import type { ${soloTipos.join(', ')} } from '${spec}';`);
  }

  let final = [];
  for (const l of cuerpo) {
    if (l === PLACEHOLDER_IMPORTS) final.push(...bloqueImports);
    else final.push(l);
  }
  if (bloqueImports.length && !cuerpo.includes(PLACEHOLDER_IMPORTS)) {
    // La function no importaba nada propio: los imports van tras el comentario inicial.
    let k = 0;
    while (k < final.length && (final[k].startsWith('//') || final[k].trim() === '')) k++;
    final = [...final.slice(0, k), ...bloqueImports, '', ...final.slice(k)];
  }

  const cabecera = [
    '// ============================================================',
    '// ARCHIVO GENERADO — NO EDITAR A MANO.',
    `// Fuente: ${entradaRel}`,
    ...modulos.map((m) => `//         + ${m}`),
    '// Regenerar: npm run build:functions (scripts/build-functions.mjs).',
    '// CI verifica que coincida: npm run check:functions.',
    '// ============================================================',
    '',
  ];
  return { contenido: `${[...cabecera, ...final].join('\n')}\n`, modulos };
}

// ── Descubrimiento y construcción ───────────────────────────────────────────
export function listarFunctions(raiz = RAIZ) {
  return readdirSync(resolve(raiz, DIR_FUNCTIONS), { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.ts') && !d.name.endsWith('.d.ts'))
    .map((d) => d.name.slice(0, -3))
    .sort();
}

export function leerDesdeDisco(raiz = RAIZ) {
  return (rel) => readFileSync(resolve(raiz, rel), 'utf8');
}

// Mapa nombre -> contenido esperado del dist.
export function construir(raiz = RAIZ, leer = leerDesdeDisco(raiz), nombres = listarFunctions(raiz)) {
  const out = new Map();
  for (const nombre of nombres) out.set(nombre, inlinar(`${DIR_FUNCTIONS}/${nombre}.ts`, leer).contenido);
  return out;
}

function primeraDiferencia(esperado, actual) {
  const a = esperado.split('\n');
  const b = actual.split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i + 1;
  return 0;
}

// Compara lo que hay en dist/ con lo que generaría el build. EOL normalizado
// (un checkout con autocrlf no cuenta como desactualizado).
// Devuelve { ok, detalle: [{ nombre, ok, motivo }] }; incluye archivos huérfanos de dist/.
export function verificarDist(raiz = RAIZ, { nombres } = {}) {
  const esperado = construir(raiz, undefined, nombres);
  const detalle = [];
  for (const [nombre, contenido] of esperado) {
    const ruta = resolve(raiz, DIR_DIST, `${nombre}.ts`);
    if (!existsSync(ruta)) {
      detalle.push({ nombre, ok: false, motivo: `falta ${DIR_DIST}/${nombre}.ts` });
      continue;
    }
    const actual = normalizarEol(readFileSync(ruta, 'utf8'));
    if (actual === contenido) detalle.push({ nombre, ok: true, motivo: null });
    else detalle.push({ nombre, ok: false, motivo: `${DIR_DIST}/${nombre}.ts no coincide con el build (primera diferencia en la línea ${primeraDiferencia(contenido, actual)})` });
  }
  if (!nombres && existsSync(resolve(raiz, DIR_DIST))) {
    for (const f of readdirSync(resolve(raiz, DIR_DIST)).sort()) {
      if (f.endsWith('.ts') && !esperado.has(f.slice(0, -3))) {
        detalle.push({ nombre: f.slice(0, -3), ok: false, motivo: `${DIR_DIST}/${f} no tiene function de origen (sobra)` });
      }
    }
  }
  return { ok: detalle.every((d) => d.ok), detalle };
}

// Escribe dist/ (y borra huérfanos). Devuelve los nombres reescritos.
export function escribirDist(raiz = RAIZ) {
  const esperado = construir(raiz);
  const dir = resolve(raiz, DIR_DIST);
  mkdirSync(dir, { recursive: true });
  const cambiados = [];
  for (const [nombre, contenido] of esperado) {
    const ruta = resolve(dir, `${nombre}.ts`);
    const previo = existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
    if (previo !== contenido) {
      writeFileSync(ruta, contenido);
      cambiados.push(nombre);
    }
  }
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.ts') && !esperado.has(f.slice(0, -3))) {
      unlinkSync(resolve(dir, f));
      cambiados.push(`${f.slice(0, -3)} (eliminado)`);
    }
  }
  return cambiados;
}

export function principal(argv, { raiz = RAIZ, log = console.log, warn = console.error } = {}) {
  const check = argv.includes('--check');
  const desconocidos = argv.filter((a) => a !== '--check');
  if (desconocidos.length) {
    warn(`Argumento desconocido: ${desconocidos.join(' ')}\nUso: node scripts/build-functions.mjs [--check]`);
    return 64;
  }
  try {
    if (check) {
      const { ok, detalle } = verificarDist(raiz);
      for (const d of detalle) log(`  ${d.ok ? '✓' : '✗'} ${d.nombre}${d.motivo ? ` — ${d.motivo}` : ''}`);
      if (!ok) {
        warn('✗ functions/dist está desactualizado respecto de functions/*.ts y functions/_shared/. Ejecute "npm run build:functions" y comitee el resultado.');
        return 1;
      }
      log('✓ functions/dist coincide con el build.');
      return 0;
    }
    const cambiados = escribirDist(raiz);
    log(cambiados.length ? `✓ functions/dist actualizado: ${cambiados.join(', ')}` : '✓ functions/dist ya estaba al día.');
    return 0;
  } catch (e) {
    warn(`✗ Build de functions fallido: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(principal(process.argv.slice(2)));
}
