// assets/js/registro.js — lógica de registro.html (formulario público de alta
// de colegio vía liga de invitación). Va en archivo aparte, no inline en el
// HTML, porque el CSP del sitio (.htaccess) no incluye 'unsafe-inline' en
// script-src — mismo motivo por el que la animación de bienvenida vive en
// intro-splash.js en vez de un <script> suelto.
//
// Antes el registro terminaba en "enviamos tus datos, espera nuestra
// aprobación" — sin ningún pago de por medio. Ahora, después de llenar los
// datos, el colegio elige un plan y lo paga con la pasarela ya integrada
// (misma cuenta de destino que ya cobra a cualquier colegio del sistema);
// la aprobación del superadmin queda para revisar una solicitud que ya trae
// el pago confirmado, no un formulario sin compromiso.
(function () {
  var cuerpo = document.getElementById('cuerpo');
  var token  = new URLSearchParams(location.search).get('t') || '';

  // Espejo de PLANES_LIMITES (api.php) SOLO para mostrar el precio antes de
  // pagar. El backend jamás confía en este valor: invitacion_enviar.php
  // vuelve a calcular el monto desde su propia copia de esta tabla. Si algún
  // día el precio real cambia y esto queda desactualizado, lo peor que pasa
  // es que aquí se muestre un número viejo por un momento — nunca se cobra
  // de más ni de menos, porque el monto real siempre sale del servidor.
  var PLANES = {
    basico:   { label: 'Básico',   precio: 999,  detalle: 'Hasta 400 alumnos, 1 plantel' },
    avanzado: { label: 'Avanzado', precio: 1500, detalle: 'Hasta 800 alumnos, 1 plantel' },
    pro:      { label: 'Pro',      precio: 3000, detalle: 'Alumnos y planteles ilimitados' },
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
      '<p class="reg-p">Llena los datos de tu colegio para continuar con tu registro.</p>' +
      campo('nombre',      'Nombre del colegio',        false, 'text',   'Colegio San Marcos') +
      campo('email',       'Correo institucional',      false, 'email',  'contacto@colegio.mx') +
      campo('telefono',    'Teléfono',                  true,  'tel',    '55 1234 5678') +
      campo('num_alumnos', 'Número de alumnos aprox.',  true,  'number', '150') +
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
        rvoe: v('rvoe'), direccion: v('direccion')
      };
      pantallaPlan(datosColegio);
    });
  }

  // ── Paso 2: elegir plan ──────────────────────────────────────────────
  function pantallaPlan(datosColegio) {
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

    cuerpo.innerHTML =
      '<div class="reg-h">Elige tu plan</div>' +
      '<p class="reg-p">Podrás cambiarlo más adelante desde tu panel si tu colegio crece.</p>' +
      '<div id="planes">' + opciones + '</div>' +
      '<button class="reg-btn" id="irApagar" disabled>Selecciona un plan para continuar</button>' +
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
        btnPagar.textContent = 'Continuar con ' + PLANES[planElegido].label + ' — ' + fmt(PLANES[planElegido].precio) + '/mes';
      });
    });

    document.getElementById('volver').addEventListener('click', function () {
      formulario({ contacto_nombre: '', contacto_email: datosColegio.email });
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
      pantallaPago(res.plan || plan, res.monto != null ? res.monto : PLANES[plan].precio, datosColegio);
    })
    .catch(function () {
      pantalla('!', 'Sin conexión', 'No pudimos guardar tus datos. Intenta de nuevo.');
    });
  }

  // ── Paso 3: pagar ─────────────────────────────────────────────────────
  function pantallaPago(plan, monto, datosColegio) {
    var nombreColegio = datosColegio.nombre;
    var info = PLANES[plan] || { label: plan, precio: monto };
    cuerpo.innerHTML =
      '<div class="reg-h">Un último paso: paga tu primera mensualidad</div>' +
      '<p class="reg-p">Plan <strong>' + esc(info.label) + '</strong> — ' + fmt(monto) + '/mes. ' +
        'En cuanto tu pago se confirme, revisaremos tu solicitud para activar tu cuenta.</p>' +
      '<div id="metodos">' +
        '<div class="reg-metodo reg-metodo-activo" data-metodo="TC">' +
          '<div class="reg-metodo-nombre">Tarjeta de crédito o débito</div>' +
          '<div class="reg-metodo-detalle">Pago inmediato, confirmación automática</div>' +
        '</div>' +
        '<div class="reg-metodo" data-metodo="Efectivo">' +
          '<div class="reg-metodo-nombre">Efectivo en tiendas de conveniencia</div>' +
          '<div class="reg-metodo-detalle">OXXO y tiendas participantes</div>' +
        '</div>' +
      '</div>' +
      '<button class="reg-btn" id="pagar">Pagar ' + fmt(monto) + ' con tarjeta</button>' +
      '<button class="reg-btn reg-btn-ghost" id="volverPlan">Cambiar de plan</button>' +
      '<div id="msg"></div>' +
      '<div class="reg-pie">Pago seguro. Podrás ver tu recibo al finalizar.</div>';

    var metodoElegido = 'TC';
    var nodosMetodo = cuerpo.querySelectorAll('.reg-metodo');
    var btnPagar = document.getElementById('pagar');
    var msg = document.getElementById('msg');

    document.getElementById('volverPlan').addEventListener('click', function () {
      pantallaPlan(datosColegio);
    });

    nodosMetodo.forEach(function (nodo) {
      nodo.addEventListener('click', function () {
        nodosMetodo.forEach(function (n) { n.classList.remove('reg-metodo-activo'); });
        nodo.classList.add('reg-metodo-activo');
        metodoElegido = nodo.getAttribute('data-metodo');
        btnPagar.textContent = metodoElegido === 'TC'
          ? 'Pagar ' + fmt(monto) + ' con tarjeta'
          : 'Generar formato de pago en efectivo';
      });
    });

    btnPagar.addEventListener('click', function () {
      msg.innerHTML = '';
      btnPagar.disabled = true;
      btnPagar.textContent = 'Procesando…';

      fetch('api.php?action=invitacion_generar_pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, metodo: metodoElegido })
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.success) {
          btnPagar.disabled = false;
          btnPagar.textContent = metodoElegido === 'TC' ? 'Pagar ' + fmt(monto) + ' con tarjeta' : 'Generar formato de pago en efectivo';
          msg.innerHTML = '<div class="reg-msg reg-err">' + esc(res && res.error || 'No se pudo generar el pago.') + '</div>';
          return;
        }
        if (metodoElegido === 'TC') {
          // La liga de pago se abre en la misma pestaña: es la pasarela del
          // proveedor, que al terminar redirige de vuelta según su propia
          // configuración. El colegio no vuelve a este formulario solo —
          // se le indica que revise su correo para el siguiente paso.
          window.location.href = res.url;
        } else {
          pantallaEfectivoGenerado(res, monto, nombreColegio);
        }
      })
      .catch(function () {
        btnPagar.disabled = false;
        msg.innerHTML = '<div class="reg-msg reg-err">Error de conexión. Intenta de nuevo.</div>';
      });
    });
  }

  // El botón abre EL MISMO comprobante que genera Caja para cualquier otro
  // cobro en efectivo (folio, código de barras real, tiendas participantes,
  // botón de imprimir/guardar como PDF) — antes esta pantalla mostraba solo
  // la referencia en texto y una imagen suelta, sin ese formato ni el botón
  // de PDF, aunque el resto del sistema ya lo tenía resuelto.
  function pantallaEfectivoGenerado(res, monto, nombreColegio) {
    cuerpo.innerHTML =
      '<div class="reg-estado">' +
        '<div class="reg-estado-ic ok">&#10003;</div>' +
        '<div class="reg-h">Tu referencia de pago</div>' +
        '<p class="reg-p" style="margin-top:8px">Acude a cualquier tienda participante y paga ' +
          '<strong>' + fmt(monto) + '</strong> con esta referencia:</p>' +
        '<div class="reg-ref">' + esc(res.referencia) + '</div>' +
        '<p class="reg-p" style="margin-top:8px">Vence el ' + esc(res.vencimiento) + '. ' +
          'En cuanto la tienda confirme tu pago, revisaremos tu solicitud.</p>' +
        '<button class="reg-btn" id="verFormato" style="margin-top:14px">Ver / imprimir formato de pago</button>' +
      '</div>';

    document.getElementById('verFormato').addEventListener('click', function () {
      if (typeof abrirComprobanteEfectivoModulo !== 'function') return;
      abrirComprobanteEfectivoModulo({
        cobro: {
          folio: res.folio || '', total: monto, descripcion: 'Suscripción — primera mensualidad',
          referencia: res.referencia, barcode_url: res.barcode_url, vencimiento: res.vencimiento
        },
        cliente: null,
        familia: null,
        escuela: { nombre: nombreColegio }
      });
    });
  }
})();
