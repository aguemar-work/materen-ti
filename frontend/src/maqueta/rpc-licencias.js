// RPC simulada de la maqueta para licencias (migración 101,
// `crear_licencia_con_cuenta`). Igual que las de rpc-empleados.js: recibe la
// base en memoria y los argumentos NOMBRADOS (`p_...`), muta la base y devuelve
// la fila; los rechazos llevan el mismo SQLSTATE y el mismo texto en español que
// la RPC real (el cliente falso los convierte en `{ error }`).
//
// Todo es inventado: recargar la página devuelve los datos iniciales.

let secuencia = 0;
const idNuevo = (prefijo) => `maq-${prefijo}-${Date.now().toString(36)}-${(secuencia += 1)}`;

function rechazar(code, message) {
  throw Object.assign(new Error(message), { code });
}

const CIFRADO = /^enc2?:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;
const texto = (v) => String(v ?? '').trim().replace(/\s+/g, ' ') || null;
const vacioANulo = (v) => (v === '' || v === undefined ? null : v);

export const RPC_LICENCIAS = {
  // Licencia + (opcional) cuenta nueva que será su login, todo o nada: ningún
  // rechazo deja una cuenta huérfana (se valida todo antes de insertar).
  crear_licencia_con_cuenta: (db, a = {}) => {
    const lic = a.p_licencia;
    if (!lic || typeof lic !== 'object') rechazar('P0001', 'Los datos de la licencia no son válidos.');
    const software = texto(lic.software);
    if (!software) rechazar('P0001', 'El nombre del software es obligatorio.');
    const tipo = texto(lic.tipo) || 'suscripcion';
    if (!['suscripcion', 'perpetua'].includes(tipo)) rechazar('P0001', 'El tipo de licencia no es válido.');
    let cantidad = Number(vacioANulo(lic.cantidad) ?? 0);
    if (cantidad === 0) cantidad = 1;
    if (cantidad < 1) rechazar('P0001', 'La cantidad de asientos debe ser al menos 1.');
    const clave = vacioANulo(lic.clave);
    if (clave && !CIFRADO.test(clave)) rechazar('P0001', 'La clave debe llegar cifrada. Vuelva a intentarlo.');
    const costo = vacioANulo(lic.costo) == null ? null : Number(lic.costo);

    const nueva = a.p_cuenta && typeof a.p_cuenta === 'object' ? a.p_cuenta : null;
    let cuentaId = vacioANulo(lic.cuenta_id);
    let cuenta = null;
    if (nueva) {
      if (cuentaId) rechazar('P0001', 'Indique una cuenta existente o una cuenta nueva, no ambas.');
      const usuario = String(nueva.usuario ?? '').trim().toLowerCase();
      if (!usuario) rechazar('P0001', 'El usuario de la cuenta es obligatorio.');
      const tipoCuenta = texto(nueva.tipo_cuenta) || 'compartida';
      if (!['compartida', 'reutilizable'].includes(tipoCuenta)) rechazar('P0001', 'El tipo de cuenta no es válido.');
      if (nueva.password && !CIFRADO.test(nueva.password)) {
        rechazar('P0001', 'La contraseña debe llegar cifrada. Vuelva a intentarlo.');
      }
      if (!db.plataformas.some((p) => p.id === nueva.plataforma_id && !p.deleted_at)) rechazar('P0002', 'La plataforma no existe.');
      if (db.cuentas.some((c) => !c.deleted_at && c.plataforma_id === nueva.plataforma_id && c.usuario === usuario)) {
        rechazar('23505', 'duplicate key value violates unique constraint "uq_cuentas_usuario_plataforma"');
      }
      const ahora = new Date().toISOString();
      cuenta = {
        id: idNuevo('c'),
        plataforma_id: nueva.plataforma_id,
        usuario,
        tipo_cuenta: tipoCuenta,
        password: nueva.password || null,
        url: texto(nueva.url) || '',
        notas: texto(nueva.notas) || '',
        last_password_change: nueva.password ? ahora : null,
        requiere_rotacion: false,
        deleted_at: null,
        created_at: ahora,
      };
      cuentaId = cuenta.id;
    } else if (cuentaId && !db.cuentas.some((c) => c.id === cuentaId && !c.deleted_at)) {
      rechazar('P0002', 'La cuenta indicada no existe.');
    }

    if (cuenta) db.cuentas.push(cuenta);
    const perpetua = tipo === 'perpetua';
    const fila = {
      id: idNuevo('l'),
      software,
      tipo,
      cantidad,
      empresa_id: vacioANulo(lic.empresa_id),
      proveedor: texto(lic.proveedor) || '',
      fecha_vencimiento: perpetua ? null : vacioANulo(lic.fecha_vencimiento),
      renovacion_meses: perpetua ? null : (Number(vacioANulo(lic.renovacion_meses) ?? 0) || null),
      costo,
      moneda: costo ? texto(lic.moneda) || 'PEN' : null,
      cuenta_id: cuentaId,
      clave,
      tiene_clave: !!clave,
      notas: texto(lic.notas) || '',
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    db.licencias.push(fila);
    return fila;
  },
};
