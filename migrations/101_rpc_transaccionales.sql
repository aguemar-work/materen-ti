-- ============================================================
-- MIGRACIÓN 101 — RPC transaccionales de cuentas, equipos y licencias +
-- auditoría CRUD de cuentas + eventos de equipo ampliados
-- Depende de: 099 (puede/puede_actual/exigir_permiso: guard 42501),
--   100 (asignaciones_equipo_una_activa, CHECK de motivo_cierre,
--   cuentas_password_cambio), 086 (revocar_cuenta_personal en hora de Lima,
--   CHECK de formato cifrado), 077 (revocar_cuenta_personal), 057
--   (equipos_importacion), 024 (patrón accesos_sensibles_log_evento),
--   013/014/085 (asignaciones y eventos de equipos), 009
--   (marcar_rotacion_pendiente), 039 (uq_cuentas_usuario_plataforma)
--
-- Plan de mejora Ciclo 21, §4 "101 — RPC transaccionales" y §3.6 (etiquetas
-- QR / verificación física) — docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md.
-- Cierra: anexo E §5 ("operaciones multi-escritura sin transacción en
-- cliente": createCuenta 2-3 escrituras, traspasarCuenta 4, moverEquipo/
-- asignarEquipo/devolverEquipo 2-3, ImportarEquiposView 3-4 por fila, correo
-- "al vuelo" de LicenciaForm en 2 pasos), CUENTAS-SIN-AUDITORIA-CRUD y
-- REVOCAR-CUENTA-LOGICA-DUPLICADA (HISTORIAL-AUDITORIAS, Ciclo 13).
--
-- ⚠️⚠️ ADVERTENCIA: ESTA MIGRACIÓN NO ESTÁ APLICADA. Se escribió y revisó en
-- local; no se ejecutó contra ninguna base (ni producción ni branch). Nadie
-- debe aplicarla sin autorización explícita del dueño. Antes de aplicarla,
-- 099 y 100 deben estar aplicadas (usa exigir_permiso, el CHECK de
-- motivo_cierre y cuentas_password_cambio).
--
-- ORDEN DE DESPLIEGUE:
--   1) Aplicar 099 y 100 (100 exige antes el frontend que escribe
--      'entrega_a_empleado'; ver su cabecera).
--   2) Aplicar esta 101 (solo AGREGA funciones, un trigger y amplía un CHECK;
--      el frontend actual sigue funcionando sin cambios: nada existente se
--      quita. Única excepción de comportamiento: sección 8, revocar).
--   3) Desplegar el frontend que reemplaza las escrituras encadenadas por
--      estas RPC (frontend/src/api/domains/{cuentas,equipos,licencias,
--      equiposImportacion}.js) y que mapea los códigos de error.
--   El trigger de auditoría (sección 6) empieza a registrar desde el momento
--   de aplicar la migración, también con el frontend viejo.
--
-- ------------------------------------------------------------
-- TABLA DE FIRMAS (la fuente para escribir el frontend)
-- Todas: language plpgsql, SECURITY DEFINER, search_path=public, owner
-- project_admin, EXECUTE solo a `authenticated`. Se llaman con argumentos
-- NOMBRADOS (SDK: .rpc('nombre', { p_x: ... })); los que tienen `default`
-- pueden omitirse. Fechas de negocio en hora de Lima. Texto de entrada con
-- trim y espacios colapsados (como trimText del cliente).
--
--  RPC                      argumentos (tipo, default)                         retorna                        guard
--  crear_cuenta_asignada    p_plataforma_id text, p_usuario text,              public.asignaciones_cuenta     modulo:correos
--                           p_empleado_id uuid,                                (la asignación creada)
--                           p_password_cifrada text default null,
--                           p_url text default null, p_notas text default null,
--                           p_tipo_cuenta text default 'personal'
--  traspasar_cuenta         p_asignacion_id uuid, p_nuevo_empleado_id uuid,    public.asignaciones_cuenta     modulo:correos
--                           p_notas text default null,                         (la asignación NUEVA)
--                           p_password_cifrada text default null
--  cerrar_asignacion_cuenta p_asignacion_id uuid, p_notas text default null    public.asignaciones_cuenta     modulo:correos
--  asignar_equipo           p_equipo_id uuid, p_empleado_id uuid,              public.asignaciones_equipo     modulo:equipos
--                           p_condicion_entrega text default null              (la asignación creada)
--  devolver_equipo          p_asignacion_id uuid, p_condicion text default     public.equipos                 modulo:equipos
--                           null, p_motivo text default 'devolucion',          (el equipo ya actualizado)
--                           p_a_reparacion boolean default false
--  mover_equipo             p_equipo_id uuid, p_ubicacion_id uuid              public.asignaciones_equipo     modulo:equipos
--                                                                              (la asignación a ubicación)
--  migrar_importacion_equipo   p_fila_id uuid, p_datos jsonb default null      public.equipos                 modulo:equipos
--                                                                              (el equipo creado)
--  migrar_importacion_equipos  p_fila_ids uuid[]                               jsonb                          modulo:equipos
--                           { ok boolean, migrados int,
--                             bloqueados [ {id, codigo, motivo} ] }
--  crear_licencia_con_cuenta   p_licencia jsonb, p_cuenta jsonb default null   public.licencias                modulo:licencias
--                                                                              (la licencia creada)           (+ modulo:correos si p_cuenta)
--  verificar_equipo         p_equipo_id uuid, p_ubicacion_id uuid default      public.eventos_equipo          modulo:equipos
--                           null, p_nota text default null                     (el evento 'verificado')
--  revocar_cuenta_personal  p_asignacion_id uuid  (SIN cambios de firma)       void                           es_staff() + modulo:correos
--
-- Todas rechazan sin permiso con SQLSTATE 42501 ('No autorizado'). Rechazos
-- de negocio: SQLSTATE P0001 con mensaje en español; "no existe": P0002.
-- Los 23505 (uq_cuentas_usuario_plataforma, equipos_codigo_key,
-- uq_equipos_serie, asignaciones_equipo_una_activa) llegan tal cual y
-- api/erroresDb.js ya los traduce.
--
-- Claves de p_datos (migrar_importacion_equipo; todas opcionales, pisan lo
-- guardado en la fila de la bandeja): codigo, tipo_id, marca, modelo, serie,
-- costo, fecha_compra, estado, notas, modo, empleado_id, ubicacion_id.
-- Claves de p_licencia: software*, tipo, cantidad, empresa_id, proveedor,
-- fecha_vencimiento, renovacion_meses, costo, moneda, cuenta_id, clave
-- (YA cifrada, prefijo enc2:), notas. Claves de p_cuenta: plataforma_id*,
-- usuario*, password (YA cifrada), url, notas, tipo_cuenta ('compartida' por
-- defecto; solo 'compartida' o 'reutilizable'). La cuenta nueva queda SIN
-- asignación (como createCorreo) y se vincula a la licencia como su login.
-- Si llegan p_cuenta y p_licencia.cuenta_id a la vez, se rechaza.
-- Límite: migrar_importacion_equipos acepta hasta 100 filas por llamada.
--
-- ------------------------------------------------------------
-- DISEÑO — por qué cada RPC tiene un "núcleo" (<nombre>_nucleo)
-- La conexión de los tests de BD (project_admin, sin auth.uid()) no puede
-- simular una sesión de staff (el CLI prohíbe SET/set_config). Cada RPC
-- pública es UN guard (exigir_permiso) + una llamada a su función núcleo,
-- que contiene TODA la lógica. Los núcleos tienen EXECUTE solo para
-- project_admin (nunca para authenticated/anon), así que el cliente no puede
-- saltarse el guard; tests/db/triggers.test.sql ejerce los núcleos (caso
-- feliz y rechazos) y las RPC públicas (rechazo 42501 sin sesión). Mismo
-- patrón que puede() / puede_actual() de la 099. Funciones de apoyo
-- (también solo project_admin): texto_limpio, cuenta_insertar_validada,
-- importacion_motivo_bloqueo.
--
-- Otros cambios de esta migración:
--   5) eventos_equipo.evento: se amplía el CHECK con 'verificado',
--      'acta_adjuntada' y 'recepcion_confirmada' (conserva los 4 vigentes
--      leídos del catálogo de producción el 2026-10-01: registrado, asignado,
--      devuelto, estado_cambiado). Las migraciones 102/103/110 suponen que
--      esta 101 lo amplió.
--   6) Trigger cuentas_log_evento: CRUD de `cuentas` → accesos_log
--      (creado / editado / eliminado), nunca la contraseña.
--   8) revocar_cuenta_personal delega el cierre de la asignación en
--      cerrar_asignacion_cuenta (misma firma y mismo efecto).
--
-- Datos de producción verificados (SELECT, 2026-10-01): 340 equipos vivos
-- (314 operativos), 0 filas en equipos_importacion, 177 cuentas vivas (35
-- borradas) y 142 asignaciones de cuenta activas, 9 licencias, 879 filas en
-- accesos_log (creado 62 y eliminado 53 son de accesos sensibles, 024),
-- eventos_equipo = registrado 340 / asignado 267 / devuelto 39 /
-- estado_cambiado 32 (ningún valor fuera de los 7 que admite el CHECK nuevo).
--
-- ⚠️ Cómo aplicar (docs/GOTCHAS-CLI.md): hay cuerpos con dollar-quoting →
-- `scripts/deploy.mjs migracion` o `db import`, NUNCA `db query` a mano. Si
-- `db import` crashea (`Assertion failed ... src\win\async.c`), partir en
-- archivos temporales por sección; el archivo único en migrations/ sigue
-- siendo la fuente de verdad. Correr SIEMPRE el bloque "Verificación" del
-- final. Todo es idempotente (create or replace, drop ... if exists, do
-- condicionales): reaplicar tras un fallo parcial es seguro.
--
-- Rollback: migrations/rollback/101_rollback.sql (la auditoría ya escrita en
-- accesos_log y los eventos 'verificado' ya registrados no se revierten).
-- ============================================================


