-- ============================================================
-- ROLLBACK de la MIGRACIÓN 114: quita el aviso de categorías y subcategorías
-- de ticket (columnas, CHECK, triggers y la función del trigger).
-- ⚠️ Se pierden los avisos ya escritos (son texto de catálogo, no historial).
-- Revertir antes el frontend y la edge function `tickets`: el select de
-- `aviso` fallaría con 42703 sobre una columna que ya no existe. Idempotente.
-- ============================================================

drop trigger if exists trg_categorias_ticket_aviso on public.categorias_ticket;
drop trigger if exists trg_subcategorias_ticket_aviso on public.subcategorias_ticket;
drop function if exists public.normalizar_aviso_categoria_ticket();

alter table public.categorias_ticket    drop constraint if exists categorias_ticket_aviso_check;
alter table public.subcategorias_ticket drop constraint if exists subcategorias_ticket_aviso_check;

alter table public.categorias_ticket    drop column if exists aviso;
alter table public.subcategorias_ticket drop column if exists aviso;
