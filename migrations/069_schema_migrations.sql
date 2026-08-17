-- ============================================================
-- MIGRACIÓN 069 — schema_migrations: tracking real de qué se aplicó
-- Depende de: ninguna (tabla nueva, independiente)
--
-- Verificación de auditoría externa (2026-08-17): el proyecto no rastreaba
-- qué migraciones ya se aplicaron a producción (decisión ya tomada en la
-- migración 035: no usar `db migrations up`, porque los 63 archivos de
-- migrations/ usan la convención `0XX_snake_case.sql`, incompatible con el
-- formato timestamp que exige ese subsistema nativo del CLI — y su
-- historial remoto, al no haberse usado nunca, probablemente está vacío).
-- Migrar retroactivamente a ese formato no daba ningún beneficio real: se
-- seguiría necesitando control manual igual. En su lugar, esta tabla
-- propia, poblada por scripts/apply-migration.mjs (y por el paso
-- equivalente del job deploy-manual en .github/workflows/ci.yml), dice con
-- certeza qué versión está aplicada, cuándo y por quién — sin adoptar el
-- subsistema nativo.
--
-- Sin políticas de RLS: nadie del cliente (ni JEFE) necesita leer esto
-- desde el navegador. Solo el cliente admin del CLI/CI, o una edge
-- function con createAdminClient() (ver acción "version" en
-- functions/credenciales.ts), la consultan.
-- ============================================================

create table if not exists public.schema_migrations (
  version         text        primary key,   -- '001'..'070'..., el prefijo del archivo
  nombre_archivo  text        not null,
  checksum        text        not null,      -- sha256 del contenido del .sql
  aplicada_en     timestamptz not null default now(),
  aplicada_por    text                       -- usuario CLI, GITHUB_ACTOR en CI, o 'backfill-069'
);

revoke all on public.schema_migrations from public, anon, authenticated;

comment on table public.schema_migrations is
  'Tracking manual de qué migración de migrations/*.sql ya se aplicó a este proyecto. No es el subsistema nativo `db migrations up` del CLI (incompatible con la convención de nombres 0XX_snake_case.sql ya usada) — lo gestionan scripts/apply-migration.mjs y el job deploy-manual de CI. Sin RLS: sin políticas, solo el cliente admin puede tocarla.';

comment on column public.schema_migrations.checksum is
  'sha256 hex del contenido del archivo. Las filas de este backfill (aplicada_por = backfill-069) usan el placeholder "backfill-sin-checksum": no vale la pena calcular y pegar a mano ~68 hashes en un INSERT SQL; scripts/apply-migration.mjs sí calcula el hash real para toda migración aplicada desde ahora en adelante (071+, la primera que corre ya con el script actualizado).';

comment on column public.schema_migrations.aplicada_en is
  'Para las filas de este backfill, es la fecha del backfill (now()), NO la fecha real en que cada migración se aplicó originalmente a producción — esa fecha exacta no se registró en su momento para 001-068. 063 es la única con fecha real conocida (documentada en docs/HISTORIAL-AUDITORIAS.md, Ciclo 7). Desde 071 en adelante, aplicada_en sí es la fecha real de aplicación.';

-- ------------------------------------------------------------
-- Backfill de las migraciones ya aplicadas antes de que existiera este
-- tracking (001-068, más esta misma 069 y la 070 que la acompaña en el
-- mismo lote de cambios). 063 lleva su fecha real documentada; el resto
-- usa el default now() (fecha del backfill, no la de aplicación
-- original — ver comentario de la columna).
-- ------------------------------------------------------------

insert into public.schema_migrations (version, nombre_archivo, aplicada_por, checksum, aplicada_en)
values
  ('001', '001_modulo_credenciales.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('002', '002_empleados_cuentas.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('003', '003_staff_rls.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('004', '004_cuentas_asignaciones.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('005', '005_created_by.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('006', '006_tipo_cuenta.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('007', '007_fix_trigger_asignaciones.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('008', '008_mejoras.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('009', '009_rotacion_baja.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('010', '010_seguridad.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('011', '011_licencias.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('012', '012_renovacion_licencias.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('013', '013_equipos.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('014', '014_ubicaciones.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('015', '015_fotos_equipos.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('016', '016_tickets.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('017', '017_tickets_flujo_estados.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('018', '018_seguridad_signup.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('019', '019_tickets_transiciones.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('020', '020_areas_obras.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('021', '021_areas_obras_trazabilidad.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('022', '022_equipo_accesorios.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('023', '023_equipos_codigo_almacen.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('024', '024_accesos_sensibles.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('025', '025_reordenar_categorias_ticket.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('026', '026_realtime_listas.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('027', '027_realtime_seguimiento_ticket.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('028', '028_fix_realtime_ticket_rls.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('029', '029_fix_realtime_ticket_evento.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('030', '030_auditoria_acceso_denegado.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('031', '031_kb_articulos.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('032', '032_kb_feedback_rpc.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('033', '033_problemas.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('034', '034_drop_tablas_prueba_huerfanas.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('035', '035_tickets_tipo.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('036', '036_reporte_tickets_indices.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('037', '037_ticket_creacion_rate_limit.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('038', '038_baja_empleado_atomica.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('039', '039_cuentas_usuario_unico.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('040', '040_licencias_tiene_clave.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('041', '041_cuenta_personal_exclusividad.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('042', '042_personal_registros.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('043', '043_encuestas.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('044', '044_ticket_nuevo_realtime.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('045', '045_notificaciones.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('046', '046_personal_registros_delete_hard.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('047', '047_personal_registros_rls_jefe.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('048', '048_notificaciones_destinatario.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('049', '049_notificaciones_ticket_triggers.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('050', '050_tickets_transiciones_whitelist.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('051', '051_cerrar_ticket_rpc.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('052', '052_retiro_tickets_nuevos.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('053', '053_reporte_tickets_rpc.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('054', '054_fix_crear_notificacion_ambigua.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('055', '055_retiro_correo_tickets.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('056', '056_permisos_modulos.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('057', '057_equipos_importacion.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('058', '058_areas_obras_ubicacion.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('059', '059_areas_ubicaciones.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('060', '060_permisos_credenciales.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('061', '061_staff_nombres_autoedicion.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('062', '062_advisor_grants_indices_autovacuum.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('063', '063_advisor_followup_rls_perf.sql', 'backfill-069', 'backfill-sin-checksum', '2026-08-17T00:00:00Z'),
  ('064', '064_accesos_log_ip_ua_entrega_fallida.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('065', '065_personal_registro_intentos_dni.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('066', '066_entregas_token_hash.sql', 'backfill-069', 'backfill-sin-checksum', now()),
  ('068', '068_rls_modulos_reales.sql', 'backfill-069', 'backfill-sin-checksum', now())
on conflict (version) do nothing;

-- Nota: 067 (entregas_drop_token_plano) NO se backfillea acá a propósito
-- — es la migración de efecto retardado que espera ≥7 días tras la 066
-- (ver su propio archivo). No estará "aplicada" hasta que de verdad se
-- corra. 070 (function_deploys) tampoco se backfillea acá: se aplica
-- justo después de esta y se registra sola una vez que
-- scripts/apply-migration.mjs quede actualizado (o se agrega a mano si se
-- aplica antes de actualizar el script).

-- ============================================================
-- FIN DE MIGRACIÓN 069
-- ============================================================