-- ============================================================
-- 0) Funciones de apoyo (solo project_admin)
-- ============================================================

-- trimText() del cliente: trim, espacios colapsados, vacío = NULL.
create or replace function public.texto_limpio(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select nullif(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), '');
$$;

comment on function public.texto_limpio(text) is
  'Equivale a trimText() del cliente: trim, espacios colapsados y vacío = NULL. Apoyo de las RPC de la 101.';

-- Alta de una cuenta con las validaciones de negocio. La usan
-- crear_cuenta_asignada y crear_licencia_con_cuenta. La contraseña llega YA
-- cifrada (invariante 2 de AGENTS.md; el CHECK de la 086 la exige con prefijo
-- enc/enc2): se rechaza antes con un mensaje legible. last_password_change
-- se fija aquí porque cuentas_password_cambio (100) solo corre en UPDATE.
create or replace function public.cuenta_insertar_validada(
  p_plataforma_id text,
  p_usuario text,
  p_password_cifrada text,
  p_url text,
  p_notas text,
  p_tipo_cuenta text,
  p_tipos_permitidos text[]
)
returns public.cuentas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario  text := nullif(lower(btrim(coalesce(p_usuario, ''))), '');
  v_password text := nullif(p_password_cifrada, '');
  v_tipo     text := coalesce(nullif(btrim(p_tipo_cuenta), ''), p_tipos_permitidos[1]);
  v_cuenta   public.cuentas;
begin
  if v_usuario is null then
    raise exception 'El usuario de la cuenta es obligatorio.' using errcode = 'P0001';
  end if;
  if v_tipo is null or not (v_tipo = any (p_tipos_permitidos)) then
    raise exception 'El tipo de cuenta no es válido.' using errcode = 'P0001';
  end if;
  if v_password is not null and v_password !~ '^enc2?:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' then
    raise exception 'La contraseña debe llegar cifrada. Vuelva a intentarlo.' using errcode = 'P0001';
  end if;
  if p_plataforma_id is null or not exists (
    select 1 from public.plataformas where id = p_plataforma_id and deleted_at is null
  ) then
    raise exception 'La plataforma no existe.' using errcode = 'P0002';
  end if;

  insert into public.cuentas (plataforma_id, usuario, password, last_password_change, url, notas, tipo_cuenta)
  values (
    p_plataforma_id, v_usuario, v_password,
    case when v_password is not null then now() end,
    public.texto_limpio(p_url), public.texto_limpio(p_notas), v_tipo
  )
  returning * into v_cuenta;

  return v_cuenta;
end;
$$;


-- ============================================================
-- 1) Cuentas: crear_cuenta_asignada / traspasar_cuenta /
--    cerrar_asignacion_cuenta
-- ============================================================

-- Reemplaza cuentas.js createCuenta (cuenta + asignación inicial, 2-3
-- escrituras sueltas). Todo o nada. La unicidad usuario+plataforma
-- (uq_cuentas_usuario_plataforma) la hace cumplir el índice: llega 23505.
create or replace function public.crear_cuenta_asignada_nucleo(
  p_plataforma_id text,
  p_usuario text,
  p_empleado_id uuid,
  p_password_cifrada text default null,
  p_url text default null,
  p_notas text default null,
  p_tipo_cuenta text default 'personal'
)
returns public.asignaciones_cuenta
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy    date := (now() at time zone 'America/Lima')::date;
  v_estado text;
  v_cuenta public.cuentas;
  v_asig   public.asignaciones_cuenta;
begin
  select estado::text into v_estado
    from public.empleados where id = p_empleado_id and deleted_at is null;
  if v_estado is null then
    raise exception 'El empleado no existe.' using errcode = 'P0002';
  end if;
  if v_estado = 'Inactivo' then
    raise exception 'El empleado está dado de baja. No se le pueden asignar cuentas.' using errcode = 'P0001';
  end if;

  v_cuenta := public.cuenta_insertar_validada(
    p_plataforma_id, p_usuario, p_password_cifrada, p_url, p_notas,
    p_tipo_cuenta, array['personal', 'reutilizable', 'compartida']
  );

  insert into public.asignaciones_cuenta (cuenta_id, empleado_id, fecha_inicio)
  values (v_cuenta.id, p_empleado_id, v_hoy)
  returning * into v_asig;

  return v_asig;
end;
$$;

-- Reemplaza cuentas.js traspasarCuenta (4 escrituras: si fallaba la 3.ª la
-- cuenta quedaba sin titular). Orden idéntico al del cliente: cerrar la
-- asignación (el trigger marca requiere_rotacion en reutilizable/compartida,
-- regla de marcar_rotacion_pendiente), rotar la contraseña si llegó una
-- (cuentas_password_cambio, 100, fija last_password_change y limpia la marca)
-- y abrir la nueva. Sin contraseña nueva la marca queda activa como aviso.
create or replace function public.traspasar_cuenta_nucleo(
  p_asignacion_id uuid,
  p_nuevo_empleado_id uuid,
  p_notas text default null,
  p_password_cifrada text default null
)
returns public.asignaciones_cuenta
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy      date := (now() at time zone 'America/Lima')::date;
  v_password text := nullif(p_password_cifrada, '');
  v_asig     public.asignaciones_cuenta;
  v_cuenta   public.cuentas;
  v_estado   text;
  v_nueva    public.asignaciones_cuenta;
