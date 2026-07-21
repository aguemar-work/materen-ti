// Plantilla de la firma de correo institucional (INACONS). Dirección y sitio
// web son fijos para toda la empresa; solo nombre/cargo/teléfono/correo
// varían por empleado. El HTML que arma buildFirmaHTML() es la firma en sí
// (tabla con estilos inline, compatible con Gmail/Outlook) — es un artefacto
// de marca externo, distinto de la vista previa en pantalla del modal.
export const DIRECCION_1 = 'Av. Las Casuarinas 256 Pucusana - Lima';
export const DIRECCION_2 = 'Calle Casuarinas 106 El Tambo - Huancayo';
export const SITIO_WEB = 'www.inacons.com.pe';

const NAVY = '#1B3B60';
const GREEN = '#1D9E75';
const BLUE = '#185FA5';
const GRAY = '#6b7280';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// logos: { inacons, iso9001, iso14001, iso37001, iso45001, sgs, hodelpe } — data URIs
export function buildFirmaHTML({ nombre, cargo, telefono, correo }, logos) {
  const web = SITIO_WEB.replace(/^https?:\/\//, '');
  return ''
    // Tarjeta dividida en dos, grid de 12 columnas sobre 640px: columna
    // izquierda 5/12 = 267px (marca: logo + certificados + homologaciones);
    // columna derecha 7/12 = 373px (datos de la persona, contacto y los
    // avisos de cuidado ambiental / anticorrupción).
    + `<table cellpadding="0" cellspacing="0" border="0" style="width:640px;font-family:'Montserrat',Arial,Helvetica,sans-serif;color:#1a1a1a;">`
    + '<tr>'
      + '<td style="width:267px;background:#ffffff;padding:18px 16px;vertical-align:middle;">'
        + `<img src="${logos.inacons}" width="200" alt="INACONS" style="display:block;">`
      + '</td>'
      + `<td style="width:373px;background:${NAVY};padding:18px 24px;vertical-align:middle;text-align:right;clip-path:polygon(8% 0,100% 0,100% 100%,0% 100%);">`
        + `<div style="font-size:23px;line-height:1;font-weight:bold;color:#ffffff;letter-spacing:0.3px;text-transform:uppercase;">${esc(nombre)}</div>`
        + `<div style="font-size:14px;color:#ffffff;margin-top:6px;line-height:1.2;">${esc(cargo)}</div>`
      + '</td>'
    + '</tr>'
    + '<tr><td colspan="2" style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>'
    + '<tr>'
      + '<td style="width:267px;padding:0 16px;vertical-align:top;">'
        + `<div style="font-size:11px;color:${GRAY};margin-bottom:6px;">Certificados:</div>`
        + `<img src="${logos.iso9001}" height="42" style="margin-right:4px;">`
        + `<img src="${logos.iso14001}" height="42" style="margin-right:4px;">`
        + `<img src="${logos.iso37001}" height="42" style="margin-right:4px;">`
        + `<img src="${logos.iso45001}" height="42">`
        + `<div style="font-size:11px;color:${GRAY};margin:12px 0 6px;">Homologados:</div>`
        + `<img src="${logos.sgs}" height="40" style="margin-right:4px;">`
        + `<img src="${logos.hodelpe}" height="40">`
      + '</td>'
      + '<td style="width:373px;padding:0 24px;vertical-align:top;font-size:13px;line-height:1.9;">'
        + `<div><span style="color:${NAVY};">☎</span>&nbsp; ${esc(telefono)}</div>`
        + `<div><span style="color:${NAVY};">✉</span>&nbsp; <a href="mailto:${esc(correo)}" style="color:#1a1a1a;text-decoration:none;">${esc(correo)}</a></div>`
        + `<div style="line-height:1.3;"><span style="color:${NAVY};">📍</span>&nbsp; ${esc(DIRECCION_1)}<br>&nbsp;&nbsp;&nbsp;${esc(DIRECCION_2)}</div>`
        + `<div><span style="color:${NAVY};">🌐</span>&nbsp; <a href="https://${web}" style="color:#1a1a1a;text-decoration:none;">${esc(web)}</a></div>`
      + '</td>'
    + '</tr>'
    + '<tr><td colspan="2" style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>'
    + '<tr>'
      + '<td style="width:267px;">&nbsp;</td>'
      + `<td style="width:373px;padding:0 24px;font-size:11px;color:${GREEN};">`
        + '♻ Cuida el planeta. Evita imprimir este correo si no es necesario.'
      + '</td>'
    + '</tr>'
    + '<tr>'
      + '<td style="width:267px;">&nbsp;</td>'
      + `<td style="width:373px;padding:2px 24px 0;font-size:11px;color:${BLUE};">`
        + '🚫 Denuncia o consulta por soborno: oficialdecumplimiento@inacons.com.pe'
      + '</td>'
    + '</tr>'
    + '</table>';
}
