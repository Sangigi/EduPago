// views/components/AvisosDispositivo.js — OF-7b (20-nov-2026)
//
// "Avisos en este dispositivo": activar, desactivar y "Enviar prueba" de los avisos push (llegan aunque
// EduPago esté cerrado). Tres piezas, todas globales:
//   AvisosDispositivoPanel    el contenido (estado, botones y mensajes).
//   AvisosDispositivoTarjeta  el panel dentro de una tarjeta, para el portal de familia (pestaña Ajustes).
//   AvisosDispositivoModal    el panel en un modal, para el menú de perfil del personal y del alumno.
//   avisosDispositivoDisponible(rol)  promesa: ¿vale la pena ofrecer la opción? (el rol usa push y el
//                                     servidor tiene la migración y las llaves). Se consulta una vez.
//
// La lógica del navegador vive en assets/js/push_cliente.js (global EduPush). NUNCA se pide permiso al
// cargar: solo cuando la persona pulsa "Activar avisos". Los avisos son genéricos: no llevan montos,
// nombres ni folios, y eso se le dice a la persona.
//
// `var` y React.createElement directo, como MenuPerfil.js: cargar este archivo dos veces no debe tumbar
// la aplicación.

var _hAD = React.createElement;

var AVISOS_ROLES = ['familia', 'alumno', 'admin', 'cajero', 'soporte', 'superadmin'];
var _avisosDisp = null;

function avisosDispositivoDisponible(rol) {
  if (AVISOS_ROLES.indexOf(rol) === -1) return Promise.resolve(false);
  if (!_avisosDisp) {
    _avisosDisp = ApiClient.post('push_llave_publica', {}).then(function (r) {
      // `detalle` solo lo manda el servidor al superadmin cuando los avisos están apagados por un problema del
      // servidor (OpenSSL, permisos): así la opción se le sigue ofreciendo y ve el motivo.
      return !!(r && (r.disponible || r.detalle));
    }, function () { _avisosDisp = null; return false; }); // sin red: se reintenta la próxima vez
  }
  return _avisosDisp;
}

