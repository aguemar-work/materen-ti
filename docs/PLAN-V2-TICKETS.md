# PLAN V2 — Materen Sistema TI · Módulo Tickets

> Documento de ejecución para Claude Code. Léelo completo antes de tocar código.
> Origen: auditoría UX/ITSM del módulo Tickets + decisiones de producto tomadas después.

---

## 0. Cómo debes trabajar con este plan

### Glosario obligatorio
- **TÉCNICO**: usuario del sistema que atiende tickets (incluye al rol JEFE cuando se indique).
- **USUARIO**: persona solicitante que crea tickets desde el portal.
- Usa estos dos términos exactos en código nuevo, textos de UI, comentarios y commits. No mezcles "empleado", "solicitante", "agente" en código nuevo; si el código existente usa otros nombres, no los renombres de forma masiva sin pedir autorización.

### Reglas de ejecución
1. **Trabaja fase por fase, tarea por tarea, en el orden indicado.** Hay dependencias reales entre fases (el modelo de datos va antes que la UI).
2. **Checkpoints obligatorios.** Al terminar cada fase, detente y entrega el reporte de checkpoint (formato en la sección 9). No empieces la fase siguiente sin aprobación explícita.
3. **Antes de cada tarea, verifica el estado real del código.** Las rutas y líneas citadas vienen de la auditoría y pueden haber cambiado. Si un hallazgo ya no existe o es distinto, dilo en el reporte; no fuerces el cambio.
4. **No toques** la migración 088 ni `credenciales.ts` (cambios sin commitear ajenos a este plan). Si bloquean tu trabajo, detente y pregunta.
5. **Migraciones:** numéralas a continuación de la última existente. Cada migración debe ser reversible o incluir un script de rollback. Nunca borres datos históricos; si hay que transformarlos, haz backfill y documenta qué no se pudo reconstruir.
6. **No inventes datos históricos.** Si un evento viejo no tiene actor, queda como "actor no registrado (legado)", nunca asignes uno supuesto.
7. **La regla de negocio vive en la base de datos, no solo en la UI.** Toda restricción (transiciones, campos obligatorios, permisos) se aplica en Postgres (trigger/RPC/RLS). La UI solo la refleja.
8. **Respeta las reglas existentes del repo** (`frontend/AGENTS.md`, wrappers de PrimeVue Unstyled en `components/ui/*`, estilos por Pass-Through en `pt/*.pt.js`, Tailwind v4). No agregues librerías nuevas sin justificarlo en el checkpoint.
9. **Tests:** cada tarea incluye tests (unitarios de dominio, tests de RPC/trigger en SQL cuando sea posible, y de componente para UI crítica). Una tarea sin test no está terminada.
10. **Un commit por tarea**, con mensaje `v2(tickets): <id tarea> <descripción corta>`.
11. **Documentación viva:** actualiza `PANORAMA-SISTEMA.md` al cerrar cada fase con los cambios de modelo y flujo.
12. **Si algo del plan es técnicamente incorrecto o hay una forma claramente mejor, dilo antes de implementarlo.** No ejecutes a ciegas; tampoco cambies el alcance sin avisar.

---

## 1. Decisiones de producto (cerradas)

| # | Decisión |
|---|---|
| D1 | Debe existir un **tiempo máximo de atención** del TÉCNICO. Si se supera, el sistema **vuelve a avisar**. No es un SLA contractual: es una alarma interna. |
| D2 | **Doble cierre.** El TÉCNICO marca el ticket como resuelto; el USUARIO confirma el cierre. Luego el USUARIO completa la encuesta de satisfacción. Si el USUARIO rechaza el cierre, el ticket **se reabre y se notifica** al TÉCNICO. |
| D3 | Los **reportes son necesarios** para enviar información a las personas interesadas. |
| D4 | La accesibilidad es **buena práctica deseable**, no requisito formal. Aun así, todo lo que no se pueda operar con teclado se considera funcionalidad rota y se corrige. |

## 2. Decisiones abiertas (valores por defecto configurables)

