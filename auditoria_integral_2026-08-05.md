# Auditoría técnica y de producto — Materen · Sistema TI

**Fecha:** 2026-08-05
**Alcance:** repositorio completo (`frontend/`, `functions/`, `migrations/`, `docs/`, CI), ejecución local de la suite de tests, `vite build`, `npm audit` y `scripts/contraste.mjs`. **Cero** requests contra `https://materen-ti.vercel.app` ni contra la base de producción.
**Base:** rama `main` en `3c1718c`, con working tree sucio (10 archivos modificados + 7 nuevos: el reporte de tickets por periodo y la migración 036).
**Roles asumidos:** Arquitecto de Software · Product Designer/UX · Ingeniería de Seguridad · QA · DevOps/SRE · Performance · Technical Writer · **+ Ingeniería de Datos** (rol añadido: el valor del producto está en el historial de asignaciones y en las métricas de servicio; la corrección temporal y la atomicidad de esos registros es un eje propio, no un subcapítulo de "backend").

**Relación con la auditoría previa:** `auditoria_seguridad_sistema-ti_2026-07-07.md` cerró H-CRIT y H-01…H-11. Se verificó que esas remediaciones siguen en su lugar (§3.3). Este documento **no** las repite: todo hallazgo aquí es nuevo o quedó fuera del alcance de aquella.

---

## 1. Resumen de contexto del sistema (descubrimiento propio)

- **Qué hace:** panel interno de TI para una constructora peruana (Materen/Inacons). Inventaría empleados, sus credenciales de acceso a plataformas, correos compartidos, licencias de software con tope de asientos y equipos físicos; y opera una mesa de ayuda (tickets), una Base de Conocimiento y Gestión de Problemas. El núcleo de valor es el **historial de asignaciones** (quién tuvo qué acceso, desde/hasta cuándo, si se rotó la clave), no el almacén de contraseñas.
- **Stack real** (`frontend/package.json`): Vue 3.5 + Vite 6 + Pinia 3 + vue-router 4, **sin** Tailwind ni librería de componentes; `@insforge/sdk` 1.4.0; `jspdf` + `jspdf-autotable` (nuevos, sin commitear). Backend: **InsForge** (BaaS sobre Postgres) — PostgREST + RLS + 2 edge functions en Deno/TypeScript. Deploy: Vercel (frontend), CLI manual (functions y esquema).
- **Arquitectura aparente:** SPA monolítica en capas bien separadas — `api/domains/*` (13 módulos con barrel `insforge.js`) → `stores/*` (Pinia, uno por dominio) → `modules/*` (una carpeta por módulo de UI) + `core/*` (lógica de dominio pura) + `composables/*`. La autorización real vive en RLS de Postgres (`es_jefe()`/`es_staff()`), no en el cliente. Todo lo que no cabe en RLS (cifrado, tokens públicos, creación de tickets) está concentrado en las 2 edge functions con cliente admin. **Es un diseño deliberado y coherente**, no accidental.
- **Documentación existente:** excepcional para un proyecto de este tamaño — `README.md` (291 líneas, dominio + seguridad + deploy), `AGENTS.md` (contexto para agentes + gotchas de plataforma), `docs/PANORAMA_SISTEMA.md` (270 líneas, verificado en vivo contra `information_schema`/`pg_policies`), `docs/GUIA-UX-UI.md` (795 líneas, design system), la auditoría de seguridad previa, 36 migraciones comentadas en español y una precedencia documental explícita ("ganan los valores literales de `main.css` y el esquema real").
- **Documentación faltante o desincronizada:** no hay ADRs formales (las decisiones viven dispersas en §6 de PANORAMA y en comentarios de migración), no hay diagrama de arquitectura, no hay CONTRIBUTING ni CHANGELOG. Y hay **tres desincronizaciones factuales verificadas** (§3.7).
- **Módulos críticos identificados:** `functions/credenciales.ts` (cifrado AES-256-GCM, revelado auditado, entregas de un solo uso, accesos sensibles), `functions/tickets.ts` (único escritor de `tickets`, endpoints **públicos sin sesión**), `migrations/003` (RLS y roles), `stores/auth.js` + `router/guards.js`.
- **Vacíos de información que asumo** (no verificables desde el repo, requieren dashboard InsForge / Vercel): (a) si el rol de conexión de la anon key es owner de las tablas — de eso depende que `accesos_log` sea realmente append-only; (b) visibilidad efectiva de los buckets `equipos-fotos` y `tickets-adjuntos`; (c) si el SMTP real está configurado fuera del repo (`insforge.toml` lo tiene en `enabled = false`, el README dice que el envío falla) — **esto cambia la severidad de S-01**; (d) cabeceras HTTP que sirve Vercel (no hay `headers` en `vercel.json`); (e) si el proyecto tiene backups automáticos y con qué RPO.

---

## 2. Resumen ejecutivo (para stakeholders no técnicos)

El sistema está **notablemente por encima del promedio** para un proyecto interno: la seguridad se diseñó a propósito (contraseñas cifradas en servidor, auditoría que nadie puede alterar, permisos aplicados en la base de datos y no en la pantalla), la documentación está viva y verificada, y hay 94 pruebas automáticas que corren en cada cambio. La auditoría de seguridad de julio se cerró de verdad: se comprobó una por una.

Los riesgos que quedan **no son de diseño, son de madurez operativa**:

1. **Un error de fecha repetido en 24 lugares del código** hace que, entre las 7 de la noche y la medianoche (hora de Perú), el sistema registre las altas y bajas de accesos con **la fecha del día siguiente** y marque licencias como vencidas un día antes. Afecta directamente al historial, que es el activo principal del producto.
2. **El formulario público de tickets no tiene ningún límite**: cualquiera en internet puede crear tickets sin tope, con textos de tamaño ilimitado, y hacer que el sistema envíe correos a direcciones ajenas. Hoy el envío de correo está apagado y eso lo contiene; el día que se active (está en la hoja de ruta) se vuelve un problema real.
3. **Cuatro vulnerabilidades de severidad alta** en librerías de terceros que ya usa la aplicación en producción, con corrección disponible en un comando.
4. **Operaciones críticas que pueden quedar a medias**: dar de baja a un empleado son cuatro escrituras seguidas sin red de seguridad. Si falla la tercera, el empleado queda en un estado inconsistente y nadie se entera.
5. **No hay forma de saber si algo se rompió en producción**: sin monitoreo ni registro de errores, el primer aviso siempre es una llamada del usuario.

Ninguno es catastrófico y todos son abordables. La propuesta es un plan de 3 fases: la primera (2–3 días de trabajo) cierra los cinco puntos anteriores.

---

## 3. Hallazgos detallados por rol

### 3.1 Arquitecto de Software

**✅ Fortalezas**

- **Separación de capas real y respetada.** `api/domains/*` no importa nada de `modules/` ni de `stores/`; la lógica de dominio pura vive en `core/dominio-*.js` y es la misma que consumen la UI, el PDF y los tests (`dominio-tickets.js: destinoDeCambio()` se usa en `TicketDetalleView.vue:63`, en `reportesTickets.js:92` y en `tests/dominio-tickets.test.js`). Eso es DRY aplicado donde importa: la definición de "qué estado significa qué" existe una sola vez.
- **La autorización vive en la base, no en la UI.** `router/guards.js` es defensa en profundidad declarada como tal en un comentario; el control efectivo son las policies de `migrations/003`. Es la decisión correcta y está documentada como tal.
- **Refactor de `api/insforge.js` bien ejecutado.** El barrel (35 líneas) preserva la superficie pública del módulo monolítico anterior, y `tests/insforge-api-shape.test.js` verifica que el spread de 13 objetos no pierda ni colisione métodos (**130 métodos exactos**). Es un test de arquitectura, poco común y muy valioso.
- **Concentración deliberada del riesgo.** Todo lo que necesita privilegio admin está en 2 archivos, con la duplicación de helpers CORS documentada como intencional en `AGENTS.md:80-86` ("helpers duplicados a propósito, no se comparte código entre funciones"). Es una violación de DRY *elegida y justificada* — el criterio correcto para funciones desplegadas por separado.
- **Stores partidos por carga, no por capricho:** `tickets` vs `ticketDetalle`, `problemas` vs `problemaDetalle`, con el porqué escrito (`PANORAMA §4`: "para no recargar toda la bandeja al abrir un detalle").

**⚠️ Riesgos / deuda técnica**

