-- ============================================================
-- MIGRACIÓN 025 — Reordenar catálogo de tickets (categorías/subcategorías)
-- Depende de: 016_tickets.sql
--
-- Solo renombra (UPDATE por id / por categoria_id+nombre) y agrega
-- específicas nuevas en "Otro". No borra ni cambia ids, así que los
-- tickets ya creados que referencian categoria_id/subcategoria_id
-- existentes no se ven afectados.
-- ============================================================

-- ------------------------------------------------------------
-- Categorías: renombrar (los ids/slugs no cambian)
-- ------------------------------------------------------------

update public.categorias_ticket set nombre = 'Hardware' where id = 'equipos';
update public.categorias_ticket set nombre = 'Software' where id = 'software';
update public.categorias_ticket set nombre = 'Redes' where id = 'red';
update public.categorias_ticket set nombre = 'Otros' where id = 'otro';


-- ------------------------------------------------------------
-- Subcategorías: renombrar por categoria_id + nombre actual
-- ------------------------------------------------------------

update public.subcategorias_ticket
  set nombre = 'Desbloquear cuenta'
  where categoria_id = 'accesos_cuentas' and nombre = 'Cuenta bloqueada';

update public.subcategorias_ticket
  set nombre = 'Solicitar equipo o accesorio nuevo'
  where categoria_id = 'equipos' and nombre = 'Solicitar equipo nuevo';

update public.subcategorias_ticket
  set nombre = 'Accesorio dañado o faltante'
  where categoria_id = 'equipos' and nombre = 'Accesorio faltante o dañado';

update public.subcategorias_ticket
  set nombre = 'Problema con software o licencia'
  where categoria_id = 'software' and nombre = 'Problema con una licencia';

update public.subcategorias_ticket
  set nombre = 'Sin internet o WiFi'
  where categoria_id = 'red' and nombre = 'Sin internet o wifi';


-- ------------------------------------------------------------
-- Subcategorías nuevas en "Otros"
-- ------------------------------------------------------------

insert into public.subcategorias_ticket (categoria_id, nombre) values
  ('otro', 'Capacitación o consulta'),
  ('otro', 'Seguridad (virus/malware) o backup')
on conflict do nothing;

-- ============================================================
-- FIN DE MIGRACIÓN 025
-- ============================================================
