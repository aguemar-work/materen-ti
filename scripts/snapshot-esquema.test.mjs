// node --test scripts/snapshot-esquema.test.mjs
// Prueba la lógica pura (normalización, comparación, serialización, CLI con
// transporte inyectado). No toca red, base ni el snapshot real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CATEGORIAS,
  NOMBRES_CATEGORIAS,
  normalizarSql,
  normalizarFila,
  normalizarCategoria,
  construirSnapshot,
  serializarSnapshot,
  compararSnapshots,
  formatearDiferencias,
  parsearArgumentos,
  principal,
} from './snapshot-esquema.mjs';
import { validarSqlUnaLinea } from './lib/insforge-sql.mjs';

const funcion = (extra = {}) => ({
  nombre: 'es_staff',
  argumentos: '',
  retorna: 'boolean',
  security_definer: true,
  config: 'search_path=public',
  md5_cuerpo: 'aaa',
  acl: 'authenticated:EXECUTE,project_admin:EXECUTE',
  volatilidad: 's',
  dueno: 'project_admin',
  ...extra,
});

const base = () =>
  construirSnapshot({
    funciones: [funcion(), funcion({ nombre: 'es_jefe', md5_cuerpo: 'bbb' })],
    policies: [{ esquema: 'public', tabla: 'tickets', nombre: 'p1', cmd: 'SELECT', permisiva: 'PERMISSIVE', roles: 'authenticated', qual: 'es_staff()', with_check: null }],
    tablas: [{ tabla: 'tickets', tipo: 'r', rls: true, rls_forzado: false, acl: 'DEFAULT' }],
  });

test('las consultas de catálogo cumplen las restricciones del CLI (una línea, sin $$, sin comillas dobles ni %)', () => {
  for (const [nombre, def] of Object.entries(CATEGORIAS)) {
    assert.doesNotThrow(() => validarSqlUnaLinea(def.sql), `categoría ${nombre}`);
  }
});

test('normalizarSql colapsa espacios y saltos de línea', () => {
  assert.equal(normalizarSql('  a  \n\t b   c '), 'a b c');
  assert.equal(normalizarSql(null), null);
});

test('normalizarFila: largo llega como string del CLI y se vuelve número; booleanos como texto se normalizan', () => {
  const f = normalizarFila('columnas', { tabla: 't', columna: 'c', largo: '100', nullable: 'NO' });
  assert.equal(f.largo, 100);
  assert.equal(f.generada, null);
  const t = normalizarFila('tablas', { tabla: 'x', tipo: 'r', rls: 't', rls_forzado: 'f', acl: 'DEFAULT' });
  assert.equal(t.rls, true);
  assert.equal(t.rls_forzado, false);
});

test('normalizarCategoria ordena por clave natural, sin depender del orden de entrada', () => {
  const filas = [funcion({ nombre: 'z' }), funcion({ nombre: 'a' }), funcion({ nombre: 'a', argumentos: 'x integer' })];
  const orden = normalizarCategoria('funciones', filas).map((f) => `${f.nombre}(${f.argumentos})`);
  assert.deepEqual(orden, ['a()', 'a(x integer)', 'z()']);
  const inversa = normalizarCategoria('funciones', [...filas].reverse()).map((f) => `${f.nombre}(${f.argumentos})`);
  assert.deepEqual(orden, inversa);
});

test('compararSnapshots: idénticos => 0 diferencias', () => {
  const dif = compararSnapshots(base(), base());
  assert.equal(dif.total, 0);
  assert.match(formatearDiferencias(dif), /Sin diferencias/);
});

test('compararSnapshots: ignora diferencias de espacios en definiciones', () => {
  const a = base();
  const b = base();
  b.categorias.policies[0].qual = '  es_staff()  ';
  assert.equal(compararSnapshots(a, b).total, 0);
});

test('compararSnapshots: detecta agregado, eliminado y cambiado por categoría', () => {
  const esperado = base();
  const vivo = base();
  vivo.categorias.funciones = vivo.categorias.funciones.filter((f) => f.nombre !== 'es_jefe'); // eliminado
  vivo.categorias.funciones.push(funcion({ nombre: 'nueva' })); // agregado
  vivo.categorias.funciones.find((f) => f.nombre === 'es_staff').md5_cuerpo = 'zzz'; // cambiado
  vivo.categorias.tablas[0].rls = false; // cambiado en otra categoría

  const dif = compararSnapshots(esperado, vivo);
  assert.equal(dif.total, 4);
  assert.deepEqual(dif.porCategoria.funciones.agregados, ['nueva.']);
  assert.deepEqual(dif.porCategoria.funciones.eliminados, ['es_jefe.']);
  assert.equal(dif.porCategoria.funciones.cambiados[0].campos.md5_cuerpo.vivo, 'zzz');
  assert.equal(dif.porCategoria.tablas.cambiados[0].campos.rls.esperado, true);
  assert.equal(dif.porCategoria.policies.cambiados.length, 0);

  const texto = formatearDiferencias(dif);
  assert.match(texto, /\[funciones\] 3/);
  assert.match(texto, /\[tablas\] 1/);
  assert.match(texto, /\+ en la base y NO en el snapshot: nueva\./);
  assert.match(texto, /- en el snapshot y NO en la base: es_jefe\./);
  assert.match(texto, /md5_cuerpo: snapshot=aaa {2}vivo=zzz/);
});

