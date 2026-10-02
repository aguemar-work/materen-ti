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
  evaluarCambio,
  FORMATO_CAMBIO,
  resumirPrechequeos,
  ejecutarMigracion,
  ejecutarFunction,
  sha256Texto,
  rutaDistFunction,
} from './deploy.mjs';

const RAIZ = resolve(import.meta.dirname, '..');

// ── argumentos ────────────────────────────────────────────────────────────
test('parsearArgumentos: migración con opciones', () => {
  const o = parsearArgumentos(['migracion', 'migrations/089_x.sql', '--entorno', 'v2', '--dry-run', '--forzar', '--proyecto', 'v2']);
  assert.deepEqual(o, { tipo: 'migracion', objetivo: 'migrations/089_x.sql', entorno: 'v2', dryRun: true, forzar: true, soloRegistro: false, proyecto: 'v2', cambio: null });
});

test('parsearArgumentos: --cambio se valida (CHG- y 4 o más dígitos) y se normaliza a mayúsculas', () => {
  assert.equal(parsearArgumentos(['migracion', 'm.sql']).cambio, null);
  assert.equal(parsearArgumentos(['migracion', 'm.sql', '--cambio', 'CHG-0001']).cambio, 'CHG-0001');
  assert.equal(parsearArgumentos(['function', 'tickets', '--cambio', 'chg-00042', '--entorno', 'v2']).cambio, 'CHG-00042');
  for (const malo of ['CHG-1', 'CHG-12a4', 'SOL-0001', '0001', '', 'CHG-']) {
    assert.throws(() => parsearArgumentos(['migracion', 'm.sql', '--cambio', malo]), /--cambio requiere/, malo);
  }
  assert.throws(() => parsearArgumentos(['migracion', 'm.sql', '--cambio']), /--cambio requiere/);
  assert.ok(FORMATO_CAMBIO.test('CHG-0001') && !FORMATO_CAMBIO.test('CHG-001'));
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

test('construirInsertMigracion / construirInsertDeploy: cambio_id solo si hay cambio y la columna existe', () => {
  const con = construirInsertMigracion({ ...dato, columnas: new Set(['commit_sha', 'entorno', 'cambio_id']), forzar: false, cambio: 'CHG-0007' });
  assert.match(con, /\(version, nombre_archivo, checksum, aplicada_por, commit_sha, entorno, cambio_id\) values \(.*'produccion', 'CHG-0007'\)$/);
  const forzado = construirInsertMigracion({ ...dato, columnas: new Set(['cambio_id']), forzar: true, cambio: 'CHG-0007' });
  assert.match(forzado, /on conflict \(version\) do update set .*cambio_id = excluded\.cambio_id/);
  // sin la columna (107 sin aplicar) o sin --cambio no se agrega nada
  assert.doesNotMatch(construirInsertMigracion({ ...dato, columnas: new Set(['commit_sha']), forzar: false, cambio: 'CHG-0007' }), /cambio_id|CHG/);
  assert.doesNotMatch(construirInsertMigracion({ ...dato, columnas: new Set(['cambio_id']), forzar: false }), /cambio_id|CHG/);
  const d = { funcion: 'tickets', sha256: 'f'.repeat(64), commitSha: 'c0ffee', desplegadoPor: 'a@b.pe', entorno: 'v2' };
  assert.match(construirInsertDeploy({ ...d, columnas: new Set(['desplegado_por', 'cambio_id']), cambio: 'CHG-0009' }), /\(funcion, sha256, desplegado_por, cambio_id\) values \('tickets', .*'a@b\.pe', 'CHG-0009'\)$/);
  assert.doesNotMatch(construirInsertDeploy({ ...d, columnas: new Set(['desplegado_por']), cambio: 'CHG-0009' }), /cambio_id|CHG/);
  assert.doesNotMatch(construirInsertDeploy({ ...d, columnas: new Set(['cambio_id']) }), /cambio_id|CHG/);
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
  distActualizado: () => ({ ok: true, mensaje: '' }),
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

// ── cambio que autoriza el despliegue ────────────────────────────────────
test('evaluarCambio: avisa si no existe o no autoriza ejecutar; la emergencia puede ir sin aprobación', () => {
  assert.equal(evaluarCambio('CHG-0001', null).advertir, true);
  assert.match(evaluarCambio('CHG-0001', null).mensaje, /no existe en la base.*se registra igual/);
  assert.equal(evaluarCambio('CHG-0001', { tipo: 'normal', estado: 'aprobado' }).advertir, false);
  assert.equal(evaluarCambio('CHG-0001', { tipo: 'normal', estado: 'en_ejecucion' }).advertir, false);
  assert.equal(evaluarCambio('CHG-0001', { tipo: 'estandar', estado: 'aprobado' }).advertir, false);
  for (const estado of ['borrador', 'solicitado', 'implementado', 'cerrado', 'rechazado', 'cancelado', 'revertido']) {
    const r = evaluarCambio('CHG-0001', { tipo: 'normal', estado });
    assert.equal(r.advertir, true, estado);
    assert.match(r.mensaje, new RegExp(estado));
  }
  assert.equal(evaluarCambio('CHG-0002', { tipo: 'emergencia', estado: 'solicitado' }).advertir, false);
  assert.equal(evaluarCambio('CHG-0002', { tipo: 'emergencia', estado: 'borrador' }).advertir, false);
  assert.equal(evaluarCambio('CHG-0002', { tipo: 'emergencia', estado: 'cerrado' }).advertir, true);
});

test('prechequeos con --cambio: nunca bloquea (cambio inexistente, estado que no autoriza, tabla ausente o sin conexión)', async () => {
  const dep = (respuesta) => {
    const d = depsPre(gitFalso());
    const migraciones = d.consultarSql;
    d.consultarSql = async (sql) => {
      if (!sql.includes('public.cambios')) return migraciones(sql);
      return typeof respuesta === 'function' ? respuesta(sql) : respuesta;
    };
    return d;
  };
  const ctx = (extra = {}) => ctxMig({ cambio: 'CHG-0001', ...extra });

  const ok = await prechequeos(ctx(), dep([{ tipo: 'normal', estado: 'aprobado' }]));
  assert.equal(porId(ok, 'cambio_registrado').ok, true);
  assert.equal(porId(ok, 'cambio_registrado').severidad, 'bloqueante', 'sin advertencia (el pre-chequeo no falla nunca)');
  assert.match(porId(ok, 'cambio_registrado').mensaje, /CHG-0001 \(normal, aprobado\)/);
  assert.equal(resumirPrechequeos(ok, { dryRun: false }).abortar, false);

  const consultas = [];
  await prechequeos(ctx(), dep((sql) => (consultas.push(sql), [])));
  assert.deepEqual(consultas, ["select tipo, estado from public.cambios where codigo = 'CHG-0001'"]);

  const noExiste = await prechequeos(ctx(), dep([]));
  assert.equal(porId(noExiste, 'cambio_registrado').severidad, 'aviso');
  assert.match(porId(noExiste, 'cambio_registrado').mensaje, /no existe en la base/);

  const cerrado = await prechequeos(ctx(), dep([{ tipo: 'normal', estado: 'cerrado' }]));
  assert.equal(porId(cerrado, 'cambio_registrado').severidad, 'aviso');

  const sinTabla = await prechequeos(ctx(), dep(() => {
    const e = new Error('relation "public.cambios" does not exist');
    e.codigo = 'sql';
    throw e;
  }));
  assert.equal(porId(sinTabla, 'cambio_registrado').severidad, 'aviso');
  assert.match(porId(sinTabla, 'cambio_registrado').mensaje, /migración 107/);

  const sinRed = await prechequeos(ctx(), dep(() => {
    const e = new Error('sin sesión');
    e.codigo = 'transporte';
    throw e;
  }));
  assert.match(porId(sinRed, 'cambio_registrado').mensaje, /sin conexión/);
  for (const r of [noExiste, cerrado, sinTabla, sinRed]) {
    assert.equal(porId(r, 'cambio_registrado').ok, true);
    assert.equal(resumirPrechequeos(r, { dryRun: false }).abortar, false);
  }

  // sin --cambio no se consulta public.cambios
  const sin = await prechequeos(ctxMig(), dep(() => { throw new Error('no debe consultarse'); }));
  assert.ok(!porId(sin, 'cambio_registrado'));
});

test('prechequeos de function con --cambio: también lo comprueba', async () => {
  const d = depsPre(gitFalso());
  d.consultarSql = async (sql) => {
    assert.match(sql, /public\.cambios/);
    return [{ tipo: 'normal', estado: 'solicitado' }];
  };
  const r = await prechequeos({ tipo: 'function', objetivo: 'tickets', entorno: 'produccion', forzar: false, cambio: 'CHG-0003' }, d);
  assert.equal(porId(r, 'cambio_registrado').severidad, 'aviso');
  assert.match(porId(r, 'cambio_registrado').mensaje, /solicitado/);
});

test('rutaDistFunction: se despliega el dist autocontenido, no la fuente', () => {
  assert.equal(rutaDistFunction('tickets'), 'functions/dist/tickets.ts');
});

test('prechequeos de function: el archivo a comitear y comprobar es el dist', async () => {
  const consultados = [];
  const dep = depsPre(gitFalso());
  dep.existe = (rel) => (consultados.push(rel), true);
  const git = dep.git;
  const rutasGit = [];
  dep.git = (args) => (rutasGit.push(args.join(' ')), git(args));
  await prechequeos({ tipo: 'function', objetivo: 'tickets', entorno: 'produccion', forzar: false }, dep);
  assert.deepEqual([...new Set(consultados)], ['functions/dist/tickets.ts']);
  assert.ok(rutasGit.some((a) => a.includes('ls-files') && a.includes('functions/dist/tickets.ts')));
  assert.ok(rutasGit.some((a) => a.includes('cat-file') && a.includes('HEAD:functions/dist/tickets.ts')));
});

test('prechequeos de function: dist desactualizado BLOQUEA (también en dry-run); al día pasa', async () => {
  const dep = depsPre(gitFalso());
  dep.distActualizado = (nombre) => ({ ok: false, mensaje: `functions/dist/${nombre}.ts no coincide con el build (primera diferencia en la línea 12).` });
  const r = await prechequeos({ tipo: 'function', objetivo: 'credenciales', entorno: 'produccion', forzar: false }, dep);
  const d = porId(r, 'dist_actualizado');
  assert.equal(d.ok, false);
  assert.equal(d.severidad, 'bloqueante');
  assert.match(d.mensaje, /credenciales.ts no coincide.*npm run build:functions/);
  assert.equal(resumirPrechequeos(r, { dryRun: true }).abortar, true);
  assert.equal(resumirPrechequeos(r, { dryRun: false }).abortar, true);

  const ok = await prechequeos({ tipo: 'function', objetivo: 'credenciales', entorno: 'produccion', forzar: false }, depsPre(gitFalso()));
  assert.equal(porId(ok, 'dist_actualizado').ok, true);
  assert.equal(resumirPrechequeos(ok, { dryRun: false }).abortar, false);
});

test('prechequeos de migración: no comprueba el dist', async () => {
  const r = await prechequeos(ctxMig(), depsPre(gitFalso()));
  assert.ok(!porId(r, 'dist_actualizado'));
});

test('prechequeos de function: exige la dependencia distActualizado', async () => {
  const dep = depsPre(gitFalso());
  delete dep.distActualizado;
  await assert.rejects(prechequeos({ tipo: 'function', objetivo: 'tickets', entorno: 'produccion', forzar: false }, dep), /distActualizado/);
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

test('ejecutarMigracion con --cambio: registra cambio_id si la columna existe; si no, lo omite y avisa', async () => {
  const con = entornoFalso({ columnas: ['version', 'commit_sha', 'entorno', 'cambio_id'] });
  assert.equal(await ejecutarMigracion(ctxMig({ dryRun: false, cambio: 'CHG-0042' }), con.deps), 0);
  assert.match(insertsDe(con.llamadas)[0], /, 'produccion', 'CHG-0042'\)$/);
  assert.match(con.llamadas.log.join('\n'), /cambio que autoriza: CHG-0042/);

  const sin = entornoFalso({ columnas: ['version', 'commit_sha', 'entorno'] });
  assert.equal(await ejecutarMigracion(ctxMig({ dryRun: false, cambio: 'CHG-0042' }), sin.deps), 0);
  assert.doesNotMatch(insertsDe(sin.llamadas)[0], /cambio_id|CHG/);
  assert.match(sin.llamadas.log.join('\n'), /columna cambio_id aún no existe en schema_migrations.*migración 107/);

  const dry = entornoFalso({ columnas: ['cambio_id'] });
  assert.equal(await ejecutarMigracion(ctxMig({ dryRun: true, cambio: 'CHG-0042' }), dry.deps), 0);
  assert.equal(insertsDe(dry.llamadas).length, 0);
  assert.match(dry.llamadas.log.join('\n'), /Registrar en schema_migrations:.*cambio_id.*CHG-0042/);

  const sinFlag = entornoFalso({ columnas: ['cambio_id'] });
  assert.equal(await ejecutarMigracion(ctxMig({ dryRun: false }), sinFlag.deps), 0);
  assert.doesNotMatch(insertsDe(sinFlag.llamadas)[0], /cambio_id/);
});

const ctxFn = (extra = {}) => ({ tipo: 'function', objetivo: 'tickets', entorno: 'produccion', dryRun: false, ...extra });

test('ejecutarFunction: deploy, comparación de código y registro con sha256 del archivo', async () => {
  const { deps, llamadas } = entornoFalso({ columnas: ['funcion', 'sha256', 'commit_sha', 'desplegado_por', 'entorno'] });
  const leidos = [];
  const leer = deps.leerArchivo;
  deps.leerArchivo = (abs) => (leidos.push(abs.replace(/\\/g, '/')), leer(abs));
  assert.equal(await ejecutarFunction(ctxFn(), deps), 0);
  assert.equal(leidos.length, 1);
  assert.ok(leidos[0].endsWith('/functions/dist/tickets.ts'), 'el sha256 se calcula sobre el archivo de dist');
  assert.deepEqual(llamadas.comandos[0], ['functions', 'deploy', 'tickets', '--file', 'functions/dist/tickets.ts']);
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

test('ejecutarFunction con --cambio: registra cambio_id en function_deploys solo si la columna existe', async () => {
  const con = entornoFalso({ columnas: ['funcion', 'sha256', 'commit_sha', 'desplegado_por', 'entorno', 'cambio_id'] });
  assert.equal(await ejecutarFunction(ctxFn({ cambio: 'CHG-0050' }), con.deps), 0);
  assert.match(insertsDe(con.llamadas)[0], /'produccion', 'CHG-0050'\)$/);
  assert.match(con.llamadas.log.join('\n'), /cambio que autoriza: CHG-0050/);

  const sin = entornoFalso({ columnas: ['funcion', 'sha256', 'commit_sha', 'desplegado_por', 'entorno'] });
  assert.equal(await ejecutarFunction(ctxFn({ cambio: 'CHG-0050' }), sin.deps), 0);
  assert.doesNotMatch(insertsDe(sin.llamadas)[0], /cambio_id|CHG/);
  assert.match(sin.llamadas.log.join('\n'), /columna cambio_id aún no existe en function_deploys/);
});
