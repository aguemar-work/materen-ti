# Continuidad operativa y recuperación

> Plan de mejora Ciclo 21, §7.4, §7.6 y §7.7 (H1-2, H1-3, H1-9). Este documento
> dice qué se respalda, quién guarda las claves, cómo se prueba una restauración
> y cómo opera TI mientras el sistema está caído. Lo que depende del dueño está
> marcado **(pendiente de confirmar)**: no se da por hecho.
>
> No contiene URLs, claves ni valores de secrets. Los nombres de secrets y
> tablas no son secretos.

## 1. Objetivos propuestos

| Objetivo | Valor propuesto | Qué significa |
| --- | --- | --- |
| **RPO** (cuántos datos se pueden perder) | 24 h | Respaldo de plataforma diario; se pierde como máximo lo registrado desde el último respaldo |
| **RTO** (cuánto tarda volver) | 4 h | Desde que se declara la caída hasta que el sistema responde otra vez |

**(pendiente de confirmar por el dueño)**: con 8 usuarios internos son valores
razonables, pero no están aceptados. Si el negocio exige menos pérdida, hay que
subir la frecuencia de respaldo (hoy no es configurable desde este repositorio).

Estado verificado el 2026-10-01: `system.database_backups` tiene **0 filas**, es
decir, hoy **no hay ningún respaldo de plataforma**. El RPO real actual es
"todo". Cerrar esto es el primer paso del H1-2.

## 2. Qué se respalda y dónde

| Qué | Dónde vive | Respaldo | Estado |
| --- | --- | --- | --- |
| Base de datos (Postgres) | InsForge | Respaldos de plataforma diarios, retención >= 30 días (`npx @insforge/cli backups list`) | **Pendiente de confirmar**: activarlos en el panel de InsForge y comprobar que `system.database_backups` deje de estar vacía |
| Esquema | `migrations/` + `docs/esquema/snapshot.json` | Git (GitHub) | Activo; el snapshot detecta drift (`npm run verify:db`) |
| Código de las edge functions | `functions/*.ts` | Git; el desplegado se compara con `functions code` en cada `deploy.mjs function` | Activo |
| Frontend | Vercel + Git | Git | Activo |
| Secrets de las edge functions | InsForge (`secrets`) | **Ninguno automático**: ver sección 3 | Custodia del dueño |
| Fotos de equipos y adjuntos | Storage de InsForge | Dentro del respaldo de plataforma **(pendiente de confirmar si lo incluye)** | Sin verificar |
| Copia externa de la BD | `scripts/exportar-respaldo.mjs` (semanal, cifrada con `age`, plan §7.4) | Artifact de GitHub 90 días + copia mensual fuera de GitHub | **No existe todavía** |

## 3. Claves de cifrado (`CRED_KEY_*`)

Las contraseñas de cuentas, licencias y accesos sensibles se guardan **cifradas
por la edge function `credenciales`**. La base solo contiene el texto cifrado
(`enc2:` / `sens1:`); las claves viven fuera de la base:

| Secret | Para qué |
| --- | --- |
| `CRED_KEY_V2` | Clave vigente de cuentas y licencias |
| `CRED_KEY_LEGACY` | Clave anterior, solo para descifrar filas viejas |
| `CRED_KEY_SENSIBLE` | Clave aislada de los accesos sensibles |
| `API_KEY`, `INSFORGE_BASE_URL` | Cliente admin de la function (no cifran datos) |

Dónde están: como secrets del proyecto InsForge (`npx @insforge/cli secrets list`
muestra solo los nombres; `secrets get <clave>` revela el valor y solo lo hace
el dueño). **Los valores no están en este repositorio, ni en el CI, ni en ningún
respaldo.**

Reglas:

1. **Un respaldo de la base sin estas claves es inútil para las contraseñas.**
   Restaurar la base sin ellas devuelve filas que nadie puede descifrar.
2. Las claves las custodia **el dueño en su gestor de contraseñas**, con una
   copia en un segundo lugar físico distinto. **(pendiente de confirmar que
   existen ambas copias.)**
3. Rotar una clave exige conservar la anterior hasta re-cifrar todas las filas;
   nunca se borra `CRED_KEY_LEGACY` sin comprobar que ninguna fila la usa.
4. Si se pierde una clave y no hay copia, las contraseñas cifradas con ella se
   pierden: hay que re-registrarlas desde la fuente (cada plataforma).

## 4. Restauración probada, trimestral, en una branch

Una restauración que nunca se probó no existe. Cada trimestre (y después de cualquier
cambio grande de infraestructura), una persona con acceso al proyecto la ensaya
**en una branch de InsForge, nunca en producción**. Duración estimada: 1-2 h.