test('serializarSnapshot es estable (ida y vuelta) y trae todas las categorías', () => {
  const s = base();
  const texto = serializarSnapshot(s);
  const parseado = JSON.parse(texto);
  assert.deepEqual(Object.keys(parseado.categorias), NOMBRES_CATEGORIAS);
  assert.equal(serializarSnapshot(parseado), texto);
  assert.equal(compararSnapshots(parseado, s).total, 0);
  assert.ok(texto.endsWith('\n'));
  assert.ok(!texto.includes('\r'));
});

test('parsearArgumentos', () => {
  assert.equal(parsearArgumentos(['--verificar']).modo, 'verificar');
  assert.equal(parsearArgumentos(['--escribir', '--desde-archivo', 'x.json']).desdeArchivo, 'x.json');
  assert.throws(() => parsearArgumentos([]), /--escribir o --verificar|Indique/);
  assert.throws(() => parsearArgumentos(['--escribir', '--verificar']), /ambos/);
  assert.throws(() => parsearArgumentos(['--foo']), /desconocido/);
});

function salidaFalsa() {
  const out = { log: [], error: [] };
  return { out, salida: { log: (m) => out.log.push(m), error: (m) => out.error.push(m) } };
}

test('principal --verificar --desde-archivo: 0 si coincide, 1 si hay drift (sin base)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'snap-test-'));
  const esperado = join(dir, 'esperado.json');
  const vivoOk = join(dir, 'vivo-ok.json');
  const vivoMal = join(dir, 'vivo-mal.json');
  writeFileSync(esperado, serializarSnapshot(base()));
  writeFileSync(vivoOk, serializarSnapshot(base()));
  const roto = base();
  roto.categorias.funciones[0].acl = 'PUBLIC:EXECUTE';
  writeFileSync(vivoMal, serializarSnapshot(roto));

  let r = salidaFalsa();
  assert.equal(await principal(['--verificar', '--archivo', esperado, '--desde-archivo', vivoOk], { salida: r.salida }), 0);
  r = salidaFalsa();
  assert.equal(await principal(['--verificar', '--archivo', esperado, '--desde-archivo', vivoMal], { salida: r.salida }), 1);
  assert.match(r.out.error.join('\n'), /acl: snapshot=.*vivo=PUBLIC:EXECUTE/);
});

test('principal --verificar con transporte inyectado y --escribir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'snap-test-'));
  const archivo = join(dir, 'snap.json');
  const filas = {
    tablas: [{ tabla: 'a', tipo: 'r', rls: true, rls_forzado: false, acl: 'DEFAULT' }],
  };
  // El transporte responde según la categoría cuya SQL recibe.
  const transporte = {
    async consultarSql(sql) {
      for (const [nombre, def] of Object.entries(CATEGORIAS)) if (def.sql === sql) return filas[nombre] || [];
      throw new Error('SQL inesperado');
    },
  };
  let r = salidaFalsa();
  assert.equal(await principal(['--escribir', '--archivo', archivo], { transporte, salida: r.salida }), 0);
  assert.equal(JSON.parse(readFileSync(archivo, 'utf8')).categorias.tablas.length, 1);

  r = salidaFalsa();
  assert.equal(await principal(['--verificar', '--archivo', archivo], { transporte, salida: r.salida }), 0);

  filas.tablas.push({ tabla: 'b', tipo: 'r', rls: false, rls_forzado: false, acl: 'DEFAULT' });
  r = salidaFalsa();
  assert.equal(await principal(['--verificar', '--archivo', archivo], { transporte, salida: r.salida }), 1);
  assert.match(r.out.error.join('\n'), /\[tablas\] 1/);
});

test('principal devuelve 2 si el transporte falla y 64 con argumentos inválidos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'snap-test-'));
  const archivo = join(dir, 'snap.json');
  writeFileSync(archivo, serializarSnapshot(base()));
  const transporte = {
    async consultarSql() {
      const e = new Error('sin sesión');
      e.codigo = 'transporte';
      throw e;
    },
  };
  let r = salidaFalsa();
  assert.equal(await principal(['--verificar', '--archivo', archivo], { transporte, salida: r.salida }), 2);
  assert.match(r.out.error.join('\n'), /sin sesión/);
  r = salidaFalsa();
  assert.equal(await principal(['--nada'], { salida: r.salida }), 64);
});

test('docs/esquema/snapshot.json versionado: formato válido, canónico y sin secretos evidentes', () => {
  const ruta = new URL('../docs/esquema/snapshot.json', import.meta.url);
  const texto = readFileSync(ruta, 'utf8');
  const json = JSON.parse(texto);
  assert.equal(json.version_formato, 1);
  assert.deepEqual(Object.keys(json.categorias), NOMBRES_CATEGORIAS);
  for (const nombre of NOMBRES_CATEGORIAS) {
    for (const fila of json.categorias[nombre]) {
      assert.deepEqual(Object.keys(fila), CATEGORIAS[nombre].campos, `campos de ${nombre}`);
    }
  }
  // Forma canónica: re-serializar el archivo normalizado reproduce el texto
  // byte a byte (si no, un --escribir dejaría un diff espurio).
  assert.equal(serializarSnapshot(construirSnapshot(json.categorias)), texto.replace(/\r\n/g, '\n'));
  assert.doesNotMatch(texto, /eyJ[A-Za-z0-9_-]{20,}|ik_[A-Za-z0-9]{16,}/);
});
