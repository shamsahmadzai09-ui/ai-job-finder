// PWA plumbing: service worker registration, update prompt, install prompt, online/offline state.

import { toast } from './ui.js';

let deferredInstallPrompt = null;
const installListeners = new Set();

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function canInstall() {
  return deferredInstallPrompt !== null;
}

export function onInstallAvailabilityChange(cb) {
  installListeners.add(cb);
  return () => installListeners.delete(cb);
}

export async function promptInstall() {
  if (!deferredInstallPrompt) return 'unavailable';
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installListeners.forEach((cb) => cb());
  return outcome; // 'accepted' | 'dismissed'
}

export function serviceWorkerSupported() {
  return 'serviceWorker' in navigator;
}

export async function getServiceWorkerState() {
  if (!serviceWorkerSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'not registered';
  if (reg.active) return navigator.serviceWorker.controller ? 'active and controlling this page' : 'active (reload to take control)';
  if (reg.installing) return 'installing';
  if (reg.waiting) return 'update waiting';
  return 'registered';
}

/** Removes the service worker and every cache this app created. Used by Settings for troubleshooting. */
export async function clearOfflineData() {
  if (serviceWorkerSupported()) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('ajf-')).map((k) => caches.delete(k)));
  }
}

function promptUpdate(registration) {
  toast('A new version of the app is ready.', {
    actionLabel: 'Reload',
    timeout: 0,
    onAction: () => registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
  });
}

export function initPwa({ onOnlineChange } = {}) {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installListeners.forEach((cb) => cb());
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installListeners.forEach((cb) => cb());
    toast('App installed.');
  });

  const emit = () => onOnlineChange?.(navigator.onLine);
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
  emit();

  if (!serviceWorkerSupported()) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');

      if (registration.waiting && navigator.serviceWorker.controller) promptUpdate(registration);

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(registration);
        });
      });

      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    } catch {
      toast('Offline support could not be enabled in this browser.');
    }
  });
}