Implementa estas decisiones **como configuración**, nunca como constantes en el código, usando los valores por defecto indicados. Señálalas en cada checkpoint como "pendiente de confirmar".

| # | Pregunta | Valor por defecto |
|---|---|---|
| A1 | Tiempo objetivo de atención por prioridad | Urgente 4 h · Alta 8 h · Media 24 h · Baja 72 h |
| A2 | Desde cuándo corre el reloj | Primera atención: desde la creación. Luego: desde la última acción del TÉCNICO. Se pausa en "En espera del USUARIO" y en "Resuelto (esperando confirmación)". |
| A3 | Reaviso | Al vencer, aviso al TÉCNICO responsable (o a la cola si no hay responsable). Reaviso cada 50 % del tiempo objetivo mientras siga vencido. |
| A4 | Escalamiento | Si el ticket sigue vencido al doble del tiempo objetivo, se avisa también al JEFE. Configurable, se puede desactivar. |
| A5 | USUARIO no responde a la confirmación | ~~Autocierre a los 5 días corridos~~ **Decidido (2026-10-21, procedimiento de TI, migración 120): 24 h corridas** (`horas_autocierre_resuelto`), registrado como «Cerrado automático – Sin validación» (`cerrado_por = 'sistema'`), contado aparte y nunca satisfecho. |
| A6 | Encuesta y confirmación | ~~Independientes~~ **Decidido (2026-10-21, migración 120): calificar ES confirmar** — la encuesta se abre al resolver y responderla cierra el ticket. El desacuerdo del USUARIO es una calificación de 1 o 2, que el TÉCNICO revisa (reabre o deja nota); no hay botón aparte de «rechazar el cierre». |
| A7 | Reportes | Sin definir: en la Fase 5 **propones**, no construyes, hasta tener aprobación. |

---

## 3. Modelo objetivo de estados

Verifica primero los nombres reales en `core/dominio-tickets.js` y en la migración 050 (`transiciones_ticket_permitidas`). Adapta los nombres si ya existen equivalentes; no dupliques estados.

```
abierto ──► en_progreso ──► resuelto ──► cerrado
   │            │  ▲            │
   │            ▼  │            └──► reabierto ──► en_progreso
   │      en_espera_usuario     (USUARIO rechaza con motivo)
   │            │
   └────────────┴──► rechazado   (motivo obligatorio; incluye "duplicado" con vínculo al ticket original)
```

| Estado | Significado | Reloj de atención |
|---|---|---|
| `abierto` | Creado, sin iniciar atención | Corre |
| `en_progreso` | TÉCNICO trabajándolo | Corre |
| `en_espera_usuario` | Se pidió información al USUARIO | Pausado |
| `resuelto` | TÉCNICO terminó; espera confirmación del USUARIO | Pausado |
| `cerrado` | USUARIO confirmó, o autocierre (A5) | Detenido |
| `reabierto` | USUARIO rechazó el cierre (o JEFE reabrió) | Corre |
| `rechazado` | No procede / duplicado | Detenido |

Transiciones permitidas (a registrar en la whitelist del servidor):

| Desde | Hacia | Quién | Requisito |
|---|---|---|---|
| abierto | en_progreso | TÉCNICO | nivel, responsable, tipo (regla actual `check_iniciar_completo`) |
| abierto | rechazado | TÉCNICO | motivo |
| en_progreso | en_espera_usuario | TÉCNICO | mensaje visible al USUARIO |
| en_espera_usuario | en_progreso | sistema (USUARIO responde) o TÉCNICO | — |
| en_progreso | resuelto | TÉCNICO | **nota de resolución obligatoria** |
| en_progreso | rechazado | TÉCNICO | motivo; si es duplicado, ticket original |
| resuelto | cerrado | USUARIO, o sistema (A5) | — |
| resuelto | reabierto | USUARIO | **motivo obligatorio** |
| cerrado | reabierto | JEFE | motivo |
| reabierto | en_progreso | TÉCNICO | — |
| reabierto | resuelto | TÉCNICO | nota de resolución |

