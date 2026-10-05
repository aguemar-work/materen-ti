# Anexo A — Inventario técnico de las edge functions (Fase 0, Ciclo 21)

Fuente: lectura directa de `functions/*.ts` e `insforge.toml` (subagente, 2026-10-01, solo lectura). Abreviaturas: `C` = `functions/credenciales.ts`, `T` = `functions/tickets.ts`, `E` = `functions/encuestas.ts`, `F` = `functions/equipos-fotos.ts`. Líneas = archivo en la rama `rediseno/sistema-visual` (7e413c3).

## 0. Rasgos comunes [Verificado]
- Un archivo por function, sin imports entre sí; helpers repetidos a propósito (`corsPara`, `respuesta`, `uno`, `ipDesdeHeaders`, `sniffImagen`, `tienePermisoModulo`).
- CORS con allowlist fija (prod + 3 puertos localhost): `C:53-74`, `T:32-52`, `E:20-39`, `F:29-48`.
- Solo `POST` (+ `OPTIONS` 204); body JSON o `body_invalido` 400.
- Cliente **admin** (`createAdminClient`, `INSFORGE_BASE_URL` + `API_KEY`) para TODA lectura/escritura (`C:289-290`, `T:176-177`, `E:144-145`, `F:124-125`): bypasea RLS, por eso las reglas de permiso se repiten a mano.
- `userClient` solo para `auth.getCurrentUser()` (`C:493-496`, `T:190-193`, `E:153-155`, `F:151-154`).
- try/catch de primer nivel → `error_interno` 500 con CORS (`C:267-275`, `T:154-162`, `E:122-130`, `F:102-110`). `Cache-Control: no-store` en todo. `respuesta()` espeja `code` en `error` si status ≥ 400. Muchos rechazos de negocio van con **status 200 + ok:false**.
- SDK pinneado `npm:@insforge/sdk@1.5.2`.

## 1. Acciones

### 1.1 `credenciales.ts` (`entregaAbrir` se atiende ANTES del gate de sesión, `C:396-486`; el resto exige Bearer → staff `activo=true`, `C:489-503`)
| action | sesión | permiso | tablas | audita | códigos | rate-limit |
|---|---|---|---|---|---|---|
| `entregaAbrir` | No (pública) | ninguno | lee `entregas` por `token_hash` `C:404-408`; escribe `viewed_at` `C:441-446`; reversión best-effort `C:469` | `entrega_fallida` (no_existe/ya_abierta/expirada/payload_invalido); `entrega_abierta` una fila por credencial `C:460-466` | token_requerido, no_existe, ya_abierta, expirada (200), error_interno 500 | **Ninguno** |
| `version` | Sí | staff activo | `schema_migrations`, `function_deploys` | No | no_autenticado 401, no_es_staff 403 | No |
| `accesoDenegado` | Sí | staff activo | escribe `accesos_log` `C:537-545` | sí | ruta_invalida | No |
| `encrypt` | Sí | staff activo (sin módulo ni credenciales.ver) `C:550-555` | — | No | valor_muy_largo | No |
| `encryptSensible` | Sí | JEFE `C:567` (+ fila en `accesos_sensibles_permisos` si `accesoId`) | — | No | no_autorizado 403 | No |
| `revelarAccesoSensible` | Sí | JEFE + fila en `accesos_sensibles_permisos` `C:596-604` | `accesos_sensibles`, `accesos_log` | ver/copiar `C:623-631` | acceso_requerido, no_autorizado 403, demasiados_revelados 429, no_existe | `accesos_log` por user, 5 min, tope 40 (`C:240-249,606`) |
| `revelar` | Sí | credenciales.ver `C:647` + módulo `correos` `C:650`; `personal` → solo JEFE `C:665-667` | `cuentas`+`plataformas` (deleted_at null) | ver/copiar `C:675-682` | cuenta_requerida, no_autorizado 403, no_existe, demasiados_revelados 429 | ídem `C:669` |
| `revelarClaveLicencia` | Sí | credenciales.ver + módulo `licencias` `C:695-698` | `licencias` | ver/copiar `C:716-723` | ídem | ídem |
| `entregaCrear` | Sí | credenciales.ver + módulo `correos` `C:740-743`; **no exige JEFE** aunque haya cuentas personales (`C:14-16`) | `empleados`, `asignaciones_cuenta` activas, `cuentas`; escribe `entregas`, `accesos_log`; vence la entrega si falla auditoría `C:836` | `enviar` por cuenta `C:825-833` | datos_requeridos, demasiadas_cuentas, no_autorizado, demasiados_revelados 429, empleado_no_existe, empleado_inactivo, cuentas_no_asignadas, cuentas_no_existen, error_guardando 500 | revelados previos + cuentas > 40 → 429 `C:747`; lote ≤ 20 `C:738` |