begin
  if v_password is not null and v_password !~ '^enc2?:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' then
    raise exception 'La contraseña debe llegar cifrada. Vuelva a intentarlo.' using errcode = 'P0001';
  end if;

  select * into v_asig from public.asignaciones_cuenta where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.' using errcode = 'P0002';
  end if;
  if v_asig.fecha_fin is not null then
    raise exception 'La asignación ya está cerrada.' using errcode = 'P0001';
  end if;

  select * into v_cuenta from public.cuentas where id = v_asig.cuenta_id for update;
  if v_cuenta.deleted_at is not null then
    raise exception 'La cuenta está eliminada.' using errcode = 'P0001';
  end if;
  if v_cuenta.tipo_cuenta = 'personal' then
    raise exception 'Una cuenta personal no se traspasa: revóquela y cree una nueva para el otro empleado.' using errcode = 'P0001';
  end if;
  if p_nuevo_empleado_id is not distinct from v_asig.empleado_id then
    raise exception 'La cuenta ya está asignada a ese empleado.' using errcode = 'P0001';
  end if;

  select estado::text into v_estado
    from public.empleados where id = p_nuevo_empleado_id and deleted_at is null;
  if v_estado is null then
    raise exception 'El empleado destino no existe.' using errcode = 'P0002';
  end if;
  if v_estado <> 'Activo' then
    raise exception 'El empleado destino no está activo.' using errcode = 'P0001';
  end if;

  update public.asignaciones_cuenta
     set fecha_fin = v_hoy,
         notas = coalesce(nullif(btrim(p_notas), ''), 'Traspaso a otro empleado')
   where id = v_asig.id;

  if v_password is not null then
    update public.cuentas set password = v_password where id = v_cuenta.id;
  end if;

  insert into public.asignaciones_cuenta (cuenta_id, empleado_id, fecha_inicio)
  values (v_cuenta.id, p_nuevo_empleado_id, v_hoy)
  returning * into v_nueva;

  return v_nueva;
end;
$$;

-- Reemplaza cuentas.js cerrarAsignacion y es la parte común de
-- revocar_cuenta_personal. Si la asignación ya estaba cerrada devuelve la
-- fila sin tocarla (el cliente filtraba `fecha_fin is null` y no fallaba).
-- Sin notas, no pisa las que ya tenía.
create or replace function public.cerrar_asignacion_cuenta_nucleo(
  p_asignacion_id uuid,
  p_notas text default null
)
returns public.asignaciones_cuenta
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy  date := (now() at time zone 'America/Lima')::date;
  v_asig public.asignaciones_cuenta;
begin
  select * into v_asig from public.asignaciones_cuenta where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.' using errcode = 'P0002';
  end if;
  if v_asig.fecha_fin is not null then
    return v_asig;
  end if;

  update public.asignaciones_cuenta
     set fecha_fin = v_hoy,
         notas = coalesce(nullif(btrim(p_notas), ''), notas)
   where id = p_asignacion_id
   returning * into v_asig;

  return v_asig;
end;
$$;


-- ============================================================
-- 2) Equipos: asignar_equipo / devolver_equipo / mover_equipo
-- ============================================================

-- Reemplaza equipos.js asignarEquipo. Mensajes del trigger
-- check_asignacion_equipo (013), sin tuteo. Si el equipo está en una
-- UBICACIÓN se retira de allí con motivo 'entrega_a_empleado'; si lo tiene
-- una persona se rechaza. El índice asignaciones_equipo_una_activa (100)
-- cubre la carrera; el bloqueo de fila del equipo la evita en el caso normal.
create or replace function public.asignar_equipo_nucleo(
  p_equipo_id uuid,
  p_empleado_id uuid,
  p_condicion_entrega text default null
)
returns public.asignaciones_equipo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy    date := (now() at time zone 'America/Lima')::date;
  v_equipo public.equipos;
  v_estado text;
  v_activa public.asignaciones_equipo;
  v_asig   public.asignaciones_equipo;
begin
  select * into v_equipo from public.equipos
   where id = p_equipo_id and deleted_at is null for update;
  if not found then
    raise exception 'El equipo no existe o está eliminado.' using errcode = 'P0002';
  end if;
  if v_equipo.estado <> 'operativo' then
    raise exception 'El equipo % no está operativo (estado: %). No se puede asignar.', v_equipo.codigo, v_equipo.estado
      using errcode = 'P0001';
  end if;

  select estado::text into v_estado
    from public.empleados where id = p_empleado_id and deleted_at is null;
  if v_estado is null then
    raise exception 'El empleado no existe.' using errcode = 'P0002';
  end if;
  if v_estado <> 'Activo' then
    raise exception 'El empleado no está activo. No se le puede entregar un equipo.' using errcode = 'P0001';
  end if;

  select * into v_activa from public.asignaciones_equipo
   where equipo_id = p_equipo_id and fecha_fin is null for update;
  if found then
    if v_activa.empleado_id is not null then
      raise exception 'El equipo % ya tiene un portador activo. Registre la devolución antes de reasignar.', v_equipo.codigo
        using errcode = 'P0001';
    end if;
    update public.asignaciones_equipo
       set fecha_fin = v_hoy, motivo_cierre = 'entrega_a_empleado'
     where id = v_activa.id;
  end if;

  insert into public.asignaciones_equipo (equipo_id, empleado_id, fecha_inicio, condicion_entrega)
  values (p_equipo_id, p_empleado_id, v_hoy, public.texto_limpio(p_condicion_entrega))
  returning * into v_asig;

  return v_asig;
end;
$$;

-- Reemplaza equipos.js devolverEquipo (cierre + cambio de estado). Motivos
-- admitidos: los que ofrece la UI (devolucion, cambio_equipo, baja_empleado,
-- perdida) más 'robo' (del CHECK de la 100). 'perdida' y 'robo' dejan el
-- equipo en 'perdido' y tienen prioridad sobre p_a_reparacion (si ya no está
-- en posesión de la empresa no tiene sentido mandarlo a reparación, igual
-- que hoy). Se cierra ANTES de cambiar el estado: check_baja_equipo_con_
-- portador (080) rechazaría 'perdido' con el portador aún activo.
create or replace function public.devolver_equipo_nucleo(
  p_asignacion_id uuid,
  p_condicion text default null,
  p_motivo text default 'devolucion',
  p_a_reparacion boolean default false
)
returns public.equipos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy    date := (now() at time zone 'America/Lima')::date;
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'devolucion');
  v_asig   public.asignaciones_equipo;
  v_equipo public.equipos;
begin
  if v_motivo not in ('devolucion', 'cambio_equipo', 'baja_empleado', 'perdida', 'robo') then
    raise exception 'El motivo de devolución no es válido.' using errcode = 'P0001';
  end if;

  select * into v_asig from public.asignaciones_equipo where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.' using errcode = 'P0002';
  end if;
  if v_asig.fecha_fin is not null then
    raise exception 'La asignación ya está cerrada.' using errcode = 'P0001';
  end if;
  if v_asig.empleado_id is null then
    raise exception 'La asignación no corresponde a una persona. Use el movimiento de ubicación.' using errcode = 'P0001';
  end if;

  update public.asignaciones_equipo
     set fecha_fin = v_hoy,
         condicion_devolucion = public.texto_limpio(p_condicion),
         motivo_cierre = v_motivo
   where id = p_asignacion_id;

  select * into v_equipo from public.equipos where id = v_asig.equipo_id for update;

  if v_motivo in ('perdida', 'robo') then
    update public.equipos set estado = 'perdido' where id = v_equipo.id;
  elsif coalesce(p_a_reparacion, false) then
    update public.equipos set estado = 'en_reparacion' where id = v_equipo.id;
  end if;

  select * into v_equipo from public.equipos where id = v_equipo.id;
  return v_equipo;
