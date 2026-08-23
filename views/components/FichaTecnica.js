<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Registro de colegio · Paga la Escuela</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/main.css?v=1787290000">
<style>
  body { overflow: auto; }
  .reg-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center;
              padding:28px 18px; background:#272c64; }
  .reg-card { width:100%; max-width:560px; background:#272c52; color:#eef1f8;
              border:1px solid rgba(255,255,255,.07); border-radius:var(--radius-lg);
              box-shadow:0 16px 40px rgba(0,0,0,.5); overflow:hidden; }
  .reg-top  { padding:28px 30px 22px; text-align:center; }
  .reg-marca{ font-size:24px; font-weight:800; letter-spacing:-.8px; }
  .reg-sub  { font-size:12px; color:#bdcf00; font-weight:600; margin-top:4px; }
  .reg-body { padding:0 30px 28px; }
  .reg-h    { font-size:17px; font-weight:700; margin:0 0 4px; }
  .reg-p    { font-size:13px; color:#8b93a7; margin:0 0 20px; line-height:1.55; }
  .reg-campo{ margin-bottom:14px; }
  .reg-campo label { display:block; font-size:12px; font-weight:600;
                     color:rgba(255,255,255,.8); margin-bottom:5px; }
  .reg-campo input, .reg-campo textarea {
    width:100%; padding:11px 13px; border-radius:var(--radius);
    border:1px solid rgba(255,255,255,.14); background:#fff; color:#1e2430;
    font-size:14px; font-family:var(--font); outline:none;
  }
  .reg-campo input:focus, .reg-campo textarea:focus {
    border-color:#bdcf00; box-shadow:0 0 0 3px rgba(189,207,0,.18);
  }
  .reg-op   { font-weight:400; color:#69798f; }
  .reg-btn  { width:100%; margin-top:8px; padding:13px; border:none;
              border-radius:var(--radius); cursor:pointer; color:#fff;
              font-size:14px; font-weight:700; font-family:var(--font);
              background:linear-gradient(135deg,#bdcf00 0%,#2f9e44 100%);
              box-shadow:0 4px 14px rgba(47,158,68,.28); }
  .reg-btn:disabled { opacity:.55; cursor:not-allowed; }
  .reg-msg  { margin-top:14px; padding:11px 14px; border-radius:var(--radius-sm);
              font-size:13px; line-height:1.5; }
  .reg-err  { background:rgba(239,68,68,.12); color:#f87171; }
  .reg-ok   { background:rgba(73,175,84,.14); color:#6fd07a; }
  .reg-pie  { text-align:center; font-size:11px; color:#69798f; margin-top:18px; }
  .reg-estado { text-align:center; padding:34px 30px 40px; }
  .reg-estado-ic { font-size:38px; line-height:1; margin-bottom:14px; }
</style>
</head>
<body>
<div class="reg-wrap"><div class="reg-card" id="app">
  <div class="reg-top">
    <div class="reg-marca">Paga la Escuela</div>
    <div class="reg-sub">REGISTRO DE COLEGIO</div>
  </div>
  <div class="reg-body" id="cuerpo">
    <p class="reg-p">Verificando tu liga…</p>
  </div>
</div></div>

<script>
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
      campo('nombre',    'Nombre del colegio',   false, 'text', 'Colegio San Marcos') +
      campo('email',     'Correo institucional', false, 'email', 'contacto@colegio.mx') +
      campo('telefono',  'Teléfono',             true,  'tel',  '55 1234 5678') +
      campo('rfc',       'RFC',                  true,  'text', 'ABC010203XY1') +
      campo('rvoe',      'RVOE',                 true,  'text') +
      campo('direccion', 'Dirección',            true,  'text') +
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
</script>
</body>
</html>
