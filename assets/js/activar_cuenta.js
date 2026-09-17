// assets/js/activar_cuenta.js — lógica de activar_cuenta.html: quien recibe
// el enlace de bienvenida (o de "Reenviar" en Usuarios.js) fija aquí su
// propia contraseña. En archivo aparte, no inline, por el mismo CSP estricto
// que ya obligó a mover registro.html a assets/js/registro.js (ver
// PRODUCCION.md 5.3s).
(function () {
  var cuerpo = document.getElementById('cuerpo');
  var params = new URLSearchParams(location.search);
  var token  = params.get('t') || '';
  // El mismo enlace/token sirve para dos casos (activar_cuenta_ver.php y
  // activar_cuenta_confirmar.php no distinguen uno de otro — fijar una
  // contraseña nueva es la misma operación) pero el texto en pantalla debe
  // ser distinto: a alguien restableciendo su contraseña no le corresponde
  // ver "activa tu cuenta" cuando su cuenta ya estaba activa.
  var esReset = params.get('modo') === 'reset';
  var textos = esReset
    ? { titulo: 'RESTABLECER CONTRASEÑA', intro: 'Crea la contraseña con la que vas a volver a entrar a ', boton: 'Guardar nueva contraseña', guardando: 'Guardando…', exitoTitulo: 'Contraseña actualizada', exitoTexto: 'Ya puedes iniciar sesión con tu correo y tu nueva contraseña.' }
    : { titulo: 'ACTIVAR CUENTA', intro: 'Crea la contraseña con la que vas a iniciar sesión en ', boton: 'Activar mi cuenta', guardando: 'Guardando…', exitoTitulo: 'Cuenta activada', exitoTexto: 'Ya puedes iniciar sesión con tu correo y tu nueva contraseña.' };
  var subEl = document.querySelector('.reg-sub');
  if (subEl) subEl.textContent = textos.titulo;
  document.title = (esReset ? 'Restablecer contraseña' : 'Activar cuenta') + ' · Paga la Escuela';

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function pantalla(icono, titulo, texto) {
    cuerpo.innerHTML =
      '<div class="reg-estado">' +
        '<div class="reg-estado-ic">' + icono + '</div>' +
        '<div class="reg-h">' + esc(titulo) + '</div>' +
        '<p class="reg-p" style="margin-top:8px">' + esc(texto) + '</p>' +
      '</div>';
  }

  if (!token) {
    pantalla('&#9888;', 'Falta el enlace de activación',
      'Abre el enlace completo que te enviamos por correo.');
    return;
  }

  fetch('api.php?action=activar_cuenta_ver&t=' + encodeURIComponent(token))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || d.success === false) {
        pantalla('&#9888;', 'Enlace no válido',
          (d && d.error) || 'Este enlace no es válido o ya venció. Pide que te lo reenvíen.');
        return;
      }
      formulario(d);
    })
    .catch(function () {
      pantalla('&#9888;', 'Sin conexión', 'No pudimos verificar tu enlace. Intenta de nuevo en un momento.');
    });

  function formulario(d) {
    cuerpo.innerHTML =
      '<div class="reg-h">Hola, ' + esc((d.nombre || '').split(' ')[0]) + '</div>' +
      '<p class="reg-p">' + esc(textos.intro) + '<strong>' + esc(d.email) + '</strong>.</p>' +
      '<div class="reg-campo">' +
        '<label for="pass1">Contraseña nueva</label>' +
        '<input id="pass1" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres">' +
      '</div>' +
      '<div class="reg-campo">' +
        '<label for="pass2">Repetir contraseña</label>' +
        '<input id="pass2" type="password" autocomplete="new-password">' +
      '</div>' +
      '<button class="reg-btn" id="guardar">' + esc(textos.boton) + '</button>' +
      '<div id="msg"></div>';

    var btn = document.getElementById('guardar');
    var msg = document.getElementById('msg');

    btn.addEventListener('click', function () {
      var p1 = document.getElementById('pass1').value;
      var p2 = document.getElementById('pass2').value;
      msg.innerHTML = '';

      if (p1.length < 8) {
        msg.innerHTML = '<div class="reg-msg reg-err">La contraseña debe tener al menos 8 caracteres.</div>';
        return;
      }
      if (p1 !== p2) {
        msg.innerHTML = '<div class="reg-msg reg-err">Las contraseñas no coinciden.</div>';
        return;
      }

      btn.disabled = true;
      btn.textContent = textos.guardando;

      fetch('api.php?action=activar_cuenta_confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, password: p1 })
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.success) {
          pantalla('&#10003;', textos.exitoTitulo, textos.exitoTexto);
        } else {
          btn.disabled = false;
          btn.textContent = textos.boton;
          msg.innerHTML = '<div class="reg-msg reg-err">' +
            esc((res && res.error) || 'No pudimos guardar tu contraseña.') + '</div>';
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = textos.boton;
        msg.innerHTML = '<div class="reg-msg reg-err">Error de conexión. Intenta de nuevo.</div>';
      });
    });
  }
})();
