// node --test scripts/deploy.test.mjs
// Lógica de pre-chequeos y orquestación con dependencias inyectadas: no toca
// red, git real ni base.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parsearArgumentos,
  validarRutaMigracion,
  evaluarArbol,
  pendientesPrevias,
  extraerSentenciasVerificacion,
  construirInsertMigracion,
  construirInsertDeploy,
  codigoCoincide,
  proyectoCoincide,
  prechequeos,
  resumirPrechequeos,
  ejecutarMigracion,
  ejecutarFunction,
  sha256Texto,
} from './deploy.mjs';

const RAIZ = resolve(import.meta.dirname, '..');

// ── argumentos ────────────────────────────────────────────────────────────
test('parsearArgumentos: migración con opciones', () => {
  const o = parsearArgumentos(['migracion', 'migrations/089_x.sql', '--entorno', 'v2', '--dry-run', '--forzar', '--proyecto', 'v2']);
  assert.deepEqual(o, { tipo: 'migracion', objetivo: 'migrations/089_x.sql', entorno: 'v2', dryRun: true, forzar: true, soloRegistro: false, proyecto: 'v2' });
});

test('parsearArgumentos: rechaza tipo, función, entorno y opciones inválidas', () => {
  assert.throws(() => parsearArgumentos([]), /tipo/);
  assert.throws(() => parsearArgumentos(['function']), /función/);
  assert.throws(() => parsearArgumentos(['function', 'otra']), /no permitida/);
  assert.throws(() => parsearArgumentos(['function', 'tickets', '--forzar']), /solo aplican a migraciones/);
  assert.throws(() => parsearArgumentos(['migracion', 'm.sql', '--entorno', 'staging']), /inválido/);
  assert.throws(() => parsearArgumentos(['migracion', 'm.sql', '--raro']), /desconocido/);
});

test('validarRutaMigracion: solo migrations/NNN_nombre.sql dentro del repo', () => {
  const ok = validarRutaMigracion('migrations\\089_tickets_resuelto_at.sql', RAIZ);
  assert.equal(ok.version, '089');
  assert.equal(ok.rel, 'migrations/089_tickets_resuelto_at.sql');
  assert.throws(() => validarRutaMigracion('migrations/rollback/075_x.sql', RAIZ), /no permitida/);
  assert.throws(() => validarRutaMigracion('../afuera/001_x.sql', RAIZ), /no permitida/);
  assert.throws(() => validarRutaMigracion('migrations/borrador.sql', RAIZ), /no permitida/);
});

// ── árbol ─────────────────────────────────────────────────────────────────
test('evaluarArbol: limpio, modificado, y sin seguimiento solo bloquea en migrations/ y functions/', () => {
  assert.equal(evaluarArbol('').limpio, true);
  assert.equal(evaluarArbol(' M frontend/src/a.js\n').limpio, false);
  assert.equal(evaluarArbol('A  functions/x.ts\n').limpio, false);
  assert.equal(evaluarArbol('?? docs/borrador.md\n?? scripts/otro.mjs\n').limpio, true);
  const sucio = evaluarArbol('?? migrations/099_nueva.sql\n');
  assert.equal(sucio.limpio, false);
  assert.deepEqual(sucio.sinSeguimientoRelevante, ['migrations/099_nueva.sql']);
});

test('pendientesPrevias', () => {
  assert.deepEqual(pendientesPrevias(['085'], ['085', '086', '088', '089'], '089'), ['086', '088']);
  assert.deepEqual(pendientesPrevias(['086'], ['086'], '086'), []);
});

// ── bloque de verificación ────────────────────────────────────────────────
test('extraerSentenciasVerificacion: SELECT sin comentar, multilínea y hasta -- FIN', () => {
  const sql = [
    'alter table t add column x int;',
    '-- Verificación',
    'select column_name',
    '  from information_schema.columns',
    "  where table_name = 't';",
    'select 1 as dos;',
    'alter table t drop column x;',
    '-- FIN DE MIGRACIÓN',
    'select 99;',
  ].join('\n');
  assert.deepEqual(extraerSentenciasVerificacion(sql), ["select column_name from information_schema.columns where table_name = 't'", 'select 1 as dos']);
});

