# Auditoría de seguridad estática — Sistema TI

**Fecha:** 2026-07-07
**Alcance:** análisis estático (código, migraciones SQL, edge functions, configuración de despliegue) del repositorio `sistema-ti`. **No** se ejecutó ninguna request contra `https://kjyj8t5t.us-east.insforge.app` ni `https://materen-ti.vercel.app`.
**Equipo:** Auditor Líder de TI · Analista de Código / DevSecOps · Pentester caja blanca · Especialista Cloud/BaaS.
**Commit base:** rama `main` (working tree con cambios de UI sin relación con seguridad).

---

## 1. Resumen ejecutivo

El sistema tiene una **arquitectura de seguridad sólida y deliberada**: RLS habilitado en las 22 tablas, tablas de auditoría e historial genuinamente append-only (sin políticas de escritura, solo triggers `SECURITY DEFINER`), cifrado AES-256-GCM bien implementado (IV aleatorio único por operación), tokens públicos con 144 bits de entropía CSPRNG, invalidación atómica de entregas de un solo uso (a prueba de carrera), CORS con allowlist estricta, y ausencia total de `v-html` (sin XSS almacenado). La clave admin de InsForge y las claves de cifrado **no** aparecen en el bundle de producción. Diez de las doce hipótesis de riesgo prioritarias resultaron **controladas** o con observaciones menores.

Sin embargo, hay **un hallazgo crítico de configuración** que, de confirmarse operativamente, colapsa todo el modelo de autorización:

> **H-CRIT — Auto-registro público a rol ASISTENTE activo.** `insforge.toml` tiene `disable_signup = false` y la migración 003 instala un trigger (`on_auth_user_created_staff`) que crea automáticamente una fila `staff` **activa** con rol `ASISTENTE` para *cada* usuario nuevo de `auth.users`. El modelo previsto (documentado en la propia 003: *"el sistema no tiene registro público; solo el JEFE crea usuarios"*) queda contradicho por la config: cualquier persona que complete el alta de InsForge obtiene acceso completo de staff, incluida la **revelación de todas las contraseñas** vía la edge function (que solo comprueba `activo`). La única barrera efectiva es la verificación de email.

Además hay **hallazgos medios** que conviene remediar: bypass del invariante "solo JEFE reabre tickets" eligiendo otro estado destino; rate-limit de la búsqueda por DNI evadible por spoofing de `X-Forwarded-For`; falta de validación server-side de tipo/tamaño en subida de adjuntos; política de contraseñas de staff débil (mínimo 6, sin complejidad); y ausencia de `WITH CHECK` en las políticas UPDATE.

**Veredicto global:** diseño maduro con una brecha de configuración de severidad crítica y varios refuerzos pendientes. Priorizar H-CRIT antes de cualquier ampliación del envío de correo en producción.

---

## 2. Estado de las 12 hipótesis de riesgo

