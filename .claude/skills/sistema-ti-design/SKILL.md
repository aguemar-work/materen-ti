---
name: sistema-ti-design
description: Criterio de UX/UI para "Materen — Sistema TI" (panel interno de gestión de empleados, tickets, correos, licencias y equipos). El sistema de estilos se reinició a cero el 2026-09-05: no hay un estándar visual activo. Usa este skill cuando se cree o edite cualquier página, componente, tabla, tarjeta, tag, shell o formulario de este proyecto, para conocer qué NO asumir (no hay Carbon, no hay tokens) y qué reglas de producto/comportamiento siguen vigentes aunque el CSS esté vacío.
---

# Diseño visual — Materen · Sistema TI

## Lo primero: no hay sistema de diseño activo

El **2026-09-05** se retiró por completo el sistema visual anterior (IBM
Carbon Design System v11, que había sido el estándar desde el 2026-09-02):
`frontend/src/styles/main.css` y `carbon-theme.css` quedaron
intencionalmente vacíos, y ningún componente `.vue` tiene bloque `<style>`.
**No hay tokens, no hay Carbon, no hay ningún otro sistema todavía.**

- **No reintroducir Carbon (ni ningún otro design system) por iniciativa
  propia.** Si una tarea de UI parece necesitar una decisión visual (color,
  tamaño, radio, tipografía), es una pregunta para el usuario, no algo para
  resolver solo. Escribir CSS nuevo está bien; inventar un sistema de tokens
  nuevo sin que se pida, no.
- Antes de tocar algo visual, leer
  [`docs/NOTAS-DISENO-ANTERIOR.md`](../../../docs/NOTAS-DISENO-ANTERIOR.md):
  no es la guía vigente, pero rescata identidad de marca, principios de
  diseño puestos por el JEFE y qué reglas de accesibilidad siguen
  verificadas por tests aunque el CSS esté en cero.
- Los 5 scripts de guardrail que existían (`scripts/contraste.mjs`,
  `tokens-vs-guia.mjs`, `literales-vs-tokens.mjs`, `patrones-ui.mjs`,
  `clases-muertas.mjs`) ya no corren completos en CI — solo
  `patrones-ui.mjs` sigue siendo relevante (ver más abajo). Los demás
  dependían de tokens/CSS que ya no existen.

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
