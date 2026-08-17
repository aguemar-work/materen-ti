# Contribuir a Materen — Sistema TI

Guía corta: cómo se estructuran los commits y los PR en este repo. No sustituye
`AGENTS.md` (reglas del proyecto) ni `docs/PANORAMA_SISTEMA.md` (esquema y
decisiones) — léelos primero si vas a tocar dominio, seguridad o esquema.

## Convención de commits

El repo ya usa esta convención de hecho desde los primeros commits, pero no
estaba escrita en ningún lado hasta ahora. Formato:

```
tipo(alcance): descripción breve en español, minúsculas
```

- **tipo**: `feat` (funcionalidad nueva), `fix` (corrección de bug), `docs`
  (solo documentación), `refactor` (cambio de estructura sin cambiar
  comportamiento), `test` (solo tests). Siempre en minúscula.
- **alcance**: el módulo o dominio que cambia — `empleados`, `tickets`,
  `credenciales`, `design-system`, `db`, etc. Puede ser más de uno separado
  por coma si el cambio realmente los toca a todos por la misma razón.
- **descripción**: en español, imperativo o sustantivado, sin punto final.

Ejemplos reales de este repo:

```
fix(db): eliminar sobrecarga ambigua de crear_notificacion() (T-05)
feat(licencias): unificar asignacion a empleado sin importar tipo de licencia
docs(design-system): documentar el porteo de design.pen a produccion (Fases A-E)
refactor(layout): dividir AppLayout.vue en AppSearch/AppNav/AppNotifications
```

## Un commit = un cambio coherente

Esta es la regla que más se rompe, y la más importante. **Un commit debe
poder describirse en una frase, y esa frase debe ser verdad para el 100% de
los archivos que incluye.** Si necesitas la palabra "y" más de una vez para
describir qué hizo el commit, probablemente son dos commits (o más).

Un commit grande y variado no es "eficiente" — es un commit que nadie puede
revisar de verdad, que nadie puede revertir sin arrastrar cosas que no
quería revertir, y donde un cambio no relacionado y sin documentar se cuela
sin que nadie lo note.

**Caso real de este repo (commit `030cc89`, 2026-08-15, mensaje: "Pruebas")**:
un solo commit tocó 30+ archivos sin relación entre sí — equipos, staff,
auth, licencias, tickets — bajo un mensaje que no describía ninguno de
ellos. Entre esos cambios, sin mencionarlo en ningún lado, se retiró la
sección de "Backlog pendiente" del reporte de tickets (el dato, el modal Y
el PDF a la vez) y se cambió la forma de otros dos campos del mismo reporte.
El resultado:

- CI quedó en rojo (`build-y-tests` → failure) desde ese commit y **nadie lo
  notó durante más de un día** — el siguiente commit, sobre un tema
  completamente distinto, se pusheó igual sobre el rojo sin que nadie lo
  viera.
- Cuando finalmente se investigó, hizo falta reconstruir con `git log -p` y
  bisección manual, commit por commit, solo para averiguar QUÉ había
  cambiado y CUÁNDO — trabajo que un commit bien recortado no habría
  necesitado, porque el propio mensaje lo habría dicho.
- No hubo manera de saber, sin investigar, si el retiro del backlog fue una
  decisión real o un descuido — la respuesta (fue real, confirmada después)
  debería haber estado en el commit desde el día uno, no reconstruida una
  semana después.

Ningún paso de este episodio fue malicioso ni negligente en el sentido
grave — es exactamente el tipo de cosa que pasa cuando se junta trabajo de
varias sesiones en un solo commit al final del día. Por eso es la regla:
no porque alguien lo haya hecho mal a propósito, sino porque es fácil que
pase si no se cuida a propósito.

Si estás trabajando en varias cosas a la vez, **commitea cada una por
separado apenas esté lista**, aunque eso signifique varios commits chicos en
vez de uno grande al final.

## Antes de abrir un PR

Ver `.github/pull_request_template.md` — se completa solo al abrir el PR,
pero en resumen:

- Documentación actualizada en el mismo cambio (regla de `AGENTS.md`): si
  tocaste dominio, seguridad, esquema o UI, actualiza
  `README.md`/`docs/PANORAMA_SISTEMA.md`/`docs/GUIA-UX-UI.md` según
  corresponda, más una línea en `docs/CHANGELOG.md`.
- `cd frontend && npm run build && npm test` en verde.
- Si el cambio toca esquema o una edge function, qué capa de deploy se ve
  afectada (frontend/Vercel, edge function, esquema de BD — son 3
  independientes, ver `AGENTS.md`).
