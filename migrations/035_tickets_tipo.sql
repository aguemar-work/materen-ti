-- ============================================================
-- MIGRACIÓN 035 — Distinción Incidente / Solicitud de Servicio
-- Depende de: 016 (tickets, categorias_ticket, subcategorias_ticket),
--             017 (nivel_atencion, check_iniciar_completo,
--             evento_ticket_cambios), 025 (nombres actuales de
--             categoría/subcategoría)
--
-- Contexto (auditoría ITIL v4, jul 2026): la tabla `tickets` no distinguía
-- si un ticket era un incidente (algo roto) o una solicitud de servicio
-- (algo pedido) — hallazgo Crítico #1. Sin esa distinción no se puede
-- calcular ninguna métrica ITIL estándar por separado (MTTR de incidentes,
-- cumplimiento de solicitudes) ni con los datos ya guardados.
--
-- Diseño (decidido con el JEFE):
--   - `subcategorias_ticket.tipo_sugerido`: clasificación POR DEFECTO del
--     catálogo. No se agrega a nivel `categorias_ticket`: ninguna de las 5
--     categorías actuales es uniformemente incidente o solicitud — la
--     granularidad real está en la subcategoría.
--   - `tickets.tipo`: el valor real de ESE ticket puntual, precargado desde
--     el `tipo_sugerido` de su subcategoría al crear (edge function
--     `tickets`, fuera de esta migración) pero editable después por staff.
--   - Ambas columnas NULLABLE a nivel de esquema — mismo patrón que
--     `nivel_atencion` (mig. 017): un CHECK no puede exigir un valor sin
--     mentir en los casos ambiguos. La obligatoriedad real la impone
--     `check_iniciar_completo()`: un ticket no puede pasar a `en_progreso`
--     sin `tipo` clasificado, igual que ya exige `nivel_atencion`+
--     `asignado_a`. Esto no bloquea la creación pública ni le pide nada
--     nuevo al empleado — `tipo` es tan invisible para él como
--     `nivel_atencion`.
--   - Tres subcategorías quedan sin `tipo_sugerido` a propósito (NULL):
--     "Accesorio dañado o faltante" y "Seguridad (virus/malware) o backup"
--     mezclan ambos tipos en su propio nombre, y "Otro" es el catch-all sin
--     ninguna señal. Forzar un default ahí mentiría en 1 de cada 2 casos.
--
-- Backfill retroactivo (63 tickets reales al 2026-07-31):
--   - 44 tickets (70%) se derivan solos del `tipo_sugerido` de su
--     subcategoría (UPDATE masivo más abajo).
--   - 19 tickets no tenían una subcategoría con default confiable. Se leyó
--     título y descripción de cada uno para clasificarlo a mano (mismo
--     criterio que ya usa este proyecto en la migración 025 para renombrar
--     filas puntuales por código). De los 19, 18 se pudieron clasificar con
--     confianza razonable. **TCK-0025 ("ACTUALIZACION DE BITRIX") queda
--     sin clasificar a propósito**: título y descripción son idénticos y
--     no dan ninguna señal real de si es un pedido o un reporte de falla —
--     forzar un valor ahí sería adivinar, no clasificar. Si alguien
--     recuerda el caso, se corrige después con un UPDATE puntual (queda
--     registrado en su hoja de vida igual que cualquier otro cambio de
--     tipo).
--
-- Trazabilidad: se extiende `ticket_eventos_evento_check` con
-- 'tipo_cambiado' y `evento_ticket_cambios()` para loguearlo — mismo
-- mecanismo ya usado para `nivel_atencion_cambiado`. Como el backfill se
-- hace con UPDATE normales (no con INSERT directo a ticket_eventos), cada
-- fila que se clasifica acá queda con su propio evento "De 'sin definir' a
-- 'incidente'/'solicitud'" con la fecha real de esta migración — se ve a
-- simple vista que la clasificación fue retroactiva, sin necesitar una nota
-- aparte.
--
-- Guardas idempotentes: esta migración se aplica con `db query`/
-- `scripts/apply-migration.mjs`, no con `db migrations up` (ver
-- docs/PANORAMA_SISTEMA.md §6 — los 34 archivos de `migrations/` no
-- cumplen el formato de nombre que exige ese subsistema). Sin la
-- atomicidad de transacción por archivo que da `db migrations up`, cada
-- UPDATE de esta migración lleva `AND tipo IS NULL` (o
-- `AND tipo_sugerido IS NULL`): si el CLI se cae a mitad de aplicación,
-- volver a correr el archivo completo desde el principio es seguro — las
-- filas ya clasificadas no vuelven a matchear la guarda, y el trigger
-- tampoco relogea evento porque compara `old.tipo IS DISTINCT FROM
-- new.tipo` antes de escribir.
-- ============================================================


