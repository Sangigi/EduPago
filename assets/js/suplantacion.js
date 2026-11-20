/**
 * suplantacion.js — [OF-7c] La barra fija de "Ver como".
 *
 * Mientras exista una sesión de suplantación (AuthController.getSuplantacion()), pinta una barra
 * fija ARRIBA de todo, en TODAS las pantallas (también los portales de familia, alumno y
 * docente, que no pasan por el shell del admin), con:
 *
 *     Estás viendo como <nombre> (<rol>) · solo lectura · quedan 24 min · Volver a mi cuenta
 *
 * Es DOM directo, fuera de React, a propósito: así no hay que tocar cada portal ni el shell, y
 * sobrevive a cualquier pantalla que se monte o desmonte debajo. Los estilos están en main.css
 * (.sup-barra, body.sup-activa) porque la CSP no permite scripts ni estilos en línea.
 *
 * Al vencer (30 min) o al pulsar "Volver a mi cuenta" se suelta SOLO el token de suplantación y
 * se recarga: la sesión propia nunca se cerró.
 */
(function () {
  'use strict';

  var ROLES = {
    superadmin: 'Superadmin', admin: 'Administrador', cajero: 'Cajero', docente: 'Docente',
    familia: 'Familia', alumno: 'Alumno', control_escolar: 'Control escolar', direccion: 'Dirección',
    tienda: 'Tienda', soporte: 'Soporte', distribuidor: 'Distribuidor', contador: 'Contador',
    provision: 'Provisión', tesoreria: 'Tesorería', promotor: 'Promotor'
  };

  function sup() {
    try { return (typeof AuthController !== 'undefined' && AuthController.getSuplantacion) ? AuthController.getSuplantacion() : null; }
    catch (e) { return null; }
  }

  function minutosRestantes(s) {
    return Math.max(0, Math.ceil((s.vence * 1000 - Date.now()) / 60000));
  }

  function texto(s) {
    var u = s.user || {};
    var t = 'Estás viendo como ' + (u.nombre || 'otro usuario') + ' (' + (ROLES[u.rol] || u.rol || '—') + ')';
    if (s.modo === 'lectura') t += ' · solo lectura';
    var m = minutosRestantes(s);
    t += ' · quedan ' + m + ' min';
    return t;
  }

  function volver(boton) {
    if (boton) { boton.disabled = true; boton.textContent = 'Volviendo…'; }
    var fin = function () { try { window.location.reload(); } catch (e) { /* sin ventana */ } };
    try {
      AuthController.terminarSuplantacion().then(fin, fin);
    } catch (e) { fin(); }
  }

  function montar() {
    var s = sup();
    var previa = document.getElementById('sup-barra');
    if (!s) {
      if (previa) previa.parentNode.removeChild(previa);
      document.body.classList.remove('sup-activa');
      document.documentElement.style.removeProperty('--sup-h');
      return;
    }
    var barra = previa;
    if (!barra) {
      barra = document.createElement('div');
      barra.id = 'sup-barra';
      barra.setAttribute('role', 'status');
      barra.setAttribute('aria-live', 'polite');
      var span = document.createElement('span');
      span.className = 'sup-texto';
      var boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'sup-volver';
      boton.textContent = 'Volver a mi cuenta';
      boton.addEventListener('click', function () { volver(boton); });
      barra.appendChild(span);
      barra.appendChild(boton);
      document.body.insertBefore(barra, document.body.firstChild);
    }
    barra.className = 'sup-barra' + (s.modo === 'lectura' ? ' sup-lectura' : ' sup-normal');
    barra.querySelector('.sup-texto').textContent = texto(s);
    document.body.classList.add('sup-activa');
    // La barra puede ocupar dos renglones en móvil: el resto de la app se corre lo que mida.
    document.documentElement.style.setProperty('--sup-h', barra.offsetHeight + 'px');
  }

  function tic() {
    var s = sup();
    if (!s) {
      // Venció (AuthController.getSuplantacion() la soltó sola): se regresa a la cuenta propia.
      if (document.getElementById('sup-barra')) { try { window.location.reload(); } catch (e) { montar(); } }
      return;
    }
    montar();
  }

  function iniciar() {
    montar();
    setInterval(tic, 15000);
    window.addEventListener('resize', montar);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tic(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
