// views/components/GuiaPrimerUso.js — Guía de primer uso
//
// Señala la sección real del menú y muestra al lado una tarjeta con una
// ILUSTRACIÓN de cómo se ve esa sección cuando ya tiene datos.
//
// POR QUÉ NO LLEVA AL USUARIO A CADA SECCIÓN DE VERDAD:
//
// Una versión anterior navegaba sección por sección. Se sentía bien en teoría
// y era inútil en la práctica: esto corre en el PRIMER INGRESO, cuando el
// colegio todavía no tiene un solo alumno, ni un concepto de pago, ni un
// cobro. Alumnos sale vacío, Reportes sale en ceros, y Caja ni siquiera se
// puede ver hasta que alguien abre el turno. Enseñar pantallas vacías no
// enseña el sistema: enseña que el sistema está vacío.
//
// Por eso cada paso trae un dibujo pequeño de cómo se ve ESA sección
// funcionando. El usuario entiende la forma de la pantalla —una lista, un
// carrito con su total, una gráfica— sin depender de datos que aún no existe.
//
// El velo es deliberadamente claro (.42). Con uno oscuro, el sistema de atrás
// deja de leerse y la guía pierde su mitad visual: la idea es que se vea el
// menú real iluminado, no una caja de texto flotando en negro.
//
// DECISIONES QUE CONVIENE NO DESHACER SIN LEER:
//
// · `var` y no `const` a nivel raíz. Igual que views/components/MenuPerfil.js:
//   si el archivo se carga dos veces, un `const` lanza "Identifier already
//   declared" y ese error tumba TODA la aplicación, no solo la guía.
//
// · React.createElement directo (var _hG), NO el shim _jsxDEV. En el shim los
//   hijos van en props.children y el 3er argumento posicional es la key.
//
// · Las ilustraciones usan var(--...) para el color, así que siguen el tema
//   claro/oscuro solas. Nada de colores fijos.
//
// · Los pasos se FILTRAN contra el menú real del usuario: a un negocio
//   independiente no se le explica Facturación, porque no la tiene.

var _hG = React.createElement;

// ── Ayudantes de dibujo ────────────────────────────────────────────────
// Bloques mínimos para armar los bocetos sin repetir atributos de SVG.
// `t` (tono) va de 0 a 1 y decide qué tan presente está la forma: lo
// estructural va tenue, lo que importa va en color.
function _gRect(x, y, w, h, t, color, radio) {
  return _hG('rect', {
    key: 'r' + x + '-' + y + '-' + w,
    x: x, y: y, width: w, height: h, rx: radio === undefined ? 3 : radio,
    fill: color || 'currentColor', opacity: t === undefined ? 0.18 : t
  });
}
function _gCirc(cx, cy, r, t, color) {
  return _hG('circle', {
    key: 'c' + cx + '-' + cy, cx: cx, cy: cy, r: r,
    fill: color || 'currentColor', opacity: t === undefined ? 0.18 : t
  });
}
function _gLienzo(hijos) {
  return _hG('svg', {
    viewBox: '0 0 280 104',
    width: '100%',
    height: 'auto',
    // El color del texto del tema es la base de todo el boceto, así que las
    // formas "estructurales" se aclaran u oscurecen solas con el tema.
    style: { display: 'block', color: 'var(--ink)' },
    'aria-hidden': 'true'
  }, hijos);
}

var _AC = 'var(--accent)';
var _VE = 'var(--green)';
var _AM = 'var(--amber)';

// Una fila de lista: avatar + dos barras de texto.
function _gFila(y, anchoTexto, resaltada) {
  return _hG('g', { key: 'f' + y },
    _gCirc(24, y + 9, 7, resaltada ? 0.9 : 0.16, resaltada ? _AC : null),
    _gRect(38, y + 3, anchoTexto, 5, resaltada ? 0.5 : 0.16),
    _gRect(38, y + 12, anchoTexto * 0.6, 4, 0.1)
  );
}

