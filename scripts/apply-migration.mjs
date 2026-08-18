// Aplica un archivo SQL de migrations/ contra el proyecto InsForge vinculado.
//
// Uso:
//   node scripts/apply-migration.mjs migrations/021_areas_obras_trazabilidad.sql
//   node scripts/apply-migration.mjs migrations/070_xyz.sql --force   (reaplica a propósito)
//
// Tracking (migración 069, schema_migrations): antes de aplicar, este
// script verifica si la versión ya está registrada como aplicada — si lo
// está, aborta (salvo --force) para no reaplicar por error una migración
// ya corrida (motivo original de la decisión de la migración 035: no usar
// `db migrations up`, aplicar dos veces puede fallar o duplicar datos).
// Tras aplicar con éxito CONFIRMADO (ver "Clasificación de resultado" más
// abajo), registra la fila en schema_migrations. Si schema_migrations
// todavía no existe en el proyecto (ej. corriendo esto contra un proyecto
// anterior a la migración 069), la verificación y el registro se omiten
// con un aviso — no bloquean la aplicación real.
//
// ============================================================
// INCIDENTE 2026-08-18 (migración 073, tiene_permiso_modulo/P0-05) y por
// qué este archivo ya NO usa PowerShell en Windows:
//
// La versión anterior envolvía el SQL completo en un here-string de
// PowerShell (@'...'@) y lo pasaba a `npx @insforge/cli db query -- ...`
// para evitar el límite ~8 KB de línea de comandos de cmd.exe. Eso NUNCA
// evitó cmd.exe: `npx` en Windows resuelve a `npx.cmd` (un batch shim), y
// lanzar un `.cmd` — desde PowerShell, desde spawnSync directo, o desde
// donde sea — siempre termina pasando por un `cmd.exe` interno. cmd.exe
// procesa su entrada línea por línea, y NO entiende "un argumento entre
// comillas que abarca varias líneas físicas" — trunca en el primer salto
// de línea embebido, sin ningún error. La migración 073 (cuya primera
// línea es un comentario) reportó "Query executed successfully" con
// status 0 — pero solo esa línea de comentario llegó a Postgres; el
// revoke/grant real, más abajo en el archivo, nunca se envió. Reproducido
// y confirmado en el branch de pruebas antes de este fix (nunca en
// producción): un SQL de 2+ líneas simples (sin ningún comentario)
// también se trunca a solo su primera línea, con PowerShell o sin él.
//
// Corrección: el SQL de la migración real NUNCA vuelve a viajar como
// contenido de un argumento de línea de comandos. Se escribe a un
// archivo temporal y se aplica con `db import <ruta>` — el único
// argumento que cruza la capa de cmd.exe es una ruta corta de una sola
// línea, así que el truncamiento deja de ser posible sin importar cuántas
// líneas o statements tenga el archivo real. Los dos SQL de control que
// este mismo script genera (¿ya está registrada? / registrar) siguen
// yendo por `db query` inline porque son de una sola línea por
// construcción — nunca contienen un salto de línea, así que no corren
// ningún riesgo de truncamiento.
//
// En Windows, invocar `npx` (el batch shim) requiere pasar por un
// intérprete de comandos — pero en vez de PowerShell + -EncodedCommand +
// base64, ahora se invoca `cmd.exe /d /s /c npx ...` directo: cmd.exe SÍ
// es un ejecutable real (no un shim), así que Node escapa cada elemento
// del argv correctamente al construir la línea para CreateProcess (a
// diferencia de `shell: true`, que solo concatena sin escapar — Node
// mismo lo advierte como inseguro). Verificado con rutas con espacios y
// con SQL que incluye comillas simples.
//
// Clasificación de resultado (éxito / error / verificación pendiente):
// `db import` puede terminar con un crash del cliente ("Assertion
// failed ... src\win\async.c", ya documentado en AGENTS.md) tanto cuando
// el statement falló de verdad como — en algunos casos ya vistos en este
// proyecto — cuando el statement SÍ se ejecutó en el servidor pero el
// cliente crasheó después. Por eso un resultado con esa firma de crash no
// se trata como "seguro que falló": se reporta como PENDIENTE DE
// VERIFICACIÓN y, igual que un error real, NO se registra en
// schema_migrations — pero con un mensaje distinto que no afirma que la
// migración falló, solo que no se puede confiar en el código de salida
// para saberlo.
// ============================================================
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { basename, resolve, join } from 'node:path';
import { tmpdir, userInfo } from 'node:os';

const archivo = process.argv[2];
const forzar = process.argv.includes('--force');
if (!archivo) {
  console.error('Uso: node scripts/apply-migration.mjs migrations/0XX_nombre.sql [--force]');
  process.exit(1);
}

const ruta = resolve(process.cwd(), archivo);
const sql = readFileSync(ruta, 'utf8');
const nombre = basename(archivo);
const version = (nombre.match(/^(\d{3,})_/) || [])[1];
const checksum = createHash('sha256').update(sql).digest('hex');
const aplicadaPor = process.env.GITHUB_ACTOR || userInfo().username;

// ── SQL corto de control (siempre de una sola línea, por construcción:
// las dos únicas llamadas son un SELECT y un INSERT armados por este
// mismo script, nunca el contenido de un archivo) — vía `db query`
// inline. La aserción es una red de seguridad: si algún día alguien le
// pasa contenido multilínea por error, falla alto y claro en vez de
// truncarse en silencio otra vez.
function ejecutarQueryCorta(sqlUnaLinea) {
  if (sqlUnaLinea.includes('\n')) {
    throw new Error(
      'ejecutarQueryCorta() recibió SQL multilínea — eso es exactamente lo que causó el incidente de la migración 073. Usar ejecutarArchivo() para cualquier SQL con más de una línea.',
    );
  }
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', 'npx', '@insforge/cli', 'db', 'query', '--', sqlUnaLinea], {
      encoding: 'utf8',
    });
  }
  return spawnSync('npx', ['@insforge/cli', 'db', 'query', '--', sqlUnaLinea], { encoding: 'utf8' });
}

