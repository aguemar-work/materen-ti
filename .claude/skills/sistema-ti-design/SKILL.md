---
name: sistema-ti-design
description: Criterio de UX/UI para "Materen — Sistema TI" (panel interno de gestión de empleados, tickets, correos, licencias y equipos). La base visual es PrimeVue v4 Unstyled + Tailwind v4 (desde 2026-09-07; Carbon se retiró el 2026-09-05). Usa este skill cuando se cree o edite cualquier página, componente, tabla, tarjeta, tag, shell o formulario de este proyecto, para conocer qué está decidido, qué NO asumir y qué reglas de producto/comportamiento siguen vigentes.
---

# Diseño visual — Materen · Sistema TI

## Lo primero: qué está decidido y qué no

El **2026-09-05** se retiró por completo IBM Carbon v11. El **2026-09-07**
se decidió la base nueva, y las reglas viven en `frontend/AGENTS.md`,
sección "UI/UX" — leerla antes de tocar UI. En resumen:

- **PrimeVue v4 en modo Unstyled + Tailwind v4.** Ninguna vista importa
  `primevue/*` directo: todo pasa por `components/ui/*` (wrapper) + su
  preset `components/ui/pt/*.pt.js`. Ningún `.vue` tiene bloque `<style>`.
- **Tokens solo en el `@theme` de `frontend/src/styles/main.css`**: la
  rampa `--color-primary-50..950` (azul `#0064E0`) y `--font-sans`. Un solo
  acento de marca; no sumar escalas success/warn/info por iniciativa propia.
- **Decidido a pedido (2026-09-22):** tipografía Inter Variable e íconos
  Tabler (`ti ti-*`), los dos servidos desde el bundle; shell claro y
  fundido (header + SideNav blancos, workspace `gray-50`, separados por
  1px). Clases compartidas del shell: `components/shared/shellClases.js`.
- **Todavía NO decidido** (preguntar, no completar solo): tema oscuro (hoy
  sin estilos), tonos de avatar, colores de estado propios más allá de la
  paleta estándar de Tailwind.
- Guía visual completa (tokens, componentes, recetas de página, copy):
  [`docs/SISTEMA-DISENO.md`](../../../docs/SISTEMA-DISENO.md). Referencia
  de implementación: módulo Empleados.
- Migrado todo (2026-09-23) salvo el portal público/sin sesión
  (`auth/LoginView`, `entregas/EntregaView`, `soporte/SoporteView`) y las
  páginas de `errores/` — receta 4.5 de la guía, pendientes.
- Antes de tocar algo visual, leer también
  [`docs/NOTAS-DISENO-ANTERIOR.md`](../../../docs/NOTAS-DISENO-ANTERIOR.md):
  identidad de marca, principios de diseño puestos por el JEFE (minimalista,
  hover sin bordes, acento ≤2px solo a la izquierda, un acento fuerte por
  vista, peso visual proporcional) y reglas de accesibilidad verificadas
  por tests.
- De los 5 scripts de guardrail de diseño solo `patrones-ui.mjs` corre en
  CI; los demás dependían de tokens/CSS de Carbon.

## Qué sigue vigente (comportamiento y producto, no visual)

Esto no depende de qué CSS tenga el sistema — es criterio de producto o
contrato de accesibilidad verificado por los 40 tests de render de
`frontend/tests/componentes/`:

- **Permisos no son estética.** El SideNav (`AppNav.vue`) nunca es la
  barrera: es el reflejo del guard de `router/guards.js` y de RLS. Mostrar
  un ítem que el guard bloquea produce un enlace que rebota al dashboard y
  escribe una fila de acceso denegado en cada clic. Antes de "abrir" o
  "cerrar" una entrada del nav, leer qué declara realmente la ruta
  (`meta.roles`, `meta.modulo`).
- **Copy impersonal, nunca tuteo.** Títulos sustantivados ("Editar
  empleado"), imperativo de usted en formularios y errores ("Complete el
  campo", "Vuelva a iniciar sesión"). Un "No tienes permiso" es un bug de
  copy.
- **Todo diálogo modal pasa por `components/shared/Modal.vue`**, nunca a
  mano — centraliza `role="dialog"`, `aria-modal`, foco atrapado y cierre
  con Escape.
- **Toda imagen lleva `alt`; todo botón solo-ícono tiene nombre accesible**
  (`aria-label` o equivalente) — lo verifica `scripts/patrones-ui.mjs` en
  CI, el único de los 5 guardrails de diseño que sigue corriendo.
- **No cambies la estructura, la navegación ni el copy** salvo que el
  usuario lo pida explícitamente.

## Contexto del producto

Sistema TI es una herramienta **interna** (no un sitio de marketing): un
administrador de TI la usa para gestionar accesos, tickets, empleados,
correos compartidos, licencias y equipos. El objetivo es **legibilidad,
densidad de información y confianza**, no impacto visual.

El producto nació como panel de credenciales, creció a ITSM y la dirección
de crecimiento es ERP. Al diseñar algo nuevo, asumir que va a convivir con
módulos de otros dominios (RRHH, Finanzas), no solo de TI. Nombre del
producto en UI: **Materen — Sistema TI** (`frontend/src/core/marca.js`).
