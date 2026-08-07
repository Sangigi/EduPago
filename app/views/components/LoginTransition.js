var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};

/* views/LoginTransition.jsx
   METAMORFOSIS Login → Dashboard con "metaballs" de colores.
*/

function ltRand(i, salt) {
  var x = Math.sin((i + 1) * 127.1 + (salt || 0) * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function ltGeometria(origin, role) {
  var W = window.innerWidth, H = window.innerHeight;
  var esMobile = W <= 768;

  var st = getComputedStyle(document.documentElement);
  var v = function(name, def) { var x = st.getPropertyValue(name); return x ? x.trim() : def; };

  var sidebarW = parseFloat(v('--sidebar-w', '256')) || 256;
  var headerH  = parseFloat(v('--header-h', '64'))  || 64;
  
  // Valores por defecto más apegados a tu paleta oscura para evitar parpadeos blancos
  var sideCol  = v('--side-bg',    '#1a1c33'); 
  var barCol   = v('--bg-solid',   '#1a1c33');
  var cardCol  = v('--bg-surface', '#222543');

  // Paleta de las gotas EN VUELO
  var navy  = v('--navy', '#1a1c33');
  var navyL = v('--navy-light', '#222543');
  var lime  = v('--lime', '#bdcf00');
  
  // Modificado: Más tonos oscuros para que el aterrizaje no sea un choque visual brillante.
  var flightPalette = [navyL, navy, lime, navyL, navy];

  if (esMobile) { sidebarW = 0; headerH = 58; }

  var focoRect = origin && origin.card ? origin.card : (origin && origin.button) || null;
  var cx = focoRect ? focoRect.left + focoRect.width / 2 : W / 2;
  var cy = focoRect ? focoRect.top + focoRect.height / 2 : H / 2;
  var spread = focoRect ? Math.max(focoRect.width, focoRect.height) * 0.42 : 150;

  var blobs = [];
  var k = 0;

  function empujar(t, groupIndex, esPrimaria) {
    var ang = ltRand(k, 0) * Math.PI * 2;
    var rad = spread * (0.25 + ltRand(k, 1) * 0.9);
    var destCx = t.tx + t.tw / 2, destCy = t.ty + t.th / 2;
    var dirx = destCx - cx, diry = destCy - cy;
    var dlen = Math.hypot(dirx, diry) || 1;
    var ox = cx + Math.cos(ang) * rad * 0.6 + (dirx / dlen) * spread * 0.35;
    var oy = cy + Math.sin(ang) * rad * 0.6 + (diry / dlen) * spread * 0.35;

    blobs.push({
      sx: ox - t.os / 2, sy: oy - t.os / 2, sw: t.os, sh: t.os,
      tx: t.tx, ty: t.ty, tw: t.tw, th: t.th, tr: t.tr,
      color: t.color,
      flight: flightPalette[k % flightPalette.length],
      delay: (groupIndex * 0.03 + (esPrimaria ? 0 : 0.06 + ltRand(k, 5) * 0.16)),
      dur: 1.25 + ltRand(k, 6) * 0.3,
      primary: esPrimaria
    });
    k++;
  }

  // OPTIMIZACIÓN: Se redujo nSat en general en las llamadas para quitar carga a la GPU
  function grupo(rect, color, radius, nSat, satMax) {
    var gi = k;
    empujar({
      tx: rect.x, ty: rect.y, tw: rect.w, th: rect.h, tr: radius, color: color,
      os: Math.min(Math.max(rect.w, rect.h) * 0.22, 84) + 26
    }, gi, true);
    for (var s = 0; s < nSat; s++) {
      var size = 26 + ltRand(k, 2) * (satMax - 26);
      var m = size / 2 + 6;
      var px = rect.x + m + ltRand(k, 3) * Math.max(rect.w - 2 * m, 1);
      var py = rect.y + m + ltRand(k, 4) * Math.max(rect.h - 2 * m, 1);
      empujar({ tx: px - size / 2, ty: py - size / 2, tw: size, th: size, tr: '50%', color: color, os: size }, gi, false);
    }
  }

  // ── Destinos predeterminados según el rol ─────────────────────────────────
  if (role === 'familia') {
    grupo({ x: 0, y: 0, w: W, h: headerH }, barCol, '0px', 2, 70);
    var padF = esMobile ? 14 : 28, gapF = 16;
    var cWF = W - padF * 2;
    var maxW = Math.min(cWF, 760);
    var lx = padF + (cWF - maxW) / 2;
    var y0F = headerH + padF;
    var topH = esMobile ? 150 : 180;
    grupo({ x: lx, y: y0F, w: maxW, h: topH }, cardCol, '14px', 2, 70);

    var y1F = y0F + topH + gapF;
    var bigHF = Math.min(Math.max(H - y1F - padF, 150), esMobile ? 240 : 300);
    if (esMobile) {
      grupo({ x: lx, y: y1F, w: maxW, h: bigHF }, cardCol, '14px', 1, 60);
    } else {
      var aWF = maxW * 0.5 - gapF / 2;
      grupo({ x: lx, y: y1F, w: aWF, h: bigHF }, cardCol, '14px', 1, 60);
      grupo({ x: lx + aWF + gapF, y: y1F, w: aWF, h: bigHF }, cardCol, '14px', 1, 60);
    }
  } 
  else if (role === 'cajero') {
    // CAJERO: Sidebar + Topbar + 4 Stats + 2 Tarjetas grandes
    if (!esMobile) grupo({ x: 0, y: 0, w: sidebarW, h: H }, sideCol, '0px', 2, 90);
    grupo({ x: sidebarW, y: 0, w: W - sidebarW, h: headerH }, barCol, '0px', 2, 70);

    var padC = esMobile ? 14 : 24;
    var gapC = 20; 
    var gapStatsC = 16;
    var x0C = sidebarW + padC;
    
    // MODIFICADO: Aumentamos este valor (de 85 a 115) para que los cuadros bajen más
    var y0C = headerH + padC + (esMobile ? 90 : 115); 
    var cWC = W - sidebarW - padC * 2;

    var nStatsC = esMobile ? 2 : 4;
    var statHC = esMobile ? 90 : 115;
    var statWC = (cWC - gapStatsC * (nStatsC - 1)) / nStatsC;
    
    for (var i = 0; i < nStatsC; i++) {
      var rowC = esMobile ? Math.floor(i / 2) : 0;
      var colC = esMobile ? i % 2 : i;
      var pxC = x0C + colC * (statWC + gapStatsC);
      var pyC = y0C + rowC * (statHC + gapStatsC);
      // Reducido a 0 satélites para tarjetas pequeñas, ayuda a la fluidez
      grupo({ x: pxC, y: pyC, w: statWC, h: statHC }, cardCol, '14px', 0, 40);
    }

    var statsTotalH = esMobile ? (statHC * 2 + gapStatsC) : statHC;
    var y1C = y0C + statsTotalH + 24; 
    var bigHC = Math.min(Math.max(H - y1C - padC, 150), esMobile ? 220 : 400);

    if (esMobile) {
      grupo({ x: x0C, y: y1C, w: cWC, h: bigHC }, cardCol, '14px', 1, 60);
    } else {
      var rightW = 320; 
      var leftW = cWC - rightW - gapC;
      grupo({ x: x0C, y: y1C, w: leftW, h: bigHC }, cardCol, '14px', 2, 70);
      grupo({ x: x0C + leftW + gapC, y: y1C, w: rightW, h: bigHC }, cardCol, '14px', 1, 60);
    }
  } 
  else {
    // ADMIN / SUPERADMIN
    if (!esMobile) grupo({ x: 0, y: 0, w: sidebarW, h: H }, sideCol, '0px', 2, 90);
    grupo({ x: sidebarW, y: 0, w: W - sidebarW, h: headerH }, barCol, '0px', 2, 70);

    var pad = esMobile ? 14 : 24, gap = esMobile ? 12 : 16;
    var x0 = sidebarW + pad;
    var y0 = headerH + pad + 115; // También ajustado para consistencia
    var cW = W - sidebarW - pad * 2;

    var planH = 75;
    grupo({ x: x0, y: y0, w: cW, h: planH }, cardCol, '14px', 1, 60);

    var y1 = y0 + planH + 40;
    var nStats = esMobile ? 2 : 4;
    var statH = esMobile ? 90 : 104;
    var statW = (cW - gap * (nStats - 1)) / nStats;
    for (var j = 0; j < nStats; j++) {
      var row = esMobile ? Math.floor(j / 2) : 0;
      var col = esMobile ? j % 2 : j;
      grupo({ x: x0 + col*(statW+gap), y: y1 + row*(statH+gap), w: statW, h: statH }, cardCol, '14px', 0, 40);
    }
  }

  return { blobs: blobs };
}

function ltVars(b) {
  return {
    '--sx': b.sx + 'px', '--sy': b.sy + 'px', '--sw': b.sw + 'px', '--sh': b.sh + 'px',
    '--tx': b.tx + 'px', '--ty': b.ty + 'px', '--tw': b.tw + 'px', '--th': b.th + 'px',
    '--tr': b.tr, '--lt-color': b.color, '--lt-flight': b.flight,
    animationDelay: b.delay + 's', animationDuration: b.dur + 's'
  };
}

function LoginTransition({ origin, role, onDone }) {
  const { useEffect, useState, useMemo, useRef } = React;
  const [fadeOut, setFadeOut] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone && onDone();
  };

  let prefiereMenos = false;
  try { prefiereMenos = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  useEffect(() => {
    const timers = [];
    try {
      if (prefiereMenos) {
        timers.push(setTimeout(() => setFadeOut(true), 60));
        timers.push(setTimeout(finish, 340));
      } else {
        // Empieza a desvanecer MUCHO ANTES (a los 0.8 segundos)
        timers.push(setTimeout(() => setFadeOut(true), 800)); 
        
        // Termina la transición y muestra el dashboard (a los 1.2 segundos)
        timers.push(setTimeout(finish, 1200)); 
      }
    } catch (e) { finish(); }
    
    // Red de seguridad reducida a 2 segundos
    timers.push(setTimeout(finish, 2000)); 
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const geo = useMemo(() => {
    try { return ltGeometria(origin, role); }
    catch (e) { return { blobs: [] }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (prefiereMenos) {
    return /*#__PURE__*/_jsxDEV("div", { id: "lt-overlay", className: fadeOut ? 'lt-fade-out' : '' }, void 0, false);
  }

  return /*#__PURE__*/_jsxDEV("div", {
    id: "lt-overlay",
    className: fadeOut ? 'lt-fade-out' : '',
    children: [
      /*#__PURE__*/_jsxDEV("svg", {
        className: "lt-defs", "aria-hidden": "true", width: "0", height: "0",
        children: /*#__PURE__*/_jsxDEV("defs", {
          children: /*#__PURE__*/_jsxDEV("filter", {
            id: "lt-goo",
            children: [
              /*#__PURE__*/_jsxDEV("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "11", result: "blur" }, void 0, false),
              /*#__PURE__*/_jsxDEV("feColorMatrix", {
                in: "blur", mode: "matrix",
                values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9", result: "goo"
              }, void 0, false),
              /*#__PURE__*/_jsxDEV("feBlend", { in: "SourceGraphic", in2: "goo" }, void 0, false)
            ]
          }, void 0, true)
        }, void 0, false)
      }, void 0, false),
      /*#__PURE__*/_jsxDEV("div", {
        className: "lt-goo-layer",
        children: geo.blobs.map((b, i) => /*#__PURE__*/_jsxDEV("div", {
          className: "lt-blob" + (b.primary ? " lt-blob--primary" : " lt-blob--sat"),
          style: ltVars(b)
        }, "b" + i, false))
      }, void 0, false)
    ]
  }, void 0, true);
}