-- ------------------------------------------------------------
-- subcategorias_ticket.tipo_sugerido: default del catálogo
-- ------------------------------------------------------------

alter table public.subcategorias_ticket
  add column if not exists tipo_sugerido text
  check (tipo_sugerido in ('incidente', 'solicitud'));

comment on column public.subcategorias_ticket.tipo_sugerido is
  'Clasificación por defecto para tickets nuevos de esta subcategoría. NULL = ambigua a propósito (ej. "Otro"): el ticket queda sin tipo hasta que staff lo clasifique a mano antes de iniciarlo.';

-- Accesos y Cuentas
update public.subcategorias_ticket set tipo_sugerido = 'solicitud'
  where categoria_id = 'accesos_cuentas' and nombre = 'Restablecer contraseña' and tipo_sugerido is null;
update public.subcategorias_ticket set tipo_sugerido = 'solicitud'
  where categoria_id = 'accesos_cuentas' and nombre = 'Crear cuenta' and tipo_sugerido is null;
update public.subcategorias_ticket set tipo_sugerido = 'incidente'
  where categoria_id = 'accesos_cuentas' and nombre = 'Desbloquear cuenta' and tipo_sugerido is null;
update public.subcategorias_ticket set tipo_sugerido = 'solicitud'
  where categoria_id = 'accesos_cuentas' and nombre = 'Permisos o accesos' and tipo_sugerido is null;

-- Hardware (categoria_id sigue siendo 'equipos', solo el nombre visible cambió en la mig. 025)
update public.subcategorias_ticket set tipo_sugerido = 'incidente'
  where categoria_id = 'equipos' and nombre = 'Equipo no enciende' and tipo_sugerido is null;
update public.subcategorias_ticket set tipo_sugerido = 'incidente'
  where categoria_id = 'equipos' and nombre = 'Equipo lento o con fallas' and tipo_sugerido is null;
update public.subcategorias_ticket set tipo_sugerido = 'solicitud'
  where categoria_id = 'equipos' and nombre = 'Solicitar equipo o accesorio nuevo' and tipo_sugerido is null;
-- 'Accesorio dañado o faltante' queda sin tipo_sugerido a propósito (mezcla dañado/faltante).

-- Software
update public.subcategorias_ticket set tipo_sugerido = 'solicitud'
  where categoria_id = 'software' and nombre = 'Instalar software' and tipo_sugerido is null;
update public.subcategorias_ticket set tipo_sugerido = 'incidente'
  where categoria_id = 'software' and nombre = 'Problema con software o licencia' and tipo_sugerido is null;
update public.subcategorias_ticket set tipo_sugerido = 'solicitud'
  where categoria_id = 'software' and nombre = 'Solicitar licencia nueva' and tipo_sugerido is null;

-- Redes (categoria_id sigue siendo 'red')
update public.subcategorias_ticket set tipo_sugerido = 'incidente'
  where categoria_id = 'red' and nombre = 'Sin internet o WiFi' and tipo_sugerido is null;
update public.subcategorias_ticket set tipo_sugerido = 'incidente'
  where categoria_id = 'red' and nombre = 'VPN no conecta' and tipo_sugerido is null;
