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
  for (const d of ['migrations', 'migrations/rollback', 'tests/db']) {
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
    if (/^(099|100|101|102|103|110|111)/.test(tag)) continue;
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

console.log(`\n=== RESUMEN: ${resultados.length - fallos} OK, ${fallos} fallas (${((Date.now() - t0) / 1000).toFixed(1)}s en las fases b-e)`);
if (fallos) { for (const r of resultados.filter((x) => !x.ok)) console.log(' FALLA', r.paso, '->', r.detalle); }
process.exit(fallos ? 1 : 0);
