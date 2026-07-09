// Exportación a CSV compatible con Excel: BOM UTF-8 para que Excel
// respete acentos/ñ al abrirlo con doble clic. Usado por el botón
// "Exportar" de los módulos con tabla.
export function exportarCSV(nombreArchivo, columnas, filas) {
  const esc = (v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`;
  const csv = [columnas.map(esc).join(','), ...filas.map((f) => f.map(esc).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
