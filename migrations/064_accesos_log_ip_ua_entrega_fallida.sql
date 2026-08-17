-- ============================================================
-- MIGRACIÓN 064 — accesos_log: IP/user-agent + auditoría de fallos de entrega
-- Depende de: 010 (accesos_log), 024/030 (check de accion ya ampliado)
--
-- Verificación de auditoría externa (2026-08-17): accesos_log no tenía
-- columnas de IP/user-agent pese a que el patrón de extracción segura de
-- IP ya existe en otras edge functions (tickets.ts, personal-registro.ts,
-- encuestas.ts) — no permitía correlacionar de dónde vino cada acción.
-- Además, los 3 retornos tempranos de entregaAbrir (no_existe, ya_abierta,
-- expirada) no dejaban ningún rastro: un intento de fuerza bruta contra el
-- token, o un reintento de un enlace ya usado, era invisible. Se agrega
-- 'entrega_fallida' al check de accion (mismo criterio que 024/030:
-- ampliar el check antes que duplicar la infraestructura de auditoría) y
-- las columnas ip/user_agent, que la edge function credenciales ya empieza
-- a llenar en todos los log() (éxito y fallo).
-- ============================================================

alter table public.accesos_log add column if not exists ip text;
alter table public.accesos_log add column if not exists user_agent text;

alter table public.accesos_log drop constraint if exists accesos_log_accion_check;
alter table public.accesos_log add constraint accesos_log_accion_check
  check (accion in (
    'ver', 'copiar', 'enviar', 'entrega_creada', 'entrega_abierta',
    'creado', 'editado', 'eliminado',
    'acceso_denegado',
    'entrega_fallida'
  ));

comment on constraint accesos_log_accion_check on public.accesos_log is
  'entrega_creada existe en esta lista pero el código real nunca la usa
   (entregaCrear registra "enviar" en su lugar, una fila por cada cuenta
   incluida) — resto histórico de una convención anterior. Se deja sin
   quitar: no vale la pena una migración extra solo para eso, y no rompe
   nada mantenerla.';

comment on column public.accesos_log.ip is
  'IP del cliente en el momento de la acción, vía ipDesdeHeaders() (mismo
   criterio anti-spoofing que ticket_busqueda_intentos: cf-connecting-ip/
   x-real-ip del edge, o el último valor de x-forwarded-for). NULL en filas
   anteriores a esta migración.';

comment on column public.accesos_log.user_agent is
  'User-Agent del cliente en el momento de la acción. NULL en filas
   anteriores a esta migración.';

-- ============================================================
-- FIN DE MIGRACIÓN 064
-- ============================================================