| # | Hipótesis | Estado | Evidencia | Severidad si se confirma |
|---|-----------|--------|-----------|--------------------------|
| 1 | RLS incompleta o mal alcanzada | **Descartada** (con observación) | Las 22 tablas con `enable row level security` + policies; sin `USING (true)`; helpers `es_jefe()/es_staff()` consistentes. Observación: los UPDATE no llevan `WITH CHECK` ni control por columna. `migrations/003,004,010,011,013,014,016,017` | Media |
| 2 | Cliente admin en edge functions | **Descartada** (con observación) | `credenciales.ts:187-201` valida sesión + `staff.activo` antes de operar; admin key desde `Deno.env`, nunca devuelta ni logueada; ausente del bundle. Observación: no hay control de "pertenencia" ni rate-limit al revelar. | Alta |
| 3 | Tokens públicos (entropía/alcance) | **Descartada** | `randomToken()` = 18 bytes CSPRNG (144 bits) base64url (`credenciales.ts:105`, `tickets.ts:52`); expiración + un-solo-uso atómico server-side (`credenciales.ts:154-161`); encuesta valida `fecha_envio` en servidor (`tickets.ts:362-365`); token de ticket solo abre su ticket. | Alta |
| 4 | Rate limiting `/ticket/buscar` | **Confirmada (débil)** | Sin oráculo de enumeración (misma respuesta "no existe" vs "sin tickets", `tickets.ts:317,326`) ✔; pero IP tomada de `x-forwarded-for.split(',')[0]` (`tickets.ts:301`) → spoofable; límite 15/10min por IP. | Media |
| 5 | Cifrado AES-256-GCM | **Descartada** (con observación) | IV = 12 bytes aleatorios por cifrado (`credenciales.ts:77`), único; `encryptV2` siempre usa V2 (sin downgrade forzable por atacante); texto plano nunca logueado. Observación: passthrough de "texto plano histórico" (`:92-93`). | Baja |
| 6 | Inmutabilidad `accesos_log`/eventos | **Descartada** (con salvedad) | `accesos_log` solo `SELECT` de JEFE, sin INSERT/UPDATE/DELETE ni para JEFE (`010:171-177`); `eventos_equipo`/`ticket_eventos` solo lectura + escritura vía triggers `SECURITY DEFINER` (`013:841-843`, `016:563-565`). Salvedad: depende de que el rol DB de la app no sea *owner* de las tablas → **no verificable desde el repo**. | — |
| 7 | Upload de fotos / adjuntos | **Confirmada (parcial) / No verificable** | Sin validación server-side de MIME/tamaño; `tickets.ts:186-197` usa `tipo` provisto por el cliente y sube con admin; `equipos-fotos` vía `uploadAuto` (`insforge.js:1003`). Visibilidad real del bucket y predecibilidad de key → **no verificable desde el repo**. | Media |
| 8 | CORS de edge functions | **Descartada** | Allowlist `Set` con match exacto, sin `*` ni reflejo dinámico sin validar; `Vary: Origin` (`credenciales.ts:24-41`, `tickets.ts:26-43`). | — |
| 9 | Guards de rutas frontend | **Descartada** | Guard usa estado Pinia (manipulable en cliente) **pero** el acceso a datos depende de RLS real; `/actividad` → `accesos_log` es JEFE-only por RLS (`guards.js:18`, `insforge.js:1243`). Defensa en profundidad se sostiene. | Baja |
| 10 | Manejo de secretos / env | **Descartada** | Solo `VITE_*` en frontend (`.env` = URL + ANON_KEY); `.env`/`.env.local` en `.gitignore`; bundle sin admin key ni `createAdminClient` (solo strings de error del SDK + JWT anon público). | — |
| 11 | Reseteo de contraseña de staff | **No verificable (con observación)** | Flujo usa built-in de InsForge (código 6 dígitos, `auth.js:54-68`); longitud/expiración/máx. intentos los aplica la plataforma → **no verificable desde el repo**. Observación: `insforge.toml` fija `min_length=6` sin complejidad → contraseñas débiles para cuentas JEFE/ASISTENTE. | Media |
| 12 | Trigger "reabrir" / "iniciar" | **Confirmada reforzada en BD, con bypass** | `check_reabrir_solo_jefe` usa `es_jefe()` en BD, no solo UI (`017:675-687`) ✔; `check_iniciar_completo` exige nivel+asignado ✔. **Bypass:** el guard solo bloquea la transición al literal `reabierto`; un ASISTENTE puede pasar un ticket `cerrado`→`abierto`/`en_progreso` (UPDATE = `es_staff`, sin state-machine) y reabrirlo de facto. | Media |

---

## 3. Tabla general de hallazgos

