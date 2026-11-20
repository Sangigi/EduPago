// views/components/VerComoModal.js — [OF-7c] Modal de "Ver como": entrar como otro usuario con
// LA CONTRASEÑA PROPIA (nunca la del otro).
//
//   <VerComoModal user={user} objetivo={u} onCerrar={fn} />
//
// `user` es quien entra (superadmin, soporte o admin) y `objetivo` una fila de listar_usuarios.
// El servidor decide SIEMPRE quién puede ver como quién y en qué modo (acciones/suplantar_iniciar.php);
// esto solo explica lo que va a pasar y pide la contraseña. Al entrar se recarga la página: la sesión
// de suplantación (AuthController) hace que toda la app trabaje como el objetivo, con la barra fija
// de assets/js/suplantacion.js. Reusa EscModal/EscCampo/EscError de views/ControlEscolar.js.
// `var` y React.createElement directo, sin compilación.

var _hVC = React.createElement;

var VC_ROLES = {
  superadmin: 'Superadmin', admin: 'Administrador', cajero: 'Cajero', docente: 'Docente', familia: 'Familia',
  alumno: 'Alumno', control_escolar: 'Control escolar', direccion: 'Dirección', tienda: 'Tienda',
  soporte: 'Soporte', distribuidor: 'Distribuidor', contador: 'Contador', provision: 'Provisión',
  tesoreria: 'Tesorería', promotor: 'Promotor'
};

function VerComoModal(props) {
  var R = React;
  var u = props.objetivo;
  var forzada = AuthController.modoVerComo(props.user, u) === 'lectura';
  var s1 = R.useState(''), clave = s1[0], setClave = s1[1];
  var s2 = R.useState(forzada), lectura = s2[0], setLectura = s2[1];
  var s3 = R.useState(false), enviando = s3[0], setEnviando = s3[1];
  var s4 = R.useState(''), error = s4[0], setError = s4[1];

  function entrar(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (enviando) return;
    if (!clave) { setError('Escribe tu contraseña para continuar.'); return; }
    setEnviando(true); setError('');
    AuthController.iniciarSuplantacion(u.id, clave, lectura).then(function () {
      window.location.reload();
    }).catch(function (err) {
      setEnviando(false);
      setError((err && err.message) || 'No se pudo entrar como ese usuario.');
    });
  }

  return _hVC(EscModal, {
    titulo: 'Ver como ' + u.nombre, onCerrar: props.onCerrar, ancho: 460,
    footer: [
      _hVC('button', { key: 'c', type: 'button', className: 'btn btn-ghost', onClick: props.onCerrar, disabled: enviando }, 'Cancelar'),
      _hVC('button', { key: 'e', type: 'submit', form: 'vc-form', className: 'btn btn-primary', disabled: enviando }, enviando ? 'Entrando…' : 'Entrar')
    ]
  },
    _hVC('form', { id: 'vc-form', onSubmit: entrar },
      _hVC('p', { style: { fontSize: 13, color: 'var(--ink-2)', margin: '0 0 12px', lineHeight: 1.5 } },
        'Vas a ver el sistema tal como lo ve ', _hVC('strong', null, u.nombre), ' (' + (VC_ROLES[u.rol] || u.rol) + '). ',
        'No necesitas su contraseña: confirma con ', _hVC('strong', null, 'la tuya'), '.'),
      _hVC('ul', { style: { fontSize: 12, color: 'var(--ink-3)', margin: '0 0 14px', paddingLeft: 18, lineHeight: 1.55 } },
        _hVC('li', null, 'Dura 30 minutos como máximo; una barra arriba te lo recuerda y te deja volver a tu cuenta.'),
        _hVC('li', null, 'Queda anotado quién entró como quién (bitácora y Auditoría).'),
        _hVC('li', null, 'No se puede cambiar contraseñas ni perfiles, crear o borrar usuarios, pagar por una familia ni cancelar facturas.')),
      _hVC(EscCampo, { label: 'Tu contraseña' },
        _hVC('input', {
          type: 'password', className: 'form-input', autoFocus: true, autoComplete: 'current-password',
          value: clave, onChange: function (e) { setClave(e.target.value); }, disabled: enviando
        })),
      _hVC('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)', marginTop: 4 } },
        _hVC('input', {
          type: 'checkbox', checked: lectura, disabled: forzada || enviando,
          onChange: function (e) { setLectura(e.target.checked); }
        }),
        forzada ? 'Solo lectura (siempre, para este usuario)' : 'Solo lectura (no podré cambiar nada)'),
      _hVC(EscError, { msg: error })
    )
  );
}
