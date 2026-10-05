-- Registro de la migración 115 (reportes), aplicada en producción sin su fila en
-- schema_migrations (detectado el 2026-10-05: sus objetos existen y la última
-- versión registrada era la 114). Solo registra; no modifica el esquema.
-- Checksum: sha256 del archivo commiteado (mismo cálculo que scripts/deploy.mjs).
-- Idempotente.
--
-- Correr desde E:\AlejandroGuevara\Alejandro\projects\sistema-ti:
--   npx @insforge/cli db import ..\sistema-ti-mejora\scripts\sql\registrar-115.sql
-- Verificar:
--   select version, aplicada_por from public.schema_migrations where version = '115';

insert into public.schema_migrations
  (version, nombre_archivo, checksum, aplicada_en, aplicada_por, commit_sha, entorno)
select '115', '115_reportes.sql', '3d139fd995bf0b11357142993f530743c1edb59c9ca174aa0f78f988756307e4', now(), 'INACONS', '4bc28cc', 'produccion'
where not exists (select 1 from public.schema_migrations s where s.version = '115');