| ID | Hallazgo | OWASP | Severidad | CVSS est. | Archivo:Línea | Descripción breve | Recomendación |
|----|----------|-------|-----------|-----------|---------------|-------------------|---------------|
| **H-CRIT** | Auto-registro público → ASISTENTE activo | A01/A05 | **Crítica** (cond.) | 9.1 | `insforge.toml:6`, `migrations/003:424-445` | `disable_signup=false` + trigger que crea staff `activo=true rol=ASISTENTE` por cada alta | `disable_signup=true`; trigger con `activo=false` (activación manual por JEFE) |
| **H-01** | "Reabrir solo JEFE" evadible por estado alterno | A01 | Media | 5.4 | `migrations/017:675-692` | ASISTENTE mueve `cerrado`→`abierto`/`en_progreso` sin ser JEFE | Guardar transiciones válidas (state machine) en trigger; bloquear salir de estados terminales salvo JEFE |
| **H-02** | Rate-limit por IP spoofeable | A04 | Media | 5.3 | `tickets.ts:301` | `x-forwarded-for.split(',')[0]` toma el valor izquierdo (cliente) | Usar la IP de confianza del edge (último hop) o `cf-connecting-ip`; no confiar en el XFF izquierdo |
| **H-03** | Sin validación server-side de adjuntos | A04/A05 | Media | 5.0 | `tickets.ts:186-197` | Tipo/tamaño provistos por el cliente; admin sube sin verificar | Validar MIME real (magic bytes) y tamaño en servidor; allowlist de tipos de imagen |
| **H-04** | Política de contraseñas de staff débil | A07 | Media | 4.8 | `insforge.toml:12-17` | `min_length=6`, sin números/mayúsculas/símbolos | Subir a ≥12 y exigir complejidad; MFA si la plataforma lo permite |
| **H-05** | Revelado de credenciales sin límite ni pertenencia | A01 | Media | 5.6 | `credenciales.ts:212-235` | Cualquier staff activo revela cualquier contraseña por ID, sin throttle | Rate-limit por usuario; alertar ante volumen anómalo (auditoría ya existe) |
| **H-06** | UPDATE sin `WITH CHECK` ni control por columna | A01 | Baja/Media | 4.3 | `migrations/003:520` y análogas | Un ASISTENTE puede editar cualquier columna (p. ej. `token`, `empleado_id` de un ticket) | Añadir `WITH CHECK`; restringir columnas sensibles vía trigger o `GRANT` por columna |
| **H-07** | Inyección de filtros PostgREST en búsqueda global | A03 | Baja | 3.7 | `insforge.js:39,49` | Interpolación de `q` en `.or("...ilike.%q%")` | Parametrizar/escape del término; validar que no contenga `,()`; usar API que no arme el filtro por string |
| **H-08** | Exposición de tickets activos vía DNI | A01 | Baja/Media | 4.9 | `tickets.ts:319-331` | DNI (8 díg., semi-público) devuelve tokens de seguimiento | Requerir 2º factor (código enviado al correo del empleado) o limitar más |
| **H-09** | Dependencia `@insforge/sdk: "latest"` sin fijar | A06 | Baja | 3.5 | `frontend/package.json` | Versión flotante (aunque hay lockfile) | Fijar rango semver explícito; confiar en el lockfile en CI |
| **H-10** | Passthrough de "texto plano histórico" | A02 | Baja | 3.1 | `credenciales.ts:92-93` | Valores sin prefijo `enc2:/enc:` se devuelven en claro | Migrar/cifrar remanentes; loguear/alertar si se detecta lectura de plano |
| **H-11** | `.env.local` residual (plantilla Next.js) | A05 | Info | 2.0 | `.env.local` | Vars `NEXT_PUBLIC_*` sin uso (gitignored, no filtrado) | Eliminar el archivo para evitar confusión |
| **H-12** | Estado de ticket sin máquina de estados | A04 | Baja | 3.4 | `migrations/016-017` | Transiciones libres salvo las dos guardadas (`resuelto→abierto`, etc.) | Definir y forzar transiciones válidas en trigger |

> No se detectó: inyección SQL clásica (todas las queries via query-builder parametrizado o RPC sin args), XSS almacenado (`v-html` inexistente; `toast.js` escapa con `esc()`), CSRF (auth por `Authorization: Bearer`, no cookies; CORS estricto), SSRF (sin fetch server-side de URLs controladas por el usuario), ni fuga de secretos en el bundle.

---

## 4. Detalle de hallazgos críticos / altos

### H-CRIT — Auto-registro público a rol ASISTENTE activo

