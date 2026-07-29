// Corre tests/db/triggers.test.sql contra el proyecto InsForge vinculado
// (o el indicado por INSFORGE_PROJECT_ID/INSFORGE_ACCESS_TOKEN en CI).
//
// El SQL termina SIEMPRE en `raise exception`, forzando rollback:
//   mensaje contiene 'TESTS_OK'        → pasa (exit 0)
//   mensaje contiene 'TESTS_FALLARON'  → falla (exit 1) con el detalle
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// El SQL viaja como UN argumento de CLI: los wrappers de npm en Windows
// (npx.cmd) truncan argumentos con saltos de línea. Se quitan los
// comentarios `--` (ninguna cadena del test los contiene) y se colapsa
// todo a una sola línea.
const sql = readFileSync(new URL('../tests/db/triggers.test.sql', import.meta.url), 'utf8')
  .split('\n')
  .map((linea) => linea.replace(/--.*$/, ''))
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim();

let r;
if (process.platform === 'win32') {
  // En Windows el SQL multilínea no sobrevive el quoting de cmd; se pasa
  // por PowerShell con here-string (literal, conserva saltos y comillas).
  const ps = `npx @insforge/cli db query -- @'
${sql}
'@`;
  r = spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], {
    encoding: 'utf8',
  });
} else {
  r = spawnSync('npx', ['@insforge/cli', 'db', 'query', '--', sql], { encoding: 'utf8' });
}

const salida = `${r.stdout || ''}\n${r.stderr || ''}`;

if (salida.includes('TESTS_OK')) {
  console.log('✓ Tests de triggers OK (008 exclusividad, 009 rotación, 017 reabrir, 019 transiciones, 031/032 kb_articulos) — rollback aplicado');
  process.exit(0);
}

console.error('✗ Tests de triggers fallaron:\n');
console.error(salida.trim());
process.exit(1);