---

## FASE 0 — Reconocimiento y línea base

**Objetivo:** confirmar que los hallazgos de la auditoría siguen vigentes y tener una red de seguridad antes de cambiar nada.

- **0.1** Verifica uno por uno los hallazgos citados en este plan (rutas y comportamiento). Marca cada uno como *vigente*, *cambió* o *ya no existe*.
- **0.2** Identifica cómo corre la suite de tests actual y déjala pasando. Si no hay tests para el módulo Tickets, crea tests de caracterización mínimos para: transiciones de estado, `cerrar_ticket()`, orden del listado y carga del Dashboard.
- **0.3** Revisa lo que la auditoría no cubrió y es relevante para V2:
  - Patrones de Vue/Pinia en el módulo Tickets: watchers redundantes, estado duplicado entre store y componente, re-renders evitables.
  - Escalabilidad: listados sin virtualización, número de requests por interacción, consultas N+1.
  - Verifica si InsForge permite ejecutar tareas programadas (cron) para edge functions. Esto define cómo se hace la tarea 2.5.
- **0.4** Entrega el mapa de archivos que vas a tocar en las Fases 1 a 3.

**Checkpoint 0.** No se modifica código de producto en esta fase (solo tests).

---

## FASE 1 — Modelo de datos correcto

**Objetivo:** corregir las decisiones de esquema que, si se dejan para después, obligan a migrar datos dos veces. Todo lo demás se construye sobre esto.

### 1.1 Prioridad ordenable
- Origen: auditoría P1-1 (`prioridad` es `text` con CHECK en `016_tickets.sql:152-153`; se ordena alfabéticamente).
- Agrega un rango numérico (columna generada o tabla de catálogo con `orden`) e índice. El ordenamiento por prioridad en `api/domains/tickets.js` debe usar el rango, nunca el texto.
- Aceptación: ordenar por prioridad devuelve urgente → alta → media → baja (y al revés en ascendente). Test en servidor.

### 1.2 Registro de auditoría completo
- Origen: auditoría P1-5 (sin actor, anacronismo en reasignación, reasignado sin origen/destino, cambios de título/descripción/categoría sin registrar).
- Rediseña la tabla de eventos para que **cada** cambio guarde: `ticket_id`, `actor_id`, `rol_actor`, `tipo_evento`, `campo`, `valor_anterior`, `valor_nuevo`, `created_at`.
- Trigger que registre cambios de: estado, prioridad, nivel, responsable (origen y destino), categoría, tipo, título, descripción.
- Backfill: los eventos existentes se conservan; los que no tengan actor se marcan como legado.
- Aceptación: una reasignación A → B deja un evento con A como anterior y B como nuevo, y el actor que la hizo. Test SQL.

### 1.3 Nueva máquina de estados
- Implementa los estados y transiciones de la sección 3 en la whitelist del servidor.
- **Separa `resuelto` de `cerrado`**: hoy `cerrar_ticket()` (migración 051) hace las dos cosas en una transacción. Deja de hacerlo.
- Agrega campos: `nota_resolucion` (obligatoria vía trigger al pasar a `resuelto`), `motivo_rechazo_cierre`, `ticket_duplicado_de` (FK opcional), `resuelto_at`, `cerrado_at`, `cerrado_por` (USUARIO o sistema).
- Migra los tickets que hoy están `cerrado`: conservan su estado; `nota_resolucion` queda nula como legado (el trigger solo exige la nota en transiciones nuevas).
- Aceptación: cada transición no listada es rechazada por el servidor. Test por cada fila de la tabla de transiciones.

