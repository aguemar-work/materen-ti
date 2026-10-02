// Verificacion integrada de las migraciones 099..110 en PGlite (todo local, en memoria).
// Uso:  node verificar-migraciones.mjs [--repo <ruta>] [--saltar-fidelidad] [--verbose]
// Requiere: @electric-sql/pglite (devDependency de la raiz). Todo en memoria: no toca ninguna base.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const verbose = args.includes('--verbose');
const REPO = opt('--repo', join(aqui, '..', '..'));
const MIG = join(REPO, 'migrations');
// Todas las migraciones desde la 099 que existan en migrations/ (una migracion nueva entra sola).
const NUEVAS = readdirSync(MIG).filter((f) => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= 99).map((f) => f.slice(0, 3)).sort();
// La 109 (portal del empleado) EXTIENDE la purga de la 112 (config_retencion): en produccion se aplica despues de la
// 112 aunque su numero sea menor, asi que aqui va la ultima (y su rollback, la primera).
if (NUEVAS.includes('109')) NUEVAS.splice(NUEVAS.indexOf('109'), 1), NUEVAS.push('109');
// Rollback: de la mas nueva a la mas vieja, con la 104 (independiente) justo antes de la 099.
const ROLLBACK_ORDEN = [...NUEVAS].reverse().filter((n) => n !== '104' && n !== '099').concat(NUEVAS.includes('104') ? ['104'] : [], ['099']).filter((n, i, a) => NUEVAS.includes(n) && a.indexOf(n) === i);
const lee = (p) => readFileSync(p, 'utf8');
const archivoMig = (n) => readdirSync(MIG).find((f) => f.startsWith(n + '_') && f.endsWith('.sql'));

const resultados = []; // {paso, ok, detalle}
let fallos = 0;
function reg(paso, ok, detalle = '') {
  resultados.push({ paso, ok, detalle });
  if (!ok) fallos++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${paso}${detalle ? '  -> ' + detalle : ''}`);
}

let db = new PGlite({ extensions: { pgcrypto } });
const q = async (s) => { try { return (await db.query(s)).rows; } catch (e) { throw new Error('q(): ' + e.message + ' :: ' + s.slice(0, 120)); } };
process.on('uncaughtException', (e) => { console.error('ERROR FATAL:', (e.message || e).toString().slice(0, 500)); process.exit(2); });

async function intentar(paso, sql) {
  try { await db.exec(sql); reg(paso, true); return true; }
  catch (e) { reg(paso, false, (e.message || String(e)).split('\n')[0].slice(0, 300)); return false; }
}

// ---------------------------------------------------------------- (0) texto aceptado por el servidor
// InsForge rechaza todo archivo cuyo TEXTO contenga una instruccion de cambio de configuracion de sesion
// ("Changing SQL session configuration is not allowed"), incluso dentro de un comentario o de un literal.
// PGlite no lo detecta, asi que se comprueba aparte sobre las migraciones, sus rollbacks y los tests de BD.
console.log('=== (0) texto aceptado por el servidor de InsForge');
{
  const PROHIBIDO = /set_config\s*\(|\bset\s+(local|session)\s|\bset\s+role\b|\breset\s+role\b|\bset\s+session\s+authorization\b/i;
  const PALABRA = /set_config/i;
  const archivos = [];
  for (const d of ['migrations', 'migrations/rollback', 'tests/db', 'scripts']) {
    const dir = join(REPO, d);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('.sql')) archivos.push(join(dir, f));
  }
  const malos = [];
  for (const ruta of archivos) {
    lee(ruta).split(/\r?\n/).forEach((linea, i) => {
      if (PROHIBIDO.test(linea) || PALABRA.test(linea)) malos.push(`${ruta.slice(REPO.length + 1).replace(/\\/g, '/')}:${i + 1}`);
    });
  }
  reg('0 ningun .sql menciona set_config / set local / set role (ni en comentarios)', malos.length === 0, malos.slice(0, 8).join(', '));
}

// ---------------------------------------------------------------- (a) esquema base
console.log('=== (a) esquema base: stubs + migraciones historicas 001..089');
const EXCLUIR_HIST = (opt('--excluir', '') || '').split(',').filter(Boolean); // p. ej. --excluir 088,089 (aun sin aplicar en produccion)
async function construirBase(instancia, excluir = EXCLUIR_HIST) {
  const guardado = db; db = instancia;
  try {
    await db.exec(lee(join(aqui, 'base-stubs.sql')));
    await db.exec('set role project_admin'); // como produccion: todo se aplica y se prueba como project_admin (no superusuario, BYPASSRLS)
    const hist = readdirSync(MIG).filter((f) => /^0\d\d_.*\.sql$/.test(f) && Number(f.slice(0, 3)) <= 89 && !excluir.includes(f.slice(0, 3))).sort();
    let malas = 0;
    for (const f of hist) {
      if (f.startsWith('059_')) {
        // En produccion la ubicacion 'Almacen general' sembrada por la 014 ya no existe (se renombro o borro a mano);
        // la 059 hace SET NOT NULL sobre tipo y fallaria con esa fila sin clasificar.
        await db.exec("delete from public.ubicaciones where nombre = 'Almacén general'");
      }
      try { await db.exec(lee(join(MIG, f))); }
      catch (e) { malas++; reg('base ' + f, false, e.message.split(String.fromCharCode(10))[0].slice(0, 200)); }
    }
    return { hist, malas };
  } finally { db = guardado; }
}
const baseInfo = await construirBase(db);
const historicas = baseInfo.hist;
reg(`base: ${historicas.length} migraciones historicas aplicadas${EXCLUIR_HIST.length ? ' (excluidas ' + EXCLUIR_HIST.join(',') + ')' : ''}`, baseInfo.malas === 0);

// ---- fidelidad contra el catalogo de produccion volcado (scratchpad/db/*.json), si existe
if (!args.includes('--saltar-fidelidad') && existsSync(join(aqui, 'db/columnas.json'))) {
  const prod = (f) => JSON.parse(lee(join(aqui, 'db', f))).rows;
  const colsProd = new Map();
  for (const r of prod('columnas.json')) for (const c of r.cols.split(', ')) colsProd.set(r.table_name + '.' + c.split(':')[0], c);
  const colsLocal = new Set((await q("select table_name||'.'||column_name k from information_schema.columns where table_schema='public'")).map((r) => r.k));
  const faltanLocal = [...colsProd.keys()].filter((k) => !colsLocal.has(k));
  const faltanProd = [...colsLocal].filter((k) => !colsProd.has(k));
  const fprod = new Set(prod('funciones.json').filter((f) => f.lanname !== 'c').map((f) => f.proname));
  const flocal = new Set((await q("select proname from pg_proc where pronamespace='public'::regnamespace")).map((r) => r.proname));
  const tprod = new Set(prod('triggers.json').map((t) => t.tgname));
  const tlocal = new Set((await q("select tgname from pg_trigger where not tgisinternal")).map((r) => r.tgname));
  console.log('  columnas en produccion y no en local:', faltanLocal.length, faltanLocal.slice(0, 15).join(' '));
  console.log('  columnas locales y no en produccion  :', faltanProd.length, faltanProd.slice(0, 15).join(' '), '(esperado: lo que agregan 086..089 si produccion aun no las tiene)');
  console.log('  funciones en prod y no en local:', [...fprod].filter((x) => !flocal.has(x)).join(' ') || '-');
  console.log('  funciones locales y no en prod :', [...flocal].filter((x) => !fprod.has(x)).join(' ') || '-');
  console.log('  triggers en prod y no en local :', [...tprod].filter((x) => !tlocal.has(x)).join(' ') || '-');
  console.log('  triggers locales y no en prod  :', [...tlocal].filter((x) => !tprod.has(x)).join(' ') || '-');
  // policies, CHECK e indices (por nombre) contra el catalogo de produccion
  const dif2 = (etq, prodSet, locSet) => {
    const a = [...prodSet].filter((x) => !locSet.has(x)), b = [...locSet].filter((x) => !prodSet.has(x));
    console.log(`  ${etq}: solo en produccion ${a.length}${a.length ? ' [' + a.slice(0, 6).join(' ; ') + ']' : ''} | solo en local ${b.length}${b.length ? ' [' + b.slice(0, 6).join(' ; ') + ']' : ''}`);
    return { a, b };
  };
  const pol = dif2('policies', new Set(prod('policies.json').map((p) => `${p.tablename}|${p.policyname}`)), new Set((await q("select tablename||'|'||policyname k from pg_policies where schemaname='public'")).map((r) => r.k)));
  const chk = dif2('CHECK', new Set(prod('checks.json').filter((c) => c.tabla !== '-' && c.def.startsWith('CHECK')).map((c) => `${c.tabla}|${c.conname}`)), new Set((await q("select conrelid::regclass::text||'|'||conname k from pg_constraint where connamespace='public'::regnamespace and contype='c'")).map((r) => r.k)));
  const idx = dif2('indices', new Set(prod('indices.json').map((i) => i.indexname)), new Set((await q("select indexname k from pg_indexes where schemaname='public'")).map((r) => r.k)));
  reg('fidelidad: policies, CHECK e indices de produccion existen todos en el esquema local', pol.a.length + chk.a.length + idx.a.length === 0, [...pol.a, ...chk.a, ...idx.a].slice(0, 6).join(' ; '));
  // tipo y NOT NULL de cada columna (la causa de que el bloque 110a de los tests insertara una ubicacion sin 'tipo')
  const tipoLocal = new Map((await q("select table_name||'.'||column_name k, data_type||(case when is_nullable='NO' then '!' else '' end) v from information_schema.columns where table_schema='public'")).map((r) => [r.k, r.v]));
  const distintos = [];
  for (const [k, c] of colsProd) {
    if (!tipoLocal.has(k)) continue;
    const [, t] = c.split(/:(.*)/s);
    const tp = t.replace(/^timestamp with time zone/, 'timestamp with time zone');
    const norm = (x) => x.replace('character varying', 'character varying');
    if (norm(tp) !== norm(tipoLocal.get(k))) distintos.push(`${k} prod=${tp} local=${tipoLocal.get(k)}`);
  }
  console.log('  columnas con tipo/NOT NULL distintos entre produccion y local:', distintos.length, distintos.slice(0, 12).join(' | '));
  reg('fidelidad: tipo y NOT NULL de las columnas coinciden con produccion (salvo 086..089 aun sin aplicar alla)', distintos.length === 0, distintos.slice(0, 6).join(' | '));
  reg('fidelidad: ninguna columna de produccion falta en el esquema local', faltanLocal.length === 0, faltanLocal.slice(0, 10).join(' '));
}

// ---------------------------------------------------------------- utilidades de las fases
const sqlMig = (n) => lee(join(MIG, archivoMig(n)));
const sqlRb = (n) => lee(join(REPO, 'migrations/rollback', `${n}_rollback.sql`));

// Misma transformacion que scripts/test-db.mjs
function bloquesDeTests() {
  return lee(join(REPO, 'tests/db/triggers.test.sql'))
    .split(/(?<=end \$\$;)/)
    .filter((b) => b.includes('do $$'))
    .map((b) => b.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join(' ').replace(/\s+/g, ' ').trim());
}
async function correrTests(etiqueta) {
  const bloques = bloquesDeTests();
  let ok = 0;
  const malos = [];
  for (const [i, sql] of bloques.entries()) {
    const tag = (sql.match(/TESTS_OK \[([^\]]+)\]/) || [])[1] || `#${i + 1}`;
    let msg = '';
    try { await db.exec(sql); msg = '(el bloque no lanzo excepcion)'; }
    catch (e) { msg = e.message || String(e); }
    if (msg.includes('TESTS_OK') && !msg.includes('TESTS_FALLARON')) { ok++; if (verbose) console.log('   bloque', i + 1, tag, 'OK'); }
    else malos.push(`bloque ${i + 1} [${tag}]: ${msg.slice(0, 400)}`);
  }
  reg(`tests/db/triggers.test.sql (${etiqueta}): ${ok}/${bloques.length} bloques con TESTS_OK`, malos.length === 0, malos.join(' || '));
  return malos;
}

// foto del esquema para comparar antes/despues (idempotencia y rollbacks)
async function foto() {
  const r = {};
  r.funciones = (await q(`select p.oid::regprocedure::text f, md5(replace(pg_get_functiondef(p.oid), chr(13), '')) h, pg_get_userbyid(p.proowner) o, p.proacl::text acl from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`)).map((x) => `${x.f}|${x.h}|${x.o}|${x.acl}`);
  r.tablas = (await q(`select c.relname||':'||c.relkind::text||':'||c.relrowsecurity::text||':'||coalesce(c.relacl::text,'') k from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v','m','S') order by 1`)).map((x) => x.k);
  r.columnas = (await q(`select table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') k from information_schema.columns where table_schema='public' order by 1`)).map((x) => x.k);
  r.constraints = (await q(`select conrelid::regclass::text||'.'||conname||':'||replace(pg_get_constraintdef(oid), ' NOT VALID', '') k from pg_constraint where connamespace='public'::regnamespace order by 1`)).map((x) => x.k);
  r.triggers = (await q(`select tgrelid::regclass::text||'.'||tgname||':'||tgenabled::text||':'||pg_get_triggerdef(oid) k from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'auth.%' order by 1`)).map((x) => x.k);
  r.policies = (await q(`select tablename||'.'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,'') k from pg_policies where schemaname in ('public','realtime') order by 1`)).map((x) => x.k);
  r.indices = (await q(`select indexdef k from pg_indexes where schemaname='public' order by 1`)).map((x) => x.k);
  return r;
}
function difFoto(a, b) {
  const out = [];
  for (const k of Object.keys(a)) {
    const sa = new Set(a[k]), sb = new Set(b[k]);
    for (const x of a[k]) if (!sb.has(x)) out.push(`${k} - ${x.slice(0, 160)}`);
    for (const x of b[k]) if (!sa.has(x)) out.push(`${k} + ${x.slice(0, 160)}`);
  }
  return out;
}










