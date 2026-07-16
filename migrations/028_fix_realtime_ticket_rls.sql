-- ============================================================
-- MIGRACIÓN 028 — FIX: suscripción realtime a ticket:<token> rechazada
-- La policy de 027 verificaba el token con un EXISTS directo sobre
-- public.tickets, pero esa tabla solo tiene policy de SELECT para
-- staff (es_staff()) — el rol anon no puede leerla, así que el EXISTS
-- daba siempre falso y el visitante público (sin sesión) nunca podía
-- suscribirse, aunque el token fuera válido (REALTIME_UNAUTHORIZED).
-- Fix: mover la verificación a una función SECURITY DEFINER (mismo
-- patrón que es_staff()/tiene_permiso_acceso_sensible), que sí puede
-- leer tickets sin pasar por su RLS.
--
-- Segundo hallazgo (mismo día): el error seguía apareciendo para
-- visitantes que abrían el link de seguimiento en el MISMO navegador
-- donde ya tenían sesión de staff — el SDK de InsForge reutiliza la
-- sesión guardada en localStorage para el socket, así que el rol de
-- conexión terminaba siendo "authenticated", no "anon". La policy
-- original solo cubría "to anon", así que un staff logueado no
-- calzaba en ninguna policy del canal ticket:%. Fix: la policy cubre
-- también "authenticated" (un staff viendo el link público de un
-- ticket real es un caso legítimo, no una fuga de datos).
-- ============================================================

create or replace function public.ticket_token_existe(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.tickets where token = p_token);
$$;

-- Dueño explícito: el resto de funciones del proyecto (es_staff(),
-- notify_ticket_estado(), etc.) son de project_admin. Si esta función
-- se crea con un rol distinto (ej. postgres vía consola/CLI en modo
-- unrestricted), un CREATE OR REPLACE posterior con el rol normal del
-- proyecto falla con "must be owner of function ticket_token_existe".
alter function public.ticket_token_existe(text) owner to project_admin;

drop policy if exists public_subscribe_ticket_channel on realtime.channels;
create policy public_subscribe_ticket_channel
on realtime.channels for select
to anon, authenticated
using (
  pattern = 'ticket:%'
  and public.ticket_token_existe(split_part(realtime.channel_name(), ':', 2))
);

-- ============================================================
-- FIN DE MIGRACIÓN 028
-- ============================================================
