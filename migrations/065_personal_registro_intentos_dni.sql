-- ============================================================
-- MIGRACIÓN 065 — personal_registro_intentos: límite también por DNI
-- Depende de: 042 (personal_registro_intentos)
--
-- Verificación de auditoría externa (2026-08-17): el rate-limit del
-- formulario público de pre-registro (functions/personal-registro.ts)
-- solo limitaba por IP, compartido entre buscarDni y crear. buscarDni lee
-- nombres/apellidos/celular/correo_personal de un empleado real por DNI
-- (autocompletado) — sin un tope por DNI, alguien podía rotar de IP y
-- seguir extrayendo los datos de una persona concreta sin freno. Mismo
-- criterio ya usado en ticket_busqueda_intentos (migración 017, hallazgo
-- H-02): un segundo límite que no depende de la IP.
-- ============================================================

alter table public.personal_registro_intentos add column if not exists dni text;

create index if not exists idx_personal_registro_intentos_dni_fecha
  on public.personal_registro_intentos (dni, created_at);

comment on column public.personal_registro_intentos.dni is
  'DNI consultado/creado en cada intento (buscarDni o crear). Permite
   frenar la extracción de datos de una persona concreta aunque el
   atacante rote de IP — mismo criterio que ticket_busqueda_intentos
   (migración 017, hallazgo H-02). NULL en filas anteriores a esta
   migración (no se puede reconstruir retroactivamente).';

-- ============================================================
-- FIN DE MIGRACIÓN 065
-- ============================================================
