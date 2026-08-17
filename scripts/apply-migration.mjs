// Aplica un archivo SQL de migrations/ contra el proyecto InsForge vinculado.
// En Windows evita el límite ~8 KB de cmd usando here-string de PowerShell.
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
// Tras aplicar con éxito, registra la fila en schema_migrations. Si
// schema_migrations todavía no existe en el proyecto (ej. corriendo esto
// contra un proyecto anterior a la migración 069), la verificación y el
// registro se omiten con un aviso — no bloquean la aplicación real.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { userInfo } from 'node:os';

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

function ejecutarSql(sqlAEjecutar) {
  if (process.platform === 'win32') {
    const ps = `npx @insforge/cli db query -- @'
${sqlAEjecutar}
'@`;
    return spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], {
      encoding: 'utf8',
    });
  }
  return spawnSync('npx', ['@insforge/cli', 'db', 'query', '--', sqlAEjecutar], { encoding: 'utf8' });
}

// Verificación previa: ¿ya está aplicada esta versión? Si schema_migrations
// no existe todavía (proyecto sin la migración 069), el `db query` falla —
// se interpreta como "sin tracking disponible, seguir igual" y se avisa.
if (version) {
  const chequeo = ejecutarSql(
    `select aplicada_en, aplicada_por from public.schema_migrations where version = '${version}';`
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

const r = ejecutarSql(sql);

const salida = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
if (r.status !== 0) {
  console.error(`✗ Error aplicando ${nombre}:\n`);
  console.error(salida);
  process.exit(1);
}

console.log(`✓ Migración aplicada: ${nombre}`);
if (salida) console.log(salida);

// Registro posterior: si esto falla, el DDL ya corrió — advertir, no
// tratar la migración completa como fallida (perder el registro es peor
// que seguir sin él).
if (version) {
  const insert = ejecutarSql(
    `insert into public.schema_migrations (version, nombre_archivo, checksum, aplicada_por) ` +
    `values ('${version}', '${nombre}', '${checksum}', '${aplicadaPor}') ` +
    `on conflict (version) do update set nombre_archivo = excluded.nombre_archivo, checksum = excluded.checksum, aplicada_por = excluded.aplicada_por, aplicada_en = now();`
  );
  if (insert.status !== 0) {
    console.warn(`⚠ La migración se aplicó pero no se pudo registrar en schema_migrations:\n${insert.stderr || insert.stdout || ''}`);
  } else {
    console.log(`✓ Registrada en schema_migrations (versión ${version}, por ${aplicadaPor})`);
  }
}
