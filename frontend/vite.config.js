import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Tailwind v4 se integra como plugin de Vite: procesa el @import
  // "tailwindcss" de styles/main.css y detecta clases usadas recorriendo el
  // grafo de módulos (plantillas .vue incluidas) — no hace falta un
  // `content: []` de tailwind.config.js como en v3.
  plugins: [vue(), tailwindcss()],
  root: '.',
  server: { port: 5173, open: true },
  build: { outDir: 'dist' },
});
