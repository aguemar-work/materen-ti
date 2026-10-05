// Nombre canónico del producto en UI, documentos y páginas públicas.
//
// ÚNICO lugar donde se escribe el nombre. Consumidores: AppLayout (logo +
// título de topbar), AppPortal (portal público y páginas de error: alt del
// logo), pdfReporte (pie de los PDFs),
// ActaView (actas imprimibles de equipos), DesignSystem y StyleLab.
//
// EXCEPCIÓN CONOCIDA — `frontend/index.html` (`<title>`): es HTML estático
// servido antes de que corra cualquier JS, así que no puede importar de acá.
// Es el único sitio que hay que tocar a mano en un cambio de nombre. Si
// aparece un segundo caso así, anotarlo en esta lista, no dejarlo suelto.
export const NOMBRE_PRODUCTO = 'Materen — Sistema TI';

// El descriptor "Sistema TI" tiene fecha de vencimiento: la decisión de
// alcance del 2026-09-01 (ver docs/PLAN-MAESTRO-MATEREN.md, "Nombre y marca")
// establece que el producto crece hacia dominios fuera de TI. "Materen" sí
// sobrevive a eso; "Sistema TI" no. No se retira todavía a propósito —
// hacerlo hoy cambiaría lo que ve el usuario por un futuro que aún no
// llegó. El disparador está escrito en el plan: el primer módulo no-TI real.
export const NOMBRE_CORTO = 'Sistema TI';
export const NOMBRE_MARCA = 'Materen';

// Contacto del área de TI que ve quien escanea la etiqueta QR de un equipo SIN
// sesión (/e/:codigo). Lo completa el dueño: es un dato de la empresa, no un
// secreto, pero no se inventa. Con las dos claves vacías la página pública
// muestra solo el mensaje genérico. (El plan prevé leerlo de `config_parametros`;
// mientras no exista ese parámetro público, vive acá.)
//   texto:   "Mesa de ayuda: 987 654 321 · ti@materen.pe"
//   enlace:  URL opcional (wa.me, mailto:, tel:) para convertirlo en enlace.
export const CONTACTO_TI = Object.freeze({ texto: '', enlace: '' });
