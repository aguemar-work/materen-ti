import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Los tests importan las edge functions (functions/*.ts) directamente.
// El import `npm:@insforge/sdk@<version>` (sintaxis Deno, versión fijada —
// ver docs/HISTORIAL-AUDITORIAS.md H-12) se resuelve a un stub: los helpers
// puros que se prueban nunca tocan el SDK. Regex (no string exacto) para que
// un futuro bump de versión en functions/*.ts no rompa este alias también.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^npm:@insforge\/sdk(@.*)?$/, replacement: fileURLToPath(new URL('./tests/stubs/insforge-sdk.js', import.meta.url)) },
    ],
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