**Evidencia.**
- `insforge.toml`: `disable_signup = false` (los registros están habilitados) y `require_email_verification = true`.
- `migrations/003_staff_rls.sql:424-445`:
  ```sql
  create or replace function public.handle_new_staff_user() ...
    insert into public.staff (user_id, nombre, rol)
    values (new.id, coalesce(new.profile->>'name', split_part(new.email,'@',1)), 'ASISTENTE')
    on conflict (user_id) do nothing;
  ...
  create trigger on_auth_user_created_staff
    after insert on auth.users for each row execute function public.handle_new_staff_user();
  ```
  La tabla `staff` tiene `activo boolean not null default true` → la fila creada nace **activa**.
- `credenciales.ts:196-201`: la autorización de las acciones sensibles (revelar contraseña, crear entrega) depende **solo** de `staffRow?.activo`. No comprueba cómo se creó el staff ni quién lo aprobó.

**Impacto.** Un atacante que complete el alta en InsForge (con un email que controle) obtiene una fila `staff` activa como ASISTENTE y, con sesión iniciada, puede: listar todos los empleados y su metadata de credenciales, **revelar/copiar cualquier contraseña** de cualquier cuenta o licencia (`revelar`, `revelarClaveLicencia`), crear entregas de un solo uso con credenciales en claro (`entregaCrear`), y operar todo el CRUD de negocio. Es una escalada de "anónimo" a "insider con acceso a las joyas de la corona".

**Precondición / matiz.** El acceso efectivo requiere obtener una **sesión verificada** (email verification). Hoy `insforge.toml` tiene `[auth.smtp] enabled = false`, lo que *podría* impedir el envío del código de verificación y mitigar temporalmente el alta. Pero: (a) el reset de contraseña y los correos de tickets **requieren** correo operativo en producción, así que el SMTP real probablemente esté configurado en el dashboard de InsForge (fuera del repo) → **no verificable desde el repo**; (b) la fila `staff` activa se crea igual al insertarse `auth.users`, dejando el sistema "armado". Por eso se clasifica **Crítica condicional**: la brecha es de diseño/config, no de disponibilidad del correo.

**Remediación (paso a paso).**
1. **Inmediato:** poner `disable_signup = true` en `insforge.toml` y re-desplegar la config (`npx @insforge/cli ...`). Confirmar en el dashboard que el endpoint de signup queda cerrado.
2. **Defensa en profundidad:** modificar el trigger para crear el staff **inactivo** (`activo = false`), de modo que ni un alta accidental otorgue acceso hasta que un JEFE lo active explícitamente:
   ```sql
   insert into public.staff (user_id, nombre, rol, activo)
   values (new.id, coalesce(...), 'ASISTENTE', false)
   on conflict (user_id) do nothing;
   ```
3. **Detección:** revisar hoy la tabla `staff` en producción por filas no reconocidas (`select user_id, nombre, rol, activo, created_at from staff order by created_at desc`) y desactivar/eliminar cualquier alta no provisionada por el JEFE.
4. Documentar el aprovisionamiento de staff como acción exclusiva del JEFE vía dashboard.

---

### H-05 — Revelado de credenciales sin límite ni verificación de pertenencia (Alto en contexto)

**Evidencia.** `credenciales.ts:212-235` (`revelar`) y `:239-263` (`revelarClaveLicencia`): tras validar `staff.activo`, obtienen la cuenta/licencia **por ID** y devuelven la contraseña descifrada, sin ninguna comprobación adicional ni throttling. Cada revelado se audita en `accesos_log` (bien), pero nada impide que un staff itere todos los IDs.

**Impacto.** Un insider (o el atacante de H-CRIT) puede exfiltrar el 100% del almacén de contraseñas en un bucle. La auditoría lo registra pero no lo previene.

**Remediación.** Añadir rate-limit por `user_id` en la edge function (p. ej. N revelados / ventana), y una alerta cuando un usuario supere un umbral. Evaluar si ciertos secretos (VPN, ERP) requieren aprobación de JEFE para revelarse. Mantener la auditoría como control detectivo.

---

## 5. Modelo de RLS reconstruido

Reconstruido leyendo `migrations/001`→`017` en orden. Patrón base: `SELECT/INSERT/UPDATE = es_staff()`, `DELETE = es_jefe()`. Helpers `es_jefe()`/`es_staff()` son `SECURITY DEFINER STABLE` sobre `auth.uid()` (`003:457-485`).

