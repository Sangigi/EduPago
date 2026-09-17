// views/components/Charts.js — Gráficas SVG basadas en el video de referencia.
// Sin dependencias externas: solo React + SVG.
// Los colores salen de los tokens del CSS, así que siguen el tema claro/oscuro.

// `var` a proposito: con `const`, cargar este archivo dos veces lanza
// "Identifier already declared" y ese error tumba toda la aplicacion.
var hC = React.createElement;

var SERIE_COLORES = ['#6c5af0', '#4fd8f0', '#d860f0', '#49af54', '#d97706', '#e5484d'];

// Pareja de color para el degradado de cada serie (inicio -> fin)
var SERIE_GRAD = {
  '#6c5af0': ['#8b7cf6', '#5b46e0'],
  '#4fd8f0': ['#7ce6f7', '#28bcd8'],
  '#d860f0': ['#e88ff7', '#c23fd8'],
  '#49af54': ['#6fd07a', '#2f9440'],
  '#d97706': ['#f0a63a', '#b45f04'],
  '#e5484d': ['#f2777a', '#c62f34']
};

// ── Mide el ancho real del contenedor para dibujar 1:1 y evitar deformación ──
function useAncho(ref, inicial) {
  const { useState, useEffect } = React;
  const [w, setW] = useState(inicial || 560);
  useEffect(function () {
    const el = ref.current;
    if (!el) return;
    const medir = function () {
      const a = el.clientWidth;
      if (a && a > 0) setW(a);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir);
      return function () { window.removeEventListener('resize', medir); };
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return function () { ro.disconnect(); };
  }, []);
  return w;
}

// Curva suave (Catmull-Rom a Bézier)
function curva(pts, tension) {
  if (pts.length < 2) return '';
  const t = tension === undefined ? 0.5 : tension;
  let d = 'M ' + pts[0].x + ' ' + pts[0].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * t;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * t;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * t;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * t;
    d += ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', ' + p2.x + ' ' + p2.y;
  }
  return d;
}

