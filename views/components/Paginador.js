// views/components/Paginador.js
// Paginacion reutilizable para cualquier lista local (ya cargada en memoria).
//
// No sustituye la paginacion de servidor que ya tienen Alumnos y Cobros:
// esta es para las vistas que reciben todo el arreglo de golpe y lo pintaban
// completo, sin tope. Con 800 familias el navegador dibujaba 800 tarjetas.
//
// Uso en tres lineas:
//
//   var pg = usePaginacion(listaFiltrada, 25);
//   ...  pg.pagina.map(x => ...)                 // en vez de lista.map
//   ...  _jsxDEV(Paginador, { ctrl: pg })        // al final de la lista

var _hPG = React.createElement;

function usePaginacion(lista, porPaginaInicial) {
  var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo;
  var _a = useState(1), n = _a[0], setN = _a[1];
  var _b = useState(porPaginaInicial || 25), tam = _b[0], setTam = _b[1];

  var total = (lista || []).length;
  var totalPaginas = Math.max(1, Math.ceil(total / tam));

  // Si cambia el filtro y la pagina actual se queda fuera de rango, se vuelve
  // a la 1. Sin esto la lista aparece vacia y parece que no hay resultados.
  useEffect(function () {
    if (n > totalPaginas) setN(1);
  }, [totalPaginas, n]);

  var pagina = useMemo(function () {
    var desde = (Math.min(n, totalPaginas) - 1) * tam;
    return (lista || []).slice(desde, desde + tam);
  }, [lista, n, tam, totalPaginas]);

  return {
    pagina: pagina,
    n: Math.min(n, totalPaginas),
    totalPaginas: totalPaginas,
    total: total,
    tam: tam,
    ir: function (p) { setN(Math.min(Math.max(1, p), totalPaginas)); },
    cambiarTam: function (t) { setTam(t); setN(1); },
    reiniciar: function () { setN(1); }
  };
}

function Paginador({ ctrl, etiqueta, tamanos }) {
  if (!ctrl || ctrl.total === 0) return null;

  var opciones = tamanos || [10, 25, 50, 100];
  var desde = (ctrl.n - 1) * ctrl.tam + 1;
  var hasta = Math.min(ctrl.n * ctrl.tam, ctrl.total);
  var nombre = etiqueta || 'resultados';

  // Ventana de paginas alrededor de la actual, con primera y ultima siempre
  // visibles. Con 200 paginas no tiene sentido pintar 200 botones.
  var nums = [];
  var a = Math.max(1, ctrl.n - 2);
  var b = Math.min(ctrl.totalPaginas, ctrl.n + 2);
  if (a > 1) { nums.push(1); if (a > 2) nums.push('...'); }
  for (var i = a; i <= b; i++) nums.push(i);
  if (b < ctrl.totalPaginas) { if (b < ctrl.totalPaginas - 1) nums.push('..'); nums.push(ctrl.totalPaginas); }

  var btn = function (contenido, clave, alClic, desactivado, activo) {
    return _hPG('button', {
      key: clave,
      className: 'pag-btn' + (activo ? ' activo' : ''),
      disabled: !!desactivado,
      onClick: alClic
    }, contenido);
  };

  return _hPG('div', { className: 'paginador' },
    _hPG('div', { key: 'info', className: 'pag-info' },
      ctrl.total <= ctrl.tam
        ? ctrl.total + ' ' + nombre
        : desde + '\u2013' + hasta + ' de ' + ctrl.total + ' ' + nombre),

    ctrl.totalPaginas > 1
      ? _hPG('div', { key: 'nav', className: 'pag-nav' },
          btn('\u2039', 'prev', function () { ctrl.ir(ctrl.n - 1); }, ctrl.n <= 1),
          nums.map(function (p, i) {
            return typeof p === 'number'
              ? btn(String(p), 'p' + p, function () { ctrl.ir(p); }, false, p === ctrl.n)
              : _hPG('span', { key: 'e' + i, className: 'pag-elipsis' }, '\u2026');
          }),
          btn('\u203a', 'next', function () { ctrl.ir(ctrl.n + 1); }, ctrl.n >= ctrl.totalPaginas)
        )
      : null,

    _hPG('select', {
      key: 'tam',
      className: 'pag-tam',
      value: ctrl.tam,
      onChange: function (e) { ctrl.cambiarTam(parseInt(e.target.value, 10)); },
      title: 'Resultados por pagina'
    }, opciones.map(function (t) {
      return _hPG('option', { key: t, value: t }, t + ' por página');
    }))
  );
}
