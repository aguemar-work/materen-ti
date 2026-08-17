// Lint de todo el repo: frontend/src (Vue 3 + JS, navegador) y functions/
// (Deno, TypeScript). Dos apps con runtime distinto — cada bloque de este
// archivo declara su propio `files`/`languageOptions`, nada se comparte a
// ciegas entre ambas. Ver docs/HISTORIAL-AUDITORIAS.md Q-04.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'frontend/coverage/**',
      '**/.vite/**',
    ],
  },

  // ── frontend/src: Vue 3 <script setup> + JS plano, navegador, ESM ──────
  {
    files: ['frontend/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
    },
  },
  ...vue.configs['flat/recommended'].map((cfg) => ({
    ...cfg,
    files: ['frontend/src/**/*.vue'],
  })),
  {
    files: ['frontend/src/**/*.vue'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
      // El repo ya tiene componentes compartidos de una sola palabra
      // (Modal.vue, Pagination.vue) — sirve como aviso, no bloquea CI por
      // un naming ya asentado que no se va a renombrar en este cambio.
      'vue/multi-word-component-names': 'warn',
    },
  },

  // ── functions/: edge functions Deno, TypeScript (sin type-aware linting:
  // el tsconfig.json de este directorio es para `deno check`, no para el
  // compilador de Node que usa typescript-eslint — mezclarlos falla al
  // resolver imports `npm:`/globals `Deno`) ──────────────────────────────
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ['functions/*.ts'],
  })),
  {
    files: ['functions/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, Deno: 'readonly' },
    },
  },

  // Debe ir al final: apaga reglas de estilo de ESLint que pisarían a
  // Prettier (no se usa eslint-plugin-prettier a propósito — Prettier corre
  // aparte, ver npm run format, para no convertir el repo existente en
  // cientos de errores de formato de golpe).
  prettierConfig,
];