1. **Crear la branch** desde el proyecto enlazado:
   `npx @insforge/cli branch create prueba-restauracion-AAAA-QN --mode full`
   (el CLI cambia el contexto a la branch; comprobar con `npx @insforge/cli current`
   que el proyecto es la branch y no producción).
2. **Obtener el respaldo a probar**. Ruta A (preferida, **no probada aún**):
   `npx @insforge/cli backups latest` y restaurarlo sobre la branch con
   `npx @insforge/cli backups restore <id> --project <id-de-la-branch>`; `backups restore`
   **sobrescribe** el destino, así que el `--project` debe ser la branch y se verifica antes.
   Ruta B (verificada en el CLI, pero exporta el estado actual y no un respaldo):
   `npx @insforge/cli db export --format sql --include-functions --include-sequences --include-views -o respaldo.sql`
   desde producción y `npx @insforge/cli db import respaldo.sql` en la branch.
3. **Conteos por tabla**: comparar producción y branch (misma consulta en ambas):
   `npx @insforge/cli db query --json -- "select (select count(*) from public.empleados) as empleados, (select count(*) from public.equipos) as equipos, (select count(*) from public.cuentas) as cuentas, (select count(*) from public.tickets) as tickets, (select count(*) from public.accesos_log) as accesos_log"`.
   (`scripts/verificar-restauracion.sql`, con todas las tablas de negocio, es parte del plan §7.4 y todavía no existe.)
4. **Esquema**: `INSFORGE_CLI_CWD` apuntando a la branch y `npm run verify:db` debe dar 0 diferencias
   contra `docs/esquema/snapshot.json`.
5. **Revelado de prueba con las claves reales**: cargar en la branch los secrets `CRED_KEY_*`
   (el dueño), desplegar `credenciales` a la branch con
   `node scripts/deploy.mjs function credenciales --entorno v2 --proyecto <nombre-de-la-branch>`
   (el `--proyecto` exige que el proyecto enlazado contenga ese texto) y revelar una
   contraseña conocida desde la aplicación. Si no se descifra, el respaldo no sirve y hay que tratarlo como incidente.
6. **Borrar la branch**: `npx @insforge/cli branch delete prueba-restauracion-AAAA-QN`.
7. **Registrar el resultado** (fecha, quién, respaldo usado, tiempo total, problemas) en
   `docs/HISTORIAL-AUDITORIAS.md` o en una línea de `docs/CHANGELOG.md`. El tiempo total
   medido es el dato real contra el RTO de 4 h.

## 5. Si el sistema cae

### 5.1 Averiguar qué cayó

| Síntoma | Probable causa | Primer chequeo |
| --- | --- | --- |
| Ni la página carga | Frontend (Vercel) | Panel de Vercel; último deploy |
| Carga pero no inicia sesión / todo falla | Backend InsForge o base | `healthcheck.yml` (issue `incidente`); panel de InsForge |
| Solo falla revelar contraseñas, entregas, adjuntos o fotos | Una edge function o un secret | Ping de las 4 functions en el issue de incidente; `node scripts/deploy.mjs function <nombre> --dry-run` muestra qué hay desplegado vs el archivo |
| Todo funciona pero los datos "no están" | Drift o restauración incompleta | `npm run verify:db`; `select max(version) from public.schema_migrations` |

El enlace a la página de estado de cada proveedor **(pendiente de confirmar y anotar aquí)**.

### 5.2 Cómo opera TI mientras tanto

Se propone declarar la caída cuando no se puede registrar nada durante más de 30 minutos (umbral por confirmar).
Quien decide es el dueño o, en su ausencia, el JEFE de TI.

1. **Entregas de equipos y accesos: acta física.** Imprimir el acta en papel (la
   plantilla vigente sale de `modules/equipos/acta-base.js`; mantener una copia impresa en
   blanco **(pendiente de confirmar que existe)**), firmarla en físico y guardarla. La
   entrega queda **pendiente de registrar** en el sistema.
2. **Tickets y solicitudes: hoja de cálculo.** Una hoja compartida con las columnas:
   fecha y hora, quién reporta, equipo/cuenta afectado, descripción, quién atiende,
   estado, hora de cierre. Una fila por evento (alta, cambio de estado, cierre).
3. **Nunca contraseñas en la hoja.** Si hace falta una contraseña mientras `credenciales`
   está caída, la entrega la hace el dueño desde su gestor, y se anota solo "se entregó
   acceso a X a Y" (sin el valor).
4. **Devoluciones, movimientos y bajas de equipos**: también a la hoja, con el
   número de serie o código de inventario, de dónde a dónde y quién firmó el acta.
5. **Comunicar**: avisar a los usuarios por el canal habitual que los pedidos se
   atienden y quedan registrados a mano.

