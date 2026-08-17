## Qué cambia y por qué

<!-- Una frase. Si necesitas la palabra "y" más de una vez, probablemente
     esto debería ser dos PRs — ver CONTRIBUTING.md. -->

## Checklist

- [ ] **Documentación actualizada en el mismo cambio** (regla de `AGENTS.md`,
      no es opcional): si este PR cambia dominio, seguridad, esquema o UI,
      se actualizó `README.md` / `docs/PANORAMA_SISTEMA.md` /
      `docs/GUIA-UX-UI.md` según corresponda, más una línea en
      `docs/CHANGELOG.md`. Si el PR solo toca código sin cambiar
      comportamiento visible (refactor puro, fix de typo), marca esta
      casilla igual y anota "sin cambio de documentación necesario".
- [ ] **Tests en verde**: `cd frontend && npm run build && npm test` corrido
      localmente antes de abrir el PR (o el check de CI ya está verde).
- [ ] **Capa de deploy afectada** (si el PR toca esquema o una edge
      function — marca todas las que apliquen; son 3 capas independientes,
      un `git revert` de este PR NO deshace las otras dos):
  - [ ] Frontend (Vercel — se despliega solo, con el merge/push)
  - [ ] Edge function (`npx @insforge/cli functions deploy <nombre> --file functions/<nombre>.ts` — manual, no se despliega solo)
  - [ ] Esquema/datos de BD (`migrations/0XX_....sql`, aplicado a mano — ver `AGENTS.md` para `db import` vs `db query`)
  - [ ] Ninguna de las anteriores

## Migración (si aplica)

<!-- Número y nombre del archivo en migrations/. ¿Se probó en un branch de
     InsForge antes de producción? ¿Hay backfill? ¿Se verificó el resultado
     después de aplicar? -->