end;
$$;

-- Reemplaza equipos.js moverEquipo. "Si lo tiene una persona, devolver
-- primero" se lanza desde SQL. Si estaba en otra ubicación, esa asignación se
-- cierra con motivo 'movimiento'.
create or replace function public.mover_equipo_nucleo(
  p_equipo_id uuid,
  p_ubicacion_id uuid
)
returns public.asignaciones_equipo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy    date := (now() at time zone 'America/Lima')::date;
  v_equipo public.equipos;
  v_activa public.asignaciones_equipo;
  v_asig   public.asignaciones_equipo;
begin
  select * into v_equipo from public.equipos
   where id = p_equipo_id and deleted_at is null for update;
  if not found then
    raise exception 'El equipo no existe o está eliminado.' using errcode = 'P0002';
  end if;
  if v_equipo.estado <> 'operativo' then
    raise exception 'El equipo % no está operativo (estado: %). No se puede asignar.', v_equipo.codigo, v_equipo.estado
      using errcode = 'P0001';
  end if;
  if p_ubicacion_id is null or not exists (
    select 1 from public.ubicaciones where id = p_ubicacion_id and deleted_at is null
  ) then
    raise exception 'La ubicación no existe.' using errcode = 'P0002';
  end if;

  select * into v_activa from public.asignaciones_equipo
   where equipo_id = p_equipo_id and fecha_fin is null for update;
  if found then
    if v_activa.empleado_id is not null then
      raise exception 'El equipo lo tiene una persona. Registre la devolución antes de moverlo.' using errcode = 'P0001';
    end if;
    update public.asignaciones_equipo
       set fecha_fin = v_hoy, motivo_cierre = 'movimiento'
     where id = v_activa.id;
  end if;

  insert into public.asignaciones_equipo (equipo_id, ubicacion_id, fecha_inicio)
  values (p_equipo_id, p_ubicacion_id, v_hoy)
  returning * into v_asig;

  return v_asig;
end;
$$;


-- ============================================================
-- 3) Importación de equipos: migrar_importacion_equipo(s)
-- ============================================================

-- Reglas de ImportarEquiposView.puedeMigrar + las del servidor. Devuelve el
-- motivo legible (español) por el que la fila NO puede migrarse, o NULL.
-- p_ids_lote: ids del lote en curso (detecta código/serie repetidos entre las
-- filas del propio lote); NULL para la migración individual.
create or replace function public.importacion_motivo_bloqueo(
  p_fila public.equipos_importacion,
  p_ids_lote uuid[] default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := upper(btrim(coalesce(p_fila.codigo, '')));
  v_serie  text := upper(btrim(coalesce(p_fila.serie, '')));
begin
  if v_codigo = '' then
    return 'Falta el código del equipo.';
  end if;
  if p_fila.tipo_id is null or not exists (
    select 1 from public.tipos_equipo where id = p_fila.tipo_id and deleted_at is null
  ) then
    return 'Falta el tipo de equipo.';
  end if;
  if p_fila.estado not in ('operativo', 'en_reparacion', 'de_baja', 'perdido') then
    return 'El estado del equipo no es válido.';
  end if;
  if p_fila.modo not in ('disponible', 'empleado', 'ubicacion') then
    return 'El modo de asignación no es válido.';
  end if;

  -- equipos_codigo_key incluye los equipos eliminados
  if exists (select 1 from public.equipos where upper(codigo) = v_codigo) then
    return 'Ya existe un equipo con el código ' || v_codigo || '.';
  end if;
  if v_serie <> '' and exists (
    select 1 from public.equipos where deleted_at is null and upper(serie) = v_serie
  ) then
    return 'Ya existe un equipo con el número de serie ' || v_serie || '.';
  end if;

  if p_ids_lote is not null then
    if exists (
      select 1 from public.equipos_importacion o
       where o.id = any (p_ids_lote) and o.id <> p_fila.id
         and upper(btrim(coalesce(o.codigo, ''))) = v_codigo
    ) then
      return 'El código ' || v_codigo || ' está repetido en el lote.';
    end if;
    if v_serie <> '' and exists (
      select 1 from public.equipos_importacion o
       where o.id = any (p_ids_lote) and o.id <> p_fila.id
         and upper(btrim(coalesce(o.serie, ''))) = v_serie
    ) then
      return 'El número de serie ' || v_serie || ' está repetido en el lote.';
    end if;
  end if;

  if p_fila.modo <> 'disponible' and p_fila.estado <> 'operativo' then
    return 'Un equipo que no está operativo no puede quedar asignado.';
  end if;
  if p_fila.modo = 'empleado' then
    if p_fila.empleado_id is null then
      return 'Falta elegir al empleado.';
    end if;
    if not exists (
      select 1 from public.empleados
       where id = p_fila.empleado_id and deleted_at is null and estado = 'Activo'
    ) then
      return 'El empleado elegido no está activo.';
    end if;
  elsif p_fila.modo = 'ubicacion' then
    if p_fila.ubicacion_id is null then
      return 'Falta elegir la ubicación.';
    end if;
    if not exists (
      select 1 from public.ubicaciones where id = p_fila.ubicacion_id and deleted_at is null
    ) then
      return 'La ubicación elegida no existe.';
    end if;
  end if;

  return null;
end;
$$;

-- Una fila de la bandeja → equipo (+ asignación según `modo`) y borrado de la
-- fila (el DELETE de equipos_importacion es físico a propósito: la bandeja es
-- un área de trabajo temporal, 057). Orden del cliente: crear (nace
-- 'operativo'), asignar o mover, y recién después cambiar el estado, porque
-- check_asignacion_equipo exige 'operativo' para asignar. El cliente no crea
-- accesorios en la migración, aquí tampoco.
create or replace function public.migrar_importacion_equipo_nucleo(
  p_fila_id uuid,
  p_datos jsonb default null
)
returns public.equipos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila   public.equipos_importacion;
  v_motivo text;
  v_marca  text;
  v_costo  numeric;
  v_equipo public.equipos;
begin
  select * into v_fila from public.equipos_importacion where id = p_fila_id for update;
  if not found then
    raise exception 'La fila ya no está en la bandeja.' using errcode = 'P0002';
  end if;

  -- Correcciones que el formulario aún no había guardado (autoguardado de 700 ms)
  if p_datos is not null and jsonb_typeof(p_datos) = 'object' then
    if (p_datos -> 'codigo') is not null       then v_fila.codigo       := nullif(p_datos->>'codigo', ''); end if;
    if (p_datos -> 'tipo_id') is not null      then v_fila.tipo_id      := nullif(p_datos->>'tipo_id', ''); end if;
    if (p_datos -> 'marca') is not null        then v_fila.marca        := nullif(p_datos->>'marca', ''); end if;
    if (p_datos -> 'modelo') is not null       then v_fila.modelo       := nullif(p_datos->>'modelo', ''); end if;
    if (p_datos -> 'serie') is not null        then v_fila.serie        := nullif(p_datos->>'serie', ''); end if;
    if (p_datos -> 'costo') is not null        then v_fila.costo        := nullif(p_datos->>'costo', '')::numeric; end if;
    if (p_datos -> 'fecha_compra') is not null then v_fila.fecha_compra := nullif(p_datos->>'fecha_compra', '')::date; end if;
    if (p_datos -> 'estado') is not null       then v_fila.estado       := coalesce(nullif(p_datos->>'estado', ''), v_fila.estado); end if;
    if (p_datos -> 'notas') is not null        then v_fila.notas        := nullif(p_datos->>'notas', ''); end if;
    if (p_datos -> 'modo') is not null         then v_fila.modo         := coalesce(nullif(p_datos->>'modo', ''), v_fila.modo); end if;
    if (p_datos -> 'empleado_id') is not null  then v_fila.empleado_id  := nullif(p_datos->>'empleado_id', '')::uuid; end if;
    if (p_datos -> 'ubicacion_id') is not null then v_fila.ubicacion_id := nullif(p_datos->>'ubicacion_id', '')::uuid; end if;
  end if;
  -- Un solo destino, como hace el formulario al cambiar de modo
  if v_fila.modo = 'disponible' then
    v_fila.empleado_id := null; v_fila.ubicacion_id := null;
  elsif v_fila.modo = 'empleado' then
    v_fila.ubicacion_id := null;
  elsif v_fila.modo = 'ubicacion' then
    v_fila.empleado_id := null;
  end if;

  v_motivo := public.importacion_motivo_bloqueo(v_fila, null);
  if v_motivo is not null then
    raise exception '%', v_motivo using errcode = 'P0001';
  end if;

  -- toTitleCase() del cliente: cada palabra con la inicial en mayúscula
  select string_agg(upper(left(w, 1)) || lower(substr(w, 2)), ' ')
    into v_marca
    from unnest(string_to_array(public.texto_limpio(v_fila.marca), ' ')) as w;
  v_costo := v_fila.costo;

  insert into public.equipos (codigo, tipo_id, marca, modelo, serie, fecha_compra, costo, moneda, notas)
  values (
    upper(public.texto_limpio(v_fila.codigo)), v_fila.tipo_id, v_marca,
    public.texto_limpio(v_fila.modelo), public.texto_limpio(v_fila.serie),
    v_fila.fecha_compra, v_costo,
    case when coalesce(v_costo, 0) <> 0 then 'PEN' end,
    public.texto_limpio(v_fila.notas)
  )
  returning * into v_equipo;

  if v_fila.modo = 'empleado' then
    perform public.asignar_equipo_nucleo(v_equipo.id, v_fila.empleado_id, null);
  elsif v_fila.modo = 'ubicacion' then
    perform public.mover_equipo_nucleo(v_equipo.id, v_fila.ubicacion_id);
  end if;

  if v_fila.estado <> 'operativo' then
    update public.equipos set estado = v_fila.estado where id = v_equipo.id;
  end if;

  delete from public.equipos_importacion where id = v_fila.id;

  select * into v_equipo from public.equipos where id = v_equipo.id;
  return v_equipo;
end;
$$;

-- Lote: valida TODAS las filas antes de escribir; con una sola bloqueada no
-- migra ninguna y devuelve la lista con el motivo de cada una (patrón de
-- reasignar_tickets, 093). Hasta 100 filas por llamada (cada fila dispara ~6
-- escrituras con sus triggers; el frontend parte la bandeja en lotes).
create or replace function public.migrar_importacion_equipos_nucleo(p_fila_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids       uuid[];
  v_bloqueados jsonb;
  v_id        uuid;
  v_n         int := 0;
begin
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_fila_ids, '{}'::uuid[])) as x
   where x is not null;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', true, 'migrados', 0, 'bloqueados', '[]'::jsonb);
  end if;
  if cardinality(v_ids) > 100 then
    raise exception 'Migre como máximo 100 equipos por lote.' using errcode = 'P0001';
  end if;

  -- Orden fijo de bloqueo (id) para no interbloquear con otro lote
  perform 1 from public.equipos_importacion where id = any (v_ids) order by id for update;

  select coalesce(jsonb_agg(
           jsonb_build_object('id', b.id, 'codigo', b.codigo, 'motivo', b.motivo)
           order by b.orden), '[]'::jsonb)
    into v_bloqueados
    from (
      select x.id, x.orden, f.codigo,
             case when f.id is null
                  then 'La fila ya no está en la bandeja.'
                  else public.importacion_motivo_bloqueo(f, v_ids)
             end as motivo
        from unnest(v_ids) with ordinality as x(id, orden)
        left join public.equipos_importacion f on f.id = x.id
    ) b
   where b.motivo is not null;

  if jsonb_array_length(v_bloqueados) > 0 then
    return jsonb_build_object('ok', false, 'migrados', 0, 'bloqueados', v_bloqueados);
  end if;

  for v_id in
    select id from public.equipos_importacion where id = any (v_ids) order by created_at, id
  loop
    perform public.migrar_importacion_equipo_nucleo(v_id, null);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'migrados', v_n, 'bloqueados', '[]'::jsonb);