### 1.4 Transiciones como RPC transaccionales
- Origen: auditoría P2 (rechazar y reabrir no son atómicos; acciones masivas como bucle secuencial desde el cliente).
- Crea RPC para cada acción con efecto compuesto: `resolver_ticket(nota)`, `confirmar_cierre()`, `rechazar_cierre(motivo)`, `rechazar_ticket(motivo, duplicado_de?)`, `reabrir_ticket(motivo)`, `pedir_informacion(mensaje)`, `reasignar_ticket(responsable)`.
- Cada RPC hace en una sola transacción: cambio de estado + mensaje/comentario + evento de auditoría + notificación en cola.
- Acciones masivas: una RPC que recibe la lista de ids, valida todo antes de escribir y aplica en una sola transacción. Si alguno no es válido, no se aplica ninguno y se devuelve la lista de bloqueados con el motivo.
- El frontend deja de encadenar llamadas para estas acciones.
- Aceptación: forzar un fallo a mitad de la RPC no deja estado parcial. Test.

### 1.5 Base del reloj de atención
- Tabla de configuración `config_tiempo_atencion` (prioridad, minutos objetivo, porcentaje de reaviso, escalar a JEFE sí/no, multiplicador de escalamiento), con los valores por defecto de A1, A3 y A4.
- Campo `ultima_accion_tecnico_at` actualizado por trigger. Cuenta como acción del TÉCNICO: cambio de estado, mensaje visible al USUARIO, reasignación, cambio de prioridad o nivel. **No** cuenta una nota interna (definirlo así evita que el reloj se "resetee" sin que el USUARIO reciba nada; si discrepas, dilo en el checkpoint).
- Función SQL única `estado_tiempo_ticket(ticket)` que devuelva: tiempo objetivo, tiempo consumido (descontando pausas), estado `en_tiempo | por_vencer | vencido`. **Esta función reemplaza las dos heurísticas actuales** (`TicketsView.vue:345-350` y `dashboard.js:197,204`).
- Registro de pausas (entrada y salida de `en_espera_usuario` y `resuelto`) para descontarlas.
- Aceptación: tests con escenarios de pausa, reapertura y cambio de prioridad a mitad del reloj.

### 1.6 Encuesta ligada al cierre
- Tabla de respuestas de satisfacción vinculada al ticket y al evento de confirmación. Deja de depender del mensaje copiado a WhatsApp.
- Aceptación: una encuesta solo se puede registrar para un ticket `cerrado` y una sola vez por cierre.

**Checkpoint 1.**

---

## FASE 2 — Señales que no mientan + reloj de atención

**Objetivo:** que un ticket urgente nunca pase inadvertido. Los hallazgos P1-1, P1-3 y P1-7 de la auditoría son una sola cadena de falla (entra como "Media" → la cola no lo sube → el Dashboard dice "Todo al día" si falla la carga). Se entregan juntos; no cierres esta fase con uno solo resuelto.

### 2.1 Cola ordenada por urgencia
- Vista "Pendientes" por defecto: prioridad (rango) descendente, luego estado de tiempo (vencidos primero), luego antigüedad ascendente.
- Usa la misma lógica que hoy tiene `ordenarPorUrgencia()` (`dominio-tickets.js:52`), pero ejecutada en el servidor para que funcione con paginación.

### 2.2 Prioridad desde la creación
- Portal del USUARIO: dos preguntas simples de impacto (por ejemplo: "¿te impide trabajar?" y "¿afecta a más personas?") que calculan una prioridad **sugerida**. El USUARIO no elige la prioridad directamente.
- Guarda `prioridad_origen` (`sugerida` | `confirmada_tecnico`) y muestra la diferencia en la UI.
- Formulario interno del TÉCNICO (`TicketInternoForm.vue`): permite fijar prioridad y responsable al crear.
- Edge function `functions/tickets.ts`: acepta y valida la prioridad.

### 2.3 Dashboard sin falsos positivos
- Reemplaza el `Promise.all` único (`DashboardView.vue:150-157`) por carga independiente por sección (`Promise.allSettled` o equivalente).
- Cada sección tiene su propio estado de error con botón de reintento.
- Regla: "Todo al día" solo se muestra si **todas** las consultas relevantes respondieron correctamente y vacías.