update public.subcategorias_ticket set tipo_sugerido = 'incidente'
  where categoria_id = 'red' and nombre = 'Impresora no funciona' and tipo_sugerido is null;

-- Otros (categoria_id sigue siendo 'otro')
-- 'Otro' queda sin tipo_sugerido a propósito (catch-all, sin ninguna señal).
update public.subcategorias_ticket set tipo_sugerido = 'solicitud'
  where categoria_id = 'otro' and nombre = 'Capacitación o consulta' and tipo_sugerido is null;
-- 'Seguridad (virus/malware) o backup' queda sin tipo_sugerido a propósito (mezcla incidente/solicitud).


-- ------------------------------------------------------------
-- tickets.tipo: clasificación real de cada ticket
-- ------------------------------------------------------------

alter table public.tickets
  add column if not exists tipo text
  check (tipo in ('incidente', 'solicitud'));

comment on column public.tickets.tipo is
  'incidente = algo roto; solicitud = algo pedido. Se precarga desde subcategorias_ticket.tipo_sugerido al crear (edge function tickets); editable después por staff. NULL permitido a nivel de esquema (igual que nivel_atencion): la obligatoriedad real la impone check_iniciar_completo() antes de pasar a en_progreso. Nunca visible para el empleado que reporta, igual que nivel_atencion.';

-- Backfill masivo: los tickets cuya subcategoría ya tiene tipo_sugerido
-- heredan ese valor. Cubre 44 de los 63 tickets existentes al 2026-07-31.
update public.tickets t
set tipo = sc.tipo_sugerido
from public.subcategorias_ticket sc
where t.subcategoria_id = sc.id
  and sc.tipo_sugerido is not null
  and t.tipo is null;


-- ------------------------------------------------------------
-- Hoja de vida: agregar 'tipo_cambiado' como evento válido
-- ------------------------------------------------------------

alter table public.ticket_eventos drop constraint if exists ticket_eventos_evento_check;
alter table public.ticket_eventos add constraint ticket_eventos_evento_check
  check (evento in (
    'creado', 'reasignado', 'estado_cambiado', 'prioridad_cambiada',
    'nivel_atencion_cambiado', 'tipo_cambiado', 'correo_fallido',
    'encuesta_enviada', 'encuesta_respondida'
  ));

create or replace function public.evento_ticket_cambios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado is distinct from new.estado then
    perform public.log_evento_ticket(new.id, 'estado_cambiado',
      'De "' || old.estado || '" a "' || new.estado || '"');
  end if;
  if old.prioridad is distinct from new.prioridad then
    perform public.log_evento_ticket(new.id, 'prioridad_cambiada',
      'De "' || old.prioridad || '" a "' || new.prioridad || '"');
  end if;
  if old.nivel_atencion is distinct from new.nivel_atencion then
    perform public.log_evento_ticket(new.id, 'nivel_atencion_cambiado',
      'De "' || coalesce(old.nivel_atencion, 'sin definir') || '" a "' || coalesce(new.nivel_atencion, 'sin definir') || '"');
  end if;
  if old.tipo is distinct from new.tipo then
    perform public.log_evento_ticket(new.id, 'tipo_cambiado',
      'De "' || coalesce(old.tipo, 'sin definir') || '" a "' || coalesce(new.tipo, 'sin definir') || '"');
  end if;
  if old.asignado_a is distinct from new.asignado_a then
    perform public.log_evento_ticket(new.id, 'reasignado', null);
  end if;
  return new;
end;
$$;


-- ------------------------------------------------------------
-- Iniciar (abierto -> en_progreso) exige también tipo clasificado
-- ------------------------------------------------------------

create or replace function public.check_iniciar_completo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'en_progreso' and old.estado is distinct from 'en_progreso' then
    if new.nivel_atencion is null then
      raise exception 'Para iniciar un ticket hay que asignar un nivel de atención (N1/N2/N3).';
    end if;
    if new.asignado_a is null then
      raise exception 'Para iniciar un ticket hay que asignarlo a un miembro del staff.';
    end if;
    if new.tipo is null then
      raise exception 'Para iniciar un ticket hay que clasificarlo como incidente o solicitud.';
    end if;
  end if;
  return new;