test('extraerSentenciasVerificacion: sin bloque => []; ignora ALTER/prosa comentados', () => {
  assert.deepEqual(extraerSentenciasVerificacion('create table a(id int);\n-- FIN'), []);
  const sql = ['-- Verificación — correr después', '-- 1) esperado: algo', '--    select 1;', '--    alter table x validate constraint y;', '-- FIN DE MIGRACIÓN'].join('\n');
  assert.deepEqual(extraerSentenciasVerificacion(sql), ['select 1']);
});

test('extraerSentenciasVerificacion con la migración 086 real: 6 SELECT de una línea', () => {
  const sql = readFileSync(resolve(RAIZ, 'migrations/086_v2_endurecimiento_rpc_y_realtime.sql'), 'utf8');
  const s = extraerSentenciasVerificacion(sql);
  assert.equal(s.length, 6);
  assert.ok(s.every((x) => /^select /i.test(x) && !x.includes('\n') && !x.endsWith(';')));
});

// ── inserts ───────────────────────────────────────────────────────────────
const dato = { version: '100', nombre: '100_x.sql', checksum: 'ab'.repeat(32), aplicadaPor: "o'brien@x.pe", commitSha: 'c0ffee', entorno: 'produccion' };

test('construirInsertMigracion: solo columnas existentes; escapa comillas; forzar => upsert', () => {
  const basico = construirInsertMigracion({ ...dato, columnas: new Set(), forzar: false });
  assert.match(basico, /^insert into public\.schema_migrations \(version, nombre_archivo, checksum, aplicada_por\) values \('100', '100_x\.sql', '(ab){32}', 'o''brien@x\.pe'\)$/);
  assert.ok(!basico.includes('commit_sha'));
  const completo = construirInsertMigracion({ ...dato, columnas: new Set(['commit_sha', 'entorno']), forzar: true });
  assert.match(completo, /\(version, nombre_archivo, checksum, aplicada_por, commit_sha, entorno\)/);
  assert.match(completo, /'c0ffee', 'produccion'\) on conflict \(version\) do update set .*commit_sha = excluded\.commit_sha.*aplicada_en = now\(\)/);
  assert.ok(!completo.includes('\n'));
});

test('construirInsertDeploy según columnas', () => {
  const d = { funcion: 'tickets', sha256: 'f'.repeat(64), commitSha: 'c0ffee', desplegadoPor: 'a@b.pe', entorno: 'v2' };
  assert.doesNotMatch(construirInsertDeploy({ ...d, columnas: new Set(['commit_sha', 'desplegado_por']) }), /entorno/);
  assert.match(construirInsertDeploy({ ...d, columnas: new Set(['commit_sha', 'desplegado_por', 'entorno']) }), /\(funcion, sha256, commit_sha, desplegado_por, entorno\) values \('tickets'.*'v2'\)$/);
});

test('codigoCoincide: ignora la cabecera del CLI, EOL y espacios finales', () => {
  const local = 'const a = 1;\r\nexport {};\r\n';
  const salida = 'Function: tickets (tickets)\nStatus:   active\n---\nconst a = 1;\nexport {};\n\n';
  assert.equal(codigoCoincide(local, salida), true);
  assert.equal(codigoCoincide(local, salida.replace('1', '2')), false);
  assert.equal(codigoCoincide(local, 'basura sin cabecera'), null);
});

test('proyectoCoincide', () => {
  assert.equal(proyectoCoincide('Project:  sistema-ti-v2 (abc)', 'V2'), true);
  assert.equal(proyectoCoincide('Project:  sistema-ti (abc)', 'v2'), false);
  assert.equal(proyectoCoincide(null, 'v2'), false);
});

