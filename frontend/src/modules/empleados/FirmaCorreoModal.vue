<script setup>
import { ref, computed } from 'vue';
import html2canvas from 'html2canvas';
import Modal from '../../components/shared/Modal.vue';
import { showToast } from '../../core/toast.js';
import { nombreCompleto } from '../../core/dominio-empleados.js';
import { buildFirmaHTML, DIRECCION_1, DIRECCION_2, SITIO_WEB } from '../../core/firmaCorreo.js';
import logoInacons from '../../assets/firma/inacons.png?inline';
import logoIso9001 from '../../assets/firma/iso_9001.png?inline';
import logoIso14001 from '../../assets/firma/iso_14001.png?inline';
import logoIso37001 from '../../assets/firma/iso_37001.png?inline';
import logoIso45001 from '../../assets/firma/iso_45001.png?inline';
import logoSgs from '../../assets/firma/sgs.png?inline';
import logoHodelpe from '../../assets/firma/hodelpe.png?inline';

const props = defineProps({
  empleado: { type: Object, required: true },
});

const emit = defineEmits(['cerrar']);

const modal = ref(null);
const lienzo = ref(null);

// Precargados desde la ficha, pero editables: el admin decide el correo
// (el empleado puede tener varias cuentas) y puede ajustar el nombre/cargo
// si el formato de la firma difiere del que guarda la base.
const nombre = ref(nombreCompleto(props.empleado));
const cargo = ref(props.empleado.cargo || '');
const telefono = ref(props.empleado.telefono || '');
const correo = ref(props.empleado.correo_personal || '');

const logos = {
  inacons: logoInacons,
  iso9001: logoIso9001,
  iso14001: logoIso14001,
  iso37001: logoIso37001,
  iso45001: logoIso45001,
  sgs: logoSgs,
  hodelpe: logoHodelpe,
};

const codigoHTML = computed(() => buildFirmaHTML(
  { nombre: nombre.value, cargo: cargo.value, telefono: telefono.value, correo: correo.value },
  logos,
));

const mostrarCodigo = ref(false);
const generandoImagen = ref(false);

function toggleCodigo() {
  mostrarCodigo.value = !mostrarCodigo.value;
}

