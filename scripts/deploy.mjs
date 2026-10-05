// Despliegue controlado de migraciones y edge functions (Plan Ciclo 21 §7.3,
// H1-3; materializa la invariante 12 de AGENTS.md: "commit antes que producción").
//
// Uso:
//   node scripts/deploy.mjs migracion migrations/0XX_nombre.sql [--entorno produccion|v2] [--dry-run] [--forzar] [--solo-registro] [--proyecto <texto>] [--cambio CHG-0001]
//   node scripts/deploy.mjs function  credenciales|tickets|encuestas|equipos-fotos|portal [--entorno produccion|v2] [--dry-run] [--proyecto <texto>] [--cambio CHG-0001]
//
// --cambio CHG-####: el cambio (módulo Cambios, migración 107) que autoriza este despliegue. Se
// valida el formato (CHG- y 4 o más dígitos) y, si las columnas schema_migrations.cambio_id /
// function_deploys.cambio_id existen, queda registrado ahí. DECISIÓN: si el cambio no existe en la
// base, o está en un estado que no autoriza ejecutar, solo AVISA y sigue. El tracking es constancia,
// no una cerradura: el candado de verdad es git (árbol limpio, HEAD en origin/main), y bloquear por
// un registro que depende de la migración 107 haría imposible aplicar la propia 107, o desplegar
// en un entorno (v2, branch) cuya base no tiene los cambios de producción.
//
// Aborta (exit 1, mensaje en español) si:
//   - el árbol de trabajo tiene cambios sin comitear (modificados/staged; o archivos
//     nuevos sin seguimiento en migrations/ o functions/);
//   - HEAD no está contenido en origin/main (origin/release/v2 con --entorno v2;
//     `git merge-base --is-ancestor`); si el ref remoto no se puede resolver, aborta;
//   - la migración/función no está comiteada (`git ls-files --error-unmatch` + HEAD);
//   - (functions) functions/dist/<f>.ts no coincide con lo que generaría
//     scripts/build-functions.mjs (`--check` interno): se despliega el dist, nunca la fuente;
//   - la versión de la migración ya figura en public.schema_migrations (salvo --forzar).
// Con --dry-run solo ejecuta los pre-chequeos y consultas de SOLO LECTURA, imprime
// todo lo que haría y sale con 0 si ningún chequeo "bloqueante" falla (los chequeos
// de git —árbol limpio, comiteado, HEAD en el remoto— se informan pero no bloquean el
// dry-run, porque en un PR todavía no se cumplen; se exigen al desplegar de verdad).
//
// Aplicación de migraciones: `db import` (archivo temporal; el SQL NUNCA viaja como
// argumento: incidente 073, docs/GOTCHAS-CLI.md). Después ejecuta el bloque
// "-- Verificación" ... "-- FIN" de la migración (solo SELECT) y registra en
// public.schema_migrations con checksum sha256 REAL del archivo, aplicada_por =
// `git config user.email` y, si las columnas existen (migración 100), commit_sha y
// entorno. Un `db import` que crashea con "Assertion failed" queda como PENDIENTE:
// no se registra y se pide verificar a mano (--solo-registro registra tras verificar).
//
// Functions: `functions deploy <f> --file functions/dist/<f>.ts` (el archivo autocontenido
// que genera scripts/build-functions.mjs a partir de functions/<f>.ts + functions/_shared/),
// compara el código desplegado (`functions code`) con ese archivo y registra en
// public.function_deploys (sha256 DEL ARCHIVO DE DIST, commit_sha, desplegado_por, entorno
// si existe la columna).
//
// Variables: INSFORGE_CLI_CWD (carpeta enlazada al proyecto, donde está .insforge/;
// útil desde un worktree sin enlazar). Ver docs/CONTINUIDAD.md.
//
// Códigos de salida: 0 ok · 1 abortado/fallido · 2 sin conexión con la base · 64 uso.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userInfo } from 'node:os';
import { crearTransporte, literalSql } from './lib/insforge-sql.mjs';
import { verificarDist } from './build-functions.mjs';

