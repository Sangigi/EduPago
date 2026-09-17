// views/components/CodigoBarras.js
// Genera un codigo de barras Code128 en SVG, sin dependencias ni servicios
// externos.
//
// Por que existe: el proveedor de pagos puede devolver BarCode/PayFormat en
// null al generar referencias de efectivo. El sistema ya guarda y muestra
// esas URLs cuando llegan, pero si nunca llegan, el padre solo tenia una
// referencia larga para teclear a mano en la tienda.
//
// Aqui se dibuja a partir de la referencia que SI tenemos. Al ser SVG local
// no depende de la red ni del CSP, y se imprime nitido a cualquier tamano.
// Se usa tanto en el componente de React (CodigoBarras) como en el HTML
// autocontenido del comprobante imprimible (codigoBarrasSVG), que se abre en
// una ventana aparte sin acceso a React.

// Se resuelve al usarse, no al cargar el archivo: asi codigoBarrasSVG()
// sigue funcionando aunque React no este presente (por ejemplo si este
// archivo se carga en una ventana de impresion suelta).
function _hCB() {
  return React.createElement.apply(null, arguments);
}

// Patrones de barras de Code128. Cada valor son 6 pares (barra, espacio)
// expresados como anchos de modulo.
var _C128_PATRONES = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112'
];

// Codifica solo digitos usando Code128-C (dos digitos por simbolo), que es lo
// habitual para referencias bancarias y de tienda: mas compacto y menos
// propenso a errores de lectura.
function _c128Codificar(texto) {
  var datos = String(texto || '').replace(/\D/g, '');
  if (!datos) return null;
  // Code128-C necesita pares: si son impares se antepone un cero.
  if (datos.length % 2 === 1) datos = '0' + datos;

  var START_C = 105;
  var valores = [START_C];
  for (var i = 0; i < datos.length; i += 2) {
    valores.push(parseInt(datos.substr(i, 2), 10));
  }
  // Checksum: start + suma(valor * posicion), modulo 103
  var suma = START_C;
  for (var j = 1; j < valores.length; j++) suma += valores[j] * j;
  valores.push(suma % 103);
  valores.push(106); // STOP

  var patron = '';
  for (var k = 0; k < valores.length; k++) {
    patron += _C128_PATRONES[valores[k]];
  }
  return patron;
}

function CodigoBarras({ valor, alto, moduloPx, mostrarTexto, color }) {
  var patron = _c128Codificar(valor);
  if (!patron) return null;

  var h = alto || 70;
  var m = moduloPx || 2;          // ancho de un modulo
  var margen = 10 * m;            // zona muda que exige la norma
  var alturaTexto = mostrarTexto === false ? 0 : 16;

  // El patron alterna barra/espacio empezando por barra.
  var barras = [];
  var x = margen;
  var esBarra = true;
  for (var i = 0; i < patron.length; i++) {
    var ancho = parseInt(patron[i], 10) * m;
    if (esBarra) barras.push({ x: x, w: ancho });
    x += ancho;
    esBarra = !esBarra;
  }
  var anchoTotal = x + margen;
  var altoTotal = h + alturaTexto;

  return _hCB('div', { style: { width: '100%', overflowX: 'auto', textAlign: 'center' } },
    _hCB('svg', {
      viewBox: '0 0 ' + anchoTotal + ' ' + altoTotal,
      width: '100%',
      style: { maxWidth: anchoTotal, height: 'auto', display: 'inline-block' },
      role: 'img',
      'aria-label': 'Código de barras ' + valor
    },
      // Fondo blanco explicito: un lector no distingue barras sobre fondo
      // transparente si la tarjeta esta en tema oscuro.
      _hCB('rect', { key: 'bg', x: 0, y: 0, width: anchoTotal, height: altoTotal, fill: '#fff' }),
      barras.map(function (b, i) {
        return _hCB('rect', {
          key: 'b' + i, x: b.x, y: 0, width: b.w, height: h, fill: color || '#000'
        });
      }),
      mostrarTexto === false ? null : _hCB('text', {
        key: 't',
        x: anchoTotal / 2, y: h + 12,
        textAnchor: 'middle',
        style: { font: '11px monospace', letterSpacing: '1px' },
        fill: '#000'
      }, String(valor))
    )
  );
}

// Devuelve el codigo de barras como una cadena SVG, para insertarlo en HTML
// generado fuera de React — por ejemplo el comprobante imprimible de Caja o
// del Portal de Familia, que se abre en una ventana nueva y no tiene acceso
// a los componentes.
function codigoBarrasSVG(valor, opciones) {
  var o = opciones || {};
  var patron = _c128Codificar(valor);
  if (!patron) return '';

  var h = o.alto || 80;
  var m = o.modulo || 2;
  var margen = 10 * m;
  var alturaTexto = o.mostrarTexto === false ? 0 : 18;

  var rects = '';
  var x = margen;
  var esBarra = true;
  for (var i = 0; i < patron.length; i++) {
    var ancho = parseInt(patron[i], 10) * m;
    if (esBarra) {
      rects += '<rect x="' + x + '" y="0" width="' + ancho + '" height="' + h + '" fill="#000"/>';
    }
    x += ancho;
    esBarra = !esBarra;
  }
  var anchoTotal = x + margen;
  var altoTotal = h + alturaTexto;
  var texto = o.mostrarTexto === false ? '' :
    '<text x="' + (anchoTotal / 2) + '" y="' + (h + 14) + '" text-anchor="middle"'
    + ' font-family="monospace" font-size="12" letter-spacing="1" fill="#000">'
    + String(valor).replace(/[<>&]/g, '') + '</text>';

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + anchoTotal + ' ' + altoTotal + '"'
       + ' width="100%" style="max-width:' + anchoTotal + 'px;height:auto">'
       + '<rect x="0" y="0" width="' + anchoTotal + '" height="' + altoTotal + '" fill="#fff"/>'
       + rects + texto + '</svg>';
}
