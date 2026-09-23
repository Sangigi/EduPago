// views/components/GuiaPrimerUso.js — Guía de primer uso
//
// SEÑALA la sección real del menú y muestra una ventanita chica al lado con
// una frase. No es un modal de texto con el fondo borroso: eso no se lee, se
// salta. Aquí el usuario ve DÓNDE está cada cosa mientras se la explican.
//
// Cómo funciona el resaltado: un div transparente se coloca exactamente encima
// del ítem del menú y lleva `box-shadow: 0 0 0 9999px rgba(...)`. Esa sombra
// enorme oscurece TODO lo demás y deja el ítem iluminado, sin tener que
// recortar nada ni mover el elemento de su sitio. El ítem se localiza por
// [data-nav="<id>"], atributo que pone assets/js/app.js.
//
// DECISIONES QUE CONVIENE NO DESHACER SIN LEER:
//
// · `var` y no `const` a nivel raíz. Igual que views/components/MenuPerfil.js:
//   si el archivo se carga dos veces, un `const` lanza "Identifier already
//   declared" y ese error tumba TODA la aplicación, no solo la guía.
//
// · React.createElement directo (var _hG), NO el shim _jsxDEV. En el shim los
//   hijos van en props.children y el 3er argumento posicional es la key; pasar
//   hijos ahí los convierte en key y la pantalla queda vacía sin error.
//
// · Los pasos se FILTRAN contra el menú real del usuario. Explicarle
//   "Facturación" a un negocio independiente —que no puede facturar— lo
//   mandaría a buscar algo que no existe en su pantalla.
//
// · Si el ítem no se encuentra o no es visible (móvil con el menú cerrado,
//   sección fuera de pantalla), la guía NO se rompe: cae a una tarjeta
//   centrada sin resaltado. Vale más una guía sin flecha que una guía rota.

var _hG = React.createElement;

// Una frase por sección. Cortas a propósito: la guía señala, no enseña.
// `id` tiene que coincidir con el id de NAV_ITEMS en assets/js/app.js.
var GUIA_PASOS = [
  {
    id: 'mi_cuenta',
    titulo: 'Empieza aquí',
    texto: 'Configura tu colegio y sube tus documentos. Sin esto no puedes cobrar.',
    clave: true,
  },
  { id: 'alumnos',       titulo: 'Tus alumnos',      texto: 'Da de alta a los alumnos y ligarlos a su familia.' },
  { id: 'familias',      titulo: 'Las familias',     texto: 'Cada familia entra a su portal, ve lo que debe y paga.' },
  { id: 'productos',     titulo: 'Qué vas a cobrar', texto: 'Colegiaturas, inscripciones, uniformes. Los recurrentes se generan solos cada mes.' },
  { id: 'caja',          titulo: 'Cobrar',           texto: 'Tu pantalla del día a día: efectivo, tarjeta, SPEI o pago en tiendas.' },
  { id: 'corte_caja',    titulo: 'Cerrar el día',    texto: 'Cuadra lo que cobraste contra lo que hay en la caja.' },
  { id: 'cobros',        titulo: 'Historial',        texto: 'Todo lo cobrado, con su estado y su comprobante.' },
  { id: 'facturacion',   titulo: 'Facturar',         texto: 'Emite facturas de los pagos que recibas.' },
  { id: 'recordatorios', titulo: 'Recordatorios',    texto: 'El sistema le avisa solo a quien trae adeudo.' },
  { id: 'gastos',        titulo: 'Gastos',           texto: 'Registra lo que el colegio paga, para ver el panorama completo.' },
  { id: 'reportes',      titulo: 'Reportes',         texto: 'Cuánto entró, por qué método y quién te debe.' },
  { id: 'miequipo',      titulo: 'Tu equipo',        texto: 'Da de alta cajeros y administradores.' },
];

