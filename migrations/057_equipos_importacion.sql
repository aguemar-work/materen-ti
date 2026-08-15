-- ============================================================
-- MIGRACIÓN 057 — Bandeja de importación de equipos desde Excel
-- Depende de: 013 (equipos, tipos_equipo, asignaciones_equipo),
--             014 (ubicaciones), 003 (staff/es_staff/es_jefe)
-- Tabla: equipos_importacion
--
-- Bandeja de trabajo temporal para migrar el Excel de activos fijos del
-- cliente al módulo Equipos. Vive en su propia tabla (no en `equipos`)
-- para que un equipo NUNCA aparezca en el inventario real mientras
-- todavía se está corrigiendo (tipo, estado físico, a quién está
-- asignado) — el Excel de origen mezcla equipo informático de personas
-- con cámaras/alarmas/redes, y esconde señales de baja/robo en columnas
-- que no son "Estado" (Usuario/Ubicación/Observaciones), así que cada
-- fila se revisa a mano antes de "migrar".
--
-- Persistida en BD (no en localStorage del navegador) a propósito: son
-- ~400 filas, se trabaja en varias sesiones/días, y cualquier staff con
-- acceso al módulo debe poder retomar donde quedó otro.
--
-- Al migrar una fila (frontend: createEquipo + asignarEquipo/moverEquipo,
-- las mismas funciones del alta manual) la fila de esta tabla se borra:
-- una vez migrada, vive en `equipos`/`asignaciones_equipo`, no aquí. Por
-- eso el borrado físico es de cualquier staff, no solo JEFE — mismo caso
-- ya existente en equipo_accesorios (migración 022): es limpieza de una
-- bandeja de trabajo, no un borrado con impacto de negocio.
-- ============================================================


-- ------------------------------------------------------------
-- TABLA: equipos_importacion
-- ------------------------------------------------------------

create table if not exists public.equipos_importacion (
  id              uuid        primary key default gen_random_uuid(),

  -- Texto crudo de las columnas del Excel que no tienen campo propio en
  -- `equipos` (o que alimentaron una sugerencia automática): se conserva
  -- como referencia mientras la fila sigue en la bandeja.
  -- {categoria, tipo, marca, modelo, serie, costo, fecha_compra,
  --  estado_texto, usuario, ubicacion_texto, observaciones,
  --  subido_kapo, nota_adicional}
  raw             jsonb       not null default '{}',

  -- El Excel marca algunas filas como repetidas (columna SUBIDO A KAPO);
  -- se muestran igual, solo con un aviso — nunca se ocultan solas.
  duplicado_kapo  boolean     not null default false,

  -- Campos editables: reflejan 1 a 1 lo que terminará en `equipos` al migrar
  codigo          text,
  tipo_id         text        references public.tipos_equipo(id) on delete set null,
  marca           text,
  modelo          text,
  serie           text,
  costo           numeric(12,2),
  fecha_compra    date,
  estado          text        not null default 'operativo'
    check (estado in ('operativo', 'en_reparacion', 'de_baja', 'perdido')),
  notas           text,

  -- Asignación sugerida/corregida: se resuelve al migrar (asignarEquipo /
  -- moverEquipo), nunca se guarda como asignacion_equipo real desde acá.
  modo            text        not null default 'disponible'
    check (modo in ('disponible', 'empleado', 'ubicacion')),
  empleado_id     uuid        references public.empleados(id) on delete set null,
  ubicacion_id    uuid        references public.ubicaciones(id) on delete set null,

  check (
    (modo = 'empleado'   and empleado_id is not null and ubicacion_id is null) or
    (modo = 'ubicacion'  and ubicacion_id is not null and empleado_id is null) or
    (modo = 'disponible' and empleado_id is null and ubicacion_id is null)
  ),

  created_by      uuid        references auth.users(id) on delete set null,
  updated_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.equipos_importacion is
  'Bandeja de trabajo temporal: filas del Excel de activos fijos pendientes de revisar y migrar a equipos. Una fila desaparece de acá al migrarse (createEquipo + asignarEquipo/moverEquipo) — no es historial de negocio, es una cola de trabajo.';

comment on column public.equipos_importacion.raw is
  'Texto crudo de las columnas del Excel sin campo propio en equipos, para referencia mientras se corrige la fila.';

create or replace trigger trg_equipos_importacion_updated_at
  before update on public.equipos_importacion
  for each row execute function set_updated_at();

create or replace trigger trg_equipos_importacion_by
  before insert or update on public.equipos_importacion
  for each row execute function public.set_created_updated_by();


-- ------------------------------------------------------------
-- RLS — staff opera todo, incluido el borrado (bandeja de trabajo, no
-- historial de negocio: mismo caso ya existente en equipo_accesorios)
-- ------------------------------------------------------------

alter table public.equipos_importacion enable row level security;

create policy "staff puede ver equipos_importacion"
  on public.equipos_importacion for select using (public.es_staff());
create policy "staff puede crear equipos_importacion"
  on public.equipos_importacion for insert with check (public.es_staff());
create policy "staff puede editar equipos_importacion"
  on public.equipos_importacion for update using (public.es_staff());
create policy "staff puede eliminar equipos_importacion"
  on public.equipos_importacion for delete using (public.es_staff());

-- ============================================================
-- FIN DE MIGRACIÓN 057
-- ============================================================