// ── El SQL real de la migración (cualquier tamaño, cualquier número de
// statements, dollar-quoting incluido) — vía archivo temporal + `db
// import`. El único argumento que cruza la capa de cmd.exe es la ruta,
// nunca el contenido.
function ejecutarArchivo(sqlCompleto) {
  const tmp = join(tmpdir(), `apply-migration-${randomUUID()}.sql`);
  writeFileSync(tmp, sqlCompleto, 'utf8');
  try {
    if (process.platform === 'win32') {
      return spawnSync('cmd.exe', ['/d', '/s', '/c', 'npx', '@insforge/cli', 'db', 'import', tmp], { encoding: 'utf8' });
    }
    return spawnSync('npx', ['@insforge/cli', 'db', 'import', tmp], { encoding: 'utf8' });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // el archivo temporal es de un solo uso; si ya no está, no es un problema
    }
  }
}

// Clasifica el resultado de ejecutarArchivo() en exactamente uno de tres
// estados — ver el bloque de comentarios de cabecera para el motivo del
// tercero.
function clasificar(r) {
  if (r.error) {
    return { estado: 'error', detalle: r.error.message };
  }
  const salida = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  if (r.status === 0) {
    return { estado: 'exito', detalle: salida };
  }
  if (/Assertion failed/i.test(salida)) {
    return { estado: 'pendiente', detalle: salida };
  }
  return { estado: 'error', detalle: salida };
}

// Verificación previa: ¿ya está aplicada esta versión? Si schema_migrations
// no existe todavía (proyecto sin la migración 069), el `db query` falla —
// se interpreta como "sin tracking disponible, seguir igual" y se avisa.
if (version) {
  const chequeo = ejecutarQueryCorta(
    `select aplicada_en, aplicada_por from public.schema_migrations where version = '${version}';`,
  );
  const salidaChequeo = `${chequeo.stdout || ''}${chequeo.stderr || ''}`;
  if (chequeo.status === 0 && /aplicada_en/.test(salidaChequeo) && !/\(0 rows?\)/i.test(salidaChequeo) && salidaChequeo.trim().split('\n').length > 2) {
    if (!forzar) {
      console.error(`✗ La migración ${version} ya figura aplicada en schema_migrations:\n${salidaChequeo}`);
      console.error('  Usar --force si de verdad se quiere reaplicar a propósito.');
      process.exit(1);
    }
    console.warn(`⚠ ${version} ya estaba registrada — reaplicando por --force.`);
  } else if (chequeo.status !== 0) {
    console.warn('⚠ No se pudo consultar schema_migrations (¿todavía no existe? ver migración 069) — se continúa sin verificar.');
  }
} else {
  console.warn(`⚠ No se pudo extraer un número de versión de "${nombre}" (se esperaba el prefijo 0XX_) — se aplica sin tracking.`);
}

const r = ejecutarArchivo(sql);
const resultado = clasificar(r);

if (resultado.estado === 'error') {
  console.error(`✗ ERROR aplicando ${nombre}:\n`);
  console.error(resultado.detalle);
  process.exit(1);
}

if (resultado.estado === 'pendiente') {
  console.error(`⚠ VERIFICACIÓN PENDIENTE — ${nombre}:`);
  console.error(resultado.detalle);
  console.error(
    '\n  El proceso terminó con un código distinto de 0 y la firma de crash ya documentada en AGENTS.md\n' +
      '  ("Assertion failed ... src\\win\\async.c"), que puede aparecer aunque el statement SÍ se haya\n' +
      '  ejecutado en el servidor. NO se registró en schema_migrations. Verificar manualmente el efecto\n' +
      '  real (ej. consultando la tabla/función/policy afectada) antes de decidir si reintentar, y si se\n' +
      '  confirma que ya quedó aplicada, registrar a mano o reaplicar con --force una vez confirmado.',
  );
  process.exit(1);
}

// resultado.estado === 'exito': status 0, sin la firma de crash.
console.log(`✓ Migración aplicada: ${nombre}`);
if (resultado.detalle) console.log(resultado.detalle);

// Registro posterior: solo si el estado anterior fue 'exito' confirmado
// (nunca 'pendiente' — ver arriba). Si el registro en sí falla, el DDL ya
// corrió — advertir, no tratar la migración completa como fallida (perder
// el registro es peor que seguir sin él).
if (version) {
  const insert = ejecutarQueryCorta(
    `insert into public.schema_migrations (version, nombre_archivo, checksum, aplicada_por) ` +
      `values ('${version}', '${nombre}', '${checksum}', '${aplicadaPor}') ` +
      `on conflict (version) do update set nombre_archivo = excluded.nombre_archivo, checksum = excluded.checksum, aplicada_por = excluded.aplicada_por, aplicada_en = now();`,
  );
  if (insert.status !== 0) {
    console.warn(`⚠ La migración se aplicó pero no se pudo registrar en schema_migrations:\n${insert.stderr || insert.stdout || ''}`);
  } else {
    console.log(`✓ Registrada en schema_migrations (versión ${version}, por ${aplicadaPor})`);
  }
}
