<script setup>
// Acta de entrega / devolución de un equipo, como RUTA imprimible:
//   /equipos/:id/acta/:asignacionId?tipo=entrega|devolucion
// Reemplaza a la ventana de `document.write` de acta-base.js (plan de mejora,
// regla 23: "imprimir es la misma hoja"). Es la misma hoja en pantalla y en
// papel: Inter del bundle, carátula con rótulo de expediente, tablas de datos,
// cláusula, QR del equipo, dos firmas y el pie. Los botones llevan
// `data-no-print`: no salen en el papel (styles/impresion.css).
//
// Flujo de la firma (plan §3.7): imprimir o guardar como PDF → firmar en
// papel → escanear o fotografiar → "Subir acta firmada". Una foto se convierte
// a PDF en el navegador (core/pdfActa.js) y se sube por la edge function
// `equipos-fotos`; el PDF queda en un bucket privado y se abre con una URL
// firmada de 2 minutos. El contenido de cada acta lo decide acta-datos.js.
//
// El DNI va completo: es un documento legal (plan §3.10).
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { formatFecha, fechaLocalISO } from '../../core/formatters.js';
import { NOMBRE_PRODUCTO, NOMBRE_CORTO } from '../../core/marca.js';
import { prepararActaParaSubir } from '../../core/pdfActa.js';
import { contenidoActa, tipoActaDe } from './acta-datos.js';
import AppCaratula from '../../components/ui/AppCaratula.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import QrEquipo from '../../components/ui/QrEquipo.vue';

const route = useRoute();
const equipoId = computed(() => String(route.params.id));
const asignacionId = computed(() => String(route.params.asignacionId));
const tipo = computed(() => tipoActaDe(route.query.tipo));

// 'cargando' | 'ok' | 'no_encontrado' | 'no_aplica' | 'error'
const estado = ref('cargando');
const mensajeEstado = ref('');
const equipo = ref(null);
const asignacion = ref(null);
const empleado = ref(null);
const actas = ref([]);
const errorActas = ref('');

async function cargar() {
  estado.value = 'cargando';
  mensajeEstado.value = '';
  try {
    const [eq, asignaciones] = await Promise.all([
      insforgeApi.getEquipo(equipoId.value),
      insforgeApi.asignacionesDeEquipo(equipoId.value),
    ]);
    const asig = asignaciones.find((a) => a.id === asignacionId.value);
    if (!eq || !asig) {
      estado.value = 'no_encontrado';
      return;
    }
    if (!asig.empleado_id) {
      estado.value = 'no_aplica';
      mensajeEstado.value = 'Esta asignación es a una ubicación, no a una persona: no tiene acta.';
      return;
    }
    if (tipo.value === 'devolucion' && !asig.fecha_fin) {
      estado.value = 'no_aplica';
      mensajeEstado.value = 'El equipo sigue a cargo de la persona: todavía no hay devolución que documentar.';
      return;
    }
    const emp = await insforgeApi.getEmpleado(asig.empleado_id);
    if (!emp) {
      estado.value = 'no_encontrado';
      return;
    }
    equipo.value = eq;
    asignacion.value = asig;
    empleado.value = emp;
    estado.value = 'ok';
    // Las actas firmadas se leen aparte: si fallan, el documento igual se imprime.
    try {
      actas.value = await insforgeApi.listActasEquipo(equipoId.value);
      errorActas.value = '';
    } catch (e) {
      actas.value = [];
      errorActas.value = traducirErrorDb(e, { porDefecto: 'No se pudo consultar el acta firmada.' }).mensaje;
    }
  } catch (e) {
    estado.value = 'error';
    mensajeEstado.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar el acta.' }).mensaje;
  }
}

onMounted(cargar);

const acta = computed(() => (equipo.value
  ? contenidoActa({ tipo: tipo.value, equipo: equipo.value, empleado: empleado.value, asignacion: asignacion.value })
  : null));
const hoy = formatFecha(fechaLocalISO());

// Acta firmada vigente de ESTA asignación y tipo.
const firmada = computed(() => actas.value.find((a) => a.asignacionId === asignacionId.value && a.tipo === tipo.value) || null);

// ── Subir el acta firmada ─────────────────────────────────────────────────
const fechaFirma = ref('');
const subiendo = ref(false);
const errorSubida = ref('');
const entradaArchivo = ref(null);
const entradaCamara = ref(null);

