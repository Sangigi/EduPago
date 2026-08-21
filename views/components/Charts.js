// views/components/Charts.js — Gráficas SVG basadas en el video de referencia. Sin dependencias externas: solo React + SVG. Los colores salen de los tokens del CSS, así que siguen el tema claro/oscuro automáticamente.

const hC = React.createElement;

/* Paleta de series, alineada con --violet / --cyan / --magenta */
const SERIE_COLORES = ['#6c5af0', '#4fd8f0', '#d860f0', '#49af54', '#d97706', '#e5484d'];

// Curva suave (Catmull-Rom convertida a Bézier). Evita los picos duros de una polilínea recta, como la línea del video.
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

const abreviar = n => {
  const v = Math.abs(n);
  if (v >= 1e6) return (n / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.0', '') + 'M';
  if (v >= 1e3) return (n / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace('.0', '') + 'k';
  return String(Math.round(n));
};

// ══════════════════════════════════════════════════════ GRÁFICA DE ÁREA — equivalente a "Total visits" del video props: datos   [{ label, valor }] alto    px (por defecto 220) color   color de la línea formato función para el tooltip (por defecto abrevia) ══════════════════════════════════════════════════════
function AreaChart({ datos, alto, color, formato, sufijo }) {
  const { useState, useId } = React;
  const [activo, setActivo] = useState(null);
  const uid = (useId ? useId() : 'ac').replace(/:/g, '');

  const H = alto || 220;
  const W = 560;                        // viewBox: el SVG escala al contenedor
  const padL = 46, padR = 12, padT = 16, padB = 26;
  const col = color || 'var(--violet)';
  const fmtVal = formato || abreviar;

  if (!datos || datos.length === 0) {
    return hC('div', {
      style: { height: H, display: 'flex', alignItems: 'center', justifyContent: 'center',
               color: 'var(--ink-4)', fontSize: 13 }
    }, 'Sin datos para el periodo');
  }

  const vals = datos.map(d => d.valor);
  const max = Math.max.apply(null, vals);
  const tope = max <= 0 ? 1 : max * 1.15;     // aire arriba para que no toque el borde
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const pts = datos.map((d, i) => ({
    x: padL + (datos.length === 1 ? iw / 2 : (i / (datos.length - 1)) * iw),
    y: padT + ih - (d.valor / tope) * ih,
    d
  }));

  const linea = curva(pts);
  const area = linea + ' L ' + pts[pts.length - 1].x + ' ' + (padT + ih) +
               ' L ' + pts[0].x + ' ' + (padT + ih) + ' Z';

  /* 4 líneas de referencia horizontales */
  const guias = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y: padT + ih - f * ih,
    v: tope * f
  }));

  const act = activo !== null ? pts[activo] : null;

  return hC('div', { style: { position: 'relative', width: '100%' } },
    hC('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      preserveAspectRatio: 'none',
      style: { width: '100%', height: H, display: 'block', overflow: 'visible' },
      onMouseLeave: () => setActivo(null)
    },
      hC('defs', null,
        hC('linearGradient', { id: 'fill' + uid, x1: '0', y1: '0', x2: '0', y2: '1' },
          hC('stop', { offset: '0%', stopColor: col, stopOpacity: 0.22 }),
          hC('stop', { offset: '100%', stopColor: col, stopOpacity: 0 })
        )
      ),

      /* Guías + etiquetas del eje Y */
      guias.map((g, i) => hC('g', { key: 'g' + i },
        hC('line', {
          x1: padL, y1: g.y, x2: W - padR, y2: g.y,
          stroke: 'var(--border-glow)', strokeWidth: 1
        }),
        hC('text', {
          x: padL - 8, y: g.y + 3.5, textAnchor: 'end',
          fill: 'var(--ink-4)', fontSize: 9.5, fontFamily: 'var(--font)'
        }, abreviar(g.v))
      )),

      /* Área + línea */
      hC('path', { d: area, fill: 'url(#fill' + uid + ')' }),
      hC('path', {
        d: linea, fill: 'none', stroke: col, strokeWidth: 2.4,
        strokeLinecap: 'round', strokeLinejoin: 'round'
      }),

      /* Etiquetas del eje X (se ralean si hay muchas) */
      pts.map((p, i) => {
        const paso = Math.ceil(datos.length / 7);
        if (i % paso !== 0 && i !== datos.length - 1) return null;
        return hC('text', {
          key: 'x' + i, x: p.x, y: H - 8, textAnchor: 'middle',
          fill: 'var(--ink-4)', fontSize: 9.5, fontFamily: 'var(--font)'
        }, p.d.label);
      }),

      /* Marcador vertical del punto activo */
      act && hC('g', null,
        hC('line', {
          x1: act.x, y1: padT, x2: act.x, y2: padT + ih,
          stroke: col, strokeWidth: 1, strokeOpacity: 0.45
        }),
        hC('circle', { cx: act.x, cy: act.y, r: 5, fill: col, stroke: 'var(--bg-surface)', strokeWidth: 2.5 })
      ),

      /* Zonas invisibles para detectar el hover */
      pts.map((p, i) => hC('rect', {
        key: 'h' + i,
        x: p.x - iw / (datos.length * 2 || 1) - 1,
        y: padT, width: iw / (datos.length || 1) + 2, height: ih,
        fill: 'transparent', style: { cursor: 'pointer' },
        onMouseEnter: () => setActivo(i)
      }))
    ),

    /* Tooltip oscuro, como el del video */
    act && hC('div', {
      style: {
        position: 'absolute',
        left: 'calc(' + (act.x / W) * 100 + '% )',
        top: (act.y / H) * 100 + '%',
        transform: 'translate(-50%, -132%)',
        background: '#20242f', color: '#fff', borderRadius: 10,
        padding: '7px 12px', fontSize: 12.5, fontWeight: 700,
        whiteSpace: 'nowrap', pointerEvents: 'none',
        boxShadow: '0 6px 20px rgba(0,0,0,.28)', lineHeight: 1.35, zIndex: 3
      }
    },
      hC('div', null, fmtVal(act.d.valor) + (sufijo || '')),
      hC('div', { style: { fontSize: 10.5, fontWeight: 500, opacity: 0.72 } }, act.d.label)
    )
  );
}