Nota: el conteo de rate-limit va ANTES del insert de auditoría (`C:669` vs `C:675`) → TOCTOU leve [Inferido].

### 1.2 `tickets.ts` (sesión opcional: `staffDeSesion()` `T:186-201` devuelve `null` ante cualquier fallo; solo `version` exige sesión)
| action | sesión | tablas | audita | códigos | rate-limit |
|---|---|---|---|---|---|
| `catalogo` | No | `categorias_ticket`, `subcategorias_ticket` | No | — | **Ninguno** |
| `crear` | Opcional (staff → `origen=staff_interno`, `empleadoIdManual`, `tipo`; no mira módulo ni rol) | `empleados` por DNI `T:280-282`, `subcategorias_ticket`, RPC `siguiente_codigo_ticket` `T:295`, storage `tickets-adjuntos` `T:318`, `ticket_creacion_intentos`, `tickets` | `ticket_eventos` creado — **fail-open** (`T:179-183`) | datos_requeridos, texto_muy_largo, demasiados_intentos 429, error_codigo 500, error_creando 500 | solo sin staff: IP 8/10 min (`T:97-98,254-268`) |
| `seguimiento` | No | `tickets` por token, `ticket_comentarios` interno=false `T:388-400` | No | token_requerido, no_existe | **Ninguno** |
| `buscarPorDni` | No | `ticket_busqueda_intentos`, `empleados`, `tickets`, `ticket_satisfaccion` | No | dni_invalido, demasiados_intentos 429 | IP 15/10 min `T:442`; DNI 10/10 min `T:454` |
| `encuestaEstado` | No | `tickets`, `ticket_satisfaccion` | No | token_requerido, no_existe, no_disponible | **Ninguno** |
| `encuesta` | No | escribe `ticket_satisfaccion` `T:538-541` | `ticket_eventos` encuesta_respondida | datos_invalidos, no_existe, no_disponible, ya_respondida, error_guardando | **Ninguno** |

### 1.3 `encuestas.ts`
| action | sesión | tablas | códigos | rate-limit |
|---|---|---|---|---|
| `abrir` | No | `encuesta_rondas`+`encuestas` por slug, cerrada=false `E:195-204` | slug_requerido, demasiados_intentos 429, no_disponible | `encuesta_respuesta_intentos` IP 20/10 min, compartido con `responder` `E:62-63,178-191` |
| `responder` | No | + escribe `encuesta_respuestas` `E:249-251` | datos_requeridos, demasiados_intentos, no_disponible, respuesta_invalida, error_guardando | ídem |

### 1.4 `equipos-fotos.ts` (todas exigen sesión + staff activo `F:147-161`; `subirFoto`/`eliminarFoto` + módulo `equipos` `F:189,265`)
| action | tablas/storage | audita | códigos | rate-limit |
|---|---|---|---|---|
| `subirFoto` | lee `equipos.fotos` si `equipoId` `F:217-222`; escribe bucket `equipos-fotos` `F:253` | **No** | archivo_requerido, no_autorizado 403, limite_fotos, archivo_invalido, error_subiendo | **Ninguno** |
| `eliminarFoto` | `storage.remove(key)` `F:269`, solo `key.startsWith('equipos/')` `F:263` | **No** | key_invalida, no_autorizado, error_eliminando | **Ninguno** |