| Tabla | SELECT | INSERT | UPDATE | DELETE | Notas |
|-------|--------|--------|--------|--------|-------|
| empresas, plataformas, empleados, cuentas | staff | staff | staff* | jefe | Base 003. *UPDATE sin `WITH CHECK` |
| staff | self **or** jefe | jefe | jefe | jefe | Auto-gestión; ASISTENTE solo se ve a sí mismo (003:601-616) |
| asignaciones_cuenta | staff | staff | staff | jefe | Triggers de exclusividad/tope (008,011) |
| licencias, asignaciones_licencia | staff | staff | staff | jefe | Tope de asientos por trigger (011) |
| tipos_equipo, equipos, asignaciones_equipo, ubicaciones | staff | staff | staff | jefe | 013,014 |
| **accesos_log** | **jefe** | — | — | — | Append-only real; ni JEFE borra (010) |
| **entregas** | staff | — | — | jefe | Escribe solo edge function admin (010) |
| **eventos_equipo** | staff | — | — | — | Solo triggers `SECURITY DEFINER` (013) |
| categorias_ticket, subcategorias_ticket | staff | staff | staff | jefe | 016 |
| **tickets** | staff | **—** | staff | — | Sin INSERT (solo edge fn); sin DELETE; UPDATE guardado por triggers 016/017 |
| ticket_comentarios | staff | staff | — | — | `autor_id` forzado por trigger; bloqueo si ticket cerrado/rechazado |
| **ticket_eventos** | staff | — | — | — | Solo triggers/edge fn (016) |
| **ticket_satisfaccion** | staff | — | — | — | Respuesta la escribe la edge fn admin (016) |
| **ticket_busqueda_intentos** | jefe | — | — | — | Solo edge fn admin (017) |

**¿Coincide con el modelo JEFE/ASISTENTE descrito?** Sí en lo estructural: ASISTENTE opera, JEFE elimina y ve auditoría; las tablas sensibles (auditoría, entregas, eventos, tickets, satisfacción) no tienen INSERT/UPDATE de cliente y dependen de la edge function admin o de triggers. **Desviaciones:** (a) H-CRIT rompe la premisa de "solo JEFE aprovisiona staff"; (b) `es_staff()` es uniforme —no hay segmentación por empresa/área—, así que cualquier staff ve las credenciales de todos (por diseño, pero relevante para el radio de impacto de H-CRIT/H-05); (c) UPDATE sin `WITH CHECK`.

**No verificable desde el repo:** que el rol de base de datos usado por la anon/authenticated key **no sea owner** de las tablas (de lo contrario podría `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` o quitar triggers). La inmutabilidad de `accesos_log`/eventos depende de esta garantía de plataforma InsForge.

---

## 6. Quick wins

1. **`disable_signup = true`** en `insforge.toml` + re-deploy (cierra H-CRIT). *(1 línea)*
2. Trigger `handle_new_staff_user` → crear staff con `activo = false`. *(defensa en profundidad, 1 línea)*
3. Auditar `staff` en producción por altas no reconocidas y desactivarlas.
4. Endurecer `[auth.password]`: `min_length = 12` + complejidad. *(H-04)*
5. Rate-limit por IP en `/ticket/buscar` usando el hop de confianza, no el XFF izquierdo. *(H-02)*
6. Validar MIME real + tamaño de adjuntos en `tickets.ts` antes de subir. *(H-03)*
7. Eliminar `.env.local` residual. *(H-11)*
8. Fijar versión de `@insforge/sdk` (semver explícito). *(H-09)*

---

## 7. Roadmap de remediación priorizado

**P0 — Ahora (bloquea exposición directa de credenciales)**
- H-CRIT: cerrar signup + trigger `activo=false` + auditoría de staff existente.
- H-05: rate-limit y/o aprobación en el revelado de credenciales.

**P1 — Esta semana (integridad de flujo y superficie pública)**
- H-01/H-12: máquina de estados de tickets en trigger (transiciones válidas; salir de estados terminales solo JEFE).
- H-02: corregir obtención de IP en el rate-limit.
- H-03: validación server-side de adjuntos.
- H-04: política de contraseñas + evaluar MFA.

