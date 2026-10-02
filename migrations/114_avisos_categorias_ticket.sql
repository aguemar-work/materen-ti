-- ============================================================
-- MIGRACIÓN 114 — Aviso fijo al solicitante por categoría / subcategoría de ticket
--
-- Hallazgo (pedido del dueño, 2026-10-02): al elegir ciertas categorías o
-- subcategorías de ticket el formulario debe mostrar una advertencia fija.
-- Ejemplo: «Cámaras › Solicitud de imagen o corto» → «Deberá adjuntar la
-- autorización de gerencia. TI no es responsable del contenido: solo administra
-- el sistema». El texto definitivo no está decidido y cambiará: por eso el aviso
-- es un DATO del catálogo (lo edita quien administra las categorías desde
-- Configuración), no un texto fijo en el código. Hasta hoy el catálogo solo
-- tenía nombre, servicio (107) y tipo sugerido (035): no había dónde guardarlo.
--
-- Qué hace:
--   1) categorias_ticket.aviso text y subcategorias_ticket.aviso text, ambas
--      NULL por defecto (sin aviso), con CHECK: hasta 600 caracteres, nunca en
--      blanco y sin marcas HTML (se renderiza como texto plano; el CHECK impide
--      guardar algo que parezca una etiqueta: `<` seguido de letra, `/`, `!` o `?`).
--   2) Trigger normalizar_aviso_categoria_ticket() (before insert/update en las
--      dos tablas): recorta espacios y guarda NULL cuando queda vacío, así
--      "borrar el aviso" desde la UI es escribir nada, sin lógica en el cliente.
--
-- Regla de resolución (la aplican las pantallas y la edge function `tickets`,
-- acción `catalogo`; no hay función SQL porque ningún SQL la consume):
--   gana el aviso de la SUBCATEGORÍA elegida; si es NULL, el de la CATEGORÍA;
--   si ambos son NULL, no se muestra nada. Fuente única en el frontend:
--   resolverAvisoCategoria() de frontend/src/core/dominio-tickets.js.
--
-- Quién puede editar el aviso — regla VIGENTE, que esta migración NO cambia
-- (leída de pg_policies en producción el 2026-10-02):
--   · categorias_ticket: INSERT/UPDATE exigen puede_actual('modulo:tickets')
--     (099, sección 6): staff activo con el módulo `tickets`, y el JEFE por el
--     atajo de puede(). DELETE físico: es_jefe(). SELECT: es_staff().
--   · subcategorias_ticket: INSERT/UPDATE exigen es_jefe() OR (es_staff() AND
--     tiene_permiso_modulo('tickets')) (082). DELETE físico: es_jefe().
--     SELECT: misma regla que la escritura.
--   En la práctica las dos reglas coinciden: edita el aviso quien tiene el
--   módulo Tickets (JEFE incluido); no es exclusivo del JEFE. El aviso es una
--   columna más de esas filas: hereda esas políticas sin tocarlas. El portal
--   público lo lee por la edge function `tickets` (cliente admin), no por RLS.
--
-- Requiere la 016 (tablas). Idempotente. Rollback: migrations/rollback/114_rollback.sql
-- ============================================================

do $$
begin
  if to_regclass('public.categorias_ticket') is null
     or to_regclass('public.subcategorias_ticket') is null then
    raise exception 'La migración 114 requiere la 016 (categorias_ticket, subcategorias_ticket). Aplíquela primero.';
  end if;
end $$;

-- 1) Columnas (NULL = sin aviso) ---------------------------------------------
alter table public.categorias_ticket    add column if not exists aviso text;
alter table public.subcategorias_ticket add column if not exists aviso text;