## 2. IP del cliente [Verificado]
Helper idéntico en `C:118-127`, `T:138-147`, `E:75-84`: `cf-connecting-ip` → `x-real-ip` → **último** valor de `x-forwarded-for` → `'desconocida'`. No verificado contra el proxy real.

## 3. Cifrado (`credenciales.ts`) [Verificado]
- WebCrypto `AES-GCM`; clave importada `raw` desde el secret base64 sin derivación (`C:133-141`); la longitud 256 depende del secret (no se fija en código) [Inferido].
- IV 12 bytes aleatorio por operación (`C:166,202`); sin AAD.
- Formatos: `enc2:` (`CRED_KEY_V2`), `enc:` legacy (`CRED_KEY_LEGACY`), `sens1:` (`CRED_KEY_SENSIBLE`).
- `decryptAny` (`C:172-193`): cualquier string sin prefijo conocido **se devuelve tal cual como texto plano** (`C:183`).
- Sin re-cifrado del legacy al revelar.
- Secret faltante: en cifrado → `error_interno` 500; en descifrado el try/catch devuelve el literal `(error al descifrar)` con `ok:true` y se audita como `ver` (`C:190-191,215-216`).

## 4. Tokens [Verificado]
- Entrega (`C:220-223`): 18 bytes aleatorios → base64url, 24 chars (144 bits). Persistido solo `token_hash` sha256 (066/067). Expira `expires_at` (1..168 h, default 24, `C:736,801`). Un solo uso vía `UPDATE ... where viewed_at is null` atómico (`C:441-446`); reversión best-effort si falla la auditoría (`C:467-474`).
- Ticket (`T:72-77`): misma generación, pero guardado **en claro** en `tickets.token`, **sin expiración ni un solo uso**; aparece en la key del adjunto `${token}/captura.${ext}` (`T:317`) y en la respuesta de `buscarPorDni` (`T:493,497`).

## 5. Validación de entrada [Verificado]
- `C`: valores ≤ 500; `ruta` empieza por `/` y ≤ 200; `motivo` ∈ {copiar, ver}; `cuentaIds` ≤ 20; `horas` 1..168. IDs no validados como UUID.
- `T crear`: título ≤ 200, descripción ≤ 5000; `contacto` **sin tope** (`T:272`); `equipoId/cuentaId/licenciaId` **sin validar** desde el formulario público (`T:368-370`); adjunto 1..5 MB con magic bytes (`T:103-110`), sin limpieza EXIF en servidor. DNI: solo dígitos; longitud 8 solo en `buscarPorDni` (`T:424-425`); en BD `empleados.dni text unique` sin CHECK.
- `T encuesta`: nivel 1..5; comentario sin tope.
- `E`: slug sin formato ni longitud; respuestas validadas por tipo de pregunta (`E:99-116`).
- `F subirFoto`: 1..5 MB, magic bytes, key `equipos/<uuid>.<ext>`; sin limpieza EXIF; tope `MAX_FOTOS_POR_EQUIPO=4` solo si viene `equipoId` (`F:215-234`) y **fail-open**; `eliminarFoto` borra cualquier objeto bajo `equipos/` (`F:263`).

