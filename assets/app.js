/* Paga la Escuela — interacciones de la landing
   Sin dependencias. Todo respeta prefers-reduced-motion. */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mqDesk = window.matchMedia('(min-width: 1081px)');

  /* ---------- 1. Nav sólido al bajar ---------- */
  var nav = document.getElementById('nav');
  function onNav() {
    if (nav) nav.classList.toggle('solid', window.scrollY > 40);
  }
  onNav();

  /* ---------- 2. Revelados al entrar en pantalla ---------- */
  var revs = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revs.forEach(function (el) { io.observe(el); });
  } else {
    revs.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- 3. Parallax del hero ---------- */
  var pars = [].slice.call(document.querySelectorAll('[data-par]'));
  var stage = document.getElementById('stage');
  var heroIn = document.querySelector('.hero-in');

  function resetParallax() {
    // Sin esto, si el usuario baja hasta el fondo en escritorio y luego
    // cambia a móvil, la opacidad/transform que dejó el escritorio se
    // queda pegada en línea y el hero se ve atenuado permanentemente.
    if (stage) stage.style.transform = '';
    if (heroIn) {
      heroIn.style.opacity = '';
      heroIn.style.transform = '';
    }
    pars.forEach(function (el) { el.style.transform = ''; });
  }

  function parallax() {
    if (reduce || !stage || !mqDesk.matches) { resetParallax(); return; }
    var y = window.scrollY;
    var vh = window.innerHeight;
    // Zoom-reveal del dashboard (estilo mattilda): entra pequeño y crece al hacer scroll
    var p = Math.min(Math.max(y / (vh * 0.85), 0), 1);
    var scale = 0.9 + p * 0.16;                 // 0.90 -> 1.06
    stage.style.transform = 'scale(' + scale.toFixed(4) + ')';
    // Texto del hero: se desvanece y sube mientras el dashboard avanza
    if (heroIn) {
      var tp = Math.min(Math.max(y / (vh * 0.8), 0), 1);
      heroIn.style.opacity = (1 - tp * 0.95).toFixed(3);
      heroIn.style.transform = 'translateY(' + (tp * -60).toFixed(1) + 'px)';
    }
    // Parallax sutil de los elementos internos
    if (y > vh * 1.5) return;
    for (var i = 0; i < pars.length; i++) {
      var el = pars[i];
      var f = parseFloat(el.getAttribute('data-par'));
      el.style.transform = 'translate3d(0,' + (y * f).toFixed(2) + 'px,0)';
    }
  }

  /* ---------- 3b. Maquetas del sistema: escalado y animación ---------- */
  var mocks = [].slice.call(document.querySelectorAll('.mk'));

  function scaleMock(mk) {
    var wrap = mk.parentElement;
    // getBoundingClientRect da el ancho fraccionario; clientWidth lo redondea
    // y dejaba una franja de 1-2 px sin cubrir.
    var w = wrap.getBoundingClientRect().width;
    if (!w) return;                        // oculta en este tamaño
    mk.style.transform = 'scale(' + (w / parseFloat(mk.dataset.w)) + ')';
  }
  function scaleAll() { mocks.forEach(scaleMock); }

  // conteo ascendente de los indicadores
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var final = el.getAttribute('data-txt');
    if (!target || reduce) { el.textContent = final; return; }
    var dec = final.indexOf('.') > -1, t0 = null, dur = 1100;
    function tick(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      var v = target * (1 - Math.pow(1 - p, 3));   // salida suave
      el.textContent = dec
        ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : Math.round(v).toLocaleString('es-MX');
      if (p < 1) requestAnimationFrame(tick); else el.textContent = final;
    }
    requestAnimationFrame(tick);
  }

  function animateMock(mk) {
    if (mk.classList.contains('mk-live')) return;
    mk.classList.add('mk-live');
    [].slice.call(mk.querySelectorAll('[data-count]')).forEach(function (el, i) {
      setTimeout(function () { countUp(el); }, 140 + i * 90);
    });
  }

  if (mocks.length) {
    scaleAll();
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function (entries) {
        entries.forEach(function (e) {
          var mk = e.target.querySelector('.mk');
          if (mk) scaleMock(mk);
        });
      });
      mocks.forEach(function (mk) { ro.observe(mk.parentElement); });
    } else {
      window.addEventListener('resize', scaleAll);
    }
    // el ancho puede cambiar al aparecer la barra de scroll o al cargar
    // las tipografías, así que se reescala también en esos momentos
    window.addEventListener('load', scaleAll);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scaleAll);
    setTimeout(scaleAll, 400);

    if ('IntersectionObserver' in window) {
      var mio = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { animateMock(e.target.querySelector('.mk')); mio.unobserve(e.target); }
        });
      }, { threshold: 0.15 });
      mocks.forEach(function (mk) { mio.observe(mk.parentElement); });
    } else {
      mocks.forEach(animateMock);
    }
  }

  /* ---------- 4. Proceso pineado de 3 etapas ---------- */
  var track = document.getElementById('procTrack');
  var steps = [].slice.call(document.querySelectorAll('.step'));
  var viss = [].slice.call(document.querySelectorAll('.pv'));
  var hint = document.getElementById('procHint');
  var current = 0;

  function setStage(i) {
    if (i === current) return;
    current = i;
    steps.forEach(function (s, n) { s.classList.toggle('on', n === i); });
    viss.forEach(function (v, n) { v.classList.toggle('on', n === i); });
  }

  function sizeTrack() {
    if (!track) return;
    if (!reduce) {
      // una pantalla de scroll por etapa, más un margen de salida (aplica en desktop y móvil)
      track.style.height = (steps.length * 100 + 40) + 'vh';
    } else {
      track.style.height = '';
      steps.forEach(function (s) { s.classList.add('on'); });
      viss.forEach(function (v, n) { v.classList.toggle('on', n === 0); });
    }
  }

  function proc() {
    if (!track || reduce) return;
    var r = track.getBoundingClientRect();
    var total = track.offsetHeight - window.innerHeight;
    if (total <= 0) return;
    var p = Math.min(Math.max(-r.top / total, 0), 0.9999);
    setStage(Math.floor(p * steps.length));
    if (hint) hint.classList.toggle('hide', p > 0.72 || r.top > 40);
  }

  // clic en una etapa: lleva el scroll a esa posición
  steps.forEach(function (s, i) {
    s.addEventListener('click', function () {
      if (!track || reduce) { setStage(i); return; }
      var total = track.offsetHeight - window.innerHeight;
      // offsetTop es relativo al offsetParent (aquí "section.proc"), no a la
      // página. Sin esto, el destino se calculaba desde 0 y el clic mandaba
      // el scroll a otra parte del sitio en vez de quedarse en esta sección.
      var trackTop = track.getBoundingClientRect().top + window.pageYOffset;
      var top = trackTop + (i + 0.35) * (total / steps.length);
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });

  /* ---------- 5. Tabs de audiencias con autoavance ---------- */
  var tabsHead = document.querySelector('.tabs-head');
  var tabs = [].slice.call(document.querySelectorAll('.tab'));
  var panels = [].slice.call(document.querySelectorAll('.tp'));
  var tabIdx = 0;

  // El avance lo dispara la propia barra de progreso al terminar de
  // llenarse (animationend), no un temporizador aparte. Así la barra y
  // el cambio de pestaña nunca se desincronizan.
  function setTab(i) {
    tabIdx = i;
    tabs.forEach(function (t, n) {
      var on = n === i;
      t.classList.remove('on');
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) { void t.offsetWidth; t.classList.add('on'); } // reinicia la barra
    });
    panels.forEach(function (p, n) { p.classList.toggle('on', n === i); });
    scaleAll();                    // el panel recién mostrado ya tiene ancho
  }

  function startTabs() { if (tabsHead && !reduce) tabsHead.classList.add('auto'); }
  function pauseTabs(v) { if (tabsHead) tabsHead.classList.toggle('paused', v); }
  function stopTabs() { if (tabsHead) tabsHead.classList.remove('auto', 'paused'); }

  if (tabsHead) {
    tabsHead.addEventListener('animationend', function (e) {
      if (e.animationName === 'fill' && tabsHead.classList.contains('auto')) {
        setTab((tabIdx + 1) % tabs.length);
      }
    });
  }

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { stopTabs(); setTab(i); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { stopTabs(); setTab((i + 1) % tabs.length); tabs[(i + 1) % tabs.length].focus(); }
      if (e.key === 'ArrowLeft') { stopTabs(); setTab((i - 1 + tabs.length) % tabs.length); tabs[(i - 1 + tabs.length) % tabs.length].focus(); }
    });
  });

  // el autoavance solo corre cuando la sección está a la vista
  var tabHost = document.getElementById('audiencias');
  if (tabHost && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { startTabs(); pauseTabs(false); } else { pauseTabs(true); }
      });
    }, { threshold: 0.25 }).observe(tabHost);
  }

  /* ---------- 6. Menú móvil ---------- */
  var burger = document.getElementById('burger');
  var navMenu = document.getElementById('navMenu');

  if (burger && navMenu) {
    function menu(abrir) {
      var v = (abrir === undefined) ? !navMenu.classList.contains('open') : abrir;
      navMenu.classList.toggle('open', v);
      navMenu.setAttribute('aria-hidden', v ? 'false' : 'true');
      burger.setAttribute('aria-expanded', v ? 'true' : 'false');
      burger.setAttribute('aria-label', v ? 'Cerrar menú' : 'Abrir menú');
      document.body.classList.toggle('menu-open', v);
      if (nav) nav.classList.toggle('menu-abierto', v);
    }

    burger.addEventListener('click', function (e) { e.stopPropagation(); menu(); });

    // al elegir una sección el menú se cierra solo
    [].slice.call(navMenu.querySelectorAll('a')).forEach(function (a) {
      a.addEventListener('click', function () { menu(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navMenu.classList.contains('open')) { menu(false); burger.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (navMenu.classList.contains('open') && !navMenu.contains(e.target)) menu(false);
    });
    // si se agranda la ventana, el menú deja de tener sentido
    window.addEventListener('resize', function () {
      if (window.innerWidth > 860 && navMenu.classList.contains('open')) menu(false);
    }, { passive: true });
  }


  /* ---------- 8. Formularios (solicitud de info y distribuidores) ---------- */
  function campo(el) { return el.closest('.f-field'); }

  function marcar(el, msg) {
    var f = campo(el); if (!f) return;
    f.classList.toggle('err', !!msg);
    var p = f.querySelector('[data-err]');
    if (p) p.textContent = msg || '';
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function validar(el) {
    var v = (el.value || '').trim();
    if (el.type === 'checkbox') {
      return el.checked ? '' : 'Necesitamos tu consentimiento para contactarte.';
    }
    if (el.required && !v) {
      return el.tagName === 'SELECT' ? 'Elige una opción.' : 'Este campo es obligatorio.';
    }
    if (!v) return '';
    if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
      return 'Revisa el correo, parece incompleto.';
    }
    if (el.type === 'tel' && (v.replace(/\D/g, '').length < 10)) {
      return 'El teléfono debe tener 10 dígitos.';
    }
    if (el.type === 'number' && v && (+v < 1 || +v > 999)) {
      return 'Escribe un número entre 1 y 999.';
    }
    return '';
  }

  // cfg: {form, okPanel, wa, formName, sendLabel, failMsg, mensajeWA(d), extra(d)}
  function wireForm(cfg) {
    var form = cfg.form;
    if (!form) return;
    var fail = form.querySelector('.cf-fail');
    var btn = form.querySelector('.cf-send');
    var btnTxt = form.querySelector('.cf-send-t');
    var campos = [].slice.call(form.querySelectorAll('input, select'));

    campos.forEach(function (el) {
      // el error se limpia en cuanto la persona corrige
      el.addEventListener('input', function () { if (campo(el) && campo(el).classList.contains('err')) marcar(el, validar(el)); });
      el.addEventListener('change', function () { if (campo(el) && campo(el).classList.contains('err')) marcar(el, validar(el)); });
      // el checkbox de aviso se queda fuera: su "blur" ocurre con solo tocarlo
      // y soltar el foco, así que su error solo debe aparecer al enviar
      if (el.type !== 'checkbox') {
        el.addEventListener('blur', function () { if (el.value || el.required) marcar(el, validar(el)); });
      }
    });

    function datos() {
      var d = {};
      campos.forEach(function (el) {
        d[el.name] = el.type === 'checkbox' ? el.checked : (el.value || '').trim();
      });
      d.origen = 'landing pagalaescuela';
      d.enviado = new Date().toISOString();
      return d;
    }

    function exito(d) {
      if (window.dataLayer) {
        var evt = { event: 'generate_lead', form: cfg.formName };
        if (cfg.extra) {
          var ex = cfg.extra(d);
          for (var k in ex) evt[k] = ex[k];
        }
        window.dataLayer.push(evt);
      }
      var n = (d.nombre || '').split(' ')[0];
      var slot = cfg.okPanel && cfg.okPanel.querySelector('[data-ok-nombre]');
      if (slot && n) slot.textContent = ', ' + n;
      form.hidden = true;
      if (cfg.okPanel) { cfg.okPanel.hidden = false; cfg.okPanel.focus && cfg.okPanel.focus(); }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (fail) fail.hidden = true;

      var primero = null;
      campos.forEach(function (el) {
        var msg = validar(el);
        marcar(el, msg);
        if (msg && !primero) primero = el;
      });
      if (primero) {
        primero.focus();
        primero.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        return;
      }

      var d = datos();
      var url = form.getAttribute('data-endpoint');

      if (!url) {
        // Sin endpoint configurado: en vez de perder el contacto, se abre
        // WhatsApp con los datos ya escritos. Ver README para conectarlo.
        console.warn('[Paga la Escuela] Falta data-endpoint en #' + form.id + '. Se usa el respaldo por WhatsApp.');
        window.open('https://wa.me/' + cfg.wa + '?text=' + encodeURIComponent(cfg.mensajeWA(d)), '_blank', 'noopener');
        exito(d);
        return;
      }

      btn.setAttribute('aria-busy', 'true');
      if (btnTxt) btnTxt.textContent = 'Enviando…';
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        exito(d);
      }).catch(function (err) {
        console.error('[Paga la Escuela] Error al enviar:', err);
        btn.removeAttribute('aria-busy');
        if (btnTxt) btnTxt.textContent = cfg.sendLabel;
        if (fail) {
          fail.textContent = cfg.failMsg;
          fail.hidden = false;
        }
      });
    });
  }

  wireForm({
    form: document.getElementById('leadForm'),
    okPanel: document.getElementById('leadOk'),
    wa: '52XXXXXXXXXX',                              // PLACEHOLDER: número WhatsApp (E.164, sin +). Respaldo si no hay endpoint.
    formName: 'solicitud_informacion',
    sendLabel: 'Solicitar información',
    failMsg: 'No pudimos enviar la solicitud. Inténtalo de nuevo o escríbenos por WhatsApp al 55 XXXX XXXX.',
    extra: function (d) { return { rango_alumnos: d.alumnos }; },
    mensajeWA: function (d) {
      return 'Hola, solicito información de Paga la Escuela.\n\n' +
        'Nombre: ' + d.nombre + '\n' +
        'Institución: ' + d.institucion + '\n' +
        'Correo: ' + d.correo + '\n' +
        'Teléfono: ' + d.telefono + '\n' +
        'Planteles: ' + (d.planteles || 'no especificado') + '\n' +
        'Alumnos: ' + d.alumnos;
    }
  });

  wireForm({
    form: document.getElementById('distForm'),
    okPanel: document.getElementById('distOk'),
    wa: '52XXXXXXXXXX',                              // PLACEHOLDER: número WhatsApp (E.164, sin +). Respaldo si no hay endpoint.
    formName: 'solicitud_distribuidor',
    sendLabel: 'Enviar solicitud',
    failMsg: 'No pudimos enviar tu solicitud. Inténtalo de nuevo o escríbenos por WhatsApp al 55 XXXX XXXX.',
    extra: function (d) { return { perfil_distribuidor: d.perfil }; },
    mensajeWA: function (d) {
      return 'Hola, quiero ser distribuidor de Paga la Escuela.\n\n' +
        'Nombre: ' + d.nombre + '\n' +
        'Correo: ' + d.correo + '\n' +
        'Teléfono: ' + d.telefono + '\n' +
        'Ciudad/Estado: ' + d.ciudad + '\n' +
        'Perfil: ' + d.perfil + '\n' +
        'Colegios con los que ya trabaja: ' + (d.colegios || 'no especificado');
    }
  });

  /* ---------- 8b. Distribuidores: "Soy distribuidor" / "Quiero ser distribuidor" ---------- */
  var dseg = document.querySelector('.dseg');
  if (dseg) {
    var dsegBtns = [].slice.call(dseg.querySelectorAll('.dseg-btn'));
    var dPanels = [].slice.call(document.querySelectorAll('.dseg-p'));

    function setDseg(name) {
      dsegBtns.forEach(function (b) {
        var on = b.getAttribute('data-dseg') === name;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      dPanels.forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-dpanel') === name); });
    }

    dsegBtns.forEach(function (b) {
      b.addEventListener('click', function () { setDseg(b.getAttribute('data-dseg')); });
    });
    // enlace "Regístrate como distribuidor" dentro del panel de acceso
    [].slice.call(document.querySelectorAll('[data-dgoto]')).forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); setDseg(a.getAttribute('data-dgoto')); });
    });
  }


  /* ---------- 9. WhatsApp flotante ---------- */
  var waFab = document.getElementById('waFab');
  var waPanel = document.getElementById('waPanel');

  if (waFab && waPanel) {
    var WA_NUM = '52XXXXXXXXXX';   // PLACEHOLDER: número WhatsApp del widget (E.164, sin +).
    var waText = document.getElementById('waText');
    var waSend = document.getElementById('waSend');
    var waBody = document.getElementById('waBody');
    var waAbierto = false;

    function waAjustaAlto() {
      waText.style.height = 'auto';
      waText.style.height = Math.min(waText.scrollHeight, 96) + 'px';
      waSend.disabled = !waText.value.trim();
    }

    function waToggle(abrir) {
      waAbierto = (abrir === undefined) ? !waAbierto : abrir;
      waPanel.classList.toggle('open', waAbierto);
      waFab.classList.toggle('open', waAbierto);
      waPanel.setAttribute('aria-hidden', waAbierto ? 'false' : 'true');
      waFab.setAttribute('aria-expanded', waAbierto ? 'true' : 'false');
      waFab.setAttribute('aria-label', waAbierto ? 'Cerrar el chat' : 'Abrir chat de WhatsApp');
      if (waAbierto) {
        // en móvil el teclado taparía el panel: no robamos el foco
        if (window.innerWidth > 640) setTimeout(function () { waText.focus(); }, 240);
      } else {
        waFab.focus();
      }
    }

    function waEnviar() {
      var t = waText.value.trim();
      if (!t) { waText.focus(); return; }
      if (window.dataLayer) {
        window.dataLayer.push({ event: 'contact_whatsapp', origen: 'widget flotante' });
      }
      window.open('https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent(t), '_blank', 'noopener');
    }

    waFab.addEventListener('click', function () { waToggle(); });
    var waX = document.getElementById('waClose');
    if (waX) waX.addEventListener('click', function () { waToggle(false); });
    waSend.addEventListener('click', waEnviar);

    waText.addEventListener('input', waAjustaAlto);
    waText.addEventListener('keydown', function (e) {
      // Enter envía, Shift+Enter hace salto de línea
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); waEnviar(); }
    });

    // las opciones rápidas rellenan el campo, no envían solas:
    // la persona alcanza a editar antes de salir a WhatsApp
    [].slice.call(waPanel.querySelectorAll('.wa-chip')).forEach(function (c) {
      c.addEventListener('click', function () {
        waText.value = c.textContent.trim() + ' ';
        waAjustaAlto();
        waText.focus();
        waBody.scrollTop = waBody.scrollHeight;
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && waAbierto) waToggle(false);
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-wa-prefill]')) return;
      if (waAbierto && !waPanel.contains(e.target) && !waFab.contains(e.target)) waToggle(false);
    });

    // Botones de la página que abren el chat con un mensaje ya escrito
    // (por ejemplo, el de distribuidores). El href a wa.me sigue ahí como
    // respaldo si el JS no carga.
    [].slice.call(document.querySelectorAll('[data-wa-prefill]')).forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        // sin esto, el mismo clic burbujea hasta el listener de "clic fuera"
        // y cierra el panel justo después de abrirlo
        e.stopPropagation();
        waText.value = el.getAttribute('data-wa-prefill') + ' ';
        waToggle(true);
        waAjustaAlto();
        setTimeout(function () { waText.focus(); waText.selectionStart = waText.value.length; }, 260);
      });
    });

    waAjustaAlto();
  }

  /* ---------- 7. Bucle de scroll ---------- */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      onNav(); parallax(); proc();
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { sizeTrack(); proc(); scaleAll(); parallax(); }, { passive: true });
  if (mqDesk.addEventListener) mqDesk.addEventListener('change', function () { sizeTrack(); parallax(); });

  sizeTrack();
  onScroll();
})();
