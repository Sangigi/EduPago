// views/components/Paginacion.js — Paginación numerada (1, 2, 3 …)
//
// El sistema ya tenía paginación en Cobros, Alumnos, Gastos y Logs, pero de
// otro tipo: la de esas pantallas es de SERVIDOR (pide por_pagina=25 al backend)
// y solo ofrece "anterior / siguiente". Esta es de CLIENTE y numerada, para
// listas que ya llegan completas en memoria — Escuelas registradas e
// Invitaciones — donde partir la lista en el navegador es suficiente y evita
// tocar el backend.
//
// `var` y no `const` a nivel raíz: si el archivo se carga dos veces, un `const`
// lanza "Identifier already declared" y ese error tumba TODA la aplicación.
// Mismo criterio que views/components/MenuPerfil.js.
var _hPG = React.createElement;

// Devuelve los números a pintar, con elipsis cuando hay muchas páginas:
//   1 2 3 4 5 … 20        (al principio)
//   1 … 9 10 11 … 20      (en medio)
//   1 … 16 17 18 19 20    (al final)
// El 0 representa una elipsis. Sin esto, 50 páginas pintarían 50 botones y la
// barra se desbordaría.
function paginasVisibles(actual, total) {
  if (total <= 7) {
    var todas = [];
    for (var i = 1; i <= total; i++) todas.push(i);
    return todas;
  }
  if (actual <= 4)          return [1, 2, 3, 4, 5, 0, total];
  if (actual >= total - 3)  return [1, 0, total - 4, total - 3, total - 2, total - 1, total];
  return [1, 0, actual - 1, actual, actual + 1, 0, total];
}

function Paginacion({ pagina, totalPaginas, onCambiar, etiqueta }) {
  // Una sola página no necesita controles: pintarlos sería ruido.
  if (!totalPaginas || totalPaginas <= 1) return null;

  var irA = function (p) {
    if (p < 1 || p > totalPaginas || p === pagina) return;
    if (typeof onCambiar === 'function') onCambiar(p);
  };

  var btn = function (contenido, destino, activo, deshabilitado, llave) {
    return _hPG('button', {
      key: llave,
      className: 'btn btn-sm ' + (activo ? 'btn-primary' : 'btn-ghost'),
      disabled: !!deshabilitado,
      onClick: function () { irA(destino); },
      style: {
        minWidth: 30, padding: '3px 8px', fontSize: 12.5,
        opacity: deshabilitado ? 0.4 : 1,
        cursor: deshabilitado ? 'default' : 'pointer'
      }
    }, contenido);
  };

  return _hPG('div', {
    style: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }
  },
    etiqueta ? _hPG('span', {
      key: 'et',
      style: { fontSize: 12, color: 'var(--ink-3)', marginRight: 6 }
    }, etiqueta) : null,

    btn('‹', pagina - 1, false, pagina <= 1, 'prev'),

    paginasVisibles(pagina, totalPaginas).map(function (n, i) {
      // 0 = elipsis. Lleva key por índice porque puede repetirse en la misma
      // barra (hay dos elipsis cuando estás en medio).
      if (n === 0) {
        return _hPG('span', {
          key: 'e' + i,
          style: { padding: '0 3px', color: 'var(--ink-4)', fontSize: 12.5 }
        }, '…');
      }
      return btn(String(n), n, n === pagina, false, 'p' + n);
    }),

    btn('›', pagina + 1, false, pagina >= totalPaginas, 'next')
  );
}