// ── Ilustraciones, una por sección ─────────────────────────────────────
var GUIA_DIBUJOS = {
  // Tres tarjetas de número + una línea de tendencia.
  dashboard: function () {
    return _gLienzo([
      _gRect(12, 10, 78, 40, 0.07), _gRect(101, 10, 78, 40, 0.07), _gRect(190, 10, 78, 40, 0.07),
      _gRect(20, 18, 30, 4, 0.14), _gRect(20, 28, 46, 9, 0.75, _AC),
      _gRect(109, 18, 30, 4, 0.14), _gRect(109, 28, 40, 9, 0.28),
      _gRect(198, 18, 30, 4, 0.14), _gRect(198, 28, 44, 9, 0.28),
      _hG('polyline', {
        key: 'ln', fill: 'none', stroke: _AC, strokeWidth: 2.4,
        strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.85,
        points: '16,90 58,76 100,82 142,62 184,68 226,48 264,54'
      })
    ]);
  },
  // Lista de alumnos.
  alumnos: function () {
    return _gLienzo([
      _gRect(12, 8, 256, 88, 0.05),
      _gFila(16, 120, true), _gFila(44, 100), _gFila(72, 132)
    ]);
  },
  // Una familia con dos hijos colgando.
  familias: function () {
    return _gLienzo([
      _gRect(12, 8, 256, 88, 0.05),
      _gCirc(60, 32, 11, 0.85, _AC),
      _gRect(80, 26, 74, 6, 0.45), _gRect(80, 37, 50, 4, 0.12),
      _hG('path', {
        key: 'p1', d: 'M60 46 V62 H108', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, opacity: 0.22
      }),
      _hG('path', {
        key: 'p2', d: 'M60 62 V82 H108', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, opacity: 0.22
      }),
      _gCirc(116, 62, 7, 0.2), _gRect(130, 59, 62, 5, 0.16),
      _gCirc(116, 82, 7, 0.2), _gRect(130, 79, 48, 5, 0.16)
    ]);
  },
  // Conceptos con precio; uno marcado como recurrente.
  productos: function () {
    return _gLienzo([
      _gRect(12, 10, 256, 24, 0.06), _gRect(22, 18, 92, 7, 0.4), _gRect(210, 18, 46, 7, 0.75, _AC),
      _gRect(12, 40, 256, 24, 0.06), _gRect(22, 48, 74, 7, 0.22), _gRect(210, 48, 46, 7, 0.22),
      _gRect(12, 70, 256, 24, 0.06), _gRect(22, 78, 84, 7, 0.22), _gRect(210, 78, 46, 7, 0.22),
      // Etiqueta "recurrente" sobre el primero.
      _gRect(122, 17, 52, 9, 0.85, _VE, 4.5)
    ]);
  },
  // Carrito con su total resaltado.
  caja: function () {
    return _gLienzo([
      _gRect(12, 8, 158, 88, 0.05),
      _gRect(22, 18, 84, 6, 0.2), _gRect(126, 18, 34, 6, 0.16),
      _gRect(22, 34, 68, 6, 0.2), _gRect(126, 34, 34, 6, 0.16),
      _gRect(22, 50, 76, 6, 0.2), _gRect(126, 50, 34, 6, 0.16),
      _hG('line', {
        key: 'sep', x1: 22, y1: 66, x2: 160, y2: 66,
        stroke: 'currentColor', strokeWidth: 1, opacity: 0.16
      }),
      _gRect(22, 74, 44, 8, 0.45), _gRect(112, 72, 48, 11, 0.85, _AC),
      // Métodos de pago a la derecha.
      _gRect(180, 8, 88, 26, 0.85, _AC, 6),
      _gRect(180, 40, 88, 26, 0.07), _gRect(180, 70, 88, 26, 0.07)
    ]);
  },
  // Esperado contra contado, y la diferencia.
  corte_caja: function () {
    return _gLienzo([
      _gRect(12, 10, 122, 84, 0.06), _gRect(146, 10, 122, 84, 0.06),
      _gRect(24, 22, 52, 5, 0.16), _gRect(24, 34, 74, 10, 0.4),
      _gRect(158, 22, 52, 5, 0.16), _gRect(158, 34, 74, 10, 0.4),
      _gRect(24, 62, 96, 7, 0.12), _gRect(158, 62, 96, 7, 0.12),
      _gRect(24, 76, 62, 8, 0.85, _VE)
    ]);
  },
  // Tabla de cobros con pastillas de estado.
  cobros: function () {
    return _gLienzo([
      _gRect(12, 8, 256, 16, 0.09),
      _gRect(12, 28, 256, 20, 0.05), _gRect(22, 35, 78, 6, 0.22), _gRect(120, 35, 44, 6, 0.16), _gRect(212, 33, 46, 10, 0.85, _VE, 5),
      _gRect(12, 52, 256, 20, 0.05), _gRect(22, 59, 66, 6, 0.22), _gRect(120, 59, 44, 6, 0.16), _gRect(212, 57, 46, 10, 0.85, _AM, 5),
      _gRect(12, 76, 256, 20, 0.05), _gRect(22, 83, 84, 6, 0.22), _gRect(120, 83, 44, 6, 0.16), _gRect(212, 81, 46, 10, 0.85, _VE, 5)
    ]);
  },
  // Documento timbrado.
  facturacion: function () {
    return _gLienzo([
      _gRect(78, 6, 124, 92, 0.07, null, 6),
      _gRect(92, 20, 66, 6, 0.3), _gRect(92, 34, 96, 4, 0.14),
      _gRect(92, 44, 96, 4, 0.14), _gRect(92, 54, 72, 4, 0.14),
      _gRect(92, 72, 52, 9, 0.75, _AC),
      _gCirc(176, 76, 13, 0.85, _VE)
    ]);
  },
  // Sobre saliendo, con reloj.
  recordatorios: function () {
    return _gLienzo([
      _gRect(52, 26, 122, 58, 0.09, null, 5),
      _hG('path', {
        key: 'sob', d: 'M52 30 L113 62 L174 30', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, opacity: 0.3
      }),
      _gCirc(198, 66, 19, 0.85, _AM),
      _hG('path', {
        key: 'rel', d: 'M198 56 V66 H206', fill: 'none',
        stroke: 'var(--bg-surface)', strokeWidth: 2.4, strokeLinecap: 'round'
      })
    ]);
  },
  // Egresos: filas con flecha hacia abajo.
  gastos: function () {
    return _gLienzo([
      _gRect(12, 12, 256, 22, 0.06), _gRect(24, 19, 88, 7, 0.22), _gRect(214, 19, 44, 7, 0.55, _AM),
      _gRect(12, 40, 256, 22, 0.06), _gRect(24, 47, 70, 7, 0.22), _gRect(214, 47, 44, 7, 0.28),
      _gRect(12, 68, 256, 22, 0.06), _gRect(24, 75, 96, 7, 0.22), _gRect(214, 75, 44, 7, 0.28),
      _hG('path', {
        key: 'fl', d: 'M160 18 V28 M156 24 L160 29 L164 24', fill: 'none',
        stroke: _AM, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.9
      })
    ]);
  },
  // Gráfica de barras.
  reportes: function () {
    return _gLienzo([
      _hG('line', {
        key: 'eje', x1: 20, y1: 88, x2: 264, y2: 88,
        stroke: 'currentColor', strokeWidth: 1.2, opacity: 0.2
      }),
      _gRect(32, 58, 26, 30, 0.2, null, 2.5),
      _gRect(72, 44, 26, 44, 0.2, null, 2.5),
      _gRect(112, 64, 26, 24, 0.2, null, 2.5),
      _gRect(152, 28, 26, 60, 0.9, _AC, 2.5),
      _gRect(192, 50, 26, 38, 0.2, null, 2.5),
      _gRect(232, 38, 26, 50, 0.2, null, 2.5)
    ]);
  },
  // Personas con su etiqueta de rol.
  miequipo: function () {
    return _gLienzo([
      _gRect(12, 20, 78, 64, 0.06), _gCirc(51, 42, 12, 0.85, _AC), _gRect(28, 62, 46, 5, 0.22), _gRect(34, 72, 34, 7, 0.5, _AC, 3.5),
      _gRect(101, 20, 78, 64, 0.06), _gCirc(140, 42, 12, 0.18), _gRect(117, 62, 46, 5, 0.22), _gRect(123, 72, 34, 7, 0.2, null, 3.5),
      _gRect(190, 20, 78, 64, 0.06), _gCirc(229, 42, 12, 0.18), _gRect(206, 62, 46, 5, 0.22), _gRect(212, 72, 34, 7, 0.2, null, 3.5)
    ]);
  },
  // Lista de documentos con su palomita.
  mi_cuenta: function () {
    return _gLienzo([
      _gRect(12, 6, 256, 20, 0.05), _gRect(24, 12, 104, 7, 0.22), _gCirc(250, 16, 7, 0.85, _VE),
      _gRect(12, 30, 256, 20, 0.05), _gRect(24, 36, 88, 7, 0.22), _gCirc(250, 40, 7, 0.85, _VE),
      _gRect(12, 54, 256, 20, 0.05), _gRect(24, 60, 112, 7, 0.22), _gCirc(250, 64, 7, 0.85, _AM),
      _gRect(12, 78, 256, 20, 0.05), _gRect(24, 84, 76, 7, 0.22), _gCirc(250, 88, 7, 0.12)
    ]);
  }
};