async function alElegirArchivo(evento) {
  const archivo = evento.target.files?.[0];
  evento.target.value = '';
  if (!archivo) return;
  subiendo.value = true;
  errorSubida.value = '';
  try {
    const pdf = await prepararActaParaSubir(archivo);
    const nueva = await insforgeApi.subirActa({
      asignacionId: asignacionId.value,
      tipo: tipo.value,
      archivo: pdf,
      nombre: pdf.name,
      firmadoAt: fechaFirma.value || undefined,
    });
    actas.value = [nueva, ...actas.value.filter((a) => !(a.asignacionId === nueva.asignacionId && a.tipo === nueva.tipo))];
  } catch (e) {
    errorSubida.value = traducirErrorDb(e, { porDefecto: 'No se pudo subir el acta.' }).mensaje;
  } finally {
    subiendo.value = false;
  }
}

// La pestaña se abre en el clic (antes del `await` de la URL firmada) y se
// redirige después: así el navegador no la bloquea como ventana emergente.
async function verActaFirmada() {
  if (!firmada.value) return;
  const ventana = window.open('', '_blank');
  errorSubida.value = '';
  try {
    const url = await insforgeApi.urlActa(firmada.value.id);
    if (ventana) ventana.location.href = url;
    else window.open(url, '_blank');
  } catch (e) {
    ventana?.close();
    errorSubida.value = traducirErrorDb(e, { porDefecto: 'No se pudo abrir el acta firmada.' }).mensaje;
  }
}

function imprimir() {
  window.print();
}

const claseCeldaEtiqueta = 'w-[32%] border border-gray-300 bg-gray-50 px-3 py-1.5 text-left align-top font-medium text-gray-700';
const claseCeldaValor = 'border border-gray-300 px-3 py-1.5 align-top text-gray-900';
const claseRotulo = 'text-[11px] font-semibold uppercase tracking-wider text-gray-500';
</script>

