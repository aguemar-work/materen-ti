-- ============================================================
-- MIGRACIÓN 037 — Rate-limit de creación pública de tickets
-- Depende de: 016 (tickets), 017 (ticket_busqueda_intentos, mismo patrón)
--
-- Contexto (auditoría integral, 2026-08-05, hallazgo S-01): la acción
-- "crear" de la edge function `tickets` es pública y sin sesión — a
-- diferencia de "buscarPorDni" (limitada por IP y por DNI desde la
-- migración 017), no tenía ningún tope de frecuencia. Sin límite, un
-- script podía insertar tickets sin fin, cada uno con su propia subida
-- de adjunto y su propio intento de envío de correo. Tabla propia (no se
-- reutiliza ticket_busqueda_intentos: esa es específicamente para la
-- búsqueda por DNI, mezclar los conteos confundiría el propósito de cada
-- una). Mismo patrón: solo la escribe/lee la edge function (cliente
-- admin), RLS de solo lectura para JEFE.
-- ============================================================

create table if not exists public.ticket_creacion_intentos (
  id          uuid        primary key default gen_random_uuid(),
  ip          text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ticket_creacion_ip_fecha
  on public.ticket_creacion_intentos (ip, created_at);

comment on table public.ticket_creacion_intentos is
  'Registro de creaciones públicas de ticket por IP, para frenar el abuso del endpoint "crear" sin sesión. Solo la escribe/lee la edge function tickets (cliente admin); no aplica a tickets creados por staff autenticado.';

alter table public.ticket_creacion_intentos enable row level security;
create policy "jefe puede ver intentos de creacion de ticket"
  on public.ticket_creacion_intentos for select using (public.es_jefe());

-- ============================================================
-- FIN DE MIGRACIÓN 037
-- ============================================================