end;
$$;


-- ------------------------------------------------------------
-- Backfill manual: 19 tickets sin subcategoría con default confiable
-- (clasificados a mano por título/descripción, 2026-07-31). Cada UPDATE
-- lleva su propia guarda "and tipo is null" — reanudar esta migración
-- después de una caída a mitad de aplicación es seguro, sin duplicar
-- eventos ni pisar una corrección manual hecha entre intentos.
-- ------------------------------------------------------------

update public.tickets set tipo = 'incidente' where codigo = 'TCK-0037' and tipo is null; -- TECLA Z SE SALIO DE TECLADO DE LAPTOP
update public.tickets set tipo = 'incidente' where codigo = 'TCK-0015' and tipo is null; -- Contasis en demo — "no puedo ingresar al contasis"
update public.tickets set tipo = 'incidente' where codigo = 'TCK-0018' and tipo is null; -- No abre el bitrix
update public.tickets set tipo = 'incidente' where codigo = 'TCK-0060' and tipo is null; -- NO RECIBO LOS CORREOS QUE ME ENVIA EL AREA DE CAPITAL HUMANO
update public.tickets set tipo = 'incidente' where codigo = 'TCK-0043' and tipo is null; -- NO RECIBO LOS CORREOS QUE ME ENVIA EL AREA DE CAPITAL HUMANO
update public.tickets set tipo = 'incidente' where codigo = 'TCK-0027' and tipo is null; -- SE TIENE PROBLEMAS CON LA IMPRESORA
update public.tickets set tipo = 'incidente' where codigo = 'TCK-0053' and tipo is null; -- LA IMPRESORA NO FUNCIONA
update public.tickets set tipo = 'incidente' where codigo = 'TCK-0047' and tipo is null; -- no puedo tomar captura y tampoco usar el buscador en la PC
update public.tickets set tipo = 'incidente' where codigo = 'TCK-0069' and tipo is null; -- Problemas con el micrófono de los auriculares
update public.tickets set tipo = 'incidente' where codigo = 'TCK-0059' and tipo is null; -- CORREO SOSPECHOSO
update public.tickets set tipo = 'incidente' where codigo = 'TCK-0044' and tipo is null; -- INTERRUPCION — "al abrir el PDF sale un aviso y al cerrarlo se cierra el PDF"

update public.tickets set tipo = 'solicitud' where codigo = 'TCK-0065' and tipo is null; -- instalara progrma
update public.tickets set tipo = 'solicitud' where codigo = 'TCK-0062' and tipo is null; -- ME PUEDEN ENVIAR IMAGENES DE MI SALIDA
update public.tickets set tipo = 'solicitud' where codigo = 'TCK-0035' and tipo is null; -- ME PUEDEN ENVIAR IMAGENES DE MI SALIDA
update public.tickets set tipo = 'solicitud' where codigo = 'TCK-0033' and tipo is null; -- SOLICITUD DE CODIGO DE LAPTOP
update public.tickets set tipo = 'solicitud' where codigo = 'TCK-0030' and tipo is null; -- Requiero firma eléctronica
update public.tickets set tipo = 'solicitud' where codigo = 'TCK-0041' and tipo is null; -- ACTUALIZAR PDF
update public.tickets set tipo = 'solicitud' where codigo = 'TCK-0036' and tipo is null; -- INSTALACION DE MEET Y ACTIVAR LA OPCION DE RECUPERAR CORREO

-- TCK-0025 ("ACTUALIZACION DE BITRIX") queda sin clasificar a propósito:
-- título y descripción son idénticos, sin ninguna señal real de si es un
-- pedido o un reporte de falla. No se adivina.

-- ============================================================
-- FIN DE MIGRACIÓN 035
-- ============================================================
