# Changelog de documentación

> Registro discreto de cambios a la documentación del proyecto (no del
> producto — para eso están los commits y `migrations/`). Una línea por
> actualización; el detalle vive en el propio documento tocado. No forma
> parte de la lectura principal de README/AGENTS/PANORAMA/GUIA-UX-UI: es
> solo un rastro de cuándo y por qué se actualizó cada uno.
>
> Regla asociada (`AGENTS.md`, "Reglas del proyecto"): toda modificación de
> código/esquema que cambie dominio, seguridad o UI debe actualizar la
> documentación correspondiente en el mismo cambio, y dejar una línea acá.

- **2026-08-11** — Inventario de archivos (`docs/INVENTARIO-ARCHIVOS.md`,
  nuevo): limpieza confirmada de bajo riesgo aplicada — eliminado
  `sistema_credenciales_ti.html.bak`, destrackeado `.vite/deps/*` (+
  `.gitignore`), borradas 5 reglas CSS muertas en `main.css`, limpiado un
  comentario obsoleto en `CorreosView.vue`, corregidas las secciones de
  clases legacy de `docs/GUIA-UX-UI.md` (decían "sin uso", en realidad ya
  no existen). Se agregaron 2 hallazgos nuevos a
  `docs/HISTORIAL-AUDITORIAS.md` (Q-06, W-06) y se marcaron D-04/D-05 como
  resueltos.
- **2026-08-11** — Revisión general de toda la documentación: `README.md`
  (migraciones 039–047, módulos Notificaciones/Encuestas/Pre-registro de
  personal), `AGENTS.md` (vigencia, regla de "docs por cambio"),
  `docs/PANORAMA_SISTEMA.md` (esquema hasta 047, decisiones revisadas),
  `docs/GUIA-UX-UI.md` (vigencia, componente `NotificacionesCampana`). Se
  fusionaron los dos informes de auditoría sueltos en la raíz en
  `docs/HISTORIAL-AUDITORIAS.md` (con estado reconciliado hallazgo por
  hallazgo) y se crea este changelog.
