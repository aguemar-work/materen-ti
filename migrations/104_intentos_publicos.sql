-- ============================================================
-- MIGRACIÓN 104 — intentos_publicos: rate-limit unificado de endpoints
-- públicos (SOLO esta parte del plan 104; la retención, la purga, la
-- anonimización y la tabla `entorno` van en otra entrega)
-- Depende de: 017/037/043 (las tres tablas de intentos que reemplazará)
--
-- Plan de mejora Ciclo 21, §4 "104 — Retención, purga y entorno", fila
-- `intentos_publicos`. Hoy cada endpoint público tiene su tabla de intentos
-- (ticket_busqueda_intentos, ticket_creacion_intentos,
-- encuesta_respuesta_intentos), cada una con su forma, sin purga y con
-- privilegios por defecto para anon/authenticated (protegidas solo por RLS).
-- Esta tabla única las sustituye:
--
--   ambito      qué se limita, con el formato function.acción que ya usa el
--               código: 'credenciales.entregaAbrir', 'tickets.seguimiento',
--               'tickets.catalogo', 'tickets.encuesta', 'equipos-fotos.subirFoto'
--   clave       a quién se limita (IP o id de usuario), siempre como texto
--   created_at  cuándo ocurrió el intento
--
-- Solo la usa el cliente ADMIN de las edge functions (project_admin, que
-- bypasea RLS): cuenta los intentos recientes de (ámbito, clave) y registra
-- el nuevo (ver excedeLimite() en functions/credenciales.ts). Por eso:
--   - RLS habilitada y SIN ninguna policy: ni staff ni nadie con sesión la
--     lee o escribe (a diferencia de las tablas viejas, que dejaban SELECT al
--     JEFE: la clave puede ser un DNI o una IP, dato personal).
--   - REVOKE ALL a public/anon/authenticated sobre la tabla y su secuencia
--     (defensa en profundidad: aunque alguien agregue una policy por error,
--     los GRANT de tabla no existen).
--   - Índice (ambito, clave, created_at desc) para el conteo por ventana.
--
-- ⚠️ SECUENCIA DE DESPLIEGUE (las functions ya apuntan a esta tabla):
--   1. Aplicar ESTA migración (crea la tabla vacía; no toca nada existente).
--   2. Verificar (bloque al final).
--   3. Recién entonces desplegar las edge functions que usan
--      `intentos_publicos` (hoy en el código: credenciales, tickets y
--      equipos-fotos; `encuestas` todavía usa encuesta_respuesta_intentos y
--      migrará después). Una function
--      desplegada ANTES de la tabla falla cerrada (error_interno 500) en cada
--      endpoint público con rate-limit: el código no asume "0 intentos".
--   4. NO se borran ni se vacían ticket_busqueda_intentos,
--      ticket_creacion_intentos ni encuesta_respuesta_intentos aquí: mientras
--      una function vieja siga desplegada las usa. Su retiro (INSERT ... SELECT
--      de los intentos de la última ventana y DROP) es una migración POSTERIOR,
--      cuando las functions estén en producción sobre intentos_publicos.
--   Durante el cambio de contadores los límites arrancan de cero (la tabla
--   nueva está vacía): ventana de tolerancia de unos minutos, aceptable.
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): sin dollar-quoting, pero igual
-- `scripts/apply-migration.mjs` o `db import`; verificar al final.
-- Idempotente: reaplicar es seguro.
-- Rollback: migrations/rollback/104_rollback.sql.
-- ============================================================

create table if not exists public.intentos_publicos (
  id         bigserial   primary key,
  ambito     text        not null,
  clave      text        not null,
  created_at timestamptz not null default now()
);

comment on table public.intentos_publicos is
  'Intentos de endpoints públicos para rate-limit (ámbito + clave + instante). Solo el cliente admin de las edge functions la usa: RLS activa sin policies y sin GRANT para anon/authenticated. Sustituirá a ticket_busqueda_intentos, ticket_creacion_intentos y encuesta_respuesta_intentos. Migración 104.';
comment on column public.intentos_publicos.ambito is
  'Qué se limita, formato function.acción: credenciales.entregaAbrir, tickets.seguimiento, equipos-fotos.subirFoto, etc.';
comment on column public.intentos_publicos.clave is
  'A quién se limita (IP o id de usuario). Dato personal potencial: nunca se expone a un cliente con sesión.';

create index if not exists idx_intentos_publicos_ambito_clave_fecha
  on public.intentos_publicos (ambito, clave, created_at desc);

alter table public.intentos_publicos enable row level security;

revoke all on table public.intentos_publicos from public, anon, authenticated;
revoke all on sequence public.intentos_publicos_id_seq from public, anon, authenticated;


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Tabla, RLS activa y sin policies (esperado: relrowsecurity=true,
--    policies=0):
--    select c.relname, c.relrowsecurity, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'intentos_publicos') as policies from pg_class c where c.oid = 'public.intentos_publicos'::regclass;
--
-- 2) Sin privilegios para los roles de cliente (esperado: las 6 en false):
--    select r, has_table_privilege(r, 'public.intentos_publicos', 'select') as sel, has_table_privilege(r, 'public.intentos_publicos', 'insert') as ins from unnest(array['anon','authenticated']) as r;
--    select has_sequence_privilege('anon', 'public.intentos_publicos_id_seq', 'usage') as anon_seq, has_sequence_privilege('authenticated', 'public.intentos_publicos_id_seq', 'usage') as auth_seq;
--
-- 3) Índice (esperado: 1 fila):
--    select indexname, indexdef from pg_indexes where tablename = 'intentos_publicos' order by 1;
--
-- 4) Las tablas viejas siguen intactas (esperado: 3 filas):
--    select relname from pg_class where relname in ('ticket_busqueda_intentos','ticket_creacion_intentos','encuesta_respuesta_intentos');
--
-- 5) Tracking: scripts/apply-migration.mjs registra la fila solo; si se
--    aplicó a mano con `db import`, registrarla y verificar:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '104';
-- ============================================================
-- FIN DE MIGRACIÓN 104
-- ============================================================
