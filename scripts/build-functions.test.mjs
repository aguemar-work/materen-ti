// node --test scripts/build-functions.test.mjs
// Inliner de las edge functions: lógica pura con un lector en memoria, un repo
// temporal para --check/escritura, y comprobaciones sobre el repo REAL (dist al
// día, autocontenido, sin helpers compartidos redefinidos en las fuentes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inlinar, construir, verificarDist, escribirDist, listarFunctions, principal, DIR_DIST } from './build-functions.mjs';
import { FUNCIONES_PERMITIDAS } from './deploy.mjs';

const RAIZ = resolve(import.meta.dirname, '..');
const SDK = "'npm:@insforge/sdk@1.5.2'";

// Lector en memoria: { 'functions/f.ts': '...', 'functions/_shared/x.ts': '...' }
const lector = (archivos) => (rel) => {
  if (!(rel in archivos)) throw new Error('no existe');
  return archivos[rel];
};
const lineasDe = (s) => s.split('\n');

// ── inlinado ──────────────────────────────────────────────────────────────
test('inlinar: reemplaza el marcador por el módulo, con título y sin tocar su texto', () => {
  const { contenido, modulos } = inlinar(
    'functions/f.ts',
    lector({
      'functions/f.ts': ['// cabecera de la function', '', '// @inline ./_shared/a.ts', '', 'export default () => saludo();', ''].join('\n'),
      'functions/_shared/a.ts': ['// Saludo compartido.', 'export function saludo() {', "  return 'hola'; // tal cual", '}', ''].join('\n'),
    }),
  );
  assert.deepEqual(modulos, ['functions/_shared/a.ts']);
  assert.match(contenido, /^\/\/ =+\n\/\/ ARCHIVO GENERADO — NO EDITAR A MANO\./);
  assert.match(contenido, /\n\/\/ Fuente: functions\/f\.ts\n\/\/ {9}\+ functions\/_shared\/a\.ts\n/);
  assert.ok(contenido.includes("// ── _shared/a.ts (inlinado por scripts/build-functions.mjs) ──\n// Saludo compartido.\nexport function saludo() {\n  return 'hola'; // tal cual\n}\n"));
  assert.ok(!contenido.includes('@inline'), 'el dist no conserva marcadores');
  assert.ok(contenido.includes('// cabecera de la function'));
  assert.ok(contenido.endsWith("export default () => saludo();\n"));
  assert.ok(!contenido.includes('\r'));
});

test('inlinar: un módulo compartido por varios caminos se incluye UNA vez (marcadores anidados)', () => {
  const { contenido, modulos } = inlinar(
    'functions/f.ts',
    lector({
      'functions/f.ts': ['// @inline ./_shared/http.ts', '// @inline ./_shared/errores.ts', 'export default 1;'].join('\n'),
      'functions/_shared/http.ts': 'export const HTTP = 1;\n',
      'functions/_shared/errores.ts': ['// @inline ./http.ts', 'export const ERR = HTTP + 1;'].join('\n'),
    }),
  );
  assert.deepEqual(modulos, ['functions/_shared/http.ts', 'functions/_shared/errores.ts']);
  assert.equal(contenido.split('export const HTTP = 1;').length, 2, 'http.ts una sola vez');
});

test('inlinar: fusiona imports (valores + tipos, ordenados, un SDK) en el lugar del primero de la function', () => {
  const { contenido } = inlinar(
    'functions/f.ts',
    lector({
      'functions/f.ts': [`import { createAdminClient } from ${SDK};`, '// @inline ./_shared/a.ts', '// @inline ./_shared/b.ts', 'export default 1;'].join('\n'),
      'functions/_shared/a.ts': [`import { createClient } from ${SDK};`, `import type { createAdminClient, SoloTipo } from ${SDK};`, 'export const A = 1;'].join('\n'),
      'functions/_shared/b.ts': [`import { createClient } from ${SDK};`, 'export const B = 2;'].join('\n'),
    }),
  );
  const imports = lineasDe(contenido).filter((l) => l.startsWith('import '));
  assert.deepEqual(imports, [`import { createAdminClient, createClient } from ${SDK};`, `import type { SoloTipo } from ${SDK};`]);
  assert.ok(contenido.indexOf('import {') < contenido.indexOf('export const A'), 'los imports van arriba, donde estaba el de la function');
});

