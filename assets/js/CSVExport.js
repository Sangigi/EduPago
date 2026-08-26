// assets/js/CSVExport.js — helper compartido para exportar CSV desde el
// navegador. Antes cada vista (Cobros.js, Reportes.js, SuperReportes.js)
// reimplementaba su propio exportarCSV a mano: sin separador de miles en los
// montos, sin fila de total, y usando una data: URI (con límite de tamaño en
// algunos navegadores) en vez de un Blob. Se centraliza aquí con un estilo
// consistente en todo el sistema: montos en pesos con separador de miles
// (mismo criterio que distFmtMoney en Distribuidor.js) y, donde aplica, una
// fila TOTAL al final — mismo criterio que el reporte de comisiones.
const CSVExport = (() => {
  function money(n) {
    const v = Number(n) || 0;
    return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Cualquier celda con coma, comilla o salto de línea necesita comillas (y
  // escapar comillas internas) para no romper las columnas — antes esto se
  // hacía a mano solo para el campo "Cliente", sin escapar comillas internas.
  function celda(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function descargar(nombreArchivo, filas) {
    const csv = filas.map(fila => fila.map(celda).join(',')).join('\r\n');
    // BOM al inicio: sin esto, Excel en Windows a veces muestra acentos/ñ/el
    // signo de peso rotos en un CSV UTF-8 (mismo criterio que ya usaba
    // Alumnos.js para la plantilla de importación).
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { money, celda, descargar };
})();
