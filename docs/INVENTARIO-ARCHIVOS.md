# Inventario de archivos — Materen · Sistema TI

> Qué archivos del repo sirven, cuáles eran redundantes/sin uso (y ya se
> limpiaron), y qué falta por crear. Verificado contra el código real el
> 2026-08-11 (3 barridos de solo-lectura), no de memoria. Los gaps de
> herramientas/tests que requieren trabajo de ingeniería (no solo borrar
> algo) están en `docs/HISTORIAL-AUDITORIAS.md` — acá solo se referencian,
> para no duplicar contenido.

## Resumen ejecutivo

- **5 limpiezas aplicadas** en este ciclo: 1 archivo legado eliminado, 2
  archivos de caché destrackeados, 5 reglas CSS muertas borradas, 1
  comentario obsoleto limpiado.
- **0 componentes `.vue` huérfanos**, **0 módulos `.js` sin importador**,
  **0 dependencias de `package.json` sin uso** — el código de dominio del
  frontend está limpio; no había basura estructural, solo residuos de CSS y
  de raíz.
- **2 hallazgos nuevos** que no estaban en ningún informe previo: sin tests
  para `encuestas.ts`/`personal-registro.ts`, y sin changelog de producto ni
  plantillas de GitHub. Se agregaron a `docs/HISTORIAL-AUDITORIAS.md`
  (Q-06, W-06).

---

## 1. Limpieza aplicada en este ciclo (2026-08-11)

| Archivo / regla | Qué era | Acción | Evidencia |
|---|---|---|---|
| `sistema_credenciales_ti.html.bak` | Prototipo HTML monolítico pre-Vue (38 KB), un solo commit histórico (`9fa3b8f`) | **Eliminado** (`git rm`) | Sin ninguna referencia funcional en el repo; solo se citaba en documentación de auditoría |
| `.vite/deps/_metadata.json`, `.vite/deps/package.json` | Caché de dependencias de Vite, trackeado por error | **Destrackeado** (`git rm --cached`) + `.vite/` agregado a `.gitignore` raíz | `git ls-files .vite` los listaba; `.gitignore` no tenía entrada para `.vite` |
| `main.css` → `.toolbar-actions` | Regla CSS (~línea 648) | **Borrada** | 0 usos en `frontend/src/**/*.vue`, `.js` |
| `main.css` → `.stat-icon.total/.active/.inactive/.suspended` | 4 reglas CSS (~líneas 501-504) | **Borradas** | `DashboardView.vue` usa `.stat-icon` (base, se mantiene) con sus propios modificadores BEM en `<style scoped>` (`stat-icon--empleados`, etc.); nunca combina `.stat-icon` con `.total`/`.active`/`.inactive`/`.suspended` |
| `CorreosView.vue:419` | Comentario `/* .badge-libre y .badge-rotar: ... */` | **Eliminado** | Ambas clases ya no existen en `main.css` (se borraron en el commit `6f10d46`, previo a esta sesión) — el comentario quedó apuntando a algo inexistente |
| `docs/GUIA-UX-UI.md` | Decía que `.cred-card`, `.tool-tag`/`.tool-input`, `.user-cell`, `.detail-header`/`.detail-grid`/`.detail-item` y las clases antiguas de badges "siguen definidas pero sin uso" | **Corregido**: ya no existen en absoluto (no es residuo, se eliminaron). También se sacó `.modal-detail` de esa lista — sí está en uso | Ver §2 abajo |

## 2. Confirmado en uso — no tocar

Verificado por grep, no por suposición:

- **66 componentes `.vue`** en `frontend/src/modules/` y `components/`: todos tienen ≥1 consumidor (ruta en `router/routes/*.js`, import estático en `App.vue`/`router/index.js`, o import desde otro componente). Cero huérfanos.
- **Todos los `.js` de `api/domains/`, `core/`, `composables/`**: cada uno tiene al menos un importador confirmado.
- **Las 6 `dependencies` de `frontend/package.json`** (`@insforge/sdk`, `jspdf`, `jspdf-autotable`, `pinia`, `vue`, `vue-router`): todas se usan.
- **`sistema_credenciales_ti.html`** (sin `.bak`, 343 bytes): no es legado — es un redirect intencional a `./frontend/` para quien llegue a la URL vieja.
- **Los 3 scripts de `scripts/`** (`apply-migration.mjs`, `test-db.mjs`, `contraste.mjs`): todos referenciados desde `ci.yml`, `README.md` o `AGENTS.md`.
- **`frontend/.env`** (gitignored, no trackeado) y **`frontend/dist/`** (no trackeado): correctos como están, sin filtración de secretos ni build commiteado.
- **`.modal-detail`** (`main.css`): en uso real (`CuentasPanel.vue`, `EquiposView.vue`) — la guía lo tenía mal clasificado, ya corregido.
- **`BuscadorEmpleado.vue`**: mencionado en la guía como "reemplazado por `BuscadorCombo.vue`" — ya no existe en el árbol de trabajo, la limpieza ya se hizo (no es pendiente).

## 3. Gaps — archivos que faltarían

Estos no son "borrar algo", son piezas de ingeniería/proceso que el proyecto
no tiene todavía. Ya están registradas con su estado en
`docs/HISTORIAL-AUDITORIAS.md` — no se implementan en este ciclo, solo se
deja el inventario:

| Falta | Hallazgo | Por qué importaría |
|---|---|---|
| `@vue/test-utils` + tests de componentes | Q-02/Q-03 | 66 componentes sin ningún test, incluidos los de flujos irreversibles (`BajaEmpleadoModal`) |
| Tests para `functions/encuestas.ts` y `functions/personal-registro.ts` | **Q-06 (nuevo)** | A diferencia de `credenciales.ts`/`tickets.ts`, quedaron sin cobertura desde que se crearon |
| `CONTRIBUTING.md` propio | A-05/W-04/Q-05 | La convención de commits (`fix(scope):`, `feat(scope):`) existe de hecho y no está escrita en ningún lado |
| `docs/adr/` | A-05 | Las decisiones ya tomadas viven dispersas en `PANORAMA_SISTEMA.md` §6 |
| Diagrama de arquitectura general | W-05 | El único diagrama Mermaid del repo es el de tokens de diseño en `GUIA-UX-UI.md`, no cubre frontend/backend/edge functions/BD |
| Cabeceras CSP/HSTS en `vercel.json` | S-04 | App que muestra contraseñas descifradas, sin defensas de navegador |
| Observabilidad de errores (Sentry o similar) | D-01 | Hoy el primer aviso de un fallo es una llamada de un usuario |
| Changelog de producto + plantillas de PR/issue en `.github/` | **W-06 (nuevo)** | `docs/CHANGELOG.md` es de documentación, no de producto; `.github/` solo tiene `ci.yml` |

**Actualización 2026-08-16**: cerrado el gap de ESLint/Prettier/`tsconfig.json` de la tabla de arriba (Q-04, ver `docs/HISTORIAL-AUDITORIAS.md`). Archivos nuevos, todos en la raíz del repo (no dentro de `frontend/`, porque cubren tanto `frontend/src` como `functions/`): `package.json` (solo tooling — `frontend/package.json` sigue siendo el único con las dependencias de runtime de la app), `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `functions/tsconfig.json`. Nuevo job `lint-y-typecheck` en `.github/workflows/ci.yml`.

## Cómo mantener esto al día

Cuando se borre/agregue un archivo con impacto estructural (no un cambio de
contenido dentro de un archivo existente), actualizar la tabla de la
sección 1 o 3 en el mismo cambio — misma regla de `AGENTS.md` que aplica al
resto de la documentación.
