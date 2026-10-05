// Tipos compartidos del SDK. Fuente única: scripts/build-functions.mjs inlina
// este archivo en el dist de cada edge function (que se despliega como UN solo
// archivo, sin imports locales). No editar los dist a mano.
import type { createAdminClient } from 'npm:@insforge/sdk@1.5.2';

export type ClienteAdmin = ReturnType<typeof createAdminClient>;
