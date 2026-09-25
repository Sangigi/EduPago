// assets/js/registro.js — lógica de registro.html (formulario público de alta
// de colegio vía liga de invitación). Va en archivo aparte, no inline en el
// HTML, porque el CSP del sitio (.htaccess) no incluye 'unsafe-inline' en
// script-src — mismo motivo por el que la animación de bienvenida vive en
// intro-splash.js en vez de un <script> suelto.
//
// Flujo (11-sep-2026, requisito de la junta): el colegio llena sus datos y
// elige un plan, y su cuenta se crea DE INMEDIATO en modo de prueba, sin
// pagar nada -- puede usar todo el sistema desde que recibe el correo de
// activación. Pagar (y con eso activar la suscripción de forma definitiva)
// pasa a "Mi suscripción" dentro del sistema, ya con sesión iniciada.
(function () {
  var cuerpo = document.getElementById('cuerpo');
  // Días de prueba que reportó el servidor (invitacion_ver -> dias_demo, que
  // sale de config_sistema.demo_dias_default). Se guarda en el ámbito del
  // módulo porque lo necesitan tres pantallas distintas y datosColegio NO
  // debe cargarlo: ese objeto se manda tal cual al backend, y meterle un
  // campo que no le corresponde es ensuciar el payload.
  // El 15 es solo un respaldo por si la petición falló.
  var diasDemoGlobal = 15;
  var token  = new URLSearchParams(location.search).get('t') || '';

  // Espejo de PLANES_LIMITES (api.php) SOLO para mostrar el precio antes de
  // pagar. El backend jamás confía en este valor: invitacion_enviar.php
  // vuelve a calcular el monto desde su propia copia de esta tabla. Si algún
  // día el precio real cambia y esto queda desactualizado, lo peor que pasa
  // es que aquí se muestre un número viejo por un momento — nunca se cobra
  // de más ni de menos, porque el monto real siempre sale del servidor.
  // PRECIOS DE PRUEBA (10-sep-2026) -- ver el mismo aviso en PLANES_LIMITES
  // (api.php). ¡Revertir a 999/1500/3000 antes de dar de alta colegios reales!
  var PLANES = {
    basico:   { label: 'Básico',   precio: 50,  detalle: 'Hasta 400 alumnos, 1 plantel' },
    avanzado: { label: 'Avanzado', precio: 55, detalle: 'Hasta 800 alumnos, 1 plantel' },
    pro:      { label: 'Pro',      precio: 60, detalle: 'Alumnos y planteles ilimitados' },
  };

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  }

  function pantalla(icono, titulo, texto, tipo) {
    var clase = 'reg-estado-ic' + (tipo === 'ok' ? ' ok' : '');
    cuerpo.innerHTML =
      '<div class="reg-estado">' +
        '<div class="' + clase + '">' + icono + '</div>' +
        '<div class="reg-h">' + esc(titulo) + '</div>' +
        '<p class="reg-p" style="margin-top:8px">' + esc(texto) + '</p>' +
      '</div>';
  }

  if (!token) {
    pantalla('!', 'Falta la liga de invitación',
      'Abre el enlace completo que te enviamos por correo.');
    return;
  }

  fetch('api.php?action=invitacion_ver&t=' + encodeURIComponent(token))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || d.success === false) {
        pantalla('!', 'Liga no válida',
          (d && d.error) || 'Esta liga no es válida o ya venció. Pide una nueva a tu asesor.');
        return;
      }
      // Precios desde el SERVIDOR (invitacion_ver -> planes, de lib/planes.php).
      // La tabla PLANES de arriba queda solo como respaldo: era una copia a
      // mano y el sistema llego a tener CINCO copias con tres juegos de
      // precios distintos, asi que un colegio podia ver aqui un precio y
      // recibir otro por correo.
      if (d.planes && Object.keys(d.planes).length) {
        Object.keys(d.planes).forEach(function (k) {
          PLANES[k] = Object.assign({}, PLANES[k] || {}, d.planes[k]);
        });
      }
      formulario(d);
    })
    .catch(function () {
      pantalla('!', 'Sin conexión', 'No pudimos verificar tu liga. Intenta de nuevo en un momento.');
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
      // Se dice desde el PASO 1 que esto es una prueba (23-sep-2026). Antes
      // solo aparecía en el paso 2, al elegir plan: quien abandonaba en el
      // primer formulario nunca se enteraba de que no iba a pagar nada, y ese
      // es justo el momento en que más pesa saberlo.
      '<p class="reg-p">Llena los datos de tu colegio para continuar con tu registro. ' +
        'No se te cobra nada: empiezas con <strong>' + ((d.dias_demo || 15)) + ' días de prueba gratis</strong>.</p>' +
      campo('nombre',      'Nombre del colegio',        false, 'text',   'Colegio San Marcos') +
      campo('email',       'Correo institucional',      false, 'email',  'contacto@colegio.mx') +
      campo('telefono',    'Teléfono',                  true,  'tel',    '55 1234 5678') +
      campo('num_alumnos', 'Número de alumnos aprox.',  true,  'number', '150') +
      // Persona física/moral (11-sep-2026, requisito de la junta): opcional
      // aquí -- determina qué documentos se piden después para poder
      // facturar de verdad, pero no bloquea el alta si aún no se decide.
      '<div class="reg-campo">' +
        '<label>Tipo de persona <span class="reg-op">(opcional)</span></label>' +
        '<select id="tipo_persona"><option value="">Sin definir por ahora</option>' +
          '<option value="fisica">Persona física</option>' +
          '<option value="moral">Persona moral</option>' +
          '<option value="negocio">Negocio independiente (solo cobrar, sin facturar)</option>' +
        '</select>' +
        '<div class="reg-ayuda">Persona física o moral pueden cobrar y emitir facturas. Un negocio independiente puede cobrar, pero no emitir facturas.</div>' +
      '</div>' +
      campo('rfc',         'RFC',                       true,  'text',   'ABC010203XY1') +
      campo('rvoe',        'RVOE',                      true,  'text') +
      campo('direccion',   'Dirección',                 true,  'text') +
      '<button class="reg-btn" id="continuar">Continuar</button>' +
      '<div id="msg"></div>' +
      '<div class="reg-pie">Tus datos solo se usan para dar de alta tu colegio.</div>';

    var email = document.getElementById('email');
    if (d.contacto_email) email.value = d.contacto_email;

    var btn = document.getElementById('continuar');
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

      var datosColegio = {
        nombre: v('nombre'), email: v('email'), telefono: v('telefono'),
        num_alumnos: v('num_alumnos'), rfc: v('rfc').toUpperCase(),
        rvoe: v('rvoe'), direccion: v('direccion'), tipo_persona: v('tipo_persona')
      };
      pantallaPlan(datosColegio, d.dias_demo);
    });
  }

  // ── Paso 2: elegir plan ──────────────────────────────────────────────
  // diasDemo viene de invitacion_ver (con 15 de respaldo si por lo que sea
  // no llegó) -- se usa solo para el texto de este paso, el backend vuelve a
  // calcularlo por su cuenta en invitacion_enviar.php.
  function pantallaPlan(datosColegio, diasDemo) {
    diasDemo = diasDemo || 15;
    // Se guarda en el ámbito del módulo para que la pantalla final también
    // pueda decir los días sin volver a preguntárselos al servidor.
    diasDemoGlobal = diasDemo;
    var opciones = Object.keys(PLANES).map(function (key) {
      var p = PLANES[key];
      return '<div class="reg-plan" data-plan="' + key + '">' +
        '<div class="reg-plan-radio"></div>' +
        '<div class="reg-plan-info">' +
          '<div class="reg-plan-nombre">' + esc(p.label) + '</div>' +
          '<div class="reg-plan-detalle">' + esc(p.detalle) + '</div>' +
        '</div>' +
        '<div class="reg-plan-precio">' + fmt(p.precio) + '<span>/mes</span></div>' +
      '</div>';
    }).join('');

    // No se cobra nada en este paso: la cuenta arranca en modo de prueba de
    // inmediato (ver assets/js/registro.js arriba y acciones/invitacion_enviar.php).
    // Antes esta pantalla solo mostraba "Elige tu plan" + precios sin
    // aclarar eso, así que parecía un cobro inmediato (confuso, reportado
    // por el cliente) -- el plan elegido aquí NO se cobra ahora, solo define
    // los límites (alumnos/planteles) que tendrás durante la prueba y el
    // precio que se cobraría después, si decides activar tu suscripción.
    cuerpo.innerHTML =
      '<div class="reg-h">Elige tu plan</div>' +
      '<p class="reg-p">' +
        'No se te cobra nada ahora: vas a empezar con <strong>' + diasDemo + ' días de prueba gratis</strong>, ' +
        'usando todo el sistema sin restricciones de tiempo. El plan que elijas aquí solo define cuántos ' +
        'alumnos y planteles puedes registrar durante la prueba; podrás cambiarlo después si tu colegio ' +
        'crece. Cuando quieras, activas tu suscripción de forma definitiva desde "Mi suscripción", ya con ' +
        'sesión iniciada.' +
      '</p>' +
      '<div id="planes">' + opciones + '</div>' +
      '<button class="reg-btn" id="irApagar" disabled>Selecciona un plan para empezar tu prueba</button>' +
      '<button class="reg-btn reg-btn-ghost" id="volver">Volver a mis datos</button>' +
      '<div id="msg"></div>';

    var planElegido = null;
    var btnPagar = document.getElementById('irApagar');
    var nodos = cuerpo.querySelectorAll('.reg-plan');

    nodos.forEach(function (nodo) {
      nodo.addEventListener('click', function () {
        nodos.forEach(function (n) { n.classList.remove('reg-plan-activo'); });
        nodo.classList.add('reg-plan-activo');
        planElegido = nodo.getAttribute('data-plan');
        btnPagar.disabled = false;
        btnPagar.textContent = 'Empezar prueba gratis con ' + PLANES[planElegido].label;
      });
    });

    document.getElementById('volver').addEventListener('click', function () {
      formulario({ contacto_nombre: '', contacto_email: datosColegio.email, dias_demo: diasDemo });
    });

    btnPagar.addEventListener('click', function () {
      if (!planElegido) return;
      enviarDatosYPlan(datosColegio, planElegido);
    });
  }

  // ── Envía datos + plan elegido; el backend calcula el precio real ────
  function enviarDatosYPlan(datosColegio, plan) {
    cuerpo.innerHTML = '<p class="reg-p">Guardando tus datos…</p>';

    var payload = {};
    for (var k in datosColegio) payload[k] = datosColegio[k];
    payload.token = token;
    payload.plan = plan;

    fetch('api.php?action=invitacion_enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res || !res.success) {
        pantalla('!', 'No se pudo continuar',
          (res && res.error) || 'Intenta de nuevo en un momento.');
        return;
      }
      // Ya no se paga durante el registro: la escuela se crea de inmediato
      // en modo de prueba (11-sep-2026, requisito de la junta) y el pago
      // pasa a "Mi suscripción" dentro del sistema, ya con sesión iniciada.
      // Se repiten los días de prueba aquí (23-sep-2026): es la última
      // pantalla que ve el colegio antes de irse a su correo, y sin esto lo
      // último que leía no mencionaba que su cuenta tiene una fecha límite.
      pantalla('&#10003;', 'Tu colegio ya está listo',
        (res.mensaje || 'Revisa tu correo para crear tu contraseña y empezar a usar tu cuenta.') +
        ' Tu prueba gratis de ' + diasDemoGlobal + ' días empieza ahora: puedes usar todo el sistema y configurarlo con calma.', 'ok');
    })
    .catch(function () {
      pantalla('!', 'Sin conexión', 'No pudimos guardar tus datos. Intenta de nuevo.');
    });
  }

})();
