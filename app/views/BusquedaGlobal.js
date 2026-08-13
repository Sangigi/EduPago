var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/BusquedaGlobal.jsx — Buscar alumnos/usuarios cruzando todas las escuelas (superadmin) */

function BusquedaGlobal({ onIrAEscuela }) {
  const { useState } = React;
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState(null); // null = sin buscar aún
  const [error, setError] = useState('');

  const buscar = async () => {
    if (q.trim().length < 3) {
      setError('Escribe al menos 3 caracteres para buscar.');
      return;
    }
    setError('');
    setBuscando(true);
    try {
      const token = AuthController.getToken();
      const params = new URLSearchParams({ action: 'buscar_global', q: q.trim() });
      const res = await fetch('api.php?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'No se pudo buscar.');
        setResultado(null);
      } else {
        setResultado(json);
      }
    } catch (e) {
      setError('Error de conexión.');
    } finally {
      setBuscando(false);
    }
  };

  const onKeyDown = e => { if (e.key === 'Enter') buscar(); };

  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "card",
      style: { marginBottom: 20, padding: 16 },
      children: [/*#__PURE__*/_jsxDEV("div", {
        style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 10 },
        children: "Busca un alumno o un usuario por nombre, correo, matrícula o CURP, sin importar en qué colegio esté."
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        style: { display: 'flex', gap: 8 },
        children: [/*#__PURE__*/_jsxDEV("input", {
          className: "form-input",
          style: { flex: 1 },
          placeholder: "Nombre, correo, matrícula, CURP…",
          value: q,
          onChange: e => setQ(e.target.value),
          onKeyDown,
          autoFocus: true,
        }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-primary",
          onClick: buscar,
          disabled: buscando,
          children: buscando ? 'Buscando…' : 'Buscar'
        }, void 0, false)]
      }, void 0, true), error && /*#__PURE__*/_jsxDEV("div", {
        style: { fontSize: 12.5, color: 'var(--red)', marginTop: 8 },
        children: error
      }, void 0, false)]
    }, void 0, true), resultado && /*#__PURE__*/_jsxDEV("div", {
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card",
        style: { marginBottom: 16 },
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "card-header",
          children: /*#__PURE__*/_jsxDEV("div", { className: "card-title", children: `Alumnos (${resultado.alumnos.length})` }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "table-wrap",
          children: /*#__PURE__*/_jsxDEV("table", {
            children: [/*#__PURE__*/_jsxDEV("thead", {
              children: /*#__PURE__*/_jsxDEV("tr", {
                children: [
                  /*#__PURE__*/_jsxDEV("th", { children: "Nombre" }, void 0, false),
                  /*#__PURE__*/_jsxDEV("th", { children: "Matrícula" }, void 0, false),
                  /*#__PURE__*/_jsxDEV("th", { children: "Correo" }, void 0, false),
                  /*#__PURE__*/_jsxDEV("th", { children: "Colegio" }, void 0, false),
                  /*#__PURE__*/_jsxDEV("th", { children: "" }, void 0, false),
                ]
              }, void 0, true)
            }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
              children: resultado.alumnos.length === 0 ? /*#__PURE__*/_jsxDEV("tr", {
                children: /*#__PURE__*/_jsxDEV("td", { colSpan: 5, className: "empty-text", children: "Sin coincidencias" }, void 0, false)
              }, void 0, false) : resultado.alumnos.map(a => /*#__PURE__*/_jsxDEV("tr", {
                children: [
                  /*#__PURE__*/_jsxDEV("td", { style: { fontWeight: 500, fontSize: 13 }, children: a.nombre }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontSize: 12 }, children: a.matricula || '—' }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { style: { fontSize: 12, color: 'var(--ink-3)' }, children: a.email || '—' }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { style: { fontSize: 12 }, children: a.escuela_nombre }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", {
                    children: /*#__PURE__*/_jsxDEV("button", {
                      className: "btn btn-ghost btn-sm",
                      onClick: () => onIrAEscuela(a.escuela_id),
                      children: "Ir al colegio →"
                    }, void 0, false)
                  }, void 0, false),
                ]
              }, a.id, true))
            }, void 0, false)]
          }, void 0, true)
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "card",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "card-header",
          children: /*#__PURE__*/_jsxDEV("div", { className: "card-title", children: `Usuarios (${resultado.usuarios.length})` }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "table-wrap",
          children: /*#__PURE__*/_jsxDEV("table", {
            children: [/*#__PURE__*/_jsxDEV("thead", {
              children: /*#__PURE__*/_jsxDEV("tr", {
                children: [
                  /*#__PURE__*/_jsxDEV("th", { children: "Nombre" }, void 0, false),
                  /*#__PURE__*/_jsxDEV("th", { children: "Correo" }, void 0, false),
                  /*#__PURE__*/_jsxDEV("th", { children: "Rol" }, void 0, false),
                  /*#__PURE__*/_jsxDEV("th", { children: "Colegio" }, void 0, false),
                  /*#__PURE__*/_jsxDEV("th", { children: "Estado" }, void 0, false),
                ]
              }, void 0, true)
            }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
              children: resultado.usuarios.length === 0 ? /*#__PURE__*/_jsxDEV("tr", {
                children: /*#__PURE__*/_jsxDEV("td", { colSpan: 5, className: "empty-text", children: "Sin coincidencias" }, void 0, false)
              }, void 0, false) : resultado.usuarios.map(u => /*#__PURE__*/_jsxDEV("tr", {
                children: [
                  /*#__PURE__*/_jsxDEV("td", { style: { fontWeight: 500, fontSize: 13 }, children: u.nombre }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { style: { fontSize: 12, color: 'var(--ink-3)' }, children: u.email }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { style: { fontSize: 12, textTransform: 'capitalize' }, children: u.rol }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { style: { fontSize: 12 }, children: u.escuela_nombre || '—' }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", {
                    children: /*#__PURE__*/_jsxDEV("span", {
                      className: `badge ${u.activo == 1 ? 'badge-green' : 'badge-gray'}`,
                      children: u.activo == 1 ? 'Activo' : 'Inactivo'
                    }, void 0, false)
                  }, void 0, false),
                ]
              }, u.id, true))
            }, void 0, false)]
          }, void 0, true)
        }, void 0, false)]
      }, void 0, true)]
    }, void 0, true)]
  }, void 0, true);
}