// Una frase por sección. Cortas a propósito: la guía señala, no enseña.
// `id` tiene que coincidir con el id de NAV_ITEMS en assets/js/app.js.
//
// EL ORDEN IMPORTA. Sigue el camino natural de montar un colegio —mirar,
// dar de alta a quién le vas a cobrar, definir qué le cobras, y solo entonces
// cobrar— en vez del orden en que salen en el menú.
//
// 'mi_cuenta' va AL FINAL a propósito. Arrancar pidiéndole a alguien que llene
// formularios fiscales y suba documentos, antes de que haya visto para qué
// sirve el sistema, es la forma más rápida de que lo cierre. Primero se le
// enseña qué va a poder hacer; el último paso es la llamada a la acción.
var GUIA_PASOS = [
  { id: 'dashboard',     titulo: 'Tu panorama',      texto: 'De un vistazo: cuánto entró, qué falta por cobrar y cómo va el mes.' },
  { id: 'alumnos',       titulo: 'Tus alumnos',      texto: 'Da de alta a los alumnos y lígalos a su familia.' },
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
  {
    id: 'mi_cuenta',
    titulo: 'Ahora sí: configura tu cuenta',
    texto: 'Ya viste todo lo que puedes hacer. Falta un paso para empezar: sube tus documentos y llena tus datos de pago.',
    clave: true,
  },
];

