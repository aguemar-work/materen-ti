-- ============================================================
-- Reconciliación de public.schema_migrations (Ciclo 21, 2026-10-03)
--
-- Producción tenía registradas solo 001…085, pero estas migraciones YA están
-- aplicadas (verificado objeto por objeto el 2026-10-03: funciones, tablas,
-- índices, policies y CHECKs característicos de cada una). Este archivo solo
-- registra lo aplicado: no crea ni modifica ningún objeto del esquema.
--
-- La 089 (tickets.resuelto_at) NO está aplicada y NO se registra aquí.
-- La 105 no existe (depende de V2).
--
-- Checksums: sha256 de cada archivo tal como está commiteado en la rama
-- mejora/h1-estabilizar (commit bb7de7d), el mismo cálculo que hace
-- scripts/deploy.mjs. Las filas van en el orden en que se aplicaron.
--
-- Cómo correrlo (desde el checkout que tiene .insforge):
--   cd E:\AlejandroGuevara\Alejandro\projects\sistema-ti
--   npx @insforge/cli db import ..\sistema-ti-mejora\scripts\sql\reconciliar-schema-migrations-086-114.sql
-- Verificar después:
--   select version, aplicada_por from public.schema_migrations where version >= '086' order by version;
-- Esperado: 18 filas, todas con aplicada_por = 'reconciliacion-ciclo-21'.
-- Idempotente: no duplica una versión ya registrada.
-- ============================================================

insert into public.schema_migrations
  (version, nombre_archivo, checksum, aplicada_en, aplicada_por, commit_sha, entorno)
select v, n, c, now(), 'reconciliacion-ciclo-21', 'bb7de7d', 'produccion'
from (values
  ('086', '086_v2_endurecimiento_rpc_y_realtime.sql',          '8a45364000c7aae79a7cf3725066c3b256238c87bc7c22d23bd9cd5acff61d7a'),
  ('087', '087_rls_empleados_tabla_satelite.sql',              '8a397cea1eb581e9fcad04bc86d15e0dd44df4d230894f88b782e43238d445a3'),
  ('088', '088_eliminar_permiso_credenciales_ver_huerfano.sql','5a8af1dd26ff275738cb670ba0ff76833e00306f4f54d5fb9e30ab140d2e9211'),
  ('099', '099_permisos_unificados.sql',                       '213cc40a0f01e8381675e002a1bb7f5b8dcda21f32d038ec24f6a12cd5404a13'),
  ('100', '100_integridad_y_trazabilidad.sql',                 '69fac6deb65b4e8b7a2e12040402cc0ce2c884b9aadcf2cf3dc02c4fe886ad4f'),
  ('101', '101_rpc_transaccionales.sql',                       '9ed219e53190891e0ade0e3ffcf5c8445e1dc7475cd80c52e57ef63d4b317fa8'),
  ('102', '102_empleado_ciclo_de_vida.sql',                    'ac82c86f924ad6f24721a9fff33609d28a224632a208b5e5e3ebdd1c9299c100'),
  ('103', '103_parametros_y_dashboard.sql',                    '0656bd3f3d1458f2724369552042cc1f1b5a9a2e345ed41e4038201f9062509a'),
  ('104', '104_intentos_publicos.sql',                         'cbca2a0a0a2490677417c399579b483c517882ffcaaed9d60e489a2b5c21de3e'),
  ('110', '110_actas_firmadas.sql',                            'cee4078e791fa6f0d6e81e2c096fcbae2e03092f01b19a20d1c4ac3b4e2a284d'),
  ('111', '111_adjuntos_privados_tickets.sql',                 'c3ca58408833d130165da88eace8b3faae563d74df2ce2ae566d57ecf838804f'),
  ('112', '112_retencion_y_anonimizacion.sql',                 'dfa25cf0c87b83358a77f2d916f9703f1ad17880f6081d31ff67c02ff2e965c6'),
  ('108', '108_solicitudes_de_servicio.sql',                   'b41689dce497669352ab6673366da6deab8378a11d0b2d64bcfabe8dc40f3eb2'),
  ('106', '106_kedb.sql',                                      '81b5d9fc2ad5a3991ea5d23f7c41084248dae2400e71418435e235efd9311c45'),
  ('107', '107_servicios_y_cambios.sql',                       '17634fdd37de219a3420763ba78287d295f4465859325a23dfcb4076006c37ff'),
  ('109', '109_portal_empleado.sql',                           'f9ba098a52a085a38ed6d498a7f94b4976593dea5bb4698966f427e98c3f6235'),
  ('113', '113_aprobador_borrable.sql',                        '2cd2595ffca69859a962f37f70aa412fdca56821ddcda03eb4d8da29b155567e'),
  ('114', '114_avisos_categorias_ticket.sql',                  '1d619cd3a779d930d9c8268bc150b8791a64e87a63fd2d6788fc3538299a49e1')
) as t(v, n, c)
where not exists (select 1 from public.schema_migrations s where s.version = t.v);
