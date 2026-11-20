/* ══════════════════════════════════════════════════════
   EduPago · avisos push en este dispositivo (OF-7b) — lado del navegador

   Global `EduPush`. Lo usa views/components/AvisosDispositivo.js (la tarjeta y el modal con
   "Activar", "Desactivar" y "Enviar prueba") y las pantallas que abren al tocar un aviso (?ir=).

   REGLAS
   · NUNCA se pide permiso al cargar la página: solo dentro de activar(), que la pantalla llama desde
     el clic del usuario.
   · Web Push exige HTTPS, service worker y Push API. En iPhone/iPad solo funciona con la app
     INSTALADA en la pantalla de inicio (iOS 16.4 o más reciente): en Safari "a secas" no existe
     PushManager, y aquí se detecta para explicarlo en vez de decir "no compatible".
   · La dirección de suscripción y sus llaves viajan en hexadecimal: algunos filtros de seguridad de
     hosting rechazan un "https://..." tal cual en el cuerpo de una petición.
   · El texto de los avisos NUNCA se arma aquí: lo da el servidor y es genérico (sin montos ni nombres).

   `var` a propósito: cargar este archivo dos veces no debe tumbar la aplicación.
   ══════════════════════════════════════════════════════ */

var EduPush = (function () {
  var SW = 'sw-edupago.js';
  var CLAVE_USUARIO = 'edupago_push_usuario'; // quién activó los avisos en ESTE navegador

  /* ── Soporte de la plataforma ─────────────────────────── */

  function esIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function instalada() {
    try {
      return window.navigator.standalone === true ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (e) { return false; }
  }

  function tieneApis() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /* 'ok' | 'inseguro' | 'ios_sin_instalar' | 'sin_soporte' */
  function plataforma() {
    if (!window.isSecureContext) return 'inseguro';
    if (tieneApis()) return 'ok';
    if (esIOS() && !instalada()) return 'ios_sin_instalar';
    return 'sin_soporte';
  }

  /* ── Utilidades ───────────────────────────────────────── */

  function hex(texto) {
    var h = '';
    for (var i = 0; i < texto.length; i++) {
      var c = texto.charCodeAt(i).toString(16);
      h += (c.length < 2 ? '0' : '') + c;
    }
    return h;
  }

  function llaveABytes(b64url) {
    var b = (b64url + '===='.slice((b64url.length % 4) || 4)).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function mismaLlave(buf, bytes) {
    if (!buf) return false;
    var a = new Uint8Array(buf);
    if (a.length !== bytes.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== bytes[i]) return false;
    return true;
  }

  function api(accion, cuerpo) {
    return ApiClient.post(accion, cuerpo || {});
  }

  function uid() {
    try {
      var s = AuthController.getSession();
      return s && s.id ? String(s.id) : '';
    } catch (e) { return ''; }
  }

  function guardarUsuario(v) {
    try { if (v) localStorage.setItem(CLAVE_USUARIO, v); else localStorage.removeItem(CLAVE_USUARIO); } catch (e) { /* sin almacenamiento */ }
  }
  function usuarioGuardado() {
    try { return localStorage.getItem(CLAVE_USUARIO) || ''; } catch (e) { return ''; }
  }

  function registro() {
    return navigator.serviceWorker.register(SW, { updateViaCache: 'none' }).then(function () {
      return navigator.serviceWorker.ready;
    });
  }

  function suscripcionActual() {
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      return reg ? reg.pushManager.getSubscription() : null;
    });
  }

  /* ── Estado ───────────────────────────────────────────── */

  /* { plataforma, disponible, detalle, permiso, activo }
       disponible: el servidor tiene los avisos encendidos (migración + llaves).
       permiso:    'default' | 'granted' | 'denied' (del navegador).
       activo:     este navegador está suscrito Y es de la persona que tiene la sesión. */
  function estado() {
    var p = plataforma();
    var base = { plataforma: p, disponible: false, detalle: '', permiso: 'default', activo: false };
    if (p !== 'ok') {
      // iPhone sin instalar: igual se pregunta al servidor si hay avisos, para mostrar la explicación.
      return api('push_llave_publica').then(function (r) {
        base.disponible = !!(r && r.disponible);
        base.detalle = (r && r.detalle) || '';
        return base;
      }, function () { return base; });
    }
    base.permiso = Notification.permission;
    return Promise.all([
      api('push_llave_publica').then(function (r) { return r; }, function () { return null; }),
      suscripcionActual().then(function (s) { return s; }, function () { return null; })
    ]).then(function (r) {
      var j = r[0], sub = r[1];
      base.disponible = !!(j && j.disponible);
      base.detalle = (j && j.detalle) || '';
      base.activo = !!sub && base.permiso === 'granted' && usuarioGuardado() === uid();
      return base;
    });
  }

  /* ── Activar / desactivar / probar ────────────────────── */

  function pedirPermiso() {
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    return new Promise(function (listo) {
      var r = Notification.requestPermission(listo); // forma antigua (callback)
      if (r && r.then) r.then(listo);                // forma moderna (promesa)
    });
  }

  /* Siempre desde un clic. Devuelve { ok, mensaje }. */
  function activar() {
    var p = plataforma();
    if (p === 'inseguro') return Promise.resolve({ ok: false, mensaje: 'Los avisos necesitan que EduPago se abra por HTTPS.' });
    if (p === 'ios_sin_instalar') return Promise.resolve({ ok: false, mensaje: 'En iPhone y iPad primero instala EduPago en tu pantalla de inicio (ver las instrucciones).' });
    if (p !== 'ok') return Promise.resolve({ ok: false, mensaje: 'Este navegador no admite avisos con la aplicación cerrada (en una ventana privada tampoco).' });
    if (Notification.permission === 'denied') {
      return Promise.resolve({ ok: false, mensaje: 'Bloqueaste las notificaciones de este sitio. Permítelas desde el candado junto a la dirección (o en los ajustes del navegador) y vuelve a intentar.' });
    }
    return pedirPermiso().then(function (perm) {
      if (perm === 'denied') return { ok: false, mensaje: 'Bloqueaste las notificaciones. Permítelas desde el candado junto a la dirección y vuelve a intentar.' };
      if (perm !== 'granted') return { ok: false, mensaje: 'No diste el permiso. Vuelve a intentar y elige "Permitir".' };
      return Promise.all([api('push_llave_publica'), registro()]).then(function (r) {
        var j = r[0], reg = r[1];
        if (!j || !j.disponible || !j.llave) {
          return { ok: false, mensaje: 'Los avisos no están disponibles por ahora. Avisa a soporte si el problema sigue.' };
        }
        var llave = llaveABytes(j.llave);
        return reg.pushManager.getSubscription().then(function (existente) {
          // Si el servidor cambió sus llaves, la suscripción vieja ya no sirve: se renueva.
          if (existente && !mismaLlave(existente.options && existente.options.applicationServerKey, llave)) {
            return existente.unsubscribe().then(function () { return null; });
          }
          return existente;
        }).then(function (existente) {
          return existente || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llave });
        }).then(function (sub) {
          var k = sub.toJSON().keys || {};
          return api('push_suscribir', {
            ep: hex(sub.endpoint), p256dh: hex(k.p256dh || ''), auth: hex(k.auth || '')
          }).then(function (s) {
            if (s && s.success) { guardarUsuario(uid()); return { ok: true, mensaje: '' }; }
            return { ok: false, mensaje: (s && s.error) || 'El servidor no guardó la suscripción.' };
          });
        }, function (e) {
          if (navigator.brave) {
            return { ok: false, mensaje: 'Brave trae apagados estos avisos. Abre brave://settings/privacy, activa "Usar los servicios de Google para la mensajería push", reinicia Brave y vuelve a intentar.' };
          }
          return { ok: false, mensaje: 'El servicio de avisos del navegador no respondió' + (e && e.message ? ' (' + e.message + ')' : '') + '.' };
        });
      });
    }).then(null, function (e) {
      return { ok: false, mensaje: 'No se pudieron activar los avisos' + (e && e.message ? ' (' + e.message + ')' : '') + '.' };
    });
  }

  function desactivar() {
    guardarUsuario('');
    if (plataforma() !== 'ok') return Promise.resolve({ ok: true, mensaje: '' });
    return suscripcionActual().then(function (sub) {
      if (!sub) return null;
      return sha256(sub.endpoint).then(function (h) {
        return api('push_quitar', { h: h }).then(null, function () { return null; });
      }).then(function () { return sub.unsubscribe(); });
    }).then(function () { return { ok: true, mensaje: '' }; },
            function () { return { ok: true, mensaje: '' }; });
  }

  function sha256(texto) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)).then(function (buf) {
      var b = new Uint8Array(buf), h = '';
      for (var i = 0; i < b.length; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
      return h;
    });
  }

  /* El servidor manda un aviso de prueba a TODOS los dispositivos de la cuenta y dice qué contestó cada
     servicio de push. Devuelve { ok, mensaje }. */
  function probar() {
    return api('push_probar').then(function (r) {
      if (!r || !r.success) return { ok: false, mensaje: (r && r.error) || 'No se pudo mandar la prueba.' };
      if (!r.dispositivos) return { ok: false, mensaje: r.mensaje || 'No tienes dispositivos con avisos activos.' };
      if (r.enviados > 0) {
        return { ok: true, mensaje: 'Prueba enviada a ' + r.enviados + ' dispositivo' + (r.enviados === 1 ? '' : 's') +
          '. Debe aparecer en unos segundos. Si no aparece, revisa que el sistema permita las notificaciones de este navegador y que "No molestar" esté apagado.' };
      }
      if (r.eliminados > 0 && !r.fallidos) {
        guardarUsuario('');
        return { ok: false, mensaje: 'Este dispositivo ya no estaba suscrito. Desactiva y vuelve a activar los avisos.' };
      }
      return { ok: false, mensaje: 'El servicio de avisos rechazó el envío' + ((r.codigos && r.codigos.length) ? ' (código ' + r.codigos.join(', ') + ')' : '') +
        '. Si sigue igual, desactiva y vuelve a activar los avisos.' };
    }, function (e) { return { ok: false, mensaje: 'No se pudo mandar la prueba' + (e && e.message ? ' (' + e.message + ')' : '') + '.' }; });
  }

  /* ── Ir a la pantalla del aviso (?ir=pagos, ?ir=ayuda...) ──────
     El service worker abre la aplicación con ?ir=<pantalla>. Se lee UNA vez al cargar y se limpia de la
     barra de direcciones; cuando la persona ya inició sesión, su pantalla pide la que le toca con
     tomarIr([...]) (devuelve la pantalla si está entre las permitidas y la consume, o ''). */
  var irPedido = '';
  try {
    var q = new URLSearchParams(window.location.search);
    var v = q.get('ir');
    if (v && /^[a-z_]{1,30}$/.test(v)) {
      irPedido = v;
      q.delete('ir');
      var resto = q.toString();
      window.history.replaceState(null, '', window.location.pathname + (resto ? '?' + resto : '') + window.location.hash);
    }
  } catch (e) { /* sin esto la aplicación abre en su pantalla de siempre */ }

  function tomarIr(permitidos) {
    if (!irPedido) return '';
    var v = irPedido;
    if (permitidos.indexOf(v) === -1) return '';
    irPedido = '';
    return v;
  }

  return {
    plataforma: plataforma, estado: estado, activar: activar, desactivar: desactivar, probar: probar,
    esIOS: esIOS, instalada: instalada, tomarIr: tomarIr
  };
})();