- **A-01 · Operaciones de negocio multi-escritura sin atomicidad.** `empleadosApi.bajaEmpleado()` (`api/domains/empleados.js:199-239`) ejecuta 4 escrituras secuenciales desde el navegador: cerrar `asignaciones_cuenta` → cerrar `asignaciones_licencia` → soft-delete de cuentas personales → `estado = 'Inactivo'`. No hay transacción: si la 3.ª falla (RLS, red, tab cerrada) el empleado queda con asignaciones cerradas pero **activo** y con cuentas personales vivas, sin ningún registro de que la operación quedó a medias. El mismo patrón en `TicketDetalleView.vue:186-187` (`resuelto` → `cerrado` como dos updates) y `:167-168` (comentario de rechazo → `estado='rechazado'`). El resto del sistema ya usa el mecanismo correcto para esto (triggers y RPCs `SECURITY DEFINER`, ej. `kb_registrar_feedback`); estas rutas quedaron fuera.
- **A-02 · Restricciones por rol codificadas como literales de ruta.** `guards.js:29,34,40` compara `to.path === '/actividad'` y `to.path === '/accesos-sensibles'`. Cualquier ruta nueva bajo esos prefijos (`/actividad/:id`, un detalle de acceso sensible) nace **sin** el bloqueo por rol y sin la auditoría de `registrarAccesoDenegado`. Lo idiomático en este proyecto —que ya usa `meta.public`— es `meta.rol: 'JEFE'` y un solo chequeo genérico.
- **A-03 · `main.css` como hoja global única de 1.656 líneas.** Sin `<style scoped>` ni módulos CSS: todas las clases de todos los componentes comparten un espacio de nombres plano. La evidencia de erosión está al final del archivo (`:1648-1656`), donde hay ~9 reglas one-liner apiladas fuera de las secciones organizadas (`.mode-badge`, `.cred-list`, `.btn-whatsapp`, `.toast-error i { ... !important }`) — el patrón clásico de "lo agrego al final porque no sé dónde va".
- **A-04 · Convención `text + CHECK` vs enums nativos.** Ya documentado como excepción histórica en `PANORAMA §1` (`staff.rol`, `empleados.estado`). No es un bug; sí es un caso donde agregar un valor exige `ALTER TYPE` en vez de tocar un `CHECK`. Mantener documentado, no migrar.
- **A-05 · Sin ADRs.** Hay decisiones arquitectónicas de primer orden perfectamente razonadas (por qué no `db migrations up`, por qué las funciones no comparten código, por qué no hay tabla de notificaciones, por qué no hay SLA) pero viven como bullets en `PANORAMA §6` y en comentarios de migración. `PANORAMA §6` funciona hoy como un ADR-log implícito; el riesgo es que crezca hasta ser inbuscable. Ya hay un síntoma registrado: sobre el historial remoto de migraciones vacío, `PANORAMA §6` concluye que "**no hay ninguna razón documentada en ningún lado**" — una decisión que sobrevivió desde el primer commit sin justificación recuperable.

**🔴 Problemas críticos**

- Ninguno de arquitectura. La estructura soporta el crecimiento actual; A-01 es el único con impacto de corrección de datos y se trata como crítico en la matriz por ese motivo, no por su forma arquitectónica.

---

### 3.2 Product Designer / UX

**✅ Fortalezas**

- **Accesibilidad tratada en serio, no decorativa.** 122 `aria-label`, 201 `aria-hidden` en iconos decorativos, 23 `role="dialog"` + 25 `aria-modal`, 28 `role="alert"` y 17 `role="status"` para feedback, `aria-sort` en cabeceras ordenables, y **dos composables dedicados**: `useFocoAtrapado.js` (trampa de foco en modales) y `useCerrarConEscape.js`. `prefers-reduced-motion: reduce` respetado (`main.css:1293`). **Cero `v-html`** en todo el código.
- **Un verificador de contraste ejecutable en el repo** (`scripts/contraste.mjs`): 16 pares bg/texto de badges, umbral 4.5:1. Se ejecutó en esta auditoría: **0 fallas**, en tema claro y oscuro. Esto es raro de encontrar y merece reconocimiento explícito.
- **Tema claro/oscuro que respeta el sistema y evita el parpadeo** (`core/tema.js` + `initTema()` llamado antes de montar en `main.js:11`).
- **Los flujos críticos están diseñados, no improvisados.** La baja de empleado muestra un modal con el resumen de qué pasará con *cada* cuenta antes de confirmar. El cambio de estado de un ticket es por botones con nombre de intención ("Iniciar atención", "Rechazar", "Marcar como resuelto") y no un `<select>` de estados libre — y los tres campos obligatorios del inicio vienen precargados y visibles al entrar, sin un paso previo de "revelar el formulario" (`TicketDetalleView.vue:100-114`). Es diseño de flujo real.
- **Decisiones de UI con criterio técnico documentado:** `ReporteTicketsModal.vue:56-57` evita `<input type="month">` porque "Firefox y Safari lo degradan a texto libre". `formatters.js:98-99` evita el signo menos tipográfico U+2212 porque jsPDF no lo codifica. Ese nivel de atención al detalle es el que separa un producto de un prototipo.
- **Tono de copy consistente** (impersonal en títulos, usted en formularios), alineado con la guía del proyecto.

**⚠️ Riesgos / deuda técnica**

