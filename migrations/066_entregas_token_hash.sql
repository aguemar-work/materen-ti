-- ============================================================
-- MIGRACIÓN 066 — entregas: agregar token_hash (paso 1/2, aditivo)
-- Depende de: 001 (pgcrypto), 010 (entregas)
--
-- Verificación de auditoría externa (2026-08-17): la columna `token` de
-- `entregas` se guardaba en texto plano — quien tuviera lectura directa de
-- la tabla (o un backup/dump) veía el token vigente sin necesitar romper
-- nada. Se agrega `token_hash` (sha256 en hex) como columna nueva, sin
-- tocar `token` todavía: hay enlaces ya enviados a empleados que pueden
-- seguir vigentes hasta 168h (ver entregaCrear), y este paso no debe
-- invalidarlos. El código de la edge function pasa a INSERTAR ambas
-- columnas y a BUSCAR por token_hash; `token` en claro sigue viviendo
-- solo en la URL pública devuelta al staff, nunca más se lee de vuelta
-- desde la BD una vez aplicado el paso 2 (migración 067).
-- ============================================================

alter table public.entregas add column if not exists token_hash text;

update public.entregas
  set token_hash = encode(digest(token, 'sha256'), 'hex')
  where token_hash is null;

create unique index if not exists idx_entregas_token_hash
  on public.entregas (token_hash)
  where viewed_at is null;

comment on column public.entregas.token_hash is
  'sha256(token) en hex. El token en claro solo vive en la URL pública y en
   la respuesta al crear la entrega — desde esta migración deja de ser la
   única fuente de verdad en BD. La columna "token" se retira en la
   migración 067, una vez confirmado que no quedan entregas vigentes
   creadas con el código anterior (máx. 168h de vigencia).';

-- ============================================================
-- FIN DE MIGRACIÓN 066
-- ============================================================
