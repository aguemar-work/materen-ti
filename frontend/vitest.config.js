import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// Los tests importan las edge functions desde functions/dist/*.ts (el archivo
// autocontenido que genera scripts/build-functions.mjs y que es lo que se despliega).
// El import `npm:@insforge/sdk@<version>` (sintaxis Deno, versión fijada —
// ver docs/HISTORIAL-AUDITORIAS.md H-12) se resuelve a un stub: los helpers
// puros que se prueban nunca tocan el SDK. Regex (no string exacto) para que
// un futuro bump de versión en functions/ no rompa este alias también.
export default defineConfig({
  // Necesario para los tests de tests/componentes/, que montan .vue de verdad.
  // No afecta al resto: los tests de lógica pura no importan componentes.
  plugins: [vue()],
  resolve: {
    alias: [
      // Assets de publicDir referenciados con ruta absoluta desde un
      // template (`<img src="/logo.svg">`): sin servidor no resuelven y el
      // import revienta antes de montar. Ver tests/stubs/asset-publico.js.
      { find: /^\/[\w.-]+\.(svg|png|jpg|jpeg|webp|ico)$/, replacement: fileURLToPath(new URL('./tests/stubs/asset-publico.js', import.meta.url)) },
      { find: /^npm:@insforge\/sdk(@.*)?$/, replacement: fileURLToPath(new URL('./tests/stubs/insforge-sdk.js', import.meta.url)) },
    ],
  },
  test: {
    // 'node' sigue siendo el default a propósito: 213 de los tests son de
    // lógica pura y no deben pagar el costo de levantar un DOM. Los que sí lo
    // necesitan lo piden por archivo con el docblock
    // `// @vitest-environment happy-dom` (ver tests/componentes/).
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
