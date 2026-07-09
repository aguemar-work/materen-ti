import { createClient } from '@insforge/sdk';

let client;

export function getClient() {
  if (!client) {
    const baseUrl = import.meta.env.VITE_INSFORGE_URL;
    const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY;
    if (!baseUrl || !anonKey) throw new Error('InsForge no configurado');
    client = createClient({
      baseUrl,
      anonKey,
      // El SDK deriva por defecto https://<app>.functions.insforge.app, que no
      // existe en este backend y el navegador lo bloquea por CORS antes de que
      // opere el fallback. Se usa el proxy /functions del API base directamente.
      functionsUrl: `${baseUrl}/functions`,
    });
  }
  return client;
}