end;
$$;


-- ============================================================
-- 4) Licencias: crear_licencia_con_cuenta
-- ============================================================

-- Reemplaza el flujo de LicenciaForm que crea el correo "al vuelo"
-- (createCorreo + createLicencia en dos pasos: si la segunda fallaba quedaba
-- un correo huérfano). Normaliza como licenciaToRow (perpetua sin vencimiento
-- ni renovación, moneda PEN por defecto si hay costo, cantidad 0 = 1). La
-- cuenta nueva no se asigna a nadie: es el login de la licencia.
create or replace function public.crear_licencia_con_cuenta_nucleo(
  p_licencia jsonb,
  p_cuenta jsonb default null
)
returns public.licencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_con_cuenta boolean := p_cuenta is not null and jsonb_typeof(p_cuenta) <> 'null';
  v_software   text;
  v_tipo       text;
  v_cantidad   int;
  v_costo      numeric;
  v_clave      text;
  v_cuenta_id  uuid;
  v_cuenta     public.cuentas;
  v_lic        public.licencias;
begin
  if p_licencia is null or jsonb_typeof(p_licencia) <> 'object' then
    raise exception 'Los datos de la licencia no son válidos.' using errcode = 'P0001';
  end if;

  v_software := public.texto_limpio(p_licencia->>'software');
  if v_software is null then
    raise exception 'El nombre del software es obligatorio.' using errcode = 'P0001';
  end if;
  v_tipo := coalesce(nullif(btrim(p_licencia->>'tipo'), ''), 'suscripcion');
  if v_tipo not in ('suscripcion', 'perpetua') then
    raise exception 'El tipo de licencia no es válido.' using errcode = 'P0001';
  end if;
  v_cantidad := coalesce(nullif(p_licencia->>'cantidad', '')::int, 0);
  if v_cantidad = 0 then
    v_cantidad := 1;
  end if;
  if v_cantidad < 1 then
    raise exception 'La cantidad de asientos debe ser al menos 1.' using errcode = 'P0001';
  end if;
  v_costo := nullif(p_licencia->>'costo', '')::numeric;
  v_clave := nullif(p_licencia->>'clave', '');
  if v_clave is not null and v_clave !~ '^enc2?:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' then
    raise exception 'La clave debe llegar cifrada. Vuelva a intentarlo.' using errcode = 'P0001';
  end if;
  v_cuenta_id := nullif(p_licencia->>'cuenta_id', '')::uuid;

  if v_con_cuenta then
    if jsonb_typeof(p_cuenta) <> 'object' then
      raise exception 'Los datos de la cuenta no son válidos.' using errcode = 'P0001';
    end if;
    if v_cuenta_id is not null then
      raise exception 'Indique una cuenta existente o una cuenta nueva, no ambas.' using errcode = 'P0001';
    end if;
    v_cuenta := public.cuenta_insertar_validada(
      p_cuenta->>'plataforma_id', p_cuenta->>'usuario', p_cuenta->>'password',
      p_cuenta->>'url', p_cuenta->>'notas', p_cuenta->>'tipo_cuenta',
      array['compartida', 'reutilizable']
    );
    v_cuenta_id := v_cuenta.id;
  elsif v_cuenta_id is not null then
    if not exists (select 1 from public.cuentas where id = v_cuenta_id and deleted_at is null) then
      raise exception 'La cuenta indicada no existe.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.licencias (
    software, tipo, cantidad, empresa_id, proveedor, fecha_vencimiento,
    renovacion_meses, costo, moneda, cuenta_id, clave, notas
  )
  values (
    v_software, v_tipo, v_cantidad,
    nullif(p_licencia->>'empresa_id', '')::uuid,
    public.texto_limpio(p_licencia->>'proveedor'),
    case when v_tipo = 'perpetua' then null else nullif(p_licencia->>'fecha_vencimiento', '')::date end,
    case when v_tipo = 'perpetua' then null else nullif(nullif(p_licencia->>'renovacion_meses', '')::int, 0) end,
    v_costo,
    case when coalesce(v_costo, 0) <> 0
         then coalesce(nullif(btrim(p_licencia->>'moneda'), ''), 'PEN') end,
    v_cuenta_id, v_clave,
    public.texto_limpio(p_licencia->>'notas')
  )
  returning * into v_lic;

  return v_lic;
