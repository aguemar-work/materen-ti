-- ============================================================
-- MIGRACIÓN 100 — Integridad concurrente, CHECKs y trazabilidad
-- Depende de: 002 (cuentas, empleados), 009 (marcar_rotacion_pendiente),
--   011 (topes de licencia), 013/014 (asignaciones_equipo), 026/029/045/048/
--   054 (notify_* y crear_notificacion), 033 (problemas, check_problema_cierre),
--   041 (check_reutilizable_exclusividad), 043 (encuestas), 050 (patrón de
--   transiciones), 069/070 (schema_migrations, function_deploys), 085
--   (sync de disponibilidad de equipos), 099 (puede_actual)
--
-- Plan de mejora Ciclo 21, §4 "100 — Integridad concurrente y CHECKs"
-- (docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md) y anexo D §8. Doce cambios
-- independientes, una sección por cambio, todos idempotentes:
--
--    1) Índice único parcial: un equipo, un portador activo.
--    2) Topes de licencia/cuenta y exclusividad de cuenta con FOR UPDATE.
--    3) set_created_updated_by() / equipos: el efecto en cascada de la
--       disponibilidad (085) ya no pisa updated_by/updated_at.
--    4) asignaciones_equipo.motivo_cierre: normalización + CHECK.
--    5) equipos.fotos: CHECK de tope (4).
--    6) empleados.dni: CHECK de formato.
--    7) cuentas: el servidor decide last_password_change/requiere_rotacion.
--    8) encuestas / encuesta_rondas: created_by por trigger.
--    9) realtime.publish() ya no puede tumbar la escritura de negocio.
--   10) problemas: whitelist de transiciones de estado (patrón 050).
--   11) Trazabilidad de despliegue: commit_sha y entorno.
--
-- Datos de producción verificados (SELECT, 2026-10-01) ANTES de escribir:
--   - asignaciones_equipo: 267 filas, 228 activas, 0 equipos con más de un
--     portador activo → el índice único se crea sin riesgo.
--   - motivo_cierre en filas cerradas: baja_empleado 7, devolucion 20,
--     'entrega a empleado' 11 (con espacios), movimiento 1; NULL solo en las
--     228 activas → una sola normalización ('entrega a empleado' →
--     'entrega_a_empleado') y el CHECK nace validado.
--   - equipos.fotos: ningún equipo con más de 4 fotos, todas arreglos JSON.
--   - empleados.dni: 100 filas, 1 NO cumple '^[0-9]{8}$' (9 dígitos; el dueño confirmó el 2026-10-02
--     que el DNI es solo de 8 dígitos: es un error de digitación a corregir; el CHECK nace NOT VALID, ver 6).
--   - problemas: 1 fila, estado 'abierto'.
--
-- ⚠️ DESPLIEGUE EN ORDEN (acoplamiento con el frontend):
--   * Sección 4: el frontend escribía 'entrega a empleado' (con espacios) en
--     frontend/src/api/domains/equipos.js (asignarEquipo). Desde esta
--     migración eso viola el CHECK y "Asignar a persona un equipo que estaba
--     en una ubicación" falla. DESPLEGAR PRIMERO el frontend que escribe
--     'entrega_a_empleado' y recién después aplicar la 100. El CHECK incluye
--     además 'cambio_equipo', que la UI de Equipos ya ofrece (Devolución >
--     Motivo) y no figuraba en la lista del plan.
--   * Sección 7: el cliente deja de ser la autoridad; puede seguir mandando
--     last_password_change/requiere_rotacion (se ignoran), pero conviene
--     quitarlos del frontend.
--   * Sección 1: una colisión concurrente ahora lanza 23505 con la restricción
--     'asignaciones_equipo_una_activa'; conviene mapearla en
--     frontend/src/api/erroresDb.js con un mensaje legible.
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/apply-migration.mjs` o `db import`, NUNCA `db query` a mano. Si
-- `db import` crashea, partir en archivos temporales por sección; el archivo
-- único en migrations/ sigue siendo la fuente de verdad. Correr SIEMPRE el
-- bloque "Verificación" del final.
--
-- Rollback: migrations/rollback/100_rollback.sql (la normalización de datos
-- de la sección 4 no se revierte; ver ese archivo).
-- ============================================================


-- ============================================================
-- 1) asignaciones_equipo: un equipo, un solo portador activo
-- Hallazgo (013:253-258, anexo D §8): check_asignacion_equipo() cuenta las
-- asignaciones activas con count(*) sin bloqueo; dos INSERT concurrentes
-- pasaban ambos la verificación y dejaban dos portadores activos. El índice
-- único parcial lo impide a nivel de motor; el trigger se conserva porque da
-- el mensaje legible en el caso normal (no concurrente).
-- Si existieran duplicados NO se crea (se avisa con un WARNING): resolverlos
-- cerrando la asignación sobrante y reaplicar esta sección.
-- ============================================================

do $$
begin
  if exists (
    select 1 from public.asignaciones_equipo
     where fecha_fin is null
     group by equipo_id
    having count(*) > 1
  ) then
    raise warning 'asignaciones_equipo_una_activa NO se creó: hay equipos con más de un portador activo. Cierre las asignaciones sobrantes y reaplique la sección 1 de la migración 100.';
  else
    create unique index if not exists asignaciones_equipo_una_activa
      on public.asignaciones_equipo (equipo_id)
      where fecha_fin is null;
  end if;
end $$;

comment on index public.asignaciones_equipo_una_activa is
  'Un equipo solo puede tener una asignación activa (fecha_fin null). Cierra la carrera de check_asignacion_equipo (count(*) sin bloqueo). Migración 100.';


-- ============================================================
-- 2) Topes y exclusividad bajo bloqueo de fila
-- Hallazgo (011:131-148, 011:178-195, 041:25-37, anexo D §8): los tres
-- triggers cuentan con count(*) y luego insertan; dos INSERT concurrentes
-- sobre la misma licencia/cuenta veían ambos "hay cupo". Se serializa con un
-- `perform 1 ... for update` sobre la fila "dueña" del recurso al inicio del
-- trigger: la segunda transacción espera, y su count(*) posterior (READ
-- COMMITTED toma snapshot nuevo por sentencia) ya ve la inserción de la
-- primera.
-- Cuerpos = copia EXACTA de las definiciones vigentes en producción
-- (pg_get_functiondef, 2026-10-01), agregando SOLO el bloqueo (y, en
-- check_tope_licencia_cuenta, el orden determinista). Los mensajes de error
-- no se tocan: frontend/src/api/erroresDb.js puede depender de ellos.
-- ============================================================

create or replace function public.check_reutilizable_exclusividad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo varchar;
  v_activas int;
begin
  -- Serializa las altas concurrentes sobre la misma cuenta.
  perform 1 from public.cuentas where id = new.cuenta_id for update;

  select tipo_cuenta into v_tipo from public.cuentas where id = new.cuenta_id;

  if v_tipo in ('reutilizable', 'personal') then
    select count(*) into v_activas
    from public.asignaciones_cuenta
    where cuenta_id = new.cuenta_id
      and fecha_fin is null;

    if v_activas > 0 then
      raise exception
        'Esta cuenta ya tiene una asignación activa. Cierra la asignación actual antes de crear una nueva.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.check_tope_licencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cantidad int;
  v_activas  int;
begin
  -- Serializa las altas concurrentes sobre la misma licencia.
  perform 1 from public.licencias
   where id = new.licencia_id and deleted_at is null
     for update;

  select cantidad into v_cantidad
  from public.licencias
  where id = new.licencia_id and deleted_at is null;

  if v_cantidad is null then
    raise exception 'La licencia no existe o está eliminada.';
  end if;

  select count(*) into v_activas
  from public.asignaciones_licencia
  where licencia_id = new.licencia_id and fecha_fin is null;

  if v_activas >= v_cantidad then
    raise exception
      'La licencia ya usa todos sus asientos (%). Libera uno antes de asignar.', v_cantidad;
  end if;

  return new;
end;
$$;

-- Una cuenta puede ser el login de MÁS DE UNA licencia (licencias.cuenta_id
-- no es único). Antes el tope salía de un `limit 1` sin orden (arbitrario);
-- ahora se toma el tope MÁS RESTRICTIVO (la menor cantidad) y, para evitar
-- interbloqueos, se bloquean todas esas licencias en un orden fijo (id).
create or replace function public.check_tope_licencia_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cantidad int;
  v_software text;
  v_activas  int;
begin
  perform 1 from public.licencias
   where cuenta_id = new.cuenta_id and deleted_at is null
   order by id
     for update;

  select cantidad, software into v_cantidad, v_software
  from public.licencias
  where cuenta_id = new.cuenta_id and deleted_at is null
  order by cantidad asc, id
  limit 1;

  if v_cantidad is null then
    return new; -- la cuenta no es el login de ninguna licencia
  end if;

  select count(*) into v_activas
  from public.asignaciones_cuenta
  where cuenta_id = new.cuenta_id and fecha_fin is null;

  if v_activas >= v_cantidad then
    raise exception
      'La licencia "%" solo tiene % asiento(s). Libera uno antes de asignar a otra persona.',
      v_software, v_cantidad;
  end if;

  return new;
end;
$$;


-- ============================================================
-- 3) Auditoría de columnas: la cascada derivada no pisa al autor real
-- Hallazgo (085:74-108, anexo D §8): sync_equipo_tiene_asignacion_activa()
-- hace un UPDATE a `equipos` desde un trigger de asignaciones_equipo. Ese
-- UPDATE dispara set_created_updated_by() y set_updated_at() sobre equipos y
-- reescribía updated_by (con auth.uid(), que en una sesión sin usuario es
-- NULL) y updated_at: la hoja de la ficha decía "editado por X, hoy" cuando
-- solo se había devuelto/asignado el equipo.
--
-- Regla: cuando el UPDATE llega anidado (pg_trigger_depth() > 1, o sea lo
-- lanzó OTRO trigger, no una sentencia del usuario) NO es una edición del
-- registro y se conservan updated_by/updated_at de la fila.
--
-- OJO: updated_at lo escribe OTRO trigger (set_updated_at(), función
-- compartida por ~25 tablas; no se toca porque en otras tablas la cascada sí
-- es un cambio real, p.ej. requiere_rotacion en cuentas). Por eso, para
-- `equipos` —la única tabla cuyo UPDATE anidado es puramente derivado— se
-- reemplaza SOLO su trigger de updated_at por una variante que respeta el
-- anidamiento. En el resto de las tablas que usan set_created_updated_by()
-- (cuentas, empleados, empresas, plataformas, licencias, accesos_sensibles,
-- kb_articulos, problemas, acciones_correctivas, equipos_importacion) una
-- cascada conserva updated_by, pero updated_at sigue avanzando.
-- Cuerpo de set_created_updated_by() = copia de la definición vigente
-- (005, verificada en producción), cambiando solo la rama UPDATE.
-- ============================================================

create or replace function public.set_created_updated_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    if pg_trigger_depth() > 1 then
      -- Cascada de otro trigger: no es una edición del usuario.
      new.updated_by := old.updated_by;
      new.updated_at := old.updated_at;
    else
      new.updated_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.set_updated_at_salvo_anidado()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

alter function public.set_updated_at_salvo_anidado() owner to project_admin;

comment on function public.set_updated_at_salvo_anidado() is
  'Como set_updated_at(), pero un UPDATE lanzado por otro trigger (pg_trigger_depth() > 1) conserva updated_at. Solo lo usa equipos (la disponibilidad derivada de 085 no es una edición). Migración 100.';

drop trigger if exists trg_equipos_updated_at on public.equipos;
create trigger trg_equipos_updated_at
  before update on public.equipos
  for each row execute function public.set_updated_at_salvo_anidado();


-- ============================================================
-- 4) asignaciones_equipo.motivo_cierre: normalizar y restringir
-- Hallazgo (013:129-130, equipos.js): texto libre. Valores reales en
-- producción (2026-10-01): baja_empleado, devolucion, movimiento y
-- 'entrega a empleado' (con espacios, escrito por asignarEquipo). Se mapea
-- a snake_case y se restringe al dominio cerrado:
--   devolucion, movimiento, entrega_a_empleado, perdida, robo, baja_equipo,
--   baja_empleado  (lista del plan) + cambio_equipo (ya lo ofrece la UI de
--   Equipos > Devolución, EquiposView.vue; sin él esa opción fallaría).
-- La normalización va DESPUÉS de la sección 3: el UPDATE dispara el trigger
-- de disponibilidad (085) sobre `equipos` y, sin la regla de anidamiento, le
-- reescribiría updated_by/updated_at a los equipos afectados.
-- NO se revierte en el rollback (no se puede distinguir qué filas eran
-- originalmente 'entrega a empleado'; ver rollback/100_rollback.sql).
-- Si tras normalizar quedara algún valor fuera del dominio, el CHECK nace
-- NOT VALID (con un WARNING) para no bloquear la migración; validar luego con
-- `alter table ... validate constraint`.
-- ============================================================

update public.asignaciones_equipo a
   set motivo_cierre = m.nuevo
  from (values
    ('entrega a empleado', 'entrega_a_empleado'),
    ('Entrega a empleado', 'entrega_a_empleado'),
    ('devolución',         'devolucion'),
    ('Devolución',         'devolucion'),
    ('Devolucion',         'devolucion'),
    ('pérdida',            'perdida'),
    ('Pérdida',            'perdida'),
    ('Perdida',            'perdida'),
    ('cambio de equipo',   'cambio_equipo'),
    ('baja del empleado',  'baja_empleado'),
    ('baja de equipo',     'baja_equipo')
  ) as m(viejo, nuevo)
 where a.motivo_cierre = m.viejo;

alter table public.asignaciones_equipo drop constraint if exists asignaciones_equipo_motivo_cierre_check;

do $$
begin
  if exists (
    select 1 from public.asignaciones_equipo
     where motivo_cierre is not null
       and motivo_cierre not in ('devolucion', 'cambio_equipo', 'movimiento', 'entrega_a_empleado',
                                 'perdida', 'robo', 'baja_equipo', 'baja_empleado')
  ) then
    alter table public.asignaciones_equipo add constraint asignaciones_equipo_motivo_cierre_check
      check (motivo_cierre is null or motivo_cierre in (
        'devolucion', 'cambio_equipo', 'movimiento', 'entrega_a_empleado',
        'perdida', 'robo', 'baja_equipo', 'baja_empleado'
      )) not valid;
    raise warning 'asignaciones_equipo_motivo_cierre_check creado NOT VALID: quedan motivos fuera del dominio. Revíselos (select distinct motivo_cierre from asignaciones_equipo) y valide el CHECK.';
  else
    alter table public.asignaciones_equipo add constraint asignaciones_equipo_motivo_cierre_check
      check (motivo_cierre is null or motivo_cierre in (
        'devolucion', 'cambio_equipo', 'movimiento', 'entrega_a_empleado',
        'perdida', 'robo', 'baja_equipo', 'baja_empleado'
      ));
  end if;
end $$;

comment on constraint asignaciones_equipo_motivo_cierre_check on public.asignaciones_equipo is
  'Dominio cerrado de motivos de cierre (snake_case). Migración 100. Si se agrega un motivo nuevo en la UI, ampliar este CHECK en la misma entrega.';


-- ============================================================
-- 5) equipos.fotos: tope de 4 en la base
-- Hallazgo: MAX_FOTOS=4 solo vivía en EquipoForm.vue y en equipos-fotos.ts
-- (esta última con falla abierta ante alta sin fila). Verificado antes: 0
-- equipos con más de 4 fotos y todas las filas son arreglos JSON.
-- AGENTS.md: si cambia el tope, se cambian los TRES (MAX_FOTOS en
-- EquipoForm.vue, MAX_FOTOS_POR_EQUIPO en equipos-fotos.ts y este CHECK).
-- ============================================================

alter table public.equipos drop constraint if exists equipos_fotos_max;
alter table public.equipos add constraint equipos_fotos_max
  check (jsonb_array_length(coalesce(fotos, '[]'::jsonb)) <= 4);

comment on constraint equipos_fotos_max on public.equipos is
  'Tope de fotos por equipo (4). Debe moverse junto con MAX_FOTOS (EquipoForm.vue) y MAX_FOTOS_POR_EQUIPO (functions/equipos-fotos.ts). Migración 100.';


-- ============================================================
-- 6) empleados.dni: formato
-- Plan §3.10: DNI de 8 dígitos; las filas anonimizadas (migración 104/102)
-- llevan 'ANON-<hash>' y siguen siendo únicas. Verificado en producción: de
-- 100 empleados, 1 tiene 9 dígitos (error de digitación: el dueño confirmó que
-- el DNI es solo de 8 dígitos; no se amplía el CHECK) → el CHECK nace NOT VALID: se exige a toda fila NUEVA o
-- MODIFICADA, y las existentes que no cumplan se saltan hasta validar.
--
-- ⚠️ Un CHECK NOT VALID se evalúa igualmente en cada UPDATE de la fila: hasta
-- corregir ese DNI, CUALQUIER edición de ese empleado (incluida su baja) fallará
-- con "empleados_dni_formato". Corregirlo ANTES de aplicar, o inmediatamente
-- después. Para localizarlo:
--   select id, length(dni) as largo from public.empleados
--    where not (dni ~ '^[0-9]{8}$' or dni like 'ANON-%');
-- y luego, ya corregido, `alter table public.empleados validate constraint
-- empleados_dni_formato;`. Si el documento es legítimamente de otro tipo,
-- decidir con el dueño si se amplía el CHECK a '^[0-9]{8,9}$' (§11 del plan).
-- ============================================================

alter table public.empleados drop constraint if exists empleados_dni_formato;

do $$
begin
  if exists (
    select 1 from public.empleados
     where not (dni ~ '^[0-9]{8}$' or dni like 'ANON-%')
  ) then
    alter table public.empleados add constraint empleados_dni_formato
      check (dni ~ '^[0-9]{8}$' or dni like 'ANON-%') not valid;
    raise warning 'empleados_dni_formato creado NOT VALID: hay empleados con DNI fuera de formato. Corrija el dato y ejecute validate constraint.';
  else
    alter table public.empleados add constraint empleados_dni_formato
      check (dni ~ '^[0-9]{8}$' or dni like 'ANON-%');
  end if;
end $$;

comment on constraint empleados_dni_formato on public.empleados is
  '8 dígitos, o ANON-<hash> si el empleado fue anonimizado. Migración 100 (NOT VALID si había datos fuera de formato: validar al corregirlos).';


-- ============================================================
-- 7) cuentas: el servidor decide la antigüedad de la contraseña
-- Hallazgo: password_cambiada y last_password_change/requiere_rotacion se
-- decidían en el CLIENTE (cuentas.js:74-78, correos.js:146-150), así que
-- cualquier cliente (o un UPDATE directo) podía falsear la fecha o limpiar la
-- marca "rotar contraseña". Ahora la autoridad es este trigger:
--   - password cambió → last_password_change = now() (NULL si se borró la
--     contraseña) y requiere_rotacion = false.
--   - password no cambió → last_password_change conserva el valor anterior y,
--     para una sentencia directa del usuario, requiere_rotacion también.
-- EXCEPCIÓN deliberada: marcar_rotacion_pendiente() (009) pone
-- requiere_rotacion = true desde un trigger de asignaciones_cuenta al cerrar
-- una asignación de cuenta reutilizable/compartida SIN cambiar la contraseña;
-- ese UPDATE llega anidado (pg_trigger_depth() > 1) y se deja pasar. Sin esta
-- excepción el trigger lo revertiría y se rompería el flujo de rotación.
-- Ojo: cualquier proceso futuro que reescriba el cifrado de password (re-
-- cifrado por rotación de claves) cuenta como "cambio" y reiniciaría la fecha;
-- si hiciera falta, ese proceso debe correr anidado o aceptar ese efecto.
--
-- licencias.clave / accesos_sensibles.password: NO se crea el equivalente
-- porque esas tablas no tienen last_password_change ni requiere_rotacion
-- (verificado en information_schema el 2026-10-01); no hay nada que mantener.
-- ============================================================

create or replace function public.cuentas_password_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.password is distinct from old.password then
    new.last_password_change := case when new.password is null then null else now() end;
    new.requiere_rotacion := false;
  else
    new.last_password_change := old.last_password_change;
    if pg_trigger_depth() <= 1 then
      new.requiere_rotacion := old.requiere_rotacion;
    end if;
  end if;
  return new;
end;
$$;

alter function public.cuentas_password_cambio() owner to project_admin;

drop trigger if exists trg_cuentas_password_cambio on public.cuentas;
create trigger trg_cuentas_password_cambio
  before update on public.cuentas
  for each row execute function public.cuentas_password_cambio();


-- ============================================================
-- 8) encuestas / encuesta_rondas: created_by por trigger
-- Hallazgo (D-08, anexo D §1): ambas tablas tienen created_by pero ningún
-- trigger lo llena; quedaba a merced del cliente. set_created_by_only()
-- asigna auth.uid() solo en INSERT (verificado: ambas tablas tienen la
-- columna created_by; están vacías hoy, no hay nada que rellenar).
-- ============================================================

drop trigger if exists trg_encuestas_by on public.encuestas;
create trigger trg_encuestas_by
  before insert on public.encuestas
  for each row execute function public.set_created_by_only();

drop trigger if exists trg_encuesta_rondas_by on public.encuesta_rondas;
create trigger trg_encuesta_rondas_by
  before insert on public.encuesta_rondas
  for each row execute function public.set_created_by_only();


-- ============================================================
-- 9) realtime.publish() tolerante a fallos
-- Hallazgo (anexo D §8, 026:9-19, 045, 048): realtime.publish() corre dentro
-- de la transacción de negocio; si el servicio realtime falla, falla la
-- escritura (crear un ticket, cambiar un estado, dar de alta un empleado).
-- La notificación en vivo es accesoria: se envuelve en un subbloque
-- begin ... exception when others ... raise warning ... end. En
-- crear_notificacion la fila de `notificaciones` SÍ se conserva (solo el
-- aviso en vivo se pierde).
-- Cuerpos = copia de las definiciones VIGENTES de producción (pg_get_
-- functiondef, 2026-10-01): notify_list_changed (026), notify_ticket_estado
-- (029), notify_ticket_comentario_publico (029) y crear_notificacion (054,
-- única firma: la sobrecarga ambigua de 048 se eliminó en la 054; aquí se
-- conservan nombres y DEFAULT de parámetros exactamente para que create or
-- replace actualice la misma función). Se incluye notify_ticket_comentario_
-- publico, que el plan no listaba, porque tiene el mismo defecto. Dueño y
-- GRANT no se tocan.
-- ============================================================

create or replace function public.notify_list_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.publish(TG_ARGV[0], 'changed', jsonb_build_object('op', TG_OP));
  exception when others then
    raise warning 'notify_list_changed: no se pudo publicar en realtime (canal %): %', TG_ARGV[0], sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.notify_ticket_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.publish('ticket:' || NEW.token, 'changed', jsonb_build_object('evento', 'estado_changed', 'estado', NEW.estado));
  exception when others then
    raise warning 'notify_ticket_estado: no se pudo publicar en realtime: %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.notify_ticket_comentario_publico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if NEW.interno = false then
    select token into v_token from public.tickets where id = NEW.ticket_id;
    if v_token is not null then
      begin
        perform realtime.publish('ticket:' || v_token, 'changed', jsonb_build_object('evento', 'comentario_nuevo', 'mensaje', NEW.mensaje));
      exception when others then
        raise warning 'notify_ticket_comentario_publico: no se pudo publicar en realtime: %', sqlerrm;
      end;
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.crear_notificacion(
  p_tipo text,
  p_entidad_tipo text,
  p_entidad_id uuid,
  p_titulo text,
  p_url text,
  p_destinatario_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notificaciones (tipo, entidad_tipo, entidad_id, titulo, url_destino, destinatario_id)
  values (p_tipo, p_entidad_tipo, p_entidad_id, p_titulo, p_url, p_destinatario_id)
  returning id into v_id;

  begin
    if p_destinatario_id is null then
      perform realtime.publish(
        'notificaciones:nuevas',
        'changed',
        jsonb_build_object('id', v_id, 'tipo', p_tipo, 'titulo', p_titulo, 'url_destino', p_url)
      );
    else
      perform realtime.publish(
        'notificaciones:usuario:' || p_destinatario_id,
        'changed',
        jsonb_build_object('id', v_id, 'tipo', p_tipo, 'titulo', p_titulo, 'url_destino', p_url)
      );
    end if;
  exception when others then
    raise warning 'crear_notificacion: la notificación % se guardó pero no se pudo publicar en realtime: %', v_id, sqlerrm;
  end;
end;
$$;


-- ============================================================
-- 10) problemas: whitelist de transiciones de estado (patrón 050)
-- Hallazgo: la máquina de estados de un Problema solo vivía en el cliente
-- (ProblemaDetalleView.vue, SIGUIENTE_ESTADO: abierto → diagnostico →
-- acciones → cerrado). Un UPDATE directo podía saltar de 'abierto' a
-- 'cerrado'. Misma solución que tickets (050): tabla de transiciones +
-- trigger default-deny.
--
-- Compatibilidad verificada: la UI solo avanza (abierto→diagnostico→acciones
-- →cerrado), todas permitidas; cualquier UPDATE que no cambie estado no
-- dispara la regla. check_problema_cierre (033) NO se toca y convive: sigue
-- bloqueando el cierre con acciones pendientes/en_progreso (ambos son
-- triggers BEFORE UPDATE OF estado independientes). Las transiciones
-- inversas (retroceder una etapa, reabrir) no tienen botón hoy; se dejan
-- permitidas como en el plan, y reabrir un cerrado exige JEFE.
-- Como en tickets, requiere_jefe se evalúa con es_jefe() (auth.uid()): una
-- conexión administrativa sin sesión no puede reabrir un problema cerrado.
-- ============================================================

create table if not exists public.transiciones_problema_permitidas (
  origen        text    not null,
  destino       text    not null,
  requiere_jefe boolean not null default false,
  primary key (origen, destino)
);

comment on table public.transiciones_problema_permitidas is
  'Whitelist de transiciones de estado válidas para problemas (default-deny). Sin policy de escritura para el cliente: se administra solo por migración. Migración 100.';

insert into public.transiciones_problema_permitidas (origen, destino, requiere_jefe) values
  ('abierto',     'diagnostico', false),
  ('diagnostico', 'acciones',    false),
  ('acciones',    'cerrado',     false),
  ('diagnostico', 'abierto',     false),
  ('acciones',    'diagnostico', false),
  ('cerrado',     'abierto',     true)
on conflict (origen, destino) do update set requiere_jefe = excluded.requiere_jefe;

alter table public.transiciones_problema_permitidas enable row level security;

drop policy if exists "staff con modulo problemas puede ver transiciones permitidas"
  on public.transiciones_problema_permitidas;
create policy "staff con modulo problemas puede ver transiciones permitidas"
  on public.transiciones_problema_permitidas for select
  using (public.puede_actual('modulo:problemas'));

create or replace function public.check_transicion_problema_permitida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regla record;
begin
  if old.estado is distinct from new.estado then
    select * into v_regla from public.transiciones_problema_permitidas
      where origen = old.estado and destino = new.estado;

    if v_regla is null then
      raise exception 'Transición de "%" a "%" no permitida.', old.estado, new.estado;
    end if;

    if v_regla.requiere_jefe and not public.es_jefe() then
      raise exception 'Solo el jefe puede hacer esta transición ("%" a "%").', old.estado, new.estado;
    end if;
  end if;
  return new;
end;
$$;

alter function public.check_transicion_problema_permitida() owner to project_admin;

drop trigger if exists trg_check_transicion_problema_permitida on public.problemas;
create trigger trg_check_transicion_problema_permitida
  before update of estado on public.problemas
  for each row execute function public.check_transicion_problema_permitida();


-- ============================================================
-- 11) Trazabilidad de despliegue
-- schema_migrations / function_deploys (069/070) dicen QUÉ está aplicado y
-- desplegado, pero no DESDE QUÉ COMMIT ni EN QUÉ ENTORNO (producción o un
-- branch de pruebas). function_deploys ya tiene commit_sha (070); se agrega
-- entorno a ambas y commit_sha a schema_migrations. Columnas NULL: las filas
-- históricas quedan sin dato (no se inventa). Las llena scripts/deploy.mjs /
-- apply-migration.mjs (fuera de esta migración).
-- ============================================================

alter table public.schema_migrations add column if not exists commit_sha text;
alter table public.schema_migrations add column if not exists entorno text;
alter table public.function_deploys  add column if not exists entorno text;

comment on column public.schema_migrations.commit_sha is
  'Commit desde el que se aplicó la migración (NULL en las históricas). Migración 100.';
comment on column public.schema_migrations.entorno is
  'Entorno donde se aplicó: produccion o branch (NULL en las históricas). Migración 100.';
comment on column public.function_deploys.entorno is
  'Entorno donde se desplegó la function: produccion o branch (NULL en las históricas). Migración 100.';


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Índice único parcial (esperado: 1 fila):
--    select indexname, indexdef from pg_indexes where indexname = 'asignaciones_equipo_una_activa';
--
-- 2) Bloqueo en los 3 triggers (esperado: las 3 con con_lock=true):
--    select proname, position('for update' in lower(prosrc)) > 0 as con_lock from pg_proc where pronamespace = 'public'::regnamespace and proname in ('check_reutilizable_exclusividad','check_tope_licencia','check_tope_licencia_cuenta') order by proname;
--
-- 3) Regla de anidamiento y trigger de equipos (esperado: depth=true;
--    trg_equipos_updated_at apunta a set_updated_at_salvo_anidado):
--    select position('pg_trigger_depth' in prosrc) > 0 as depth from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_created_updated_by';
--    select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.equipos'::regclass and tgname = 'trg_equipos_updated_at';
--
-- 4) motivo_cierre normalizado y CHECK (esperado: ningún valor con espacios;
--    convalidated=true):
--    select coalesce(motivo_cierre, '<activa>') as motivo, count(*) from public.asignaciones_equipo group by 1 order by 1;
--    select conname, convalidated from pg_constraint where conname = 'asignaciones_equipo_motivo_cierre_check';
--
-- 5) CHECKs de fotos y DNI (esperado: equipos_fotos_max convalidated=true;
--    empleados_dni_formato convalidated=false mientras exista el DNI de 9
--    dígitos, true una vez corregido y validado):
--    select conrelid::regclass as tabla, conname, convalidated from pg_constraint where conname in ('equipos_fotos_max','empleados_dni_formato');
--    select count(*) as dni_fuera_de_formato from public.empleados where not (dni ~ '^[0-9]{8}$' or dni like 'ANON-%');
--
-- 6) Triggers nuevos (esperado: 4 filas):
--    select tgrelid::regclass as tabla, tgname, tgenabled from pg_trigger where tgname in ('trg_cuentas_password_cambio','trg_encuestas_by','trg_encuesta_rondas_by','trg_check_transicion_problema_permitida') order by 1, 2;
--
-- 7) realtime tolerante (esperado: las 4 con tolerante=true):
--    select proname, position('raise warning' in lower(prosrc)) > 0 as tolerante from pg_proc where pronamespace = 'public'::regnamespace and proname in ('notify_list_changed','notify_ticket_estado','notify_ticket_comentario_publico','crear_notificacion') order by proname;
--    y que crear_notificacion sigue con UNA sola firma y sin EXECUTE a authenticated:
--    select p.oid::regprocedure, has_function_privilege('authenticated', p.oid, 'execute') as authenticated from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'crear_notificacion';
--
-- 8) Transiciones de problemas (esperado: 6 filas):
--    select origen, destino, requiere_jefe from public.transiciones_problema_permitidas order by origen, destino;
--
-- 9) Columnas de trazabilidad (esperado: 3 filas):
--    select table_name, column_name from information_schema.columns where table_schema = 'public' and ((table_name = 'schema_migrations' and column_name in ('commit_sha','entorno')) or (table_name = 'function_deploys' and column_name = 'entorno')) order by 1, 2;
--
-- 10) Tracking: scripts/apply-migration.mjs registra la fila solo; si se
--     aplicó a mano con `db import`, registrarla y verificar:
--     select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '100';
-- ============================================================
-- FIN DE MIGRACIÓN 100
-- ============================================================
