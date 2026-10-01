# Gotchas del CLI de InsForge y de las migraciones

> Extraído de `AGENTS.md` (2026-08-31) para que no ocupe contexto en cada
> tarea: son detalles de **ejecución** que solo importan cuando estás
> aplicando una migración o peleando con el CLI en Windows. Las reglas duras
> (qué NO usar) siguen en `AGENTS.md`; acá está el porqué y el cómo.

**Leer esto es obligatorio antes de aplicar una migración**, no opcional: los
tres gotchas de abajo tienen causas raíz distintas y cada uno tiene su propio
workaround. Aplicar una migración sin conocerlos termina en un archivo
parcialmente ejecutado y sin registro de qué quedó aplicado.

## Cómo se aplica una migración

Archivos numerados `migrations/0XX_nombre.sql` (comentados, en español). Se
aplican manualmente:

```bash
npx @insforge/cli db query --json -- "$(cat migrations/0XX_nombre.sql)"
```

**NO se usa `db migrations up`**: los nombres `0XX_snake_case.sql` son
incompatibles con el formato timestamp que exige ese subsistema, y su historial
remoto está vacío a propósito por no haberse usado nunca.

Desde la migración 069 se registra en `public.schema_migrations` qué versión
quedó aplicada, y desde el Ciclo 21 lo hace `scripts/deploy.mjs migracion`
(verifica antes de reaplicar por error, salvo `--forzar`; exige árbol limpio y
HEAD en `origin/main`; guarda checksum, `commit_sha` y entorno).
`apply-migration.mjs` es un alias en desuso que delega ahí. No reemplaza el CLI
nativo, es tracking propio.

**Verificar siempre después de aplicar** (`db query "select ..."` sobre la
tabla/columna afectada): tanto `db query` como `db import` pueden reportar un
error habiendo ejecutado parte de los statements.

## Los tres gotchas del CLI

Tienen causas raíz distintas y no se pisan entre sí — mirá cuál aplica a tu
caso antes de elegir el workaround:

| Gotcha | Cuándo aparece | Workaround |
| --- | --- | --- |
| Límite de línea de comandos (031, jul 2026) | DDL rechazado con `Query could not be parsed...` | `db import <archivo.sql>`, partido por concepto |
| Dollar-quoting (038, 2026-08-05) | `create function` / `do $ ... $` → `{"error":"no language specified"}` | `db import` o `apply-migration.mjs` (que usa `db import` desde 2026-08-18); nunca `db query` |
| `ENAMETOOLONG` de PowerShell (062, 2026-08-17) | **Ya no aplica**: la versión del script que lo causaba se retiró el 2026-08-18 | — (histórico, ver abajo) |

Detalle de cada uno:

- **Windows + `db query`**: límite de línea de comandos ~8 KB y ejecución poco
 fiable de múltiples statements DML en una llamada. Para updates masivos:
 un solo `UPDATE ... FROM (VALUES ...)` por lote.
- **Estado actual de `scripts/apply-migration.mjs` (desde 2026-08-18,
 migración 073)**: escribe el SQL a un archivo temporal y lo aplica con
 `db import <ruta>`; solo sus dos consultas de control de una línea van por
 `db query`. Por eso ya no sufre ni el truncamiento de cmd.exe, ni el
 dollar-quoting, ni el `ENAMETOOLONG` de los dos párrafos siguientes, que
 quedan como historia. Sigue valiendo el crash de `db import` y la
 verificación posterior obligatoria.
- **(Histórico) Gotcha distinto en `scripts/apply-migration.mjs` con archivos grandes
 (verificado 2026-08-17, migración 062)**: el script evita el límite de
 `cmd.exe` de arriba con un here-string de PowerShell (`-EncodedCommand`),
 pero ese mismo mecanismo falla con `ENAMETOOLONG` en archivos de varios KB
 (con comentarios) — el `-EncodedCommand` va en base64/UTF-16LE, que infla
 el tamaño ~2.7× y termina superando el límite de línea de comandos de
 `CreateProcess` en Windows (~32767 caracteres), distinto del límite de
 `cmd.exe`. Mitigación: aplicar con `npx @insforge/cli db query "<sql>"`
 directo (sin el script, sin PowerShell de por medio) en varios lotes por
 concepto, cada SQL en **una sola línea** (los saltos de línea reales como
 argumento fallan con `Query is required`). El archivo único en
 `migrations/` se conserva igual como fuente de verdad — mismo criterio que
 el gotcha de la migración 031 de arriba.
- **Gotcha del CLI en Windows (jul 2026, migración 031)**: `db query` (incluso
 vía `scripts/apply-migration.mjs`, que ya evita el límite de línea de
 comandos con un here-string de PowerShell) puede rechazar DDL con
 `Query could not be parsed and was rejected for security reasons` sin
 razón aparente — pasó incluso con un `CREATE TABLE` mínimo. `db import
 <archivo.sql>` (sin `--truncate`) es más confiable para DDL, pero puede
 crashear (`Assertion failed ... src\win\async.c`) con archivos grandes que
 mezclan CREATE TABLE + RLS + DML en un solo archivo. Mitigación que
 funcionó: partir la migración en archivos temporales por concepto (tabla+
 triggers, políticas RLS, backfill de datos, ALTER final) y aplicar cada uno
 por separado con `db import`. El archivo único en `migrations/` se
 conserva igual como fuente de verdad — el fraccionamiento es solo para la
 ejecución, no cambia la convención de un archivo por migración.
 **Verificar siempre después de aplicar** (`db query "select ..."` sobre la
 tabla/columna afectada): un `db import` que reporta error igual puede haber
 ejecutado parte de los statements antes de crashear.
- **Gotcha del CLI (verificado 2026-08-05, migración 038)**: `db query` (con o
 sin `scripts/apply-migration.mjs`, en bash o en PowerShell — no es un
 problema de shell) **no soporta cuerpos de función/bloque con dollar-quoting
 (`$$ ... $$`)**: falla con `{"error":"no language specified"}` incluso en un
 `CREATE FUNCTION` de una sola línea sin ningún `;` interno. Cualquier
 migración con `create function`/`do $$ ... end $$` (la mayoría desde la 008)
 debe aplicarse con `db import <archivo.sql>` (o `apply-migration.mjs`, que
 usa `db import` desde 2026-08-18), nunca con `db query`. `db import` puede seguir
 reportando el crash de cliente (`Assertion failed ... src\win\async.c`) de
 arriba aun cuando el statement se ejecutó bien en el servidor — la
 verificación posterior sigue siendo obligatoria en ambos casos.