var abreviar = function (n) {
  const v = Math.abs(n);
  if (v >= 1e6) return (n / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.0', '') + 'M';
  if (v >= 1e3) return (n / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace('.0', '') + 'k';
  return String(Math.round(n));
};

// ══════════════════════════════════════════════════════
// GRÁFICA DE ÁREA — "Total visits" del video
// Se dibuja al tamaño real del contenedor (sin escalar el viewBox),
// que es justo lo que antes deformaba el trazo y el texto.
// ══════════════════════════════════════════════════════
function AreaChart({ datos, alto, color, formato, sufijo }) {
  const { useState, useRef, useId } = React;
  const cont = useRef(null);
  const W = useAncho(cont, 560);
  const [activo, setActivo] = useState(null);
  const uid = (useId ? useId() : 'ac').replace(/:/g, '');

  const H = alto || 220;
  const padL = 48, padR = 14, padT = 18, padB = 28;
  const col = color || 'var(--violet)';
  const fmtVal = formato || abreviar;

  if (!datos || datos.length === 0) {
    return hC('div', { ref: cont, style: { width: '100%' } },
      hC('div', {
        style: { height: H, display: 'flex', alignItems: 'center',
                 justifyContent: 'center', color: 'var(--ink-4)', fontSize: 13 }
      }, 'Sin datos para el periodo')
    );
  }

  const vals = datos.map(function (d) { return d.valor; });
  const max = Math.max.apply(null, vals);
  const tope = max <= 0 ? 1 : max * 1.15;
  const iw = Math.max(60, W - padL - padR);
  const ih = H - padT - padB;

  const pts = datos.map(function (d, i) {
    return {
      x: padL + (datos.length === 1 ? iw / 2 : (i / (datos.length - 1)) * iw),
      y: padT + ih - (d.valor / tope) * ih,
      d: d
    };
  });

  const linea = curva(pts);
  const area = linea + ' L ' + pts[pts.length - 1].x + ' ' + (padT + ih) +
               ' L ' + pts[0].x + ' ' + (padT + ih) + ' Z';

  const guias = [0, 0.25, 0.5, 0.75, 1].map(function (f) {
    return { y: padT + ih - f * ih, v: tope * f };
  });

  const act = activo !== null ? pts[activo] : null;
  const anchoBanda = iw / Math.max(1, datos.length);
  // Cada cuántos puntos se dibuja una etiqueta, según el ancho disponible
  const paso = Math.max(1, Math.ceil(datos.length / Math.max(3, Math.floor(iw / 62))));

  return hC('div', { ref: cont, style: { position: 'relative', width: '100%' } },
    hC('svg', {
      width: W, height: H, viewBox: '0 0 ' + W + ' ' + H,
      style: { display: 'block', overflow: 'visible' },
      onMouseLeave: function () { setActivo(null); }
    },
      hC('defs', null,
        hC('linearGradient', { id: 'fill' + uid, x1: '0', y1: '0', x2: '0', y2: '1' },
          hC('stop', { offset: '0%', stopColor: col, stopOpacity: 0.26 }),
          hC('stop', { offset: '70%', stopColor: col, stopOpacity: 0.04 }),
          hC('stop', { offset: '100%', stopColor: col, stopOpacity: 0 })
        )
      ),

      guias.map(function (g, i) {
        return hC('g', { key: 'g' + i },
          hC('line', { x1: padL, y1: g.y, x2: W - padR, y2: g.y,
                       stroke: 'var(--border-glow)', strokeWidth: 1 }),
          hC('text', { x: padL - 9, y: g.y + 3.5, textAnchor: 'end',
                       fill: 'var(--ink-4)', fontSize: 10, fontFamily: 'var(--font)' },
             abreviar(g.v))
        );
      }),

      hC('path', { d: area, fill: 'url(#fill' + uid + ')' }),
      hC('path', { d: linea, fill: 'none', stroke: col, strokeWidth: 2.5,
                   strokeLinecap: 'round', strokeLinejoin: 'round' }),

      pts.map(function (p, i) {
        if (i % paso !== 0 && i !== datos.length - 1) return null;
        return hC('text', {
          key: 'x' + i, x: p.x, y: H - 9, textAnchor: 'middle',
          fill: 'var(--ink-4)', fontSize: 10, fontFamily: 'var(--font)'
        }, p.d.label);
      }),

      act && hC('g', null,
        hC('line', { x1: act.x, y1: padT, x2: act.x, y2: padT + ih,
                     stroke: col, strokeWidth: 1.5, strokeOpacity: 0.4,
                     strokeDasharray: '3 3' }),
        hC('circle', { cx: act.x, cy: act.y, r: 6, fill: col,
                       stroke: 'var(--bg-surface)', strokeWidth: 3 })
      ),

      pts.map(function (p, i) {
        return hC('rect', {
          key: 'h' + i, x: p.x - anchoBanda / 2, y: padT,
          width: anchoBanda, height: ih, fill: 'transparent',
          style: { cursor: 'pointer' },
          onMouseEnter: function () { setActivo(i); }
        });
      })
    ),

    act && hC('div', {
      style: {
        position: 'absolute', left: act.x, top: act.y,
        transform: 'translate(-50%, -134%)',
        background: '#20242f', color: '#fff', borderRadius: 10,
        padding: '7px 12px', fontSize: 12.5, fontWeight: 700,
        whiteSpace: 'nowrap', pointerEvents: 'none',
        boxShadow: '0 6px 20px rgba(0,0,0,.30)', lineHeight: 1.35, zIndex: 3
      }
    },
      hC('div', null, fmtVal(act.d.valor) + (sufijo || '')),
      hC('div', { style: { fontSize: 10.5, fontWeight: 500, opacity: 0.72 } }, act.d.label)
    )
  );
}

// ══════════════════════════════════════════════════════
// DONA — degradado por segmento, separación y puntas redondeadas
// ══════════════════════════════════════════════════════
function DonutChart({ datos, tamano, centro, grosorPct }) {
  const { useState, useId } = React;
  const [activo, setActivo] = useState(null);
  const uid = (useId ? useId() : 'dn').replace(/:/g, '');

  const S = tamano || 190;
  const grosor = Math.round(S * (grosorPct || 0.16));
  const r = (S - grosor) / 2 - 3;
  const cx = S / 2, cy = S / 2;
  const circ = 2 * Math.PI * r;

  const total = (datos || []).reduce(function (a, d) { return a + (d.valor || 0); }, 0);

  if (!datos || datos.length === 0 || total <= 0) {
    return hC('div', {
      style: { width: S, height: S, display: 'flex', alignItems: 'center',
               justifyContent: 'center', color: 'var(--ink-4)', fontSize: 12.5,
               textAlign: 'center' }
    }, 'Sin datos');
  }

  // Separación visible entre segmentos, como en el video
  const hueco = datos.length > 1 ? Math.min(circ * 0.012, 6) : 0;

  let acumulado = 0;
  const segs = datos.map(function (d, i) {
    const frac = d.valor / total;
    const base = d.color || SERIE_COLORES[i % SERIE_COLORES.length];
    const par = SERIE_GRAD[base] || [base, base];
    const largo = Math.max(0.5, frac * circ - hueco);
    const seg = {
      label: d.label, valor: d.valor, i: i, frac: frac,
      pct: Math.round(frac * 100),
      color: base, gradA: par[0], gradB: par[1],
      dash: largo,
      offset: -acumulado * circ
    };
    acumulado += frac;
    return seg;
  });

  const mayor = segs.reduce(function (a, b) { return b.valor > a.valor ? b : a; }, segs[0]);
  const foco = activo !== null ? segs[activo] : mayor;

  const txt = centro && activo === null ? String(centro.valor) : foco.pct + '%';
  // Ancho útil dentro del anillo, con margen. El factor 0.62 aproxima el ancho
  // de un dígito en DM Sans bold; con 0.58 el texto rozaba el anillo.
  const disponible = (S - grosor * 2) * 0.82;
  const tamTxt = Math.max(12, Math.min(Math.round(S * 0.17),
                          Math.floor(disponible / (txt.length * 0.62))));

  return hC('div', { style: { position: 'relative', width: S, height: S, flexShrink: 0 } },
    hC('svg', { width: S, height: S, viewBox: '0 0 ' + S + ' ' + S,
                style: { display: 'block', overflow: 'visible' } },
      hC('defs', null,
        segs.map(function (s) {
          return hC('linearGradient', {
            key: 'g' + s.i, id: 'dg' + uid + s.i,
            x1: '0%', y1: '0%', x2: '100%', y2: '100%'
          },
            hC('stop', { offset: '0%', stopColor: s.gradA }),
            hC('stop', { offset: '100%', stopColor: s.gradB })
          );
        }),
        hC('filter', { id: 'sh' + uid, x: '-25%', y: '-25%', width: '150%', height: '150%' },
          hC('feDropShadow', { dx: 0, dy: 3, stdDeviation: 4,
                               floodColor: '#000', floodOpacity: 0.16 })
        )
      ),

      hC('circle', { cx: cx, cy: cy, r: r, fill: 'none',
                     stroke: 'var(--glass-light)', strokeWidth: grosor }),

      hC('g', { filter: 'url(#sh' + uid + ')' },
        segs.map(function (s) {
          const activoSeg = activo === s.i;
          return hC('circle', {
            key: s.i, cx: cx, cy: cy, r: r, fill: 'none',
            stroke: 'url(#dg' + uid + s.i + ')',
            strokeWidth: activoSeg ? grosor + 5 : grosor,
            strokeDasharray: s.dash + ' ' + (circ - s.dash),
            strokeDashoffset: s.offset,
            strokeLinecap: 'round',
            transform: 'rotate(-90 ' + cx + ' ' + cy + ')',
            style: {
              cursor: 'pointer',
              transition: 'stroke-width .18s ease, opacity .18s ease',
              opacity: activo === null || activoSeg ? 1 : 0.42
            },
            onMouseEnter: function () { setActivo(s.i); },
            onMouseLeave: function () { setActivo(null); }
          });
        })
      )
    ),

    hC('div', {
      style: {
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: 8
      }
    },
      hC('div', {
        style: { fontSize: tamTxt, fontWeight: 700, color: foco.color,
                 letterSpacing: '-.5px', lineHeight: 1, whiteSpace: 'nowrap' }
      }, txt),
      hC('div', {
        style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4,
                 textAlign: 'center', maxWidth: S * 0.6, lineHeight: 1.25 }
      }, centro && activo === null ? centro.etiqueta : foco.label)
    )
  );
}

// ── Leyenda numerada ──
function DonutLeyenda({ datos, formato, encabezado }) {
  const total = (datos || []).reduce(function (a, d) { return a + (d.valor || 0); }, 0) || 1;
  return hC('div', { style: { flex: '1 1 178px', minWidth: 178 } },
    hC('div', {
      style: { display: 'flex', justifyContent: 'space-between', padding: '7px 11px',
               background: 'var(--glass-light)', borderRadius: 'var(--radius-sm)',
               fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 4 }
    },
      hC('span', null, (encabezado && encabezado[0]) || 'Origen'),
      hC('span', null, (encabezado && encabezado[1]) || '%')
    ),
    (datos || []).map(function (d, i) {
      const color = d.color || SERIE_COLORES[i % SERIE_COLORES.length];
      const par = SERIE_GRAD[color] || [color, color];
      return hC('div', {
        key: d.label,
        style: { display: 'flex', alignItems: 'center', gap: 9,
                 padding: '7px 11px', fontSize: 12.5, color: 'var(--ink-2)' }
      },
        hC('span', {
          style: { width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                   background: 'linear-gradient(135deg,' + par[0] + ',' + par[1] + ')' }
        }),
        hC('span', { style: { color: 'var(--ink-4)', fontSize: 11, minWidth: 12 } }, String(i + 1)),
        hC('span', {
          style: { flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
        }, d.label),
        hC('span', {
          style: { fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }
        }, Math.round((d.valor / total) * 100) + '%')
      );
    })
  );
}

// ══════════════════════════════════════════════════════
// SPARKLINE — mini tendencia para meter dentro de una tarjeta
// ══════════════════════════════════════════════════════
function Sparkline({ datos, alto, color, ancho }) {
  const { useRef, useId } = React;
  const cont = useRef(null);
  const W = useAncho(cont, ancho || 120);
  const H = alto || 38;
  const uid = (useId ? useId() : 'sp').replace(/:/g, '');
  const col = color || 'currentColor';

  if (!datos || datos.length < 2) {
    return hC('div', { ref: cont, style: { height: H } });
  }
  const max = Math.max.apply(null, datos);
  const min = Math.min.apply(null, datos);
  const rango = max - min || 1;
  const pts = datos.map(function (v, i) {
    return { x: (i / (datos.length - 1)) * (W - 2) + 1,
             y: H - 3 - ((v - min) / rango) * (H - 8) };
  });
  const d = curva(pts);
  return hC('div', { ref: cont, style: { width: '100%' } },
    hC('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, style: { display: 'block' } },
      hC('defs', null,
        hC('linearGradient', { id: 'sg' + uid, x1: '0', y1: '0', x2: '0', y2: '1' },
          hC('stop', { offset: '0%', stopColor: col, stopOpacity: 0.28 }),
          hC('stop', { offset: '100%', stopColor: col, stopOpacity: 0 })
        )
      ),
      hC('path', {
        d: d + ' L ' + pts[pts.length - 1].x + ' ' + H + ' L ' + pts[0].x + ' ' + H + ' Z',
        fill: 'url(#sg' + uid + ')'
      }),
      hC('path', { d: d, fill: 'none', stroke: col, strokeWidth: 2,
                   strokeLinecap: 'round', strokeLinejoin: 'round' })
    )
  );
}

// ══════════════════════════════════════════════════════
// BARRAS DE RANKING — para listas ordenadas (top alumnos, top escuelas…)
// ══════════════════════════════════════════════════════
function BarrasRanking({ datos, formato, maxItems }) {
  const fmtVal = formato || abreviar;
  const lista = (datos || []).slice(0, maxItems || 6);
  if (lista.length === 0) {
    return hC('div', {
      style: { padding: 18, textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5 }
    }, 'Sin datos');
  }
  const max = Math.max.apply(null, lista.map(function (d) { return d.valor; })) || 1;
  return hC('div', null,
    lista.map(function (d, i) {
      const color = d.color || SERIE_COLORES[i % SERIE_COLORES.length];
      const par = SERIE_GRAD[color] || [color, color];
      return hC('div', { key: d.label + i, style: { marginBottom: 13 } },
        hC('div', {
          style: { display: 'flex', justifyContent: 'space-between',
                   alignItems: 'baseline', marginBottom: 5, gap: 10 }
        },
          hC('span', {
            style: { fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'nowrap',
                     overflow: 'hidden', textOverflow: 'ellipsis' }
          }, d.label),
          hC('span', {
            style: { fontSize: 12.5, fontWeight: 700, color: 'var(--ink)',
                     fontVariantNumeric: 'tabular-nums', flexShrink: 0 }
          }, fmtVal(d.valor))
        ),
        hC('div', {
          style: { height: 8, background: 'var(--glass-light)',
                   borderRadius: 999, overflow: 'hidden' }
        },
          hC('div', {
            style: {
              width: Math.max(3, (d.valor / max) * 100) + '%', height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg,' + par[0] + ',' + par[1] + ')',
              transition: 'width .6s ease'
            }
          })
        )
      );
    })
  );
}