### 5.3 Al volver el sistema (reconciliación)

1. Confirmar que el sistema está sano: `npm run verify:db` en 0 diferencias y los pings en verde.
2. Cargar la hoja en orden cronológico: primero altas y entregas (no se puede cerrar lo que no existe), luego
   movimientos y devoluciones, al final cierres de tickets. Respetar las reglas de dominio
   (historial append-only: las asignaciones se cierran, no se borran).
3. Adjuntar el escaneo del acta física a cada entrega cargada.
4. Anotar en `docs/CHANGELOG.md` o `docs/HISTORIAL-AUDITORIAS.md`: inicio, fin, causa, datos cargados a mano.
5. Cerrar el issue `incidente`.
6. Si hubo restauración desde respaldo: lo registrado después del respaldo (RPO) se recupera desde la hoja y las actas.

## 6. Transporte SQL en CI sin el bug del CLI (C13-e)

El CLI de InsForge no sirve en CI: `requireAuth()` solo mira `~/.insforge/credentials.json` e ignora
`INSFORGE_ACCESS_TOKEN` (cae a OAuth interactivo y espera ~25 minutos), y además necesita la carpeta
enlazada (`.insforge/`). Tres rutas candidatas (plan §7.6):

| Ruta | Cómo | Estado |
| --- | --- | --- |
| **(a) Endpoint HTTP de SQL** | `POST <INSFORGE_PROJECT_URL>/api/database/advance/rawsql` con `Authorization: Bearer <INSFORGE_API_KEY>` y cuerpo `{"query": "..."}`; es lo que hace `db query` por dentro (leído en el código de `@insforge/cli` 0.2.8). Implementado en `scripts/lib/insforge-sql.mjs` (`INSFORGE_SQL_TRANSPORT=http`) | **Sin verificar contra el servicio real**: requiere la clave admin del proyecto como secret, y esa clave **no es de solo lectura** |
| **(b) `DATABASE_URL` con `pg`** | Conexión directa a Postgres desde Node (`npx @insforge/cli db connection-string` imprime la URL en proyectos cloud; la contraseña puede venir enmascarada). Permitiría además ejercitar RLS (`set local role authenticated` + claims) en `tests-db` | **Sin verificar**: no se sabe si la plataforma expone conexión directa a runners de GitHub, ni si hay lista de IP permitidas. No está implementado |
| **(c) Runner self-hosted con el CLI logueado** | Una máquina del dueño con `insforge login` hecho, registrada como runner de GitHub; el job usa `runs-on: self-hosted` | **Sin verificar**; solo útil para `tests-db` y exige mantener la máquina encendida y segura |
| CLI desde la máquina del desarrollador | `INSFORGE_CLI_CWD=<carpeta enlazada> npm run verify:db` | **La única ruta verificada hoy** |

Mientras la ruta (a), (b) o (c) no esté verificada, el gate real es local: `npm run verify:db` antes de cada
push (casilla del PR template) y el job `drift-esquema` queda como aviso, no como required.

Todas las rutas comparten una sola función, `consultarSql(sql)`, por lo que cambiar de transporte no
toca la lógica de `snapshot-esquema.mjs` ni de `deploy.mjs`. Restricciones del CLI que aplican a todas las
consultas de una línea: sin saltos de línea, sin `$$`, sin comillas dobles y sin `%` (cmd.exe de Windows);
`docs/GOTCHAS-CLI.md` tiene el detalle.

## 7. Pendiente de confirmar por el dueño

- [ ] Activar los respaldos de plataforma en el panel de InsForge y verificar que `system.database_backups` ya no esté vacía.
- [ ] Confirmar RPO 24 h / RTO 4 h, o fijar otros.
- [ ] Confirmar que `CRED_KEY_V2`, `CRED_KEY_LEGACY` y `CRED_KEY_SENSIBLE` están en su gestor de contraseñas y en una segunda copia.
- [ ] Cargar los secrets de GitHub Actions: `INSFORGE_ACCESS_TOKEN`, `INSFORGE_PROJECT_ID`, `INSFORGE_PROJECT_URL`, `INSFORGE_API_KEY` (para el transporte HTTP; valorar el riesgo de una clave admin en CI), `INSFORGE_FUNCTIONS_URL` (opcional) y los `VITE_INSFORGE_*` que ya pide `test-integration`.
- [ ] Una vez que `drift-esquema` corra en verde con transporte real: marcarlo como check requerido en la protección de `main`.
- [ ] Anotar el enlace a la página de estado de InsForge y de Vercel.
- [ ] Preparar e imprimir el acta física en blanco y la hoja de cálculo de contingencia.
- [ ] Hacer la primera restauración probada (sección 4) y registrar el tiempo.