end;
$$;


-- ============================================================
-- 5) eventos_equipo.evento: amplía el CHECK y verificar_equipo
-- ============================================================

-- Valores vigentes en producción (2026-10-01): registrado, asignado,
-- devuelto, estado_cambiado. Solo se amplía: las filas existentes siempre
-- cumplen, no hace falta NOT VALID. No recomponer esta lista desde una copia
-- vieja (ver la lección de 064/074).
alter table public.eventos_equipo drop constraint if exists eventos_equipo_evento_check;
alter table public.eventos_equipo add constraint eventos_equipo_evento_check
  check (evento in (
    'registrado', 'asignado', 'devuelto', 'estado_cambiado',
    'verificado', 'acta_adjuntada', 'recepcion_confirmada'
  ));

comment on constraint eventos_equipo_evento_check on public.eventos_equipo is
  'Eventos de la hoja de vida. verificado (101, conciliación física con QR), acta_adjuntada (110) y recepcion_confirmada (103) se agregaron en la migración 101; no recomponer esta lista desde una copia vieja.';

-- Conciliación física (§3.6): deja constancia de que alguien vio el equipo,
-- con actor y fecha. NO mueve ni cambia nada del equipo. p_ubicacion_id =
-- dónde se encontró (opcional). Inserta directo (log_evento_equipo devuelve
-- void) con el mismo actor que usa: auth.uid() y su correo.
create or replace function public.verificar_equipo_nucleo(
  p_equipo_id uuid,
  p_ubicacion_id uuid default null,
  p_nota text default null
)
returns public.eventos_equipo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ubicacion text;
  v_email     text;
  v_evento    public.eventos_equipo;
begin
  if not exists (select 1 from public.equipos where id = p_equipo_id and deleted_at is null) then
    raise exception 'El equipo no existe o está eliminado.' using errcode = 'P0002';
  end if;
  if p_ubicacion_id is not null then
    select nombre into v_ubicacion
      from public.ubicaciones where id = p_ubicacion_id and deleted_at is null;
    if not found then
      raise exception 'La ubicación no existe.' using errcode = 'P0002';
    end if;
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.eventos_equipo (equipo_id, evento, detalle, user_id, user_email)
  values (
    p_equipo_id, 'verificado',
    'Verificado físicamente' || coalesce(' en ' || v_ubicacion, '')
      || coalesce(' — ' || public.texto_limpio(p_nota), ''),
    auth.uid(), v_email
  )
  returning * into v_evento;

  return v_evento;
end;
$$;


-- ============================================================
-- 6) Auditoría CRUD de cuentas → accesos_log (trigger cuentas_log_evento)
-- ============================================================
-- Patrón accesos_sensibles_log_evento (024). accesos_log no tiene policy de
-- INSERT para clientes: el trigger es SECURITY DEFINER. Reglas:
--   - NUNCA se escribe la contraseña: solo "contraseña cambiada" como
--     etiqueta. Los valores de usuario/plataforma/tipo (no secretos) sí; de
--     url y notas solo el nombre del campo.
--   - UPDATE de deleted_at (baja lógica) = 'eliminado'; restaurar = 'editado'
--     ("Cuenta restaurada").
--   - Un UPDATE lanzado por otro trigger (pg_trigger_depth() > 1: p. ej.
--     marcar_rotacion_pendiente → requiere_rotacion) no es una edición y no
--     genera fila. Un UPDATE directo sin cambios relevantes (solo
--     updated_at / last_password_change / requiere_rotacion) tampoco.
--   - DELETE físico (solo JEFE por RLS): cuenta_id queda NULL porque el
--     FK accesos_log.cuenta_id → cuentas ya no tiene a quién apuntar; el id
--     va en el detalle.
-- Las acciones 'creado' / 'editado' / 'eliminado' también las usa el trigger
-- de accesos sensibles: las de cuentas se distinguen por cuenta_id (o por el
-- detalle "Cuenta ...") y por `plataforma` = nombre de la plataforma.

create or replace function public.cuentas_log_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email      text;
  v_accion     text;
  v_detalle    text;
  v_cambios    text[] := '{}';
  v_cuenta_id  uuid;
  v_usuario    text;
  v_plataforma text;
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_accion := 'creado';
    v_cuenta_id := new.id; v_usuario := new.usuario; v_plataforma := new.plataforma_id;
    v_detalle := 'Cuenta ' || new.tipo_cuenta || ' creada';
  elsif tg_op = 'UPDATE' then
    v_cuenta_id := new.id; v_usuario := new.usuario; v_plataforma := new.plataforma_id;
    if old.deleted_at is null and new.deleted_at is not null then
      v_accion := 'eliminado';
      v_detalle := 'Cuenta eliminada (baja lógica)';
    elsif old.deleted_at is not null and new.deleted_at is null then
      v_accion := 'editado';
      v_detalle := 'Cuenta restaurada';
    else
      v_accion := 'editado';
      if new.plataforma_id is distinct from old.plataforma_id then
        v_cambios := array_append(v_cambios, 'plataforma (de ' || old.plataforma_id || ' a ' || new.plataforma_id || ')');
      end if;
      if new.usuario is distinct from old.usuario then
        v_cambios := array_append(v_cambios, 'usuario (de ' || old.usuario || ' a ' || new.usuario || ')');
      end if;
      if new.tipo_cuenta is distinct from old.tipo_cuenta then
        v_cambios := array_append(v_cambios, 'tipo (de ' || old.tipo_cuenta || ' a ' || new.tipo_cuenta || ')');
      end if;
      if new.url is distinct from old.url then
        v_cambios := array_append(v_cambios, 'url');
      end if;
      if new.notas is distinct from old.notas then
        v_cambios := array_append(v_cambios, 'notas');
      end if;
      if new.password is distinct from old.password then
        v_cambios := array_append(v_cambios, 'contraseña cambiada');
      end if;
      if cardinality(v_cambios) = 0 then
        return null;
      end if;
      v_detalle := 'Cambios: ' || array_to_string(v_cambios, ', ');
    end if;
  else
    v_accion := 'eliminado';
    v_cuenta_id := null; v_usuario := old.usuario; v_plataforma := old.plataforma_id;
    v_detalle := 'Cuenta eliminada definitivamente (id=' || old.id || ')';
  end if;

  select nombre into v_plataforma from public.plataformas where id = v_plataforma;
  if v_plataforma is null then
    v_plataforma := case when tg_op = 'DELETE' then old.plataforma_id else new.plataforma_id end;
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.accesos_log (user_id, user_email, cuenta_id, cuenta_usuario, plataforma, accion, detalle)
  values (auth.uid(), v_email, v_cuenta_id, v_usuario, v_plataforma, v_accion, v_detalle);

  return null;
