/* ══════════════════════════════════════════════════════
   EduPago · avisos aunque la plataforma esté cerrada (OF-7b)

   Lo instala el navegador cuando alguien activa "Avisos en este dispositivo". Vive en la RAÍZ de la
   aplicación para tener ese alcance (scope) y poder abrir cualquier pantalla al tocar un aviso.
   El navegador lo despierta cuando el servidor "toca" (lib/helpers_push.php), aunque no haya ninguna
   pestaña de EduPago abierta.

   EL TOQUE LLEGA VACÍO. Al despertar, este archivo le pregunta al servidor qué mostrar (acción pública
   push_aviso), identificándose con el SHA-256 de la dirección de su propia suscripción. El texto es
   GENÉRICO ("Tu pago fue confirmado"): jamás trae montos, nombres de alumnos ni folios.

   No intercepta ninguna petición de la página (no hay `fetch` de la página): solo avisos.
   CSP del .htaccess: es un script del mismo origen y su único fetch es al mismo origen
   (connect-src 'self'), así que no hace falta tocar nada.
   ══════════════════════════════════════════════════════ */

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

var GENERICO = { titulo: 'EduPago', cuerpo: 'Tienes un aviso nuevo.', url: '', tag: 'edupago-aviso' };

/* SHA-256 en hexadecimal (el mismo que calcula el servidor con hash('sha256', $endpoint)). */
function sha256Hex(texto) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)).then(function (buf) {
    var b = new Uint8Array(buf), h = '';
    for (var i = 0; i < b.length; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return h;
  });
}

/* Pide el texto del aviso, con un tope de tiempo: si el servidor no contesta, se muestra el genérico. */
function pedirAviso() {
  return self.registration.pushManager.getSubscription().then(function (sub) {
    if (!sub) return null;
    return sha256Hex(sub.endpoint).then(function (h) {
      var ctl = ('AbortController' in self) ? new AbortController() : null;
      var t = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
      return fetch(new URL('api.php?action=push_aviso', self.registration.scope).href, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ h: h }),
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) { clearTimeout(t); return r.json(); });
    });
  }).then(null, function () { return null; });
}

self.addEventListener('push', function (e) {
  e.waitUntil(pedirAviso().then(function (j) {
    var a = (j && j.success && j.titulo) ? j : GENERICO;
    var icono = new URL('assets/logo_icon.png', self.registration.scope).href;
    return self.registration.showNotification(a.titulo || GENERICO.titulo, {
      body: a.cuerpo || GENERICO.cuerpo,
      tag: a.tag || GENERICO.tag,
      renotify: true,
      icon: icono,
      badge: icono,
      data: { url: a.url || '' }
    });
  }));
});

/* Al tocarlo: a una pestaña de EduPago que ya esté abierta, o una nueva. Si no hay sesión, la página
   pide entrar y luego abre la pantalla (assets/js/push_cliente.js lee ?ir=). */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var destino;
  try {
    destino = new URL((e.notification.data && e.notification.data.url) || '', self.registration.scope);
    if (destino.origin !== self.location.origin) destino = new URL(self.registration.scope);
  } catch (err) { destino = new URL(self.registration.scope); }
  var url = destino.href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (vs) {
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (v.url.indexOf(self.location.origin) === 0 && 'focus' in v) {
        return v.focus().then(function (w) {
          if (w && w.navigate) return w.navigate(url).then(null, function () { return self.clients.openWindow(url); });
          return self.clients.openWindow(url);
        });
      }
    }
    return self.clients.openWindow(url);
  }));
});