-- CHECK: ≤ 600 caracteres, no en blanco, sin marcas HTML. Se recrea para que
-- reaplicar la migración deje exactamente la misma definición.
-- btrim() a secas solo quita espacios: se le pasan también tabulación y saltos
-- de línea (un aviso pegado desde un documento suele terminar en salto de línea).
alter table public.categorias_ticket drop constraint if exists categorias_ticket_aviso_check;
alter table public.categorias_ticket add constraint categorias_ticket_aviso_check
  check (aviso is null or (btrim(aviso, E' \t\r\n') <> '' and char_length(aviso) <= 600 and aviso !~ '<[[:alpha:]/!?]'));

alter table public.subcategorias_ticket drop constraint if exists subcategorias_ticket_aviso_check;
alter table public.subcategorias_ticket add constraint subcategorias_ticket_aviso_check
  check (aviso is null or (btrim(aviso, E' \t\r\n') <> '' and char_length(aviso) <= 600 and aviso !~ '<[[:alpha:]/!?]'));

comment on column public.categorias_ticket.aviso is
  'Advertencia fija que ve el solicitante al elegir esta categoría (114). NULL = sin aviso. La subcategoría, si tiene el suyo, gana. Texto plano ≤ 600 caracteres; el blanco se guarda como NULL (trigger).';
comment on column public.subcategorias_ticket.aviso is
  'Advertencia fija que ve el solicitante al elegir esta subcategoría (114). NULL = hereda el de la categoría. Texto plano ≤ 600 caracteres; el blanco se guarda como NULL (trigger).';

-- 2) Blanco → NULL ------------------------------------------------------------
create or replace function public.normalizar_aviso_categoria_ticket()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Un aviso solo de espacios o saltos de línea es "sin aviso": NULL, para que
  -- la regla de resolución (subcategoría > categoría) no se tape con un blanco.
  new.aviso := nullif(btrim(new.aviso, E' \t\r\n'), '');
  return new;
end;
$$;

alter function public.normalizar_aviso_categoria_ticket() owner to project_admin;

comment on function public.normalizar_aviso_categoria_ticket() is
  'Trigger (114): recorta categorias_ticket.aviso / subcategorias_ticket.aviso y guarda NULL si queda vacío.';

drop trigger if exists trg_categorias_ticket_aviso on public.categorias_ticket;
create trigger trg_categorias_ticket_aviso
  before insert or update on public.categorias_ticket
  for each row execute function public.normalizar_aviso_categoria_ticket();

drop trigger if exists trg_subcategorias_ticket_aviso on public.subcategorias_ticket;
create trigger trg_subcategorias_ticket_aviso
  before insert or update on public.subcategorias_ticket
  for each row execute function public.normalizar_aviso_categoria_ticket();

-- ============================================================
-- Verificación — correr DESPUÉS de aplicar
-- ============================================================
-- 1) Las dos columnas (esperado: 2 filas, data_type = text, is_nullable = YES):
--    select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and column_name = 'aviso' and table_name in ('categorias_ticket','subcategorias_ticket') order by table_name;
-- 2) Los CHECK (esperado: 2 filas con "char_length(aviso) <= 600"):
--    select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('categorias_ticket_aviso_check','subcategorias_ticket_aviso_check') order by 1;
-- 3) Los triggers (esperado: 2 filas, tgenabled = 'O'):
--    select tgrelid::regclass as tabla, tgname, tgenabled from pg_trigger where tgname in ('trg_categorias_ticket_aviso','trg_subcategorias_ticket_aviso') order by 1;
-- 4) Nada cambió en las políticas (esperado: las mismas 8 filas que antes):
--    select tablename, policyname, cmd from pg_policies where tablename in ('categorias_ticket','subcategorias_ticket') order by 1, 2;
-- 5) Las categorías existentes siguen sin aviso (esperado: 0):
--    select count(*) from public.categorias_ticket where aviso is not null;
-- Después de aplicar: desplegar la edge function `tickets` (dist regenerado:
-- la acción `catalogo` devuelve `aviso`) y publicar el frontend. El frontend
-- sin la migración fallaría al pedir la columna: aplicar ANTES la migración.
