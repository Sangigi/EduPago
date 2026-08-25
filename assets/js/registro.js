// assets/js/registro.js — lógica de registro.html (formulario público de alta
// de colegio vía liga de invitación). Va en archivo aparte, no inline en el
// HTML, porque el CSP del sitio (.htaccess) no incluye 'unsafe-inline' en
// script-src — mismo motivo por el que la animación de bienvenida vive en
// intro-splash.js en vez de un <script> suelto.
(function () {
  var cuerpo = document.getElementById('cuerpo');
  var token  = new URLSearchParams(location.search).get('t') || '';

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
    pantalla('&#9888;', 'Falta la liga de invitación',
      'Abre el enlace completo que te enviamos por correo.');
    return;
  }

  fetch('api.php?action=invitacion_ver&t=' + encodeURIComponent(token))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || d.success === false) {
        pantalla('&#9888;', 'Liga no válida',
          (d && d.error) || 'Esta liga no es válida o ya venció. Pide una nueva a tu asesor.');
        return;
      }
      formulario(d);
    })
    .catch(function () {
      pantalla('&#9888;', 'Sin conexión', 'No pudimos verificar tu liga. Intenta de nuevo en un momento.');
    });

  function campo(id, etiqueta, opcional, tipo, ayuda) {
    return '<div class="reg-campo">' +
      '<label for="' + id + '">' + esc(etiqueta) +
        (opcional ? ' <span class="reg-op">(opcional)</span>' : '') + '</label>' +
      '<input id="' + id + '" type="' + (tipo || 'text') + '" autocomplete="off"' +
        (ayuda ? ' placeholder="' + esc(ayuda) + '"' : '') + '>' +
    '</div>';
  }

  function formulario(d) {
    cuerpo.innerHTML =
      '<div class="reg-h">Hola, ' + esc((d.contacto_nombre || '').split(' ')[0]) + '</div>' +
      '<p class="reg-p">Llena los datos de tu colegio. Al enviarlos, nuestro equipo los revisa ' +
        'y te avisamos por correo en cuanto tu cuenta quede activa.</p>' +
      campo('nombre',      'Nombre del colegio',        false, 'text',   'Colegio San Marcos') +
      campo('email',       'Correo institucional',      false, 'email',  'contacto@colegio.mx') +
      campo('telefono',    'Teléfono',                  true,  'tel',    '55 1234 5678') +
      campo('num_alumnos', 'Número de alumnos aprox.',  true,  'number', '150') +
      campo('rfc',         'RFC',                       true,  'text',   'ABC010203XY1') +
      campo('rvoe',        'RVOE',                      true,  'text') +
      campo('direccion',   'Dirección',                 true,  'text') +
      '<button class="reg-btn" id="enviar">Enviar mis datos</button>' +
      '<div id="msg"></div>' +
      '<div class="reg-pie">Tus datos solo se usan para dar de alta tu colegio.</div>';

    var email = document.getElementById('email');
    if (d.contacto_email) email.value = d.contacto_email;

    var btn = document.getElementById('enviar');
    var msg = document.getElementById('msg');

    btn.addEventListener('click', function () {
      var v = function (id) { return document.getElementById(id).value.trim(); };
      msg.innerHTML = '';

      if (!v('nombre') || !v('email')) {
        msg.innerHTML = '<div class="reg-msg reg-err">El nombre del colegio y el correo son obligatorios.</div>';
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) {
        msg.innerHTML = '<div class="reg-msg reg-err">El correo no parece válido.</div>';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Enviando…';

      fetch('api.php?action=invitacion_enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token,
          nombre: v('nombre'), email: v('email'), telefono: v('telefono'),
          num_alumnos: v('num_alumnos'),
          rfc: v('rfc').toUpperCase(), rvoe: v('rvoe'), direccion: v('direccion')
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.success) {
          pantalla('&#10003;', 'Datos recibidos',
            res.mensaje || 'Te avisaremos por correo en cuanto tu colegio quede activo.');
        } else {
          btn.disabled = false;
          btn.textContent = 'Enviar mis datos';
          msg.innerHTML = '<div class="reg-msg reg-err">' +
            esc((res && res.error) || 'No pudimos enviar tus datos.') + '</div>';
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Enviar mis datos';
        msg.innerHTML = '<div class="reg-msg reg-err">Error de conexión. Intenta de nuevo.</div>';
      });
    });
  }
})();
