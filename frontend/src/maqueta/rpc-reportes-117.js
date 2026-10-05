// Entradas del mapa RPC de la maqueta para los reportes centralizados de la
// migración 117 (firma de la base: mismos nombres y argumentos). La lógica vive
// en rpc-reportes-custodia.js, rpc-reportes-personas.js y rpc-reportes-gestion.js.
import { actorReportes } from './rpc-reportes.js';
import { reporteInventarioDe, reporteLicenciasDe, reporteCorreosDe } from './rpc-reportes-custodia.js';
import { reportePersonalDe, reporteSolicitudesDe, reporteEncuestasDe } from './rpc-reportes-personas.js';
import { reporteCambiosDe, reporteProblemasDe, reporteAuditoriaDe } from './rpc-reportes-gestion.js';

const quien = () => actorReportes().id;
const periodo = (args = {}) => ({ user: quien(), desde: args.p_desde, hasta: args.p_hasta });

export const RPC_REPORTES_117 = {
  reporte_inventario_equipos: (db) => reporteInventarioDe(db, { user: quien() }),
  reporte_licencias: (db) => reporteLicenciasDe(db, { user: quien() }),
  reporte_correos: (db) => reporteCorreosDe(db, { user: quien() }),
  reporte_personal: (db, args) => reportePersonalDe(db, periodo(args)),
  reporte_solicitudes: (db, args) => reporteSolicitudesDe(db, periodo(args)),
  reporte_cambios: (db, args) => reporteCambiosDe(db, periodo(args)),
  reporte_problemas: (db, args) => reporteProblemasDe(db, periodo(args)),
  reporte_encuestas: (db, args = {}) => reporteEncuestasDe(db, { user: quien(), ronda: args.p_ronda || null }),
  reporte_auditoria: (db, args) => reporteAuditoriaDe(db, periodo(args)),
};