// ── pre-chequeos con git falso ────────────────────────────────────────────
function gitFalso({ status = '', tracked = true, enHead = true, refResuelve = true, ancestro = 0, rev = 'deadbeef' } = {}) {
  return (args) => {
    const [cmd] = args;
    if (cmd === 'status') return { status: 0, stdout: status };
    if (cmd === 'ls-files') return { status: tracked ? 0 : 1, stdout: '' };
    if (cmd === 'cat-file') return { status: enHead ? 0 : 128, stdout: '' };
    if (cmd === 'rev-parse' && args.includes('--verify')) return { status: refResuelve ? 0 : 1, stdout: '' };
    if (cmd === 'rev-parse') return { status: 0, stdout: `${rev}\n` };
    if (cmd === 'merge-base') return { status: ancestro, stdout: '', stderr: ancestro > 1 ? 'fatal' : '' };
    if (cmd === 'config') return { status: 0, stdout: 'yo@materen.pe\n' };
    throw new Error(`git inesperado: ${args.join(' ')}`);
  };
}
const ctxMig = (extra = {}) => ({
  tipo: 'migracion',
  objetivo: 'migrations/100_x.sql',
  entorno: 'produccion',
  forzar: false,
  migracion: { rel: 'migrations/100_x.sql', abs: '/x/100_x.sql', nombre: '100_x.sql', version: '100' },
  ...extra,
});
const depsPre = (git, registradas = ['085'], existe = true, versiones = ['085', '100']) => ({
  git,
  existe: () => existe,
  listarVersiones: () => versiones,
  consultarSql: async () => registradas.map((version) => ({ version })),
});
const porId = (r, id) => r.find((x) => x.id === id);

test('prechequeos: todo en orden', async () => {
  const r = await prechequeos(ctxMig(), depsPre(gitFalso()));
  assert.ok(r.every((x) => x.ok), JSON.stringify(r.filter((x) => !x.ok)));
  assert.equal(resumirPrechequeos(r, { dryRun: false }).abortar, false);
});

test('prechequeos: árbol sucio, no comiteado, HEAD fuera del remoto => abortan al desplegar pero no en dry-run', async () => {
  const r = await prechequeos(ctxMig(), depsPre(gitFalso({ status: ' M a.js\n', tracked: false, ancestro: 1 })));
  assert.equal(porId(r, 'arbol_limpio').ok, false);
  assert.equal(porId(r, 'archivo_comiteado').ok, false);
  assert.equal(porId(r, 'head_en_remoto').ok, false);
  assert.match(porId(r, 'head_en_remoto').mensaje, /origin\/main/);
  assert.equal(resumirPrechequeos(r, { dryRun: false }).abortar, true);
  assert.equal(resumirPrechequeos(r, { dryRun: true }).abortar, false);
  assert.equal(resumirPrechequeos(r, { dryRun: true }).alDesplegar.length, 3);
});

test('prechequeos: archivo staged pero no en HEAD cuenta como no comiteado', async () => {
  const r = await prechequeos(ctxMig(), depsPre(gitFalso({ tracked: true, enHead: false })));
  assert.equal(porId(r, 'archivo_comiteado').ok, false);
});

test('prechequeos: ref remoto irresoluble => falla explicando; --entorno v2 usa origin/release/v2', async () => {
  const r = await prechequeos(ctxMig({ entorno: 'v2' }), depsPre(gitFalso({ refResuelve: false })));
  assert.equal(porId(r, 'head_en_remoto').ok, false);
  assert.match(porId(r, 'head_en_remoto').mensaje, /origin\/release\/v2.*git fetch/);
});

test('prechequeos: merge-base con error distinto de 1 no se confunde con "no contenido"', async () => {
  const r = await prechequeos(ctxMig(), depsPre(gitFalso({ ancestro: 128 })));
  assert.match(porId(r, 'head_en_remoto').mensaje, /falló/);
});

test('prechequeos: versión ya registrada bloquea (incluso en dry-run) salvo --forzar', async () => {
  const dep = depsPre(gitFalso(), ['085', '100']);
  const r = await prechequeos(ctxMig(), dep);
  assert.equal(porId(r, 'version_libre').ok, false);
  assert.equal(resumirPrechequeos(r, { dryRun: true }).abortar, true);
  const f = await prechequeos(ctxMig({ forzar: true }), dep);
  assert.equal(porId(f, 'version_libre').ok, true);
});

