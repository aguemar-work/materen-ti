import { esc } from './utils.js';

let toastEl;

export function initToast() {
  toastEl = document.getElementById('toast');
}

export function showToast(msg, type = 'success') {
  if (!toastEl) return;
  const icon = type === 'error' ? 'ti-alert-circle' : 'ti-check';
  toastEl.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i> ${esc(msg)}`;
  toastEl.className = `toast toast-${type}`;
  toastEl.style.display = 'flex';
  toastEl.style.opacity = '1';
  toastEl.style.transform = 'translateY(0)';
  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(8px)';
    setTimeout(() => { toastEl.style.display = 'none'; }, 300);
  }, 2400);
}
