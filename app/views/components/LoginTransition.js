/* views/LoginTransition.js — Login → Dashboard liquid metaball transition.
   No build step: React.createElement directly.

   Efecto (según spec del usuario):
   - Overlay TRANSPARENTE: el login sigue visible por debajo, nunca hay
     fondo negro. Es fluido "desde el login".
   - Cada blob NACE en un elemento real del login (logo, inputs, botón,
     tarjeta) y CRECE hasta convertirse en un elemento real del dashboard
     (sidebar, topbar, stat-cards, cards de contenido) con su color y forma.
   - Filtro gooey (feGaussianBlur + feColorMatrix) funde los blobs => líquido.
   - Al terminar, el overlay se desvanece y revela el dashboard real idéntico.
*/
(function () {
  const e = React.createElement;

  function cssVar(name, fb) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fb;
    } catch (_) { return fb; }
  }

  // Un "grupo" = un blob PRIMARIO con la forma del rect destino + satélites
  // (círculos que caen dentro para dar la fusión líquida). Todos nacen en
  // `origin` (un elemento del login) y viajan a `rect` (slot del dashboard).
  function group(origin, rect, color, sats, satMax, blobs) {
    const oc = { x: origin ? origin.x : rect.x + rect.w / 2, y: origin ? origin.y : rect.y + rect.h / 2 };
    const primSize = Math.min(Math.max(rect.w, rect.h) * 0.3, 120) + 30;
    blobs.push({
      sx: oc.x - primSize / 2, sy: oc.y - primSize / 2, ss: primSize, sr: '50%',
      tx: rect.x, ty: rect.y, tw: rect.w, th: rect.h, tr: rect.r,
      color: color, delay: rect._d || 0, dur: 1.05 + Math.random() * 0.25, primary: true,
    });
    for (let i = 0; i < sats; i++) {
      const size = 26 + Math.random() * (satMax - 26);
      const m = size / 2 + 6;
      const px = rect.x + m + Math.random() * Math.max(rect.w - 2 * m, 1);
      const py = rect.y + m + Math.random() * Math.max(rect.h - 2 * m, 1);
      const jitter = 40;
      blobs.push({
        sx: oc.x + (Math.random() * 2 - 1) * jitter - size / 2,
        sy: oc.y + (Math.random() * 2 - 1) * jitter - size / 2,
        ss: size, sr: '50%',
        tx: px - size / 2, ty: py - size / 2, tw: size, th: size, tr: '50%',
        color: color, delay: (rect._d || 0) + 0.06 + Math.random() * 0.16,
        dur: 1.05 + Math.random() * 0.3, primary: false,
      });
    }
  }

  function buildScene(origin, role) {
    const W = window.innerWidth, H = window.innerHeight;
    const mobile = W <= 768;
    const dark = role !== 'familia';

    let sidebarW = parseFloat(cssVar('--sidebar-w', '256')) || 256;
    let headerH = parseFloat(cssVar('--header-h', '64')) || 64;
    if (mobile) { sidebarW = 0; headerH = 58; }

    const sideCol = cssVar('--side-bg', dark ? '#12152a' : '#282d65');
    const barCol = cssVar('--bg-solid', dark ? '#272c52' : '#272c52');
    const cardCol = cssVar('--bg-surface', dark ? '#171a32' : '#ffffff');
    const LIME = '#bdcf00', GREEN = '#49af54', NAVY = '#282d65';

    const O = origin || {};
    const inp = O.inputs && O.inputs.length ? O.inputs : [O.card];
    const src = (i) => inp[i % inp.length] || O.card || O.logo || { x: W / 2, y: H / 2 };

    const blobs = [];
    const pad = mobile ? 14 : 24, gap = mobile ? 12 : 16;
    const x0 = sidebarW + pad, y0 = headerH + pad;
    const cW = W - sidebarW - pad * 2;

    if (dark) {
      // Sidebar (navy) nace del logo del login
      if (!mobile) group(O.logo, { x: 0, y: 0, w: sidebarW, h: H, r: '0px', _d: 0 }, sideCol, 4, 90, blobs);
      // Topbar nace del título del login; botón lime = "Nuevo cobro"
      group(O.title, { x: sidebarW, y: 0, w: W - sidebarW - (mobile ? 0 : 150), h: headerH, r: '0px', _d: 0.04 }, barCol, 2, 60, blobs);
      group(O.button, { x: W - (mobile ? 130 : 146), y: 12, w: mobile ? 116 : 128, h: 38, r: '10px', _d: 0.06 }, LIME, 1, 34, blobs);
      // Fila de stat-cards nace de inputs + tarjeta
      const nStats = mobile ? 2 : 4;
      const statH = mobile ? 84 : 104;
      const statW = (cW - gap * (nStats - 1)) / nStats;
      const accents = [NAVY, NAVY, GREEN, LIME];
      for (let i = 0; i < nStats; i++) {
        group(src(i), { x: x0 + i * (statW + gap), y: y0, w: statW, h: statH, r: '14px', _d: 0.12 + i * 0.05 }, cardCol, 1, 38, blobs);
        // pequeño satélite de acento que aterriza en el ícono de la card
        blobs.push({
          sx: src(i).x, sy: src(i).y, ss: 34, sr: '50%',
          tx: x0 + i * (statW + gap) + 18, ty: y0 + 18, tw: 40, th: 40, tr: '10px',
          color: accents[i % accents.length], delay: 0.16 + i * 0.05, dur: 1.15, primary: false,
        });
      }
      // Cards grandes de contenido
      const y1 = y0 + statH + gap;
      const bigH = Math.min(Math.max(H - y1 - pad, 150), mobile ? 220 : 320);
      if (mobile) {
        group(O.card, { x: x0, y: y1, w: cW, h: bigH, r: '14px', _d: 0.24 }, cardCol, 2, 60, blobs);
      } else {
        const aW = cW * 0.64, bW = cW - aW - gap;
        group(O.card, { x: x0, y: y1, w: aW, h: bigH, r: '14px', _d: 0.24 }, cardCol, 3, 70, blobs);
        group(O.card, { x: x0 + aW + gap, y: y1, w: bW, h: bigH, r: '14px', _d: 0.3 }, cardCol, 2, 60, blobs);
      }
    } else {
      // Portal familia (claro, sin sidebar): topbar + tarjeta bienvenida navy +
      // tabs + card de contenido, todo naciendo de los elementos del login.
      group(O.logo, { x: 0, y: 0, w: W, h: 60, r: '0px', _d: 0 }, NAVY, 2, 50, blobs);
      const cx = mobile ? pad : Math.max(pad, (W - 880) / 2);
      const cw = W - cx * 2;
      group(O.title, { x: cx, y: 84, w: cw, h: mobile ? 180 : 210, r: '16px', _d: 0.08 }, NAVY, 3, 70, blobs);
      // 3 stat blobs dentro de la tarjeta de bienvenida
      const sw = (cw - 24 * 2) / 3;
      const cols = [LIME, GREEN, LIME];
      for (let i = 0; i < 3; i++) {
        blobs.push({
          sx: src(i).x, sy: src(i).y, ss: 40, sr: '50%',
          tx: cx + 20 + i * (sw + 12), ty: mobile ? 190 : 210, tw: sw - 12, th: mobile ? 60 : 68, tr: '12px',
          color: cols[i], delay: 0.16 + i * 0.05, dur: 1.2, primary: false,
        });
      }
      group(O.button, { x: cx, y: (mobile ? 288 : 318), w: cw, h: 46, r: '10px', _d: 0.22 }, cardCol, 1, 40, blobs);
      group(O.card, { x: cx, y: (mobile ? 348 : 378), w: cw, h: Math.min(Math.max(H - (mobile ? 348 : 378) - pad, 150), 260), r: '14px', _d: 0.28 }, cardCol, 2, 60, blobs);
    }
    return blobs;
  }

  function LoginTransition(props) {
    const { origin, role, onCommit, onDone } = props;
    const { useState, useEffect, useMemo, useRef } = React;
    const [run, setRun] = useState(false);
    const [fade, setFade] = useState(false);
    const committed = useRef(false);

    let reduce = false;
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}

    const blobs = useMemo(() => buildScene(origin, role), [origin, role]);

    useEffect(() => {
      const timers = [];
      const commit = () => { if (!committed.current) { committed.current = true; onCommit && onCommit(); } };
      if (reduce) {
        timers.push(setTimeout(commit, 40));
        timers.push(setTimeout(() => setFade(true), 60));
        timers.push(setTimeout(() => onDone && onDone(), 360));
      } else {
        let r1, r2;
        r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setRun(true)); });
        timers.push({ cancel: () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); } });
        // Montar dashboard debajo cuando los rects ya cubren sus destinos
        timers.push(setTimeout(commit, 1150));
        // Desvanecer overlay para revelar el dashboard real idéntico
        timers.push(setTimeout(() => setFade(true), 1500));
        timers.push(setTimeout(() => onDone && onDone(), 2050));
      }
      return () => timers.forEach((t) => (t.cancel ? t.cancel() : clearTimeout(t)));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const gooFilter = e(
      'svg', { className: 'lt-svg', 'aria-hidden': 'true' },
      e('defs', null,
        e('filter', { id: 'lt-goo' },
          e('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '8', result: 'blur' }),
          e('feColorMatrix', {
            in: 'blur', mode: 'matrix',
            values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9', result: 'goo',
          }),
          e('feBlend', { in: 'SourceGraphic', in2: 'goo' })
        )
      )
    );

    const blobEls = blobs.map((b, i) =>
      e('div', {
        key: i,
        className: 'lt-blob',
        style: run
          ? {
              left: b.tx, top: b.ty, width: b.tw, height: b.th,
              borderRadius: b.tr, background: b.color,
              transition: 'left ' + b.dur + 's cubic-bezier(.5,-0.05,.25,1.15) ' + b.delay + 's, top ' + b.dur + 's cubic-bezier(.5,-0.05,.25,1.15) ' + b.delay + 's, width ' + b.dur + 's cubic-bezier(.5,-0.05,.25,1.15) ' + b.delay + 's, height ' + b.dur + 's cubic-bezier(.5,-0.05,.25,1.15) ' + b.delay + 's, border-radius ' + b.dur + 's ease ' + b.delay + 's',
            }
          : {
              left: b.sx, top: b.sy, width: b.ss, height: b.ss,
              borderRadius: b.sr, background: b.color,
            },
      })
    );

    return e(
      'div',
      { className: 'lt-root' + (run ? ' run' : '') + (fade ? ' fade' : '') },
      gooFilter,
      e('div', { className: 'lt-goo' }, blobEls)
    );
  }

  window.LoginTransition = LoginTransition;
})();