test('inlinar: una function sin imports propios recibe los de los módulos tras el comentario inicial', () => {
  const { contenido } = inlinar(
    'functions/f.ts',
    lector({
      'functions/f.ts': ['// comentario', '', '// @inline ./_shared/a.ts', 'export default 1;'].join('\n'),
      'functions/_shared/a.ts': [`import { createClient } from ${SDK};`, 'export const A = createClient;'].join('\n'),
    }),
  );
  const l = lineasDe(contenido);
  const iComentario = l.indexOf('// comentario');
  const iImport = l.findIndex((x) => x.startsWith('import '));
  assert.ok(iImport > iComentario);
  assert.ok(iImport < l.findIndex((x) => x.includes('export const A')));
});

test('inlinar: la salida es determinista y no depende del EOL de las fuentes', () => {
  const a = { 'functions/f.ts': '// @inline ./_shared/a.ts\nexport default 1;\n', 'functions/_shared/a.ts': '// x\nexport const A = 1;\n' };
  const crlf = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.replace(/\n/g, '\r\n')]));
  const r1 = inlinar('functions/f.ts', lector(a)).contenido;
  assert.equal(inlinar('functions/f.ts', lector(a)).contenido, r1);
  assert.equal(inlinar('functions/f.ts', lector(crlf)).contenido, r1);
  assert.doesNotMatch(r1, /\d{4}-\d{2}-\d{2}T|\d{2}:\d{2}:\d{2}|[A-Z]:\\|\/Users\//, 'sin fechas ni rutas absolutas');
});

