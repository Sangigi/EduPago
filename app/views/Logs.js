var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/Logs.jsx — Logs del sistema (superadmin) */

const ACCIONES_LOG_LABELS = {
  login_exitoso: 'Login exitoso',
  login_fallido: 'Login fallido',
  usuario_creado: 'Usuario creado',
  usuario_editado_sensible: 'Usuario editado (rol/contraseña/escuela)',
  usuario_activo_toggle: 'Usuario activado/desactivado',
  usuario_eliminado: 'Usuario eliminado',
  escuela_activa_toggle: 'Escuela activada/desactivada',
};

function Logs({ data }) {
  const { useState, useEffect } = React;
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [accion, setAccion] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const porPagina = 25;

  const cargar = async (p, acc) => {
    setCargando(true);
    setError('');
    try {
      const token = AuthController.getToken();
      const params = new URLSearchParams({ action: 'listar_logs', pagina: p, por_pagina: porPagina });
      if (acc) params.set('accion', acc);
      const res = await fetch('api.php?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'No se pudieron cargar los logs.');
        setLogs([]);
        setTotal(0);
      } else {
        setLogs(json.logs || []);
        setTotal(json.total || 0);
      }
    } catch (e) {
      setError('Error de conexión al cargar los logs.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar(pagina, accion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, accion]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return /*#__PURE__*/_jsxDEV("div", {
    children: /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", { className: "card-title", children: "Logs del sistema" }, void 0, false),
          /*#__PURE__*/_jsxDEV("div", { className: "card-sub", children: [total, " eventos registrados"] }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("select", {
          className: "form-select",
          style: { fontSize: 12.5, padding: '6px 10px' },
          value: accion,
          onChange: e => { setPagina(1); setAccion(e.target.value); },
          children: [/*#__PURE__*/_jsxDEV("option", { value: "", children: "Todas las acciones" }, void 0, false),
          ...Object.entries(ACCIONES_LOG_LABELS).map(([k, v]) => /*#__PURE__*/_jsxDEV("option", { value: k, children: v }, k, false))]
        }, void 0, true)]
      }, void 0, true), error && /*#__PURE__*/_jsxDEV("div", {
        style: { padding: '12px 16px', color: 'var(--red)', fontSize: 13 },
        children: error
      }, void 0, false), !error && /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [
                /*#__PURE__*/_jsxDEV("th", { children: "Fecha" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Acción" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Usuario" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Escuela" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Detalle" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "IP" }, void 0, false),
              ]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: cargando ? /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", { colSpan: 6, className: "empty-text", children: "Cargando…" }, void 0, false)
            }, void 0, false) : logs.length === 0 ? /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", { colSpan: 6, className: "empty-text", children: "Sin eventos registrados." }, void 0, false)
            }, void 0, false) : logs.map(l => {
              const esc = (data.escuelas || []).find(e => e.id === parseInt(l.escuela_id));
              const esSensible = l.accion === 'usuario_eliminado' || l.accion === 'login_fallido' || l.accion === 'usuario_editado_sensible';
              return /*#__PURE__*/_jsxDEV("tr", {
                children: [
                  /*#__PURE__*/_jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontSize: 11.5, whiteSpace: 'nowrap' }, children: l.fecha }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", {
                    children: /*#__PURE__*/_jsxDEV("span", {
                      style: { fontSize: 12, fontWeight: 600, color: esSensible ? 'var(--red)' : 'var(--ink-2)' },
                      children: ACCIONES_LOG_LABELS[l.accion] || l.accion
                    }, void 0, false)
                  }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { style: { fontSize: 12.5 }, children: l.usuario_nombre || '—' }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { style: { fontSize: 12, color: 'var(--ink-3)' }, children: esc ? esc.nombre : (l.escuela_id || '—') }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { style: { fontSize: 12, color: 'var(--ink-3)', maxWidth: 320 }, children: l.detalle || '—' }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }, children: l.ip || '—' }, void 0, false),
                ]
              }, l.id, true);
            })
          }, void 0, false)]
        }, void 0, true)
      }, void 0, false), !error && totalPaginas > 1 && /*#__PURE__*/_jsxDEV("div", {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', fontSize: 13, color: 'var(--ink-3)' },
        children: [
          /*#__PURE__*/_jsxDEV("span", { children: `Página ${pagina} de ${totalPaginas}` }, void 0, false),
          /*#__PURE__*/_jsxDEV("button", { className: "btn btn-ghost btn-sm", disabled: pagina <= 1, onClick: () => setPagina(p => p - 1), children: "‹ Anterior" }, void 0, false),
          /*#__PURE__*/_jsxDEV("button", { className: "btn btn-ghost btn-sm", disabled: pagina >= totalPaginas, onClick: () => setPagina(p => p + 1), children: "Siguiente ›" }, void 0, false),
        ]
      }, void 0, true)]
    }, void 0, true)
  }, void 0, false);
}