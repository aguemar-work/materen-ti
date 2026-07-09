// Aplica un archivo SQL de migrations/ contra el proyecto InsForge vinculado.
// En Windows evita el límite ~8 KB de cmd usando here-string de PowerShell.
//
// Uso:
//   node scripts/apply-migration.mjs migrations/021_areas_obras_trazabilidad.sql
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: node scripts/apply-migration.mjs migrations/0XX_nombre.sql');
  process.exit(1);
}

const ruta = resolve(process.cwd(), archivo);
const sql = readFileSync(ruta, 'utf8');
const nombre = basename(archivo);

let r;
if (process.platform === 'win32') {
  const ps = `npx @insforge/cli db query -- @'
${sql}
'@`;
  r = spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], {
    encoding: 'utf8',
  });
} else {
  r = spawnSync('npx', ['@insforge/cli', 'db', 'query', '--', sql], { encoding: 'utf8' });
}

const salida = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
if (r.status !== 0) {
  console.error(`✗ Error aplicando ${nombre}:\n`);
  console.error(salida);
  process.exit(1);
}

console.log(`✓ Migración aplicada: ${nombre}`);
if (salida) console.log(salida);