// ---------------------------------------------------------------- escenarios integrados (PGlite SI permite set role / set_config)
// Ejercen las RPC y las policies como `authenticated`/`anon` con sesion simulada (auth.uid() lee request.jwt.claims->>'sub', igual que produccion),
// combinando 099..110 y el esquema historico. Dejan datos PERSISTENTES (a proposito) para que los rollbacks se
// prueben despues sobre una base con filas reales.
const esc = { ok: 0, mal: [] };
function afirmar(nombre, cond, detalle = '') {
  if (cond) { esc.ok++; if (verbose) console.log('   ok  ', nombre); }
  else { esc.mal.push(`${nombre}${detalle ? ' :: ' + detalle : ''}`); console.log('   MAL ', nombre, detalle); }
}
async function sesion(rol, uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, role: rol }) : ''}', false); set role ${rol}`);
  try { return await fn(); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false); set role project_admin`); }
}
const como = (uid, fn) => sesion('authenticated', uid, fn);
const anonimo = (fn) => sesion('anon', null, fn);
async function falla(nombre, fn, { code, msg } = {}) {
  try { await fn(); afirmar(nombre, false, 'no lanzo error'); }
  catch (e) {
    const okCode = !code || e.code === code;
    const okMsg = !msg || (e.message || '').includes(msg);
    afirmar(nombre, okCode && okMsg, `esperaba ${code || ''} ${msg || ''}, obtuvo ${e.code} ${(e.message || '').slice(0, 160)}`);
  }
}
const uno = async (sql) => (await q(sql))[0];

async function escenarios(etiqueta) {
  console.log(`=== escenarios integrados (${etiqueta})`);
  esc.ok = 0; esc.mal = [];
  const sfx = Math.random().toString(36).slice(2, 8);
  // ---- datos base (como project_admin, RLS bypass)
  const mkUser = async (email, rol, activo, modulos) => {
    const id = (await uno(`insert into auth.users (email) values ('${email}') returning id`)).id;
    // la siembra bypasea el guard de autoedicion (solo un JEFE con sesion cambia roles); se re-activa enseguida
    await db.exec('alter table staff disable trigger trg_staff_autoedicion_solo_nombre');
    await db.exec(`update staff set activo = ${activo}, rol = '${rol}' where user_id = '${id}'`);
    await db.exec('alter table staff enable trigger trg_staff_autoedicion_solo_nombre');
    if (modulos) await db.exec(`delete from staff_modulos_permisos where staff_user_id = '${id}' and modulo <> all (array[${modulos.map((m) => `'${m}'`).join(',') || "''"}])`);
    return id;
  };
  const U = {
    jefe: await mkUser(`jefe-${sfx}@t.test`, 'JEFE', true),
    asist: await mkUser(`asist-${sfx}@t.test`, 'ASISTENTE', true),
    sinmod: await mkUser(`sinmod-${sfx}@t.test`, 'ASISTENTE', true, []),
    inact: await mkUser(`inact-${sfx}@t.test`, 'ASISTENTE', false),
  };
  const empresa = (await uno(`insert into empresas (nombre) values ('Esc ${sfx}') returning id`)).id;
  const dniN = () => String(Math.floor(10000000 + Math.random() * 89999999));
  const mkEmp = async (n) => (await uno(`insert into empleados (nombres, apellidos, dni, empresa_id) values ('${n}', 'Esc ${sfx}', '${dniN()}', '${empresa}') returning id`)).id;
  const E = { baja: await mkEmp('Baja'), susp: await mkEmp('Susp'), dest: await mkEmp('Dest') };
  await db.exec(`insert into plataformas (id, nombre) values ('gm${sfx}', 'Gmail ${sfx}') on conflict do nothing`);
  const PL = `gm${sfx}`;
  await db.exec(`insert into tipos_equipo (id, nombre) values ('lap${sfx}', 'Laptop ${sfx}')`);
  const mkEq = async (c) => (await uno(`insert into equipos (codigo, tipo_id) values ('${c}${sfx}', 'lap${sfx}') returning id`)).id;
  const Q = { a: await mkEq('QA'), b: await mkEq('QB'), c: await mkEq('QC') };
  const ubic = (await uno(`insert into ubicaciones (nombre, tipo) values ('Ubic ${sfx}', 'otro') returning id`)).id;
  const lic = (await uno(`insert into licencias (software, tipo, cantidad) values ('Soft ${sfx}', 'suscripcion', 2) returning id`)).id;
  const CIF = 'enc2:AAAA:BBBB';

  // ---- S1 permisos (099)
  await como(U.asist, async () => { await db.exec(`insert into empresas (nombre) values ('Esc2 ${sfx}')`); afirmar('S1 asistente con modulo empleados crea empresa', true); });
  await falla('S1 asistente SIN modulo empleados no crea empresa (RLS 42501)', () => como(U.sinmod, () => db.exec(`insert into empresas (nombre) values ('X ${sfx}')`)), { code: '42501' });
  await falla('S1 staff inactivo no crea empresa', () => como(U.inact, () => db.exec(`insert into empresas (nombre) values ('Y ${sfx}')`)), { code: '42501' });
  afirmar('S1 puede_actual(rol:jefe): jefe=true asistente=false', (await como(U.jefe, () => uno("select puede_actual('rol:jefe') v"))).v === true && (await como(U.asist, () => uno("select puede_actual('rol:jefe') v"))).v === false);
  afirmar('S1 puede_actual: modulo:equipos para sinmod=false, jefe=true', (await como(U.sinmod, () => uno("select puede_actual('modulo:equipos') v"))).v === false && (await como(U.jefe, () => uno("select puede_actual('modulo:equipos') v"))).v === true);
  await falla('S1 exigir_permiso sin modulo -> 42501 No autorizado', () => como(U.sinmod, () => db.exec("select exigir_permiso('modulo:equipos')")), { code: '42501', msg: 'No autorizado' });
  await falla('S1 anon no ejecuta puede_actual (permission denied)', () => anonimo(() => db.exec("select puede_actual('modulo:equipos')")), { code: '42501' });
  await falla('S1 anon no ejecuta dar_baja_empleado', () => anonimo(() => db.exec(`select dar_baja_empleado('${E.baja}')`)), { code: '42501' });
  await falla('S1 anon no ejecuta crear_cuenta_asignada', () => anonimo(() => db.exec(`select crear_cuenta_asignada('${PL}','u','${E.baja}')`)), { code: '42501' });
  await falla('S1 authenticated no ejecuta un nucleo (project_admin only)', () => como(U.jefe, () => db.exec(`select cerrar_asignacion_cuenta_nucleo('${E.baja}', null)`)), { code: '42501' });
  await falla('S1 authenticated no ejecuta registrar_acta', () => como(U.jefe, () => db.exec(`select registrar_acta('${E.baja}','entrega','k',1,'${'a'.repeat(64)}')`)), { code: '42501' });
  afirmar('S1 anon si ejecuta ticket_token_existe (false) y contacto_ti_publico', (await anonimo(() => uno("select ticket_token_existe('corto') v"))).v === false && (await anonimo(() => uno("select contacto_ti_publico() v"))) !== undefined);
  await falla('S1 anon no lee intentos_publicos', () => anonimo(() => db.exec('select * from intentos_publicos')), { code: '42501' });
  await falla('S1 authenticated no lee intentos_publicos', () => como(U.jefe, () => db.exec('select * from intentos_publicos')), { code: '42501' });

  // ---- S2/S3 cuentas: 101 (RPC + log) + 100 (trigger de contrasena) + 009 (rotacion anidada)
  const crearCuenta = (uid, usuario, emp, tipo, pw = CIF) => como(uid, () => uno(`select * from crear_cuenta_asignada('${PL}', '${usuario}', '${emp}', ${pw ? `'${pw}'` : 'null'}, null, null, '${tipo}')`));
  const aPers = await crearCuenta(U.asist, `pers-${sfx}@x.test`, E.baja, 'personal');
  const aReut = await crearCuenta(U.asist, `reut-${sfx}@x.test`, E.baja, 'reutilizable');
  const aComp = await crearCuenta(U.asist, `comp-${sfx}@x.test`, E.susp, 'compartida');
  const aReutS = await crearCuenta(U.asist, `reuts-${sfx}@x.test`, E.susp, 'reutilizable');
  const cP = aPers.cuenta_id, cR = aReut.cuenta_id, cRS = aReutS.cuenta_id;
  let c = await uno(`select * from cuentas where id = '${cP}'`);
  afirmar('S2 cuenta creada con last_password_change fijado', c.last_password_change !== null && c.requiere_rotacion === false);
  let logs = await q(`select accion, user_id, plataforma, detalle from accesos_log where cuenta_id = '${cP}' order by created_at`);
  afirmar('S2 cuentas_log_evento: 1 fila creado con el actor de la sesion y sin contrasena', logs.length === 1 && logs[0].accion === 'creado' && logs[0].user_id === U.asist && !String(logs[0].detalle).includes('enc2'), JSON.stringify(logs));
  await como(U.asist, () => db.exec(`update cuentas set requiere_rotacion = true, last_password_change = '2000-01-01' where id = '${cP}'`));
  c = await uno(`select * from cuentas where id = '${cP}'`);
  afirmar('S2 100: un UPDATE directo no puede falsear requiere_rotacion ni last_password_change', c.requiere_rotacion === false && new Date(c.last_password_change).getFullYear() > 2020, JSON.stringify([c.requiere_rotacion, c.last_password_change]));
  const antes = (await uno(`select last_password_change l from cuentas where id='${cP}'`)).l;
  await new Promise((r) => setTimeout(r, 15));
  await como(U.asist, () => db.exec(`update cuentas set password = 'enc2:CCCC:DDDD' where id = '${cP}'`));
  c = await uno(`select * from cuentas where id = '${cP}'`);
  afirmar('S2 100: cambiar la contrasena refresca last_password_change y limpia rotacion', new Date(c.last_password_change) > new Date(antes) && c.requiere_rotacion === false);
  logs = await q(`select detalle from accesos_log where cuenta_id = '${cP}' and accion = 'editado'`);
  afirmar('S2 101: UPDATE de contrasena deja fila editado "contrasena cambiada" y no la contrasena', logs.some((l) => /contraseña cambiada/.test(l.detalle)) && !logs.some((l) => /CCCC/.test(l.detalle)), JSON.stringify(logs));
  const nLogR0 = (await uno(`select count(*)::int n from accesos_log where cuenta_id='${cR}'`)).n;
  await como(U.asist, () => db.exec(`select cerrar_asignacion_cuenta('${aReut.id}', null)`));
  c = await uno(`select * from cuentas where id = '${cR}'`);
  afirmar('S3 009+100+101: cerrar asignacion de reutilizable deja requiere_rotacion=true (anidado, sobrevive a cuentas_password_cambio)', c.requiere_rotacion === true);
  afirmar('S3 la rotacion anidada no genera fila "editado" espuria en accesos_log', (await uno(`select count(*)::int n from accesos_log where cuenta_id='${cR}'`)).n === nLogR0);
  await como(U.asist, () => db.exec(`update cuentas set requiere_rotacion = false where id = '${cR}'`));
  afirmar('S3 100: el cliente no puede limpiar la marca de rotacion con un UPDATE directo', (await uno(`select requiere_rotacion r from cuentas where id='${cR}'`)).r === true);
  const nueva = await como(U.asist, () => uno(`select * from traspasar_cuenta('${aComp.id}', '${E.dest}', 'traspaso', null)`));
  afirmar('S3 traspasar_cuenta devuelve la asignacion nueva', nueva && nueva.empleado_id === E.dest && nueva.fecha_fin === null);
  await falla('S3 crear_cuenta_asignada sin cifrar rechazada (P0001)', () => como(U.asist, () => db.exec(`select crear_cuenta_asignada('${PL}', 'raw-${sfx}', '${E.dest}', 'claro123', null, null, 'personal')`)), { code: 'P0001' });
  await falla('S3 crear_cuenta_asignada sin modulo correos -> 42501', () => como(U.sinmod, () => db.exec(`select crear_cuenta_asignada('${PL}', 'x-${sfx}', '${E.dest}')`)), { code: '42501' });

  // ---- S4 baja (102) sobre cuentas (101/100/009), licencias y equipos
  await db.exec(`insert into asignaciones_licencia (licencia_id, empleado_id) values ('${lic}', '${E.baja}')`);
  const asigQa = await como(U.asist, () => uno(`select * from asignar_equipo('${Q.a}', '${E.baja}', 'bueno')`));
  afirmar('S4 asignar_equipo crea portador activo', asigQa.fecha_fin === null && asigQa.empleado_id === E.baja);
  await falla('S4 dar_baja_empleado sin modulo empleados -> 42501', () => como(U.sinmod, () => db.exec(`select dar_baja_empleado(p_empleado_id => '${E.baja}')`)), { code: '42501' });
  const baja = await como(U.asist, () => uno(`select * from dar_baja_empleado(p_empleado_id => '${E.baja}', p_motivo => 'Renuncia')`));
  afirmar('S4 baja: estado Inactivo', baja.estado === 'Inactivo');
  afirmar('S4 baja: cuenta personal en soft delete + log "eliminado" 101 con actor de sesion', (await uno(`select deleted_at is not null d from cuentas where id='${cP}'`)).d === true && (await uno(`select count(*)::int n from accesos_log where cuenta_id='${cP}' and accion='eliminado' and user_id='${U.asist}'`)).n === 1);
  afirmar('S4 baja: asignaciones de cuenta y licencia cerradas', (await uno(`select count(*)::int n from asignaciones_cuenta where empleado_id='${E.baja}' and fecha_fin is null`)).n === 0 && (await uno(`select count(*)::int n from asignaciones_licencia where empleado_id='${E.baja}' and fecha_fin is null`)).n === 0);
  afirmar('S4 baja: evento baja_ejecutada con motivo', (await uno(`select count(*)::int n from empleado_eventos where empleado_id='${E.baja}' and evento='baja_ejecutada' and detalle='Renuncia'`)).n === 1);
  const nEv = (await uno(`select count(*)::int n from empleado_eventos where empleado_id='${E.baja}'`)).n;
  await como(U.asist, () => db.exec(`select dar_baja_empleado(p_empleado_id => '${E.baja}')`));
  afirmar('S4 segunda baja inocua: no repite el evento', (await uno(`select count(*)::int n from empleado_eventos where empleado_id='${E.baja}'`)).n === nEv);
  const nPortQa = (await uno(`select count(*)::int n from asignaciones_equipo where equipo_id='${Q.a}' and fecha_fin is null`)).n;
  console.log(`   (informativo) tras la baja el equipo del empleado sigue con portador activo: ${nPortQa === 1} (mismo comportamiento que la 086, que no toca equipos)`);
  await como(U.asist, () => db.exec(`select devolver_equipo('${asigQa.id}', 'bueno', 'baja_empleado', false)`));
  afirmar('S4 devolver_equipo con motivo baja_empleado admitido por el CHECK de la 100', (await uno(`select motivo_cierre m from asignaciones_equipo where id='${asigQa.id}'`)).m === 'baja_empleado');
  const asigQc = await como(U.asist, () => uno(`select * from asignar_equipo('${Q.c}', '${E.dest}')`));
  await falla('S4 devolver_equipo con motivo fuera de dominio es rechazado (P0001 de la RPC antes del CHECK 23514)', () => como(U.asist, () => db.exec(`select devolver_equipo('${asigQc.id}', null, 'inventado', false)`)), { code: 'P0001' });
  await falla('S4 100: el CHECK de motivo_cierre rechaza un UPDATE directo fuera de dominio (23514)', () => db.exec(`update asignaciones_equipo set fecha_fin = current_date, motivo_cierre = 'inventado' where id = '${asigQc.id}'`), { code: '23514' });
  await como(U.asist, () => db.exec(`select devolver_equipo('${asigQc.id}', null, 'devolucion', false)`));

  // ---- S5 suspension / reactivacion (102) + rotacion anidada + notificacion (100 crear_notificacion)
  const susp = await como(U.asist, () => uno(`select * from suspender_empleado('${E.susp}', 'Investigacion')`));
  afirmar('S5 suspender: estado Suspendido', susp.estado === 'Suspendido');
  afirmar('S5 suspender: cuenta reutilizable con asignacion activa queda requiere_rotacion=true y la asignacion sigue abierta', (await uno(`select requiere_rotacion r from cuentas where id='${cRS}'`)).r === true && (await uno(`select count(*)::int n from asignaciones_cuenta where id='${aReutS.id}' and fecha_fin is null`)).n === 1);
  afirmar('S5 suspender: la marca anidada no deja fila "editado" en accesos_log', (await uno(`select count(*)::int n from accesos_log where cuenta_id='${cRS}' and accion='editado'`)).n === 0);
  afirmar('S5 suspender: notificacion empleado_suspendido (CHECK de la 102 la admite)', (await uno(`select count(*)::int n from notificaciones where tipo='empleado_suspendido' and entidad_id='${E.susp}'`)).n >= 1);
  await falla('S5 suspender sin motivo -> P0001', () => como(U.asist, () => db.exec(`select suspender_empleado('${E.dest}', '')`)), { code: 'P0001' });
  await como(U.asist, () => db.exec(`select reactivar_empleado('${E.susp}')`));
  afirmar('S5 reactivar: vuelve a Activo', (await uno(`select estado from empleados where id='${E.susp}'`)).estado === 'Activo');
  await como(U.asist, () => db.exec(`update empleados set cargo = 'Chofer' where id = '${E.susp}'`));
  afirmar('S5 UPDATE directo de otros campos del empleado sigue permitido y auditado (cargo)', (await uno(`select count(*)::int n from empleado_eventos where empleado_id='${E.susp}' and campo='cargo'`)).n >= 1);
  await db.exec("update empleados_ajustes set valor = true where clave = 'exigir_contexto_rpc'");
  await falla('S5 modo estricto: UPDATE directo de estado rechazado', () => como(U.asist, () => db.exec(`update empleados set estado = 'Suspendido' where id = '${E.susp}'`)));
  await como(U.asist, () => db.exec(`select suspender_empleado('${E.susp}', 'Otra vez')`));
  afirmar('S5 modo estricto: la RPC sigue funcionando', (await uno(`select estado from empleados where id='${E.susp}'`)).estado === 'Suspendido');
  await db.exec("update empleados_ajustes set valor = false where clave = 'exigir_contexto_rpc'");
  await como(U.asist, () => db.exec(`select reactivar_empleado('${E.susp}')`));

  // ---- S6 equipos: 100 (updated_at anidado), 085, 101 (evento check), 110 (actas)
  const uaQ = await uno(`select updated_at, updated_by from equipos where id='${Q.b}'`);
  const asigQb = await como(U.asist, () => uno(`select * from asignar_equipo('${Q.b}', '${E.dest}', 'nuevo')`));
  const uaQ2 = await uno(`select updated_at, updated_by, tiene_asignacion_activa t from equipos where id='${Q.b}'`);
  afirmar('S6 100+085: la cascada de disponibilidad no pisa updated_at/updated_by del equipo', String(uaQ2.updated_at) === String(uaQ.updated_at) && uaQ2.updated_by === uaQ.updated_by && uaQ2.t === true, JSON.stringify([uaQ, uaQ2]));
  await falla('S6 100: un segundo portador activo para el mismo equipo es rechazado', () => como(U.asist, () => db.exec(`insert into asignaciones_equipo (equipo_id, empleado_id) values ('${Q.b}', '${E.susp}')`)));
  const acta = await uno(`select * from registrar_acta('${asigQb.id}', 'entrega', 'actas/${sfx}/a.pdf', 1234, '${'a'.repeat(64)}', null, '${U.asist}')`);
  afirmar('S6 110: registrar_acta como project_admin crea el acta y el evento acta_adjuntada pasa el CHECK de la 101', acta && (await uno(`select count(*)::int n from eventos_equipo where equipo_id='${Q.b}' and evento='acta_adjuntada'`)).n === 1);
  const vr = await como(U.asist, () => uno(`select * from verificar_equipo('${Q.b}', '${ubic}', 'ok')`));
  afirmar('S6 101: verificar_equipo registra evento verificado con actor', vr.evento === 'verificado' && vr.user_id === U.asist);
  await como(U.asist, () => db.exec(`select mover_equipo('${Q.a}', '${ubic}')`));
  await como(U.asist, () => db.exec(`select asignar_equipo('${Q.a}', '${E.dest}', null)`));
  afirmar('S6 101+100: mover (movimiento) y reasignar (entrega_a_empleado) cumplen el CHECK de motivo_cierre', (await q(`select motivo_cierre m from asignaciones_equipo where equipo_id='${Q.a}' and motivo_cierre is not null`)).every((r) => ['movimiento', 'entrega_a_empleado', 'baja_empleado', 'devolucion'].includes(r.m)));

  // ---- S7 dashboard (103) y su lectura tolerante de la vista de 110
  const dj = await como(U.asist, () => uno('select dashboard_resumen() as d'));
  afirmar('S7 103: dashboard_resumen() devuelve un objeto JSON con secciones', dj && dj.d && typeof dj.d === 'object' && Object.keys(dj.d).length >= 5, Object.keys(dj?.d || {}).join(','));
  console.log('   (informativo) claves del dashboard:', Object.keys(dj.d).join(','), '| actas_pendientes =', JSON.stringify(dj.d.actas_pendientes));
  await falla('S7 103: anon no ejecuta dashboard_resumen', () => anonimo(() => db.exec('select dashboard_resumen()')), { code: '42501' });
  await falla('S7 103: dashboard_resumen_de no ejecutable por authenticated', () => como(U.jefe, () => db.exec(`select dashboard_resumen_de('${U.jefe}')`)), { code: '42501' });
  const dsin = await como(U.sinmod, () => uno('select dashboard_resumen() as d'));
  afirmar('S7 103: un asistente sin modulos recibe el resumen (secciones vacias o null), no un error', dsin && dsin.d);

  // ---- S8 realtime.publish caido no tumba la escritura de negocio (100 sec. 9)
  await db.exec('reset role');
  const defPublish = (await uno("select pg_get_functiondef('realtime.publish(text,text,jsonb)'::regprocedure) d")).d;
  await db.exec("create or replace function realtime.publish(p_channel_name text, p_event_name text, p_payload jsonb) returns uuid language plpgsql as $$ begin raise exception 'realtime caido (simulado)'; end $$");
  await db.exec('set role project_admin');
  try {
    await como(U.asist, () => db.exec(`insert into plataformas (id, nombre) values ('rt${sfx}', 'RT ${sfx}')`));
    await como(U.asist, () => db.exec(`select suspender_empleado('${E.dest}', 'Prueba realtime')`));
    afirmar('S8 100: con realtime caido las escrituras y la notificacion se guardan igual', (await uno(`select count(*)::int n from notificaciones where tipo='empleado_suspendido' and entidad_id='${E.dest}'`)).n === 1);
  } catch (e) { afirmar('S8 100: con realtime caido las escrituras no deben fallar', false, e.message); }
  await db.exec('reset role');
  await db.exec(defPublish);
  await db.exec('set role project_admin');
  await como(U.asist, () => db.exec(`select reactivar_empleado('${E.dest}')`));

  // ---- S5b maquina de estados del empleado (102) combinada con baja/reactivacion
  const eMix = await mkEmp('Mix');
  await como(U.asist, () => db.exec(`select suspender_empleado('${eMix}', 'x')`));
  await como(U.asist, () => db.exec(`select dar_baja_empleado('${eMix}', 'Baja desde Suspendido')`));
  afirmar('S5b Suspendido -> baja -> Inactivo', (await uno(`select estado from empleados where id='${eMix}'`)).estado === 'Inactivo');
  await como(U.asist, () => db.exec(`select reingresar_empleado('${eMix}', '{"cargo":"Chofer"}'::jsonb)`));
  afirmar('S5b reingresar: Activo con cargo nuevo y fecha_alta de hoy', (await uno(`select estado, cargo from empleados where id='${eMix}'`)).cargo === 'Chofer');
  await falla('S5b reingresar a un Activo -> P0001', () => como(U.asist, () => db.exec(`select reingresar_empleado('${eMix}')`)), { code: 'P0001' });
  await falla('S5b UPDATE directo Inactivo->Suspendido rechazado por la whitelist (ni en modo compatibilidad)', async () => { await como(U.asist, () => db.exec(`select dar_baja_empleado('${eMix}')`)); await como(U.asist, () => db.exec(`update empleados set estado='Suspendido' where id='${eMix}'`)); });
  const tl = await q(`select evento from empleado_eventos where empleado_id='${eMix}' order by created_at, evento`);
  console.log('   (informativo) timeline de eventos del empleado de prueba:', tl.map((x) => x.evento).join(' > '));

  // ---- S10 una sola regla: puede_actual vs las funciones antiguas (informativo; la 099 declara las diferencias a proposito)
  const dif = [];
  for (const [nombre, uid] of Object.entries(U)) {
    for (const mod of ['equipos', 'empleados', 'correos']) {
      const nuevo = (await como(uid, () => uno(`select puede_actual('modulo:${mod}') v`))).v;
      const viejo = (await como(uid, () => uno(`select (es_staff() and tiene_permiso_modulo('${mod}')) v`))).v;
      if (nuevo !== viejo) dif.push(`${nombre}/modulo:${mod} nuevo=${nuevo} viejo=${viejo}`);
    }
  }
  console.log('   (informativo) diferencias puede_actual vs funciones antiguas:', dif.length ? dif.join(' | ') : 'ninguna');
  esc.difPermisos = dif;

  // ---- S11 099 sec. 3: kb_registrar_feedback conserva EXECUTE de authenticated tras el create or replace y ahora exige modulo
  await como(U.asist, () => db.exec("select kb_registrar_feedback(gen_random_uuid(), true)"));
  afirmar('S11 099: kb_registrar_feedback con modulo base_conocimiento pasa el guard', true);
  await falla('S11 099: kb_registrar_feedback sin modulo -> P0001 No autorizado (mismo mensaje que antes)', () => como(U.sinmod, () => db.exec("select kb_registrar_feedback(gen_random_uuid(), true)")), { code: 'P0001', msg: 'No autorizado' });
  await falla('S11 anon no ejecuta kb_registrar_feedback', () => anonimo(() => db.exec("select kb_registrar_feedback(gen_random_uuid(), true)")), { code: '42501' });
  const aPers2 = await crearCuenta(U.asist, `pers2-${sfx}@x.test`, E.dest, 'personal');
  await como(U.asist, () => db.exec(`select revocar_cuenta_personal('${aPers2.id}')`));
  afirmar('S11 101: revocar_cuenta_personal (invoker, delega en cerrar_asignacion_cuenta) cierra la asignacion, da de baja la cuenta y deja log eliminado', (await uno(`select count(*)::int n from asignaciones_cuenta where id='${aPers2.id}' and fecha_fin is not null`)).n === 1 && (await uno(`select count(*)::int n from accesos_log where cuenta_id='${aPers2.cuenta_id}' and accion='eliminado'`)).n === 1);
  await falla('S11 101: revocar_cuenta_personal sobre una cuenta reutilizable es rechazada', () => como(U.asist, () => db.exec(`select revocar_cuenta_personal('${aReut.id}')`)), { msg: 'solo aplica a cuentas tipo' });
  const aPers3 = await crearCuenta(U.asist, `pers3-${sfx}@x.test`, E.dest, 'personal');
  let errSinMod = null;
  try { await como(U.sinmod, () => db.exec(`select revocar_cuenta_personal('${aPers3.id}')`)); } catch (x) { errSinMod = x; }
  afirmar('S11 101: revocar_cuenta_personal sin modulo correos es rechazada y no modifica nada', errSinMod !== null && (await uno(`select count(*)::int n from asignaciones_cuenta where id='${aPers3.id}' and fecha_fin is null`)).n === 1, errSinMod ? `${errSinMod.code} ${errSinMod.message}` : 'sin error');
  console.log('   (informativo) revocar_cuenta_personal sin modulo correos devuelve:', errSinMod && `${errSinMod.code} "${errSinMod.message}"`, '(la cabecera de la 101 dice 42501 explicito; con RLS la fila no se ve y sale P0001 "Asignacion no encontrada")');


  // ---- S9 099 sec. 7: el ultimo JEFE con permiso sobre un acceso sensible
  const acc = (await como(U.jefe, () => uno(`insert into accesos_sensibles (nombre, categoria, usuario) values ('AS ${sfx}', 'otro', 'u') returning id`))).id;
  afirmar('S9 024: el creador JEFE recibe el permiso sobre su acceso sensible', (await uno(`select count(*)::int n from accesos_sensibles_permisos where acceso_id='${acc}' and staff_user_id='${U.jefe}'`)).n === 1);
  await falla('S9 099: no se puede desactivar al unico jefe con permiso sobre un acceso sensible', () => como(U.jefe, () => db.exec(`update staff set activo = false where user_id = '${U.jefe}'`)), { msg: 'único jefe activo' });

  // ---- S12 112: purga, anonimizacion y entorno con sesiones reales
  if ((await uno("select to_regclass('public.config_retencion') as t")).t) {
    const eOld = (await uno(`insert into empleados (nombres, apellidos, dni, empresa_id, estado, telefono) values ('Vieja', 'Baja ${sfx}', '${dniN()}', '${empresa}', 'Inactivo', '955000111') returning id`)).id;
    await db.exec(`insert into empleado_eventos (empleado_id, evento, rol_actor, detalle, created_at) values ('${eOld}', 'baja_ejecutada', 'jefe', 'Renuncia', now() - interval '6 years')`);
    await falla('S12 112: anon no ejecuta anonimizar_empleado', () => anonimo(() => db.exec(`select anonimizar_empleado('${eOld}', 'prueba')`)), { code: '42501' });
    await falla('S12 112: un asistente no anonimiza (42501 No autorizado)', () => como(U.asist, () => db.exec(`select anonimizar_empleado('${eOld}', 'prueba')`)), { code: '42501', msg: 'No autorizado' });
    await falla('S12 112: staff inactivo no anonimiza', () => como(U.inact, () => db.exec(`select anonimizar_empleado('${eOld}', 'prueba')`)), { code: '42501' });
    await falla('S12 112: ni el jefe ejecuta anonimizar_empleado_interno (solo project_admin)', () => como(U.jefe, () => db.exec(`select anonimizar_empleado_interno('${eOld}', 'prueba')`)), { code: '42501' });
    afirmar('S12 112: v_empleados_anonimizables vacia para un asistente', (await como(U.asist, () => uno('select count(*)::int n from v_empleados_anonimizables'))).n === 0);
    const cand = await como(U.jefe, () => q(`select empleado_id, anios_requeridos from v_empleados_anonimizables where empleado_id = '${eOld}'`));
    afirmar('S12 112: v_empleados_anonimizables lista al candidato para el jefe (5 anios requeridos)', cand.length === 1 && Number(cand[0].anios_requeridos) === 5, JSON.stringify(cand));
    const rA = await como(U.jefe, () => uno(`select anonimizar_empleado('${eOld}', 'Plazo cumplido') as r`));
    afirmar('S12 112: el jefe anonimiza y recibe el resumen', rA.r && rA.r.empleado_id === eOld, JSON.stringify(rA));
    const eA = await uno(`select nombres, apellidos, dni, telefono, anonimizado_at from empleados where id = '${eOld}'`);
    afirmar('S12 112: empleado anonimizado (nombre, DNI ANON-, telefono NULL)', eA.nombres === 'Empleado' && /^ANON-[0-9a-f]{16}$/.test(eA.dni) && eA.telefono === null && eA.anonimizado_at !== null, JSON.stringify(eA));
    const evA = await uno(`select user_id, rol_actor, detalle from empleado_eventos where empleado_id = '${eOld}' and evento = 'anonimizado'`);
    afirmar('S12 112: evento anonimizado con el actor jefe y el motivo', evA && evA.user_id === U.jefe && evA.rol_actor === 'jefe' && /Plazo cumplido/.test(evA.detalle), JSON.stringify(evA));
    afirmar('S12 112: tras anonimizar, la vista ya no lista al empleado', (await como(U.jefe, () => uno(`select count(*)::int n from v_empleados_anonimizables where empleado_id = '${eOld}'`))).n === 0);
    await falla('S12 112: no se anonimiza dos veces (P0001)', () => como(U.jefe, () => db.exec(`select anonimizar_empleado('${eOld}', 'otra vez')`)), { code: 'P0001', msg: 'ya fue anonimizado' });

    // purga: solo el jefe (envoltorio) y project_admin (funcion)
    await falla('S12 112: un asistente no ejecuta la purga manual (42501)', () => como(U.asist, () => db.exec('select purgar_datos_temporales_manual()')), { code: '42501', msg: 'No autorizado' });
    await falla('S12 112: ni el jefe ejecuta purgar_datos_temporales directo (solo project_admin)', () => como(U.jefe, () => db.exec('select purgar_datos_temporales()')), { code: '42501' });
    await falla('S12 112: anon no ejecuta la purga', () => anonimo(() => db.exec('select purgar_datos_temporales_manual()')), { code: '42501' });
    const rP = await como(U.jefe, () => uno('select purgar_datos_temporales_manual() as r'));
    afirmar('S12 112: la purga manual del jefe termina sin errores', rP.r && rP.r.errores === 0 && typeof rP.r.total === 'number', JSON.stringify(rP));
    const lg = await uno(`select user_id, detalle from accesos_log where accion = 'purga_ejecutada' order by created_at desc limit 1`);
    afirmar('S12 112: la purga manual deja purga_ejecutada con el usuario jefe y solo conteos', lg && lg.user_id === U.jefe && /^\{/.test(lg.detalle) && !/@/.test(lg.detalle), JSON.stringify(lg));
    const rP2 = await uno('select purgar_datos_temporales() as r');
    afirmar('S12 112: project_admin ejecuta la purga sin sesion (usuario NULL en la auditoria)', rP2.r && rP2.r.errores === 0 && (await uno(`select count(*)::int n from accesos_log where accion = 'purga_ejecutada' and user_id is null`)).n >= 1);

    // config_retencion: el jefe cambia dias y activo; un asistente no (RLS: 0 filas)
    await como(U.jefe, () => db.exec(`update config_retencion set dias = 14 where tabla = 'intentos_publicos'`));
    await como(U.asist, () => db.exec(`update config_retencion set dias = 21 where tabla = 'intentos_publicos'`));
    const cr = await uno(`select dias, updated_by from config_retencion where tabla = 'intentos_publicos'`);
    afirmar('S12 112: config_retencion la edita el jefe (updated_by) y no un asistente', cr.dias === 14 && cr.updated_by === U.jefe, JSON.stringify(cr));
    await como(U.jefe, () => db.exec(`update config_retencion set dias = 7 where tabla = 'intentos_publicos'`));
    await falla('S12 112: el jefe no puede cambiar la accion de una regla (sin privilegio de columna)', () => como(U.jefe, () => db.exec(`update config_retencion set accion = 'borrar' where tabla = 'entregas'`)), { code: '42501' });
    afirmar('S12 112: un asistente lee las reglas de retencion (8; 9 con la 109)', [8, 9].includes((await como(U.asist, () => uno('select count(*)::int n from config_retencion'))).n));
    await falla('S12 112: anon no lee config_retencion', () => anonimo(() => db.exec('select * from config_retencion')), { code: '42501' });

    // entorno
    afirmar('S12 112: es_branch() es false en este entorno y lo ve un asistente', (await como(U.asist, () => uno('select es_branch() v'))).v === false && (await como(U.asist, () => uno('select count(*)::int n from entorno'))).n === 1);
    await falla('S12 112: un asistente no escribe en entorno', () => como(U.asist, () => db.exec(`update entorno set nombre = 'branch'`)), { code: '42501' });
    await falla('S12 112: ni el jefe escribe en entorno', () => como(U.jefe, () => db.exec(`update entorno set nombre = 'branch'`)), { code: '42501' });
    await falla('S12 112: anon no ejecuta es_branch', () => anonimo(() => db.exec('select es_branch()')), { code: '42501' });
  }

  // ---- S13 108: solicitudes de servicio con sesiones reales (RLS, privilegios, actor, autocompletado de punta a punta)
  if ((await uno("select to_regclass('public.solicitudes') as t")).t) {
    const eS = await mkEmp('Sol');
    const sol = await como(U.asist, () => uno(`select * from crear_solicitud('cambio_puesto', '${eS}', null, '{}'::jsonb, 'Pedido de RRHH por correo', 'rrhh_correo')`));
    afirmar('S13 108: un asistente con el modulo empleados crea la solicitud y queda como creador', sol && sol.creada_por === U.asist && sol.estado === 'abierta' && /^SOL-/.test(sol.codigo), JSON.stringify(sol));
    await falla('S13 108: sin el modulo empleados crear_solicitud da 42501', () => como(U.sinmod, () => db.exec(`select crear_solicitud('cambio_puesto', '${eS}')`)), { code: '42501', msg: 'No autorizado' });
    await falla('S13 108: staff inactivo no crea solicitudes', () => como(U.inact, () => db.exec(`select crear_solicitud('acceso_nuevo', '${eS}')`)), { code: '42501' });
    await falla('S13 108: anon no ejecuta crear_solicitud', () => anonimo(() => db.exec(`select crear_solicitud('acceso_nuevo', '${eS}')`)), { code: '42501' });
    await falla('S13 108: authenticated no ejecuta un nucleo (project_admin only)', () => como(U.jefe, () => db.exec(`select crear_solicitud_nucleo('licencia', '${eS}')`)), { code: '42501' });
    await falla('S13 108: authenticated no ejecuta solicitud_marcar_paso', () => como(U.jefe, () => db.exec(`select solicitud_marcar_paso('${eS}', 'crear_cuenta', null, null)`)), { code: '42501' });
    afirmar('S13 108: lee las solicitudes quien tiene el modulo; sin el modulo no ve ninguna', (await como(U.asist, () => uno('select count(*)::int n from solicitudes'))).n >= 1 && (await como(U.sinmod, () => uno('select count(*)::int n from solicitudes'))).n === 0 && (await como(U.sinmod, () => uno('select count(*)::int n from solicitud_pasos'))).n === 0);
    await falla('S13 108: anon no lee solicitudes', () => anonimo(() => db.exec('select * from solicitudes')), { code: '42501' });
    await falla('S13 108: un asistente no inserta en solicitudes (sin privilegio)', () => como(U.asist, () => db.exec(`insert into solicitudes (tipo_id, empleado_id) values ('licencia', '${eS}')`)), { code: '42501' });
    await falla('S13 108: ni el jefe actualiza solicitudes directo', () => como(U.jefe, () => db.exec(`update solicitudes set nota = 'x' where id = '${sol.id}'`)), { code: '42501' });
    await falla('S13 108: nadie escribe pasos directo', () => como(U.jefe, () => db.exec(`update solicitud_pasos set nota = 'x' where solicitud_id = '${sol.id}'`)), { code: '42501' });
    // omitir un paso obligatorio: solo el jefe; un opcional, cualquiera con el modulo
    const pObl = (await uno(`select id from solicitud_pasos where solicitud_id = '${sol.id}' and obligatorio order by orden limit 1`)).id;
    await falla('S13 108: un asistente no omite un paso obligatorio (P0001 solo un jefe)', () => como(U.asist, () => db.exec(`select omitir_paso_solicitud('${pObl}', 'No aplica')`)), { code: 'P0001', msg: 'solo un jefe' });
    const om = await como(U.jefe, () => uno(`select * from omitir_paso_solicitud('${pObl}', 'No aplica al puesto')`));
    afirmar('S13 108: el jefe omite el paso obligatorio y queda como autor', om.estado === 'omitido' && om.hecho_por === U.jefe && om.automatico === false, JSON.stringify(om));
    const pOpc = (await uno(`select id from solicitud_pasos where solicitud_id = '${sol.id}' and not obligatorio and estado = 'pendiente' limit 1`)).id;
    const omA = await como(U.asist, () => uno(`select * from omitir_paso_solicitud('${pOpc}', 'No corresponde')`));
    afirmar('S13 108: un asistente omite un paso opcional con motivo', omA.estado === 'omitido' && omA.hecho_por === U.asist, JSON.stringify(omA));
    await falla('S13 108: sin el modulo empleados completar_paso_solicitud da 42501', () => como(U.sinmod, () => db.exec(`select completar_paso_solicitud('${pObl}')`)), { code: '42501' });
    // completar a mano lo que queda y ver el cierre automatico
    const pend = await q(`select id from solicitud_pasos where solicitud_id = '${sol.id}' and estado = 'pendiente' order by orden`);
    for (const p of pend) await como(U.asist, () => db.exec(`select completar_paso_solicitud('${p.id}', null, 'Hecho a mano')`));
    afirmar('S13 108: al cerrar el ultimo paso la solicitud se completa sola', (await uno(`select estado from solicitudes where id = '${sol.id}'`)).estado === 'completada');
    await falla('S13 108: cancelar una solicitud completada es P0001', () => como(U.asist, () => db.exec(`select cancelar_solicitud('${sol.id}', 'tarde')`)), { code: 'P0001' });
    // RLS de DELETE: solo el jefe
    await como(U.asist, () => db.exec(`delete from solicitudes where id = '${sol.id}'`));
    afirmar('S13 108: un asistente no borra solicitudes (RLS: 0 filas)', (await uno(`select count(*)::int n from solicitudes where id = '${sol.id}'`)).n === 1);

    // Alta con persona nueva y cancelacion con el actor de la sesion
    const alta = await como(U.asist, () => uno(`select * from crear_solicitud('alta_empleado', null, jsonb_build_object('nombres','Nuevo','apellidos','Esc ${sfx}','dni','${dniN()}','empresa_id','${empresa}'), '{}'::jsonb, null, 'rrhh_correo')`));
    afirmar('S13 108: el alta crea a la persona en la misma transaccion', alta && (await uno(`select count(*)::int n from empleados where id = '${alta.empleado_id}' and nombres = 'Nuevo'`)).n === 1);
    await falla('S13 108: cancelar sin motivo es P0001', () => como(U.asist, () => db.exec(`select cancelar_solicitud('${alta.id}', '')`)), { code: 'P0001' });
    const canc = await como(U.asist, () => uno(`select * from cancelar_solicitud('${alta.id}', 'Pedido duplicado')`));
    afirmar('S13 108: cancelar deja el actor, la fecha y el motivo', canc.estado === 'cancelada' && canc.cancelada_por === U.asist && canc.cancelada_at !== null && canc.motivo_cancelacion === 'Pedido duplicado', JSON.stringify(canc));

    // Baja de punta a punta con sesion: la solicitud nace de la RPC y se cierra al recuperar el equipo
    const eB = await mkEmp('BajaSol');
    const qB = await mkEq('QS');
    const asigB = await como(U.asist, () => uno(`select * from asignar_equipo('${qB}', '${eB}', 'bueno')`));
    await como(U.asist, () => db.exec(`select dar_baja_empleado(p_empleado_id => '${eB}', p_motivo => 'Fin de contrato')`));
    const bajaSol = await uno(`select * from solicitudes where empleado_id = '${eB}' and tipo_id = 'baja_empleado'`);
    afirmar('S13 108: dar_baja_empleado crea la solicitud de baja con el actor de la sesion', bajaSol && bajaSol.estado === 'abierta' && bajaSol.creada_por === U.asist && bajaSol.nota === 'Fin de contrato', JSON.stringify(bajaSol));
    const pasosB = await q(`select clave, estado, objetivo_id from solicitud_pasos where solicitud_id = '${bajaSol.id}' order by orden`);
    afirmar('S13 108: la baja deja cerrar_accesos hecho y recuperar el equipo pendiente', pasosB.length === 2 && pasosB[0].clave === 'cerrar_accesos' && pasosB[0].estado === 'hecho' && pasosB[1].clave === 'devolver_equipo' && pasosB[1].estado === 'pendiente' && pasosB[1].objetivo_id === asigB.id, JSON.stringify(pasosB));
    await como(U.asist, () => db.exec(`select devolver_equipo('${asigB.id}', 'bueno', 'baja_empleado', false)`));
    const pDev = await uno(`select estado, automatico, hecho_por, referencia_id from solicitud_pasos where solicitud_id = '${bajaSol.id}' and clave = 'devolver_equipo'`);
    afirmar('S13 108: devolver_equipo (RPC de la 101) marca solo el paso con el actor de la sesion', pDev.estado === 'hecho' && pDev.automatico === true && pDev.hecho_por === U.asist && pDev.referencia_id === asigB.id, JSON.stringify(pDev));
    afirmar('S13 108: la baja se completa sola al recuperar el equipo', (await uno(`select estado from solicitudes where id = '${bajaSol.id}'`)).estado === 'completada');

    // Inicio: el asistente con el modulo recibe la seccion; sin el modulo es null y no es un error
    const eD = await mkEmp('DashSol');
    const solD = await como(U.asist, () => uno(`select * from crear_solicitud('acceso_nuevo', '${eD}')`));
    const dS = await como(U.asist, () => uno('select dashboard_resumen() as d'));
    afirmar('S13 108: dashboard_resumen lista la solicitud abierta con su avance', Array.isArray(dS.d.solicitudes_abiertas) && dS.d.solicitudes_abiertas.some((x) => x.solicitud_id === solD.id && x.pasos_total === 3 && x.pasos_hechos === 0), JSON.stringify(dS.d.solicitudes_abiertas).slice(0, 200));
    const dN = await como(U.sinmod, () => uno('select dashboard_resumen() as d'));
    afirmar('S13 108: sin el modulo empleados la seccion es null y no cuenta como error', dN.d.solicitudes_abiertas === null && dN.d.altas_incompletas === null && !dN.d.errores.includes('solicitudes_abiertas'), JSON.stringify([dN.d.solicitudes_abiertas, dN.d.errores]));
    afirmar('S13 108: el resumen del jefe no trae errores con solicitudes', (await como(U.jefe, () => uno('select dashboard_resumen() as d'))).d.errores.length === 0);
  }

  // ---- S14 106: KEDB con sesiones reales (permisos por modulo, quien publica, RLS de usos y de la vista)
  if ((await uno("select to_regclass('public.ticket_kb_usos') as t")).t) {
    const uSinKb = await mkUser(`sinkb-${sfx}@t.test`, 'ASISTENTE', true, ['problemas', 'tickets']);
    const uSoloKb = await mkUser(`solokb-${sfx}@t.test`, 'ASISTENTE', true, ['base_conocimiento', 'tickets']);
    const prK = (await uno(`insert into problemas (titulo, descripcion) values ('Prob KEDB ${sfx}', 'Cortes de red') returning id`)).id;
    const tkK = async (n, estado) => (await uno(`insert into tickets (codigo, token, titulo, descripcion, estado) values ('K${n}${sfx}', '${('k' + n + sfx).padEnd(24, 'x')}', 'Ticket KEDB ${n}', 'Descripcion ${n}', '${estado}') returning id`)).id;
    const tk1 = await tkK('1', 'resuelto');
    for (const sql of [`publicar_workaround_problema('${prK}', 'x')`, `crear_kb_desde_ticket('${tk1}', 'x')`, `registrar_uso_kb_ticket('${tk1}', gen_random_uuid())`]) {
      await falla(`S14 106: sin modulos ${sql.split('(')[0]} da 42501`, () => como(U.sinmod, () => db.exec(`select ${sql}`)), { code: '42501', msg: 'No autorizado' });
      await falla(`S14 106: anon no ejecuta ${sql.split('(')[0]}`, () => anonimo(() => db.exec(`select ${sql}`)), { code: '42501' });
    }
    await falla('S14 106: problemas sin base_conocimiento no publica el workaround (42501)', () => como(uSinKb, () => db.exec(`select publicar_workaround_problema('${prK}', 'x')`)), { code: '42501' });
    await falla('S14 106: base_conocimiento sin problemas no publica el workaround (42501)', () => como(uSoloKb, () => db.exec(`select publicar_workaround_problema('${prK}', 'x')`)), { code: '42501' });
    await falla('S14 106: tickets sin base_conocimiento no crea el articulo desde el ticket (42501)', () => como(uSinKb, () => db.exec(`select crear_kb_desde_ticket('${tk1}', 'x')`)), { code: '42501' });
    await falla('S14 106: authenticated no ejecuta un nucleo (project_admin only)', () => como(U.jefe, () => db.exec(`select publicar_workaround_problema_nucleo('${prK}', 'x', null, null, true)`)), { code: '42501' });

    // un asistente con ambos modulos publica: queda en revision a su nombre y los demas no lo ven
    const wa = await como(U.asist, () => uno(`select * from publicar_workaround_problema('${prK}', 'Reiniciar el router')`));
    afirmar('S14 106: un asistente deja el workaround en revision, a su nombre', wa.estado === 'en_revision' && wa.tipo === 'workaround' && wa.problema_id === prK && wa.created_by === U.asist, JSON.stringify(wa));
    const pk = await uno(`select error_conocido, kb_articulo_id, workaround from problemas where id = '${prK}'`);
    afirmar('S14 106: el problema queda como error conocido con su articulo', pk.error_conocido === true && pk.kb_articulo_id === wa.id && pk.workaround === 'Reiniciar el router', JSON.stringify(pk));
    afirmar('S14 106: un articulo en revision no lo ve otro asistente (RLS de la 031)', (await como(uSoloKb, () => uno(`select count(*)::int n from kb_articulos where id = '${wa.id}'`))).n === 0);
    const wj = await como(U.jefe, () => uno(`select * from publicar_workaround_problema('${prK}')`));
    afirmar('S14 106: el jefe lo publica (mismo articulo)', wj.id === wa.id && wj.estado === 'publicado', JSON.stringify(wj));
    afirmar('S14 106: publicado, lo ve otro asistente con la KB', (await como(uSoloKb, () => uno(`select count(*)::int n from kb_articulos where id = '${wa.id}'`))).n === 1);

    // crear el articulo desde un ticket resuelto
    const kb1 = await como(U.asist, () => uno(`select * from crear_kb_desde_ticket('${tk1}', 'Paso a paso de la solucion')`));
    afirmar('S14 106: crear_kb_desde_ticket deja un borrador a nombre de quien lo pide', kb1.estado === 'borrador' && kb1.created_by === U.asist && kb1.tipo === 'solucion' && kb1.solucion === 'Paso a paso de la solucion' && kb1.sintoma === 'Descripcion 1', JSON.stringify(kb1));
    await falla('S14 106: un segundo articulo para el mismo ticket es P0001', () => como(U.asist, () => db.exec(`select crear_kb_desde_ticket('${tk1}', 'otra')`)), { code: 'P0001', msg: 'ya tiene un art' });
    const tk0 = await tkK('0', 'abierto');
    await falla('S14 106: un ticket abierto no genera articulo (P0001)', () => como(U.asist, () => db.exec(`select crear_kb_desde_ticket('${tk0}', 'x')`)), { code: 'P0001', msg: 'resuelto o cerrado' });
    // la nota de resolucion (092 de V2) sirve de solucion cuando la columna existe
    await db.exec('alter table tickets add column nota_resolucion text');
    try {
      const tk2 = await tkK('2', 'cerrado');
      await falla('S14 106: con la columna pero sin nota ni solucion sigue siendo P0001', () => como(U.asist, () => db.exec(`select crear_kb_desde_ticket('${tk2}')`)), { code: 'P0001', msg: 'nota de resoluci' });
      await db.exec(`update tickets set nota_resolucion = 'Nota del tecnico' where id = '${tk2}'`);
      const kb2 = await como(U.asist, () => uno(`select * from crear_kb_desde_ticket('${tk2}')`));
      afirmar('S14 106: sin p_solucion se usa tickets.nota_resolucion', kb2.solucion === 'Nota del tecnico', JSON.stringify(kb2));
    } finally { await db.exec('alter table tickets drop column nota_resolucion'); }

    // registrar el uso de un articulo publicado
    const uso = await como(U.asist, () => uno(`select * from registrar_uso_kb_ticket('${tk1}', '${wa.id}')`));
    afirmar('S14 106: registrar_uso_kb_ticket deja al usuario de la sesion', uso.usado_por === U.asist && uso.ticket_id === tk1, JSON.stringify(uso));
    await como(U.asist, () => db.exec(`select registrar_uso_kb_ticket('${tk1}', '${wa.id}')`));
    afirmar('S14 106: marcarlo dos veces no duplica el uso', (await uno(`select count(*)::int n from ticket_kb_usos where ticket_id = '${tk1}' and kb_articulo_id = '${wa.id}'`)).n === 1);
    await falla('S14 106: no se registra el uso de un articulo en borrador (P0001)', () => como(U.asist, () => db.exec(`select registrar_uso_kb_ticket('${tk1}', '${kb1.id}')`)), { code: 'P0001', msg: 'publicados' });
    afirmar('S14 106: lee los usos quien tiene tickets o conocimiento; sin modulos, ninguno', (await como(uSoloKb, () => uno('select count(*)::int n from ticket_kb_usos'))).n >= 1 && (await como(U.sinmod, () => uno('select count(*)::int n from ticket_kb_usos'))).n === 0);
    await falla('S14 106: anon no lee ticket_kb_usos', () => anonimo(() => db.exec('select * from ticket_kb_usos')), { code: '42501' });
    await falla('S14 106: un asistente no inserta usos directo (sin privilegio)', () => como(U.asist, () => db.exec(`insert into ticket_kb_usos (ticket_id, kb_articulo_id) values ('${tk0}', '${wa.id}')`)), { code: '42501' });
    await como(U.asist, () => db.exec(`delete from ticket_kb_usos where ticket_id = '${tk1}'`));
    afirmar('S14 106: un asistente no borra usos (RLS: solo el jefe)', (await uno(`select count(*)::int n from ticket_kb_usos where ticket_id = '${tk1}'`)).n === 1);
    const kpi = await como(U.asist, () => uno(`select usos_90d, usos_total from v_kpi_kb where kb_articulo_id = '${wa.id}'`));
    afirmar('S14 106: v_kpi_kb cuenta el uso para quien tiene la KB', kpi && kpi.usos_90d === 1 && kpi.usos_total === 1, JSON.stringify(kpi));
    afirmar('S14 106: v_kpi_kb hereda la RLS (sin modulos no ve ningun articulo)', (await como(U.sinmod, () => uno('select count(*)::int n from v_kpi_kb'))).n === 0);
    await falla('S14 106: anon no lee v_kpi_kb', () => anonimo(() => db.exec('select * from v_kpi_kb')), { code: '42501' });

    // cerrar un error conocido: el trigger responde igual con sesion
    await como(U.asist, () => db.exec(`update problemas set estado = 'diagnostico' where id = '${prK}'`));
    await como(U.asist, () => db.exec(`update problemas set estado = 'acciones' where id = '${prK}'`));
    await como(U.asist, () => db.exec(`update problemas set estado = 'cerrado' where id = '${prK}'`));
    afirmar('S14 106: un error conocido con workaround publicado se cierra', (await uno(`select estado from problemas where id = '${prK}'`)).estado === 'cerrado');
    await como(U.jefe, () => db.exec(`delete from ticket_kb_usos where ticket_id = '${tk1}'`));
    afirmar('S14 106: el jefe si borra usos', (await uno(`select count(*)::int n from ticket_kb_usos where ticket_id = '${tk1}'`)).n === 0);
  }

  // ---- S15 107: servicios y cambios con sesiones reales (RLS, permisos por rol, actor y rol en el libro, vistas)
  if ((await uno("select to_regclass('public.cambios') as t")).t) {
    const sv = `sv${sfx}`;
    afirmar('S15 107: un asistente lee el catalogo de servicios sembrado (10)', (await como(U.asist, () => uno('select count(*)::int n from servicios'))).n === 10);
    afirmar('S15 107: staff inactivo no lee servicios', (await como(U.inact, () => uno('select count(*)::int n from servicios'))).n === 0);
    await falla('S15 107: anon no lee servicios', () => anonimo(() => db.exec('select * from servicios')), { code: '42501' });
    await falla('S15 107: un asistente no inserta servicios (RLS 42501)', () => como(U.asist, () => db.exec(`insert into servicios (id, nombre) values ('${sv}', 'No')`)), { code: '42501' });
    await como(U.asist, () => db.exec("update servicios set nombre = 'Hackeado' where id = 'correo'"));
    afirmar('S15 107: un asistente no edita servicios (0 filas)', (await uno("select nombre from servicios where id = 'correo'")).nombre === 'Correo corporativo');
    await como(U.asist, () => db.exec("delete from servicios where id = 'vpn'"));
    afirmar('S15 107: un asistente no borra servicios (0 filas)', (await uno("select count(*)::int n from servicios where id = 'vpn'")).n === 1);
    await como(U.jefe, () => db.exec(`insert into servicios (id, nombre, criticidad, horario) values ('${sv}', 'Servicio ${sfx}', 'alta', '24 x 7')`));
    afirmar('S15 107: el jefe inserta servicios y queda como autor', (await uno(`select created_by from servicios where id = '${sv}'`)).created_by === U.jefe);
    await como(U.jefe, () => db.exec(`update servicios set deleted_at = now() where id = '${sv}'`));
    afirmar('S15 107: el jefe da de baja un servicio (queda como ultimo editor)', (await uno(`select updated_by, deleted_at from servicios where id = '${sv}'`)).updated_by === U.jefe);
    afirmar('S15 107: cualquier staff lee la whitelist de transiciones; sin sesion de staff no', (await como(U.sinmod, () => uno('select count(*)::int n from transiciones_cambio_permitidas'))).n === 14 && (await como(U.inact, () => uno('select count(*)::int n from transiciones_cambio_permitidas'))).n === 0);

    // ---- crear, permisos y lectura
    const crear = (uid, extra = '') => como(uid, () => uno(`select * from crear_cambio('Cambio ${sfx}', 'normal', 'medio', 'correo', 'Descripcion', 'Plan de retroceso', now() + interval '1 day', now() + interval '2 days'${extra})`));
    const ch = await crear(U.asist, ', true');
    afirmar('S15 107: un asistente con el modulo tickets crea y solicita un cambio; queda como solicitante', ch.estado === 'solicitado' && ch.solicitado_por === U.asist && /^CHG-[0-9]{4,}$/.test(ch.codigo), JSON.stringify(ch));
    await falla('S15 107: sin el modulo tickets crear_cambio da 42501', () => como(U.sinmod, () => db.exec("select crear_cambio('Titulo', 'normal', 'bajo', 'correo', 'd')")), { code: '42501', msg: 'No autorizado' });
    await falla('S15 107: staff inactivo no crea cambios', () => como(U.inact, () => db.exec("select crear_cambio('Titulo', 'normal', 'bajo', 'correo', 'd')")), { code: '42501' });
    await falla('S15 107: anon no ejecuta crear_cambio', () => anonimo(() => db.exec("select crear_cambio('Titulo', 'normal', 'bajo', 'correo', 'd')")), { code: '42501' });
    await falla('S15 107: authenticated no ejecuta un nucleo (project_admin only)', () => como(U.jefe, () => db.exec("select crear_cambio_nucleo('Titulo', 'normal', 'bajo', 'correo', 'd', null, null, null, false, null, true)")), { code: '42501' });
    await falla('S15 107: authenticated no escribe el libro directo', () => como(U.jefe, () => db.exec(`select registrar_evento_cambio('${ch.id}', 'editado', null, null, null, null, 'jefe')`)), { code: '42501' });
    afirmar('S15 107: lee los cambios quien tiene tickets; sin el modulo no ve cambios, libro ni enlaces',
      (await como(U.asist, () => uno('select count(*)::int n from cambios'))).n >= 1
      && (await como(U.sinmod, () => uno('select count(*)::int n from cambios'))).n === 0
      && (await como(U.sinmod, () => uno('select count(*)::int n from cambio_eventos'))).n === 0
      && (await como(U.sinmod, () => uno('select count(*)::int n from cambio_tickets'))).n === 0);
    await falla('S15 107: anon no lee cambios', () => anonimo(() => db.exec('select * from cambios')), { code: '42501' });
    await falla('S15 107: un asistente no inserta en cambios (sin privilegio)', () => como(U.asist, () => db.exec(`insert into cambios (titulo, tipo, riesgo, servicio_id, descripcion) values ('Directo', 'normal', 'bajo', 'correo', 'd')`)), { code: '42501' });
    await falla('S15 107: ni el jefe actualiza cambios directo', () => como(U.jefe, () => db.exec(`update cambios set resultado = 'x' where id = '${ch.id}'`)), { code: '42501' });
    await falla('S15 107: ni el jefe borra cambios', () => como(U.jefe, () => db.exec(`delete from cambios where id = '${ch.id}'`)), { code: '42501' });
    await falla('S15 107: nadie escribe el libro directo', () => como(U.jefe, () => db.exec(`insert into cambio_eventos (cambio_id, evento, rol_actor) values ('${ch.id}', 'editado', 'jefe')`)), { code: '42501' });

    // ---- aprobar: solo el jefe, y el libro registra al de la sesion
    await falla('S15 107: un asistente no aprueba (aprobar_cambio da 42501)', () => como(U.asist, () => db.exec(`select aprobar_cambio('${ch.id}')`)), { code: '42501', msg: 'No autorizado' });
    await falla('S15 107: un asistente no rechaza (rechazar_cambio da 42501)', () => como(U.asist, () => db.exec(`select rechazar_cambio('${ch.id}', 'No')`)), { code: '42501' });
    await falla('S15 107: transicionar a aprobado como asistente es P0001 (solo un jefe)', () => como(U.asist, () => db.exec(`select transicionar_cambio('${ch.id}', 'aprobado')`)), { code: 'P0001', msg: 'Solo un jefe' });
    await falla('S15 107: sin el modulo tickets transicionar_cambio da 42501', () => como(U.sinmod, () => db.exec(`select transicionar_cambio('${ch.id}', 'cancelado', 'x')`)), { code: '42501' });
    const ap = await como(U.jefe, () => uno(`select * from aprobar_cambio('${ch.id}', 'Autorizado')`));
    afirmar('S15 107: el jefe aprueba y queda como aprobador', ap.estado === 'aprobado' && ap.aprobado_por === U.jefe && ap.aprobado_at !== null, JSON.stringify(ap));
    await como(U.asist, () => db.exec(`select transicionar_cambio('${ch.id}', 'en_ejecucion')`));
    const imp = await como(U.asist, () => uno(`select * from transicionar_cambio('${ch.id}', 'implementado', 'Todo en orden')`));
    afirmar('S15 107: un asistente ejecuta e implementa; el resultado queda', imp.estado === 'implementado' && imp.resultado === 'Todo en orden' && imp.inicio_real_at !== null && imp.fin_real_at !== null, JSON.stringify(imp));
    const evs = await q(`select evento, rol_actor, user_id from cambio_eventos where cambio_id = '${ch.id}' order by orden`);
    afirmar('S15 107: el libro registra evento, actor y rol de cada sesion', evs.map((e) => e.evento).join() === 'creado,solicitado,aprobado,iniciado,implementado'
      && evs[0].rol_actor === 'tecnico' && evs[0].user_id === U.asist && evs[2].rol_actor === 'jefe' && evs[2].user_id === U.jefe, JSON.stringify(evs));
    await falla('S15 107: rechazar un cambio ya aprobado es P0001', () => como(U.jefe, () => db.exec(`select rechazar_cambio('${ch.id}', 'tarde')`)), { code: 'P0001' });

    // ---- editar un borrador y vincular tickets
    const bor = await crear(U.asist);
    const ed = await como(U.asist, () => uno(`select * from actualizar_cambio('${bor.id}', 'Cambio editado ${sfx}', 'normal', 'alto', 'red', 'Nueva descripcion', 'Plan B', now() + interval '3 days', now() + interval '4 days')`));
    afirmar('S15 107: un asistente edita su borrador', ed.titulo === `Cambio editado ${sfx}` && ed.servicio_id === 'red' && ed.riesgo === 'alto' && ed.estado === 'borrador', JSON.stringify(ed));
    await falla('S15 107: sin el modulo tickets actualizar_cambio da 42501', () => como(U.sinmod, () => db.exec(`select actualizar_cambio('${bor.id}', 'T', 'normal', 'bajo', 'red', 'd')`)), { code: '42501' });
    const tk = (await uno(`insert into tickets (codigo, token, titulo, descripcion, estado) values ('C${sfx}', '${('c' + sfx).padEnd(24, 'x')}', 'Ticket del cambio', 'Descripcion', 'abierto') returning id`)).id;
    const vin = await como(U.asist, () => uno(`select * from vincular_cambio_ticket('${bor.id}', '${tk}')`));
    afirmar('S15 107: vincular un ticket deja al de la sesion y no toca el ticket', vin.vinculado_por === U.asist && (await uno(`select estado from tickets where id = '${tk}'`)).estado === 'abierto', JSON.stringify(vin));
    await falla('S15 107: sin el modulo tickets vincular_cambio_ticket da 42501', () => como(U.sinmod, () => db.exec(`select vincular_cambio_ticket('${bor.id}', '${tk}')`)), { code: '42501' });
    afirmar('S15 107: el enlace se lee con el modulo tickets', (await como(U.asist, () => uno(`select count(*)::int n from cambio_tickets where cambio_id = '${bor.id}'`))).n === 1);
    afirmar('S15 107: desvincular devuelve true y luego false', (await como(U.asist, () => uno(`select desvincular_cambio_ticket('${bor.id}', '${tk}') as v`))).v === true && (await como(U.asist, () => uno(`select desvincular_cambio_ticket('${bor.id}', '${tk}') as v`))).v === false);

    // ---- emergencia: corre sin aprobacion, plazo de 48 h, vistas con RLS y aprobacion a posteriori
    const em = await como(U.asist, () => uno(`select * from crear_cambio('Emergencia ${sfx}', 'emergencia', 'alto', 'red', 'Caida', 'Volver al enlace anterior')`));
    const emE = await como(U.asist, () => uno(`select * from transicionar_cambio('${em.id}', 'en_ejecucion')`));
    afirmar('S15 107: la emergencia corre sin aprobacion previa y queda con su plazo', emE.estado === 'en_ejecucion' && emE.aprobado_por === null && emE.aprobacion_pendiente_hasta !== null, JSON.stringify(emE));
    afirmar('S15 107: dentro del plazo no figura como vencida', (await como(U.asist, () => uno(`select count(*)::int n from v_cambios_aprobacion_vencida where cambio_id = '${em.id}'`))).n === 0);
    await db.exec(`update cambios set aprobacion_pendiente_hasta = now() - interval '1 hour' where id = '${em.id}'`);
    afirmar('S15 107: vencido el plazo la vista la lista para quien tiene tickets y no para quien no lo tiene',
      (await como(U.asist, () => uno(`select count(*)::int n from v_cambios_aprobacion_vencida where cambio_id = '${em.id}'`))).n === 1
      && (await como(U.sinmod, () => uno('select count(*)::int n from v_cambios_aprobacion_vencida'))).n === 0);
    afirmar('S15 107: v_kpi_cambios cuenta la emergencia vencida para el asistente y devuelve ceros sin el modulo',
      (await como(U.asist, () => uno("select emergencias_sin_aprobar_vencidas::int n from v_kpi_cambios where tipo = 'emergencia'"))).n >= 1
      && (await como(U.sinmod, () => uno('select coalesce(sum(total_90d), 0)::int n from v_kpi_cambios'))).n === 0
      && (await como(U.sinmod, () => uno('select count(*)::int n from v_kpi_cambios'))).n === 3);
    await falla('S15 107: anon no lee v_kpi_cambios', () => anonimo(() => db.exec('select * from v_kpi_cambios')), { code: '42501' });
    await como(U.asist, () => db.exec(`select transicionar_cambio('${em.id}', 'implementado', 'Enlace restablecido')`));
    await falla('S15 107: la emergencia sin aprobar no se cierra (P0001)', () => como(U.asist, () => db.exec(`select transicionar_cambio('${em.id}', 'cerrado')`)), { code: 'P0001', msg: 'a posteriori' });
    await falla('S15 107: un asistente no da la aprobacion a posteriori (42501)', () => como(U.asist, () => db.exec(`select aprobar_cambio('${em.id}')`)), { code: '42501' });
    const emA = await como(U.jefe, () => uno(`select * from aprobar_cambio('${em.id}', 'Se entiende la urgencia')`));
    afirmar('S15 107: el jefe aprueba a posteriori sin cambiar el estado y se limpia el plazo', emA.estado === 'implementado' && emA.aprobado_por === U.jefe && emA.aprobacion_pendiente_hasta === null, JSON.stringify(emA));
    const emC = await como(U.asist, () => uno(`select * from transicionar_cambio('${em.id}', 'cerrado')`));
    afirmar('S15 107: aprobada, la emergencia cierra', emC.estado === 'cerrado');
    afirmar('S15 107: ya no figura entre las vencidas', (await como(U.jefe, () => uno(`select count(*)::int n from v_cambios_aprobacion_vencida where cambio_id = '${em.id}'`))).n === 0);

    // ---- tracking de despliegues: cambio_id texto, sin FK a cambios
    await db.exec(`insert into schema_migrations (version, nombre_archivo, checksum, aplicada_por, cambio_id) values ('s15${sfx}', 's15.sql', 'x', 'harness', 'CHG-9999')`);
    afirmar('S15 107: schema_migrations guarda un cambio_id aunque ese cambio no exista', (await uno(`select cambio_id from schema_migrations where version = 's15${sfx}'`)).cambio_id === 'CHG-9999');
  }

  // ---- S16 109: portal del empleado por enlace firmado, con sesiones reales (guard, privilegios por columna, hash, un solo enlace, aislamiento)
  if ((await uno("select to_regclass('public.empleado_enlaces') as t")).t) {
    const NADA = { ok: false, code: 'no_existe' };
    const abrir = async (tok, ip = null) => (await uno(`select portal_abrir(${tok === null ? 'null' : `'${tok}'`}, ${ip ? `'${ip}'` : 'null'}) as j`)).j;
    const confirmar = async (tok, asig) => (await uno(`select portal_confirmar_equipo('${tok}', ${asig ? `'${asig}'` : 'null'}) as j`)).j;
    const P1 = await mkEmp('Portal1'), P2 = await mkEmp('Portal2');
    const eqP1 = await mkEq('PA'), eqP2 = await mkEq('PB'), eqP3 = await mkEq('PC'), eqLibre = await mkEq('PL');
    const aP1 = await como(U.asist, () => uno(`select * from asignar_equipo('${eqP1}', '${P1}', 'bueno')`));
    const aP1b = await como(U.asist, () => uno(`select * from asignar_equipo('${eqP3}', '${P1}', 'bueno')`));
    const aP2 = await como(U.asist, () => uno(`select * from asignar_equipo('${eqP2}', '${P2}', 'bueno')`));
    await crearCuenta(U.asist, `portal1-${sfx}@x.test`, P1, 'personal');
    await crearCuenta(U.asist, `portal2-${sfx}@x.test`, P2, 'personal');

    // emitir: guard por modulo, estado y argumentos
    await falla('S16 109: sin el modulo empleados emitir un enlace da 42501', () => como(U.sinmod, () => db.exec(`select portal_emitir_enlace('${P1}')`)), { code: '42501', msg: 'No autorizado' });
    await falla('S16 109: staff inactivo no emite enlaces', () => como(U.inact, () => db.exec(`select portal_emitir_enlace('${P1}')`)), { code: '42501' });
    await falla('S16 109: anon no ejecuta portal_emitir_enlace', () => anonimo(() => db.exec(`select portal_emitir_enlace('${P1}')`)), { code: '42501' });
    await falla('S16 109: a un empleado Inactivo no se le emite enlace (P0001)', () => como(U.asist, () => db.exec(`select portal_emitir_enlace('${E.baja}')`)), { code: 'P0001', msg: 'Activo' });
    await falla('S16 109: un empleado inexistente es P0002', () => como(U.asist, () => db.exec("select portal_emitir_enlace('00000000-0000-0000-0000-000000000000')")), { code: 'P0002' });
    await falla('S16 109: un alcance desconocido es P0001', () => como(U.asist, () => db.exec(`select portal_emitir_enlace('${P1}', array['ver_equipos','inventado'])`)), { code: 'P0001', msg: 'alcance' });
    await falla('S16 109: confirmar_ticket (pendiente de V2) no es un alcance valido', () => como(U.asist, () => db.exec(`select portal_emitir_enlace('${P1}', array['confirmar_ticket'])`)), { code: 'P0001' });
    await falla('S16 109: vigencia de 0 dias es P0001', () => como(U.asist, () => db.exec(`select portal_emitir_enlace('${P1}', null, 0)`)), { code: 'P0001', msg: 'vigencia' });
    await falla('S16 109: vigencia de 31 dias es P0001', () => como(U.asist, () => db.exec(`select portal_emitir_enlace('${P1}', null, 31)`)), { code: 'P0001', msg: 'vigencia' });
    afirmar('S16 109: los intentos rechazados no dejaron ningun enlace', (await uno(`select count(*)::int n from empleado_enlaces where empleado_id in ('${P1}', '${E.baja}')`)).n === 0);

    // emision valida: token de 144 bits en base64url, solo se guarda su hash, auditoria sin token
    const em1 = (await como(U.asist, () => uno(`select portal_emitir_enlace('${P1}') as j`))).j;
    afirmar('S16 109: emitir devuelve ok, token de 24 caracteres base64url, alcance completo y 7 dias', em1.ok === true && /^[A-Za-z0-9_-]{24}$/.test(em1.token) && em1.dias === 7 && em1.alcance.length === 4, JSON.stringify({ ...em1, token: '...' }));
    const fila1 = await uno(`select * from empleado_enlaces where id = '${em1.id}'`);
    const hashEsperado = (await uno(`select encode(sha256(convert_to('${em1.token}', 'UTF8')), 'hex') h`)).h;
    afirmar('S16 109: se guarda sha256(token) y NUNCA el token', fila1.token_hash === hashEsperado && fila1.token_hash !== em1.token, fila1.token_hash);
    afirmar('S16 109: el token no aparece en ninguna columna del enlace ni de la auditoria', (await uno(`select count(*)::int n from empleado_enlaces e where e::text like '%${em1.token}%'`)).n === 0
      && (await uno(`select count(*)::int n from accesos_log l where l::text like '%${em1.token}%'`)).n === 0);
    const dias1 = (await uno(`select extract(epoch from (expires_at - created_at)) / 86400 as d from empleado_enlaces where id = '${em1.id}'`)).d;
    afirmar('S16 109: la vigencia por defecto es la del parametro (7 dias)', Math.round(Number(dias1)) === 7, String(dias1));
    const logE = await q(`select user_id, cuenta_usuario, detalle from accesos_log where accion = 'enviar' and cuenta_usuario = '(portal)' and detalle like '%Portal1 Esc ${sfx} (7 d; alcance: ver_accesos, ver_equipos, ver_tickets, confirmar_equipo)'`);
    afirmar('S16 109: emitir audita "enviar" con el actor de la sesion', logE.length === 1 && logE[0].user_id === U.asist, JSON.stringify(logE));

    // el portal abre con ese token; cualquier otro da lo mismo
    const ab1 = await abrir(em1.token, '198.51.100.4');
    afirmar('S16 109: el portal abre con el token emitido y muestra solo lo del empleado', ab1.ok === true && ab1.equipos.length === 2 && ab1.accesos.length === 1 && ab1.accesos[0].usuario === `portal1-${sfx}@x.test` && !JSON.stringify(ab1).includes(`portal2-${sfx}`), JSON.stringify(ab1));
    afirmar('S16 109: la respuesta del portal no lleva contrasena, URL ni notas', !/enc2:|password|"url"|"notas"/i.test(JSON.stringify(ab1)));
    afirmar('S16 109: token inexistente, hash del token y token nulo dan la misma respuesta', JSON.stringify(await abrir('ZZZZZZZZZZZZZZZZZZZZZZZZ')) === JSON.stringify(NADA) && JSON.stringify(await abrir(hashEsperado)) === JSON.stringify(NADA) && JSON.stringify(await abrir(null)) === JSON.stringify(NADA));

    // un solo enlace activo: re-emitir revoca el anterior
    const em2 = (await como(U.asist, () => uno(`select portal_emitir_enlace('${P1}', array['ver_accesos'], 30) as j`))).j;
    afirmar('S16 109: re-emitir da otro token, otro alcance y 30 dias', em2.token !== em1.token && em2.alcance.join() === 'ver_accesos' && em2.dias === 30);
    afirmar('S16 109: queda UN solo enlace sin revocar por empleado', (await uno(`select count(*)::int n from empleado_enlaces where empleado_id = '${P1}' and revocado_at is null`)).n === 1 && (await uno(`select count(*)::int n from empleado_enlaces where empleado_id = '${P1}'`)).n === 2);
    afirmar('S16 109: el token anterior ya no abre (misma respuesta que uno inexistente)', JSON.stringify(await abrir(em1.token)) === JSON.stringify(NADA));
    const ab2 = await abrir(em2.token);
    afirmar('S16 109: el alcance reducido solo devuelve accesos', ab2.ok === true && 'accesos' in ab2 && !('equipos' in ab2) && !('tickets' in ab2));
    // confirmar_equipo implica ver_equipos
    const emC = (await como(U.asist, () => uno(`select portal_emitir_enlace('${P1}', array['confirmar_equipo']) as j`))).j;
    afirmar('S16 109: confirmar_equipo suma ver_equipos al alcance', emC.alcance.join() === 'confirmar_equipo,ver_equipos', emC.alcance.join());

    // otro empleado: token distinto, aislamiento
    const emP2 = (await como(U.asist, () => uno(`select portal_emitir_enlace('${P2}') as j`))).j;
    afirmar('S16 109: dos empleados no comparten token', emP2.token !== emC.token && emP2.token !== em1.token);
    const abP2 = await abrir(emP2.token);
    afirmar('S16 109: el enlace del otro empleado no ve nada del primero', abP2.ok === true && !JSON.stringify(abP2).includes(`portal1-${sfx}`) && !JSON.stringify(abP2).includes(eqP1) && abP2.equipos.length === 1 && abP2.equipos[0].asignacion_id === aP2.id);

    // confirmar equipo: solo los propios; el cliente no puede falsear ni borrar la confirmacion
    afirmar('S16 109: confirmar el equipo de OTRO empleado se rechaza (no_encontrada)', (await confirmar(emC.token, aP2.id)).code === 'no_encontrada' && (await uno(`select confirmado_por_empleado_at c from asignaciones_equipo where id = '${aP2.id}'`)).c === null);
    const cf = await confirmar(emC.token, aP1.id);
    afirmar('S16 109: confirmar el propio equipo registra fecha, enlace y evento', cf.ok === true && cf.ya_confirmada === false
      && (await uno(`select confirmacion_enlace_id e from asignaciones_equipo where id = '${aP1.id}'`)).e === emC.id
      && (await uno(`select count(*)::int n from eventos_equipo where equipo_id = '${eqP1}' and evento = 'recepcion_confirmada'`)).n === 1);
    afirmar('S16 109: confirmar dos veces es idempotente', (await confirmar(emC.token, aP1.id)).ya_confirmada === true && (await uno(`select count(*)::int n from eventos_equipo where equipo_id = '${eqP1}' and evento = 'recepcion_confirmada'`)).n === 1);
    await falla('S16 109: ni el jefe fabrica una confirmacion con un UPDATE (42501)', () => como(U.jefe, () => db.exec(`update asignaciones_equipo set confirmado_por_empleado_at = now() where id = '${aP2.id}'`)), { code: '42501' });
    await falla('S16 109: ni el jefe borra una confirmacion con un UPDATE (42501)', () => como(U.jefe, () => db.exec(`update asignaciones_equipo set confirmado_por_empleado_at = null where id = '${aP1.id}'`)), { code: '42501' });
    await falla('S16 109: ni un INSERT directo trae la confirmacion hecha (42501)', () => como(U.jefe, () => db.exec(`insert into asignaciones_equipo (equipo_id, empleado_id, confirmado_por_empleado_at) values ('${eqLibre}', '${P2}', now())`)), { code: '42501' });
    afirmar('S16 109: la confirmacion de P1 sigue intacta tras los intentos del jefe', (await uno(`select confirmado_por_empleado_at c from asignaciones_equipo where id = '${aP1.id}'`)).c !== null);
    await como(U.asist, () => db.exec(`select devolver_equipo('${aP1.id}', 'bueno', 'devolucion', false)`));
    afirmar('S16 109: devolver un equipo ya confirmado funciona y conserva la confirmacion', (await uno(`select fecha_fin is not null f, confirmado_por_empleado_at is not null c from asignaciones_equipo where id = '${aP1.id}'`)).f === true && (await uno(`select confirmado_por_empleado_at is not null c from asignaciones_equipo where id = '${aP1.id}'`)).c === true);
    afirmar('S16 109: una asignacion devuelta ya no se confirma', (await confirmar(emC.token, aP1.id)).code === 'no_encontrada' && (await confirmar(emC.token, aP1b.id)).ok === true);

    // privilegios por columna y RLS de lectura para el staff
    await falla('S16 109: el staff no lee token_hash (42501)', () => como(U.asist, () => db.exec('select token_hash from empleado_enlaces')), { code: '42501' });
    await falla('S16 109: el staff no lee ultimo_ip (42501)', () => como(U.jefe, () => db.exec('select ultimo_ip from empleado_enlaces')), { code: '42501' });
    await falla('S16 109: select * tampoco (incluye columnas secretas)', () => como(U.jefe, () => db.exec('select * from empleado_enlaces')), { code: '42501' });
    afirmar('S16 109: con el modulo empleados se lee el estado del enlace (columnas no secretas)', (await como(U.asist, () => uno(`select count(*)::int n from empleado_enlaces where empleado_id = '${P1}' and revocado_at is null`))).n === 1);
    afirmar('S16 109: sin el modulo empleados no se ve ningun enlace', (await como(U.sinmod, () => uno('select count(id)::int n from empleado_enlaces'))).n === 0);
    await falla('S16 109: anon no lee empleado_enlaces', () => anonimo(() => db.exec('select id from empleado_enlaces')), { code: '42501' });
    await falla('S16 109: ni el jefe inserta directo en empleado_enlaces', () => como(U.jefe, () => db.exec(`insert into empleado_enlaces (empleado_id, token_hash, alcance, expires_at) values ('${P2}', '${'f'.repeat(64)}', array['ver_equipos'], now() + interval '1 day')`)), { code: '42501' });
    await falla('S16 109: ni el jefe actualiza empleado_enlaces', () => como(U.jefe, () => db.exec(`update empleado_enlaces set revocado_at = null where empleado_id = '${P2}'`)), { code: '42501' });
    await falla('S16 109: ni el jefe borra empleado_enlaces', () => como(U.jefe, () => db.exec(`delete from empleado_enlaces where empleado_id = '${P2}'`)), { code: '42501' });

    // las RPC del portal no son accesibles desde un navegador
    await falla('S16 109: authenticated no ejecuta portal_abrir', () => como(U.jefe, () => db.exec(`select portal_abrir('${emP2.token}')`)), { code: '42501' });
    await falla('S16 109: anon no ejecuta portal_abrir', () => anonimo(() => db.exec(`select portal_abrir('${emP2.token}')`)), { code: '42501' });
    await falla('S16 109: authenticated no ejecuta portal_confirmar_equipo', () => como(U.jefe, () => db.exec(`select portal_confirmar_equipo('${emP2.token}', '${aP2.id}')`)), { code: '42501' });
    await falla('S16 109: authenticated no ejecuta portal_resolver_enlace', () => como(U.jefe, () => db.exec(`select portal_resolver_enlace('${emP2.token}')`)), { code: '42501' });

    // revocar
    await falla('S16 109: sin el modulo empleados revocar da 42501', () => como(U.sinmod, () => db.exec(`select portal_revocar_enlace('${P2}')`)), { code: '42501', msg: 'No autorizado' });
    await falla('S16 109: anon no revoca', () => anonimo(() => db.exec(`select portal_revocar_enlace('${P2}')`)), { code: '42501' });
    afirmar('S16 109: revocar devuelve true la primera vez y false la segunda', (await como(U.asist, () => uno(`select portal_revocar_enlace('${P2}') as v`))).v === true && (await como(U.asist, () => uno(`select portal_revocar_enlace('${P2}') as v`))).v === false);
    afirmar('S16 109: un enlace revocado da la misma respuesta que uno inexistente', JSON.stringify(await abrir(emP2.token)) === JSON.stringify(NADA) && JSON.stringify(await confirmar(emP2.token, aP2.id)) === JSON.stringify(NADA));
    afirmar('S16 109: revocar audita "permiso_revocado" con el actor', (await uno(`select count(*)::int n from accesos_log where accion = 'permiso_revocado' and cuenta_usuario = '(portal)' and user_id = '${U.asist}'`)).n === 1);

    // pasar a Suspendido revoca; reactivar no lo revive
    const emS = (await como(U.asist, () => uno(`select portal_emitir_enlace('${P2}') as j`))).j;
    afirmar('S16 109: tras revocar se puede emitir uno nuevo y abre', (await abrir(emS.token)).ok === true);
    await como(U.asist, () => db.exec(`select suspender_empleado('${P2}', 'Prueba portal')`));
    afirmar('S16 109: suspender al empleado revoca su enlace', JSON.stringify(await abrir(emS.token)) === JSON.stringify(NADA));
    await como(U.asist, () => db.exec(`select reactivar_empleado('${P2}')`));
    afirmar('S16 109: reactivarlo no revive el enlace viejo', JSON.stringify(await abrir(emS.token)) === JSON.stringify(NADA));
    afirmar('S16 109: se puede emitir uno nuevo al reactivarlo', (await abrir((await como(U.asist, () => uno(`select portal_emitir_enlace('${P2}') as j`))).j.token)).ok === true);

    // ningun token (ni en claro ni en la bitacora) quedo guardado
    const tokens = [em1.token, em2.token, emC.token, emP2.token, emS.token];
    let rastro = 0;
    for (const t of tokens) rastro += (await uno(`select count(*)::int n from accesos_log l where l::text like '%${t}%'`)).n + (await uno(`select count(*)::int n from empleado_enlaces e where e::text like '%${t}%'`)).n + (await uno(`select count(*)::int n from eventos_equipo x where x::text like '%${t}%'`)).n;
    afirmar('S16 109: ningun token emitido aparece en accesos_log, empleado_enlaces ni eventos_equipo', rastro === 0, String(rastro));
    afirmar('S16 109: los 5 tokens emitidos son distintos', new Set(tokens).size === 5);
  }

  console.log(`   escenarios (${etiqueta}): ${esc.ok} afirmaciones OK, ${esc.mal.length} MAL`);
  reg(`escenarios integrados (${etiqueta}): ${esc.ok} afirmaciones`, esc.mal.length === 0, esc.mal.join(' || '));
}

// ---------------------------------------------------------------- siembra "tipo produccion" ANTES de aplicar las nuevas
// Reproduce la FORMA de los datos reales que las cabeceras de 099/100/101/102 dicen haber verificado el 2026-10-01
// (no los datos): 1 DNI de 9 digitos, motivos 'entrega a empleado' con espacios, un portador activo por equipo,
// cuentas personales y reutilizables con asignacion, tokens de ticket de 24 caracteres, notificaciones y logs con
// las acciones/tipos historicos, un problema abierto. Asi los backfills, normalizaciones y CHECK se ejercen con filas.
const SIEMBRA = { info: {} };
async function sembrarDatosTipoProduccion() {
  const uno1 = async (sql) => (await q(sql))[0];
  const sx = 'prod';
  const empresa = (await uno1(`insert into empresas (nombre) values ('Empresa ${sx}') returning id`)).id;
  const emps = [];
  for (let i = 0; i < 6; i++) {
    const dni = i === 5 ? '123456789' : String(70000000 + i); // el empleado 5 tiene un DNI de 9 digitos (el unico fuera de formato en produccion)
    const estado = i === 4 ? 'Inactivo' : 'Activo';
    emps.push((await uno1(`insert into empleados (nombres, apellidos, dni, empresa_id, estado) values ('Emp${i}', 'Prod', '${dni}', '${empresa}', '${estado}') returning id`)).id);
  }
  SIEMBRA.empBadDni = emps[5];
  await db.exec(`insert into plataformas (id, nombre) values ('gmail', 'Gmail'), ('zoom', 'Zoom') on conflict do nothing`);
  await db.exec(`insert into tipos_equipo (id, nombre) values ('laptop', 'Laptop') on conflict do nothing`);
  const eqs = [];
  for (let i = 0; i < 5; i++) eqs.push((await uno1(`insert into equipos (codigo, tipo_id) values ('PROD-${i}', 'laptop') returning id`)).id);
  // asignaciones: 3 cerradas (motivos historicos, uno con espacios) y 2 activas
  const mot = ['entrega a empleado', 'devolucion', 'baja_empleado'];
  for (let i = 0; i < 3; i++) {
    await db.exec(`insert into asignaciones_equipo (equipo_id, empleado_id, fecha_inicio, fecha_fin, motivo_cierre) values ('${eqs[i]}', '${emps[i]}', current_date - 10, current_date - 1, '${mot[i]}')`);
  }
  await db.exec(`insert into asignaciones_equipo (equipo_id, empleado_id) values ('${eqs[3]}', '${emps[0]}'), ('${eqs[4]}', '${emps[1]}')`);
  // cuentas personal/reutilizable con asignacion
  const cp = (await uno1(`insert into cuentas (plataforma_id, usuario, password, tipo_cuenta) values ('gmail', 'p@prod.test', 'enc2:AAAA:BBBB', 'personal') returning id`)).id;
  const cr = (await uno1(`insert into cuentas (plataforma_id, usuario, password, tipo_cuenta, requiere_rotacion) values ('zoom', 'r@prod.test', 'enc2:AAAA:BBBB', 'reutilizable', true) returning id`)).id;
  await db.exec(`insert into asignaciones_cuenta (cuenta_id, empleado_id) values ('${cp}', '${emps[0]}'), ('${cr}', '${emps[1]}')`);
  const lic = (await uno1(`insert into licencias (software, tipo, cantidad) values ('Office', 'suscripcion', 3) returning id`)).id;
  await db.exec(`insert into asignaciones_licencia (licencia_id, empleado_id) values ('${lic}', '${emps[0]}')`);
  for (let i = 0; i < 3; i++) {
    const tok = Buffer.from(`token-${i}-xxxxxxxxxxxxxxxxxx`).toString('base64url').slice(0, 24);
    await db.exec(`insert into tickets (codigo, token, titulo, descripcion, origen, estado, prioridad) values ('TCK-9${i}', '${tok}', 'T${i}', 'D', 'empleado', 'abierto', 'media')`);
  }
  await db.exec(`insert into accesos_log (cuenta_usuario, accion) values ('x', 'ver'), ('x', 'copiar'), ('x', 'enviar'), ('x', 'entrega_abierta'), ('x', 'entrega_fallida'), ('x', 'permiso_otorgado'), ('x', 'permiso_revocado'), ('x', 'creado'), ('x', 'eliminado')`);
  for (const t of ['ticket_creado', 'cuenta_creada', 'empleado_alta', 'empleado_baja', 'ticket_asignado', 'ticket_estado_cambiado', 'ticket_comentario_nuevo', 'ticket_correo_fallido']) {
    await db.exec(`insert into notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino) values ('${t}', 'x', gen_random_uuid(), 't', '/')`);
  }
  await db.exec(`insert into problemas (titulo, descripcion, estado, severidad) values ('P1', 'd', 'abierto', 'media')`);
  SIEMBRA.info = { empleados: emps.length, equipos: eqs.length };
  return SIEMBRA;
}

// Comprobaciones sobre los datos sembrados tras aplicar 099..110 (normalizaciones, CHECK NOT VALID, backfill)
async function comprobarDatosSembrados() {
  const e0 = esc.mal.length;
  esc.ok = 0; esc.mal = [];
  const uno2 = async (sql) => (await q(sql))[0];
  afirmar('D1 100: no quedan motivos "entrega a empleado" con espacios (normalizados a entrega_a_empleado)', (await uno2("select count(*)::int n from asignaciones_equipo where motivo_cierre = 'entrega a empleado'")).n === 0 && (await uno2("select count(*)::int n from asignaciones_equipo where motivo_cierre = 'entrega_a_empleado'")).n >= 1);
  const ck = await q("select conname, convalidated from pg_constraint where conname in ('asignaciones_equipo_motivo_cierre_check','empleados_dni_formato','accesos_log_accion_check','eventos_equipo_evento_check','notificaciones_tipo_check','equipos_fotos_max') order by 1");
  const m = Object.fromEntries(ck.map((r) => [r.conname, r.convalidated]));
  afirmar('D2 100: motivo_cierre, fotos, accesos_log, eventos_equipo y notificaciones validados', m.asignaciones_equipo_motivo_cierre_check && m.equipos_fotos_max && m.accesos_log_accion_check && m.eventos_equipo_evento_check && m.notificaciones_tipo_check, JSON.stringify(m));
  afirmar('D3 100: empleados_dni_formato nace NOT VALID por el DNI de 9 digitos', m.empleados_dni_formato === false, JSON.stringify(m));
  const nEmp = (await uno2('select count(*)::int n from empleados')).n;
  const nCre = (await uno2("select count(*)::int n from empleado_eventos where evento = 'creado' and rol_actor = 'legado'")).n;
  afirmar('D4 102: el backfill deja un evento "creado" legado por cada empleado preexistente', nCre === SIEMBRA.info.empleados, `creados legado=${nCre}, empleados sembrados=${SIEMBRA.info.empleados}, empleados total=${nEmp}`);
  afirmar('D6 099: ticket_token_existe acepta los tokens sembrados de 24 caracteres', (await uno2("select count(*) filter (where ticket_token_existe(token))::int ok, count(*)::int t from tickets")).ok === (await uno2('select count(*)::int t from tickets')).t);
  // hazard conocido y documentado en la cabecera de la 100
  let msg = '';
  try { await db.exec(`select empleado_dar_baja_interno('${SIEMBRA.empBadDni}')`); msg = 'SIN ERROR'; } catch (e) { msg = (e.code || '') + ' ' + (e.message || '').slice(0, 120); }
  console.log('   (hallazgo documentado) dar_baja del empleado con DNI de 9 digitos con el CHECK NOT VALID ->', msg);
  esc.informe = msg;
  const malos = esc.mal.slice(); const oks = esc.ok;
  esc.mal = []; esc.ok = 0;
  reg(`datos tipo produccion tras 099..110: ${oks} comprobaciones`, malos.length === 0, malos.join(' || '));
}

// ---------------------------------------------------------------- baseline de tests (antes de las nuevas)
console.log('=== linea base: los bloques de tests anteriores a 099 deben pasar solo con el esquema historico');
const fotoBase = await foto();
{
  const bloques = bloquesDeTests();
  let ok = 0; const malos = [];
  for (const [i, sql] of bloques.entries()) {
    const tag = (sql.match(/TESTS_OK \[([^\]]+)\]/) || [])[1] || `#${i + 1}`;
    if (/^(099|100|101|102|103|106|107|108|109|110|111|112)/.test(tag)) continue;
    let msg = ''; try { await db.exec(sql); } catch (e) { msg = e.message || ''; }
    if (msg.includes('TESTS_OK')) ok++; else malos.push(`[${tag}] ${msg.slice(0, 300)}`);
  }
  reg(`tests historicos sobre el esquema base: ${ok} bloques OK`, malos.length === 0, malos.join(' || '));
}