async function copiarFirma() {
  const html = codigoHTML.value;
  try {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([lienzo.value?.innerText || ''], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    showToast('Firma copiada. Pégala en el editor de firma de Gmail u Outlook (Ctrl+V).');
  } catch {
    mostrarCodigo.value = true;
    showToast('No se pudo copiar automáticamente. Copia el código HTML de abajo.', 'error');
  }
}

async function descargarImagen() {
  if (!lienzo.value) return;
  generandoImagen.value = true;
  try {
    // Sin esto, html2canvas puede capturar antes de que Montserrat termine
    // de cargar y rasterizar con la tipografía de respaldo.
    await document.fonts.ready;
    const canvas = await html2canvas(lienzo.value, {
      backgroundColor: '#ffffff', scale: 1, width: 1450, height: 485, windowWidth: 1450,
    });
    const link = document.createElement('a');
    link.download = `firma-${(nombre.value || 'inacons').toLowerCase().replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch {
    showToast('No se pudo generar la imagen', 'error');
  } finally {
    generandoImagen.value = false;
  }
}
</script>

<template>
  <Modal ref="modal" titulo="Generar firma de correo" size="lg" @close="emit('cerrar')">
    <div class="form-grid">
      <div class="form-group">
        <label for="firma-nombre">Nombre completo</label>
        <input id="firma-nombre" v-model="nombre" type="text">
      </div>
      <div class="form-group">
        <label for="firma-cargo">Cargo</label>
        <input id="firma-cargo" v-model="cargo" type="text">
      </div>
      <div class="form-group">
        <label for="firma-telefono">Teléfono</label>
        <input id="firma-telefono" v-model="telefono" type="text">
      </div>
      <div class="form-group">
        <label for="firma-correo">Correo</label>
        <input id="firma-correo" v-model="correo" type="text" placeholder="nombre@inacons.com.pe">
      </div>
    </div>
    <p class="firma-hint">
      Dirección y sitio web son fijos para toda la empresa; los logos ya están incrustados.
    </p>

    <div class="firma-preview-wrap">
      <div ref="lienzo" class="sig-canvas">
        <!-- Columna izquierda (37.5%): marca — logo + certificaciones -->
        <div class="sig-col-izq">
          <div class="sig-logo">
            <img :src="logos.inacons" style="width:450px;" alt="INACONS">
          </div>
          <div class="sig-certs">
            <div class="sig-label">Certificados:</div>
            <div class="logo-row">
              <img :src="logos.iso9001" style="height:95px;">
              <img :src="logos.iso14001" style="height:95px;">
              <img :src="logos.iso37001" style="height:95px;">
              <img :src="logos.iso45001" style="height:95px;">
            </div>
            <div class="sig-label">Homologados:</div>
            <div class="logo-row">
              <img :src="logos.sgs" style="height:95px;">
              <img :src="logos.hodelpe" style="height:95px;">
            </div>
          </div>
        </div>

        <!-- Columna derecha (62.5%): datos de la persona — nombre/cargo,
             contacto y los avisos institucionales -->
        <div class="sig-col-der">
          <div class="sig-header-right">
            <div class="sig-name">{{ nombre }}</div>
            <div class="sig-title">{{ cargo }}</div>
          </div>
          <div class="sig-body-right">
            <div class="contact-line">
              <span class="contact-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#1B3B60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span>
              <span>{{ telefono }}</span>
            </div>
            <div class="contact-line">
              <span class="contact-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#1B3B60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></span>
              <span>{{ correo }}</span>
            </div>
            <div class="contact-line">
              <span class="contact-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#1B3B60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span>
              <span class="contact-direccion">{{ DIRECCION_1 }}<br>{{ DIRECCION_2 }}</span>
            </div>
            <div class="contact-line">
              <span class="contact-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#1B3B60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>
              <span>{{ SITIO_WEB }}</span>
            </div>
          </div>
          <div class="sig-footer">
            <div class="footer-line green">
              <svg viewBox="0 0 24 24" fill="none" stroke="#1D9E75" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 12 3a1.83 1.83 0 0 1 1.563.918l4.096 7.09"/><path d="m13.378 9.633 4.096-1.096 1.097 4.096"/></svg>
              <span>Cuida el planeta. Evita imprimir este correo si no es necesario.</span>
            </div>
            <div class="footer-line blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="#185FA5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              <span>Denuncia o consulta por soborno: oficialdecumplimiento@inacons.com.pe</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <textarea v-if="mostrarCodigo" class="firma-codigo" readonly :value="codigoHTML"></textarea>

    <template #acciones>
      <button class="btn" type="button" @click="toggleCodigo">
        <i class="ti ti-code" aria-hidden="true"></i> {{ mostrarCodigo ? 'Ocultar código' : 'Ver código HTML' }}
      </button>
      <button class="btn" type="button" :disabled="generandoImagen" @click="descargarImagen">
        <i :class="generandoImagen ? 'ti ti-loader-2 spinner-icon' : 'ti ti-download'" aria-hidden="true"></i> {{ generandoImagen ? 'Generando...' : 'Descargar imagen' }}
      </button>
      <button class="btn btn-primary" type="button" @click="copiarFirma">
        <i class="ti ti-copy" aria-hidden="true"></i> Copiar firma
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.firma-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin: 10px 2px 14px;
}

.firma-preview-wrap {
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--color-bg-subtle, var(--color-neutral-bg));
}

.firma-codigo {
  width: 100%;
  height: 140px;
  margin-top: 12px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  resize: vertical;
}

/* ── Lienzo de la firma: réplica fiel del diseño institucional
   (colores/tipografía propios de la marca, no del sistema de tokens
   de Sistema TI — este bloque es el artefacto que verá el destinatario). */
.sig-canvas {
  position: relative;
  overflow: hidden;
  width: 1450px;
  height: 485px;
  background: #ffffff;
  padding: 42.5px 60px;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  border: 1px solid #eee;
  font-family: 'Montserrat', Arial, Helvetica, sans-serif;
}

/* Grid de 12 columnas sobre el ancho de contenido (1330px, sin el padding):
   columna izquierda = 5/12 (marca), columna derecha = 7/12 (datos). Sin
   gutter entre ambas — el corte diagonal del navy ya separa visualmente. */
.sig-col-izq {
  flex: 0 0 calc(100% * 5 / 12);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.sig-logo { margin-bottom: 14px; }
.sig-certs { display: flex; flex-direction: column; }

/* Columna derecha (7/12): datos de la persona — nombre/cargo, contacto
   y avisos, repartidos en todo el alto de la tarjeta. */
.sig-col-der {
  flex: 0 0 calc(100% * 7 / 12);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.sig-header-right {
  background: #1B3B60;
  clip-path: polygon(6% 0, 100% 0, 100% 100%, 0% 100%);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  height: 120px;
  padding: 20px 50px 20px 100px;
  box-sizing: border-box;
}
.sig-name { font-size: 42px; font-weight: bold; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1; text-align: right; }
.sig-title { font-size: 22px; color: #fff; margin-top: 8px; line-height: 1.2; text-align: right; }
.sig-body-right { font-size: 20px; line-height: 2.15; color: #1a1a1a; }
.sig-label { font-size: 15px; color: #6b7280; margin-bottom: 10px; }
.logo-row { display: flex; gap: 14px; align-items: center; margin-bottom: 12px; }
.contact-line { display: flex; align-items: center; }
.contact-direccion { line-height: 1.3; }
.contact-icon { color: #1B3B60; width: 34px; flex: 0 0 34px; }
.contact-icon svg { width: 24px; height: 24px; display: block; }
.sig-footer { font-size: 15px; display: flex; flex-direction: column; gap: 4px; }
.sig-footer .footer-line { display: flex; align-items: center; gap: 8px; }
.sig-footer .green { color: #1D9E75; }
.sig-footer .blue { color: #185FA5; }
.sig-footer svg { width: 17px; height: 17px; flex: 0 0 17px; }
</style>
