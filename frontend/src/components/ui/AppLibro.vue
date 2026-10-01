<script setup>
// Libro de movimientos (regla 19, "Versión Expediente"): el ÚNICO render de
// historial del sistema. Reemplaza a los cinco que hoy conviven
// (historialUnificado del empleado, hoja de vida de equipos, historial de
// cuenta, hitos del ticket, ActividadView).
//
//   FECHA   MOVIMIENTO            DETALLE             POR      REF.
//   12/09/26 Entrega abierta      1 cuenta · WhatsApp —        ↗
//   20:14
//
//   · Columnas: Fecha (88px, `dd/mm/yy` y `hh:mm` en gris debajo) ·
//     Movimiento (verbo en participio, anterior → nuevo: "Abierto → En
//     progreso") · Detalle · Por (actor; "no registrado (legado)" si falta) ·
//     Ref. (enlace al otro expediente o al acta).
//   · Sin puntos de color, sin cajas de ícono, sin riel vertical: nada
//     decorativo. Solo texto; el azul aparece únicamente en el enlace de Ref.
//   · Celdas `px-3 py-2`, fila de al menos 40px (la fecha en dos líneas la
//     lleva a ~48px), cabecera de 32px, `table-layout: fixed`.
//   · Es una `<table>` real con `<th scope="col">`: un lector de pantalla la
//     recorre por columnas.
//   · Segundo tipo de fila, `mensaje` (conversación de un ticket): autor +
//     visibilidad en la columna Movimiento y el texto largo ocupa Detalle,
//     Por y Ref.
//   · Sin filas: UNA fila del libro en gris ("— Sin movimientos
//     registrados", regla 21). La acción que lo resuelva va en el slot
//     `vacio` como enlace de texto en la misma fila.
//   · Orden: el que traiga `filas` (historiales, lo más reciente arriba;
//     conversación, lo más reciente abajo).
//   · En móvil (< sm) se ocultan Por y Ref. y pasan, en una línea gris, bajo
//     el detalle: ningún dato se pierde.
//
// `filas`: [{ id?, fecha, movimiento, detalle?, por?, ref?: { texto, to? } }]
//   o de tipo mensaje: { tipo: 'mensaje', fecha, autor, visibilidad:
//   'visible' | 'interna', texto }.
//
// PIEZA NUEVA, aún no adoptada por las pantallas. En impresión es una tabla
// con líneas finas (styles/impresion.css la reconoce por `data-libro`).
import { RouterLink } from 'vue-router';
import { formatFechaLibro } from '../../core/formatters.js';

defineProps({
  filas: { type: Array, default: () => [] },
  /** Texto de la fila vacía, sin el guion inicial. */
  vacio: { type: String, default: 'Sin movimientos registrados' },
  /** Nombre accesible de la tabla (se lee como `caption`). */
  etiqueta: { type: String, default: 'Libro de movimientos' },
});

const SIN_ACTOR = 'no registrado (legado)';
const VISIBILIDAD = { visible: 'Mensaje visible', interna: 'Nota interna' };

const esMensaje = (fila) => fila.tipo === 'mensaje';
const partesFecha = (fila) => formatFechaLibro(fila.fecha);
const actorDe = (fila) => fila.por || SIN_ACTOR;
</script>

<template>
  <table data-libro class="w-full table-fixed border-collapse text-sm">
    <caption class="sr-only">{{ etiqueta }}</caption>
    <colgroup>
      <col class="w-[88px]">
      <col class="w-[34%] sm:w-[24%]">
      <col>
      <col class="hidden w-[120px] sm:table-column">
      <col class="hidden w-[96px] sm:table-column">
    </colgroup>
    <thead>
      <tr class="h-8 border-b border-gray-200">
        <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Fecha</th>
        <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Movimiento</th>
        <th scope="col" class="px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Detalle</th>
        <th scope="col" class="hidden px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Por</th>
        <th scope="col" class="hidden px-3 py-0 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">Ref.</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!filas.length" data-libro-vacio class="h-10 border-b border-gray-100">
        <td colspan="5" class="px-3 py-2 text-gray-500">
          — {{ vacio }}
          <slot name="vacio" />
        </td>
      </tr>

      <tr
        v-for="(fila, i) in filas"
        :key="fila.id ?? i"
        class="h-10 border-b border-gray-100"
        :data-fila="esMensaje(fila) ? 'mensaje' : 'movimiento'"
      >
        <td class="px-3 py-2 align-top text-xs leading-4 tabular-nums">
          <span class="block text-gray-900">{{ partesFecha(fila).fecha }}</span>
          <span v-if="partesFecha(fila).hora" class="block text-gray-500">{{ partesFecha(fila).hora }}</span>
        </td>

        <template v-if="esMensaje(fila)">
          <td class="px-3 py-2 align-top [overflow-wrap:anywhere]">
            <span class="block font-medium text-gray-900">{{ fila.autor }}</span>
            <span class="block text-xs text-gray-500">{{ VISIBILIDAD[fila.visibilidad] || VISIBILIDAD.visible }}</span>
          </td>
          <td colspan="3" class="whitespace-pre-line px-3 py-2 align-top text-gray-900 [overflow-wrap:anywhere]">{{ fila.texto }}</td>
        </template>

        <template v-else>
          <td class="px-3 py-2 align-top font-medium text-gray-900 [overflow-wrap:anywhere]">{{ fila.movimiento }}</td>
          <td class="px-3 py-2 align-top text-gray-700 [overflow-wrap:anywhere]">
            {{ fila.detalle }}
            <span class="mt-0.5 block text-xs text-gray-500 sm:hidden">
              {{ actorDe(fila) }}<template v-if="fila.ref"> · {{ fila.ref.texto }}</template>
            </span>
          </td>
          <td class="hidden px-3 py-2 align-top sm:table-cell [overflow-wrap:anywhere]" :class="fila.por ? 'text-gray-700' : 'text-gray-500'">{{ actorDe(fila) }}</td>
          <td class="hidden px-3 py-2 align-top sm:table-cell">
            <RouterLink
              v-if="fila.ref && fila.ref.to"
              :to="fila.ref.to"
              class="rounded text-primary-600 hover:text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >{{ fila.ref.texto }}</RouterLink>
            <span v-else-if="fila.ref" class="text-gray-700">{{ fila.ref.texto }}</span>
          </td>
        </template>
      </tr>
    </tbody>
  </table>
</template>