function AvisosDispositivoPanel(props) {
  var R = React;
  var s1 = R.useState(null), est = s1[0], setEst = s1[1];          // null = revisando
  var s2 = R.useState(false), trabajando = s2[0], setTrabajando = s2[1];
  var s3 = R.useState(null), aviso = s3[0], setAviso = s3[1];      // { ok, texto }

  var revisar = function () {
    return EduPush.estado().then(setEst, function () {
      setEst({ plataforma: 'ok', disponible: false, detalle: '', permiso: 'default', activo: false });
    });
  };
  R.useEffect(function () { revisar(); }, []);

  var correr = function (fn) {
    setTrabajando(true); setAviso(null);
    fn().then(function (r) {
      setAviso({ ok: r.ok, texto: r.mensaje || '' });
      return revisar();
    }).then(function () { setTrabajando(false); }, function () { setTrabajando(false); });
  };
  var activar = function () {
    correr(function () {
      return EduPush.activar().then(function (r) {
        return r.ok ? { ok: true, mensaje: 'Listo: avisos activados en este dispositivo.' } : r;
      });
    });
  };
  var desactivar = function () {
    correr(function () {
      return EduPush.desactivar().then(function () { return { ok: true, mensaje: 'Avisos desactivados en este dispositivo.' }; });
    });
  };
  var probar = function () { correr(function () { return EduPush.probar(); }); };

  var txt = function (t, extra) {
    return _hAD('div', { style: Object.assign({ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 }, extra || {}) }, t);
  };
  var caja = function (clave, fondo, color, hijos) {
    return _hAD('div', { key: clave, style: { padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: fondo, color: color, fontSize: 12.5, lineHeight: 1.55, marginTop: 10 } }, hijos);
  };

  if (!est) return txt('Revisando este dispositivo…');

  var cuerpo = [];
  var generico = 'Los avisos son breves y genéricos (por ejemplo "Tu pago fue confirmado"): no incluyen montos ni nombres. Al tocarlos se abre EduPago.';

  if (!est.disponible) {
    cuerpo.push(txt('Los avisos en el dispositivo no están disponibles por ahora.'));
    if (est.detalle) cuerpo.push(caja('det', 'var(--red-glow)', 'var(--red)', est.detalle));
  } else if (est.plataforma === 'ios_sin_instalar') {
    cuerpo.push(txt('En iPhone y iPad, Safari solo manda avisos a las aplicaciones instaladas en la pantalla de inicio (iOS 16.4 o más reciente). Para activarlos:'));
    cuerpo.push(_hAD('ol', { key: 'pasos', style: { fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7, margin: '8px 0 0', paddingLeft: 20 } },
      _hAD('li', { key: '1' }, 'Abre EduPago en Safari.'),
      _hAD('li', { key: '2' }, 'Toca el botón Compartir y elige "Agregar a pantalla de inicio".'),
      _hAD('li', { key: '3' }, 'Abre EduPago desde el ícono nuevo de tu pantalla de inicio, entra con tu cuenta y vuelve a esta opción para activar los avisos.')));
  } else if (est.plataforma === 'inseguro') {
    cuerpo.push(txt('Los avisos necesitan que EduPago se abra por una dirección segura (HTTPS).'));
  } else if (est.plataforma === 'sin_soporte') {
    cuerpo.push(txt('Este navegador no admite avisos con la aplicación cerrada (en una ventana privada tampoco). Prueba con Chrome, Edge, Firefox o Safari actualizados.'));
  } else if (est.permiso === 'denied') {
    cuerpo.push(txt('Bloqueaste las notificaciones de este sitio en el navegador.'));
    cuerpo.push(caja('bloq', 'var(--red-glow)', 'var(--red)',
      'Para permitirlas: toca el candado (o el ícono de ajustes) junto a la dirección de EduPago, entra a "Permisos" o "Configuración del sitio", cambia "Notificaciones" a "Permitir" y recarga la página.'));
  } else if (est.activo) {
    cuerpo.push(_hAD('div', { key: 'est', style: { fontSize: 13, fontWeight: 700, color: 'var(--green-dark)' } }, 'Activados en este dispositivo'));
    cuerpo.push(txt(generico, { marginTop: 6 }));
    cuerpo.push(_hAD('div', { key: 'bt', style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 } },
      _hAD('button', { key: 'p', className: 'btn btn-secondary btn-sm', disabled: trabajando, onClick: probar }, trabajando ? 'Un momento…' : 'Enviar prueba'),
      _hAD('button', { key: 'd', className: 'btn btn-ghost btn-sm', disabled: trabajando, onClick: desactivar }, 'Desactivar')));
  } else {
    cuerpo.push(_hAD('div', { key: 'est', style: { fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' } }, 'No activados en este dispositivo'));
    cuerpo.push(txt('Recibe un aviso en tu navegador o celular cuando pase algo importante, aunque tengas EduPago cerrado. ' + generico, { marginTop: 6 }));
    cuerpo.push(_hAD('div', { key: 'bt', style: { marginTop: 12 } },
      _hAD('button', { key: 'a', className: 'btn btn-primary btn-sm', disabled: trabajando, onClick: activar }, trabajando ? 'Un momento…' : 'Activar avisos')));
  }

  if (aviso && aviso.texto) {
    cuerpo.push(caja('msg', aviso.ok ? 'var(--green-glow)' : 'var(--red-glow)', aviso.ok ? 'var(--green-dark)' : 'var(--red)', aviso.texto));
  }
  return _hAD('div', {}, cuerpo);
}

function AvisosDispositivoTarjeta(props) {
  var R = React;
  var s = R.useState(null), visible = s[0], setVisible = s[1];
  R.useEffect(function () {
    avisosDispositivoDisponible((props && props.rol) || '').then(setVisible);
  }, []);
  if (!visible) return null;
  return _hAD('div', {},
    _hAD('div', { style: { fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 } }, 'Avisos en este dispositivo'),
    _hAD('div', { style: { background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', borderRadius: 14, padding: 14 } },
      _hAD(AvisosDispositivoPanel, {})));
}

function AvisosDispositivoModal(props) {
  // Portal a document.body, por la misma razón que ModalPerfil (el sidebar móvil tiene un transform).
  return ReactDOM.createPortal(
    _hAD('div', { className: 'modal-backdrop', onClick: props.onCerrar },
      _hAD('div', { className: 'modal', style: { maxWidth: 460 }, onClick: function (e) { e.stopPropagation(); } },
        _hAD('div', { key: 'h', className: 'modal-header' },
          _hAD('div', { key: 't', className: 'modal-title' }, 'Avisos en este dispositivo'),
          _hAD('button', { key: 'x', className: 'btn-ghost', onClick: props.onCerrar },
            _hAD(Icon, { name: 'close', size: 16, color: 'currentColor' }))),
        _hAD('div', { key: 'b', className: 'modal-body' }, _hAD(AvisosDispositivoPanel, {})),
        _hAD('div', { key: 'f', className: 'modal-footer' },
          _hAD('button', { className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cerrar')))),
    document.body
  );
}