end;
$$;

drop trigger if exists trg_cuentas_log_evento on public.cuentas;
create trigger trg_cuentas_log_evento
  after insert or update or delete on public.cuentas
  for each row execute function public.cuentas_log_evento();


-- ============================================================
-- 7) RPC públicas (guard + núcleo)
-- ============================================================

create or replace function public.crear_cuenta_asignada(
  p_plataforma_id text,
  p_usuario text,
  p_empleado_id uuid,
  p_password_cifrada text default null,
  p_url text default null,
  p_notas text default null,
  p_tipo_cuenta text default 'personal'
)
returns public.asignaciones_cuenta
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:correos');
  return public.crear_cuenta_asignada_nucleo(
    p_plataforma_id, p_usuario, p_empleado_id, p_password_cifrada, p_url, p_notas, p_tipo_cuenta
  );
end;
$$;

create or replace function public.traspasar_cuenta(
  p_asignacion_id uuid,
  p_nuevo_empleado_id uuid,
  p_notas text default null,
  p_password_cifrada text default null
)
returns public.asignaciones_cuenta
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:correos');
  return public.traspasar_cuenta_nucleo(p_asignacion_id, p_nuevo_empleado_id, p_notas, p_password_cifrada);
end;
$$;

create or replace function public.cerrar_asignacion_cuenta(
  p_asignacion_id uuid,
  p_notas text default null
)
returns public.asignaciones_cuenta
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:correos');
  return public.cerrar_asignacion_cuenta_nucleo(p_asignacion_id, p_notas);
end;
$$;

create or replace function public.asignar_equipo(
  p_equipo_id uuid,
  p_empleado_id uuid,
  p_condicion_entrega text default null
)
returns public.asignaciones_equipo
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:equipos');
  return public.asignar_equipo_nucleo(p_equipo_id, p_empleado_id, p_condicion_entrega);
end;
$$;

create or replace function public.devolver_equipo(
  p_asignacion_id uuid,
  p_condicion text default null,
  p_motivo text default 'devolucion',
  p_a_reparacion boolean default false
)
returns public.equipos
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:equipos');
  return public.devolver_equipo_nucleo(p_asignacion_id, p_condicion, p_motivo, p_a_reparacion);
end;
$$;

create or replace function public.mover_equipo(
  p_equipo_id uuid,
  p_ubicacion_id uuid
)
returns public.asignaciones_equipo
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:equipos');
  return public.mover_equipo_nucleo(p_equipo_id, p_ubicacion_id);
end;
$$;

create or replace function public.migrar_importacion_equipo(
  p_fila_id uuid,
  p_datos jsonb default null
)
returns public.equipos
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:equipos');
  return public.migrar_importacion_equipo_nucleo(p_fila_id, p_datos);
end;
$$;

create or replace function public.migrar_importacion_equipos(p_fila_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:equipos');
  return public.migrar_importacion_equipos_nucleo(p_fila_ids);
end;
$$;

create or replace function public.crear_licencia_con_cuenta(
  p_licencia jsonb,
  p_cuenta jsonb default null
)
returns public.licencias
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:licencias');
  if p_cuenta is not null and jsonb_typeof(p_cuenta) <> 'null' then
    perform public.exigir_permiso('modulo:correos');
  end if;
  return public.crear_licencia_con_cuenta_nucleo(p_licencia, p_cuenta);
end;
$$;

create or replace function public.verificar_equipo(
  p_equipo_id uuid,
  p_ubicacion_id uuid default null,
  p_nota text default null
)
returns public.eventos_equipo
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_permiso('modulo:equipos');
  return public.verificar_equipo_nucleo(p_equipo_id, p_ubicacion_id, p_nota);
end;
$$;

comment on function public.crear_cuenta_asignada(text, text, uuid, text, text, text, text) is
  'Cuenta + asignación inicial, todo o nada (101). Guard modulo:correos (42501). La contraseña llega cifrada.';
comment on function public.traspasar_cuenta(uuid, uuid, text, text) is
  'Cierra la asignación vigente y abre la nueva al otro empleado; marca rotación según marcar_rotacion_pendiente (101). Rechaza personal. Guard modulo:correos.';
comment on function public.cerrar_asignacion_cuenta(uuid, text) is
  'Cierra una asignación de cuenta con notas opcionales; ya cerrada = sin cambios (101). Guard modulo:correos.';
comment on function public.asignar_equipo(uuid, uuid, text) is
  'Entrega un equipo operativo a una persona; retira la ubicación previa con motivo entrega_a_empleado (101). Guard modulo:equipos.';
comment on function public.devolver_equipo(uuid, text, text, boolean) is
  'Devolución de un equipo; perdida/robo => perdido, p_a_reparacion => en_reparacion (101). Guard modulo:equipos.';
comment on function public.mover_equipo(uuid, uuid) is
  'Mueve un equipo libre o ubicado a otra ubicación; si lo tiene una persona, rechaza (101). Guard modulo:equipos.';
comment on function public.migrar_importacion_equipo(uuid, jsonb) is
  'Fila de la bandeja de importación a equipo (+ asignación) y borrado de la fila, todo o nada (101). Guard modulo:equipos.';
comment on function public.migrar_importacion_equipos(uuid[]) is
  'Lote de la bandeja: valida todo antes de escribir; devuelve {ok, migrados, bloqueados[]} (101). Hasta 100 filas. Guard modulo:equipos.';
comment on function public.crear_licencia_con_cuenta(jsonb, jsonb) is
  'Licencia + correo nuevo opcional como su login, todo o nada (101). Guard modulo:licencias (y modulo:correos si p_cuenta).';
comment on function public.verificar_equipo(uuid, uuid, text) is
  'Registra el evento verificado de un equipo (conciliación física con QR) (101). Guard modulo:equipos.';


-- ============================================================
-- 8) revocar_cuenta_personal delega el cierre en cerrar_asignacion_cuenta
-- Hallazgo REVOCAR-CUENTA-LOGICA-DUPLICADA. Misma firma, mismo dueño, mismos
-- GRANT (create or replace los conserva), sigue SIN ser SECURITY DEFINER. Lo
-- único que cambia es que el cierre de la asignación pasa por la RPC
-- compartida. Diferencias, todas benignas y a propósito:
--   (a) ahora exige modulo:correos con 42501 explícito: antes, sin el
--       módulo, la RLS hacía que ambos UPDATE afectaran 0 filas y la función
--       "terminaba bien" sin hacer nada;
--   (b) una asignación YA cerrada conserva su fecha_fin original (antes se
--       reescribía con la de hoy); la cuenta se da de baja igual;
--   (c) la baja lógica de la cuenta ahora deja fila 'eliminado' en
--       accesos_log (trigger de la sección 6).
-- Cuerpo anterior = 086 sección 4 (America/Lima), verificado idéntico al de
-- producción el 2026-10-01.
-- ============================================================

create or replace function public.revocar_cuenta_personal(p_asignacion_id uuid)
returns void
language plpgsql
as $$
declare
  v_cuenta_id uuid;
  v_tipo_cuenta text;
