// assets/js/ExcelExport.js — genera un archivo abrible en Excel CON FORMATO
// visual real (colores, negritas, bordes), sin agregar ninguna librería
// nueva al proyecto. Un CSV es texto plano puro — no puede llevar ningún
// estilo, sin importar cómo se arme — así que para que un reporte se vea
// como una hoja de cálculo de verdad (secciones con color, encabezados en
// negrita, fila de total resaltada) se construye una tabla HTML con estilos
// inline y se guarda con extensión .xls: Excel la abre directo y respeta
// todo el formato, igual que si fuera un .xlsx nativo. Truco estándar, cero
// dependencias — coherente con que el resto del proyecto no usa bundler.
const ExcelExport = (() => {
  // Paleta tomada de las variables de marca ya usadas en toda la app
  // (--navy/--lime en main.css) para que el archivo descargado se sienta
  // del mismo sistema, no un elemento ajeno.
  const ESTILOS = {
    titulo:    'background:#282d65; color:#ffffff; font-size:14px; font-weight:bold; padding:10px 8px;',
    subtitulo: 'background:#282d65; color:#bdcf00; font-size:11px; font-weight:bold; padding:2px 8px 8px;',
    header:    'background:#282d65; color:#ffffff; font-weight:bold; padding:6px 8px; border:1px solid #1c2050;',
    grupo:     'background:#e8ecf7; color:#282d65; font-weight:bold; padding:6px 8px; border:1px solid #c7cfe8;',
    dato:      'padding:5px 8px; border:1px solid #d9dce6; background:#ffffff;',
    subtotal:  'background:#f3f4f8; color:#282d65; font-weight:bold; padding:6px 8px; border:1px solid #d9dce6; border-top:2px solid #282d65;',
    total:     'background:#bdcf00; color:#1a1a1a; font-weight:bold; font-size:13px; padding:9px 8px; border:2px solid #282d65;',
  };

  function escapar(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function celda(valor, estilo, colspan) {
    const css = ESTILOS[estilo] || ESTILOS.dato;
    const cs = colspan ? ` colspan="${colspan}"` : '';
    const v = valor === null || valor === undefined || valor === '' ? '&nbsp;' : escapar(valor);
    return `<td style="${css}"${cs}>${v}</td>`;
  }

  // filas: [{ estilo: 'titulo'|'subtitulo'|'header'|'grupo'|'dato'|'subtotal'|'total', celdas: [...], colspanPrimera? }]
  // Una fila con celdas: [] se muestra como espaciador en blanco.
  function descargar(nombreArchivo, filas) {
    const filasHtml = filas.map(f => {
      if (!f.celdas || f.celdas.length === 0) return '<tr><td style="padding:4px; border:none;">&nbsp;</td></tr>';
      const [primera, ...resto] = f.celdas;
      const tds = [celda(primera, f.estilo, f.colspanPrimera)]
        .concat(resto.map(v => celda(v, f.estilo)))
        .join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
      '<table style="border-collapse:collapse; font-family:Calibri,Arial,sans-serif; font-size:12px;">' +
      filasHtml + '</table></body></html>';
    const nombre = nombreArchivo.endsWith('.xls') ? nombreArchivo : nombreArchivo + '.xls';
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { descargar };
})();