export const FUNCIONES_PERMITIDAS = ['credenciales', 'tickets', 'encuestas', 'equipos-fotos', 'portal'];
// Archivo que se despliega: el dist autocontenido, no la fuente (que tiene marcadores
// de inlinado y no corre en el runtime de InsForge).
export const rutaDistFunction = (nombre) => `functions/dist/${nombre}.ts`;
export const REF_POR_ENTORNO = { produccion: 'origin/main', v2: 'origin/release/v2' };
// Código de un cambio (siguiente_codigo_cambio, migración 107): CHG- y 4 o más dígitos.
export const FORMATO_CAMBIO = /^CHG-\d{4,}$/;
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Argumentos (puro) ─────────────────────────────────────────────────────
export function parsearArgumentos(argv) {
  const [tipo, objetivo, ...resto] = argv;
  if (!['migracion', 'function'].includes(tipo)) {
    throw new Error('Indique el tipo: "migracion" o "function".');
  }
  if (!objetivo || objetivo.startsWith('--')) {
    throw new Error(tipo === 'migracion' ? 'Indique la migración, ej. migrations/089_tickets_resuelto_at.sql' : `Indique la función: ${FUNCIONES_PERMITIDAS.join(', ')}`);
  }
  const o = { tipo, objetivo, entorno: 'produccion', dryRun: false, forzar: false, soloRegistro: false, proyecto: null, cambio: null };
  for (let i = 0; i < resto.length; i++) {
    const a = resto[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--forzar' || a === '--force') o.forzar = true;
    else if (a === '--solo-registro') o.soloRegistro = true;
    else if (a === '--entorno') {
      o.entorno = resto[++i];
      if (!REF_POR_ENTORNO[o.entorno]) throw new Error(`--entorno inválido: "${o.entorno}" (use produccion o v2).`);
    } else if (a === '--proyecto') {
      o.proyecto = resto[++i];
      if (!o.proyecto) throw new Error('--proyecto requiere un texto.');
    } else if (a === '--cambio') {
      o.cambio = String(resto[++i] ?? '').trim().toUpperCase();
      if (!FORMATO_CAMBIO.test(o.cambio)) throw new Error(`--cambio requiere un código como CHG-0001 (CHG- y 4 o más dígitos), no "${resto[i] ?? ''}".`);
    } else throw new Error(`Argumento desconocido: ${a}`);
  }
  if (tipo === 'function' && !FUNCIONES_PERMITIDAS.includes(objetivo)) {
    throw new Error(`Función no permitida: "${objetivo}". Use una de: ${FUNCIONES_PERMITIDAS.join(', ')}.`);
  }
  if (tipo === 'function' && (o.forzar || o.soloRegistro)) {
    throw new Error('--forzar y --solo-registro solo aplican a migraciones.');
  }
  return o;
}

// "migrations/089_x.sql" (también con \ o ruta absoluta dentro del repo) -> datos.
export function validarRutaMigracion(arg, raiz = RAIZ) {
  const abs = resolve(raiz, arg);
  const relativa = abs.slice(resolve(raiz).length + 1).replace(/\\/g, '/');
  const m = relativa.match(/^migrations\/((\d{3,})_[A-Za-z0-9_]+\.sql)$/);
  if (!m) {
    throw new Error(`Ruta de migración no permitida: "${arg}" (se espera migrations/0XX_nombre.sql; los rollbacks no se despliegan con este script).`);
  }
  return { rel: relativa, abs, nombre: m[1], version: m[2] };
}

// ── Árbol de trabajo (puro) ───────────────────────────────────────────────
// porcelain = salida de `git status --porcelain`. Lo sin seguimiento (??) solo
// bloquea en migrations/ y functions/: ahí un archivo nuevo es justo lo que no
// debe quedar fuera del commit; en el resto es ruido (docs/, borradores).
export function evaluarArbol(porcelain) {
  const lineas = String(porcelain || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const modificados = [];
  const sinSeguimiento = [];
  for (const l of lineas) {
    const ruta = l.slice(3).replace(/^"|"$/g, '');
    if (l.startsWith('??')) sinSeguimiento.push(ruta);
    else modificados.push(`${l.slice(0, 2).trim()} ${ruta}`);
  }
  const sinSeguimientoRelevante = sinSeguimiento.filter((r) => /^(migrations|functions)\//.test(r));
  return { limpio: modificados.length === 0 && sinSeguimientoRelevante.length === 0, modificados, sinSeguimiento, sinSeguimientoRelevante };
}

// ── Migraciones previas sin registrar (puro) ──────────────────────────────
export function pendientesPrevias(registradas, enCarpeta, version) {
  const reg = new Set(registradas);
  return enCarpeta.filter((v) => v < version && !reg.has(v)).sort();
}

// ── Bloque de verificación de la migración (puro) ─────────────────────────
// Acepta las dos convenciones: sentencias SELECT sueltas, o dentro de comentarios
// ("--    select ...;", una por línea; como la migración 086). Solo SELECT.
export function extraerSentenciasVerificacion(sql) {
  const out = [];
  let dentro = false;
  let acum = null;
  for (const linea of String(sql).split(/\r?\n/)) {
    if (!dentro) {
      if (/^\s*--\s*Verificaci[oó]n/i.test(linea)) dentro = true;
      continue;
    }
    if (/^\s*--\s*FIN\b/i.test(linea)) break;
    const texto = linea.replace(/^\s*--\s?/, '').trim();
    if (acum === null) {
      if (!/^select\b/i.test(texto)) continue;
      acum = texto;
    } else if (texto === '' || acum.length > 4000) {
      acum = null;
      continue;
    } else {
      acum += ` ${texto}`;
    }
    if (/;\s*$/.test(acum)) {
      out.push(acum.replace(/;\s*$/, '').replace(/\s+/g, ' ').trim());
      acum = null;
    }
  }
  return out;
}

// ── Registro (puro) ───────────────────────────────────────────────────────
export function construirInsertMigracion({ version, nombre, checksum, aplicadaPor, commitSha, entorno, columnas, forzar, cambio = null }) {
  const campos = [
    ['version', version],
    ['nombre_archivo', nombre],
    ['checksum', checksum],
    ['aplicada_por', aplicadaPor],
  ];
  if (columnas.has('commit_sha')) campos.push(['commit_sha', commitSha]);
  if (columnas.has('entorno')) campos.push(['entorno', entorno]);
  if (cambio && columnas.has('cambio_id')) campos.push(['cambio_id', cambio]);
  const nombres = campos.map(([c]) => c).join(', ');
  const valores = campos.map(([, v]) => literalSql(v)).join(', ');
  let sql = `insert into public.schema_migrations (${nombres}) values (${valores})`;
  if (forzar) {
    const sets = campos.filter(([c]) => c !== 'version').map(([c]) => `${c} = excluded.${c}`);
    sets.push('aplicada_en = now()');
    sql += ` on conflict (version) do update set ${sets.join(', ')}`;
  }
  return sql;
}

export function construirInsertDeploy({ funcion, sha256, commitSha, desplegadoPor, entorno, columnas, cambio = null }) {
  const campos = [
    ['funcion', funcion],
    ['sha256', sha256],
  ];
  if (columnas.has('commit_sha')) campos.push(['commit_sha', commitSha]);
  if (columnas.has('desplegado_por')) campos.push(['desplegado_por', desplegadoPor]);
  if (columnas.has('entorno')) campos.push(['entorno', entorno]);
  if (cambio && columnas.has('cambio_id')) campos.push(['cambio_id', cambio]);
  return `insert into public.function_deploys (${campos.map(([c]) => c).join(', ')}) values (${campos.map(([, v]) => literalSql(v)).join(', ')})`;
}

export const sha256Texto = (bufferOTexto) => createHash('sha256').update(bufferOTexto).digest('hex');

// `functions code <f>` antepone "Function: ..\nStatus: ..\n---\n". Se compara el
// cuerpo con EOL normalizado y sin espacios finales (el CLI no devuelve bytes crudos).
export function extraerCodigoDesplegado(salida) {
  const s = String(salida || '');
  const i = s.indexOf('\n---\n');
  return i < 0 ? null : s.slice(i + 5);
}
const normalizarCodigo = (s) => s.replace(/\r\n/g, '\n').trimEnd();
export function codigoCoincide(local, desplegadoSalida) {
  const dep = extraerCodigoDesplegado(desplegadoSalida);
  if (dep === null) return null; // formato irreconocible: no se puede afirmar nada
  return sha256Texto(normalizarCodigo(String(local))) === sha256Texto(normalizarCodigo(dep));
}

export function proyectoCoincide(lineaProyecto, fragmento) {
  return typeof lineaProyecto === 'string' && lineaProyecto.toLowerCase().includes(String(fragmento).toLowerCase());
}

// ── Cambio que autoriza el despliegue (puro) ──────────────────────────────
// fila = { tipo, estado } de public.cambios, o null si el código no existe. Nunca bloquea:
// devuelve el mensaje del pre-chequeo `cambio_registrado` (severidad 'aviso' si hay algo que
// revisar). Una emergencia puede ejecutarse sin aprobación previa; el resto debe estar aprobado
// o en ejecución.
export function evaluarCambio(codigo, fila) {
  if (!fila) {
    return { advertir: true, mensaje: `El cambio ${codigo} no existe en la base: se registra igual, pero conviene darlo de alta en Cambios (Mesa de ayuda) para que quede la constancia.` };
  }
  const autorizan = fila.tipo === 'emergencia' ? ['borrador', 'solicitado', 'aprobado', 'en_ejecucion'] : ['aprobado', 'en_ejecucion'];
  if (!autorizan.includes(fila.estado)) {
    return { advertir: true, mensaje: `El cambio ${codigo} (${fila.tipo}) está "${fila.estado}": no autoriza ejecutar (se esperaba ${autorizan.join(' o ')}). Se registra igual.` };
  }
  return { advertir: false, mensaje: `Cambio ${codigo} (${fila.tipo}, ${fila.estado})` };
}

// ── Pre-chequeos (con dependencias inyectadas) ────────────────────────────
// deps: { git(args)->{status,stdout}, consultarSql(sql), existe(relativa)->bool, listarVersiones()->string[],
//         distActualizado(nombre)->{ ok, mensaje } (solo functions) }
// Devuelve [{ id, ok, severidad: 'bloqueante'|'al_desplegar'|'aviso', mensaje }].
// 'bloqueante' aborta incluso en --dry-run; 'al_desplegar' solo en la corrida real.
export async function prechequeos(ctx, deps) {
  const r = [];
  const agregar = (id, ok, severidad, mensaje) => r.push({ id, ok, severidad, mensaje });
  const rel = ctx.tipo === 'migracion' ? ctx.migracion.rel : rutaDistFunction(ctx.objetivo);

  agregar('archivo_existe', deps.existe(rel), 'bloqueante', deps.existe(rel) ? `${rel} existe` : `No existe ${rel}.`);

  // Dist de la function al día respecto de las fuentes (functions/<f>.ts + _shared/):
  // 'bloqueante' (también en --dry-run), porque desplegar un dist viejo es desplegar
  // código distinto del que está en el repositorio.
  if (ctx.tipo === 'function') {
    if (typeof deps.distActualizado !== 'function') throw new Error('prechequeos: falta la dependencia distActualizado para functions.');
    const d = deps.distActualizado(ctx.objetivo);
    agregar('dist_actualizado', d.ok, 'bloqueante', d.ok ? `${rel} coincide con el build de functions/${ctx.objetivo}.ts` : `${d.mensaje} Ejecute "npm run build:functions" y comitee el resultado.`);
  }

  // Árbol de trabajo
  const st = deps.git(['status', '--porcelain']);
  if (st.status !== 0) {
    agregar('arbol_limpio', false, 'al_desplegar', 'No se pudo ejecutar git status.');
  } else {
    const a = evaluarArbol(st.stdout);
    agregar(
      'arbol_limpio',
      a.limpio,
      'al_desplegar',
      a.limpio
        ? `Árbol de trabajo limpio${a.sinSeguimiento.length ? ` (${a.sinSeguimiento.length} archivo(s) sin seguimiento fuera de migrations/ y functions/, ignorados)` : ''}`
        : `Hay cambios sin comitear (${[...a.modificados, ...a.sinSeguimientoRelevante.map((x) => `?? ${x}`)].slice(0, 8).join('; ')}${a.modificados.length + a.sinSeguimientoRelevante.length > 8 ? '; …' : ''}). Comitear antes de desplegar (AGENTS.md, invariante 12).`,
    );
  }

  // Archivo comiteado
  const tracked = deps.git(['ls-files', '--error-unmatch', '--', rel]);
  const enHead = tracked.status === 0 ? deps.git(['cat-file', '-e', `HEAD:${rel}`]) : { status: 1 };
  agregar(
    'archivo_comiteado',
    tracked.status === 0 && enHead.status === 0,
    'al_desplegar',
    tracked.status === 0 && enHead.status === 0 ? `${rel} está comiteado en HEAD` : `${rel} no está comiteado (git ls-files / HEAD). Comitearlo antes de desplegar.`,
  );

  // HEAD contenido en el remoto
  const ref = REF_POR_ENTORNO[ctx.entorno];
  const resuelto = deps.git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (resuelto.status !== 0) {
    agregar('head_en_remoto', false, 'al_desplegar', `No se pudo resolver ${ref} (¿falta git fetch origin, o la rama no existe en el remoto?). No se puede comprobar que el commit esté publicado.`);
  } else {
    const anc = deps.git(['merge-base', '--is-ancestor', 'HEAD', ref]);
    if (anc.status === 0) agregar('head_en_remoto', true, 'al_desplegar', `HEAD está contenido en ${ref}`);
    else if (anc.status === 1) agregar('head_en_remoto', false, 'al_desplegar', `HEAD no está contenido en ${ref}: el commit no está publicado/mergeado en esa rama (invariante 12: primero merge, después producción). Si acaba de mergear, git fetch origin.`);
    else agregar('head_en_remoto', false, 'al_desplegar', `git merge-base falló contra ${ref}: ${(anc.stderr || '').trim()}`);
  }

  // Cambio que autoriza el despliegue: nunca bloquea (ver la cabecera).
  if (ctx.cambio) {
    try {
      const filas = await deps.consultarSql(`select tipo, estado from public.cambios where codigo = ${literalSql(ctx.cambio)}`);
      const ev = evaluarCambio(ctx.cambio, filas[0] || null);
      agregar('cambio_registrado', true, ev.advertir ? 'aviso' : 'bloqueante', ev.mensaje);
    } catch (e) {
      agregar(
        'cambio_registrado',
        true,
        'aviso',
        e.codigo === 'transporte'
          ? `No se pudo comprobar el cambio ${ctx.cambio} (sin conexión con la base): se registra igual si la columna existe.`
          : `No se pudo comprobar el cambio ${ctx.cambio} (¿falta aplicar la migración 107?): ${e.message}. Se registra igual si la columna existe.`,
      );
    }
  }

  if (ctx.tipo === 'migracion') {
    const { version, nombre } = ctx.migracion;
    const enCarpeta = deps.listarVersiones();
    const duplicadas = enCarpeta.filter((v) => v === version).length;
    agregar('version_unica_en_carpeta', duplicadas <= 1, 'bloqueante', duplicadas <= 1 ? `La versión ${version} es única en migrations/` : `Hay ${duplicadas} archivos con la versión ${version} en migrations/.`);

    let registradas = null;
    try {
      registradas = (await deps.consultarSql('select version from public.schema_migrations order by version')).map((f) => String(f.version));
    } catch (e) {
      if (e.codigo === 'transporte') {
        agregar('schema_migrations', false, 'bloqueante', `No se pudo consultar schema_migrations (sin conexión con la base): ${e.message}`);
        registradas = null;
      } else {
        agregar('schema_migrations', true, 'aviso', `schema_migrations no se pudo consultar (${e.message}); se continúa sin tracking.`);
      }
    }
    if (registradas) {
      const ya = registradas.includes(version);
      agregar(
        'version_libre',
        !ya || ctx.forzar,
        'bloqueante',
        !ya ? `La versión ${version} no está registrada (${registradas.length} registradas)` : ctx.forzar ? `La versión ${version} ya figura registrada: se reaplica por --forzar.` : `La versión ${version} ya figura registrada en schema_migrations. Use --forzar solo si de verdad se quiere reaplicar (${nombre}).`,
      );
      const previas = pendientesPrevias(registradas, enCarpeta, version);
      if (previas.length) agregar('previas_sin_registrar', true, 'aviso', `Migraciones anteriores del repositorio sin registrar en schema_migrations: ${previas.join(', ')} (aplicadas a mano, o pendientes).`);
    }
  }
  return r;
}

export function resumirPrechequeos(resultados, { dryRun }) {
  const fallos = resultados.filter((x) => !x.ok);
  const bloqueantes = fallos.filter((x) => x.severidad === 'bloqueante');
  const alDesplegar = fallos.filter((x) => x.severidad === 'al_desplegar');
  const abortar = dryRun ? bloqueantes.length > 0 : fallos.length > 0;
  return { abortar, bloqueantes, alDesplegar };
}

function imprimirPrechequeos(resultados, log) {
  for (const x of resultados) {
    const marca = x.ok ? (x.severidad === 'aviso' ? '!' : '✓') : '✗';
    log(`  ${marca} ${x.mensaje}`);
  }
}

// ── Orquestación de la migración ──────────────────────────────────────────
// deps: { transporte, leerArchivo(abs)->string|Buffer, git, log, warn }
export async function ejecutarMigracion(ctx, deps) {
  const { log, warn, transporte } = deps;
  const { migracion: m, entorno } = ctx;
  const contenido = deps.leerArchivo(m.abs);
  const checksum = sha256Texto(contenido);
  const sql = Buffer.isBuffer(contenido) ? contenido.toString('utf8') : String(contenido);
  const sentencias = extraerSentenciasVerificacion(sql);
  const commitSha = (deps.git(['rev-parse', 'HEAD']).stdout || '').trim();
  const aplicadaPor = deps.aplicadaPor();

  let columnas = new Set();
  try {
    columnas = new Set((await transporte.consultarSql("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'schema_migrations'")).map((f) => f.column_name));
  } catch (e) {
    warn(`No se pudieron leer las columnas de schema_migrations: ${e.message}`);
  }
  const falta = ['commit_sha', 'entorno'].filter((c) => !columnas.has(c));
  const insert = construirInsertMigracion({ version: m.version, nombre: m.nombre, checksum, aplicadaPor, commitSha, entorno, columnas, forzar: ctx.forzar, cambio: ctx.cambio });

  log('');
  log(`Plan (${ctx.dryRun ? 'DRY-RUN: no se ejecuta nada de lo que sigue' : 'se ejecuta ahora'}):`);
  log(`  1. ${ctx.soloRegistro ? '(--solo-registro) NO se aplica el archivo' : `db import ${m.rel} (${Buffer.byteLength(sql)} bytes, vía archivo temporal)`}`);
  log(`  2. Bloque "-- Verificación": ${sentencias.length ? `${sentencias.length} SELECT(s)` : 'no hay (la migración no trae bloque; verificar a mano)'}`);
  sentencias.forEach((s, i) => log(`       ${i + 1}) ${s.length > 150 ? `${s.slice(0, 150)}…` : s}`));
  log(`  3. Registrar en schema_migrations: ${insert.replace(checksum, `${checksum.slice(0, 12)}…`)}`);
  log(`     checksum sha256 real = ${checksum}`);
  if (falta.length) log(`     (columnas aún inexistentes en schema_migrations, se omiten: ${falta.join(', ')} — las crea la migración 100)`);
  if (ctx.cambio) log(columnas.has('cambio_id') ? `     cambio que autoriza: ${ctx.cambio}` : `     (--cambio ${ctx.cambio}: la columna cambio_id aún no existe en schema_migrations, no se registra — la crea la migración 107)`);
  if (ctx.dryRun) return 0;

  if (!ctx.soloRegistro) {
    log('\nAplicando…');
    const res = await transporte.importarArchivo(sql);
    if (res.estado === 'error') {
      warn(`✗ ERROR aplicando ${m.nombre}:\n${res.detalle}`);
      warn('  Puede haberse ejecutado PARTE de los statements: verificar el esquema antes de reintentar.');
      return 1;
    }
    if (res.estado === 'pendiente') {
      warn(`⚠ VERIFICACIÓN PENDIENTE — ${m.nombre}:\n${res.detalle}`);
      warn(
        '\n  `db import` terminó con la firma de crash del cliente ("Assertion failed ... src\\win\\async.c"),\n' +
          '  que puede aparecer aunque el statement SÍ se haya ejecutado en el servidor. NO se registró.\n' +
          '  Revise la salida de la verificación de abajo; si confirma que quedó aplicada, registre con:\n' +
          `  node scripts/deploy.mjs migracion ${m.rel} --solo-registro${ctx.entorno !== 'produccion' ? ` --entorno ${ctx.entorno}` : ''}`,
      );
      await correrVerificacion(sentencias, transporte, log, warn);
      return 1;
    }
    log(`✓ Migración aplicada: ${m.nombre}`);
    if (res.detalle) log(res.detalle);
  }

  const verificacionOk = await correrVerificacion(sentencias, transporte, log, warn);
  if (!verificacionOk) warn('⚠ Alguna sentencia de verificación falló: revisar a mano. Se registra igual la migración porque el DDL ya corrió.');

  try {
    await transporte.consultarSql(insert);
    log(`✓ Registrada en schema_migrations (versión ${m.version}, por ${aplicadaPor}, commit ${commitSha.slice(0, 9)}, entorno ${entorno})`);
  } catch (e) {
    warn(`⚠ La migración se aplicó pero NO se pudo registrar: ${e.message}\n  Registrar a mano o con --solo-registro. SQL: ${insert}`);
    return 1;
  }
  try {
    const filas = await transporte.consultarSql(`select version, nombre_archivo, left(checksum, 12) as checksum, aplicada_por${columnas.has('cambio_id') ? ', cambio_id' : ''} from public.schema_migrations where version = ${literalSql(m.version)}`);
    log(`  Registro leído de vuelta: ${JSON.stringify(filas[0] || null)}`);
  } catch {
    // la lectura de vuelta es informativa
  }
  log('\nRecordatorio: actualizar el snapshot (npm run snapshot) y comitearlo en el mismo cambio; npm run verify:db debe dar 0 diferencias.');
  return 0;
}

async function correrVerificacion(sentencias, transporte, log, warn) {
  if (!sentencias.length) return true;
  log('\nVerificación:');
  let ok = true;
  for (const [i, s] of sentencias.entries()) {
    try {
      const filas = await transporte.consultarSql(s);
      log(`  ${i + 1}) ${filas.length} fila(s)`);
      for (const f of filas.slice(0, 30)) log(`     ${JSON.stringify(f)}`);
      if (filas.length > 30) log(`     … (${filas.length - 30} más)`);
    } catch (e) {
      ok = false;
      warn(`  ${i + 1}) falló: ${e.message}`);
    }
  }
  return ok;
}

// ── Orquestación de la edge function ──────────────────────────────────────
export async function ejecutarFunction(ctx, deps) {
  const { log, warn, transporte } = deps;
  const nombre = ctx.objetivo;
  const rel = rutaDistFunction(nombre);
  const abs = resolve(deps.raiz || RAIZ, rel);
  const contenido = deps.leerArchivo(abs);
  const sha = sha256Texto(contenido);
  const commitSha = (deps.git(['rev-parse', 'HEAD']).stdout || '').trim();
  const desplegadoPor = deps.aplicadaPor();

  let columnas = new Set();
  try {
    columnas = new Set((await transporte.consultarSql("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'function_deploys'")).map((f) => f.column_name));
  } catch (e) {
    warn(`No se pudieron leer las columnas de function_deploys: ${e.message}`);
  }
  const insert = construirInsertDeploy({ funcion: nombre, sha256: sha, commitSha, desplegadoPor, entorno: ctx.entorno, columnas, cambio: ctx.cambio });

  log('');
  log(`Plan (${ctx.dryRun ? 'DRY-RUN: no se ejecuta nada de lo que sigue' : 'se ejecuta ahora'}):`);
  log(`  1. functions deploy ${nombre} --file ${rel}`);
  log('  2. functions code: comparar el código desplegado con el archivo');
  log(`  3. Registrar en function_deploys: ${insert}`);
  log(`     sha256 del archivo = ${sha}`);
  if (!columnas.has('entorno')) log('     (function_deploys todavía no tiene la columna entorno: se omite — la agrega la migración 100)');
  if (ctx.cambio) log(columnas.has('cambio_id') ? `     cambio que autoriza: ${ctx.cambio}` : `     (--cambio ${ctx.cambio}: la columna cambio_id aún no existe en function_deploys, no se registra — la crea la migración 107)`);
  if (ctx.dryRun) return 0;

  log('\nDesplegando…');
  const dep = transporte.ejecutarComando(['functions', 'deploy', nombre, '--file', rel]);
  const salida = `${dep.stdout || ''}\n${dep.stderr || ''}`.trim();
  if (dep.error || dep.status !== 0) {
    warn(`✗ ERROR desplegando ${nombre} (estado ${dep.status}):\n${dep.error ? dep.error.message : salida}`);
    return 1;
  }
  log(`✓ Function desplegada: ${nombre}`);
  if (salida) log(salida);

  const code = transporte.ejecutarComando(['functions', 'code', nombre]);
  const coincide = code.status === 0 ? codigoCoincide(String(contenido), code.stdout) : null;
  if (coincide === true) log('✓ El código desplegado coincide con el archivo (EOL normalizado).');
  else if (coincide === false) warn('⚠ El código desplegado NO coincide con el archivo. Revisar antes de dar el deploy por bueno.');
  else warn('⚠ No se pudo comparar el código desplegado (functions code no devolvió el formato esperado).');

  try {
    await transporte.consultarSql(insert);
    log(`✓ Registrada en function_deploys (${nombre}, sha256 ${sha.slice(0, 12)}…, commit ${commitSha.slice(0, 9)}, entorno ${ctx.entorno})`);
  } catch (e) {
    warn(`⚠ La function se desplegó pero NO se pudo registrar: ${e.message}\n  SQL: ${insert}`);
    return 1;
  }
  return coincide === false ? 1 : 0;
}

// ── main ──────────────────────────────────────────────────────────────────
function crearDepsReales() {
  const git = (args) => spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    git,
    raiz: RAIZ,
    existe: (rel) => existsSync(resolve(RAIZ, rel)),
    distActualizado: (nombre) => {
      try {
        const r = verificarDist(RAIZ, { nombres: [nombre] });
        const d = r.detalle[0];
        return { ok: r.ok, mensaje: d && d.motivo ? `${d.motivo}.` : '' };
      } catch (e) {
        return { ok: false, mensaje: `No se pudo generar el build de ${nombre}: ${e.message}.` };
      }
    },
    listarVersiones: () => readdirSync(resolve(RAIZ, 'migrations')).map((f) => (f.match(/^(\d{3,})_.*\.sql$/) || [])[1]).filter(Boolean),
    leerArchivo: (abs) => readFileSync(abs),
    aplicadaPor: () => (git(['config', 'user.email']).stdout || '').trim() || process.env.GITHUB_ACTOR || userInfo().username,
    log: (m) => console.log(m),
    warn: (m) => console.error(m),
  };
}

export async function principal(argv, depsExtra = {}) {
  let ctx;
  try {
    ctx = parsearArgumentos(argv);
    if (ctx.tipo === 'migracion') ctx.migracion = validarRutaMigracion(ctx.objetivo);
  } catch (e) {
    console.error(`${e.message}\nUso: node scripts/deploy.mjs migracion migrations/0XX_x.sql | function <nombre> [--entorno produccion|v2] [--dry-run] [--forzar] [--solo-registro] [--proyecto <texto>] [--cambio CHG-0001]`);
    return 64;
  }

  const deps = { ...crearDepsReales(), ...depsExtra };
  const { log, warn } = deps;
  let transporte;
  try {
    transporte = deps.transporte || crearTransporte();
  } catch (e) {
    warn(e.message);
    return 64;
  }
  deps.transporte = transporte;
  ctx.entornoRef = REF_POR_ENTORNO[ctx.entorno];

  const head = (deps.git(['rev-parse', '--short', 'HEAD']).stdout || '').trim();
  const rama = (deps.git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout || '').trim();
  log(`deploy.mjs · ${ctx.tipo} ${ctx.objetivo} · entorno ${ctx.entorno} · ${ctx.dryRun ? 'DRY-RUN' : 'REAL'}`);
  log(`  HEAD ${head} (${rama}) · transporte ${transporte.nombre} · ref remoto ${ctx.entornoRef}`);

  // Proyecto enlazado (solo CLI): se muestra siempre; --proyecto lo exige (obligatorio en v2 real).
  if (transporte.nombre === 'cli') {
    const cur = transporte.ejecutarComando(['current'], { timeoutMs: 30_000 });
    const linea = `${cur.stdout || ''}`.split(/\r?\n/).map((l) => l.trim()).find((l) => /^Project:/i.test(l)) || null;
    log(`  ${linea || 'Project: (el CLI no devolvió el proyecto enlazado; defina INSFORGE_CLI_CWD si esta carpeta no está enlazada)'}`);
    if (ctx.entorno === 'v2' && !ctx.proyecto && !ctx.dryRun) {
      warn('✗ Con --entorno v2 es obligatorio --proyecto <fragmento del nombre del proyecto enlazado>, para no aplicar a producción por error.');
      return 1;
    }
    if (ctx.proyecto && !proyectoCoincide(linea, ctx.proyecto)) {
      warn(`✗ El proyecto enlazado no contiene "${ctx.proyecto}": ${linea || '(desconocido)'}. Se aborta.`);
      return 1;
    }
  }

  let resultados;
  try {
    resultados = await prechequeos(ctx, { git: deps.git, consultarSql: (s) => transporte.consultarSql(s), existe: deps.existe, listarVersiones: deps.listarVersiones, distActualizado: deps.distActualizado });
  } catch (e) {
    warn(`Error en los pre-chequeos: ${e.message}`);
    return e.codigo === 'transporte' ? 2 : 1;
  }
  log('\nPre-chequeos:');
  imprimirPrechequeos(resultados, log);
  const { abortar, bloqueantes, alDesplegar } = resumirPrechequeos(resultados, ctx);
  if (abortar) {
    warn(`\n✗ Abortado: ${ctx.dryRun ? bloqueantes.length : bloqueantes.length + alDesplegar.length} pre-chequeo(s) fallaron. No se tocó nada.`);
    return resultados.some((x) => x.id === 'schema_migrations' && !x.ok) ? 2 : 1;
  }
  if (ctx.dryRun && alDesplegar.length) {
    log(`\n! Al desplegar de verdad se exigirá además: ${alDesplegar.map((x) => x.id).join(', ')} (hoy no se cumplen).`);
  }

  const codigo = ctx.tipo === 'migracion' ? await ejecutarMigracion(ctx, deps) : await ejecutarFunction(ctx, deps);
  if (ctx.dryRun && codigo === 0) log('\nDry-run terminado: no se aplicó ni se registró nada.');
  return codigo;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).then(
    (c) => process.exit(c),
    (e) => {
      console.error(e.stack || e.message);
      process.exit(2);
    },
  );
}

