// views/components/Cargando.js
// Animacion de espera para la carga de secciones.
//
// Sustituye el texto plano "Cargando…" por un esqueleto: bloques grises con
// un barrido de luz que imitan la forma de lo que va a aparecer. Se prefiere
// al típico círculo giratorio porque da sensación de avance y evita el salto
// visual cuando el contenido real entra en su lugar.
//
// Respeta prefers-reduced-motion: si el sistema lo pide, la animación se
// detiene y solo quedan los bloques.

function _hCG() {
  return React.createElement.apply(null, arguments);
}

// Un bloque del esqueleto. `w` acepta porcentaje o pixeles.
function Bloque({ w, h, r, ml, mt }) {
  return _hCG('div', {
    className: 'sk-bloque',
    style: {
      width: w || '100%',
      height: h || 14,
      borderRadius: r === undefined ? 7 : r,
      marginLeft: ml || 0,
      marginTop: mt || 0
    }
  });
}

// Tarjeta de métrica: azulejo de icono, número grande y etiqueta
function _skTarjeta(clave) {
  return _hCG('div', { key: clave, className: 'sk-card' },
    _hCG(Bloque, { key: 'i', w: 40, h: 40, r: 13 }),
    _hCG(Bloque, { key: 'v', w: '62%', h: 24, r: 8, mt: 16 }),
    _hCG(Bloque, { key: 'l', w: '45%', h: 11, mt: 10 }),
    _hCG(Bloque, { key: 'm', w: '34%', h: 10, mt: 8 })
  );
}

// Fila de tabla
// Los anchos son proporciones, no medidas fijas: con porcentajes exactos la
// suma mas los espacios entre columnas pasaba del 100% y la fila se salia
// del panel.
function _skFila(clave, proporciones) {
  return _hCG('div', { key: clave, className: 'sk-fila' },
    proporciones.map(function (f, i) {
      return _hCG('div', { key: i, style: { flex: f + ' 1 0', minWidth: 0 } },
        _hCG(Bloque, { h: 12 }));
    })
  );
}

// variante: 'seccion' (por omision) | 'tabla' | 'simple'
function Cargando({ variante, texto, filas }) {
  var v = variante || 'seccion';

  if (v === 'simple') {
    return _hCG('div', { className: 'sk-simple' },
      _hCG('div', { key: 'p', className: 'sk-puntos' },
        _hCG('span', { key: 1 }), _hCG('span', { key: 2 }), _hCG('span', { key: 3 })),
      texto ? _hCG('div', { key: 't', className: 'sk-texto' }, texto) : null
    );
  }

  var n = filas || 5;
  var cuerpo = [];

  if (v === 'seccion') {
    cuerpo.push(_hCG('div', { key: 'stats', className: 'sk-grid' },
      [0, 1, 2, 3].map(function (i) { return _skTarjeta('t' + i); })));
  }

  cuerpo.push(_hCG('div', { key: 'panel', className: 'sk-panel' },
    _hCG('div', { key: 'h', className: 'sk-panel-head' },
      _hCG(Bloque, { w: 180, h: 15, r: 7 }),
      _hCG(Bloque, { w: 96, h: 30, r: 15 })
    ),
    _skFila('enc', [22, 30, 16, 16, 16]),
    Array.apply(null, Array(n)).map(function (_, i) {
      // Se alterna el ancho para que no parezca una rejilla rígida
      var a = i % 2
        ? [20, 32, 14, 18, 16]
        : [24, 28, 18, 14, 16];
      return _skFila('f' + i, a);
    })
  ));

  return _hCG('div', {
    className: 'sk-envoltura',
    role: 'status',
    'aria-live': 'polite',
    'aria-label': texto || 'Cargando contenido'
  }, cuerpo);
}