- **U-01 · El texto terciario incumple WCAG AA y el design system lo prescribe.** `--mat-color-text-tertiary: #9CA3AF` (`main.css:46`) sobre `--mat-color-bg-elevated: #FFFFFF` da **2,54:1**; sobre `--mat-color-bg` (#F6F7F8), **2,37:1**. El mínimo AA para texto normal es 4,5:1. No es un caso aislado: es la clase `.text-muted` (`main.css:915`), usada en **15 componentes** para fechas, metadatos y celdas vacías — y `docs/GUIA-UX-UI.md` la documenta como convención (`"`.text-muted` en terciario para celdas vacías"`). Además `--mat-color-text-secondary: #6B7280` sobre `--mat-color-bg-subtle` (#F0F2F4) da **4,31:1**, también por debajo. `scripts/contraste.mjs` no cubre estos pares: solo valida badges, así que el guardrail existente no lo detecta. (En tema oscuro el terciario se redefine a #6B7280, `main.css:204` — el problema es del tema claro.)
- **U-02 · Sin indicador de foco propio en botones y enlaces.** `.btn` (`main.css:707-724`) no define `:focus-visible`; solo lo tienen inputs, selects y `.empleado-link`. Se cae al anillo por defecto del navegador, que sobre `.btn-primary` (fondo #157955 sólido) tiene contraste pobre. Con el `--mat-ring` ya definido en los tokens, la corrección es una regla.
- **U-03 · Escala tipográfica en px, con base de 13px y mínimo de 11px.** `--mat-fs-base: 13px`, `--mat-fs-xs: 11px` (`main.css:29-31`). Las unidades absolutas ignoran la preferencia de tamaño de fuente del navegador (relevante para un panel que se usa 8 horas al día), y 11px es pequeño incluso para metadatos. Con U-01, el texto terciario a 11px es la peor combinación del sistema.
- **U-04 · `#25d366` / `#1ebe57` hardcodeados** (`main.css:1655-1656`, `.btn-whatsapp`). Los únicos hex fuera del sistema de tokens en todo el archivo. Es el verde de marca de WhatsApp, así que es defendible; debería ser un token (`--mat-color-whatsapp`) para que no se lea como excepción sin dueño.
- **U-05 · Fricción no resuelta en el cierre de tickets → afecta a la KB.** Ya está diagnosticado en `PANORAMA §7`: "sin campo de resumen de resolución al cerrar". La consecuencia es medible: `guardarComoBorradorKb()` crea artículos con `sintoma`/`solucion` **vacíos** porque no hay de dónde copiarlos, y la Base de Conocimiento tiene **1 artículo** después de 63 tickets. El checkbox "guardar como KB" al cerrar existe, pero produce un borrador inútil — es peor que no ofrecerlo, porque consume la intención del usuario sin devolver valor.
- **U-06 · Tablas anchas en móvil resueltas solo con scroll horizontal.** `.table-wrap { overflow-x: auto }` con sombras de scroll muy bien hechas (`main.css:806-820`), pero en 768px un listado de equipos con 8 columnas obliga a barrer horizontalmente para leer una fila. No hay patrón de tarjeta en móvil para los listados. Aceptable si el uso móvil es marginal — **dato que no tengo**; conviene medirlo antes de invertir.

**🔴 Problemas críticos**

- Ninguno bloqueante. U-01 es la única falla normativa de accesibilidad y se clasifica Alto por su alcance (15 componentes + el design system).

---

### 3.3 Ingeniería de Seguridad

**Verificación de la remediación previa (2026-07-07).** Comprobado uno por uno en el código actual: `disable_signup = true` (`insforge.toml:9`) ✔ · trigger crea staff inactivo (`migrations/018`, confirmado en `PANORAMA §3`) ✔ · política de contraseñas min 12 + 4 clases (`insforge.toml:11-18`) ✔ · rate-limit de revelado 40/5 min por usuario (`credenciales.ts:153-154, 340, 372, 403`) ✔ · adjuntos validados por magic bytes + tope 5 MB + nombre de archivo derivado del token, ignorando el `tipo` del cliente (`tickets.ts:64-76, 225-249`) ✔ · IP tomada del último hop y límite adicional por DNI independiente de IP (`tickets.ts:94-103, 392-399`) ✔ · saneado centralizado del filtro PostgREST (`api/sanitizar.js`) ✔ · `@insforge/sdk` fijado a `^1.4.0` ✔ · CORS con allowlist exacta y `Vary: Origin` en ambas funciones ✔. **Las 12 remediaciones siguen en su lugar.**

**✅ Fortalezas**

- **El modelo de cifrado es correcto y está probado.** AES-256-GCM, IV de 12 bytes aleatorio por operación, claves solo en `Deno.env`, tres claves separadas por dominio de riesgo (`CRED_KEY_V2`, `CRED_KEY_LEGACY`, `CRED_KEY_SENSIBLE` — esta última aislada a propósito, `credenciales.ts:117-121`). `tests/credenciales.test.js` cubre roundtrip, no-determinismo del IV, formato legacy, payload corrupto **y ciphertext manipulado** (detección de integridad GCM). Siete tests sobre el activo más sensible del sistema.
- **Autorización de dos niveles en accesos sensibles**, aplicada donde importa: no alcanza `staff.activo`, hace falta `rol === 'JEFE'` **y** fila en `accesos_sensibles_permisos` para ese `acceso_id` — y el comentario explica exactamente por qué el chequeo vive en la función y no solo en RLS: "este chequeo protege específicamente el descifrado, que corre con el cliente admin, fuera del alcance de la RLS" (`credenciales.ts:291-297`). Razonamiento de seguridad de nivel profesional.
- **Auditoría genuinamente inalterable:** `accesos_log` sin ninguna policy de escritura (ni para JEFE), escrito solo por el cliente admin. `accesoDenegado` toma usuario y rol **del token y de la fila de staff, no del body** — con el comentario que lo justifica (`credenciales.ts:263-265`).
- **Sin oráculo de enumeración** en `buscarPorDni`: un DNI inexistente y un DNI sin tickets devuelven lo mismo (`tickets.ts:405`).
- **Marcado atómico de la entrega de un solo uso** a prueba de carrera (`credenciales.ts:213-219`: `update ... .is('viewed_at', null).select()` y verificación de filas afectadas).

**⚠️ Riesgos / deuda técnica**

- **S-03 · `for update` sin `with check` en ~23 policies.** Es el H-06 de la auditoría previa, cerrado **solo para `tickets`** (migración 019 congela `token`/`codigo`/`origen`/`creado_por`). Verificado: `migrations/003:179-270` y análogas usan `for update using (es_staff())` sin `with check`. Consecuencia concreta y nueva: **nada a nivel de base impide escribir texto plano en `cuentas.password`**. No hay `CHECK` que exija el prefijo `enc2:`/`enc:` (`migrations/002:129` es `password text` desnudo), y `decryptAny()` devuelve tal cual cualquier valor sin prefijo conocido (`credenciales.ts:104-105`, "texto plano histórico"). El invariante "las contraseñas siempre están cifradas" —el corazón del producto— hoy lo sostiene únicamente el cliente. H-10 verificó 0 filas en claro *en ese momento*; nada previene la regresión.
- **S-04 · Cabeceras de seguridad ausentes en Vercel.** `frontend/vercel.json` contiene solo el rewrite de SPA. Sin CSP, sin HSTS, sin `X-Content-Type-Options`, sin `Referrer-Policy`, sin `X-Frame-Options`/`frame-ancestors`. Para una aplicación que muestra contraseñas descifradas en pantalla, la ausencia de CSP y de protección anti-framing es una omisión relevante. Ya estaba señalado como P3 en la auditoría previa y sigue abierto.
- **S-05 · Diagnóstico de realtime por `console` en producción.** `AppLayout.vue:22-29` y `useRealtimeRefresco.js:26,29,33` emiten `console.info`/`console.warn` sin gating por entorno, incluyendo nombres de canal (`ticket:<token>`). El token de ticket es un secreto de capacidad: aparece en la consola del navegador de cualquier sesión. Impacto bajo (misma sesión que ya lo posee), pero es exposición innecesaria y ruido operativo.
- **S-06 · Passthrough de texto plano indistinguible de un error.** `decryptAny()` devuelve `'(error al descifrar)'` ante fallo y el valor crudo ante formato desconocido, sin registrar ninguno de los dos casos (`credenciales.ts:104-114`). Un fallo masivo de descifrado (clave rotada mal) se vería como contraseñas raras en la UI, sin señal en `accesos_log`.

**🔴 Problemas críticos**

- **S-01 · El endpoint público `crear` de tickets no tiene ningún límite: ni de frecuencia, ni de tamaño, ni de destinatario de correo.** Tres defectos concretos en `functions/tickets.ts`, acción `crear` (`:171-329`):
  1. **Sin rate-limit.** `buscarPorDni` tiene doble límite (15/10 min por IP, 10/10 min por DNI, `:381-401`) y el revelado de contraseñas tiene el suyo, pero `crear` —que **escribe** en la base y **sube archivos** sin sesión— no tiene ninguno. La infraestructura ya existe (`ticket_busqueda_intentos`, `ipDesdeHeaders()`).
  2. **Texto sin cota.** `titulo` y `descripcion` van a `text` sin `CHECK` de longitud (`migrations/016:123-124`), la función solo hace `trim()` (`:172-173`), y el formulario público no tiene `maxlength` (verificado: `TicketNuevoView.vue` solo lo usa en el DNI, `:149`). Un POST anónimo puede insertar decenas de MB en un campo. Contrasta con el rigor aplicado al adjunto, que sí está acotado a 5 MB.
  3. **Envío de correo a destinatario arbitrario y no autenticado.** `:310` — `if (!correoDestino && contacto && esEmail(contacto)) correoDestino = contacto`. El campo `contacto` está pensado para el DNI (la identificación es solo por DNI, `:198-200`), pero si el atacante manda algo con forma de email, el sistema le envía un correo a esa dirección. El cuerpo es una plantilla fija con datos generados en servidor —no hay inyección de contenido, verificado en `plantillaCorreo()`— así que es un relay de spam de plantilla fija, no un vector de phishing.

  **Severidad condicional.** Hoy `insforge.toml` tiene `[auth.smtp] enabled = false` y el README documenta que los envíos fallan en el plan actual, lo que neutraliza (3) y limita (1) a inserción de filas. Pero (1) y (2) están **activos ahora**, y el correo transaccional está en la hoja de ruta del producto: el día que se habilite, (3) se activa sin que nadie toque este archivo. Es exactamente la forma de H-CRIT (una brecha armada esperando un cambio de configuración), y por eso se clasifica igual: **crítica condicional**.

- **S-02 · Cuatro vulnerabilidades de severidad alta en dependencias de producción.** `npm audit --omit=dev` (ejecutado, 2026-08-05): `ws` 8.0.0–8.20.1 (GHSA-96hv-2xvq-fx4p, agotamiento de memoria por fragmentos diminutos) y `socket.io-parser` 4.0.0–4.2.6 (GHSA-2m8v-j782-fhvr, agotamiento de memoria sin adjuntos), ambas transitivas vía `engine.io-client` ← `socket.io-client` ← `@insforge/sdk` 1.4.0 — es decir, en el camino de **realtime**, que está activo en toda sesión de staff y en las páginas públicas de seguimiento. `npm audit fix` reporta corrección disponible; `@insforge/sdk` tiene 1.5.2 publicada. OWASP A06. Es el hallazgo de peor relación impacto/esfuerzo del informe.

---

### 3.4 Ingeniería de Calidad (QA)

**✅ Fortalezas**

- **94 tests que pasan** (ejecutado: 11 archivos, 93 pasan, 1 se omite, 1,28 s). Y están donde importan: cifrado (7), validaciones de la edge function de tickets, `destinoDeCambio` (el parser del que dependen todas las métricas), aritmética de periodos (`reporte-periodo.test.js`), agregaciones del reporte, generación del PDF (8 casos, incluyendo acentos, paginación y "no dibuja el gráfico por día si el periodo es de un solo día"), y **forma de la API** (130 métodos exactos).
- **Test de integración con un motivo escrito.** `tests/integration/tickets-api.smoke.test.js` documenta el incidente que lo originó: un `select` que pedía `es_base_conocimiento` después de que la migración 031 eliminó la columna → 400 en producción. Es el test correcto para el riesgo real de este stack (desincronización esquema↔frontend, invisible para tests unitarios).
- **Tests de invariantes de base** (`tests/db/triggers.test.sql`, 329 líneas) con rollback, que además **documenta su propia limitación**: `project_admin` tiene `BYPASSRLS` y el CLI bloquea `SET ROLE`, por lo que las policies RLS no son ejercitables desde ese canal. Reconocer el límite de la propia cobertura es señal de madurez.
- **La calidad del código nuevo (reporte de tickets) es superior a la media del repo:** cada decisión no obvia tiene su comentario con el porqué y el síntoma que la motivó (`reportesTickets.js:33-36`: "con más de ~180 tickets la petición reventaba el límite de URL y fallaba con 414. Se trocea").

**⚠️ Riesgos / deuda técnica**

- **Q-02 · Cero cobertura de componentes Vue.** Ni un test de `.vue`: 45 componentes, incluidos `BajaEmpleadoModal` (que presenta la consecuencia de una operación irreversible) y `TicketDetalleView` (775 líneas, la máquina de estados del ticket vista desde la UI). No hay `@vue/test-utils` ni `jsdom` en las dependencias. Los tests actuales cubren lógica extraída a `core/` — que es la razón por la que esa extracción vale la pena — pero el pegamento no está cubierto.
- **Q-03 · La lógica de `api/domains/*` no está testeada.** El módulo más grande y con más reglas de negocio (`equipos.js`, 450 líneas; `bajaEmpleado` en `empleados.js`) no tiene un solo test, porque no hay stub del cliente PostgREST. `tests/stubs/insforge-sdk.js` solo intercepta el import Deno de las edge functions.
- **Q-04 · Sin linter ni formateador ni typecheck.** Verificado: no existen `eslint.config.js`, `.eslintrc*`, `.prettierrc`, `.editorconfig` ni `tsconfig.json` (ni en raíz ni en `frontend/`). Consecuencia concreta: **`functions/credenciales.ts` y `functions/tickets.ts` son TypeScript que nunca se compila** — 1.025 líneas con anotaciones de tipo que ningún proceso verifica. Un error de tipos ahí se despliega y se descubre en producción. Es el punto ciego más grande de la estrategia de calidad actual, y toca justo los dos archivos más sensibles del sistema.
- **Q-05 · Sin gestión de bugs ni registro de regresiones.** No hay issues, ni CHANGELOG, ni plantillas en `.github/`. Los incidentes reales quedan como prosa en `PANORAMA §6` (pérdida del backfill de KB, crash del CLI, 400 por columna eliminada). Es mejor que nada y peor que un registro: no se puede consultar "¿esto ya nos pasó?" de forma sistemática.

**🔴 Problemas críticos**

- **Q-01 · El único test que cubre el riesgo principal de este stack nunca corre.** El smoke de integración se omite sin `INSFORGE_TEST_STAFF_EMAIL`/`PASSWORD`, y `.github/workflows/ci.yml` no define esos secrets ni ese job. El mismo patrón afecta a `tests-db`: el job existe pero `exit 0` explícito si falta `INSFORGE_ACCESS_TOKEN` (`ci.yml:43-46`). Resultado: **dos de las tres capas de verificación producen un check verde sin haber ejecutado nada**, y el único guardrail contra el fallo que ya ocurrió en producción está inactivo. Un check verde que no verifica es peor que un check ausente, porque se le cree.

---

### 3.5 DevOps / SRE

**✅ Fortalezas**

- CI mínimo pero real y en el orden correcto (`npm ci` → build → tests), con caché de npm anclada al lockfile, en cada push y PR.
- **Las tres capas de despliegue y su asimetría de rollback están documentadas explícitamente** (`PANORAMA §6`, último bullet): frontend por push a Vercel, edge functions por CLI manual, esquema por `db query`/`db import`; y la advertencia de que **ningún `git revert` deshace las otras dos**. Muy poca gente escribe esto antes de necesitarlo.
- `scripts/apply-migration.mjs` resuelve un problema real y específico de plataforma (límite de ~8 KB de línea de comandos en Windows), con el gotcha del CLI y la mitigación que funcionó documentados en `AGENTS.md:60-75`, incluyendo "verificar siempre después de aplicar: un `db import` que reporta error igual puede haber ejecutado parte de los statements".
- Checklist de deploy de 7 pasos en el README, con el paso de CORS y un smoke test manual end-to-end.

**⚠️ Riesgos / deuda técnica**

- **D-02 · Despliegue de edge functions manual y sin versionado efectivo.** `functions deploy` a mano significa que no hay garantía de que el código desplegado sea el del commit actual, ni forma de saberlo sin invocar la función. Un despliegue olvidado tras un cambio en `credenciales.ts` es un fallo silencioso en el camino de las contraseñas. Y el rollback es "volver a desplegar el archivo anterior a mano".
- **D-03 · Migraciones sin control de aplicación.** El historial remoto del CLI está vacío **a propósito** y, según `PANORAMA §6`, **sin ninguna razón documentada recuperable**. No hay forma programática de saber qué migraciones están aplicadas en producción; la fuente de verdad es la tabla de `README.md`, mantenida a mano — y hoy incompleta (§3.7). Con 36 migraciones y crecimiento activo, esto se vuelve caro pronto.
- **D-04 · `.vite/deps/` versionado.** `git ls-files .vite` devuelve `_metadata.json` y `package.json`: caché de build de Vite dentro del repo. Ruido y fuente de conflictos; pertenece a `.gitignore`.
- **D-05 · Artefactos legacy en la raíz.** `sistema_credenciales_ti.html` (un `<meta refresh>` al frontend) y `sistema_credenciales_ti.html.bak` (38 KB del prototipo original). El `.bak` es el prototipo monolítico anterior; conviene confirmar que no contiene credenciales de la época antes de borrarlo — y borrarlo.
- **D-06 · CI no ejecuta los guardrails que el propio repo ya tiene.** `scripts/contraste.mjs` existe, funciona y devuelve código de salida útil, pero solo se ejecuta si alguien se acuerda. Igual con `npm audit` (que hoy fallaría con 4 altas). Un guardrail no automatizado es documentación.

**🔴 Problemas críticos**

- **D-01 · Cero observabilidad de producción.** No hay reporte de errores (ni Sentry ni equivalente: `grep` de `Sentry|window.onerror|unhandledrejection` no devuelve nada), ni métricas, ni alertas, ni logs consultables del frontend. El manejo de errores es `try/catch` → `showToast()` → el error muere en el navegador del usuario (`core/error-red.js` + 28 `role="alert"`: la UX del error está cuidada, la telemetría no existe). Consecuencias concretas y ya materializadas en este sistema: el fallo de envío de correo solo se ve si alguien abre la hoja de vida de un ticket y encuentra un evento `correo_fallido`; el 400 por la columna eliminada (migración 031) se descubrió por uso; un fallo de descifrado masivo no dispararía ninguna señal (S-06). Para un sistema con 3–4 personas de staff y 83 empleados dependientes, el MTTD es "cuando alguien llama".

---

### 3.6 Ingeniería de Performance

**✅ Fortalezas**

- **Code-splitting efectivo y verificado.** `vite build` ejecutado: 40+ chunks por vista, la más grande 49 KB (`EquiposView`, 14 KB gzip), vendor principal 385 KB (112 KB gzip). Para una SPA con 20 módulos es un resultado bueno.
- **jsPDF cargado de forma diferida y correcta.** `reporte.js:253-255` usa `await Promise.all([import('jspdf'), import('jspdf-autotable')])`, con el porqué en el comentario. 390 KB de librería de PDF que **no** pesan en la carga inicial.
- **Paginación server-side real** en los 7 listados principales, con `{ count: 'exact' }` + `.range()` — el patrón correcto de PostgREST, aplicado consistentemente (`empleados.js:45`, `tickets.js:125`, `equipos.js:107`, `licencias.js:54`, `correos.js:45`, `kb.js:43`, `problemas.js:48`).
- **Migración 036 (sin commitear) es un trabajo de performance ejemplar:** identifica tres consultas del reporte sin índice, explica por qué los índices parciales existentes de la 016 no aplican, elige el orden de columnas según el filtro real (`(evento, created_at)`, no `(created_at, evento)`), y declara el alcance ("solo índices, reversible con DROP INDEX, nada del reporte depende de esta migración para dar resultados correctos"). Aplicarla.
- Compresión de imágenes en el cliente antes de subir (`core/imagenes.js`, ~200 KB por foto), y troceado de filtros `in` por lotes de 100 para no reventar el límite de URL (`reportesTickets.js:36-51`).

**⚠️ Riesgos / deuda técnica**

- **P-01 · El dashboard cuenta filas descargándolas todas.** `dashboardApi.getEstadisticas()` (`dashboard.js:72-96`) lanza 7 consultas que traen **todas las filas** de `empleados`, `asignaciones_cuenta`, `cuentas` (×2), `licencias`, `equipos` y `tickets` para después hacer `.length` y `.filter().length` en el navegador. Con los volúmenes de hoy (83 empleados, 162 cuentas, 63 tickets — `PANORAMA §5`) son ~400 filas y no se nota. Dos problemas: (a) el payload crece linealmente para producir 8 números; (b) **PostgREST suele imponer un tope de filas por defecto** — al alcanzarlo, los contadores del dashboard empiezan a mentir **en silencio**, sin error. El patrón correcto ya está en el repo: `{ count: 'exact', head: true }`. `listPendientes()` (`:100-172`) tiene el mismo problema sin ningún `.limit()`, y además trae **todas** las asignaciones de equipo activas para filtrar en cliente por `empleados.estado === 'Inactivo'` (`:155-156`), un filtro perfectamente empujable al servidor.
- **P-02 · Amplificación de recargas por realtime.** `AppLayout.vue:41-44` suscribe la sesión a `tickets:list` y llama `ticketsStore.cargar()` en **cada** cambio de cualquier ticket, desde cualquier pantalla. Con S sesiones de staff abiertas y E ediciones, son S×E recargas completas de la bandeja (query paginada + `count: 'exact'`, que es un `COUNT(*)` en Postgres). Con 3 personas es invisible; el patrón no escala y no hay debounce. La decisión de suscribir en el layout está justificada (el sonido de ticket nuevo debe oírse en cualquier pantalla) — lo que falta es separar "notificar" de "recargar todo".
- **P-03 · ~390 KB de chunks de PDF que nunca se ejecutan.** El build produce `html2canvas.esm` (202 KB), `purify.es` (29 KB) e `index.es` (160 KB): dependencias opcionales que jsPDF arrastra para su API `doc.html()`. Verificado que `reporte.js` **solo** usa `autoTable` y primitivas de dibujo — nunca `.html()`. Son chunks separados, así que no afectan la carga inicial, pero se descargan al abrir el reporte. Excluibles por configuración de Rollup.
- **P-04 · Tres consultas solapadas para los pendientes de tickets.** `pendientesTickets()` (`:175-199`) hace tres queries sobre `tickets` con el mismo filtro de "no terminal" (sin asignar / sin vincular / >3 días), sin `limit`, cuando una sola consulta y tres particiones en cliente darían lo mismo.

**🔴 Problemas críticos**

- Ninguno con los volúmenes actuales. P-01 es el que se degrada en silencio y por eso encabeza la lista.

---

### 3.7 Technical Writer / Documentador

**✅ Fortalezas**

- **`docs/PANORAMA_SISTEMA.md` es el mejor documento del repositorio** y un modelo replicable: declara su método ("verificado en vivo contra `information_schema`, `pg_policies`, `pg_trigger`, `pg_proc`, no de memoria"), marca las discrepancias con el código con **⚠ Discrepancia**, y registra las decisiones cerradas con su porqué y su costo (la pérdida del backfill de KB, el hueco de RLS del voto, por qué no hay SLA).
- **Precedencia documental declarada** (`AGENTS.md:9-11`): ante conflicto, ganan `main.css` y `migrations/*.sql`. Resuelve por adelantado la pregunta que paraliza a cualquiera que encuentre una contradicción.
- **Fórmulas de métricas fijadas contra la ambigüedad** (`PANORAMA §5`): el denominador de la tasa de reapertura son los tickets *resueltos*, con la explicación de por qué, y la reconciliación de tres cifras históricas distintas (8,0% / 6,9% / 7,3%) demostrando que la diferencia era la fecha de medición, no un desacuerdo de fórmula. Nivel de rigor de analítica de producto.
- Los comentarios de las migraciones explican **el porqué**, no el qué. La 036 y la 024 son ejemplares.

**⚠️ Riesgos / deuda técnica**

- **W-01 · `AGENTS.md` contradice la realidad en el punto más consequential.** `AGENTS.md:99`: *"Build: `cd frontend && npx vite build` (**no hay tests automatizados aún**)"*. Hay 94 tests, un CI que los ejecuta y `npm test`. `AGENTS.md` es el primer archivo que lee cualquier agente o desarrollador nuevo: la línea invita activamente a no correr la suite. Además `AGENTS.md` declara `Vigencia: 2026-07-09` (migración 021) mientras el repo va por la 036.
- **W-02 · La tabla de "Historial de migraciones" del README se salta 10 migraciones.** Verificado: lista 001–024 y luego salta a 035. Faltan **025** (reordenar categorías), **026–029** (realtime de listas y de seguimiento, con dos fixes de RLS), **030** (auditoría de acceso denegado), **031–032** (KB + RPC de feedback), **033** (Problemas), **034** (drop de tablas de prueba). `PANORAMA` las cubre, pero la tabla del README es lo que el propio checklist de deploy usa como referencia. Y `README.md:181` dice literalmente `migrations/ # 001..019`.
- **W-03 · `docs/GUIA-UX-UI.md` con `Vigencia: 2026-07-09`**, anterior a KB, Problemas, el modal de reporte y los cambios de UI de los últimos 8 commits. Peor: **codifica el defecto de accesibilidad U-01** ("`.text-muted` en terciario para celdas vacías") — la guía está haciendo que el problema se propague a cada pantalla nueva.
- **W-04 · Falta documentación de arranque y de contribución.** No hay CONTRIBUTING (convención de commits, cómo correr los tests, criterios de PR) ni CHANGELOG. El repo tiene una convención de commits clara y consistente (`fix(ui):`, `feat(tickets):`, `docs:`) que nadie escribió en ningún sitio.
- **W-05 · Sin diagrama.** Un sistema con 3 capas de despliegue independientes, 2 edge functions, 31 tablas y una frontera público/privado no tiene ninguna representación visual. Un solo diagrama de "quién habla con quién y con qué credencial" ahorraría una hora a cada persona nueva. `PANORAMA §1` lo describe en prosa excelente — el diagrama es complemento, no reemplazo.

**🔴 Problemas críticos**

- Ninguno. W-01 y W-02 son correcciones de minutos con impacto desproporcionado.

---

### 3.8 Ingeniería de Datos (rol añadido)

**Por qué este rol.** El README define el corazón del sistema como el historial de asignaciones ("quién tuvo qué acceso, desde cuándo, hasta cuándo"), y el módulo de reportes recién construido convierte ese historial en métricas que van a control y gerencia. La corrección temporal y la atomicidad de esos registros no es una preocupación de "backend en general": es el atributo de calidad principal del producto. Ningún otro rol lo tenía asignado.

**✅ Fortalezas**

- **Historial append-only real:** `asignaciones_*` se cierran por `fecha_fin`, nunca se borran; `eventos_equipo`, `ticket_eventos` y `accesos_log` sin policies de escritura de cliente, alimentados solo por triggers `SECURITY DEFINER`.
- **Métricas derivadas de eventos, no de texto frágil.** `reportesTickets.js:6-10` documenta la decisión de leer *todos* los `estado_cambiado` y derivar el destino con `destinoDeCambio()` en vez de un `ilike` sobre el detalle, "así el reporte no se cae en silencio a 0 si cambia el texto del trigger". Y atribuye la resolución a quien la marcó (el `user_id` del evento), no al `asignado_a` actual, que puede cambiar. Ese es el criterio correcto.
- **Definiciones ambiguas resueltas y escritas:** `esRespondida()` usa `fecha_envio` como único criterio, con el comentario de que antes había dos definiciones del mismo concepto en el mismo reporte (`:218-223`). El backlog se declara "foto de HOY, no del cierre del periodo", con el porqué de no reconstruirlo.
- **`reportePeriodo.js` maneja la zona horaria correctamente y lo explica**: `aISO()` construye la fecha local componente por componente, con el comentario *"No sirve `toISOString()`: convierte a UTC y en Perú (UTC-5) devolvería el día anterior para cualquier hora antes de las 19:00"* (`:22-28`). Y `aFecha()` evita `new Date('2026-08-05')` por la misma razón. 23 tests cubren esta aritmética.

**🔴 Problemas críticos**

- **T-01 · El error de zona horaria que `reportePeriodo.js` documenta está presente en 24 lugares del resto del sistema.** El patrón `new Date().toISOString().split('T')[0]` aparece **24 veces en 12 archivos** (verificado por grep), incluido el helper canónico `core/utils.js:35 todayISO()`. En Perú (UTC-5) devuelve **la fecha de mañana** todos los días entre las 19:00 y las 23:59 hora local. Impactos concretos y ordenados por gravedad:

  | Sitio | Efecto de un uso a las 20:00 hora Perú |
  |---|---|
  | `empleados.js:201` (`bajaEmpleado`) | Todas las asignaciones cerradas quedan con `fecha_fin` = **mañana**: el historial dice que el empleado tuvo el acceso un día más de lo real. Es el activo principal del producto. |
  | `cuentas.js:46,95,155`, `licencias.js:120,126`, `correos.js:149`, `equipos.js:150,208,217,230` | Igual, en cada alta/cierre de asignación de cuenta, licencia, correo y equipo — incluido `fecha_inicio`, que queda **en el futuro**. |
  | `dashboard.js:152,169` | `vencida: fecha_vencimiento < hoy` → una licencia o garantía que vence **hoy** se muestra como **ya vencida**. |
  | `dashboard.js:218` (`fechaEnDias`) | La ventana de "próximos 30 días" se corre un día; afecta a los pendientes del dashboard y a los KPIs. |
  | `ProblemaDetalleView.vue:209` | Una acción correctiva con fecha límite **hoy** se pinta como **vencida**. |
  | `LicenciasView.vue:132` (`do…while (d <= HOY)`) | El cálculo de la próxima renovación puede saltarse un periodo. |

  Es **un solo defecto con una sola corrección** (una función `hoyLocalISO()` reutilizando la lógica ya probada de `reportePeriodo.js:aISO`), reemplazada en 24 sitios, cubrible con tests. Y la prueba de que el equipo ya conoce el problema es que lo resolvió bien —y lo comentó— en el módulo más nuevo, sin propagar la corrección hacia atrás.

**⚠️ Riesgos / deuda técnica**

- **T-02 · Sin garantía de integridad del cifrado a nivel de esquema.** Ver S-03: ninguna restricción impide texto plano en `cuentas.password` / `licencias.clave` / `accesos_sensibles.password`. Un `CHECK (password IS NULL OR password ~ '^(enc2?|sens1):')` convertiría el invariante en una garantía de la base.
- **T-03 · Sin backup verificado ni RPO declarado.** No hay nada en el repo sobre respaldo o recuperación. La pérdida del backfill de KB (`PANORAMA §6`) es evidencia de que la restauración ya se evaluó una vez y se descartó como no viable ("sin sobrescribir todo lo demás"). Para un sistema con el historial de accesos de 83 personas, "no sabemos si hay backup ni cómo se restaura parcialmente" es una deuda de datos, no de infraestructura. **No verificable desde el repo** — requiere revisar el plan de InsForge.
- **T-04 · Métricas del reporte sin cota de filas.** `obtenerReporteTickets()` trae todos los tickets del periodo, todos los `estado_cambiado` y todos los abiertos actuales sin `limit` (`reportesTickets.js:59-78`). Mismo riesgo que P-01: si PostgREST trunca por su tope por defecto, el reporte que va a gerencia **subreporta sin avisar**. El código ya troceó los filtros `in` por el límite de URL; el tope de filas de respuesta es el mismo tipo de problema, no cubierto.

---

## 4. Matriz de priorización (impacto × esfuerzo)

Esfuerzo: **S** ≤ ½ día · **M** 1–3 días · **L** > 3 días.

| ID | Hallazgo | Rol | Impacto | Esfuerzo | Clasificación |
|---|---|---|---|---|---|
| **T-01** | Fecha UTC en 24 sitios → historial y vencimientos con un día de error | Datos | Corrompe el activo principal, silenciosamente, todos los días | **S** | 🔴 **Crítico** |
| **S-01** | Endpoint público `crear` sin rate-limit, sin cota de texto, con correo a destinatario arbitrario | Seguridad | Abuso anónimo; el vector de correo se arma solo al habilitar SMTP | **M** | 🔴 **Crítico** |
| **S-02** | 4 CVE altas en deps de producción (`ws`, `socket.io-parser`) | Seguridad | DoS por agotamiento de memoria en el camino de realtime | **S** | 🔴 **Crítico** |
| **Q-01** | Los tests de integración y de BD dan check verde sin ejecutarse | QA | El único guardrail del fallo que ya ocurrió está inactivo | **S** | 🔴 **Crítico** |
| **A-01** | Bajas y transiciones de estado sin atomicidad | Arquitectura | Estados inconsistentes irreconciliables, sin rastro | **M** | 🔴 **Crítico** |
| **D-01** | Cero observabilidad de producción | DevOps | MTTD = "cuando alguien llama" | **M** | 🟠 Alto |
| **U-01** | Texto terciario a 2,54:1 en 15 componentes, prescrito por la guía | UX | Incumple WCAG AA y se propaga a cada pantalla nueva | **S** | 🟠 Alto |
| **S-03 / T-02** | `for update` sin `with check`; sin `CHECK` de prefijo de cifrado | Seguridad/Datos | El invariante "siempre cifrado" lo sostiene solo el cliente | **S** | 🟠 Alto |
| **P-01** | Dashboard cuenta descargando todas las filas | Performance | Los contadores empezarán a mentir en silencio | **S** | 🟠 Alto |
| **Q-04** | `functions/*.ts` (1.025 líneas) nunca se compilan; sin linter | QA | Errores de tipo en los 2 archivos más sensibles llegan a producción | **S** | 🟠 Alto |
| **S-04** | Sin CSP, HSTS ni anti-framing en Vercel | Seguridad | App que muestra contraseñas, sin defensas de navegador | **S** | 🟠 Alto |
| **W-01 / W-02** | `AGENTS.md` dice que no hay tests; README omite 10 migraciones | Docs | Induce a error a quien continúa el trabajo | **S** | 🟠 Alto |
| **T-04** | Reporte a gerencia sin cota de filas | Datos | Subreporta sin avisar al crecer el volumen | **S** | 🟡 Medio |
| **P-02** | Realtime recarga la bandeja completa por cada cambio, en cada sesión | Performance | S×E recargas; hoy invisible, no escala | **S** | 🟡 Medio |
| **U-05** | Cierre de ticket sin resumen → borradores de KB vacíos | UX/Producto | 1 artículo en 63 tickets; el checkbox promete y no entrega | **M** | 🟡 Medio |
| **A-02** | Roles por literal de ruta en el guard | Arquitectura | Rutas nuevas nacen sin bloqueo ni auditoría | **S** | 🟡 Medio |
| **U-02** | Sin `:focus-visible` propio en botones | UX | Navegación por teclado degradada | **S** | 🟡 Medio |
| **D-06** | CI no corre `contraste.mjs` ni `npm audit` | DevOps | Guardrails existentes que no guardan | **S** | 🟡 Medio |
| **Q-02 / Q-03** | Cero tests de componentes y de `api/domains` | QA | El pegamento y las reglas de negocio sin red | **L** | 🟡 Medio |
| **P-03** | ~390 KB de chunks de PDF muertos | Performance | Descarga innecesaria al abrir el reporte | **S** | 🟡 Medio |
| **D-02 / D-03** | Deploy de functions y migraciones sin control de estado | DevOps | No se puede saber qué está desplegado | **M** | 🟡 Medio |
| **W-03 / W-05** | Guía UX desactualizada (y codifica U-01); sin diagrama | Docs | Propaga defectos; coste de onboarding | **S** | 🟡 Medio |
| **S-05 / S-06** | Tokens en consola; passthrough de texto plano sin log | Seguridad | Exposición y ceguera menores | **S** | 🟢 Bajo |
| **U-03 / U-04** | Tipografía en px desde 11px; hex de WhatsApp fuera de tokens | UX | Legibilidad y coherencia | **S** | 🟢 Bajo |
| **A-03** | `main.css` global de 1.656 líneas con cola desordenada | Arquitectura | Mantenibilidad; ya hay erosión visible | **M** | 🟢 Bajo |
| **P-04** | 3 consultas solapadas en pendientes de tickets | Performance | Latencia menor del dashboard | **S** | 🟢 Bajo |
| **D-04 / D-05** | `.vite/deps` versionado; HTML legacy en la raíz | DevOps | Higiene | **S** | 🟢 Bajo |
| **A-05 / W-04 / Q-05** | Sin ADRs, CONTRIBUTING, CHANGELOG ni registro de bugs | Varios | Se pierde el porqué; el próximo ciclo empieza de cero | **M** | 🟢 Bajo |
| **T-03** | Sin backup verificado ni RPO declarado | Datos | **No verificable desde el repo** — requiere plan InsForge | ? | 🟠 Alto (a confirmar) |
| **U-06** | Tablas móviles solo con scroll horizontal | UX | Depende del uso móvil real — **dato que falta** | M | ? (medir antes) |

---

## 5. Plan de refactorización por fases

### Fase 1 — Corrección e higiene crítica (objetivo: 2–3 días)

*Sin dependencias entre ítems salvo lo indicado. Todos verificables con la suite actual + tests nuevos.*

| # | Qué cambiar | Por qué / riesgo de no hacerlo | Esf. | Depende de |
|---|---|---|---|---|
| 1.1 | **T-01** · Añadir `hoyLocalISO()` en `core/formatters.js` (reutilizando la lógica probada de `reportePeriodo.js:aISO`), reescribir `core/utils.js:todayISO()` sobre ella y reemplazar los **24** call sites. Añadir tests con hora fijada a 20:00 America/Lima. | Cada tarde se escriben fechas de asignación erróneas en el historial, y licencias/garantías/acciones se marcan vencidas un día antes. Cada día que pasa hay más filas malas que corregir. | S | — |
| 1.2 | **S-02** · `npm audit fix` y evaluar `@insforge/sdk` → 1.5.2. Verificar realtime tras el cambio (bandeja de tickets + seguimiento público). | 4 CVE altas en el camino de realtime, con corrección en un comando. | S | — |
| 1.3 | **S-01** · En `functions/tickets.ts`: (a) rate-limit por IP en `crear` reutilizando `ipDesdeHeaders()` + `ticket_busqueda_intentos` (o tabla propia); (b) topes de longitud en `titulo` (200) y `descripcion` (5.000) con rechazo explícito, más `maxlength` en `TicketNuevoView.vue`; (c) **eliminar** la rama `contacto → correoDestino` de `:310`, o exigir que el correo coincida con `empleados.correo_personal` del empleado ya identificado por DNI. | Escritura anónima sin tope; y el relay de correo se activa solo, sin tocar código, en cuanto se habilite SMTP (que está en la hoja de ruta). | M | Redeploy de la función |
| 1.4 | **Q-01** · Configurar `INSFORGE_TEST_STAFF_EMAIL/PASSWORD` (cuenta de staff dedicada a CI, **nunca** una personal) e `INSFORGE_ACCESS_TOKEN` como secrets, y hacer que ambos jobs **fallen** si los secrets faltan en `main` (el skip queda solo para PRs de forks). | Los checks verdes no verifican nada; el guardrail del fallo que ya ocurrió en producción está inactivo. | S | Crear cuenta de CI |
| 1.5 | **A-01** · Mover `bajaEmpleado` a una función `SECURITY DEFINER` (nueva migración) invocada por RPC, con las 4 escrituras en una transacción. Mientras no exista: registrar el fallo parcial y mostrarlo al usuario en vez de dejarlo en silencio. | Un fallo intermedio deja al empleado en un estado inconsistente que nadie detecta. **Requiere revisión humana obligatoria**: migración + camino de datos. | M | 1.1 (usa la fecha corregida) |
| 1.6 | **W-01 / W-02** · Corregir `AGENTS.md:99` y su `Vigencia`; completar la tabla de migraciones del README con 025–036 y arreglar `README.md:181`. | Documentación que induce a error a quien continúa el trabajo. | S | — |
| 1.7 | **D-06** · Añadir al CI: `node scripts/contraste.mjs` y `npm audit --omit=dev --audit-level=high`. | Guardrails que existen y no guardan. | S | 1.2 (si no, el audit falla de entrada) |

### Fase 2 — Endurecimiento y arquitectura (objetivo: 1–2 semanas)

| # | Qué cambiar | Por qué / riesgo | Esf. | Depende de |
|---|---|---|---|---|
| 2.1 | **D-01** · Reporte de errores en el frontend (Sentry o equivalente): `window.onerror`, `unhandledrejection` y los `catch` de `api/domains/*`, con el usuario anonimizado y **sin** ningún campo de contraseña. Alerta sobre eventos `correo_fallido` y sobre `'(error al descifrar)'` (S-06). | Hoy el primer aviso de cualquier fallo es una llamada. | M | Elegir proveedor |
| 2.2 | **S-04** · Bloque `headers` en `frontend/vercel.json`: CSP (con el origen de InsForge en `connect-src` y `wss:` para realtime), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`. | App que muestra contraseñas descifradas, sin defensas de navegador. Probar CSP en preview antes de producción. | S | — |
| 2.3 | **S-03 / T-02** · Migración: `CHECK` de prefijo de cifrado en `cuentas.password`, `licencias.clave`, `accesos_sensibles.password`; `with check (es_staff())` en las policies `for update`. | Convierte el invariante central del producto en garantía de base de datos. **Revisión humana obligatoria** (migración sobre datos sensibles; verificar antes que no haya filas que violen el CHECK). | S | Verificar datos actuales |
| 2.4 | **Q-04** · `tsconfig.json` con `checkJs: false` y `npx tsc --noEmit` sobre `functions/*.ts` en CI (con los tipos de Deno). Añadir ESLint (`eslint-plugin-vue`) y Prettier alineados al estilo existente. | 1.025 líneas de TS sin compilar, en los dos archivos más sensibles. | S | — |
| 2.5 | **P-01 / T-04 / P-04** · `{ count: 'exact', head: true }` en `getEstadisticas()`; empujar al servidor el filtro de `equiposSinDevolver`; unificar las 3 consultas de `pendientesTickets()`; cota explícita + aviso de truncamiento en el reporte. | Contadores y reportes que empezarán a mentir en silencio al crecer. | S | — |
| 2.6 | **U-01 / U-02 / U-03** · Subir `--mat-color-text-tertiary` a ≥4,5:1 sobre `bg` y `bg-elevated` (p. ej. #6B7280, ya usado en oscuro); revisar `text-secondary` sobre `bg-subtle`; añadir `:focus-visible` con `--mat-ring` a `.btn`/`.icon-btn`/enlaces; **ampliar `scripts/contraste.mjs` a los pares de texto sobre superficie**, no solo badges; actualizar `GUIA-UX-UI.md` (W-03). | Falla WCAG AA en 15 componentes, y la guía la prescribe. Ampliar el verificador es lo que evita la regresión. | S | 1.7 (CI ya corre el script) |
| 2.7 | **A-02** · `meta.rol: 'JEFE'` en las rutas restringidas + un solo chequeo genérico en `guards.js`. | Rutas nuevas nacen sin bloqueo por rol ni auditoría. | S | — |
| 2.8 | **P-02 / P-03** · Separar "notificar ticket nuevo" de "recargar bandeja" (recargar solo si `TicketsView` está montada, con debounce); excluir `html2canvas`/`dompurify` del grafo de jsPDF. | No escala; descarga innecesaria. | S | — |
| 2.9 | **D-02 / D-03** · Registrar el SHA desplegado de cada edge function (constante `VERSION` devuelta por una acción `ping`) y adoptar una tabla `schema_migrations` propia poblada por `apply-migration.mjs`. | Hoy no hay forma de saber qué está desplegado ni qué migraciones se aplicaron. | M | Decisión de formato |

### Fase 3 — Deuda menor, producto y cobertura (continuo)

| # | Qué cambiar | Por qué / riesgo | Esf. |
|---|---|---|---|
| 3.1 | **U-05** · Campo "resumen de resolución" al marcar resuelto (síntoma + solución), que alimente `sintoma`/`solucion` del borrador de KB. | Desbloquea la Base de Conocimiento, hoy en 1 artículo tras 63 tickets. Es la mejora de producto con más retorno del informe. | M |
| 3.2 | **Q-02 / Q-03** · `@vue/test-utils` + jsdom para los 5 componentes de mayor riesgo (`BajaEmpleadoModal`, `TicketDetalleView`, `EmpleadoForm`, `ReporteTicketsModal`, `LoginView`); stub de PostgREST para testear `api/domains/*`. | El pegamento y las reglas de negocio siguen sin red. | L |
| 3.3 | **A-03 / U-04** · Partir `main.css` por capas (tokens / base / componentes / utilidades), reubicar la cola de reglas huérfanas, tokenizar el verde de WhatsApp. | Mantenibilidad; la erosión ya es visible. | M |
| 3.4 | **A-05 / W-04 / W-05 / Q-05** · `docs/adr/` con las decisiones ya tomadas (extraídas de `PANORAMA §6`), CONTRIBUTING, CHANGELOG, un diagrama de arquitectura y un registro de incidentes. | Evita que el próximo ciclo de auditoría empiece de cero. | M |
| 3.5 | **D-04 / D-05 / S-05** · Sacar `.vite/deps` del control de versiones; revisar y borrar `sistema_credenciales_ti.html*`; gatear los `console.*` de realtime por `import.meta.env.DEV`. | Higiene. | S |
| 3.6 | **T-03** · Confirmar política de backup y RPO con InsForge; documentar el procedimiento de restauración parcial. | La pérdida del backfill de KB ya demostró que no existe un camino de restauración parcial conocido. | ? |
| 3.7 | **U-06** · Medir uso móvil real antes de invertir en un patrón de tarjeta para listados. | No invertir a ciegas. | S (medición) |

---

## 6. Reporte de validación

**Qué se ejecutó realmente en esta auditoría (evidencia, no supuestos):**

| Verificación | Comando | Resultado |
|---|---|---|
| Suite unitaria completa | `npx vitest run` | **93 pasan, 1 se omite** (el smoke de integración, por falta de credenciales de CI), 11 archivos, 1,28 s |
| Build de producción | `npx vite build` | **✓ en 6,66 s**, 40+ chunks; mayor vendor 385 KB (112 KB gzip) |
| Contraste de badges | `node scripts/contraste.mjs` | **0 fallas** en tema claro y oscuro |
| Contraste de texto sobre superficie | cálculo WCAG propio sobre los tokens de `main.css` | **4 fallas** (terciario 2,54:1 y 2,37:1; secundario sobre subtle 4,31:1; disabled 1,63:1) → U-01 |
| Vulnerabilidades de dependencias | `npm audit --omit=dev` | **4 altas** en deps de producción → S-02 |
| Versiones desactualizadas | `npm outdated` | `@insforge/sdk` 1.4.0 → 1.5.2; `vue` 3.5.38 → 3.5.41 |
| Presencia del defecto de fecha | `grep -rn "toISOString().split"` | **24 coincidencias en 12 archivos** → T-01 |
| Remediación de la auditoría previa | inspección de los 12 hallazgos en el código actual | **12/12 siguen en su lugar** |
| Existencia de linter/typecheck | comprobación de 9 rutas de configuración | **ninguna existe** → Q-04 |

**Qué NO se probó y hay que probar:**

- **Ningún cambio se aplicó al código**, así que no hay comparación antes/después que reportar. Este documento es el único artefacto generado, más las dos correcciones de documentación de §7.
- **Las policies RLS reales nunca se han ejercitado automáticamente** (limitación estructural documentada en `PANORAMA §6`: `project_admin` tiene `BYPASSRLS` y el CLI bloquea `SET ROLE`). Sigue siendo verificación manual con dos cuentas en el navegador. Pendiente heredado, no nuevo.
- **Todo lo dependiente de plataforma**: ownership de las tablas por la anon key, visibilidad de los buckets, si el SMTP real está activo (cambia la severidad de S-01), cabeceras que sirve Vercel, backups y RPO.
- **Flujos críticos no ejercitados en vivo**: revelado de contraseña, entrega de un solo uso, creación de ticket público, encuesta de satisfacción. El README ya define el smoke test manual de 7 pasos; ejecutarlo tras cualquier ítem de Fase 1.

**Cambios que exigen revisión humana obligatoria antes de mergear (no automatizables):**

1. **1.3 (S-01)** — toca un endpoint público sin sesión; un rate-limit mal calibrado deja a empleados reales sin poder reportar. Probar con el formulario real antes de desplegar.
2. **1.5 (A-01)** — migración nueva + reescritura del camino de baja de empleado (escribe en 4 tablas, incluido soft-delete de cuentas).
3. **2.3 (S-03/T-02)** — `CHECK` sobre columnas de contraseñas: **verificar primero** que no haya filas en producción que lo violen, o el `ALTER TABLE` falla o bloquea escrituras legítimas.
4. **Cualquier cosa que toque `stores/auth.js`, `router/guards.js`, `insforge.toml` o `migrations/003`** — es la superficie de autenticación y roles.
5. **2.2 (CSP)** — una CSP mal armada rompe realtime (`wss:`) y las llamadas a las edge functions de forma silenciosa. Validar en un deploy de preview.

**Nota de proceso:** el working tree tiene 17 archivos sin commitear (el reporte de tickets por periodo + migración 036). Ese trabajo se auditó y su calidad es buena (§3.4, §3.6); conviene **commitearlo y aplicar la 036 antes** de empezar la Fase 1, para no mezclar el refactor con una funcionalidad a medio integrar.

---

## 7. Documentación a crear/actualizar y changelog del ciclo

### Cambios aplicados en este ciclo

| Archivo | Cambio | Motivo |
|---|---|---|
| `auditoria_integral_2026-08-05.md` | **Creado** (este documento) | Auditoría multidisciplinaria, matriz de priorización y plan de 3 fases |
| `AGENTS.md:99` | **Corregido**: "no hay tests automatizados aún" → estado real de la suite y cómo correrla; `Vigencia` actualizada | W-01 — la línea invitaba activamente a no correr 94 tests existentes |
| `README.md` | **Corregido**: `migrations/ # 001..019` → `001..036`; tabla de Historial de migraciones completada con 025–036 | W-02 — el checklist de deploy usa esa tabla como referencia y omitía 10 migraciones |

No se modificó ninguna línea de código de aplicación, ninguna migración ni ninguna configuración de despliegue.

### Documentación a crear (Fase 2–3)

| Documento | Contenido mínimo | Por qué |
|---|---|---|
| `docs/adr/` | Un ADR por decisión ya tomada, extrayéndolas de `PANORAMA §6`: por qué no `db migrations up`; por qué las edge functions no comparten código; por qué no hay tabla de notificaciones; por qué no hay SLA; por qué la KB arranca vacía; por qué el historial remoto de migraciones está vacío (**registrar que no hay razón documentada** — el propio `PANORAMA` lo concluye) | `PANORAMA §6` es hoy un ADR-log implícito y crece sin estructura |
| `CONTRIBUTING.md` | Convención de commits (ya existe de hecho: `fix(scope):`, `feat(scope):`, `docs:`), cómo correr tests y el smoke de integración, qué exige revisión humana (la lista de §6), y el flujo de las 3 capas de despliegue | La convención existe y no está escrita en ningún sitio |
| `CHANGELOG.md` | Desde la migración 020 hacia adelante, ligando migración ↔ funcionalidad ↔ commit | Hoy la historia solo se reconstruye leyendo `git log` y dos tablas mantenidas a mano |
| `docs/arquitectura.md` (+ diagrama) | Quién habla con quién y **con qué credencial**: navegador (anon key + JWT) → PostgREST/RLS; navegador → edge functions; edge functions (admin key) → base; frontera público/privado; las 3 capas de despliegue | 31 tablas, 2 functions y 3 pipelines sin ninguna representación visual (W-05) |
| `docs/incidentes.md` | Registrar los ya conocidos: pérdida del backfill de KB (031), crash del CLI en DDL, 400 por `es_base_conocimiento`, tablas `test_probe` huérfanas | Hoy son prosa dentro de `PANORAMA §6`; no se puede consultar "¿esto ya pasó?" (Q-05) |

### Documentación a actualizar (Fase 2)

- **`docs/GUIA-UX-UI.md`** — `Vigencia` (lleva 4 semanas de retraso), documentar los módulos KB / Problemas / modal de Reporte, y **eliminar la prescripción de `.text-muted` en terciario** una vez corregido U-01. Añadir la regla de `:focus-visible` y la de "todo par texto/superficie nuevo pasa por `scripts/contraste.mjs`".
- **`docs/PANORAMA_SISTEMA.md`** — al aplicar la 036, actualizar §2 y §7; incorporar T-01 y su corrección a §6 como decisión cerrada (es exactamente el tipo de hallazgo que ese documento existe para conservar).
- **`README.md`** — al cerrar Fase 1: registrar en el modelo de seguridad los límites nuevos del endpoint público de tickets, y añadir al checklist de deploy la verificación de cabeceras HTTP.
- **`AGENTS.md`** — añadir la regla `hoyLocalISO()` ("nunca `new Date().toISOString().split('T')[0]`: en Perú devuelve el día siguiente después de las 19:00") a las Reglas del proyecto, junto a las de contraseñas y softdelete. Es la única forma de que T-01 no vuelva.

### Qué queda pendiente al cerrar este ciclo

1. **Nada de código ha cambiado**: los 5 hallazgos críticos siguen abiertos. La Fase 1 es la unidad mínima de trabajo con sentido.
2. **Cinco vacíos no verificables desde el repo** siguen abiertos y requieren acceso al dashboard de InsForge y Vercel: ownership de tablas, visibilidad de buckets, estado real del SMTP (**condiciona la severidad de S-01**), cabeceras HTTP y política de backup/RPO (T-03).
3. **La cobertura de RLS sigue siendo 100% manual** y no es automatizable con la conexión actual del CLI. Si esto importa, la vía es un branch de InsForge con una sesión de usuario real, no el canal `project_admin`.
4. **Decisión de producto pendiente**: si el correo transaccional se habilita, la Fase 1.3 pasa a ser bloqueante, no importante.