<template>
  <div class="w-full px-4 pb-10 pt-6 sm:px-6">
    <p v-if="estado === 'cargando'" class="py-16 text-center text-sm text-gray-500" role="status">Cargando acta...</p>

    <div v-else-if="estado === 'error'" class="mx-auto max-w-lg py-10 text-center" role="alert">
      <p class="text-sm text-gray-900">{{ mensajeEstado }}</p>
      <AppButton class="mt-4" variant="outline" severity="secondary" icon="ti ti-refresh" label="Reintentar" @click="cargar" />
    </div>

    <AppVacio
      v-else-if="estado === 'no_encontrado'"
      icono="ti ti-file-off"
      titulo="Acta no encontrada"
      mensaje="El equipo, la asignación o la persona ya no existen, o no tiene acceso a ellos."
    >
      <AppButton variant="outline" severity="secondary" label="Ir a Equipos" to="/equipos" />
    </AppVacio>

    <AppVacio v-else-if="estado === 'no_aplica'" icono="ti ti-file-off" titulo="No hay acta que mostrar" :mensaje="mensajeEstado">
      <AppButton variant="outline" severity="secondary" label="Volver al equipo" :to="`/equipos/${equipoId}`" />
    </AppVacio>

    <template v-else-if="acta">
      <!-- ── Acciones: no salen en papel ── -->
      <section data-no-print class="mx-auto mb-5 max-w-[210mm]" aria-label="Acciones del acta">
        <div class="flex flex-wrap items-center gap-2">
          <AppButton icon="ti ti-printer" label="Imprimir / Guardar PDF" @click="imprimir" />
          <AppButton
            variant="outline"
            severity="secondary"
            icon="ti ti-upload"
            :label="subiendo ? 'Subiendo...' : firmada ? 'Reemplazar acta firmada' : 'Subir acta firmada'"
            :loading="subiendo"
            @click="entradaArchivo?.click()"
          />
          <AppButton
            class="sm:hidden"
            variant="outline"
            severity="secondary"
            icon="ti ti-camera"
            label="Fotografiar acta"
            :disabled="subiendo"
            @click="entradaCamara?.click()"
          />
          <input ref="entradaArchivo" type="file" class="hidden" accept="application/pdf,image/*" aria-label="Elegir el acta firmada (PDF o foto)" @change="alElegirArchivo">
          <input ref="entradaCamara" type="file" class="hidden" accept="image/*" capture="environment" aria-label="Fotografiar el acta firmada" @change="alElegirArchivo">
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <p v-if="firmada" class="text-gray-900" role="status">
            Acta firmada ✓
            <span class="text-gray-500">
              · <template v-if="firmada.firmadoAt">firmada el {{ formatFecha(firmada.firmadoAt) }} · </template>subida el {{ formatFecha(firmada.creadaEn) }}
            </span>
            <button
              class="ml-2 rounded text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              type="button"
              @click="verActaFirmada"
            >Ver acta firmada</button>
          </p>
          <p v-else class="text-gray-500">Sin acta firmada. Imprima el acta, hágala firmar y súbala (PDF o foto).</p>
          <label class="flex items-center gap-2 text-gray-600">
            <span>Fecha de firma</span>
            <input
              v-model="fechaFirma"
              type="date"
              :max="fechaLocalISO()"
              class="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
            <span class="text-gray-500">(opcional)</span>
          </label>
        </div>

        <p v-if="errorSubida" class="mt-2 text-sm text-red-700" role="alert">{{ errorSubida }}</p>
        <p v-if="errorActas" class="mt-2 text-sm text-gray-500">{{ errorActas }}</p>
      </section>

      <!-- ── La hoja: lo que se imprime es esto ── -->
      <article data-acta class="mx-auto max-w-[210mm] border border-gray-200 bg-white pb-8 print:border-0">
        <AppCaratula :titulo="acta.titulo">
          <template #rotulo>
            {{ acta.rotulo }} · EQUIPO <AppCodigo :valor="equipo.codigo" titulo="Código de equipo" />
            <template v-if="equipo.codigo_almacen"> · ALMACÉN <AppCodigo :valor="equipo.codigo_almacen" titulo="Código de almacén" /></template>
          </template>
        </AppCaratula>

        <dl class="flex flex-wrap gap-x-8 gap-y-2 px-4 pt-4 sm:px-6">
          <div>
            <dt :class="claseRotulo">Empresa</dt>
            <dd class="mt-0.5 text-sm text-gray-900">{{ equipo.empresa_nombre || NOMBRE_CORTO }}</dd>
          </div>
          <div>
            <dt :class="claseRotulo">{{ tipo === 'entrega' ? 'Fecha de entrega' : 'Fecha de devolución' }}</dt>
            <dd class="mt-0.5 text-sm tabular-nums text-gray-900">{{ acta.fecha }}</dd>
          </div>
        </dl>

        <div class="space-y-6 px-4 pt-6 sm:px-6">
          <section v-for="(seccion, i) in acta.secciones" :key="seccion.titulo" :aria-labelledby="`acta-sec-${i}`">
            <h2 :id="`acta-sec-${i}`" class="mb-2 border-b border-gray-900 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-900">{{ seccion.titulo }}</h2>
            <div class="flex items-start gap-4">
              <table class="w-full min-w-0 table-fixed border-collapse text-sm">
                <tbody>
                  <tr v-for="[etiqueta, valor] in seccion.filas" :key="etiqueta">
                    <th scope="row" :class="claseCeldaEtiqueta">{{ etiqueta }}</th>
                    <td :class="[claseCeldaValor, 'tabular-nums [overflow-wrap:anywhere]']">{{ valor }}</td>
                  </tr>
                  <tr v-if="i === 1">
                    <th scope="row" :class="claseCeldaEtiqueta">{{ acta.etiquetaAccesorios }}</th>
                    <td :class="claseCeldaValor">
                      <ul v-if="acta.accesorios.length" class="space-y-0.5">
                        <li v-for="(acc, j) in acta.accesorios" :key="j">
                          <span v-if="acc.codigo" class="mr-1.5 tabular-nums text-gray-500">{{ acc.codigo }}</span>{{ acc.descripcion }}<span v-if="acc.cantidad > 1" class="ml-1 tabular-nums">×{{ acc.cantidad }}</span>
                        </li>
                      </ul>
                      <span v-else>Ninguno</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <figure v-if="i === 1" class="shrink-0 text-center">
                <QrEquipo class="h-[26mm] w-[26mm]" :codigo="equipo.codigo" />
                <figcaption class="mt-1 text-[10px] leading-tight text-gray-500">QR del equipo</figcaption>
              </figure>
            </div>
          </section>

          <p class="text-justify text-[13px] leading-relaxed text-gray-800">{{ acta.clausula }}</p>

          <div class="grid grid-cols-2 gap-10 pt-16">
            <div v-for="f in acta.firmas" :key="f.rol" class="border-t border-gray-900 pt-1.5 text-center text-xs text-gray-700">
              <p class="font-semibold text-gray-900">{{ f.rol }}</p>
              <template v-if="f.nombre">
                <p>{{ f.nombre }}</p>
                <p>DNI: <AppCodigo :valor="f.dni" titulo="DNI" /></p>
              </template>
              <p v-else>Nombre y firma</p>
            </div>
          </div>

          <p class="pt-4 text-center text-[11px] tabular-nums text-gray-500">
            Documento generado por {{ NOMBRE_PRODUCTO }} el {{ hoy }} · equipo {{ equipo.codigo }}
          </p>
        </div>
      </article>
    </template>
  </div>
</template>
