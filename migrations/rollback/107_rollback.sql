-- ============================================================
-- ROLLBACK de la MIGRACIÓN 107 (catálogo de servicios y registro de cambios).
-- Usar solo si la 107 causa un problema nuevo e inesperado; NO es parte del
-- flujo normal.
--
-- ⚠️ Orden: revertir ANTES las migraciones posteriores que dependan de esta
-- (hoy ninguna). No depende de la 106 ni de la 108, así que puede revertirse
-- en cualquier posición respecto de ellas; sí debe ir ANTES que la 101 y la 099
-- (sin CASCADE a propósito: una dependencia olvidada falla con «depends on» en
-- vez de borrar de más).
--
-- ⚠️ Efectos:
--   · SE PIERDEN todos los cambios, su libro de movimientos y los enlaces con
--     tickets (cambios, cambio_eventos, cambio_tickets), el catálogo de
--     servicios y las columnas servicio_id de categorias_ticket, plataformas,
--     licencias y tipos_equipo, y cambio_id de schema_migrations y
--     function_deploys. El código CHG-#### ya emitido NO se reutiliza si se
--     reaplica la 107 (la secuencia se recrea desde 1: exportar antes si
--     importa). Si hace falta conservar los datos, exportarlos antes:
--       select * from public.servicios;
--       select * from public.cambios; select * from public.cambio_eventos; select * from public.cambio_tickets;
--       select categoria, servicio_id from (select id as categoria, servicio_id from public.categorias_ticket) c where servicio_id is not null;
--       select version, cambio_id from public.schema_migrations where cambio_id is not null;
--       select funcion, desplegado_en, cambio_id from public.function_deploys where cambio_id is not null;
--   · Con el frontend de Cambios y Servicios ya publicado, volver ANTES a la
--     versión anterior (el formulario de categorías lee servicio_id).
--   · scripts/deploy.mjs --cambio deja de registrar cambio_id: detecta que la
--     columna no existe y la omite (avisa), no falla.
-- Idempotente.
-- ============================================================

-- Vistas y funciones primero (devuelven el tipo de fila de cambios o de
-- cambio_tickets; las vistas dependen de las tablas).
drop view if exists public.v_kpi_cambios;
drop view if exists public.v_cambios_aprobacion_vencida;

drop function if exists public.crear_cambio(text, text, text, text, text, text, timestamptz, timestamptz, boolean);
drop function if exists public.actualizar_cambio(uuid, text, text, text, text, text, text, timestamptz, timestamptz);
drop function if exists public.transicionar_cambio(uuid, text, text);
drop function if exists public.aprobar_cambio(uuid, text);
drop function if exists public.rechazar_cambio(uuid, text);
drop function if exists public.vincular_cambio_ticket(uuid, uuid);
drop function if exists public.desvincular_cambio_ticket(uuid, uuid);
drop function if exists public.crear_cambio_nucleo(text, text, text, text, text, text, timestamptz, timestamptz, boolean, uuid, boolean);
drop function if exists public.actualizar_cambio_nucleo(uuid, text, text, text, text, text, text, timestamptz, timestamptz, uuid, boolean);
drop function if exists public.transicionar_cambio_nucleo(uuid, text, text, uuid, boolean);
drop function if exists public.aprobar_cambio_nucleo(uuid, text, uuid, boolean);
drop function if exists public.rechazar_cambio_nucleo(uuid, text, uuid, boolean);
drop function if exists public.vincular_cambio_ticket_nucleo(uuid, uuid, uuid, boolean);
drop function if exists public.desvincular_cambio_ticket_nucleo(uuid, uuid, uuid, boolean);
drop function if exists public.cambio_validar_campos(text, text, text, text, text, text, timestamptz, timestamptz);
drop function if exists public.registrar_evento_cambio(uuid, text, text, text, text, uuid, text);

-- Tablas (sus triggers, policies, índices y CHECK caen con ellas).
drop table if exists public.cambio_tickets;
drop table if exists public.cambio_eventos;
drop table if exists public.cambios;
drop table if exists public.transiciones_cambio_permitidas;

drop function if exists public.check_transicion_cambio();
drop function if exists public.cambio_eventos_inmutable();
drop function if exists public.siguiente_codigo_cambio();
drop function if exists public.texto_multilinea(text);
drop sequence if exists public.cambio_codigo_seq;

-- Tracking de despliegues.
alter table public.schema_migrations drop constraint if exists schema_migrations_cambio_id_formato;
alter table public.function_deploys drop constraint if exists function_deploys_cambio_id_formato;
alter table public.schema_migrations drop column if exists cambio_id;
alter table public.function_deploys drop column if exists cambio_id;

-- Columnas servicio_id (su FK e índice caen con la columna).
drop index if exists public.idx_categorias_ticket_servicio;
drop index if exists public.idx_plataformas_servicio;
drop index if exists public.idx_licencias_servicio;
drop index if exists public.idx_tipos_equipo_servicio;
alter table public.categorias_ticket drop column if exists servicio_id;
alter table public.plataformas drop column if exists servicio_id;
alter table public.licencias drop column if exists servicio_id;
alter table public.tipos_equipo drop column if exists servicio_id;

-- Catálogo de servicios.
drop table if exists public.servicios;
drop function if exists public.check_tope_servicios();

-- FIN DEL ROLLBACK 107