## 6. Duplicación de reglas
| regla | dónde | diferencias |
|---|---|---|
| `tienePermisoModulo` (TS) | `C:370-379`; `F:135-144` | idénticas (JEFE → true; luego fila en `staff_modulos_permisos`) |
| `tiene_permiso_modulo` (SQL) | 068:47-59; RLS 068/072/079/081-083; RPC 086 | sin atajo JEFE ni activo; lo aporta cada policy con `es_jefe() or (es_staff() and …)`. Equivalente en efecto neto |
| `tienePermisoCredenciales` (TS) | `C:348-357` (usan `revelar`, `revelarClaveLicencia`, `entregaCrear`) | JEFE → true; si no, fila `staff_permisos` |
| `tiene_permiso_credenciales_ver` (SQL) | creada 060:130-142; **eliminada por 088:57** | nunca la consumió ninguna policy; sin atajo JEFE. Tras 088 la regla queda solo en TS + toggle cosmético |
| Toggle frontend | `stores/auth.js:72`, `api/domains/staffPermisos.js`, `StaffView.vue:170-189`, `CuentasPanel.vue:37-42` | mismo criterio; cosmético por declaración |
| Test de sincronía | `tests/integration/permisos-credenciales-sincronizados.smoke.test.js:152,218,239` | llama la RPC eliminada por 088; se salta (P0-04) |
| `esStaffActivo` | `C:489-503`, `T:186-201` (null, no 401), `E:150-158`, `F:147-161` | `T` nunca rechaza |
| `ipDesdeHeaders` | C/T/E | idénticas |
| rate-limit tabla+ventana | `T:254-268`, `T:429-459`, `E:178-191`; `C` cuenta en `accesos_log` `C:323-333` | umbrales distintos |
| `sniffImagen`/5 MB | `T:84,103-114`; `F:69,85-96` | idénticas |
| `MAX_FOTOS_POR_EQUIPO=4` | `F:80`; `MAX_FOTOS` en `EquipoForm.vue` | sin CHECK en BD |

## 7. Fail-open vs fail-closed
| chequeo | línea | comportamiento |
|---|---|---|
| Auditoría `accesos_log` | `C:306-316` | fail-closed (500); reversión best-effort en entregaAbrir/entregaCrear |
| Conteo de revelados | `C:323-333` | fail-closed |
| `getCurrentUser()`/fila staff | `C:494-503`, `E:154-158`, `F:152-161` | error ignorado → deniega como 401/403 (diagnóstico engañoso) |
| `staffDeSesion()` tickets | `T:186-201` | error → **tratado como público** (staff degrada a origen `empleado`) |
| chequeos de permiso | `C:350-356,372-378,578-584,598-604`; `F:137-143` | error → `no_autorizado` 403 (fail-closed por accidente) |
| rate-limits T/E | `T:257-267,436-459`; `E:181-189` | fail-closed |
| `ticket_eventos` | `T:179-183` | **fail-open** |
| match por DNI | `T:280-289` | error → `vinculado=false` |
| adjunto | `T:304-328` | fallo silencioso, ticket sin adjunto |
| tope de fotos | `F:217-224` | **fail-open** |

## 8. Información expuesta en acciones públicas [Verificado]
- `entregaAbrir`: nombre del empleado + `{plataforma, usuario, password, url}`; distingue no_existe/ya_abierta/expirada; sin rate-limit.
- `seguimiento`: código, título, descripción, estado, categoría, fechas, comentarios no internos con autor fijo "Soporte TI". No expone DNI, contacto, adjunto ni nombres de staff.
- `buscarPorDni`: código, título, estado, fecha, **token**, encuestaPendiente de tickets activos/con encuesta pendiente. Único factor: DNI (8 dígitos) con 15/IP + 10/DNI por 10 min.
- `encuestaEstado`: no_existe vs no_disponible revela existencia del token.
- `crear`: `vinculado` revela si el DNI pertenece a un empleado activo (oráculo, solo frenado por 8/IP/10 min) (`T:283-289,380`).
- Adjunto: key `<token>/captura.<ext>` en bucket **público** (verificado en Fase 0: `storage.buckets.public=true`).

## 9. `version` y `function_deploys` [Verificado]
`function_deploys` sin RLS (070). Solo lo llena el job `deploy-manual` de CI (`ci.yml:290-313`); un deploy manual por CLI no registra nada. `version` devuelve `sdkVersion` literal `1.5.2`.

## 10. `insforge.toml` [Verificado]
`disable_signup=true`; verificación por código; password 12 + 4 clases; SMTP apagado; storage 50 MB; realtime retention 0; sin MFA/lockout/duración de sesión configurados en el archivo.
