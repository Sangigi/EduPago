// assets/js/ExcelExport.js — genera un archivo abrible en Excel CON FORMATO
// visual real (colores, negritas, bordes), sin agregar ninguna librería
// nueva al proyecto. Un CSV es texto plano puro — no puede llevar ningún
// estilo, sin importar cómo se arme — así que para que un reporte se vea
// como una hoja de cálculo de verdad se construye una tabla HTML con estilos
// inline y se guarda con extensión .xls: Excel la abre directo y respeta
// todo el formato, igual que si fuera un .xlsx nativo. Truco estándar, cero
// dependencias — coherente con que el resto del proyecto no usa bundler.
//
// El diseño (franja de título con color, encabezados de columna neutros con
// bordes limpios, filas de subtotal/total resaltadas) está inspirado en una
// plantilla de contabilidad real que compartió el usuario — cada grupo
// (ej. cada distribuidor en Comisiones.js) puede pedir su propia franja de
// color rotando por PALETA, igual que esa plantilla usa un color distinto
// por departamento (Contabilidad/Legal/Marketing).
const ExcelExport = (() => {
  // mso-number-format:"\@" es el código de Excel para forzar formato Texto.
  // Sin esto, Excel "interpreta" cualquier celda que se vea como número —
  // folios, referencias SPEI/CoDi/Efectivo de hasta 30 dígitos, teléfonos —
  // y les recorta los ceros a la izquierda o las convierte a notación
  // científica (ej. una referencia de pago se veía como "7.77878E+28",
  // ilegible e inútil para conciliar el pago real). Se aplica a TODAS las
  // celdas de dato: nada en estos reportes se piensa recalcular en Excel
  // (el TOTAL ya viene precalculado), así que no hay ninguna columna donde
  // convenga arriesgarse a que Excel decida "esto sí es un número de verdad".
  const TEXTO = 'mso-number-format:"\\@";';

  // Paleta de franjas por grupo — tomada de las variables de marca ya usadas
  // en toda la app (main.css): navy, verde, magenta, ámbar. Rota en ese
  // orden cuando hay varios grupos (ej. varios distribuidores).
  const PALETA = [
    { bg: '#282d65', borde: '#1c2050' }, // navy (marca)
    { bg: '#1f8a5f', borde: '#146645' }, // verde
    { bg: '#b0389a', borde: '#832a73' }, // magenta
    { bg: '#c2760f', borde: '#94590b' }, // ámbar
  ];
  const colorDe = i => PALETA[(i || 0) % PALETA.length];

  function estiloBase(nombre, color) {
    const base = {
      titulo:    `background:${PALETA[0].bg}; color:#ffffff; font-size:14px; font-weight:bold; padding:10px 8px;`,
      subtitulo: `background:${PALETA[0].bg}; color:#bdcf00; font-size:11px; font-weight:bold; padding:2px 8px 8px;`,
      // Encabezado de columna: neutro (blanco + borde negro), no de color —
      // así el color queda para las franjas de título/total, que es lo que
      // de verdad separa una sección de otra a simple vista.
      header:    'background:#f2f2f2; color:#1a1a1a; font-weight:bold; padding:6px 8px; border:1px solid #666666;',
      grupo:     `background:${color.bg}; color:#ffffff; font-weight:bold; padding:7px 8px; border:1px solid ${color.borde};`,
      dato:      'padding:5px 8px; border:1px solid #cccccc; background:#ffffff;',
      // Total de UN grupo (ej. el total de un solo distribuidor, o el único
      // total de una tabla sin grupos): se colorea a juego con su franja —
      // mismo criterio que la plantilla de referencia, donde el total de
      // "Contabilidad" es azul como su franja, el de "Legal" es verde, etc.
      total:      `background:${color.bg}; color:#ffffff; font-weight:bold; padding:6px 8px; border:1px solid ${color.borde};`,
      // Total GENERAL (suma de todos los grupos): siempre en el acento de
      // marca (lime), sin importar de qué grupo venga — es la única fila que
      // debe distinguirse de todas las franjas de color de arriba.
      granTotal:  'background:#bdcf00; color:#1a1a1a; font-weight:bold; font-size:13px; padding:9px 8px; border:2px solid #282d65;',
    };
    return (base[nombre] || base.dato) + TEXTO;
  }

  function escapar(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Los montos ($1,234.00) y porcentajes (5%) se alinean a la derecha, como
  // en cualquier hoja de cálculo real — todo lo demás (texto, folios,
  // referencias) se queda alineado a la izquierda por default.
  function celda(valor, estilo, colspan, color) {
    const css = estiloBase(estilo, color);
    const esNumerico = typeof valor === 'string' && (/^\$/.test(valor) || /%$/.test(valor));
    const alinear = esNumerico ? 'text-align:right;' : '';
    const cs = colspan ? ` colspan="${colspan}"` : '';
    const v = valor === null || valor === undefined || valor === '' ? '&nbsp;' : escapar(valor);
    // Comillas simples en el atributo: el valor de mso-number-format lleva
    // comillas dobles literales, que romperían un style="..." normal.
    return `<td style='${css}${alinear}'${cs}>${v}</td>`;
  }

  // filas: [{ estilo: 'titulo'|'subtitulo'|'header'|'grupo'|'dato'|'total'|'granTotal', celdas: [...], colspanPrimera?, color? }]
  // `color` (0..3, opcional) selecciona la franja de PALETA para esa fila —
  // solo aplica a 'grupo'/'total'; se usa para que cada grupo (ej. cada
  // distribuidor) tenga su franja Y su total de ese grupo en el mismo color.
  // 'granTotal' (la suma de TODOS los grupos, si los hay) siempre es lime,
  // sin importar `color` — es la fila que debe distinguirse de las demás.
  // Una fila con celdas: [] se muestra como espaciador en blanco.
  function descargar(nombreArchivo, filas) {
    const filasHtml = filas.map(f => {
      if (!f.celdas || f.celdas.length === 0) return '<tr><td style="padding:4px; border:none;">&nbsp;</td></tr>';
      const color = colorDe(f.color);
      const [primera, ...resto] = f.celdas;
      const tds = [celda(primera, f.estilo, f.colspanPrimera, color)]
        .concat(resto.map(v => celda(v, f.estilo, null, color)))
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
