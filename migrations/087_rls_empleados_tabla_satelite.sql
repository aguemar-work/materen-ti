-- Cierra el hueco de RLS en la tabla satélite del módulo Empleados que
-- quedó fuera de la migración 068: areas_obras. Esa migración instaló
-- `es_jefe() OR (es_staff() AND tiene_permiso_modulo('X'))` en las tablas
-- principales de Equipos/Licencias/Cuentas, pero nunca tocó `areas_obras`
-- pese a ser satélite exclusivo de Empleados (única consumidora:
-- `EmpleadoForm.vue` y el panel de catálogos de Configuración) — mismo
-- patrón ya encontrado y corregido 4 veces (EQUIPOS-TABLAS-SATELITE-SIN-GATE/
-- 079, CUENTAS-TABLAS-SATELITE-SIN-GATE/081, TICKETS-TABLAS-SATELITE-SIN-GATE/082,
-- PROBLEMAS-TABLAS-SATELITE-SIN-GATE/083 — ver docs/HISTORIAL-AUDITORIAS.md,
-- Ciclo 13, "Patrón transversal", fila "Empleados" marcada como pendiente).
--
-- A diferencia de `empleados` en sí (068: el SELECT queda sin gate porque
-- Equipos/Licencias/Correos embeben el nombre del empleado asignado),
-- `areas_obras` no tiene ese consumidor cruzado — ningún otro módulo la
-- lee. Se gatean los 4 comandos, sin excepción de SELECT.
--
-- Ningún cambio de código de aplicación: EmpleadoForm.vue y el catálogo de
-- Configuración ya asumen que quien opera Empleados tiene el módulo
-- otorgado (igual que para el resto de catálogos gateados).

drop policy if exists "staff puede ver areas_obras" on public.areas_obras;
create policy "staff puede ver areas_obras"
  on public.areas_obras for select
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('empleados')));

drop policy if exists "staff puede crear areas_obras" on public.areas_obras;
create policy "staff puede crear areas_obras"
  on public.areas_obras for insert
  with check (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('empleados')));

drop policy if exists "staff puede editar areas_obras" on public.areas_obras;
create policy "staff puede editar areas_obras"
  on public.areas_obras for update
  using (public.es_jefe() or (public.es_staff() and public.tiene_permiso_modulo('empleados')));

-- delete sin cambios: "solo jefe puede eliminar areas_obras" ya es
-- es_jefe() puro, más restrictivo que el gate de módulo.
