import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Los tests importan las edge functions (functions/*.ts) directamente.
// El import `npm:@insforge/sdk` (sintaxis Deno) se resuelve a un stub:
// los helpers puros que se prueban nunca tocan el SDK.
export default defineConfig({
  resolve: {
    alias: {
      'npm:@insforge/sdk': fileURLToPath(new URL('./tests/stubs/insforge-sdk.js', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