### 2.4 Señal de tiempo en la UI
- Listado, tarjeta, Triage y detalle consumen `estado_tiempo_ticket`. Ningún componente calcula tiempo por su cuenta.
- Señal con texto + ícono + color (nunca solo color) y el motivo legible también por lector de pantalla (no solo en `title`).

### 2.5 Reaviso y escalamiento
- Tarea programada (según lo verificado en 0.3) que revisa tickets `por_vencer` y `vencidos` y genera notificaciones según A3 y A4.
- Sin spam: deduplica por ticket e intervalo; guarda cuándo se envió cada aviso.
- Si no existe forma de programar tareas en InsForge, detente y propone alternativas en el checkpoint antes de implementar.

**Checkpoint 2.**

---

## FASE 3 — Ciclo de vida completo en la UI

### 3.1 Resolver (TÉCNICO)
- "Marcar resuelto" abre un diálogo con **nota de resolución obligatoria**. El ticket pasa a `resuelto`, no a `cerrado`. Se notifica al USUARIO.
- Elimina el texto actual que admite que no hay paso intermedio (`TicketDetallePanel.vue:349`).

### 3.2 Confirmar o rechazar el cierre (USUARIO)
- En el portal, el USUARIO ve la nota de resolución y dos acciones: **Confirmar cierre** y **No está resuelto** (motivo obligatorio).
- Confirmar → `cerrado` → se ofrece la encuesta (A6).
- Rechazar → `reabierto` → notificación al TÉCNICO responsable con el motivo.

### 3.3 Autocierre
- Tarea programada que cierra los tickets en `resuelto` sin respuesta tras A5. Evento en el historial "cerrado automáticamente" y aviso al USUARIO.

### 3.4 En espera del USUARIO
- "Pedir más información" (`useTicketDetalleLogica.js:448-463`) pasa a usar `pedir_informacion()` y deja el ticket en `en_espera_usuario`, con el reloj pausado.
- Cuando el USUARIO responde, el ticket vuelve a `en_progreso` automáticamente y se notifica al TÉCNICO.

### 3.5 Rechazo y duplicados
- Desde `en_progreso` se puede rechazar; la opción "duplicado" exige elegir el ticket original y lo enlaza en ambos.
- Los duplicados no cuentan como resueltos en ninguna métrica.

### 3.6 Reclasificar categoría
- El TÉCNICO puede corregir la categoría desde `TicketCamposGestion.vue`. El cambio queda en el historial (1.2).

### 3.7 Base de conocimiento desde la resolución
- El botón "KB" crea el borrador **prellenado con la nota de resolución**. Si no hay nota, el botón no aparece. Deja de crear artículos vacíos (`stores/ticketDetalle.js:103-110`).

### 3.8 Historial legible
- El timeline muestra actor, acción, valor anterior → nuevo y fecha en cada hito. Sin anacronismos: cada hito muestra el dato del momento en que ocurrió.

### 3.9 "Cerrar seleccionados"
- Con el doble cierre, el cierre masivo por el TÉCNICO deja de tener sentido. Elimínalo. Si propones reemplazarlo por "Resolver seleccionados", justifica cómo se pide la nota de resolución por ticket.

**Checkpoint 3.**

---

## FASE 4 — Sistema de diseño, usabilidad y rendimiento

### 4.1 Paleta de prioridad con orden
- Escala secuencial que se lea como "menos → más" (hoy Baja gris, Media verde azulado, Alta violeta, Urgente rojo: `dominio-tickets.js:27-32`).
- Estados y prioridades no comparten tono (corrige las colisiones: reabierto/urgente/sin_vincular en danger; rechazado/baja en neutral). Aplica lo mismo a la severidad de Problemas.

### 4.2 Un solo mapa de tonos
- Consolida los 7 mapas de tono a clase (AppTag, AppKpi, AppPortal, DashboardView, ActividadView, TicketTimelineUnificado, AppNotifications) en un módulo de tokens único.
- Elimina el vocabulario duplicado: `filtrosTickets.js:43-57`, `OPCIONES_FILTRO_ESTADO` sin uso, listas de estados terminales escritas a mano (`tickets.js:292`, `dashboard.js:193`). Corrige `ESTADOS_EN_CURSO` (hoy incluye `resuelto`; con el nuevo modelo, decide explícitamente dónde va).

