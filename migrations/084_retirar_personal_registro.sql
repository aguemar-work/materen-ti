-- ============================================================
-- MIGRACIÓN 084 — Retiro completo del módulo "Pre-registro de personal"
-- Revierte: 042 (creación), 046 (hard delete JEFE), 047 (RLS JEFE),
-- 065 (rate-limit por DNI)
--
-- Contexto: el módulo fue un experimento puntual para recolectar datos de
-- candidatos/nuevos ingresos antes del alta en Empleados; después sirvió de
-- piloto para lo que maduró en el módulo de Encuestas (migración 043). Ya
-- cumplió su propósito, los datos que llegó a acumular ya fueron exportados
-- y usados, y no vuelve a usarse — se retira en vez de dejarlo vivo sin
-- consumidor. Verificado antes de aplicar: 0 filas en `personal_registros`
-- (2026-08-29, `select count(*) from personal_registros`), así que no hay
-- pérdida de datos reales.
--
-- Nada más en el esquema depende de estas 2 tablas: sin FKs entrantes desde
-- `empleados` (el pre-registro nunca se vinculó automáticamente, era
-- siempre una migración manual hecha por TI) ni desde ninguna otra tabla.
-- No se toca `staff_modulos_permisos`: "personal"/pre-registro nunca fue uno
-- de los 8 módulos configurables (siempre fue exclusivo de JEFE por ruta).
--
-- Código retirado en el mismo cambio (no en esta migración, ver commit):
-- edge function `functions/personal-registro.ts`, módulo frontend
-- `frontend/src/modules/personal/`, store `stores/personalRegistros.js`,
-- dominios de API `api/domains/personalRegistros.js` y
-- `api/personalRegistro.js`, rutas `/personal-registro` y
-- `/personal-registros`, ítem de sidebar en `AppNav.vue`.
--
-- Pendiente aparte, fuera del alcance de esta migración: des-desplegar la
-- edge function `personal-registro` de InsForge (no hay comando SQL para
-- eso) y limpiar el mockup correspondiente en `design.pen` (herramienta de
-- diseño aparte, requiere Pencil).
-- ============================================================

drop table if exists public.personal_registro_intentos;
drop table if exists public.personal_registros;

-- ============================================================
-- FIN DE MIGRACIÓN 084
-- ============================================================
