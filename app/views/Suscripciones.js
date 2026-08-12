var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/Suscripciones.jsx — Panel de planes/suscripciones para superadmin */

// Debe reflejar PLANES_LIMITES en api.php — única fuente de verdad real es el
// backend (ahí se valida de verdad); esto es solo para mostrarlo en pantalla.
const PLANES_INFO = {
  free:     { label: 'Free (trial)', precio: 0,    max_alumnos: 30,  max_planteles: 1,    color: 'var(--ink-4)' },
  basico:   { label: 'Básico',   precio: 999,  max_alumnos: 400, max_planteles: 1,    color: 'var(--ink-3)' },
  avanzado: { label: 'Avanzado', precio: 1500, max_alumnos: 800, max_planteles: 1,    color: 'var(--accent, #bdcf00)' },
  pro:      { label: 'Pro',      precio: 3000, max_alumnos: null, max_planteles: null, color: 'var(--lime)' },
};
// Fallback seguro: un plan no reconocido en escuelas.plan (typo, dato viejo)
// se trata como el MÁS restrictivo, nunca como "sin límite" (antes cualquier
// valor no mapeado caía en PLANES_INFO.pro por accidente).
const PLAN_INFO_FALLBACK = 'basico';

function Suscripciones({ data }) {
  const fmt = n => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const principales = (data.escuelas || []).filter(e => !e.es_plantel);
  const resumen = data.resumen_escuelas || {};

  const filas = principales.map(esc => {
    const planKey = (esc.plan || '').toLowerCase();
    const info = PLANES_INFO[planKey] || PLANES_INFO[PLAN_INFO_FALLBACK];
    const planReconocido = !!PLANES_INFO[planKey];
    const numPlanteles = (data.escuelas || []).filter(e => e.es_plantel && e.escuela_padre_id === esc.id).length;
    const idsGrupo = [esc.id, ...(data.escuelas || []).filter(e => e.es_plantel && e.escuela_padre_id === esc.id).map(e => e.id)];
    const totalAlumnos = idsGrupo.reduce((a, id) => a + (resumen[id]?.total_alumnos || 0), 0);
    const pctAlumnos = info.max_alumnos ? Math.min(100, Math.round(totalAlumnos / info.max_alumnos * 100)) : null;
    const excedido = info.max_alumnos !== null && totalAlumnos > info.max_alumnos;
    const excedidoPlanteles = info.max_planteles !== null && numPlanteles > info.max_planteles;
    return { esc, info, planKey, planReconocido, numPlanteles, totalAlumnos, pctAlumnos, excedido, excedidoPlanteles };
  });

  const ingresoMensualEstimado = filas.reduce((a, f) => a + f.info.precio, 0);

  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "stats-grid",
      style: { marginBottom: 20 },
      children: [{
        label: 'Ingreso mensual estimado',
        val: fmt(ingresoMensualEstimado) + ' + IVA',
        meta: `${filas.length} colegios`
      }, {
        label: 'Plan Básico',
        val: filas.filter(f => f.planKey === 'basico').length,
        meta: '$999 + IVA c/u'
      }, {
        label: 'Plan Avanzado',
        val: filas.filter(f => f.planKey === 'avanzado').length,
        meta: '$1,500 + IVA c/u'
      }, {
        label: 'Plan Pro',
        val: filas.filter(f => f.planKey === 'pro').length,
        meta: '$3,000 + IVA c/u'
      }].map((s, i) => /*#__PURE__*/_jsxDEV("div", {
        className: "stat-card",
        children: [/*#__PURE__*/_jsxDEV("div", { className: "stat-label", children: s.label }, void 0, false),
        /*#__PURE__*/_jsxDEV("div", { className: "stat-val", children: s.val }, void 0, false),
        /*#__PURE__*/_jsxDEV("div", { className: "stat-meta", children: s.meta }, void 0, false)]
      }, i, true))
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: /*#__PURE__*/_jsxDEV("div", { className: "card-title", children: "Colegios por plan" }, void 0, false)
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [
                /*#__PURE__*/_jsxDEV("th", { children: "Colegio" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Plan" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Precio" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Planteles" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Alumnos vs límite" }, void 0, false),
              ]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: filas.length === 0 ? /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", { colSpan: 5, className: "empty-text", children: "Sin colegios registrados." }, void 0, false)
            }, void 0, false) : filas.map(({ esc, info, planKey, planReconocido, numPlanteles, totalAlumnos, pctAlumnos, excedido, excedidoPlanteles }) => /*#__PURE__*/_jsxDEV("tr", {
              children: [
                /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("div", {
                    style: { display: 'flex', alignItems: 'center', gap: 8 },
                    children: [/*#__PURE__*/_jsxDEV("span", { style: { fontSize: 16 }, children: esc.logo_emoji }, void 0, false),
                    /*#__PURE__*/_jsxDEV("span", { style: { fontWeight: 500, fontSize: 13 }, children: esc.nombre }, void 0, false)]
                  }, void 0, true)
                }, void 0, false),
                /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("span", {
                    style: { fontSize: 12, fontWeight: 600, color: info.color },
                    title: planReconocido ? undefined : `Valor de plan no reconocido: "${esc.plan}" — se aplicaron límites de ${info.label} por seguridad`,
                    children: [info.label, !planReconocido && ' ⚠']
                  }, void 0, true)
                }, void 0, false),
                /*#__PURE__*/_jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontSize: 12.5 }, children: fmt(info.precio) + ' + IVA' }, void 0, false),
                /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("span", {
                    style: { fontSize: 12.5, color: excedidoPlanteles ? 'var(--red)' : 'var(--ink-3)' },
                    children: [numPlanteles, " / ", info.max_planteles === null ? '∞' : info.max_planteles, excedidoPlanteles && ' ⚠']
                  }, void 0, true)
                }, void 0, false),
                /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("div", {
                    children: [/*#__PURE__*/_jsxDEV("span", {
                      style: { fontSize: 12.5, color: excedido ? 'var(--red)' : 'var(--ink-2)', fontWeight: excedido ? 600 : 400 },
                      children: [totalAlumnos, " / ", info.max_alumnos === null ? '∞' : info.max_alumnos, excedido && ' — supera el límite']
                    }, void 0, true), pctAlumnos !== null && /*#__PURE__*/_jsxDEV("div", {
                      style: { width: 120, height: 5, background: 'var(--glass-light)', borderRadius: 3, marginTop: 4, overflow: 'hidden' },
                      children: /*#__PURE__*/_jsxDEV("div", {
                        style: { width: `${pctAlumnos}%`, height: '100%', background: excedido ? 'var(--red)' : 'var(--lime)' }
                      }, void 0, false)
                    }, void 0, false)]
                  }, void 0, true)
                }, void 0, false),
              ]
            }, esc.id, true))
          }, void 0, false)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true)]
  }, void 0, true);
}