function GuiaPrimerUso({ seccionesVisibles, escuela, onIrA, onCerrar }) {
  var _R = React;
  var e1 = _R.useState(0);    var paso = e1[0], setPaso = e1[1];
  var e2 = _R.useState(null); var caja = e2[0], setCaja = e2[1];

  var pasos = GUIA_PASOS.filter(function (p) {
    return !seccionesVisibles || seccionesVisibles.indexOf(p.id) !== -1;
  });

  var idx = Math.min(paso, Math.max(pasos.length - 1, 0));
  var actual = pasos[idx];

  // Ubica el ítem del menú de este paso. Se recalcula al cambiar de paso y al
  // redimensionar o hacer scroll: el menú se mueve con el ancho de la ventana.
  //
  // El hook va ANTES de cualquier return condicional — las reglas de hooks no
  // permiten llamarlos de forma condicional, y un `if (!pasos.length) return`
  // arriba haría que ese render ejecute menos hooks que el anterior, lo que
  // rompe la aplicación entera.
  _R.useEffect(function () {
    if (!actual) { setCaja(null); return; }

    var medir = function () {
      var el = document.querySelector('[data-nav="' + actual.id + '"]');
      if (!el) { setCaja(null); return; }

      // `nearest` mueve lo mínimo indispensable: con 'center' el navegador
      // también desplaza contenedores padre y la pantalla brinca — el mismo
      // tipo de efecto que ya costó un bug en PortalFamilia.
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}

      var r = el.getBoundingClientRect();

      // Tres formas de estar oculto, y las tres tienen que caer al modo
      // centrado en vez de dibujar un foco sobre la nada:
      //   · ancho/alto en 0  -> display:none o menú colapsado
      //   · fuera de pantalla -> en móvil el sidebar sigue en el DOM pero
      //     desplazado con transform, así que su rect es negativo, NO cero
      //   · sin espacio visible
      var oculto = r.width < 4 || r.height < 4
                || r.right < 8 || r.bottom < 8
                || r.left > window.innerWidth - 8
                || r.top > window.innerHeight - 8;
      if (oculto) { setCaja(null); return; }

      setCaja({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    var raf = window.requestAnimationFrame(medir);
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return function () {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [actual && actual.id]);

  if (pasos.length === 0 || !actual) return null;

  var esUltimo = idx >= pasos.length - 1;
  var docEstado = (escuela && escuela.documentacion_estado) || 'sin_enviar';
  var docsPendientes = docEstado !== 'aprobada';

  var cerrar = function () { if (typeof onCerrar === 'function') onCerrar(); };

  // Al terminar sí se lleva al usuario a "Mi cuenta": es el único paso donde
  // la sección real vale más que el dibujo, porque ahí SÍ hay algo que hacer.
  var terminar = function () {
    if (typeof onIrA === 'function') onIrA('mi_cuenta');
    cerrar();
  };

  var PAD = 6;
  var ANCHO = 320;

  var posTarjeta;
  if (caja) {
    var derecha = caja.left + caja.width + PAD + 12;
    var cabeALado = derecha + ANCHO < window.innerWidth - 12;
    posTarjeta = cabeALado
      ? { top: Math.max(12, Math.min(caja.top - 40, window.innerHeight - 330)), left: derecha }
      : { top: Math.min(caja.top + caja.height + PAD + 10, window.innerHeight - 320),
          left: Math.max(12, Math.min(caja.left, window.innerWidth - ANCHO - 12)) };
  } else {
    posTarjeta = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
  }

  var hijos = [];

  // ── Capa de foco ──
  // Un recuadro transparente sobre el ítem, con una sombra enorme que oscurece
  // todo lo demás. El velo es claro (.42) a propósito: con uno oscuro el
  // sistema de atrás deja de leerse y la guía pierde la mitad de su sentido,
  // que es enseñar DÓNDE está cada cosa dentro de la pantalla real.
  if (caja) {
    hijos.push(_hG('div', {
      key: 'foco',
      style: {
        position: 'fixed',
        top: caja.top - PAD, left: caja.left - PAD,
        width: caja.width + PAD * 2, height: caja.height + PAD * 2,
        borderRadius: 10,
        // pointerEvents:'none' para no bloquear el clic sobre el ítem real.
        pointerEvents: 'none',
        boxShadow: '0 0 0 9999px rgba(10,12,24,.42), 0 0 0 2px var(--accent)',
        transition: 'top .2s ease, left .2s ease, width .2s ease, height .2s ease',
        zIndex: 9000,
      }
    }));
  } else {
    hijos.push(_hG('div', {
      key: 'velo',
      style: { position: 'fixed', inset: 0, background: 'rgba(10,12,24,.42)', zIndex: 9000 }
    }));
  }

  var dibujo = GUIA_DIBUJOS[actual.id];

  // ── Tarjeta ──
  hijos.push(_hG('div', {
    key: 'card',
    style: Object.assign({
      position: 'fixed',
      width: ANCHO,
      maxWidth: 'calc(100vw - 24px)',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-glow)',
      borderRadius: 14,
      boxShadow: '0 16px 44px rgba(0,0,0,.28)',
      overflow: 'hidden',
      zIndex: 9001,
    }, posTarjeta)
  },
    // Ilustración. Se remonta en cada paso (key = id) para que la animación de
    // entrada vuelva a correr y el cambio de dibujo se note.
    dibujo ? _hG('div', {
      key: 'ilu-' + actual.id,
      className: 'guia-ilustracion',
      style: {
        padding: '14px 16px 10px',
        background: 'var(--accent-glow)',
        borderBottom: '1px solid var(--border-glow)'
      }
    }, dibujo()) : null,

    _hG('div', { key: 'txt', style: { padding: '12px 16px 13px' } },
      _hG('div', {
        key: 'n',
        style: { fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, letterSpacing: .3 }
      }, (idx + 1) + ' de ' + pasos.length),

      _hG('div', {
        key: 't',
        style: { fontSize: 15.5, fontWeight: 800, color: 'var(--ink)', margin: '3px 0 5px' }
      }, actual.titulo),

      _hG('div', {
        key: 'x',
        style: { fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)' }
      }, actual.texto),

      // El énfasis en documentos: solo en el paso final y solo si de verdad
      // faltan. Una línea — el detalle ya está en la propia pantalla.
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
        style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 13 }
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
            onClick: function () { if (esUltimo) { terminar(); } else { setPaso(idx + 1); } }
          }, esUltimo ? 'Empezar a configurar' : 'Siguiente')
        )
      )
    )
  ));

  // Fragment y no un div contenedor: un div con position:fixed encima de todo
  // interceptaría los clics de la aplicación aunque sus hijos no lo hagan.
  return _hG(React.Fragment, null, hijos);
}
