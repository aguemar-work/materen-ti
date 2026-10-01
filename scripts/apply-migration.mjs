// EN DESUSO — alias de `node scripts/deploy.mjs migracion <archivo>`.
//
// Uso (igual que antes):
//   node scripts/apply-migration.mjs migrations/0XX_nombre.sql [--force]
//
// Desde el Ciclo 21 (H1-3) la aplicación de migraciones vive en scripts/deploy.mjs,
// que agrega los pre-chequeos de la invariante 12 de AGENTS.md ("commit antes que
// producción": árbol limpio, HEAD en origin/main, migración comiteada), ejecuta el
// bloque "-- Verificación" y registra checksum/commit/entorno en schema_migrations.
// Este archivo solo traduce los argumentos viejos y delega, así que ya NO se puede
// aplicar una migración sin comitear con él (a propósito).
//
// Equivalencias: --force -> --forzar. El resto de las opciones de deploy.mjs
// (--dry-run, --entorno, --solo-registro, --proyecto) se pasan tal cual.
//
// Historia (por qué el mecanismo es `db import` por archivo temporal y no un
// argumento de línea de comandos — incidente de la migración 073, 2026-08-18 —,
// y los tres gotchas del CLI): docs/GOTCHAS-CLI.md y la cabecera de
// scripts/lib/insforge-sql.mjs. El texto largo que había acá está en el historial de git.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [archivo, ...resto] = process.argv.slice(2);
if (!archivo || archivo.startsWith('--')) {
  console.error('Uso: node scripts/apply-migration.mjs migrations/0XX_nombre.sql [--force]\n(en desuso: use node scripts/deploy.mjs migracion <archivo>)');
  process.exit(1);
}

console.warn('⚠ apply-migration.mjs está en desuso: delega en scripts/deploy.mjs (que exige commit antes que producción).');
const deploy = resolve(dirname(fileURLToPath(import.meta.url)), 'deploy.mjs');
const args = [deploy, 'migracion', archivo, ...resto.map((a) => (a === '--force' ? '--forzar' : a))];
const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
