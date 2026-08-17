-- ============================================================
-- MIGRACIÓN 059 — Separar áreas/obras (función) de ubicaciones (lugar)
-- Depende de: 014 (ubicaciones), 020 (areas_obras), 058 (areas_obras.ubicacion_id)
-- Tablas: ubicaciones (+tipo), empleados (+ubicacion_id)
--
-- La migración 058 vinculó areas_obras a ubicaciones para derivar la
-- ubicación de un empleado a partir de su área — pero eso mezclaba dos ejes
-- distintos en una sola relación. "Almacén" (área funcional de logística,
-- 5 empleados) no es un lugar físico, aunque comparta nombre con los
-- almacenes del catálogo de ubicaciones. Confirmado con el usuario: las 11
-- filas de areas_obras son TODAS áreas funcionales — ninguna pasa a
-- ubicaciones.
--
-- Esta migración separa los dos ejes en vez de fusionarlos en un catálogo
-- único (que era la idea original en docs/PANORAMA_SISTEMA.md §7, cerrada
-- por equivocada — ver ahí el porqué):
--   - areas_obras vuelve a ser puramente funcional (se le quita
--     ubicacion_id).
--   - empleados gana su propio ubicacion_id, independiente del área,
--     asignable directamente.
--
-- Backfill: se lee areas_obras.ubicacion_id ANTES de que el paso 4 la
-- borre, para poblar empleados.ubicacion_id con la ubicación que tenía su
-- área al momento de esta migración — una sola vez. De ahí en adelante,
-- área y ubicación se editan cada una por su cuenta, SIN sincronización
-- automática ni trigger: la independencia total es la intención, no un
-- valor derivado que haya que mantener al día.
-- ============================================================


-- ============================================================
-- 1. ubicaciones.tipo — clasifica el catálogo físico
-- ============================================================
-- 'sede' en vez de 'oficina': más general (una sede nueva en Huancayo
-- mañana no sería "Oficina Principal" pero sí seguiría siendo una sede).
-- 'otro' cubre casos futuros que no encajen sin exigir un ALTER en
-- producción por cada uno.

alter table public.ubicaciones
  add column if not exists tipo text check (tipo in ('sede', 'almacen', 'obra', 'otro'));

update public.ubicaciones set tipo = 'sede'    where nombre = 'Oficina Principal';
update public.ubicaciones set tipo = 'almacen' where nombre in ('Almacén de TI', 'Almacén Huancayo', 'Almacén Pucusana');
update public.ubicaciones set tipo = 'obra'    where nombre = 'Obra';

alter table public.ubicaciones alter column tipo set not null;

comment on column public.ubicaciones.tipo is
  'sede | almacen | obra | otro. Clasifica el catálogo de ubicaciones físicas — no confundir con areas_obras (función/asignación laboral, ver migración 059).';

-- Nota: "Obra" (id fijo, sin seed nuevo acá) no tiene ninguna referencia hoy
-- (0 equipos, 0 asignaciones históricas, 0 filas en equipos_importacion, 0
-- areas_obras) — no hay señal real para desambiguarla en varias obras
-- concretas. Queda como está, tipo='obra' genérico; pendiente sin urgencia,
-- ver docs/PANORAMA_SISTEMA.md §7.


-- ============================================================
-- 2. empleados.ubicacion_id — independiente de areas_obras
-- ============================================================

alter table public.empleados
  add column if not exists ubicacion_id uuid references public.ubicaciones(id) on delete restrict;

create index if not exists idx_empleados_ubicacion
  on public.empleados (ubicacion_id);

comment on column public.empleados.ubicacion_id is
  'Ubicación física del empleado, independiente de su área/obra (función). Editable directamente — no se deriva ni se sincroniza con areas_obras (columna ubicacion_id retirada de esa tabla en esta misma migración). Backfill inicial: la ubicación que tenía su área al momento de la 059.';


-- ============================================================
-- 3. Backfill de empleados.ubicacion_id — LEE areas_obras.ubicacion_id
--    ANTES de que el paso 4 la borre. Sin filtro de deleted_at a propósito
--    (mismo criterio que el resto del historial del sistema: no se le
--    borra el dato a un empleado inactivo); la validación post-backfill sí
--    filtra activos, ver más abajo.
-- ============================================================

update public.empleados e
set ubicacion_id = ao.ubicacion_id
from public.areas_obras ao
where e.area_obra_id = ao.id
  and ao.ubicacion_id is not null;


-- ============================================================
-- 4. areas_obras vuelve a ser puramente funcional
-- ============================================================

drop index if exists public.idx_areas_obras_ubicacion;
alter table public.areas_obras drop column if exists ubicacion_id;

-- ============================================================
-- FIN DE MIGRACIÓN 059
-- ============================================================