begin
  if not public.es_staff() then
    raise exception 'No autorizado';
  end if;

  select cuenta_id into v_cuenta_id
  from public.asignaciones_cuenta
  where id = p_asignacion_id;

  if v_cuenta_id is null then
    raise exception 'Asignación no encontrada';
  end if;

  select tipo_cuenta into v_tipo_cuenta
  from public.cuentas
  where id = v_cuenta_id;

  if v_tipo_cuenta is distinct from 'personal' then
    raise exception 'revocar_cuenta_personal solo aplica a cuentas tipo "personal" (usar cerrarAsignacion para compartida/reutilizable)';
  end if;

  -- Parte común: cierre de la asignación (fecha de Lima, 101)
  perform public.cerrar_asignacion_cuenta(p_asignacion_id, null);

  update public.cuentas
  set deleted_at = now()
  where id = v_cuenta_id;
end;
$$;


-- ============================================================
-- 9) Dueño y permisos
-- Todo project_admin; EXECUTE a `authenticated` SOLO en las RPC públicas
-- (nunca en núcleos ni funciones de apoyo, nunca a public/anon).
-- ============================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.texto_limpio(text)',
    'public.cuenta_insertar_validada(text, text, text, text, text, text, text[])',
    'public.crear_cuenta_asignada_nucleo(text, text, uuid, text, text, text, text)',
    'public.traspasar_cuenta_nucleo(uuid, uuid, text, text)',
    'public.cerrar_asignacion_cuenta_nucleo(uuid, text)',
    'public.asignar_equipo_nucleo(uuid, uuid, text)',
    'public.devolver_equipo_nucleo(uuid, text, text, boolean)',
    'public.mover_equipo_nucleo(uuid, uuid)',
    'public.importacion_motivo_bloqueo(public.equipos_importacion, uuid[])',
    'public.migrar_importacion_equipo_nucleo(uuid, jsonb)',
    'public.migrar_importacion_equipos_nucleo(uuid[])',
    'public.crear_licencia_con_cuenta_nucleo(jsonb, jsonb)',
    'public.verificar_equipo_nucleo(uuid, uuid, text)',
    'public.cuentas_log_evento()',
    'public.crear_cuenta_asignada(text, text, uuid, text, text, text, text)',
    'public.traspasar_cuenta(uuid, uuid, text, text)',
    'public.cerrar_asignacion_cuenta(uuid, text)',
    'public.asignar_equipo(uuid, uuid, text)',
    'public.devolver_equipo(uuid, text, text, boolean)',
    'public.mover_equipo(uuid, uuid)',
    'public.migrar_importacion_equipo(uuid, jsonb)',
    'public.migrar_importacion_equipos(uuid[])',
    'public.crear_licencia_con_cuenta(jsonb, jsonb)',
    'public.verificar_equipo(uuid, uuid, text)'
  ] loop
    execute format('alter function %s owner to project_admin', f);
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to project_admin', f);
  end loop;

  foreach f in array array[
    'public.crear_cuenta_asignada(text, text, uuid, text, text, text, text)',
    'public.traspasar_cuenta(uuid, uuid, text, text)',
    'public.cerrar_asignacion_cuenta(uuid, text)',
    'public.asignar_equipo(uuid, uuid, text)',
    'public.devolver_equipo(uuid, text, text, boolean)',
    'public.mover_equipo(uuid, uuid)',
    'public.migrar_importacion_equipo(uuid, jsonb)',
    'public.migrar_importacion_equipos(uuid[])',
    'public.crear_licencia_con_cuenta(jsonb, jsonb)',
    'public.verificar_equipo(uuid, uuid, text)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- ============================================================
-- Verificación — correr DESPUÉS de aplicar (db query, una por línea)
-- ============================================================
-- 1) Las 10 RPC públicas + núcleos + apoyo (esperado: 24 filas con la
--    función de trigger incluida; dueño project_admin; SD salvo texto_limpio):
--    select proname, pg_get_function_identity_arguments(oid) as args, pg_get_userbyid(proowner) as dueno, prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname in ('texto_limpio','cuenta_insertar_validada','crear_cuenta_asignada','crear_cuenta_asignada_nucleo','traspasar_cuenta','traspasar_cuenta_nucleo','cerrar_asignacion_cuenta','cerrar_asignacion_cuenta_nucleo','asignar_equipo','asignar_equipo_nucleo','devolver_equipo','devolver_equipo_nucleo','mover_equipo','mover_equipo_nucleo','importacion_motivo_bloqueo','migrar_importacion_equipo','migrar_importacion_equipo_nucleo','migrar_importacion_equipos','migrar_importacion_equipos_nucleo','crear_licencia_con_cuenta','crear_licencia_con_cuenta_nucleo','verificar_equipo','verificar_equipo_nucleo','cuentas_log_evento') order by proname;
--
-- 2) EXECUTE (esperado: las 10 públicas authenticated=true y anon=false;
--    TODOS los núcleos y funciones de apoyo authenticated=false, anon=false):
--    select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as authenticated, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('project_admin', p.oid, 'execute') as project_admin from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('texto_limpio','cuenta_insertar_validada','crear_cuenta_asignada','crear_cuenta_asignada_nucleo','traspasar_cuenta','traspasar_cuenta_nucleo','cerrar_asignacion_cuenta','cerrar_asignacion_cuenta_nucleo','asignar_equipo','asignar_equipo_nucleo','devolver_equipo','devolver_equipo_nucleo','mover_equipo','mover_equipo_nucleo','importacion_motivo_bloqueo','migrar_importacion_equipo','migrar_importacion_equipo_nucleo','migrar_importacion_equipos','migrar_importacion_equipos_nucleo','crear_licencia_con_cuenta','crear_licencia_con_cuenta_nucleo','verificar_equipo','verificar_equipo_nucleo','cuentas_log_evento') order by 1;
--
-- 3) Cada RPC pública empieza por el guard (esperado: 10 filas con guard=true):
--    select proname, position('exigir_permiso' in prosrc) > 0 as guard from pg_proc where pronamespace = 'public'::regnamespace and proname in ('crear_cuenta_asignada','traspasar_cuenta','cerrar_asignacion_cuenta','asignar_equipo','devolver_equipo','mover_equipo','migrar_importacion_equipo','migrar_importacion_equipos','crear_licencia_con_cuenta','verificar_equipo') order by proname;
--
-- 4) CHECK de eventos_equipo con 7 valores (esperado: convalidated=true):
--    select conname, convalidated, pg_get_constraintdef(oid) from pg_constraint where conname = 'eventos_equipo_evento_check';
--
-- 5) Trigger de auditoría de cuentas (esperado: 1 fila, tgenabled='O'):
--    select tgname, tgenabled from pg_trigger where tgrelid = 'public.cuentas'::regclass and tgname = 'trg_cuentas_log_evento';
--
-- 6) revocar_cuenta_personal delega, conserva firma y GRANT (esperado:
--    delega=true, secdef=false, authenticated=true):
--    select position('cerrar_asignacion_cuenta' in prosrc) > 0 as delega, prosecdef as secdef, has_function_privilege('authenticated', oid, 'execute') as authenticated from pg_proc where pronamespace = 'public'::regnamespace and proname = 'revocar_cuenta_personal';
--
-- 7) Tracking: scripts/deploy.mjs registra la fila solo; si se aplicó a mano:
--    select version, nombre_archivo, aplicada_en from public.schema_migrations where version = '101';
--
-- 8) Funcional sin escribir (cuando existan las cuentas de P0-04): un
--    ASISTENTE activo SIN el módulo 'equipos' que llame
--    .rpc('mover_equipo', {...}) o .rpc('verificar_equipo', {...}) debe
--    recibir 42501; con el módulo, el mismo llamado con ids inexistentes
--    debe recibir P0002.
-- ============================================================
-- FIN DE MIGRACIÓN 101
-- ============================================================