globalThis.__db = db; globalThis.__lee = lee; globalThis.__MIG = MIG;
if (opt('--diag-base')) { await import(pathToFileURL(opt('--diag-base')).href); process.exit(0); }
// ---------------------------------------------------------------- (b) aplicar en orden
console.log('=== siembra de datos tipo produccion (antes de aplicar las nuevas)');
await sembrarDatosTipoProduccion();
console.log('=== (b) aplicar 099 -> 100 -> 101 -> 102 -> 103 -> 104 -> 110');
const t0 = Date.now();
for (const n of NUEVAS) await intentar(`aplicar ${n}`, sqlMig(n));
const fotoAplicada = await foto();

if (opt('--diag-aplicado')) { await import(pathToFileURL(opt('--diag-aplicado')).href); process.exit(0); }
// ---------------------------------------------------------------- (c) reaplicar
// ---- ACL / SECURITY DEFINER / search_path / volatilidad de las funciones PREEXISTENTES contra el catalogo de produccion
// (un create or replace conserva el ACL; un drop + create no: aqui se detecta cualquier funcion que cambie de permisos)
if (existsSync(join(aqui, 'db/funciones.json'))) {
  const prodF = JSON.parse(lee(join(aqui, 'db/funciones.json'))).rows.filter((f) => f.lanname !== 'c');
  const loc = new Map((await q("select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, p.prosecdef, p.proacl::text acl, p.proconfig::text cfg, p.provolatile::text vol from pg_proc p where pronamespace='public'::regnamespace and prokind='f'")).map((f) => [f.k, f]));
  const norm = (a) => (a || '').replace(/postgres/g, 'OWNER').replace(/project_admin/g, 'OWNER');
  const cambios = [];
  for (const p of prodF) {
    const l = loc.get(`${p.proname}(${p.args})`);
    if (!l) continue; // no existe local: extensiones (http, vector) o dropeadas por migraciones historicas
    const aclIgual = norm(p.proacl) === norm(l.acl) || (l.acl === null && /^\{=X\//.test(p.proacl || '')); // NULL = EXECUTE a PUBLIC por defecto
    if (!aclIgual || p.prosecdef !== l.prosecdef || (p.proconfig || '') !== (l.cfg || '') || p.provolatile !== l.vol) cambios.push(`${p.proname}(${p.args}) prod=[${p.proacl}|${p.prosecdef}|${p.proconfig}|${p.provolatile}] local=[${l.acl}|${l.prosecdef}|${l.cfg}|${l.vol}]`);
  }
  reg('ACL/secdef/search_path de las funciones preexistentes iguales a produccion tras 099..110', cambios.length === 0, cambios.slice(0, 5).join(' || '));
}

console.log('=== (c) reaplicar (idempotencia)');
for (const n of NUEVAS) await intentar(`reaplicar ${n}`, sqlMig(n));
{
  const d = difFoto(fotoAplicada, await foto());
  reg('idempotencia: el esquema tras reaplicar es identico al de la primera aplicacion', d.length === 0, d.slice(0, 8).join(' || '));
}

// ---------------------------------------------------------------- (d) tests
console.log('=== (d) tests/db/triggers.test.sql');
await correrTests('con 099..110 aplicadas');
await comprobarDatosSembrados();
await escenarios('099..110 aplicadas');

// ---------------------------------------------------------------- (e) rollbacks en orden inverso
console.log('=== (e) rollbacks 110, 103, 102, 101, 100, 104, 099');
for (const n of ROLLBACK_ORDEN) await intentar(`rollback ${n}`, sqlRb(n));
{
  const d = difFoto(fotoBase, await foto());
  console.log('  diferencias esquema base vs tras todos los rollbacks:', d.length);
  for (const x of d.slice(0, 60)) console.log('    ', x);
  reg('rollbacks: esquema tras revertir todo vs esquema base', d.length === 0, `${d.length} diferencias (ver arriba)`);
}
for (const n of ROLLBACK_ORDEN) await intentar(`rollback ${n} (x2, idempotente)`, sqlRb(n));
if (opt('--diag-rollback')) { await import(pathToFileURL(opt('--diag-rollback')).href); process.exit(0); }
console.log('=== (e2) reaplicar las migraciones tras los rollbacks');
for (const n of NUEVAS) await intentar(`aplicar ${n} tras rollbacks`, sqlMig(n));
{
  const d = difFoto(fotoAplicada, await foto());
  reg('re-aplicacion tras rollbacks: esquema identico al de la primera aplicacion', d.length === 0, d.slice(0, 8).join(' || '));
}
await correrTests('tras rollback + reaplicar');

await escenarios('tras rollback + reaplicar');

// ---------------------------------------------------------------- (f) orden incorrecto: que pasa al aplicar una migracion sin su prerrequisito
if (!args.includes('--sin-dependencias')) {
  console.log('=== (f) orden incorrecto (informativo: cada caso usa una base nueva)');
  const casos = [
    ['100', ['099']], ['101', ['099']], ['101', ['100']], ['102', ['099']], ['103', ['099']],
    ['110', ['099']], ['110', ['101']], ['110', ['103']], ['110', ['101', '103']], ['111', ['099']], ['111', ['104']],
    ['112', ['099']], ['112', ['102']], ['112', ['103']], ['112', ['104']],
    ['108', ['099']], ['108', ['101']], ['108', ['102']], ['108', ['103']],
    ['106', ['099']], ['106', ['101']],
    ['107', ['099']], ['107', ['101']],
    ['109', ['099']], ['109', ['101']], ['109', ['103']], ['109', ['104']], ['109', ['112']],
  ];
  for (const [objetivo, omitir] of casos) {
    const inst = new PGlite({ extensions: { pgcrypto } });
    await construirBase(inst);
    const guardado = db; db = inst;
    let res = '';
    try {
      for (const n of NUEVAS) {
        if (n === objetivo) break;
        if (omitir.includes(n)) continue;
        try { await db.exec(sqlMig(n)); } catch { /* una migracion intermedia que depende de la omitida tampoco se aplica: se sigue */ }
      }
      try { await db.exec(sqlMig(objetivo)); res = 'SE APLICO SIN ERROR'; }
      catch (e) { res = 'rechazada: ' + (e.message || '').split(String.fromCharCode(10))[0].slice(0, 150); }
    } finally { db = guardado; }
    console.log(`  ${objetivo} sin ${omitir.join('+')}: ${res}`);
    resultados.push({ paso: `orden ${objetivo} sin ${omitir.join('+')}`, ok: true, detalle: res });
  }
}

// ---------------------------------------------------------------- (g) rollback AISLADO: revertir solo una migracion con todas las demas aplicadas
// Informativo: muestra que rollbacks se pueden ejecutar fuera del orden documentado y cuales fallan "de forma segura" (error
// claro, sin dejar la base a medias) y si la migracion se puede volver a aplicar despues.
if (!args.includes('--sin-dependencias')) {
  console.log('=== (g) rollback aislado (todas las demas aplicadas; informativo)');
  for (const n of ROLLBACK_ORDEN) {
    const inst = new PGlite({ extensions: { pgcrypto } });
    await construirBase(inst);
    const guardado = db; db = inst;
    let res = '';
    try {
      for (const m of NUEVAS) await db.exec(sqlMig(m));
      const fa = await foto();
      let rb = 'OK';
      try { await db.exec(sqlRb(n)); } catch (e) { rb = 'ERROR: ' + (e.message || '').split(String.fromCharCode(10))[0].slice(0, 110); }
      let re = 'reaplica OK';
      try { await db.exec(sqlMig(n)); } catch (e) { re = 'reaplicar FALLA: ' + (e.message || '').split(String.fromCharCode(10))[0].slice(0, 110); }
      const d = difFoto(fa, await foto());
      res = `rollback ${rb} | ${re} | esquema final ${d.length === 0 ? 'identico' : 'DIFIERE (' + d.length + '): ' + d.slice(0, 2).join(' ; ')}`;
    } finally { db = guardado; }
    console.log(`  rollback ${n} solo: ${res}`);
    resultados.push({ paso: `rollback aislado ${n}`, ok: true, detalle: res });
  }
}

// ---------------------------------------------------------------- (h) scripts/anonimizar.sql sobre una base nueva con las migraciones aplicadas
// Comprueba el guard (en produccion aborta y no cambia nada) y que, marcada como branch, no queda ningun dato personal sembrado.
if (NUEVAS.includes('112') && existsSync(join(REPO, 'scripts/anonimizar.sql'))) {
  console.log('=== (h) scripts/anonimizar.sql (base nueva con todas las migraciones)');
  const inst = new PGlite({ extensions: { pgcrypto } });
  await construirBase(inst);
  const guardado = db; db = inst;
  try {
    for (const m of NUEVAS) await db.exec(sqlMig(m));
    const script = lee(join(REPO, 'scripts/anonimizar.sql'));
    const sembrar = [
      `insert into empresas (nombre) values ('Empresa H')`,
      `insert into empleados (nombres, apellidos, dni, empresa_id, telefono, whatsapp, correo_personal, notas) select 'Persona' || g, 'Real' || g, (70000000 + g)::text, (select id from empresas limit 1), '9990000' || g, '9990001' || g, 'persona' || g || '@real.test', 'nota privada ' || g from generate_series(1, 4) g`,
      `insert into plataformas (id, nombre) values ('gmailh', 'Gmail H')`,
      `insert into cuentas (plataforma_id, usuario, password, notas, tipo_cuenta) values ('gmailh', 'persona1.real@empresa.test', 'enc2:AAAA:BBBB', 'nota cuenta', 'personal'), ('gmailh', 'persona2.real@empresa.test', 'enc2:AAAA:BBBB', null, 'personal')`,
      `insert into licencias (software, tipo, cantidad, clave, notas) values ('Office', 'suscripcion', 2, 'enc2:AAAA:BBBB', 'nota licencia')`,
      `insert into tickets (codigo, token, titulo, descripcion, contacto_ingresado, empleado_id) select 'TCK-H' || g, lpad(g::text, 24, 'H'), 'Problema de Persona' || g, 'Descripcion con datos de Persona' || g, '9990000' || g, (select id from empleados limit 1) from generate_series(1, 3) g`,
      `insert into entregas (token_hash, empleado_id, empleado_nombre, payload, expires_at) values ('hash-h-1', (select id from empleados limit 1), 'Persona1 Real1', 'enc2:AAAA:BBBB', now() + interval '1 day')`,
      `insert into notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino) values ('empleado_alta', 'empleado', gen_random_uuid(), 'Empleado registrado · Persona1 Real1', '/x')`,
      `insert into accesos_log (cuenta_usuario, accion, ip, user_agent, detalle) values ('persona1.real@empresa.test', 'ver', '203.0.113.9', 'navegador', 'Entrega abierta — Persona1 Real1')`,
      `insert into intentos_publicos (ambito, clave) values ('tickets.crear.dni', '70000001')`,
      `insert into ticket_busqueda_intentos (ip, dni) values ('203.0.113.9', '70000001')`,
      `insert into equipos_importacion (raw, notas) values ('{"usuario":"Persona1 Real1"}'::jsonb, 'nota import')`,
      ...(NUEVAS.includes('109') ? [`insert into empleado_enlaces (empleado_id, token_hash, alcance, expires_at, ultimo_ip) select id, repeat('a', 64), array['ver_equipos'], now() + interval '1 day', '203.0.113.9' from empleados limit 1`] : []),
    ];
    for (const s of sembrar) await db.exec(s);
    const nEmp = (await q('select count(*)::int n from empleados'))[0].n;

    let abort = '';
    try { await db.exec(script); abort = 'SIN ERROR'; } catch (e) { abort = e.message || ''; }
    const intacto = (await q("select count(*)::int n from empleados where nombres like 'Persona%' and telefono is not null"))[0].n === nEmp
      && (await q('select count(*)::int n from accesos_log'))[0].n >= 1;
    reg('h1 anonimizar.sql aborta cuando el entorno es produccion y no modifica nada', /NO est. marcado como branch/.test(abort) && intacto, abort.slice(0, 120));

    await db.exec("update entorno set nombre = 'branch' where id = 1");
    let corrio = '';
    try { await db.exec(script); corrio = 'ok'; } catch (e) { corrio = e.message || ''; }
    reg('h2 anonimizar.sql corre en una branch marcada', corrio === 'ok', corrio.slice(0, 200));
    if (corrio === 'ok') {
      const c = async (sql) => (await q(sql))[0].n;
      const malos = [];
      if ((await c('select count(*)::int n from empleados')) !== nEmp) malos.push('cambio la cantidad de empleados');
      if ((await c("select count(*)::int n from empleados where nombres not like 'Empleado %' or apellidos <> 'Prueba' or dni !~ '^[0-9]{8}$' or dni like '70000%' or telefono is not null or whatsapp is not null or correo_personal is not null or notas is not null")) !== 0) malos.push('empleados con datos');
      if ((await c("select count(distinct dni)::int n from empleados")) !== nEmp) malos.push('DNI repetidos');
      if ((await c("select count(*)::int n from cuentas where usuario !~ '^usuario[0-9]+@ejemplo[.]test$' or password is not null or notas is not null")) !== 0) malos.push('cuentas con datos');
      if ((await c("select count(*)::int n from licencias where clave is not null or notas is not null")) !== 0) malos.push('licencias con datos');
      if ((await c("select count(*)::int n from tickets where contacto_ingresado is not null or titulo <> 'Ticket de prueba' or descripcion <> 'Descripción de prueba'")) !== 0) malos.push('tickets con texto');
      if ((await c("select count(*)::int n from entregas where payload <> '' or empleado_nombre <> 'Empleado de prueba'")) !== 0) malos.push('entregas con datos');
      if ((await c("select count(*)::int n from notificaciones where titulo <> 'Notificación de prueba'")) !== 0) malos.push('notificaciones con titulo');
      if ((await c("select count(*)::int n from equipos_importacion where raw <> '{}'::jsonb or notas is not null")) !== 0) malos.push('equipos_importacion con datos');
      for (const t of ['accesos_log', 'intentos_publicos', 'ticket_busqueda_intentos', 'empleado_eventos', ...(NUEVAS.includes('109') ? ['empleado_enlaces'] : [])]) {
        if ((await c(`select count(*)::int n from ${t}`)) !== 0) malos.push(`${t} no quedo vacia`);
      }
      reg('h3 anonimizar.sql: ningun dato personal sembrado sobrevive', malos.length === 0, malos.join(', '));
    }
    // idempotente: correrlo otra vez sigue funcionando
    let otra = '';
    try { await db.exec(script); otra = 'ok'; } catch (e) { otra = e.message || ''; }
    reg('h4 anonimizar.sql se puede repetir', otra === 'ok', otra.slice(0, 200));
  } finally { db = guardado; }
}

console.log(`\n=== RESUMEN: ${resultados.length - fallos} OK, ${fallos} fallas (${((Date.now() - t0) / 1000).toFixed(1)}s en las fases b-e)`);
if (fallos) { for (const r of resultados.filter((x) => !x.ok)) console.log(' FALLA', r.paso, '->', r.detalle); }
process.exit(fallos ? 1 : 0);
