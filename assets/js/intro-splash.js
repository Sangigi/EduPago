(function(){
  var splash = document.getElementById('intro-splash');
  if (!splash) return;

  var LINEA_1 = 'paga la';
  var LINEA_2 = 'escuela';

  var yaVisto = false;
  try { yaVisto = localStorage.getItem('edupago_intro_seen') === '1'; } catch(e){}

  var prefiereMenosMovimiento = false;
  try { prefiereMenosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}

  // Si ya lo vio, aplicamos el modo rápido inmediatamente
  var multiplicadorVelocidad = 1;
  if (yaVisto) {
    splash.classList.add('fast-mode');
    // 0.3 es EXACTAMENTE lo que la clase .fast-mode le pone a --speed en el
    // CSS de index.html. Antes aquí decía 0.45 mientras el CSS corría a 0.3:
    // la animación acababa y el splash seguía tapando la pantalla ~0.7 s de
    // más en cada recarga. Los dos números tienen que moverse juntos.
    multiplicadorVelocidad = 0.3;
  }

  var marcarVisto = function(){
    try { localStorage.setItem('edupago_intro_seen', '1'); } catch(e){}
  };

  var wordLine1 = document.getElementById('word-line1');
  var wordLine2 = document.getElementById('word-line2');

  if (prefiereMenosMovimiento) {
    wordLine1.textContent = LINEA_1;
    wordLine2.textContent = LINEA_2;
    marcarVisto();
    splash.classList.add('intro-hide');
    setTimeout(function(){ splash.remove(); }, 100);
    return;
  }

  var letterIndex = 0;

  function prepararLinea(texto, contenedor) {
    return texto.split('').map(function(letra){
      var span = document.createElement('span');
      span.className = 'intro-letter';
      span.style.setProperty('--i', letterIndex++);
      span.textContent = letra;
      contenedor.appendChild(span);
      return span;
    });
  }

  var spansL1 = prepararLinea(LINEA_1, wordLine1);
  var spansL2 = prepararLinea(LINEA_2, wordLine2);
  var todosLosSpans = spansL1.concat(spansL2);

  requestAnimationFrame(function(){
    var centerX1 = wordLine1.getBoundingClientRect().width / 2;
    var centerX2 = wordLine2.getBoundingClientRect().width / 2;

    spansL1.forEach(function(span){
      var letraCenterX = span.offsetLeft + span.offsetWidth / 2;
      span.style.setProperty('--dx', (centerX1 - letraCenterX) + 'px');
      span.classList.add('intro-letter-animar');
    });

    spansL2.forEach(function(span){
      var letraCenterX = span.offsetLeft + span.offsetWidth / 2;
      span.style.setProperty('--dx', (centerX2 - letraCenterX) + 'px');
      span.classList.add('intro-letter-animar');
    });
  });

  // Cuándo termina DE VERDAD la animación, leído del CSS (index.html):
  //   letras    -> delay (i*50ms + 150ms) + duración 1.15s  -> manda la última
  //   check     -> delay 1.10s + duración 0.6s = 1700 ms
  //   subtítulo -> delay 1.30s + duración 0.6s = 1900 ms
  // Con las 14 letras de "paga la escuela" el tope son las letras: 1950 ms.
  //
  // La fórmula anterior (150 + n*50 + 1600 + 400 = 2850 ms) no correspondía a
  // ninguna de las tres: sobraban ~900 ms en los que la animación ya había
  // acabado y el splash seguía tapando la pantalla. Los +100 son un margen
  // para que el último fotograma se alcance a ver.
  var finAnimacion = ((todosLosSpans.length - 1) * 50 + 150) + 1150;
  var duracionTotal = (finAnimacion + 100) * multiplicadorVelocidad;

  setTimeout(function(){
    splash.classList.add('intro-hide');
    marcarVisto(); // Marcamos para la próxima vez

    // Transición de salida ajustada a la velocidad actual
    var salidaDelay = 600 * multiplicadorVelocidad;
    setTimeout(function(){ splash.remove(); }, salidaDelay);
  }, duracionTotal);
})();
