// Sonido de notificación sintetizado con Web Audio API — sin archivo de
// audio de por medio (evita depender de un asset y su licencia).
//
// Los navegadores bloquean cualquier audio hasta que detectan un gesto
// del usuario (click/tecla) en la página; ese desbloqueo dura toda la
// sesión de la pestaña, así que basta hacerlo una sola vez aquí.
let audioCtx = null;
let desbloqueado = false;

function obtenerContexto() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function desbloquear() {
  if (desbloqueado) return;
  const ctx = obtenerContexto();
  if (ctx.state === 'suspended') ctx.resume();
  desbloqueado = true;
  window.removeEventListener('click', desbloquear);
  window.removeEventListener('keydown', desbloquear);
}

window.addEventListener('click', desbloquear);
window.addEventListener('keydown', desbloquear);

// Dos tonos cortos ascendentes, tipo "ding" de notificación.
export function reproducirNotificacion() {
  if (!desbloqueado) return; // sin gesto previo el navegador lo bloquea igual
  const ctx = obtenerContexto();
  const ahora = ctx.currentTime;
  [[880, 0], [1320, 0.1]].forEach(([frecuencia, retardo]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frecuencia;
    gain.gain.setValueAtTime(0.0001, ahora + retardo);
    gain.gain.exponentialRampToValueAtTime(0.2, ahora + retardo + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ahora + retardo + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ahora + retardo);
    osc.stop(ahora + retardo + 0.3);
  });
}