test('inlinar: rechaza lo que no es auditable', () => {
  const f = (cuerpo, extra = {}) => () => inlinar('functions/f.ts', lector({ 'functions/f.ts': cuerpo, ...extra }));
  assert.throws(f('// @inline ../otra.ts\n'), /dentro de functions\/_shared\//);
  assert.throws(f('// @inline ./_shared/../secreto.ts\n', { 'functions/secreto.ts': '' }), /dentro de functions\/_shared\//);
  assert.throws(f('// @inline ./_shared/a.js\n'), /dentro de functions\/_shared\//);
  assert.throws(f('//@inline ./_shared/a.ts\n'), /mal formado/);
  assert.throws(f('  // @inline ./_shared/a.ts\n'), /mal formado/);
  assert.throws(f('// @inline\n'), /mal formado/);
  assert.throws(f('// @inline ./_shared/falta.ts\n'), /No se pudo leer functions\/_shared\/falta\.ts/);
  assert.throws(f("import { x } from './local.ts';\n"), /relativo/);
  assert.throws(f("import x from 'npm:algo';\n"), /import no soportado/);
  assert.throws(f("import {\n  a,\n} from 'npm:algo';\n"), /import no soportado/);
  assert.throws(f("export * from './otro.ts';\n"), /re-export relativo/);
});

test('inlinar: detecta ciclos y versiones distintas del SDK', () => {
  assert.throws(
    () => inlinar('functions/f.ts', lector({ 'functions/f.ts': '// @inline ./_shared/a.ts\n', 'functions/_shared/a.ts': '// @inline ./b.ts\n', 'functions/_shared/b.ts': '// @inline ./a.ts\n' })),
    /ciclo/,
  );
  assert.throws(
    () =>
      inlinar(
        'functions/f.ts',
        lector({
          'functions/f.ts': ["import { createAdminClient } from 'npm:@insforge/sdk@1.5.2';", '// @inline ./_shared/a.ts'].join('\n'),
          'functions/_shared/a.ts': "import { createClient } from 'npm:@insforge/sdk@1.6.0';\n",
        }),
      ),
    /versiones distintas del SDK/,
  );
});

// ── repo temporal: construir, verificar y escribir ────────────────────────
function repoTemporal() {
  const raiz = mkdtempSync(join(tmpdir(), 'build-functions-'));
  mkdirSync(join(raiz, 'functions', '_shared'), { recursive: true });
  writeFileSync(join(raiz, 'functions', 'uno.ts'), '// @inline ./_shared/a.ts\nexport default () => A;\n');
  writeFileSync(join(raiz, 'functions', 'dos.ts'), 'export default () => 2;\n');
  writeFileSync(join(raiz, 'functions', 'tsconfig.json'), '{}');
  writeFileSync(join(raiz, 'functions', '_shared', 'a.ts'), 'export const A = 1;\n');
  return raiz;
}

test('listarFunctions: solo functions/*.ts de primer nivel', () => {
  const raiz = repoTemporal();
  try {
    assert.deepEqual(listarFunctions(raiz), ['dos', 'uno']);
    assert.deepEqual([...construir(raiz).keys()], ['dos', 'uno']);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('verificarDist / escribirDist: falta, desactualizado, huérfano y al día', () => {
  const raiz = repoTemporal();
  try {
    let v = verificarDist(raiz);
    assert.equal(v.ok, false);
    assert.match(v.detalle.find((d) => d.nombre === 'uno').motivo, /falta functions\/dist\/uno\.ts/);

    assert.deepEqual(escribirDist(raiz).sort(), ['dos', 'uno']);
    assert.equal(verificarDist(raiz).ok, true);
    assert.deepEqual(escribirDist(raiz), [], 'segunda corrida: nada que reescribir (idempotente)');

    // un checkout con autocrlf no cuenta como desactualizado
    const ruta = join(raiz, DIR_DIST, 'uno.ts');
    writeFileSync(ruta, readFileSync(ruta, 'utf8').replace(/\n/g, '\r\n'));
    assert.equal(verificarDist(raiz).ok, true);

    // editar el dist a mano o cambiar una fuente/_shared lo deja desactualizado
    writeFileSync(ruta, `${readFileSync(ruta, 'utf8')}// a mano\n`);
    v = verificarDist(raiz);
    assert.equal(v.ok, false);
    assert.match(v.detalle.find((d) => d.nombre === 'uno').motivo, /no coincide con el build \(primera diferencia en la línea \d+\)/);
    escribirDist(raiz);
    writeFileSync(join(raiz, 'functions', '_shared', 'a.ts'), 'export const A = 99;\n');
    assert.equal(verificarDist(raiz).ok, false, 'un cambio en _shared invalida el dist de quien lo inlina');
    assert.equal(verificarDist(raiz, { nombres: ['dos'] }).ok, true, 'pero no el de quien no lo usa');

    escribirDist(raiz);
    writeFileSync(join(raiz, DIR_DIST, 'vieja.ts'), '// huérfano\n');
    v = verificarDist(raiz);
    assert.equal(v.ok, false);
    assert.match(v.detalle.find((d) => d.nombre === 'vieja').motivo, /sobra/);
    escribirDist(raiz);
    assert.deepEqual(readdirSync(join(raiz, DIR_DIST)).sort(), ['dos.ts', 'uno.ts']);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('principal: --check devuelve 1 si el dist está viejo y 0 si coincide; build lo deja al día; argumento raro => 64', () => {
  const raiz = repoTemporal();
  const salida = { log: [], warn: [] };
  const opts = { raiz, log: (m) => salida.log.push(m), warn: (m) => salida.warn.push(m) };
  try {
    assert.equal(principal(['--check'], opts), 1);
    assert.match(salida.warn.join('\n'), /npm run build:functions/);
    assert.equal(principal([], opts), 0);
    assert.equal(principal(['--check'], opts), 0);
    assert.match(salida.log.join('\n'), /coincide con el build/);
    assert.equal(principal(['--otra'], opts), 64);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('principal: un error de build (marcador inválido) devuelve 1 con el motivo', () => {
  const raiz = repoTemporal();
  writeFileSync(join(raiz, 'functions', 'uno.ts'), '// @inline ./_shared/no-existe.ts\n');
  const warn = [];
  try {
    assert.equal(principal(['--check'], { raiz, log: () => {}, warn: (m) => warn.push(m) }), 1);
    assert.match(warn.join('\n'), /no-existe\.ts/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

// ── el repo real ──────────────────────────────────────────────────────────
test('repo real: functions/dist coincide con el build (lo mismo que verifica CI con --check)', () => {
  const v = verificarDist(RAIZ);
  assert.ok(v.ok, `dist desactualizado: ${v.detalle.filter((d) => !d.ok).map((d) => d.motivo).join('; ')}. Ejecute npm run build:functions.`);
});

test('repo real: las functions descubiertas son las que scripts/deploy.mjs permite desplegar', () => {
  assert.deepEqual(listarFunctions(RAIZ), [...FUNCIONES_PERMITIDAS].sort());
});

test('repo real: cada dist es autocontenido (un solo archivo, sin imports locales ni marcadores)', () => {
  for (const nombre of listarFunctions(RAIZ)) {
    const dist = readFileSync(resolve(RAIZ, DIR_DIST, `${nombre}.ts`), 'utf8');
    assert.doesNotMatch(dist, /^\s*\/\/\s*@inline\b/m, `${nombre}: quedó un marcador sin resolver`);
    assert.doesNotMatch(dist, /^\s*(import|export)\b[^\n]*\bfrom\s+['"]\./m, `${nombre}: import local en el dist`);
    const imports = dist.split('\n').filter((l) => /^import\b/.test(l));
    assert.ok(imports.length >= 1 && imports.every((l) => l.includes("'npm:@insforge/sdk@1.5.2'")), `${nombre}: imports inesperados: ${imports.join(' | ')}`);
    assert.match(dist, /^export default /m, `${nombre}: sin export default`);
    assert.match(dist, /\(inlinado por scripts\/build-functions\.mjs\)/, `${nombre}: no inlina nada de _shared`);
    assert.match(dist, /code: 'error_interno'/);
    assert.match(dist, new RegExp(`conEnvoltorio\\('${nombre}'`), `${nombre}: el envoltorio debe llevar su propio nombre`);
    assert.match(dist, new RegExp(`action === 'ping'[\\s\\S]{0,120}funcion: '${nombre}'`), `${nombre}: falta la acción ping`);
    assert.match(dist, new RegExp(`datosVersion\\(admin, '${nombre}'\\)`), `${nombre}: falta la acción version`);
  }
});

test('repo real: los helpers compartidos viven SOLO en _shared (las fuentes no los redefinen)', () => {
  const compartidos = [
    'corsPara', 'respuesta', 'uno', 'ipDesdeHeaders', 'usuarioDeToken', 'staffDeSesion', 'autenticarStaff',
    'puede', 'excedeLimite', 'sniffImagen', 'stripExif', 'unir', 'conEnvoltorio', 'datosVersion',
  ];
  for (const nombre of listarFunctions(RAIZ)) {
    const fuente = readFileSync(resolve(RAIZ, 'functions', `${nombre}.ts`), 'utf8');
    for (const h of compartidos) {
      assert.doesNotMatch(fuente, new RegExp(`^(export\\s+)?(async\\s+)?function\\s+${h}\\b`, 'm'), `functions/${nombre}.ts redefine ${h}: va en functions/_shared/`);
    }
    assert.doesNotMatch(fuente, /^(export\s+)?const ORIGENES_PERMITIDOS\b/m);
  }
});

test('repo real: stripExif y sniffImagen están UNA vez en cada dist que los usa, con el mismo texto', () => {
  const bloque = (nombre) => {
    const dist = readFileSync(resolve(RAIZ, DIR_DIST, `${nombre}.ts`), 'utf8');
    assert.equal(dist.split('export function stripExif').length, 2, `${nombre}: stripExif debe aparecer una vez`);
    assert.equal(dist.split('export function sniffImagen').length, 2, `${nombre}: sniffImagen debe aparecer una vez`);
    const i = dist.indexOf('// ── _shared/imagenes.ts');
    const j = dist.indexOf('// ── _shared/', i + 1);
    return dist.slice(i, j === -1 ? undefined : j);
  };
  assert.equal(bloque('tickets'), bloque('equipos-fotos'));
});
