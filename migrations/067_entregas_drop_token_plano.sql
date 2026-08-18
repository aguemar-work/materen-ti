-- ============================================================
-- MIGRACIÓN 067 — entregas: retirar el token en texto plano (paso 2/2)
-- Depende de: 066 (entregas.token_hash ya poblado)
--
-- ⚠️ NO aplicar en el mismo deploy que la 066. Aplicar solo después de:
--   1) Confirmar que el código de functions/credenciales.ts que busca por
--      token_hash (en vez de por token) ya está desplegado en producción.
--   2) Verificar con `db query` que no queden filas con expires_at futuro
--      y token_hash nulo (entrega creada por código viejo a medio migrar):
--        select count(*) from public.entregas
--          where token_hash is null and expires_at > now();
--   3) Esperar el máximo de vigencia de una entrega (168h = 7 días) desde
--      que el código nuevo quedó desplegado, para que ninguna entrega viva
--      dependa todavía de la columna `token`.
-- En el mismo deploy de esta migración, quitar de entregaCrear el insert
-- de `token` en claro (dejar solo token_hash).
-- ============================================================

drop index if exists public.idx_entregas_token;
alter table public.entregas drop column if exists token;
alter table public.entregas alter column token_hash set not null;
alter table public.entregas add constraint entregas_token_hash_unique unique (token_hash);

-- ============================================================
-- FIN DE MIGRACIÓN 067
-- ============================================================
