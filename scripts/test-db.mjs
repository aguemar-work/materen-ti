// Corre tests/db/triggers.test.sql contra el proyecto InsForge vinculado
// (o el indicado por INSFORGE_PROJECT_ID/INSFORGE_ACCESS_TOKEN en CI).
//
// El archivo tiene VARIOS bloques `do $$ ... end $$;` independientes (ver
// comentario en el propio .sql): el CLI en Windows termina pasando el SQL
// por un cmd.exe interno (npx.cmd es un batch shim) con límite ~8 KB de
// línea de comandos, así que un solo bloque gigante con toda la cobertura
// ya no entra. Cada bloque se manda en su propia llamada al CLI y se
// agregan los resultados acá.
//
// Cada bloque SIEMPRE termina en `raise exception`, forzando su propio
// rollback:
//   mensaje contiene 'TESTS_OK'        → ese bloque pasa
//   mensaje contiene 'TESTS_FALLARON'  → ese bloque falla, con el detalle
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const bloques = readFileSync(new URL('../tests/db/triggers.test.sql', import.meta.url), 'utf8')
  .split(/(?<=end \$\$;)/)
  .filter((bloque) => bloque.includes('do $$'))
  .map((bloque) =>
    bloque
      .split('\n')
      .map((linea) => linea.replace(/--.*$/, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );

function correrBloque(sql) {
  if (process.platform === 'win32') {
    // En Windows el SQL multilínea no sobrevive el quoting de cmd; se pasa
    // por PowerShell con here-string (literal, conserva saltos y comillas).
    const ps = `npx @insforge/cli db query -- @'
${sql}
'@`;
    return spawnSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], {
      encoding: 'utf8',
    });
  }
  return spawnSync('npx', ['@insforge/cli', 'db', 'query', '--', sql], { encoding: 'utf8' });
}

let huboFallo = false;
const detalles = [];

for (const [i, sql] of bloques.entries()) {
  const r = correrBloque(sql);
  const salida = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  if (salida.includes('TESTS_OK')) {
    detalles.push(`✓ Bloque ${i + 1}/${bloques.length} OK`);
  } else {
    huboFallo = true;
    detalles.push(`✗ Bloque ${i + 1}/${bloques.length} falló:\n${salida}`);
  }
}

console.log(detalles.join('\n'));

if (huboFallo) {
  console.error('\n✗ Tests de triggers fallaron');
  process.exit(1);
}

console.log('\n✓ Tests de triggers OK (008 exclusividad, 009 rotación, 017 reabrir, 019 transiciones, 031/032 kb_articulos, 033 problemas) — rollback aplicado');
process.exit(0);
