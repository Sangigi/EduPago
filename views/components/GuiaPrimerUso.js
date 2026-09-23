// views/components/GuiaPrimerUso.js — Guía de primer uso
//
// Se muestra una sola vez, al primer ingreso de cada cuenta. Recorre las
// secciones del sistema explicando para qué sirve cada una, y arranca por
// "Mi cuenta", que es donde se configura el colegio y se suben los documentos
// sin los cuales no se puede cobrar ni facturar.
//
// DECISIONES QUE CONVIENE NO DESHACER SIN LEER:
//
// · `var` y no `const` a nivel raíz. Lo mismo hace views/components/MenuPerfil.js
//   y su comentario explica por qué: si este archivo se carga dos veces, un
//   `const` lanza "Identifier already declared" y ese error tumba TODA la
//   aplicación, no solo la guía.
//
// · React.createElement directo (var _hG) y NO el shim _jsxDEV. En el shim los
//   hijos van SIEMPRE en props.children y el 3er argumento posicional es la
//   key; pasar hijos ahí los convierte en key y la pantalla queda vacía sin
//   ningún error. Es el mismo criterio de MenuPerfil.js, Provision.js y
//   Tesoreria.js.
//
// · Los pasos se FILTRAN contra las secciones que el usuario realmente tiene
//   en su menú. Explicarle "Facturación" a un negocio independiente —que no
//   puede facturar— o "Corte de caja" a quien no lo ve sería peor que no
//   explicar nada: lo mandaría a buscar algo que no existe en su pantalla.

var _hG = React.createElement;

// Un paso por sección. `id` tiene que coincidir con el id de NAV_ITEMS en
// assets/js/app.js: de ahí sale el filtrado y el "Llévame ahí".
var GUIA_PASOS = [
  {
    id: 'mi_cuenta',
    titulo: 'Configura tu cuenta',
    clave: true,
    texto: 'Aquí defines quién eres fiscalmente y subes tus documentos. Es el primer paso y el más importante: mientras no lo completes, tu colegio no puede cobrarle a las familias.',
    puntos: [
      'Elige tu tipo de persona: física, moral o negocio independiente.',
      'Llena el formulario de datos para procesar pagos (cuenta bancaria incluida).',
      'Sube tus documentos. Los revisamos en 48 a 72 horas hábiles.',
    ],
  },
  {
    id: 'alumnos',
    titulo: 'Da de alta a tus alumnos',
    texto: 'Cada alumno pertenece a una familia, y la familia es quien recibe los cobros y entra al portal a pagar. Puedes capturarlos uno por uno o importarlos desde un archivo.',
  },
  {
    id: 'familias',
    titulo: 'Las familias y su portal',
    texto: 'Cada familia tiene su propio acceso donde ve lo que debe, paga y descarga sus comprobantes. Desde aquí les mandas la invitación para que entren.',
  },
  {
    id: 'productos',
    titulo: 'Define qué vas a cobrar',
    texto: 'Colegiaturas, inscripciones, uniformes, eventos. Un concepto puede ser de una sola vez o recurrente — los recurrentes se generan solos cada mes, con su fecha límite y su recargo si lo configuras.',
  },
  {
    id: 'caja',
    titulo: 'Cobrar',
    texto: 'La pantalla del día a día. Eliges al alumno, armas lo que va a pagar y cobras: efectivo, tarjeta, transferencia SPEI o referencia para pagar en tiendas.',
  },
  {
    id: 'corte_caja',
    titulo: 'Cierra tu caja',
    texto: 'Al terminar el día, aquí cuadras lo que cobraste contra lo que hay en la caja. Si hay diferencia, queda registrada.',
  },
  {
    id: 'cobros',
    titulo: 'Historial de cobros',
    texto: 'Todo lo cobrado, con su estado y su comprobante. Es donde vienes a buscar cuando alguien pregunta por un pago.',
  },
  {
    id: 'facturacion',
    titulo: 'Facturar',
    texto: 'Emite facturas (CFDI) de los pagos que recibes. Necesita que tus datos fiscales estén completos y aprobados.',
  },
  {
    id: 'recordatorios',
    titulo: 'Recordatorios automáticos',
    texto: 'El sistema le avisa solo a las familias que traen adeudo, por correo. Tú decides cuándo y cada cuánto.',
  },
  {
    id: 'gastos',
    titulo: 'Gastos y proveedores',
    texto: 'El otro lado de la moneda: lo que el colegio paga. Registra tus egresos con su comprobante para tener el panorama completo.',
  },
  {
    id: 'reportes',
    titulo: 'Reportes',
    texto: 'Cuánto entró, por qué método, quién te debe y desde cuándo. Para cerrar el mes sin sacar cuentas a mano.',
  },
  {
    id: 'miequipo',
    titulo: 'Tu equipo',
    texto: 'Da de alta a tus cajeros y administradores. Cada quien ve solo lo que le toca.',
  },
];

