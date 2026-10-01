// node --test scripts/lib/insforge-sql.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validarSqlUnaLinea,
  literalSql,
  parsearSalidaJson,
  filasDeRespuestaCli,
  clasificarImport,
  crearTransporteCli,
  crearTransporteHttp,
  crearTransporte,
} from './insforge-sql.mjs';

test('validarSqlUnaLinea rechaza lo que el CLI/cmd.exe rompen', () => {
  assert.equal(validarSqlUnaLinea("select 'a' as b"), "select 'a' as b");
  assert.throws(() => validarSqlUnaLinea('select 1\nselect 2'), /multilínea/);
  assert.throws(() => validarSqlUnaLinea('do $$ begin end $$'), /dollar/);
  assert.throws(() => validarSqlUnaLinea('select "a"'), /comillas dobles/);
  assert.throws(() => validarSqlUnaLinea("select 1 where x like 'a%'"), /%/);
  assert.throws(() => validarSqlUnaLinea('  '), /vacío/);
});

test('literalSql escapa y rechaza', () => {
  assert.equal(literalSql("o'b"), "'o''b'");
  assert.equal(literalSql(null), 'null');
  assert.throws(() => literalSql('a\nb'), /una línea/);
});

test('parsearSalidaJson tolera avisos antes del JSON', () => {
  assert.deepEqual(parsearSalidaJson('Update available\n{"rows":[{"a":1}]}'), { rows: [{ a: 1 }] });
  assert.equal(parsearSalidaJson('sin json'), null);
});

test('filasDeRespuestaCli: filas, error SQL y fallo de transporte', () => {
  assert.deepEqual(filasDeRespuestaCli({ status: 0, stdout: '{"rows":[{"n":"1"}],"rowCount":1}' }), [{ n: '1' }]);
  assert.deepEqual(filasDeRespuestaCli({ status: 0, stdout: '' }), []);
  assert.throws(
    () => filasDeRespuestaCli({ status: 1, stdout: '{"error":"relation x does not exist\\nmás","code":"X"}' }),
    (e) => e.codigo === 'sql' && /relation x/.test(e.message) && !e.message.includes('más'),
  );
  assert.throws(
    () => filasDeRespuestaCli({ status: 1, stdout: '{"error":"No project linked. Run `npx @insforge/cli link` first."}' }),
    (e) => e.codigo === 'transporte',
  );
  assert.throws(
    () => filasDeRespuestaCli({ status: 1, stdout: 'Waiting for authentication...', stderr: 'Authentication timed out' }),
    (e) => e.codigo === 'transporte',
  );
  assert.throws(() => filasDeRespuestaCli({ error: new Error('ETIMEDOUT') }), (e) => e.codigo === 'transporte');
});

test('clasificarImport: éxito, crash del cliente (pendiente) y error', () => {
  assert.equal(clasificarImport({ status: 0, stdout: 'ok' }).estado, 'exito');
  assert.equal(clasificarImport({ status: 3, stderr: 'Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c' }).estado, 'pendiente');
  assert.equal(clasificarImport({ status: 1, stderr: 'syntax error' }).estado, 'error');
  assert.equal(clasificarImport({ error: new Error('x') }).estado, 'error');
});

test('transporte CLI arma los argumentos esperados y valida el SQL', async () => {
  const llamadas = [];
  const t = crearTransporteCli({
    cwd: '/enlazada',
    ejecutar: (args, o) => {
      llamadas.push({ args, o });
      return { status: 0, stdout: '{"rows":[{"x":1}]}' };
    },
  });
  assert.deepEqual(await t.consultarSql('select 1 as x'), [{ x: 1 }]);
  assert.deepEqual(llamadas[0].args, ['db', 'query', '--json', '--', 'select 1 as x']);
  assert.equal(llamadas[0].o.cwd, '/enlazada');
  await assert.rejects(() => t.consultarSql('select 1\nselect 2'), /multilínea/);
});

test('transporte HTTP: URL, cabeceras, filas y clasificación de errores', async () => {
  let pedido;
  const ok = crearTransporteHttp({
    url: 'https://x.example/',
    apiKey: 'k',
    fetchImpl: async (url, init) => {
      pedido = { url, init };
      return { ok: true, status: 200, json: async () => ({ rows: [{ a: 1 }] }) };
    },
  });
  assert.deepEqual(await ok.consultarSql('select 1 as a'), [{ a: 1 }]);
  assert.equal(pedido.url, 'https://x.example/api/database/advance/rawsql');
  assert.equal(pedido.init.headers.Authorization, 'Bearer k');
  assert.deepEqual(JSON.parse(pedido.init.body), { query: 'select 1 as a' });

  const mal = (status) =>
    crearTransporteHttp({ url: 'https://x', apiKey: 'k', fetchImpl: async () => ({ ok: false, status, json: async () => ({ message: 'no' }) }) });
  await assert.rejects(() => mal(401).consultarSql('select 1'), (e) => e.codigo === 'transporte');
  await assert.rejects(() => mal(400).consultarSql('select 1'), (e) => e.codigo === 'sql');
  const caido = crearTransporteHttp({
    url: 'https://x',
    apiKey: 'k',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  await assert.rejects(() => caido.consultarSql('select 1'), (e) => e.codigo === 'transporte');
  await assert.rejects(() => ok.importarArchivo(), /no implementa/);
  assert.throws(() => crearTransporteHttp({}), /faltan/);
});

test('crearTransporte elige por INSFORGE_SQL_TRANSPORT', () => {
  assert.equal(crearTransporte({}).nombre, 'cli');
  assert.equal(crearTransporte({ INSFORGE_SQL_TRANSPORT: 'http', INSFORGE_PROJECT_URL: 'https://x', INSFORGE_API_KEY: 'k' }).nombre, 'http');
  assert.throws(() => crearTransporte({ INSFORGE_SQL_TRANSPORT: 'pg' }), /inválido/);
});
