# Propuestas de la revisión integral v2 (2026-09-24) — pendientes de aprobación

Estos archivos cambian **las instrucciones que leen los agentes de código**, así
que no se aplicaron solos: los revisa y aprueba el dueño del repo.

| Propuesta | Reemplaza a | Qué cambia |
| --- | --- | --- |
| `AGENTS-v2.md` | `AGENTS.md` (553 líneas) | ~200 líneas: mismas 11 invariantes y reglas vigentes, sin la narrativa histórica ("se corrigió el 2026-08-xx porque…"), sin los 4 scripts de guardrail ya borrados, con los hechos de la v2 (4 edge functions, `migrations/rollback/`, `reservarVentanaActa`, `apply-migration.mjs` usa `db import`, 10 formularios con `useFormularioModal`). |
| `frontend-AGENTS-v2.md` | `frontend/AGENTS.md` (834 líneas) | ~90 líneas solo de reglas de UI. Hoy ese archivo es una copia de la raíz que ya diverge, más un log fechado de cada migración de UI. |

## Cómo aplicarlas

```bash
mkdir -p docs/archivo
git mv AGENTS.md docs/archivo/AGENTS-hasta-v1.md
git mv frontend/AGENTS.md docs/archivo/frontend-AGENTS-hasta-v1.md
git mv docs/propuestas/AGENTS-v2.md AGENTS.md
git mv docs/propuestas/frontend-AGENTS-v2.md frontend/AGENTS.md
```

La historia no se pierde: queda en `docs/archivo/` y ambas versiones nuevas
enlazan ahí.

## Ajuste pendiente en `.claude/skills/sistema-ti-design/SKILL.md`

- "Todavía NO decidido: tema oscuro (hoy sin estilos)" → el interruptor se
  retiró el 2026-09-24; sigue sin decidirse, con tokens semánticos como
  requisito previo.
- "Migrado todo salvo el portal público…" → migrado todo, incluidos portal
  público (`AppPortal`) y páginas de error.
- Agregar: confirmaciones desmontan con `@cerrado`; texto informativo mínimo
  `gray-500`; `AppButton` con `to`/`href`.
