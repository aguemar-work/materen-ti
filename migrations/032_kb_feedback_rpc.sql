-- ============================================================
-- MIGRACIÓN 032 — kb_articulos: función angosta para "¿Te sirvió?"
-- Depende de: 031 (kb_articulos, es_staff())
--
-- La migración 031 dejaba una política "staff puede votar articulos
-- publicados" con UPDATE amplio (using/with check solo por estado, sin
-- restringir columnas) para no introducir el primer .rpc() del cliente
-- en el proyecto. Al revisarlo con más detalle: eso dejaba abierta la
-- posibilidad de que cualquier staff reescribiera titulo/solucion de un
-- artículo publicado con una llamada directa a la API, no solo el voto.
-- Se corrige con el patrón originalmente planteado: una función
-- SECURITY DEFINER angosta que solo toca util_si/util_no, y se quita la
-- política amplia — el UPDATE directo de kb_articulos vuelve a ser
-- exclusivamente autor (en borrador/en_revision) o JEFE (política de la
-- migración 031, sin cambios).
-- ============================================================

create or replace function public.kb_registrar_feedback(p_articulo_id uuid, p_util boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_staff() then
    raise exception 'No autorizado';
  end if;

  if p_util then
    update public.kb_articulos
      set util_si = util_si + 1
      where id = p_articulo_id
        and estado in ('publicado', 'obsoleto')
        and deleted_at is null;
  else
    update public.kb_articulos
      set util_no = util_no + 1
      where id = p_articulo_id
        and estado in ('publicado', 'obsoleto')
        and deleted_at is null;
  end if;
end;
$$;

comment on function public.kb_registrar_feedback(uuid, boolean) is
  'Incrementa util_si/util_no de un kb_articulo publicado/obsoleto. SECURITY DEFINER de alcance angosto: solo toca esas dos columnas (nunca titulo/solucion/estado/etc), a diferencia de la política amplia que reemplaza.';

-- Dueño explícito (mismo motivo que ticket_token_existe, migración 028):
-- si esta función se llegó a crear con otro rol en algún momento, un
-- CREATE OR REPLACE posterior con el rol normal del proyecto fallaría.
alter function public.kb_registrar_feedback(uuid, boolean) owner to project_admin;

drop policy if exists "staff puede votar articulos publicados" on public.kb_articulos;

-- ============================================================
-- FIN DE MIGRACIÓN 032
-- ============================================================