// ══════════════════════════════════════════════════════ DONA — equivalente a "Traffic Sources" del video props: datos   [{ label, valor }] tamano  px (por defecto 190) centro  { valor, etiqueta } opcional; si falta usa el segmento mayor ══════════════════════════════════════════════════════
function DonutChart({ datos, tamano, centro, formato }) {
  const { useState } = React;
  const [activo, setActivo] = useState(null);

  const S = tamano || 190;
  const grosor = Math.round(S * 0.15);
  const r = (S - grosor) / 2 - 2;
  const cx = S / 2, cy = S / 2;
  const circ = 2 * Math.PI * r;

  const total = (datos || []).reduce((a, d) => a + (d.valor || 0), 0);

  if (!datos || datos.length === 0 || total <= 0) {
    return hC('div', {
      style: { width: S, height: S, display: 'flex', alignItems: 'center',
               justifyContent: 'center', color: 'var(--ink-4)', fontSize: 12.5, textAlign: 'center' }
    }, 'Sin datos');
  }

  let acumulado = 0;
  const segs = datos.map((d, i) => {
    const frac = d.valor / total;
    const seg = {
      ...d, i, frac,
      pct: Math.round(frac * 100),
      color: d.color || SERIE_COLORES[i % SERIE_COLORES.length],
      dash: frac * circ,
      offset: -acumulado * circ
    };
    acumulado += frac;
    return seg;
  });

  const mayor = segs.reduce((a, b) => (b.valor > a.valor ? b : a), segs[0]);
  const foco = activo !== null ? segs[activo] : mayor;
  const fmtVal = formato || (v => v);

  return hC('div', { style: { position: 'relative', width: S, height: S, flexShrink: 0 } },
    hC('svg', { width: S, height: S, viewBox: '0 0 ' + S + ' ' + S, style: { display: 'block' } },
      hC('circle', {
        cx, cy, r, fill: 'none', stroke: 'var(--glass-light)', strokeWidth: grosor
      }),
      segs.map(s => hC('circle', {
        key: s.i, cx, cy, r, fill: 'none',
        stroke: s.color,
        strokeWidth: activo === s.i ? grosor + 4 : grosor,
        strokeDasharray: s.dash + ' ' + (circ - s.dash),
        strokeDashoffset: s.offset,
        strokeLinecap: 'butt',
        transform: 'rotate(-90 ' + cx + ' ' + cy + ')',
        style: { cursor: 'pointer', transition: 'stroke-width .15s' },
        onMouseEnter: () => setActivo(s.i),
        onMouseLeave: () => setActivo(null)
      }))
    ),
    hC('div', {
      style: {
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: 8
      }
    },
      (() => {
        const txt = centro && activo === null ? String(centro.valor) : foco.pct + '%';
        /* Ajusta el tamaño al largo del texto para que nunca se salga del anillo */
        const disponible = S * 0.62;
        const tam = Math.max(13, Math.min(Math.round(S * 0.17), Math.floor(disponible / (txt.length * 0.58))));
        return hC('div', {
          style: {
            fontSize: tam, fontWeight: 700, color: foco.color,
            letterSpacing: '-.5px', lineHeight: 1, whiteSpace: 'nowrap'
          }
        }, txt);
      })(),
      hC('div', {
        style: {
          fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3,
          textAlign: 'center', maxWidth: S * 0.62, lineHeight: 1.25
        }
      }, centro && activo === null ? centro.etiqueta : foco.label)
    )
  );
}

/* ── Leyenda numerada, como la tabla lateral de la dona en el video ── */
function DonutLeyenda({ datos, formato }) {
  const total = (datos || []).reduce((a, d) => a + (d.valor || 0), 0) || 1;
  const fmtVal = formato || (v => v);
  return hC('div', { style: { flex: '1 1 168px', minWidth: 168 } },
    hC('div', {
      style: {
        display: 'flex', justifyContent: 'space-between', padding: '7px 10px',
        background: 'var(--glass-light)', borderRadius: 'var(--radius-sm)',
        fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 4
      }
    }, hC('span', null, 'Origen'), hC('span', null, '%')),
    (datos || []).map((d, i) => hC('div', {
      key: d.label,
      style: {
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '7px 10px', fontSize: 12.5, color: 'var(--ink-2)'
      }
    },
      hC('span', {
        style: {
          width: 9, height: 9, borderRadius: 3, flexShrink: 0,
          background: d.color || SERIE_COLORES[i % SERIE_COLORES.length]
        }
      }),
      hC('span', { style: { color: 'var(--ink-4)', fontSize: 11, minWidth: 12 } }, String(i + 1)),
      hC('span', {
        style: { flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
      }, d.label),
      hC('span', {
        style: { fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }
      }, Math.round((d.valor / total) * 100) + '%')
    ))
  );
}
