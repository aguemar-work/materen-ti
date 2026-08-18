-- ============================================================
-- MIGRACIÓN 070 — function_deploys: qué versión de cada edge function
-- está realmente desplegada
-- Depende de: 069 (mismo criterio de "sin RLS, solo cliente admin")
--
-- Verificación de auditoría externa (2026-08-17): no había forma de saber
-- si el código de una edge function en el repo coincidía con lo
-- desplegado en producción — el CLI de InsForge no expone un checksum o
-- hash de la function desplegada (revisado: `functions list` solo da
-- slug/status/nombre/descripción). Ejemplo real del problema: el pin a
-- @insforge/sdk@1.5.2 (hallazgo H-12, docs/HISTORIAL-AUDITORIAS.md) quedó
-- resuelto en código desde 2026-08-16 pero el redeploy real de las 4 edge
-- functions seguía pendiente — sin esta tabla, no había manera de
-- confirmarlo desde adentro del sistema. Se llena solo desde el job
-- deploy-manual de .github/workflows/ci.yml (la única vía real de deploy
-- hoy), tras cada `functions deploy` exitoso.
-- ============================================================

create table if not exists public.function_deploys (
  id              bigserial   primary key,
  funcion         text        not null,
  sha256          text        not null,
  commit_sha      text,
  desplegado_por  text,
  desplegado_en   timestamptz not null default now()
);

create index if not exists idx_function_deploys_funcion_fecha
  on public.function_deploys (funcion, desplegado_en desc);

revoke all on public.function_deploys from public, anon, authenticated;

comment on table public.function_deploys is
  'Historial de despliegues reales de cada edge function (funcion = credenciales|tickets|encuestas|personal-registro|equipos-fotos), con el sha256 del archivo .ts desplegado y el commit de origen. Lo llena solo el job deploy-manual de CI tras un `functions deploy` exitoso. Sin RLS: sin políticas, solo el cliente admin (CI) o una edge function con createAdminClient() la tocan — ver acción "version" en functions/credenciales.ts.';

-- ============================================================
-- FIN DE MIGRACIÓN 070
-- ============================================================
