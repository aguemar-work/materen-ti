// Maqueta del portal del empleado (109, 122): «Mis tickets» lista solo los
// tickets activos — ni resueltos, ni cerrados, ni rechazados — con el MISMO
// filtro que portal_abrir en la migración 122 (hallazgo PROC-CIERRE-09).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLAS } from '../src/maqueta/datos.js';
import { funcionPortal } from '../src/maqueta/rpc-portal.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/122_portal_sin_rechazados.sql', import.meta.url)), 'utf8');
const clonar = (v) => JSON.parse(JSON.stringify(v));

describe('maqueta del portal: «Mis tickets» solo con los activos', () => {
  it('el filtro de la migración 122 excluye resuelto, cerrado y rechazado', () => {
    expect(SQL).toContain("and tk.estado not in ('resuelto', 'cerrado', 'rechazado')");
  });

  it('un rechazado, un resuelto y un cerrado del empleado no aparecen; los activos sí', () => {
    const db = clonar(TABLAS);
    const base = { titulo: 'x', empleado_id: 'e01', created_at: '2026-10-20T10:00:00-05:00' };
    db.tickets.push(
      { ...base, id: 'tp1', codigo: 'TCK-P001', estado: 'abierto' },
      { ...base, id: 'tp2', codigo: 'TCK-P002', estado: 'en_progreso' },
      { ...base, id: 'tp3', codigo: 'TCK-P003', estado: 'reabierto' },
      { ...base, id: 'tp4', codigo: 'TCK-P004', estado: 'rechazado' },
      { ...base, id: 'tp5', codigo: 'TCK-P005', estado: 'resuelto' },
      { ...base, id: 'tp6', codigo: 'TCK-P006', estado: 'cerrado' },
    );
    const r = funcionPortal(db, { action: 'abrir', token: 'maqueta-portal-completo' });
    const codigos = r.tickets.map((t) => t.codigo);
    expect(codigos).toEqual(expect.arrayContaining(['TCK-P001', 'TCK-P002', 'TCK-P003']));
    expect(codigos).not.toContain('TCK-P004');
    expect(codigos).not.toContain('TCK-P005');
    expect(codigos).not.toContain('TCK-P006');
    expect(r.tickets.every((t) => !['rechazado', 'resuelto', 'cerrado'].includes(t.estado))).toBe(true);
  });
});
