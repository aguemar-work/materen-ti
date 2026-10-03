-- Registro de la migración 089 (tickets.resuelto_at), aplicada por el dueño el
-- 2026-10-03 con `db import` desde el checkout principal. Solo registra; no
-- modifica el esquema. Checksum: sha256 del archivo commiteado (mismo cálculo
-- que scripts/deploy.mjs). Idempotente.
--
-- Correr desde E:\AlejandroGuevara\Alejandro\projects\sistema-ti:
--   npx @insforge/cli db import ..\sistema-ti-mejora\scripts\sql\registrar-089.sql
-- Verificar:
--   select version, aplicada_por from public.schema_migrations where version = '089';

insert into public.schema_migrations
  (version, nombre_archivo, checksum, aplicada_en, aplicada_por, commit_sha, entorno)
select '089', '089_tickets_resuelto_at.sql',
       'c9f6d9e73333068418d1baef25f9a56fda8bf058d252f3bd919e4eaf11b51b22',
       now(), 'INACONS', 'bb7de7d', 'produccion'
where not exists (select 1 from public.schema_migrations s where s.version = '089');