function GuiaPrimerUso({ seccionesVisibles, escuela, onIrA, onCerrar }) {
  var _R = React;
  var e1 = _R.useState(0);       var paso = e1[0],  setPaso = e1[1];
  // Rectángulo del ítem señalado, o null si no se pudo ubicar.
  var e2 = _R.useState(null);    var caja = e2[0],  setCaja = e2[1];

  var pasos = GUIA_PASOS.filter(function (p) {
    return !seccionesVisibles || seccionesVisibles.indexOf(p.id) !== -1;
  });

  var idx = Math.min(paso, Math.max(pasos.length - 1, 0));
  var actual = pasos[idx];

  // Ubica el ítem del menú de este paso. Se recalcula al cambiar de paso y al
  // redimensionar: el menú se mueve con el ancho de la ventana.
  //
  // El hook va ANTES de cualquier return condicional — las reglas de hooks de
  // React no permiten llamarlos de forma condicional, y un `if (!pasos.length)
  // return null` arriba haría que en ese render se ejecuten menos hooks que en
  // el anterior, lo que rompe la app entera.
  _R.useEffect(function () {
    if (!actual) { setCaja(null); return; }

    var medir = function () {
      var el = document.querySelector('[data-nav="' + actual.id + '"]');
      if (!el) { setCaja(null); return; }
      // El ítem puede estar más abajo del alto visible del menú. `nearest`
      // mueve lo mínimo indispensable: con 'center' u otros, el navegador
      // también desplaza contenedores padre y la pantalla entera da un brinco
      // — es el mismo tipo de efecto que ya costó un bug en PortalFamilia.
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}

      var r = el.getBoundingClientRect();

      // Tres formas de estar oculto, y las tres tienen que caer al modo
      // centrado en vez de dibujar un foco sobre la nada:
      //   · ancho/alto en 0  -> display:none o menú colapsado
      //   · fuera de pantalla -> en móvil el sidebar sigue en el DOM pero
      //     desplazado con transform, así que su rect es negativo, NO cero
      //   · sin espacio a la vista
      var oculto = r.width < 4 || r.height < 4
                || r.right < 8 || r.bottom < 8
                || r.left > window.innerWidth - 8
                || r.top > window.innerHeight - 8;
      if (oculto) { setCaja(null); return; }

      setCaja({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return function () {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [actual && actual.id]);

  if (pasos.length === 0 || !actual) return null;

  var esUltimo = idx >= pasos.length - 1;
  var docEstado = (escuela && escuela.documentacion_estado) || 'sin_enviar';
  var docsPendientes = docEstado !== 'aprobada';

  var cerrar = function () { if (typeof onCerrar === 'function') onCerrar(); };
  var irYCerrar = function () {
    if (typeof onIrA === 'function') onIrA(actual.id);
    cerrar();
  };

  var PAD = 6;   // aire alrededor del ítem resaltado
  var ANCHO = 290;

  // Posición de la ventanita. Al lado derecho del ítem si cabe; si no, debajo.
  // Sin `caja` (ítem no ubicable) queda centrada en pantalla.
  var posTarjeta;
  if (caja) {
    var derecha = caja.left + caja.width + PAD + 12;
    var cabeALado = derecha + ANCHO < window.innerWidth - 12;
    posTarjeta = cabeALado
      ? { top: Math.max(12, Math.min(caja.top - 8, window.innerHeight - 260)), left: derecha }
      : { top: Math.min(caja.top + caja.height + PAD + 10, window.innerHeight - 250),
          left: Math.max(12, Math.min(caja.left, window.innerWidth - ANCHO - 12)) };
  } else {
    posTarjeta = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
  }

  var hijos = [];

  // ── Capa de foco ──
  // Con `caja`: un recuadro transparente sobre el ítem, con una sombra enorme
  // que oscurece todo lo demás. Sin `caja`: un velo normal.
  if (caja) {
    hijos.push(_hG('div', {
      key: 'foco',
      style: {
        position: 'fixed',
        top: caja.top - PAD, left: caja.left - PAD,
        width: caja.width + PAD * 2, height: caja.height + PAD * 2,
        borderRadius: 10,
        // pointerEvents:'none' para no bloquear el clic sobre el ítem real:
        // si alguien quiere ir a esa sección desde aquí, que pueda.
        pointerEvents: 'none',
        boxShadow: '0 0 0 9999px rgba(10,12,24,.66), 0 0 0 2px var(--accent)',
        transition: 'top .18s ease, left .18s ease, width .18s ease, height .18s ease',
        zIndex: 9000,
      }
    }));
  } else {
    hijos.push(_hG('div', {
      key: 'velo',
      style: {
        position: 'fixed', inset: 0, background: 'rgba(10,12,24,.66)', zIndex: 9000,
      }
    }));
  }

  // ── Ventanita ──
  hijos.push(_hG('div', {
    key: 'card',
    style: Object.assign({
      position: 'fixed',
      width: ANCHO,
      maxWidth: 'calc(100vw - 24px)',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-glow)',
      borderRadius: 12,
      boxShadow: '0 12px 32px rgba(0,0,0,.34)',
      padding: '14px 16px 12px',
      zIndex: 9001,
    }, posTarjeta)
  },
    _hG('div', {
      key: 'n',
      style: { fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: .3 }
    }, (idx + 1) + ' de ' + pasos.length),

    _hG('div', {
      key: 't',
      style: { fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: '3px 0 5px' }
    }, actual.titulo),

    _hG('div', {
      key: 'x',
      style: { fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)' }
    }, actual.texto),

    // El énfasis en documentos: solo en el primer paso y solo si de verdad
    // faltan. Una sola línea — el detalle ya está en la propia pantalla.
    (actual.clave && docsPendientes) ? _hG('div', {
      key: 'doc',
      style: {
        marginTop: 9, padding: '8px 10px', borderRadius: 8,
        background: 'var(--amber-glow)', border: '1px solid var(--amber)',
        fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-2)'
      }
    }, 'La revisión de documentos tarda de 48 a 72 horas. Conviene subirlos hoy.') : null,

    _hG('div', {
      key: 'b',
      style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }
    },
      _hG('button', {
        key: 's', className: 'btn btn-ghost btn-sm',
        style: { fontSize: 11.5, padding: '4px 8px' },
        onClick: cerrar
      }, 'Saltar'),

      _hG('div', { key: 'sp', style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
        idx > 0 ? _hG('button', {
          key: 'p', className: 'btn btn-ghost btn-sm',
          style: { fontSize: 11.5, padding: '4px 10px' },
          onClick: function () { setPaso(idx - 1); }
        }, 'Atrás') : null,

        _hG('button', {
          key: 'n', className: 'btn btn-primary btn-sm',
          style: { fontSize: 11.5, padding: '4px 12px' },
          onClick: function () { if (esUltimo) { irYCerrar(); } else { setPaso(idx + 1); } }
        }, esUltimo ? 'Empezar' : 'Siguiente')
      )
    )
  ));

  // Fragment y no un div contenedor: un div con position:fixed encima de todo
  // interceptaría los clics de la aplicación aunque sus hijos no lo hagan.
  return _hG(React.Fragment, null, hijos);
}
