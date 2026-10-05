import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Modo "maqueta" (`npm run dev:maqueta` = `vite --mode maqueta`): herramienta
// local de revisión de diseño, sin backend ni login. Reemplaza SOLO
// `src/api/client.js` por un cliente falso con datos inventados
// (`src/maqueta/client.js`); el resto de `api/` (dominios, mappers, barrel)
// sigue siendo el real, así las vistas reciben exactamente las formas de
// siempre. El plugin solo se agrega con `mode === 'maqueta'`: `vite`,
// `vite build` y `vitest` nunca lo cargan, así que `src/maqueta/` no puede
// terminar en el bundle de producción (nada lo importa fuera de este plugin).
function pluginMaqueta() {
  const clienteFalso = fileURLToPath(new URL('./src/maqueta/client.js', import.meta.url));
  return {
    name: 'maqueta-cliente-falso',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.includes('client')) return null;
      const resuelto = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resuelto && resuelto.id.replace(/\\/g, '/').endsWith('/src/api/client.js')) {
        return clienteFalso;
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Tailwind v4 se integra como plugin de Vite: procesa el @import
  // "tailwindcss" de styles/main.css y detecta clases usadas recorriendo el
  // grafo de módulos (plantillas .vue incluidas) — no hace falta un
  // `content: []` de tailwind.config.js como en v3.
  plugins: [...(mode === 'maqueta' ? [pluginMaqueta()] : []), vue(), tailwindcss()],
  root: '.',
  server: { port: 5173, open: mode !== 'maqueta' },
  build: { outDir: 'dist' },
}));
