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
    multiplicadorVelocidad = 0.45; // 45% del tiempo original
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

  // Calculamos la duración total tomando en cuenta si es modo normal o rápido
  var tiempoBase = 150 + (todosLosSpans.length * 50) + 1600 + 400;
  var duracionTotal = tiempoBase * multiplicadorVelocidad;

  setTimeout(function(){
    splash.classList.add('intro-hide');
    marcarVisto(); // Marcamos para la próxima vez

    // Transición de salida ajustada a la velocidad actual
    var salidaDelay = 600 * multiplicadorVelocidad;
    setTimeout(function(){ splash.remove(); }, salidaDelay);
  }, duracionTotal);
})();