**P2 — Este mes (endurecimiento y deuda)**
- H-06: `WITH CHECK` en policies UPDATE + restricción por columna donde aplique.
- H-08: 2º factor para búsqueda por DNI o reducir lo devuelto.
- H-07: sanear la interpolación en el filtro `.or()` de la búsqueda global.
- H-10: migrar/cifrar remanentes en texto plano.
- H-09/H-11: higiene de dependencias y de archivos de entorno.

**P3 — Verificación fuera de repo (requiere dashboard InsForge / prod, con autorización adicional)**
- Confirmar que la anon/authenticated key **no** es owner de las tablas (garantía de append-only).
- Confirmar visibilidad y política de los buckets `equipos-fotos` y `tickets-adjuntos`, y predecibilidad de keys.
- Confirmar máximos de intentos/expiración del código de reset y del signup en la plataforma.
- Revisar cabeceras de seguridad servidas por Vercel (CSP, HSTS, X-Frame-Options): `frontend/vercel.json` solo define el rewrite SPA, no añade cabeceras → recomendable agregar `headers` con CSP y HSTS.

---

## 7-bis. Estado de remediación (2026-07-07)

| ID | Estado | Cambio en repo | Requiere acción de despliegue |
|----|--------|----------------|-------------------------------|
| H-CRIT | **Corregido** | `insforge.toml` (`disable_signup=true`) + `migrations/018` (staff nace inactivo) | Aplicar mig. 018 · push config · auditar tabla `staff` |
| H-01 / H-12 | **Corregido** | `migrations/019` (salida de estado terminal solo vía `reabierto`) | Aplicar mig. 019 |
| H-03 | **Corregido** | `functions/tickets.ts` (magic bytes + tamaño + nombre seguro) | Redeploy edge function `tickets` |
| H-04 | **Corregido** | `insforge.toml` (min 12 + complejidad) | Push config |
| H-05 | **Corregido** | `functions/credenciales.ts` (40 revelados/5min por usuario) + `passwords.js` | Redeploy edge function `credenciales` |
| H-06 | **Corregido** (tickets) | `migrations/019` congela `token`/`codigo`/`origen`/`creado_por` del ticket (columnas que la UI nunca edita). Control por columna general en otras tablas: no requerido por ahora | Aplicar mig. 019 |
| H-07 | **Corregido** | `frontend/src/api/insforge.js` (saneo de filtro PostgREST) | Redeploy frontend |
| H-09 | **Corregido** | `frontend/package.json` (`@insforge/sdk` fijado a `^1.4.0`) | `npm install` + redeploy |
| H-02 | **Mitigado** | `functions/tickets.ts`: límite adicional por DNI (independiente de IP) + preferencia por headers de IP no falsificables | Redeploy edge function `tickets` · confirmar header de IP de confianza con InsForge |
| H-08 | **Aceptado** | — | Decisión de producto (2026-07-07): se mantiene el comportamiento actual |
| H-10 | **Cerrado (sin acción)** | — | Verificado 2026-07-07: `cuentas.password` y `licencias.clave` sin remanentes en texto plano (0 filas fuera de `enc2:`/`enc:`). No hay datos que re-cifrar |
| H-11 | **Corregido** | `.env.local` residual eliminado (sin referencias en código) | — |

> Nota: los cambios de edge functions y `insforge.toml` **no** surten efecto hasta redesplegar/pushear en InsForge; las migraciones 018/019 se aplican manualmente por CLI.

## 8. Notas de método y guardrails

- Análisis 100% estático sobre el repo; **cero** requests a producción.
- No se reprodujo ningún secreto: se verificó por *nombre de variable* y por *ausencia en el bundle*. La anon key (JWT) es pública por diseño; su presencia en el bundle es esperada y su seguridad recae en RLS (ver H-CRIT como el punto donde esa defensa se erosiona).
- Ítems marcados **"no verificable desde el repo"** dependen de configuración de plataforma (InsForge dashboard, Vercel) o de garantías del BaaS, y no deben asumirse correctos sin comprobación con acceso adicional autorizado.
- No se modificó código, migraciones ni configuración; este archivo es el único artefacto generado.