### 4.3 Componentes únicos
- Elige un componente de modal (`AppDialog` o `Modal`) y migra el módulo Tickets. Propón el plan para el resto del sistema.
- Migra los `<select>` nativos del módulo Tickets a `AppSelect`. El resto del sistema: plan incremental, no en esta fase.

### 4.4 Operable con teclado
- Tarjetas móviles de tickets (`TicketsView.vue:713-723`) y de KB (`KbView.vue:253-257`): foco, Enter y Espacio, rol semántico correcto.

### 4.5 Estados de error honestos
- Panel de detalle: distinguir "no encontrado" de "error de red" (`TicketDetallePanel.vue:234`), con reintento.
- Botón de reintento en los estados de error de todos los listados.
- El aviso de "sin conexión" (`core/error-red.js`) cubre también las consultas directas a la base.

### 4.6 Velocidad para el TÉCNICO
- Atajos de acción en Triage y detalle: asignarme, resolver, pedir información, siguiente ticket. Documentados en un panel de ayuda accesible con `?`.
- Respuestas predefinidas insertables en el cuadro de mensaje (reemplazan las "macros" que solo copian texto para WhatsApp). Administrables por el JEFE.

### 4.7 Legibilidad
- Texto informativo con contraste suficiente (reemplaza `text-gray-300/400` en `KbView.vue` y `EmpleadosView.vue` por el token correcto).
- Mostrar el tipo (incidente/solicitud) en el listado.

### 4.8 Rendimiento
- Unifica los 7 requests por cambio de filtro (`TicketsView.vue:275-279`) en una RPC de conteos.
- Un solo paradigma de paginación para Tabla y Triage, o justifica por qué conviene mantener dos.
- Aplica las correcciones de Vue/Pinia detectadas en 0.3.

**Checkpoint 4.**

---

## FASE 5 — Reportes (propuesta, no construcción)

Con los datos ya confiables, entrega una **propuesta** de catálogo de reportes, sin implementar hasta aprobación. Para cada reporte indica: pregunta que responde, destinatario probable, métricas, filtros, formato (pantalla, CSV, PDF) y si es bajo demanda o programado.

Candidatos mínimos a evaluar:
- Volumen de tickets por período, categoría, área/obra y tipo.
- Cumplimiento del tiempo de atención por prioridad y por TÉCNICO.
- Reaperturas por rechazo del USUARIO (tasa y motivos).
- Satisfacción del USUARIO (promedio, tasa de respuesta, comentarios).
- Categorías recurrentes y su relación con Problemas.
- Duplicados y rechazados (excluidos de las métricas de resolución).

Incluye qué se puede reutilizar del CSV y de `ReporteTicketsModal` actuales.

**Checkpoint 5.**

---

## 9. Formato del reporte de checkpoint

```
## Checkpoint <n> — <nombre de la fase>

### Hecho
- <id tarea>: qué se cambió · archivos · migraciones · tests agregados

### Desviaciones del plan
- Qué cambiaste respecto al plan y por qué

### Hallazgos de la auditoría que ya no aplicaban o eran distintos

### Riesgos y deuda nueva introducida

### Decisiones abiertas que siguen pendientes (sección 2)

### Cómo probarlo manualmente
- Pasos concretos para el TÉCNICO y para el USUARIO

### Propuesta para la fase siguiente
```

## 10. Definición de terminado (aplica a toda tarea)

- La regla de negocio está en el servidor y la UI la refleja.
- Tests nuevos pasando y la suite completa en verde.
- Sin constantes de negocio escritas a mano en componentes (tiempos, estados, colores).
- Todo lo nuevo es operable con teclado y no depende solo del color.
- El historial registra el cambio con actor.
- `PANORAMA-SISTEMA.md` actualizado al cerrar la fase.