test('prechequeos: archivo inexistente, versión duplicada y previas sin registrar', async () => {
  const sinArchivo = await prechequeos(ctxMig(), depsPre(gitFalso(), ['085'], false));
  assert.equal(porId(sinArchivo, 'archivo_existe').ok, false);
  const dup = await prechequeos(ctxMig(), depsPre(gitFalso(), ['085'], true, ['100', '100']));
  assert.equal(porId(dup, 'version_unica_en_carpeta').ok, false);
  const previas = await prechequeos(ctxMig(), depsPre(gitFalso(), ['085'], true, ['085', '086', '100']));
  assert.match(porId(previas, 'previas_sin_registrar').mensaje, /086/);
  assert.equal(porId(previas, 'previas_sin_registrar').severidad, 'aviso');
});

test('prechequeos: sin conexión con la base bloquea; error SQL de schema_migrations solo avisa', async () => {
  const dep = depsPre(gitFalso());
  dep.consultarSql = async () => {
    const e = new Error('sin sesión');
    e.codigo = 'transporte';
    throw e;
  };
  const r = await prechequeos(ctxMig(), dep);
  assert.equal(porId(r, 'schema_migrations').ok, false);
  dep.consultarSql = async () => {
    const e = new Error('relation does not exist');
    e.codigo = 'sql';
    throw e;
  };
  const r2 = await prechequeos(ctxMig(), dep);
  assert.equal(porId(r2, 'schema_migrations').severidad, 'aviso');
});

test('prechequeos de function: no consulta schema_migrations', async () => {
  const dep = depsPre(gitFalso());
  dep.consultarSql = async () => {
    throw new Error('no debe consultarse');
  };
  const r = await prechequeos({ tipo: 'function', objetivo: 'tickets', entorno: 'produccion', forzar: false }, dep);
  assert.ok(r.every((x) => x.ok));
  assert.ok(!porId(r, 'version_libre'));
});

// ── orquestación ──────────────────────────────────────────────────────────
const SQL_MIG = ['create table t(id int);', '-- Verificación', 'select count(*) as n from t;', '-- FIN'].join('\n');

function entornoFalso({ columnas = [], importar = { estado: 'exito', detalle: 'ok' }, falloInsert = false } = {}) {
  const llamadas = { sql: [], importados: [], comandos: [], log: [], warn: [] };
  const transporte = {
    nombre: 'falso',
    async consultarSql(sql) {
      llamadas.sql.push(sql);
      if (sql.startsWith('select column_name')) return columnas.map((column_name) => ({ column_name }));
      if (sql.startsWith('insert') && falloInsert) throw new Error('boom');
      if (sql.startsWith('select count')) return [{ n: '0' }];
      return [];
    },
    async importarArchivo(sql) {
      llamadas.importados.push(sql);
      return importar;
    },
    ejecutarComando(args) {
      llamadas.comandos.push(args);
      if (args[1] === 'code') return { status: 0, stdout: `Function: x\nStatus: active\n---\n${SQL_MIG}` };
      return { status: 0, stdout: 'deployed', stderr: '' };
    },
  };
  const deps = {
    transporte,
    leerArchivo: () => Buffer.from(SQL_MIG),
    git: gitFalso({ rev: 'abc1234def' }),
    aplicadaPor: () => 'yo@materen.pe',
    log: (m) => llamadas.log.push(m),
    warn: (m) => llamadas.warn.push(m),
  };
  return { deps, llamadas };
}
const insertsDe = (l) => l.sql.filter((s) => s.startsWith('insert'));

test('ejecutarMigracion: éxito => import, verificación y registro con checksum real y columnas nuevas', async () => {
  const { deps, llamadas } = entornoFalso({ columnas: ['version', 'commit_sha', 'entorno'] });
  const codigo = await ejecutarMigracion(ctxMig({ dryRun: false }), deps);
  assert.equal(codigo, 0);
  assert.deepEqual(llamadas.importados, [SQL_MIG]);
  assert.ok(llamadas.sql.includes('select count(*) as n from t'));
  const [ins] = insertsDe(llamadas);
  assert.ok(ins.includes(sha256Texto(Buffer.from(SQL_MIG))), 'checksum sha256 real del archivo');
  assert.match(ins, /'yo@materen\.pe', 'abc1234def', 'produccion'\)$/);
});

test('ejecutarMigracion: columnas ausentes => registra sin commit_sha/entorno', async () => {
  const { deps, llamadas } = entornoFalso({ columnas: ['version'] });
  assert.equal(await ejecutarMigracion(ctxMig({ dryRun: false }), deps), 0);
  assert.doesNotMatch(insertsDe(llamadas)[0], /commit_sha|entorno/);
});

