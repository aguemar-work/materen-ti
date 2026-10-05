// @vitest-environment happy-dom
//
// ConfirmDialog.vue reescrito sobre primevue/dialog (Unstyled + Tailwind) +
// AppButton — 2026-09-07. Este test cubre el contrato público que ~31
// vistas reales dependen de que siga funcionando igual: props/emits/expose
// no cambiaron, aunque el DOM interno pasó de <Modal> propio a <Dialog>.
//
// El panel se teletransporta a <body> (appendTo por defecto de Dialog):
// se busca con querySelector sobre el documento real.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, defineComponent, ref, h } from 'vue';
import PrimeVue from 'primevue/config';
import ConfirmDialog from '../../src/components/shared/ConfirmDialog.vue';

// Dialog renderiza vía primevue/portal, que solo teletransporta a partir de
// su PROPIO mounted() (guard `isClient()`, típico de un componente
// SSR-safe) — el primer render síncrono no muestra nada todavía. Un
// nextTick() después de montar alcanza para que aparezca.
async function montar(props = {}, slots = {}) {
  const w = mount(ConfirmDialog, {
    props: { titulo: 'Eliminar licencia', ...props },
    slots,
    global: { plugins: [[PrimeVue, { unstyled: true }]] },
  });
  await nextTick();
  return w;
}

function botonPorTexto(texto) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ConfirmDialog.vue — reescrito sobre primevue/dialog + AppButton', () => {
  it('pinta título, mensaje y labels de los botones', async () => {
    await montar({ mensaje: '¿Confirma la acción?', confirmarLabel: 'Eliminar', cancelarLabel: 'No, volver' });
    expect(document.body.textContent).toContain('Eliminar licencia');
    expect(document.body.textContent).toContain('¿Confirma la acción?');
    expect(botonPorTexto('Eliminar')).toBeTruthy();
    expect(botonPorTexto('No, volver')).toBeTruthy();
  });

  it('destructivo=true pinta el ícono en badge rojo y el botón confirmar en severidad danger', async () => {
    await montar({ destructivo: true, confirmarLabel: 'Eliminar' });
    const badge = document.querySelector('.bg-red-50');
    expect(badge).toBeTruthy();
    const confirmar = botonPorTexto('Eliminar');
    expect(confirmar.className).toContain('bg-red-600');
  });

  it('destructivo=false (por defecto) usa severidad primaria en el confirmar', async () => {
    await montar({ confirmarLabel: 'Renovar' });
    const confirmar = botonPorTexto('Renovar');
    expect(confirmar.className).toContain('bg-primary-500');
    expect(document.querySelector('.bg-red-50')).toBeFalsy();
  });

  it('clic en Cancelar emite "cancel"', async () => {
    const w = await montar({ cancelarLabel: 'Cancelar' });
    botonPorTexto('Cancelar').click();
    await w.vm.$nextTick();
    expect(w.emitted('cancel')).toBeTruthy();
  });

  it('requiereMotivo: confirmar con motivo corto NO emite "confirm" y muestra el error', async () => {
    const w = await montar({ requiereMotivo: true, motivoMin: 10, confirmarLabel: 'Rechazar' });
    const textarea = document.querySelector('textarea');
    textarea.value = 'corto';
    textarea.dispatchEvent(new Event('input'));
    await w.vm.$nextTick();
    botonPorTexto('Rechazar').click();
    await w.vm.$nextTick();
    expect(w.emitted('confirm')).toBeFalsy();
    expect(document.body.textContent).toContain('Escriba al menos 10 caracteres');
  });

  it('requiereMotivo: confirmar con motivo válido emite "confirm" con el texto recortado', async () => {
    const w = await montar({ requiereMotivo: true, motivoMin: 5, confirmarLabel: 'Rechazar' });
    const textarea = document.querySelector('textarea');
    textarea.value = '  el ticket ya se resolvió  ';
    textarea.dispatchEvent(new Event('input'));
    await w.vm.$nextTick();
    botonPorTexto('Rechazar').click();
    await w.vm.$nextTick();
    expect(w.emitted('confirm')).toEqual([['el ticket ya se resolvió']]);
  });

  it('cargando=true deshabilita ambos botones del footer', async () => {
    await montar({ cargando: true, confirmarLabel: 'Guardar', cancelarLabel: 'Cancelar' });
    expect(botonPorTexto('Cancelar').disabled).toBe(true);
    // El label cambia a "Procesando..." mientras cargando (mismo texto que
    // el <ConfirmDialog> original mostraba).
    const procesando = botonPorTexto('Procesando...');
    expect(procesando).toBeTruthy();
    expect(procesando.disabled).toBe(true);
  });

  it('cerrar() expuesto oculta el diálogo SIN emitir "cancel" (camino de éxito), pero sí "cerrado"', async () => {
    const w = await montar();
    expect(document.body.textContent).toContain('Eliminar licencia');
    w.vm.cerrar();
    await w.vm.$nextTick();
    expect(w.emitted('cancel')).toBeFalsy();
    expect(w.emitted('cerrado')).toHaveLength(1);
  });

  it('cancelar emite "cancel" y "cerrado"', async () => {
    const w = await montar({ cancelarLabel: 'No, volver' });
    botonPorTexto('No, volver').click();
    await w.vm.$nextTick();
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(w.emitted('cerrado')).toHaveLength(1);
  });

  it('con @cerrado, una segunda confirmación en la misma pantalla vuelve a aparecer', async () => {
    // Regresión real (2026-09-24): los padres desmontaban solo en 'cancel';
    // tras un cerrar() exitoso el estado quedaba asignado con el diálogo
    // oculto, y la siguiente confirmación (otro ítem) nunca se mostraba.
    const Padre = defineComponent({
      setup() {
        const pendiente = ref(null);
        return { pendiente };
      },
      render() {
        return this.pendiente
          ? h(ConfirmDialog, {
              ref: 'dlg',
              titulo: `Eliminar ${this.pendiente}`,
              onCerrado: () => { this.pendiente = null; },
              onConfirm: () => this.$refs.dlg.cerrar(),
            })
          : null;
      },
    });
    const w = mount(Padre, { global: { plugins: [[PrimeVue, { unstyled: true }]] } });
    w.vm.pendiente = 'correo A';
    await nextTick(); await nextTick();
    expect(document.body.textContent).toContain('Eliminar correo A');
    w.vm.$refs.dlg.cerrar();
    await nextTick();
    expect(w.vm.pendiente).toBeNull();
    w.vm.pendiente = 'correo B';
    await nextTick(); await nextTick();
    expect(document.body.textContent).toContain('Eliminar correo B');
  });

  it('slot por defecto se renderiza dentro del diálogo', async () => {
    await montar({}, { default: '<p class="contenido-extra">Detalle adicional</p>' });
    expect(document.querySelector('.contenido-extra')).toBeTruthy();
  });
});