function GuiaPrimerUso({ seccionesVisibles, escuela, onIrA, onCerrar }) {
  var _R = React;
  var estado = _R.useState(0);
  var paso = estado[0], setPaso = estado[1];

  // Solo los pasos cuya sección este usuario tiene de verdad en su menú.
  // seccionesVisibles llega ya filtrada por rol Y por secciones deshabilitadas
  // (incluida 'facturacion', que app.js le quita a un negocio independiente).
  var pasos = GUIA_PASOS.filter(function (p) {
    return !seccionesVisibles || seccionesVisibles.indexOf(p.id) !== -1;
  });

  // Si por lo que sea no quedó ningún paso, no se muestra una guía vacía.
  if (pasos.length === 0) return null;

  var actual = pasos[Math.min(paso, pasos.length - 1)];
  var esUltimo = paso >= pasos.length - 1;

  // ¿Este colegio ya tiene su documentación aprobada? Si no, el paso de
  // "Mi cuenta" lleva un aviso extra. escuela puede ser null (superadmin sin
  // colegio seleccionado), así que se tolera.
  var docEstado = (escuela && escuela.documentacion_estado) || 'sin_enviar';
  var docsPendientes = docEstado !== 'aprobada';
  var enDemo = !!(escuela && escuela.modo === 'demo');

  var cerrar = function () { if (typeof onCerrar === 'function') onCerrar(); };

  var irYCerrar = function () {
    if (typeof onIrA === 'function') onIrA(actual.id);
    cerrar();
  };

  return _hG('div', {
    className: 'modal-backdrop',
    // A propósito NO se cierra al hacer clic fuera: es una guía de una sola
    // vez y un clic accidental la perdería para siempre. Se sale por
    // "Saltar" o terminándola.
    style: { zIndex: 9000 }
  },
    _hG('div', { className: 'modal modal-lg', style: { maxWidth: 560 } },

      _hG('div', { key: 'h', className: 'modal-header' },
        _hG('div', { key: 't' },
          _hG('div', { key: 'a', className: 'modal-title' },
            actual.clave ? 'Empecemos por aquí' : 'Cómo funciona'),
          _hG('div', {
            key: 'b',
            style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }
          }, 'Paso ' + (paso + 1) + ' de ' + pasos.length)
        ),
        _hG('button', {
          key: 'x', className: 'btn btn-ghost btn-sm', onClick: cerrar
        }, 'Saltar')
      ),

      _hG('div', { key: 'b', className: 'modal-body' },

        // Aviso de prueba, solo en el primer paso y solo si aplica.
        (paso === 0 && enDemo) ? _hG('div', {
          key: 'demo',
          style: {
            padding: '10px 13px', marginBottom: 14, borderRadius: 'var(--radius-sm)',
            background: 'var(--accent-glow)', border: '1px solid var(--accent)',
            fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)'
          }
        }, 'Estás en tu periodo de prueba. Puedes usar todo el sistema y configurarlo con calma; lo único que queda bloqueado son los cobros reales, hasta que actives tu suscripción.') : null,

        _hG('div', {
          key: 'tit',
          style: { fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }
        }, actual.titulo),

        _hG('div', {
          key: 'txt',
          style: { fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }
        }, actual.texto),

        actual.puntos ? _hG('ul', {
          key: 'pts',
          style: { margin: '12px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.7, color: 'var(--ink-2)' }
        }, actual.puntos.map(function (p, i) {
          return _hG('li', { key: 'p' + i }, p);
        })) : null,

        // El énfasis en documentos: solo donde importa y solo si falta.
        (actual.clave && docsPendientes) ? _hG('div', {
          key: 'docs',
          style: {
            marginTop: 14, padding: '11px 14px', borderRadius: 'var(--radius-sm)',
            background: 'var(--amber-glow)', border: '1px solid var(--amber)',
            fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)'
          }
        },
          _hG('div', {
            key: 'a', style: { fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }
          }, 'Sin esto no puedes cobrar'),
          'Tu colegio no podrá recibir pagos de las familias hasta que subas tus documentos y los aprobemos. La revisión tarda entre 48 y 72 horas hábiles, así que conviene hacerlo hoy y no el día que lo necesites.'
        ) : null
      ),

      _hG('div', {
        key: 'f',
        className: 'modal-footer',
        style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }
      },
        paso > 0 ? _hG('button', {
          key: 'prev', className: 'btn btn-ghost btn-sm',
          onClick: function () { setPaso(paso - 1); }
        }, 'Atrás') : null,

        _hG('div', { key: 'sp', style: { marginLeft: 'auto' } }),

        _hG('button', {
          key: 'ir', className: 'btn btn-ghost btn-sm', onClick: irYCerrar
        }, 'Llévame ahí'),

        _hG('button', {
          key: 'next',
          className: 'btn btn-primary btn-sm',
          onClick: function () { if (esUltimo) { cerrar(); } else { setPaso(paso + 1); } }
        }, esUltimo ? 'Entendido, empezar' : 'Siguiente')
      )
    )
  );
}