test('ejecutarMigracion: dry-run no importa ni inserta', async () => {
  const { deps, llamadas } = entornoFalso();
  assert.equal(await ejecutarMigracion(ctxMig({ dryRun: true }), deps), 0);
  assert.equal(llamadas.importados.length, 0);
  assert.equal(insertsDe(llamadas).length, 0);
  assert.ok(llamadas.sql.every((s) => s.startsWith('select column_name')), 'solo consultas de catálogo');
});

test('ejecutarMigracion: error => no registra y devuelve 1', async () => {
  const { deps, llamadas } = entornoFalso({ importar: { estado: 'error', detalle: 'syntax error' } });
  assert.equal(await ejecutarMigracion(ctxMig({ dryRun: false }), deps), 1);
  assert.equal(insertsDe(llamadas).length, 0);
  assert.match(llamadas.warn.join('\n'), /syntax error/);
});

test('ejecutarMigracion: crash del cliente => PENDIENTE, no registra, corre la verificación y sugiere --solo-registro', async () => {
  const { deps, llamadas } = entornoFalso({ importar: { estado: 'pendiente', detalle: 'Assertion failed' } });
  assert.equal(await ejecutarMigracion(ctxMig({ dryRun: false }), deps), 1);
  assert.equal(insertsDe(llamadas).length, 0);
  assert.ok(llamadas.sql.includes('select count(*) as n from t'));
  assert.match(llamadas.warn.join('\n'), /--solo-registro/);
});

test('ejecutarMigracion: --solo-registro no importa pero verifica y registra', async () => {
  const { deps, llamadas } = entornoFalso();
  assert.equal(await ejecutarMigracion(ctxMig({ dryRun: false, soloRegistro: true }), deps), 0);
  assert.equal(llamadas.importados.length, 0);
  assert.equal(insertsDe(llamadas).length, 1);
});

test('ejecutarMigracion: falla del registro => 1 con el SQL para hacerlo a mano', async () => {
  const { deps, llamadas } = entornoFalso({ falloInsert: true });
  assert.equal(await ejecutarMigracion(ctxMig({ dryRun: false }), deps), 1);
  assert.match(llamadas.warn.join('\n'), /insert into public\.schema_migrations/);
});

const ctxFn = (extra = {}) => ({ tipo: 'function', objetivo: 'tickets', entorno: 'produccion', dryRun: false, ...extra });

test('ejecutarFunction: deploy, comparación de código y registro con sha256 del archivo', async () => {
  const { deps, llamadas } = entornoFalso({ columnas: ['funcion', 'sha256', 'commit_sha', 'desplegado_por', 'entorno'] });
  assert.equal(await ejecutarFunction(ctxFn(), deps), 0);
  assert.deepEqual(llamadas.comandos[0], ['functions', 'deploy', 'tickets', '--file', 'functions/tickets.ts']);
  assert.match(llamadas.log.join('\n'), /coincide con el archivo/);
  const [ins] = insertsDe(llamadas);
  assert.ok(ins.includes(sha256Texto(Buffer.from(SQL_MIG))));
  assert.match(ins, /'tickets'.*'abc1234def', 'yo@materen\.pe', 'produccion'\)$/);
});

test('ejecutarFunction: dry-run no despliega; deploy fallido no registra; código distinto => 1', async () => {
  let e = entornoFalso();
  assert.equal(await ejecutarFunction(ctxFn({ dryRun: true }), e.deps), 0);
  assert.equal(e.llamadas.comandos.length, 0);

  e = entornoFalso();
  e.deps.transporte.ejecutarComando = () => ({ status: 1, stdout: '', stderr: 'nope' });
  assert.equal(await ejecutarFunction(ctxFn(), e.deps), 1);
  assert.equal(insertsDe(e.llamadas).length, 0);

  e = entornoFalso();
  e.deps.leerArchivo = () => Buffer.from('otro contenido');
  assert.equal(await ejecutarFunction(ctxFn(), e.deps), 1);
  assert.match(e.llamadas.warn.join('\n'), /NO coincide/);
});
