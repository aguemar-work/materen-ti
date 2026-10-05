-- ============================================================
-- MIGRACIÓN 107 — Catálogo de servicios y registro mínimo de cambios
-- Depende de: 016 (tickets, categorias_ticket), 013 (tipos_equipo), 011
--   (licencias), 004 (plataformas), 069/070 (schema_migrations,
--   function_deploys), 099 (exigir_permiso / puede_actual), 101 (texto_limpio)
--
-- Plan de mejora Ciclo 21, §4 "107 — Catálogo de servicios y registro mínimo
-- de cambios" y §7.3 (deploy.mjs --cambio) — docs/auditorias/ciclo-21/
-- PLAN-DE-MEJORA.md. Hoja H3-4.
--
-- ⚠️ NO APLICADA. Escrita y revisada solo en local (npm run test:sql-local).
-- Aplicar es decisión del dueño, DESPUÉS de la 099 y la 101 (la sección 0 se
-- detiene si falta alguna) y leyendo docs/GOTCHAS-CLI.md. No depende de la
-- 106 ni de la 108: puede aplicarse antes o después de ellas.
--
-- Hallazgos que cierra:
--   · SIN-CATALOGO-DE-SERVICIOS: «qué se rompió» vivía repartido en cuatro
--     catálogos sin relación (categorías de ticket, plataformas, licencias y
--     tipos de equipo). Nada permitía contestar «¿cuánto falla el correo?» ni
--     «¿qué servicio toca este cambio?».
--   · CAMBIOS-SIN-REGISTRO: las migraciones y los despliegues de edge functions
--     (scripts/deploy.mjs) son cambios en producción y no dejaban constancia de
--     quién los autorizó ni de con qué plan de retroceso. Los cambios en la
--     infraestructura (VPN, ERP, red) tampoco tenían dónde registrarse.
--
-- ── Permiso: NO se inventa un módulo ───────────────────────────────────────
-- El CHECK de staff_modulos_permisos (056) admite 8 módulos y ninguno es
-- «cambios». Se reutiliza el que mejor encaja y se declara aquí:
--   · LEER, CREAR, EDITAR borradores, avanzar el estado, VINCULAR tickets:
--     módulo `tickets` (los cambios son un proceso de la mesa de ayuda; mismo
--     criterio que Solicitudes con `empleados`).
--   · APROBAR y RECHAZAR: rol JEFE (permiso `rol:jefe`).
--   · EDITAR EL CATÁLOGO DE SERVICIOS: rol JEFE. Leerlo: cualquier staff activo
--     (los cuatro módulos que lo referencian lo embeben; misma excepción
--     deliberada que `categorias_ticket` y `ubicaciones`).
--
-- ── Qué crea (una sección por concepto, todas idempotentes) ────────────────
--   1) servicios             ≤ 15 servicios (10 sembrados), dueño opcional (staff),
--                            criticidad baja|media|alta|critica, horario texto corto
--   2) servicio_id           FK OPCIONAL (nullable, ON DELETE SET NULL) en
--                            categorias_ticket, plataformas, licencias y
--                            tipos_equipo
--   3) cambios               CHG-#### (secuencia propia), tipo estandar|normal|
--                            emergencia, riesgo, servicio, plan de retroceso,
--                            ventana, estado con whitelist de transiciones
--      cambio_eventos        libro inmutable (actor, rol, estado anterior/nuevo)
--      cambio_tickets        tabla de ENLACE cambio ↔ ticket (no se toca tickets)
--      transiciones_cambio_permitidas  whitelist default-deny
--   4) Triggers de integridad  transición válida, contenido congelado fuera de
--                            borrador, aprobador = jefe activo, tope de servicios
--   5) RPC y núcleos         crear_cambio, actualizar_cambio, transicionar_cambio,
--                            aprobar_cambio, rechazar_cambio, vincular_cambio_ticket,
--                            desvincular_cambio_ticket
--   6) Vistas                v_cambios_aprobacion_vencida, v_kpi_cambios
--                            (ambas security_invoker)
--   7) schema_migrations.cambio_id y function_deploys.cambio_id (texto CHG-####)
--                            para `scripts/deploy.mjs --cambio CHG-xxxx`
--   8) Dueño y permisos
--
-- ------------------------------------------------------------
-- TABLA DE FIRMAS (la fuente para escribir el frontend)
-- Todas las RPC: SECURITY DEFINER, dueño project_admin, search_path = public,
-- EXECUTE solo `authenticated`. Se llaman con argumentos NOMBRADOS
-- (SDK: rpc('nombre', { p_x: ... })). Sin permiso: 42501 'No autorizado'.
-- Rechazos de negocio: P0001 con mensaje en español; «no existe»: P0002.
--
--  RPC                       argumentos (tipo, default)                  retorna                guard
--  crear_cambio              p_titulo text, p_tipo text, p_riesgo text,  public.cambios         modulo:tickets
--                            p_servicio_id text, p_descripcion text,
--                            p_plan_retroceso text default null,
--                            p_ventana_inicio timestamptz default null,
--                            p_ventana_fin timestamptz default null,
--                            p_enviar boolean default false
--  actualizar_cambio         p_cambio_id uuid, p_titulo, p_tipo, p_riesgo, public.cambios         modulo:tickets
--                            p_servicio_id, p_descripcion,
--                            p_plan_retroceso, p_ventana_inicio,
--                            p_ventana_fin (todos como en crear_cambio)
--  transicionar_cambio       p_cambio_id uuid, p_destino text,           public.cambios         modulo:tickets
--                            p_nota text default null                                           (aprobar/rechazar: jefe)
--  aprobar_cambio            p_cambio_id uuid, p_nota text default null  public.cambios         rol:jefe
--  rechazar_cambio           p_cambio_id uuid, p_motivo text             public.cambios         rol:jefe
--  vincular_cambio_ticket    p_cambio_id uuid, p_ticket_id uuid          public.cambio_tickets  modulo:tickets
--  desvincular_cambio_ticket p_cambio_id uuid, p_ticket_id uuid          boolean                modulo:tickets
--
--  Reglas por RPC:
--  - crear_cambio: nace 'borrador' salvo p_enviar = true, que lo envía en la
--    misma transacción: estándar → 'aprobado' (preautorizado), normal y
--    emergencia → 'solicitado'. Siempre exige título (3..120), descripción
--    (≤ 4000), tipo, riesgo y un servicio vivo del catálogo. Al SALIR de
--    borrador exige además plan de retroceso (todos los tipos menos estándar)
--    y ventana de ejecución inicio+fin (todos menos emergencia).
--  - actualizar_cambio: solo en 'borrador'. Pasado ese punto el contenido se
--    congela (lo aprobado es lo que se ejecuta): para cambiarlo se cancela y se
--    registra otro.
--  - transicionar_cambio: valida la whitelist (transiciones_cambio_permitidas)
--    según el TIPO. Aprobar y rechazar desde aquí también exigen jefe (P0001).
--    Motivo obligatorio (≤ 1000) para rechazado y revertido, y para cancelado
--    salvo desde borrador. `p_nota` queda en `resultado` y en el libro.
--  - aprobar_cambio: 'solicitado' → 'aprobado' y registra aprobador y fecha.
--    EMERGENCIA ya en 'en_ejecucion' o 'implementado' sin aprobación: registra
--    la aprobación a posteriori SIN cambiar de estado y limpia el plazo.
--  - rechazar_cambio: 'solicitado' → 'rechazado' con motivo.
--  - vincular_cambio_ticket: idempotente (vincular dos veces no repite el
--    evento). Un cambio puede enlazar varios tickets y un ticket varios cambios.
--
--  Emergencia (decisión del dueño): puede ejecutarse SIN aprobación previa
--  ('borrador' o 'solicitado' → 'en_ejecucion'); al iniciar la ejecución se
--  registra `aprobacion_pendiente_hasta = ahora + 48 h`. No puede cerrarse
--  mientras un jefe no la apruebe (trigger). `v_cambios_aprobacion_vencida`
--  lista las que pasaron el plazo.
--
--  Lectura (SDK directo, RLS): cambios, cambio_eventos, cambio_tickets →
--  SELECT con el módulo 'tickets'; servicios y transiciones_cambio_permitidas →
--  SELECT con cualquier staff activo. Escritura de cliente: servicios la
--  escribe solo un JEFE (INSERT/UPDATE/DELETE por RLS); cambios, eventos y
--  enlaces, ninguna (solo RPC). Los cambios no se borran: el libro es
--  inmutable y toda baja es 'cancelado'.
--
--  Funciones internas (EXECUTE solo project_admin; existen para poder probar
--  la lógica sin sesión en tests/db/triggers.test.sql): cada *_nucleo recibe
--  el actor (`p_actor`, auth.uid() de la RPC pública) y si es jefe
--  (`p_es_jefe`, puede_actual('rol:jefe')) ya resueltos, igual que la 106.
--
-- ------------------------------------------------------------
-- DECISIONES DE DISEÑO
-- A) Tabla de ENLACE (cambio_tickets) en vez de tickets.cambio_id: el plan V2
--    modifica `tickets` en paralelo, la relación real es muchos a muchos (un
--    cambio corrige varios incidentes; un incidente puede originar dos cambios)
--    y el libro registra quién enlazó. Cero riesgo sobre la tabla caliente.
-- B) `servicios.id` es un slug (texto), como plataformas y tipos_equipo, y el
--    tope de 15 servicios vivos lo impone un trigger: con 8 de staff y ≈100
--    empleados un catálogo más largo es ruido. Sin columna `activo`: dar de
--    baja un servicio es deleted_at, como en todo el sistema.
-- C) La vinculación `servicio_id` de las cuatro tablas es OPCIONAL y nace NULL;
--    solo al CREAR la columna se enlazan las filas sembradas de fábrica
--    (categorías red/accesos_cuentas/equipos/software y los tipos de equipo
--    de la 013). Reaplicar la migración nunca pisa lo que el JEFE editó.
-- D) Estándar = preautorizado: pasa de 'borrador' a 'aprobado' sin jefe y
--    aprobado_por queda NULL (nadie aprobó, la política lo autoriza); el libro
--    lo dice. Normal y emergencia solo se aprueban por un jefe activo
--    (trigger sobre aprobado_por).
-- E) El libro (cambio_eventos) usa clock_timestamp() como created_at y una columna
--    identity `orden` que desempata: varios eventos de una misma transacción
--    (crear y enviar) conservan su orden aunque el reloj no tenga resolución.
-- F) Sin notificaciones: ampliar notificaciones_tipo_check exige recomponer el
--    CHECK desde producción (ver 074 y 102). Queda como mejora (aviso al JEFE
--    de un cambio solicitado o de una emergencia sin aprobar).
-- G) cambio_id en schema_migrations/function_deploys es TEXTO sin FK: el
--    tracking debe poder registrarse aunque el cambio no exista en esa base
--    (p. ej. entorno v2). deploy.mjs avisa, no bloquea.
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/deploy.mjs migracion` o `db import`, NUNCA `db query` a mano. Si
-- `db import` crashea (`Assertion failed ... src\win\async.c`), partir en
-- archivos temporales por sección y aplicarlos uno por uno; el archivo único
-- en migrations/ sigue siendo la fuente de verdad. Correr SIEMPRE el bloque
-- «Verificación» del final: `db import` puede reportar error habiendo
-- ejecutado parte de los statements. Todo es idempotente: reaplicar el
-- archivo completo tras un fallo parcial es seguro.
--
-- Rollback: migrations/rollback/107_rollback.sql (⚠️ descarta servicios,
-- cambios y su libro, y las columnas servicio_id y cambio_id: leer su cabecera).
-- ============================================================


-- ============================================================
-- 0) Precondiciones: 099 y 101 deben estar aplicadas
-- ============================================================

do $$
begin
  if to_regprocedure('public.exigir_permiso(text)') is null
     or to_regprocedure('public.puede_actual(text)') is null then
    raise exception 'La migración 107 requiere la 099 (exigir_permiso / puede_actual). Aplíquela primero.';
  end if;
  if to_regprocedure('public.texto_limpio(text)') is null then
    raise exception 'La migración 107 requiere la 101 (texto_limpio). Aplíquela primero.';
  end if;
  if to_regclass('public.categorias_ticket') is null
     or to_regclass('public.plataformas') is null
     or to_regclass('public.licencias') is null
     or to_regclass('public.tipos_equipo') is null
     or to_regclass('public.tickets') is null then
    raise exception 'La migración 107 requiere las tablas categorias_ticket, plataformas, licencias, tipos_equipo y tickets.';
  end if;
  if to_regclass('public.schema_migrations') is null or to_regclass('public.function_deploys') is null then
    raise exception 'La migración 107 requiere schema_migrations (069) y function_deploys (070).';
  end if;
end $$;


-- ============================================================
-- 1) servicios: el catálogo (≤ 15)
-- ============================================================

create table if not exists public.servicios (
  id            text        primary key
                check (id ~ '^[a-z0-9_]{2,40}$'),
  nombre        text        not null
                check (char_length(btrim(nombre)) between 2 and 60),
  descripcion   text        check (descripcion is null or char_length(descripcion) <= 300),
  -- Responsable del servicio (opcional): un integrante del staff.
  dueno_user_id uuid        references public.staff(user_id) on delete set null,
  criticidad    text        not null default 'media'
                check (criticidad in ('baja', 'media', 'alta', 'critica')),
  -- Texto libre corto: «24 x 7», “Lunes a sábado 8:00 a 18:00”.
  horario       text        check (horario is null or char_length(horario) <= 60),
  created_by    uuid        references auth.users(id) on delete set null,
  updated_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.servicios is
  'Catálogo de servicios de TI (107): ≤ 15 vivos (trigger). Lo escribe solo un JEFE; lo lee cualquier staff activo. Lo referencian categorias_ticket, plataformas, licencias, tipos_equipo y cambios.';
comment on column public.servicios.id is
  'Slug estable (correo, vpn, erp...). Lo usan las FK de los otros catálogos.';
comment on column public.servicios.dueno_user_id is
  'Responsable del servicio (staff). Opcional.';
comment on column public.servicios.horario is
  'Horario de atención en texto libre corto (60 caracteres).';

-- Dos servicios vivos no comparten nombre.
create unique index if not exists servicios_nombre_unico
  on public.servicios (lower(nombre)) where deleted_at is null;
create index if not exists idx_servicios_dueno on public.servicios (dueno_user_id);
create index if not exists idx_servicios_created_by on public.servicios (created_by);
create index if not exists idx_servicios_updated_by on public.servicios (updated_by);

-- Tope de 15 servicios vivos. Cuenta al insertar y al restaurar un servicio
-- dado de baja; una edición de uno ya vivo no cuenta de nuevo.
create or replace function public.check_tope_servicios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max constant integer := 15;
  v_n   integer;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null then
    return new;
  end if;
  select count(*) into v_n from public.servicios where deleted_at is null and id <> new.id;
  if v_n >= c_max then
    raise exception 'El catálogo admite como máximo % servicios. Elimine uno que ya no use.', c_max;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_servicios_tope on public.servicios;
create trigger trg_servicios_tope
  before insert or update of deleted_at on public.servicios
  for each row execute function public.check_tope_servicios();

drop trigger if exists trg_servicios_updated_at on public.servicios;
create trigger trg_servicios_updated_at
  before update on public.servicios
  for each row execute function public.set_updated_at();

drop trigger if exists trg_servicios_trazabilidad on public.servicios;
create trigger trg_servicios_trazabilidad
  before insert or update on public.servicios
  for each row execute function public.set_created_updated_by();

-- RLS: lee cualquier staff activo; escribe solo un JEFE (incluye la baja
-- lógica, que es un UPDATE de deleted_at).
alter table public.servicios enable row level security;

drop policy if exists "staff puede ver servicios" on public.servicios;
create policy "staff puede ver servicios"
  on public.servicios for select
  using (public.puede_actual('staff:activo'));

drop policy if exists "solo jefe puede crear servicios" on public.servicios;
create policy "solo jefe puede crear servicios"
  on public.servicios for insert
  with check (public.puede_actual('rol:jefe'));

drop policy if exists "solo jefe puede editar servicios" on public.servicios;
create policy "solo jefe puede editar servicios"
  on public.servicios for update
  using (public.puede_actual('rol:jefe'))
  with check (public.puede_actual('rol:jefe'));

drop policy if exists "solo jefe puede eliminar servicios" on public.servicios;
create policy "solo jefe puede eliminar servicios"
  on public.servicios for delete
  using (public.puede_actual('rol:jefe'));

revoke all on table public.servicios from anon, authenticated;
grant select, insert, update, delete on table public.servicios to authenticated;

-- Siembra (nombres razonables; el dueño y el horario los completa el JEFE).
-- No pisa lo que ya exista.
insert into public.servicios (id, nombre, descripcion, criticidad, horario) values
  ('correo',     'Correo corporativo',    'Buzones de la empresa y cuentas compartidas.',                'alta',    '24 x 7'),
  ('bitrix24',   'Bitrix24',              'Gestión de tareas y comunicación interna.',                   'alta',    '24 x 7'),
  ('vpn',        'VPN y acceso remoto',   'Conexión de las obras y del personal remoto a la red.',       'alta',    '24 x 7'),
  ('erp',        'ERP',                   'Sistema de gestión administrativa y contable.',               'critica', 'Horario laboral'),
  ('red',        'Internet y red',        'Red local, Wi-Fi, enlaces de internet y equipos de red.',     'critica', '24 x 7'),
  ('equipos',    'Equipos de cómputo',    'Laptops, desktops, monitores, celulares y tablets.',          'media',   'Horario laboral'),
  ('impresion',  'Impresión',             'Impresoras, multifuncionales y suministros.',                 'baja',    'Horario laboral'),
  ('telefonia',  'Telefonía',             'Líneas fijas, anexos y telefonía móvil corporativa.',         'media',   'Horario laboral'),
  ('licencias',  'Licencias de software', 'Software con licencia: diseño, ofimática y utilitarios.',     'media',   'Horario laboral'),
  ('accesos',    'Accesos y cuentas',     'Altas, bajas y permisos de las cuentas de los sistemas.',     'alta',    'Horario laboral')
on conflict (id) do nothing;


-- ============================================================
-- 2) servicio_id OPCIONAL en los cuatro catálogos
-- ON DELETE SET NULL: si un servicio se elimina de verdad (solo un JEFE),
-- las filas que lo referenciaban quedan sin servicio, no se pierden.
-- Al crear cada columna se enlazan las filas sembradas de fábrica (decisión C);
-- reaplicar el archivo no vuelve a tocarlas.
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'categorias_ticket' and column_name = 'servicio_id') then
    alter table public.categorias_ticket
      add column servicio_id text references public.servicios(id) on delete set null;
    update public.categorias_ticket set servicio_id = 'accesos'   where id = 'accesos_cuentas';
    update public.categorias_ticket set servicio_id = 'equipos'   where id = 'equipos';
    update public.categorias_ticket set servicio_id = 'licencias' where id = 'software';
    update public.categorias_ticket set servicio_id = 'red'       where id = 'red';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'plataformas' and column_name = 'servicio_id') then
    alter table public.plataformas
      add column servicio_id text references public.servicios(id) on delete set null;
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'licencias' and column_name = 'servicio_id') then
    alter table public.licencias
      add column servicio_id text references public.servicios(id) on delete set null;
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tipos_equipo' and column_name = 'servicio_id') then
    alter table public.tipos_equipo
      add column servicio_id text references public.servicios(id) on delete set null;
    update public.tipos_equipo set servicio_id = 'equipos'
     where id in ('laptop', 'desktop', 'monitor', 'celular', 'tablet');
    update public.tipos_equipo set servicio_id = 'impresion' where id = 'impresora';
  end if;
end $$;

create index if not exists idx_categorias_ticket_servicio on public.categorias_ticket (servicio_id);
create index if not exists idx_plataformas_servicio on public.plataformas (servicio_id);
create index if not exists idx_licencias_servicio on public.licencias (servicio_id);
create index if not exists idx_tipos_equipo_servicio on public.tipos_equipo (servicio_id);

comment on column public.categorias_ticket.servicio_id is
  'Servicio de TI al que pertenece la categoría (opcional, 107). Permite medir tickets por servicio.';
comment on column public.plataformas.servicio_id is
  'Servicio de TI al que pertenece la plataforma (opcional, 107).';
comment on column public.licencias.servicio_id is
  'Servicio de TI al que pertenece la licencia (opcional, 107).';
comment on column public.tipos_equipo.servicio_id is
  'Servicio de TI al que pertenece el tipo de equipo (opcional, 107).';


-- ============================================================
-- 3) Cambios: tablas, libro, enlace con tickets y whitelist
-- ============================================================

create sequence if not exists public.cambio_codigo_seq start 1;

-- Código correlativo CHG-0001 (mismo patrón que TCK-0001 y SOL-0001).
create or replace function public.siguiente_codigo_cambio()
returns text
language sql
as $$
  select 'CHG-' || lpad(nextval('public.cambio_codigo_seq')::text, 4, '0');
$$;

-- Texto de varias líneas: recorta los extremos y deja NULL el vacío, SIN
-- aplastar los saltos de línea (texto_limpio sí los colapsa; sirve para títulos).
create or replace function public.texto_multilinea(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select nullif(btrim(coalesce(p_texto, ''), E' \t\r\n'), '');
$$;

create table if not exists public.cambios (
  id                         uuid        primary key default gen_random_uuid(),
  codigo                     text        not null unique default public.siguiente_codigo_cambio(),
  titulo                     text        not null check (char_length(titulo) between 3 and 120),
  tipo                       text        not null check (tipo in ('estandar', 'normal', 'emergencia')),
  riesgo                     text        not null check (riesgo in ('bajo', 'medio', 'alto')),
  -- Sin on delete cascade ni set null: un cambio no pierde su servicio.
  servicio_id                text        not null references public.servicios(id) on delete restrict,
  descripcion                text        not null check (char_length(descripcion) between 1 and 4000),
  plan_retroceso             text        check (plan_retroceso is null or char_length(plan_retroceso) <= 4000),
  ventana_inicio             timestamptz,
  ventana_fin                timestamptz,
  estado                     text        not null default 'borrador'
                             check (estado in ('borrador', 'solicitado', 'aprobado', 'en_ejecucion',
                                               'implementado', 'cerrado', 'rechazado', 'cancelado', 'revertido')),
  -- Quién registró el cambio.
  solicitado_por             uuid        references auth.users(id) on delete set null,
  solicitado_at              timestamptz,
  -- Quién lo aprobó (un jefe). NULL en un estándar preautorizado.
  aprobado_por               uuid        references auth.users(id) on delete set null,
  aprobado_at                timestamptz,
  -- Emergencia ejecutada sin aprobación previa: hasta cuándo debe aprobarla un jefe.
  aprobacion_pendiente_hasta timestamptz,
  inicio_real_at             timestamptz,
  fin_real_at                timestamptz,
  -- Última nota de cierre: resultado, motivo del rechazo, de la cancelación o de la reversión.
  resultado                  text        check (resultado is null or char_length(resultado) <= 1000),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint cambios_ventana_coherente check (
    (ventana_inicio is null) = (ventana_fin is null)
    and (ventana_inicio is null or ventana_fin > ventana_inicio)
  ),
  -- Plan de retroceso OBLIGATORIO salvo en el estándar. Un borrador (y un
  -- borrador cancelado sin completar) puede estar incompleto.
  constraint cambios_plan_retroceso_obligatorio check (
    estado in ('borrador', 'cancelado') or tipo = 'estandar'
    or char_length(btrim(coalesce(plan_retroceso, ''))) > 0
  ),
  -- Ventana obligatoria salvo en la emergencia (mismo criterio sobre borradores).
  constraint cambios_ventana_obligatoria check (
    estado in ('borrador', 'cancelado') or tipo = 'emergencia' or ventana_inicio is not null
  ),
  constraint cambios_aprobacion_coherente check ((aprobado_por is null) = (aprobado_at is null)),
  constraint cambios_plazo_solo_emergencia check (
    aprobacion_pendiente_hasta is null or (tipo = 'emergencia' and aprobado_por is null)
  )
);

comment on table public.cambios is
  'Registro de cambios (107): estándar (preautorizado), normal (aprobación de un jefe) y emergencia (se ejecuta sin aprobación previa, aprobación a posteriori en 48 h). Solo se escribe por RPC; nunca se borra (el libro es inmutable): baja = cancelado.';
comment on column public.cambios.aprobacion_pendiente_hasta is
  'Emergencia ejecutada sin aprobación: plazo (48 h desde que empezó) para que un jefe la apruebe. NULL cuando ya está aprobada.';
comment on column public.cambios.resultado is
  'Última nota de cierre del cambio: qué se logró (implementado/cerrado) o el motivo (rechazado, cancelado, revertido).';

create index if not exists idx_cambios_estado on public.cambios (estado, created_at desc);
create index if not exists idx_cambios_servicio on public.cambios (servicio_id);
create index if not exists idx_cambios_solicitado_por on public.cambios (solicitado_por);
create index if not exists idx_cambios_aprobado_por on public.cambios (aprobado_por);
create index if not exists idx_cambios_emergencia_pendiente
  on public.cambios (aprobacion_pendiente_hasta) where aprobacion_pendiente_hasta is not null;

-- Libro de movimientos: append-only, un renglón por hecho relevante.
create table if not exists public.cambio_eventos (
  id              uuid        primary key default gen_random_uuid(),
  -- Orden estricto de escritura: desempata eventos con el mismo created_at.
  orden           bigint      generated always as identity,
  cambio_id       uuid        not null references public.cambios(id),
  evento          text        not null,
  estado_anterior text,
  estado_nuevo    text,
  user_id         uuid,
  user_email      text,
  rol_actor       text,
  detalle         text        check (detalle is null or char_length(detalle) <= 1200),
  created_at      timestamptz not null default clock_timestamp(),
  constraint cambio_eventos_evento_check check (evento in (
    'creado', 'editado', 'solicitado', 'aprobado', 'rechazado', 'iniciado',
    'implementado', 'cerrado', 'revertido', 'cancelado',
    'ticket_vinculado', 'ticket_desvinculado'
  )),
  constraint cambio_eventos_rol_actor_check check (rol_actor in ('jefe', 'tecnico', 'sistema'))
);

comment on table public.cambio_eventos is
  'Libro de movimientos de los cambios (107). Append-only: solo lo escriben las RPC SECURITY DEFINER; UPDATE y DELETE los rechaza un trigger. Legible con el módulo tickets.';

create index if not exists idx_cambio_eventos_cambio on public.cambio_eventos (cambio_id, orden desc);

create or replace function public.cambio_eventos_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'cambio_eventos es inmutable: no admite % (migración 107).', tg_op;
end;
$$;

drop trigger if exists trg_cambio_eventos_inmutable on public.cambio_eventos;
create trigger trg_cambio_eventos_inmutable
  before update or delete on public.cambio_eventos
  for each row execute function public.cambio_eventos_inmutable();

-- Enlace cambio ↔ ticket (decisión A).
create table if not exists public.cambio_tickets (
  cambio_id    uuid        not null references public.cambios(id),
  ticket_id    uuid        not null references public.tickets(id) on delete cascade,
  vinculado_por uuid       references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (cambio_id, ticket_id)
);

comment on table public.cambio_tickets is
  'Enlace muchos a muchos entre cambios y tickets (107). Solo se escribe por vincular_cambio_ticket / desvincular_cambio_ticket.';

create index if not exists idx_cambio_tickets_ticket on public.cambio_tickets (ticket_id);
create index if not exists idx_cambio_tickets_vinculado_por on public.cambio_tickets (vinculado_por);

-- Whitelist de transiciones (default-deny, patrón de la 050). `tipos` dice para
-- qué tipos de cambio vale la fila; `solo_jefe`, que la decide un jefe.
create table if not exists public.transiciones_cambio_permitidas (
  origen    text    not null,
  destino   text    not null,
  tipos     text[]  not null default array['estandar', 'normal', 'emergencia'],
  solo_jefe boolean not null default false,
  primary key (origen, destino)
);

comment on table public.transiciones_cambio_permitidas is
  'Whitelist de transiciones de estado de cambios (107, default-deny). cerrado, rechazado, cancelado y revertido son terminales. Sin policy de escritura: se administra por migración.';

insert into public.transiciones_cambio_permitidas (origen, destino, tipos, solo_jefe) values
  ('borrador',     'solicitado',   array['estandar', 'normal', 'emergencia'], false),
  ('borrador',     'aprobado',     array['estandar'],                         false),
  ('borrador',     'en_ejecucion', array['emergencia'],                       false),
  ('borrador',     'cancelado',    array['estandar', 'normal', 'emergencia'], false),
  ('solicitado',   'aprobado',     array['estandar', 'normal', 'emergencia'], true),
  ('solicitado',   'rechazado',    array['estandar', 'normal', 'emergencia'], true),
  ('solicitado',   'en_ejecucion', array['emergencia'],                       false),
  ('solicitado',   'cancelado',    array['estandar', 'normal', 'emergencia'], false),
  ('aprobado',     'en_ejecucion', array['estandar', 'normal', 'emergencia'], false),
  ('aprobado',     'cancelado',    array['estandar', 'normal', 'emergencia'], false),
  ('en_ejecucion', 'implementado', array['estandar', 'normal', 'emergencia'], false),
  ('en_ejecucion', 'revertido',    array['estandar', 'normal', 'emergencia'], false),
  ('implementado', 'cerrado',      array['estandar', 'normal', 'emergencia'], false),
  ('implementado', 'revertido',    array['estandar', 'normal', 'emergencia'], false)
on conflict (origen, destino) do update
  set tipos = excluded.tipos,
      solo_jefe = excluded.solo_jefe;

alter table public.cambios enable row level security;
alter table public.cambio_eventos enable row level security;
alter table public.cambio_tickets enable row level security;
alter table public.transiciones_cambio_permitidas enable row level security;

drop policy if exists "staff con modulo tickets puede ver cambios" on public.cambios;
create policy "staff con modulo tickets puede ver cambios"
  on public.cambios for select
  using (public.puede_actual('modulo:tickets'));

drop policy if exists "staff con modulo tickets puede ver eventos de cambios" on public.cambio_eventos;
create policy "staff con modulo tickets puede ver eventos de cambios"
  on public.cambio_eventos for select
  using (public.puede_actual('modulo:tickets'));

drop policy if exists "staff con modulo tickets puede ver enlaces de cambios" on public.cambio_tickets;
create policy "staff con modulo tickets puede ver enlaces de cambios"
  on public.cambio_tickets for select
  using (public.puede_actual('modulo:tickets'));

drop policy if exists "staff puede ver transiciones de cambio" on public.transiciones_cambio_permitidas;
create policy "staff puede ver transiciones de cambio"
  on public.transiciones_cambio_permitidas for select
  using (public.puede_actual('staff:activo'));

-- Defensa en profundidad: sin policies de escritura Y sin privilegios.
revoke all on table public.cambios from anon, authenticated;
revoke all on table public.cambio_eventos from anon, authenticated;
revoke all on table public.cambio_tickets from anon, authenticated;
revoke all on table public.transiciones_cambio_permitidas from anon, authenticated;
grant select on table public.cambios to authenticated;
grant select on table public.cambio_eventos to authenticated;
grant select on table public.cambio_tickets to authenticated;
grant select on table public.transiciones_cambio_permitidas to authenticated;
revoke all on sequence public.cambio_codigo_seq from anon, authenticated;

drop trigger if exists trg_cambios_updated_at on public.cambios;
create trigger trg_cambios_updated_at
  before update on public.cambios
  for each row execute function public.set_updated_at();


-- ============================================================
-- 4) Trigger de integridad de los cambios
-- Corre también para project_admin: ni una edición directa se salta la
-- whitelist ni el requisito de aprobación.
-- ============================================================

create or replace function public.check_transicion_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.transiciones_cambio_permitidas;
begin
  if new.codigo is distinct from old.codigo
     or new.solicitado_por is distinct from old.solicitado_por then
    raise exception 'Un cambio no cambia de código ni de solicitante.';
  end if;

  -- Lo aprobado es lo que se ejecuta: fuera de borrador el contenido se congela.
  if old.estado <> 'borrador' and (
       new.titulo is distinct from old.titulo
    or new.tipo is distinct from old.tipo
    or new.riesgo is distinct from old.riesgo
    or new.servicio_id is distinct from old.servicio_id
    or new.descripcion is distinct from old.descripcion
    or new.plan_retroceso is distinct from old.plan_retroceso
    or new.ventana_inicio is distinct from old.ventana_inicio
    or new.ventana_fin is distinct from old.ventana_fin) then
    raise exception 'El cambio % ya salió de borrador: no se edita. Cancélelo y registre uno nuevo.', old.codigo;
  end if;

  -- Quien aprueba es un jefe activo.
  if new.aprobado_por is not null and new.aprobado_por is distinct from old.aprobado_por then
    if not exists (select 1 from public.staff s where s.user_id = new.aprobado_por and s.rol = 'JEFE' and s.activo) then
      raise exception 'Solo un jefe activo puede aprobar un cambio.';
    end if;
  end if;

  if new.estado is distinct from old.estado then
    select * into v_t from public.transiciones_cambio_permitidas
     where origen = old.estado and destino = new.estado;
    if not found or not (new.tipo = any (v_t.tipos)) then
      raise exception 'Transición de estado de cambio "%" a "%" no permitida para un cambio %.', old.estado, new.estado, new.tipo;
    end if;

    if new.estado = 'aprobado' and new.tipo <> 'estandar' and new.aprobado_por is null then
      raise exception 'Un cambio % solo pasa a aprobado con la aprobación de un jefe.', new.tipo;
    end if;
    if new.estado = 'cerrado' and new.tipo = 'emergencia' and new.aprobado_por is null then
      raise exception 'Un cambio de emergencia no se cierra sin la aprobación a posteriori de un jefe (plazo de 48 horas).';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_transicion_cambio on public.cambios;
create trigger trg_check_transicion_cambio
  before update on public.cambios
  for each row execute function public.check_transicion_cambio();


-- ============================================================
-- 5) RPC y núcleos
-- Patrón de la 101/106: cada RPC pública es UN guard (exigir_permiso) + una
-- llamada a su núcleo, que contiene TODA la lógica. Los núcleos tienen
-- EXECUTE solo para project_admin y reciben el actor y su rol ya resueltos.
-- ============================================================

-- Único punto de escritura del libro.
create or replace function public.registrar_evento_cambio(
  p_cambio_id uuid,
  p_evento    text,
  p_anterior  text,
  p_nuevo     text,
  p_detalle   text,
  p_actor     uuid,
  p_rol       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if p_actor is not null then
    select email into v_email from auth.users where id = p_actor;
  end if;
  insert into public.cambio_eventos
    (cambio_id, evento, estado_anterior, estado_nuevo, user_id, user_email, rol_actor, detalle)
  values
    (p_cambio_id, p_evento, p_anterior, p_nuevo, p_actor, v_email, p_rol, p_detalle);
end;
$$;

-- Validación común de crear y actualizar (recibe los textos ya limpios).
create or replace function public.cambio_validar_campos(
  p_titulo      text,
  p_tipo        text,
  p_riesgo      text,
  p_servicio_id text,
  p_descripcion text,
  p_plan        text,
  p_inicio      timestamptz,
  p_fin         timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_titulo is null or char_length(p_titulo) < 3 then
    raise exception 'El título es obligatorio (mínimo 3 caracteres).';
  end if;
  if char_length(p_titulo) > 120 then
    raise exception 'El título no puede superar los 120 caracteres.';
  end if;
  if p_tipo is null or p_tipo not in ('estandar', 'normal', 'emergencia') then
    raise exception 'El tipo de cambio no es válido (estándar, normal o emergencia).';
  end if;
  if p_riesgo is null or p_riesgo not in ('bajo', 'medio', 'alto') then
    raise exception 'El riesgo no es válido (bajo, medio o alto).';
  end if;
  if p_servicio_id is null
     or not exists (select 1 from public.servicios where id = p_servicio_id and deleted_at is null) then
    raise exception 'El servicio indicado no existe o fue dado de baja.';
  end if;
  if p_descripcion is null then
    raise exception 'La descripción del cambio es obligatoria.';
  end if;
  if char_length(p_descripcion) > 4000 then
    raise exception 'La descripción no puede superar los 4000 caracteres.';
  end if;
  if p_plan is not null and char_length(p_plan) > 4000 then
    raise exception 'El plan de retroceso no puede superar los 4000 caracteres.';
  end if;
  if (p_inicio is null) <> (p_fin is null) then
    raise exception 'Indique el inicio y el fin de la ventana, o ninguno de los dos.';
  end if;
  if p_inicio is not null and p_fin <= p_inicio then
    raise exception 'La ventana de ejecución termina antes de empezar.';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 5.a) crear_cambio
-- ------------------------------------------------------------
create or replace function public.crear_cambio_nucleo(
  p_titulo         text,
  p_tipo           text,
  p_riesgo         text,
  p_servicio_id    text,
  p_descripcion    text,
  p_plan_retroceso text,
  p_ventana_inicio timestamptz,
  p_ventana_fin    timestamptz,
  p_enviar         boolean,
  p_actor          uuid,
  p_es_jefe        boolean
)
returns public.cambios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text := public.texto_limpio(p_titulo);
  v_desc   text := public.texto_multilinea(p_descripcion);
  v_plan   text := public.texto_multilinea(p_plan_retroceso);
  v_rol    text := case when p_actor is null then 'sistema' when p_es_jefe then 'jefe' else 'tecnico' end;
  v_c      public.cambios;
begin
  perform public.cambio_validar_campos(v_titulo, p_tipo, p_riesgo, p_servicio_id, v_desc, v_plan, p_ventana_inicio, p_ventana_fin);

  insert into public.cambios
    (titulo, tipo, riesgo, servicio_id, descripcion, plan_retroceso, ventana_inicio, ventana_fin, solicitado_por)
  values
    (v_titulo, p_tipo, p_riesgo, p_servicio_id, v_desc, v_plan, p_ventana_inicio, p_ventana_fin, p_actor)
  returning * into v_c;

  perform public.registrar_evento_cambio(
    v_c.id, 'creado', null, 'borrador',
    'Cambio ' || v_c.tipo || ' · riesgo ' || v_c.riesgo, p_actor, v_rol);

  if coalesce(p_enviar, false) then
    v_c := public.transicionar_cambio_nucleo(
      v_c.id, case when v_c.tipo = 'estandar' then 'aprobado' else 'solicitado' end, null, p_actor, p_es_jefe);
  end if;

  return v_c;
end;
$$;

-- ------------------------------------------------------------
-- 5.b) actualizar_cambio (solo borrador)
-- ------------------------------------------------------------
create or replace function public.actualizar_cambio_nucleo(
  p_cambio_id      uuid,
  p_titulo         text,
  p_tipo           text,
  p_riesgo         text,
  p_servicio_id    text,
  p_descripcion    text,
  p_plan_retroceso text,
  p_ventana_inicio timestamptz,
  p_ventana_fin    timestamptz,
  p_actor          uuid,
  p_es_jefe        boolean
)
returns public.cambios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text := public.texto_limpio(p_titulo);
  v_desc   text := public.texto_multilinea(p_descripcion);
  v_plan   text := public.texto_multilinea(p_plan_retroceso);
  v_rol    text := case when p_actor is null then 'sistema' when p_es_jefe then 'jefe' else 'tecnico' end;
  v_c      public.cambios;
begin
  select * into v_c from public.cambios where id = p_cambio_id for update;
  if not found then
    raise exception 'El cambio no existe.' using errcode = 'P0002';
  end if;
  if v_c.estado <> 'borrador' then
    raise exception 'El cambio % ya salió de borrador: no se edita. Cancélelo y registre uno nuevo.', v_c.codigo;
  end if;

  perform public.cambio_validar_campos(v_titulo, p_tipo, p_riesgo, p_servicio_id, v_desc, v_plan, p_ventana_inicio, p_ventana_fin);

  update public.cambios
     set titulo = v_titulo, tipo = p_tipo, riesgo = p_riesgo, servicio_id = p_servicio_id,
         descripcion = v_desc, plan_retroceso = v_plan,
         ventana_inicio = p_ventana_inicio, ventana_fin = p_ventana_fin
   where id = p_cambio_id
   returning * into v_c;

  perform public.registrar_evento_cambio(v_c.id, 'editado', 'borrador', 'borrador', 'Se editó el borrador', p_actor, v_rol);
  return v_c;
end;
$$;

-- ------------------------------------------------------------
-- 5.c) transicionar_cambio (también lo usan aprobar y rechazar)
-- ------------------------------------------------------------
create or replace function public.transicionar_cambio_nucleo(
  p_cambio_id uuid,
  p_destino   text,
  p_nota      text,
  p_actor     uuid,
  p_es_jefe   boolean
)
returns public.cambios
language plpgsql
security definer
set search_path = public
as $$
declare
  c_plazo constant interval := interval '48 hours';
  v_nota   text := public.texto_multilinea(p_nota);
  v_rol    text := case when p_actor is null then 'sistema' when p_es_jefe then 'jefe' else 'tecnico' end;
  v_c      public.cambios;
  v_t      public.transiciones_cambio_permitidas;
  v_evento text;
  v_detalle text;
  v_hasta  timestamptz;
begin
  select * into v_c from public.cambios where id = p_cambio_id for update;
  if not found then
    raise exception 'El cambio no existe.' using errcode = 'P0002';
  end if;

  if p_destino is null or p_destino not in ('borrador', 'solicitado', 'aprobado', 'en_ejecucion',
                                            'implementado', 'cerrado', 'rechazado', 'cancelado', 'revertido') then
    raise exception 'El estado de destino no es válido.';
  end if;

  select * into v_t from public.transiciones_cambio_permitidas
   where origen = v_c.estado and destino = p_destino;
  if not found or not (v_c.tipo = any (v_t.tipos)) then
    raise exception 'El cambio % (%) no puede pasar de "%" a "%".', v_c.codigo, v_c.tipo, v_c.estado, p_destino;
  end if;
  if v_t.solo_jefe and not coalesce(p_es_jefe, false) then
    raise exception 'Solo un jefe puede aprobar o rechazar un cambio.';
  end if;

  if v_nota is not null and char_length(v_nota) > 1000 then
    raise exception 'La nota no puede superar los 1000 caracteres.';
  end if;
  if v_nota is null and (p_destino in ('rechazado', 'revertido') or (p_destino = 'cancelado' and v_c.estado <> 'borrador')) then
    raise exception 'El motivo es obligatorio para % un cambio.',
      case p_destino when 'rechazado' then 'rechazar' when 'revertido' then 'revertir' else 'cancelar' end;
  end if;

  -- Al salir de borrador el cambio debe estar completo.
  if v_c.estado = 'borrador' and p_destino <> 'cancelado' then
    if v_c.tipo <> 'estandar' and public.texto_multilinea(v_c.plan_retroceso) is null then
      raise exception 'Un cambio % necesita un plan de retroceso.', v_c.tipo;
    end if;
    if v_c.tipo <> 'emergencia' and v_c.ventana_inicio is null then
      raise exception 'Indique la ventana de ejecución (inicio y fin) del cambio.';
    end if;
  end if;

  -- Efectos de cada destino.
  v_hasta := v_c.aprobacion_pendiente_hasta;
  if p_destino = 'en_ejecucion' and v_c.tipo = 'emergencia' and v_c.aprobado_por is null then
    v_hasta := now() + c_plazo;
  end if;

  update public.cambios
     set estado = p_destino,
         solicitado_at = case when p_destino = 'solicitado' then now() else solicitado_at end,
         aprobado_por = case when p_destino = 'aprobado' and v_t.solo_jefe then p_actor else aprobado_por end,
         aprobado_at = case when p_destino = 'aprobado' and v_t.solo_jefe then now() else aprobado_at end,
         aprobacion_pendiente_hasta = v_hasta,
         inicio_real_at = case when p_destino = 'en_ejecucion' then now() else inicio_real_at end,
         fin_real_at = case when p_destino in ('implementado', 'revertido') then now() else fin_real_at end,
         resultado = case when p_destino in ('rechazado', 'cancelado', 'revertido', 'implementado', 'cerrado') and v_nota is not null
                          then v_nota else resultado end
   where id = p_cambio_id
   returning * into v_c;

  v_evento := case p_destino
    when 'solicitado' then 'solicitado'
    when 'aprobado' then 'aprobado'
    when 'rechazado' then 'rechazado'
    when 'en_ejecucion' then 'iniciado'
    when 'implementado' then 'implementado'
    when 'cerrado' then 'cerrado'
    when 'revertido' then 'revertido'
    else 'cancelado' end;

  v_detalle := v_nota;
  if p_destino = 'aprobado' and not v_t.solo_jefe then
    v_detalle := 'Cambio estándar: preautorizado, sin aprobación de un jefe.' || coalesce(' · ' || v_nota, '');
  elsif p_destino = 'en_ejecucion' and v_hasta is not null then
    v_detalle := 'Emergencia sin aprobación previa: un jefe debe aprobarla antes del '
      || to_char(v_hasta at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI') || '.' || coalesce(' · ' || v_nota, '');
  end if;

  perform public.registrar_evento_cambio(v_c.id, v_evento, v_t.origen, p_destino, v_detalle, p_actor, v_rol);
  return v_c;
end;
$$;

-- ------------------------------------------------------------
-- 5.d) aprobar_cambio / rechazar_cambio
-- ------------------------------------------------------------
create or replace function public.aprobar_cambio_nucleo(
  p_cambio_id uuid,
  p_nota      text,
  p_actor     uuid,
  p_es_jefe   boolean
)
returns public.cambios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nota text := public.texto_multilinea(p_nota);
  v_c    public.cambios;
begin
  if not coalesce(p_es_jefe, false) then
    raise exception 'Solo un jefe puede aprobar o rechazar un cambio.';
  end if;
  if v_nota is not null and char_length(v_nota) > 1000 then
    raise exception 'La nota no puede superar los 1000 caracteres.';
  end if;

  select * into v_c from public.cambios where id = p_cambio_id for update;
  if not found then
    raise exception 'El cambio no existe.' using errcode = 'P0002';
  end if;

  -- Emergencia ya ejecutada sin aprobación: aprobación a posteriori, sin cambio de estado.
  if v_c.tipo = 'emergencia' and v_c.estado in ('en_ejecucion', 'implementado') and v_c.aprobado_por is null then
    update public.cambios
       set aprobado_por = p_actor, aprobado_at = now(), aprobacion_pendiente_hasta = null
     where id = p_cambio_id
     returning * into v_c;
    perform public.registrar_evento_cambio(
      v_c.id, 'aprobado', v_c.estado, v_c.estado,
      'Aprobación a posteriori del cambio de emergencia.' || coalesce(' · ' || v_nota, ''), p_actor, 'jefe');
    return v_c;
  end if;

  if v_c.estado <> 'solicitado' then
    raise exception 'El cambio % está "%": no admite aprobación.', v_c.codigo, v_c.estado;
  end if;

  return public.transicionar_cambio_nucleo(p_cambio_id, 'aprobado', v_nota, p_actor, p_es_jefe);
end;
$$;

create or replace function public.rechazar_cambio_nucleo(
  p_cambio_id uuid,
  p_motivo    text,
  p_actor     uuid,
  p_es_jefe   boolean
)
returns public.cambios
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(p_es_jefe, false) then
    raise exception 'Solo un jefe puede aprobar o rechazar un cambio.';
  end if;
  return public.transicionar_cambio_nucleo(p_cambio_id, 'rechazado', p_motivo, p_actor, p_es_jefe);
end;
$$;

-- ------------------------------------------------------------
-- 5.e) vincular / desvincular tickets
-- ------------------------------------------------------------
create or replace function public.vincular_cambio_ticket_nucleo(
  p_cambio_id uuid,
  p_ticket_id uuid,
  p_actor     uuid,
  p_es_jefe   boolean
)
returns public.cambio_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c      public.cambios;
  v_codigo text;
  v_rol    text := case when p_actor is null then 'sistema' when p_es_jefe then 'jefe' else 'tecnico' end;
  v_fila   public.cambio_tickets;
begin
  select * into v_c from public.cambios where id = p_cambio_id for update;
  if not found then
    raise exception 'El cambio no existe.' using errcode = 'P0002';
  end if;
  select codigo into v_codigo from public.tickets where id = p_ticket_id;
  if not found then
    raise exception 'El ticket no existe.' using errcode = 'P0002';
  end if;

  insert into public.cambio_tickets (cambio_id, ticket_id, vinculado_por)
  values (p_cambio_id, p_ticket_id, p_actor)
  on conflict (cambio_id, ticket_id) do nothing
  returning * into v_fila;

  if found then
    perform public.registrar_evento_cambio(
      v_c.id, 'ticket_vinculado', v_c.estado, v_c.estado, 'Ticket ' || v_codigo, p_actor, v_rol);
  else
    select * into v_fila from public.cambio_tickets where cambio_id = p_cambio_id and ticket_id = p_ticket_id;
  end if;
  return v_fila;
end;
$$;

create or replace function public.desvincular_cambio_ticket_nucleo(
  p_cambio_id uuid,
  p_ticket_id uuid,
  p_actor     uuid,
  p_es_jefe   boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c      public.cambios;
  v_codigo text;
  v_rol    text := case when p_actor is null then 'sistema' when p_es_jefe then 'jefe' else 'tecnico' end;
begin
  select * into v_c from public.cambios where id = p_cambio_id for update;
  if not found then
    raise exception 'El cambio no existe.' using errcode = 'P0002';
  end if;

  delete from public.cambio_tickets where cambio_id = p_cambio_id and ticket_id = p_ticket_id;
  if not found then
    return false;
  end if;

  select codigo into v_codigo from public.tickets where id = p_ticket_id;
  perform public.registrar_evento_cambio(
    v_c.id, 'ticket_desvinculado', v_c.estado, v_c.estado, 'Ticket ' || coalesce(v_codigo, '(eliminado)'), p_actor, v_rol);
  return true;
end;
$$;

-- ------------------------------------------------------------
-- RPC públicas (guard + llamada al núcleo)
-- ------------------------------------------------------------
create or replace function public.crear_cambio(
  p_titulo         text,
  p_tipo           text,
  p_riesgo         text,
  p_servicio_id    text,
  p_descripcion    text,
  p_plan_retroceso text        default null,
  p_ventana_inicio timestamptz default null,
  p_ventana_fin    timestamptz default null,
  p_enviar         boolean     default false
)
returns public.cambios
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.crear_cambio_nucleo(p_titulo, p_tipo, p_riesgo, p_servicio_id, p_descripcion, p_plan_retroceso,
    p_ventana_inicio, p_ventana_fin, p_enviar, auth.uid(), public.puede_actual('rol:jefe'));
end;
$$;

create or replace function public.actualizar_cambio(
  p_cambio_id      uuid,
  p_titulo         text,
  p_tipo           text,
  p_riesgo         text,
  p_servicio_id    text,
  p_descripcion    text,
  p_plan_retroceso text        default null,
  p_ventana_inicio timestamptz default null,
  p_ventana_fin    timestamptz default null
)
returns public.cambios
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.actualizar_cambio_nucleo(p_cambio_id, p_titulo, p_tipo, p_riesgo, p_servicio_id, p_descripcion,
    p_plan_retroceso, p_ventana_inicio, p_ventana_fin, auth.uid(), public.puede_actual('rol:jefe'));
end;
$$;

create or replace function public.transicionar_cambio(
  p_cambio_id uuid,
  p_destino   text,
  p_nota      text default null
)
returns public.cambios
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.transicionar_cambio_nucleo(p_cambio_id, p_destino, p_nota, auth.uid(), public.puede_actual('rol:jefe'));
end;
$$;

create or replace function public.aprobar_cambio(
  p_cambio_id uuid,
  p_nota      text default null
)
returns public.cambios
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('rol:jefe');
  return public.aprobar_cambio_nucleo(p_cambio_id, p_nota, auth.uid(), true);
end;
$$;

create or replace function public.rechazar_cambio(
  p_cambio_id uuid,
  p_motivo    text
)
returns public.cambios
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('rol:jefe');
  return public.rechazar_cambio_nucleo(p_cambio_id, p_motivo, auth.uid(), true);
end;
$$;

create or replace function public.vincular_cambio_ticket(
  p_cambio_id uuid,
  p_ticket_id uuid
)
returns public.cambio_tickets
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.vincular_cambio_ticket_nucleo(p_cambio_id, p_ticket_id, auth.uid(), public.puede_actual('rol:jefe'));
end;
$$;

create or replace function public.desvincular_cambio_ticket(
  p_cambio_id uuid,
  p_ticket_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:tickets');
  return public.desvincular_cambio_ticket_nucleo(p_cambio_id, p_ticket_id, auth.uid(), public.puede_actual('rol:jefe'));
end;
$$;

comment on function public.crear_cambio(text, text, text, text, text, text, timestamptz, timestamptz, boolean) is
  'Registra un cambio (borrador, o enviado con p_enviar: estándar queda aprobado, normal y emergencia solicitados). Guard modulo:tickets. 107.';
comment on function public.actualizar_cambio(uuid, text, text, text, text, text, text, timestamptz, timestamptz) is
  'Edita un cambio en borrador; fuera de borrador el contenido está congelado. Guard modulo:tickets. 107.';
comment on function public.transicionar_cambio(uuid, text, text) is
  'Avanza el estado de un cambio según la whitelist de su tipo (aprobar y rechazar exigen jefe). Guard modulo:tickets. 107.';
comment on function public.aprobar_cambio(uuid, text) is
  'Un jefe aprueba un cambio solicitado, o registra la aprobación a posteriori de una emergencia ya ejecutada. Guard rol:jefe. 107.';
comment on function public.rechazar_cambio(uuid, text) is
  'Un jefe rechaza un cambio solicitado, con motivo obligatorio. Guard rol:jefe. 107.';
comment on function public.vincular_cambio_ticket(uuid, uuid) is
  'Enlaza un ticket a un cambio (idempotente). No modifica tickets. Guard modulo:tickets. 107.';
comment on function public.desvincular_cambio_ticket(uuid, uuid) is
  'Quita el enlace entre un cambio y un ticket; devuelve false si no existía. Guard modulo:tickets. 107.';


-- ============================================================
-- 6) Vistas (security_invoker: la RLS de cambios aplica a quien consulta)
-- ============================================================

-- Emergencias ejecutadas sin aprobación cuyo plazo de 48 h ya pasó.
create or replace view public.v_cambios_aprobacion_vencida
with (security_invoker = true) as
select c.id                         as cambio_id,
       c.codigo,
       c.titulo,
       c.servicio_id,
       s.nombre                     as servicio,
       c.estado,
       c.inicio_real_at,
       c.aprobacion_pendiente_hasta,
       now() - c.aprobacion_pendiente_hasta as vencida_hace
  from public.cambios c
  left join public.servicios s on s.id = c.servicio_id
 where c.tipo = 'emergencia'
   and c.aprobado_por is null
   and c.estado in ('en_ejecucion', 'implementado')
   and c.aprobacion_pendiente_hasta < now();

-- Cambios de los últimos 90 días por tipo: volumen, peso de las emergencias,
-- tasa de reversión y emergencias con la aprobación vencida. Cuenta los
-- cambios que llegaron a pedirse (excluye borradores y cancelados). Siempre
-- devuelve las tres filas, con ceros si no hay cambios o si quien consulta no
-- tiene el módulo tickets.
create or replace view public.v_kpi_cambios
with (security_invoker = true) as
with base as (
  select t.tipo,
         count(c.id)::integer as total,
         (count(c.id) filter (where c.estado in ('en_ejecucion', 'implementado', 'cerrado', 'revertido')))::integer as ejecutados,
         (count(c.id) filter (where c.estado in ('implementado', 'cerrado')))::integer as implementados,
         (count(c.id) filter (where c.estado = 'revertido'))::integer as revertidos,
         (count(c.id) filter (where c.tipo = 'emergencia' and c.aprobado_por is null
                                and c.estado in ('en_ejecucion', 'implementado')
                                and c.aprobacion_pendiente_hasta < now()))::integer as sin_aprobar_vencidas
    from (values ('estandar'), ('normal'), ('emergencia')) as t(tipo)
    left join public.cambios c
      on c.tipo = t.tipo
     and c.estado not in ('borrador', 'cancelado')
     and c.created_at >= now() - interval '90 days'
   group by t.tipo
)
select b.tipo,
       b.total                as total_90d,
       b.ejecutados           as ejecutados_90d,
       b.implementados        as implementados_90d,
       b.revertidos           as revertidos_90d,
       b.sin_aprobar_vencidas as emergencias_sin_aprobar_vencidas,
       case when sum(b.total) over () > 0
            then round(100.0 * b.total / sum(b.total) over (), 1) else 0 end as pct_del_total_90d,
       case when b.ejecutados > 0
            then round(100.0 * b.revertidos / b.ejecutados, 1) else 0 end as pct_revertidos_90d
  from base b;

alter view public.v_cambios_aprobacion_vencida owner to project_admin;
alter view public.v_kpi_cambios owner to project_admin;
revoke all on public.v_cambios_aprobacion_vencida from public, anon;
revoke all on public.v_kpi_cambios from public, anon;
grant select on public.v_cambios_aprobacion_vencida to authenticated;
grant select on public.v_kpi_cambios to authenticated;

comment on view public.v_cambios_aprobacion_vencida is
  'Emergencias en ejecución o implementadas sin aprobación de un jefe cuyo plazo de 48 h venció. security_invoker. Migración 107.';
comment on view public.v_kpi_cambios is
  'Cambios de los últimos 90 días por tipo: total, ejecutados, revertidos, % del total, % revertidos y emergencias sin aprobar vencidas. security_invoker. Migración 107.';


-- ============================================================
-- 7) cambio_id en schema_migrations y function_deploys
-- Texto CHG-#### sin FK (decisión G): scripts/deploy.mjs --cambio lo rellena
-- si la columna existe. Las filas anteriores quedan en NULL.
-- ============================================================

alter table public.schema_migrations add column if not exists cambio_id text;
alter table public.function_deploys  add column if not exists cambio_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schema_migrations_cambio_id_formato') then
    alter table public.schema_migrations
      add constraint schema_migrations_cambio_id_formato
      check (cambio_id is null or cambio_id ~ '^CHG-[0-9]{4,}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'function_deploys_cambio_id_formato') then
    alter table public.function_deploys
      add constraint function_deploys_cambio_id_formato
      check (cambio_id is null or cambio_id ~ '^CHG-[0-9]{4,}$');
  end if;
end $$;

comment on column public.schema_migrations.cambio_id is
  'Cambio (CHG-####) que autorizó esta migración, si se aplicó con deploy.mjs --cambio. Sin FK a propósito. 107.';
comment on column public.function_deploys.cambio_id is
  'Cambio (CHG-####) que autorizó este despliegue, si se hizo con deploy.mjs --cambio. Sin FK a propósito. 107.';


-- ============================================================
-- 8) Dueño y permisos
-- Todo project_admin; EXECUTE a `authenticated` SOLO en las 7 RPC públicas
-- (nunca en núcleos, internas ni triggers, nunca a public/anon).
-- ============================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.siguiente_codigo_cambio()',
    'public.texto_multilinea(text)',
    'public.check_tope_servicios()',
    'public.check_transicion_cambio()',
    'public.cambio_eventos_inmutable()',
    'public.registrar_evento_cambio(uuid, text, text, text, text, uuid, text)',
    'public.cambio_validar_campos(text, text, text, text, text, text, timestamptz, timestamptz)',
    'public.crear_cambio_nucleo(text, text, text, text, text, text, timestamptz, timestamptz, boolean, uuid, boolean)',
    'public.actualizar_cambio_nucleo(uuid, text, text, text, text, text, text, timestamptz, timestamptz, uuid, boolean)',
    'public.transicionar_cambio_nucleo(uuid, text, text, uuid, boolean)',
    'public.aprobar_cambio_nucleo(uuid, text, uuid, boolean)',
    'public.rechazar_cambio_nucleo(uuid, text, uuid, boolean)',
    'public.vincular_cambio_ticket_nucleo(uuid, uuid, uuid, boolean)',
    'public.desvincular_cambio_ticket_nucleo(uuid, uuid, uuid, boolean)',
    'public.crear_cambio(text, text, text, text, text, text, timestamptz, timestamptz, boolean)',
    'public.actualizar_cambio(uuid, text, text, text, text, text, text, timestamptz, timestamptz)',
    'public.transicionar_cambio(uuid, text, text)',
    'public.aprobar_cambio(uuid, text)',
    'public.rechazar_cambio(uuid, text)',
    'public.vincular_cambio_ticket(uuid, uuid)',
    'public.desvincular_cambio_ticket(uuid, uuid)'
  ] loop
    execute format('alter function %s owner to project_admin', f);
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to project_admin', f);
  end loop;

  foreach f in array array[
    'public.crear_cambio(text, text, text, text, text, text, timestamptz, timestamptz, boolean)',
    'public.actualizar_cambio(uuid, text, text, text, text, text, text, timestamptz, timestamptz)',
    'public.transicionar_cambio(uuid, text, text)',
    'public.aprobar_cambio(uuid, text)',
    'public.rechazar_cambio(uuid, text)',
    'public.vincular_cambio_ticket(uuid, uuid)',
    'public.desvincular_cambio_ticket(uuid, uuid)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Tablas nuevas (esperado: 5 filas, todas con relrowsecurity = true):
--    select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('servicios','cambios','cambio_eventos','cambio_tickets','transiciones_cambio_permitidas') order by relname;
--
-- 2) Catálogo sembrado (esperado: 10 servicios vivos, 14 transiciones):
--    select (select count(*) from public.servicios where deleted_at is null) as servicios, (select count(*) from public.transiciones_cambio_permitidas) as transiciones;
--
-- 3) Columnas servicio_id (esperado: 4 filas, todas nullable = YES) y cambio_id (esperado: 2 filas):
--    select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public' and column_name = 'servicio_id' and table_name in ('categorias_ticket','plataformas','licencias','tipos_equipo') order by table_name;
--    select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public' and column_name = 'cambio_id' and table_name in ('schema_migrations','function_deploys') order by table_name;
--
-- 4) Funciones (esperado: las 7 RPC authenticated=true y anon=false; núcleos e internas authenticated=false y project_admin=true):
--    select p.proname, pg_get_userbyid(p.proowner) as dueno, p.prosecdef, has_function_privilege('authenticated', p.oid, 'execute') as authenticated, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('project_admin', p.oid, 'execute') as project_admin from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like '%cambio%' or p.proname in ('check_tope_servicios','texto_multilinea')) order by p.proname;
--
-- 5) Triggers nuevos (esperado: 6 filas, todos tgenabled = 'O'):
--    select tgrelid::regclass as tabla, tgname, tgenabled from pg_trigger where not tgisinternal and tgname in ('trg_servicios_tope','trg_servicios_updated_at','trg_servicios_trazabilidad','trg_cambios_updated_at','trg_check_transicion_cambio','trg_cambio_eventos_inmutable') order by tgname;
--
-- 6) Los clientes no escriben cambios (esperado: ins=false, upd=false, del=false; anon sin select) y sí el catálogo de servicios (RLS lo limita al JEFE):
--    select has_table_privilege('authenticated', 'public.cambios', 'insert') as ins, has_table_privilege('authenticated', 'public.cambios', 'update') as upd, has_table_privilege('authenticated', 'public.cambios', 'delete') as del, has_table_privilege('anon', 'public.cambios', 'select') as anon_sel;
--
-- 7) Policies (esperado: SELECT con puede_actual('modulo:tickets') en cambios, cambio_eventos y cambio_tickets; INSERT/UPDATE/DELETE con rol:jefe en servicios):
--    select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename in ('servicios','cambios','cambio_eventos','cambio_tickets','transiciones_cambio_permitidas') order by tablename, cmd;
--
-- 8) Las vistas son security_invoker y responden (esperado: reloptions con security_invoker=true; 3 filas en el KPI):
--    select relname, reloptions from pg_class where relnamespace = 'public'::regnamespace and relname in ('v_kpi_cambios','v_cambios_aprobacion_vencida') order by relname;
--    select tipo, total_90d, pct_del_total_90d from public.v_kpi_cambios order by tipo;
--
-- 9) Enlaces de fábrica creados con la columna (informativo: categorías y tipos de equipo con servicio):
--    select (select count(*) from public.categorias_ticket where servicio_id is not null) as categorias_con_servicio, (select count(*) from public.tipos_equipo where servicio_id is not null) as tipos_con_servicio;
--
-- 10) Tracking: scripts/deploy.mjs registra la fila (con --cambio CHG-xxxx rellena cambio_id); si se aplicó a mano:
--     select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '107';
--
-- 11) Autorización end-to-end (cuando existan las cuentas de P0-04): un
--     ASISTENTE activo SIN el módulo 'tickets' que llame .rpc('crear_cambio', ...)
--     debe recibir 42501; con el módulo puede crear y solicitar, pero
--     aprobar_cambio da 42501 y transicionar_cambio(..., 'aprobado') da P0001
--     'Solo un jefe puede aprobar o rechazar un cambio.'. Solo un JEFE
--     inserta o edita filas de servicios.
--
-- ------------------------------------------------------------
-- Después de aplicar (NO forma parte de la migración)
-- ------------------------------------------------------------
-- a) Desplegar el frontend: Cambios (Mesa de ayuda), Configuración › Servicios
--    y el selector de servicio del formulario de categorías de ticket. El
--    frontend lee servicio_id de categorias_ticket: aplicar ANTES la migración.
-- b) El JEFE completa el dueño y el horario de cada servicio y revisa los
--    enlaces de fábrica en Configuración (plataformas y licencias nacen sin
--    servicio).
-- c) Regenerar docs/esquema/snapshot.json (npm run snapshot) en el mismo PR.
-- d) Desde aquí, `node scripts/deploy.mjs migracion ... --cambio CHG-0001`
--    deja constancia del cambio en schema_migrations / function_deploys.
-- e) Sin cambios en edge functions.
-- ============================================================
-- FIN DE MIGRACIÓN 107
-- ============================================================
