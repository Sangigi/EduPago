var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
/* views/Comisiones.jsx — Superadmin: referidos/comisiones de distribuidores + catálogo de zonas.
   El cálculo de comisión (cobrado * comision_pct/100) ya existía en el panel
   del distribuidor; lo que faltaba por completo era una pantalla para que el
   super admin pudiera cambiar el % después de creado, activar un referido y
   vincularlo a la escuela real, y administrar el catálogo de zonas
   compartido con Usuarios (distribuidores) y Escuelas (planteles). */
function Comisiones({ data, user }) {
  const { useState, useEffect } = React;
  const tkn = () => AuthController.getToken();
  const apiPost = async (action, body) => {
    const r = await fetch('api.php?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tkn() },
      body: JSON.stringify(body || {}),
    });
    return r.json();
  };

  const [tab, setTab] = useState('referidos');
  const [referidos, setReferidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errForm, setErrForm] = useState('');

  const [zonas, setZonas] = useState([]);
  const [nuevaZona, setNuevaZona] = useState('');
  const [errZona, setErrZona] = useState('');
  const [guardandoZona, setGuardandoZona] = useState(false);

  const ESTADOS = [
    { value: 'prospecto', label: 'Prospecto' },
    { value: 'demo_agendada', label: 'Demo agendada' },
    { value: 'implementacion', label: 'Implementación' },
    { value: 'activo', label: 'Activo' },
  ];
  const ESTADO_BADGE = {
    prospecto: 'badge-purple', demo_agendada: 'badge-blue',
    implementacion: 'badge-amber', activo: 'badge-green',
  };

  const cargarReferidos = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await apiPost('superadmin_listar_referidos');
      if (!res.success) { setErr(res.error || 'No se pudo cargar'); setLoading(false); return; }
      setReferidos(res.referidos || []);
    } catch (e) {
      setErr('Error de conexión: ' + e.message);
    }
    setLoading(false);
  };
  const cargarZonas = async () => {
    try {
      const res = await apiPost('listar_zonas');
      if (res.success) setZonas(res.zonas || []);
    } catch (e) {}
  };
  useEffect(() => { cargarReferidos(); cargarZonas(); }, []);

  const lista = referidos.filter(r => {
    if (!q) return true;
    const texto = [r.distribuidor_nombre, r.nombre_colegio, r.escuela_nombre].filter(Boolean).join(' ').toLowerCase();
    return texto.includes(q.toLowerCase());
  });

  // Exportar agrupado por distribuidor, con subtotal por grupo y un total
  // general al final — mismo estilo que un reporte de comisiones por
  // departamento/vendedor, adaptado a lo que el sistema sí guarda
  // (distribuidor → colegios referidos, sin bancos/IVA/varias personas por venta).
  const exportarExcel = () => {
    const grupos = new Map();
    lista.forEach(r => {
      const clave = r.distribuidor_id || 0;
      if (!grupos.has(clave)) grupos.set(clave, { nombre: r.distribuidor_nombre || 'Sin distribuidor asignado', filas: [] });
      grupos.get(clave).filas.push(r);
    });

    const filasExcel = [
      { estilo: 'titulo', celdas: [`Comisiones de distribuidores — ${new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`], colspanPrimera: 8 },
      { celdas: [] },
    ];

    let totalCobrado = 0, totalComisionMes = 0, totalComisionAnio = 0;

    [...grupos.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .forEach((g, i) => {
        // Cada distribuidor rota por la paleta (navy/verde/magenta/ámbar) —
        // su franja de nombre y el total de SU grupo comparten ese color,
        // igual que "Contabilidad" es azul en la plantilla de referencia.
        filasExcel.push({ estilo: 'grupo', color: i, celdas: [g.nombre.toUpperCase()], colspanPrimera: 8 });
        filasExcel.push({ estilo: 'header', celdas: ['Colegio', 'Alumnos', 'Estado', '% Comisión', 'Cobrado del mes', 'Comisión del mes', 'Comisión acumulada', 'Alta'] });
        let subCobrado = 0, subComisionMes = 0, subComisionAnio = 0;
        g.filas.forEach(r => {
          filasExcel.push({ estilo: 'dato', celdas: [
            r.escuela_nombre || r.nombre_colegio, r.num_alumnos ?? '',
            (ESTADOS.find(e => e.value === r.estado) || {}).label || r.estado,
            `${r.comision_pct}%`, CSVExport.money(r.cobrado_mes), CSVExport.money(r.comision_mes), CSVExport.money(r.comision_anio),
            r.fecha_alta,
          ] });
          subCobrado += Number(r.cobrado_mes) || 0;
          subComisionMes += Number(r.comision_mes) || 0;
          subComisionAnio += Number(r.comision_anio) || 0;
        });
        filasExcel.push({ estilo: 'total', color: i, celdas: ['TOTAL DE COMISIONES', '', '', '', CSVExport.money(subCobrado), CSVExport.money(subComisionMes), CSVExport.money(subComisionAnio), ''] });
        filasExcel.push({ celdas: [] });
        totalCobrado += subCobrado; totalComisionMes += subComisionMes; totalComisionAnio += subComisionAnio;
      });

    filasExcel.push({ estilo: 'granTotal', celdas: ['TOTAL DE COMISIONES', '', '', '', CSVExport.money(totalCobrado), CSVExport.money(totalComisionMes), CSVExport.money(totalComisionAnio), ''] });
    ExcelExport.descargar(`comisiones-distribuidores-${new Date().toISOString().slice(0, 10)}`, filasExcel);
  };

  const abrirEditar = r => {
    setForm({
      id: r.id,
      estado: r.estado,
      comision_pct: r.comision_pct,
      escuela_id: r.escuela_id || '',
      num_alumnos: r.num_alumnos ?? '',
      notas: r.notas || '',
    });
    setErrForm('');
    setModal('editar');
  };

  const guardar = async () => {
    setGuardando(true);
    setErrForm('');
    try {
      const res = await apiPost('superadmin_editar_referido', {
        id: form.id,
        estado: form.estado,
        comision_pct: parseFloat(form.comision_pct) || 0,
        escuela_id: form.escuela_id ? parseInt(form.escuela_id) : null,
        num_alumnos: form.num_alumnos !== '' ? parseInt(form.num_alumnos) : null,
        notas: form.notas,
      });
      if (!res.success) { setErrForm(res.error || 'No se pudo guardar'); setGuardando(false); return; }
      setReferidos(prev => prev.map(r => r.id === res.referido.id ? { ...r, ...res.referido } : r));
      setModal(null);
    } catch (e) {
      setErrForm('Error de conexión: ' + e.message);
    }
    setGuardando(false);
  };

  const crearZona = async () => {
    if (!nuevaZona.trim()) return;
    setGuardandoZona(true);
    setErrZona('');
    try {
      const res = await apiPost('crear_zona', { nombre: nuevaZona.trim() });
      if (!res.success) { setErrZona(res.error || 'No se pudo crear'); setGuardandoZona(false); return; }
      setZonas(prev => [...prev, res.zona].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      setNuevaZona('');
    } catch (e) {
      setErrZona('Error de conexión: ' + e.message);
    }
    setGuardandoZona(false);
  };

  const desactivarZona = async id => {
    try {
      const res = await apiPost('editar_zona', { id, activa: false });
      if (res.success) setZonas(prev => prev.filter(z => z.id !== id));
    } catch (e) {}
  };

  return _jsxDEV("div", {
    children: [_jsxDEV("div", {
      className: "card-header",
      children: [_jsxDEV("div", {
        children: [_jsxDEV("div", { className: "card-title", children: "Distribuidores y comisiones" }, void 0, false),
        _jsxDEV("div", { className: "card-sub", children: "Administra el % de comisión, el estado del referido y su vínculo con la escuela real, además del catálogo de zonas." }, void 0, false)]
      }, void 0, true)]
    }, void 0, true),

    _jsxDEV("div", {
      style: { display: 'flex', gap: 6, margin: '14px 0 18px' },
      children: [
        { id: 'referidos', label: 'Referidos y comisiones', icon: 'reportes' },
        { id: 'zonas', label: 'Zonas', icon: 'escuelas' },
      ].map(t => _jsxDEV("button", {
        key: t.id,
        className: `btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`,
        onClick: () => setTab(t.id),
        children: [_jsxDEV(Icon, { name: t.icon, size: 13, color: "currentColor" }, void 0, false), " ", t.label]
      }, t.id, true))
    }, void 0, true),

    tab === 'referidos' && _jsxDEV(_Fragment, {
      children: [_jsxDEV("div", {
        style: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 },
        children: [_jsxDEV("div", {
          className: "search-bar",
          style: { maxWidth: 360, flex: 1 },
          children: [_jsxDEV("span", { className: "search-icon", children: _jsxDEV(Icon, { name: "search", size: 15, color: "currentColor" }, void 0, false) }, void 0, false),
          _jsxDEV("input", { placeholder: "Buscar distribuidor o colegio…", value: q, onChange: e => setQ(e.target.value) }, void 0, false)]
        }, void 0, true),
        lista.length > 0 && _jsxDEV("button", {
          className: "btn btn-secondary btn-sm",
          onClick: exportarExcel,
          children: [_jsxDEV(Icon, { name: "download", size: 13, color: "currentColor" }, void 0, false), " Exportar"]
        }, void 0, true)]
      }, void 0, true),

      err && _jsxDEV("div", { style: { color: 'var(--red)', fontSize: 13, marginBottom: 10 }, children: err }, void 0, false),

      loading ? _jsxDEV("div", { className: "empty-state", children: _jsxDEV("span", { className: "spinner" }, void 0, false) }, void 0, false)
      : lista.length === 0 ? _jsxDEV("div", { className: "empty-state", children: [
          _jsxDEV("div", { className: "empty-icon", children: _jsxDEV(Icon, { name: "reportes", size: 36, color: "currentColor" }, void 0, false) }, void 0, false),
          _jsxDEV("div", { className: "empty-text", children: "Sin referidos todavía" }, void 0, false)
        ] }, void 0, true)
      : _jsxDEV("div", {
        className: "table-wrap",
        children: _jsxDEV("table", {
          className: "table",
          children: [_jsxDEV("thead", {
            children: _jsxDEV("tr", {
              children: [_jsxDEV("th", { children: "Distribuidor" }, void 0, false),
              _jsxDEV("th", { children: "Colegio" }, void 0, false),
              _jsxDEV("th", { children: "Alumnos" }, void 0, false),
              _jsxDEV("th", { children: "Estado" }, void 0, false),
              _jsxDEV("th", { children: "Comisión" }, void 0, false),
              _jsxDEV("th", { children: "Alta" }, void 0, false),
              _jsxDEV("th", {}, void 0, false)]
            }, void 0, true)
          }, void 0, false), _jsxDEV("tbody", {
            children: lista.map(r => _jsxDEV("tr", {
              children: [_jsxDEV("td", {
                children: [_jsxDEV("div", { style: { fontWeight: 600 }, children: r.distribuidor_nombre || '—' }, void 0, false),
                _jsxDEV("div", { style: { fontSize: 11, color: 'var(--ink-4)' }, children: r.distribuidor_email }, void 0, false)]
              }, void 0, true), _jsxDEV("td", {
                children: [_jsxDEV("div", { children: r.escuela_nombre || r.nombre_colegio }, void 0, false),
                r.notas && _jsxDEV("div", { style: { fontSize: 11, color: 'var(--ink-4)' }, children: r.notas }, void 0, false)]
              }, void 0, true), _jsxDEV("td", { children: r.num_alumnos ?? '—' }, void 0, false),
              _jsxDEV("td", { children: _jsxDEV("span", { className: `badge ${ESTADO_BADGE[r.estado] || 'badge-gray'}`, children: (ESTADOS.find(e => e.value === r.estado) || {}).label || r.estado }, void 0, false) }, void 0, false),
              _jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontWeight: 700 }, children: [r.comision_pct, "%"] }, void 0, true),
              _jsxDEV("td", { style: { fontSize: 12, color: 'var(--ink-3)' }, children: r.fecha_alta }, void 0, false),
              _jsxDEV("td", { children: _jsxDEV("button", { className: "btn btn-ghost btn-sm", onClick: () => abrirEditar(r), children: "Editar" }, void 0, false) }, void 0, false)]
            }, r.id, true))
          }, void 0, false)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true),

    tab === 'zonas' && _jsxDEV("div", {
      className: "card",
      style: { maxWidth: 480 },
      children: [_jsxDEV("div", {
        style: { display: 'flex', gap: 8, marginBottom: 14 },
        children: [_jsxDEV("input", {
          className: "form-input", placeholder: "Nueva zona (ej. CDMX Sur)",
          value: nuevaZona, onChange: e => setNuevaZona(e.target.value),
          style: { flex: 1 }
        }, void 0, false), _jsxDEV("button", {
          className: "btn btn-primary btn-sm", disabled: guardandoZona || !nuevaZona.trim(),
          onClick: crearZona, children: guardandoZona ? 'Agregando…' : 'Agregar'
        }, void 0, false)]
      }, void 0, true), errZona && _jsxDEV("div", { style: { color: 'var(--red)', fontSize: 12.5, marginBottom: 10 }, children: errZona }, void 0, false),
      zonas.length === 0 ? _jsxDEV("div", { className: "empty-text", children: "Sin zonas capturadas todavía." }, void 0, false)
        : zonas.map(z => _jsxDEV("div", {
            key: z.id,
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--glass-light)' },
            children: [_jsxDEV("span", { style: { fontSize: 13.5 }, children: z.nombre }, void 0, false),
            _jsxDEV("button", { className: "btn btn-ghost btn-sm", onClick: () => desactivarZona(z.id), children: "Eliminar" }, void 0, false)]
          }, z.id, true))]
    }, void 0, true),

    modal === 'editar' && form && _jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: _jsxDEV("div", {
        className: "modal",
        children: [_jsxDEV("div", {
          className: "modal-header",
          children: [_jsxDEV("div", { className: "modal-title", children: "Editar referido" }, void 0, false),
          _jsxDEV("button", { className: "btn btn-ghost btn-sm", onClick: () => setModal(null), children: _jsxDEV(Icon, { name: "close", size: 16, color: "currentColor" }, void 0, false) }, void 0, false)]
        }, void 0, true), _jsxDEV("div", {
          className: "modal-body",
          children: [_jsxDEV("div", {
            className: "form-group",
            children: [_jsxDEV("label", { className: "form-label", children: "Estado" }, void 0, false),
            _jsxDEV("select", {
              className: "form-select", value: form.estado,
              onChange: e => setForm(f => ({ ...f, estado: e.target.value })),
              children: ESTADOS.map(es => _jsxDEV("option", { value: es.value, children: es.label }, es.value, false))
            }, void 0, false)]
          }, void 0, true), _jsxDEV("div", {
            className: "form-group",
            children: [_jsxDEV("label", { className: "form-label", children: "Comisión (%)" }, void 0, false),
            _jsxDEV("input", {
              className: "form-input", type: "number", step: "0.01", min: "0", max: "100",
              value: form.comision_pct, onChange: e => setForm(f => ({ ...f, comision_pct: e.target.value })),
              style: { fontFamily: 'var(--mono)' }
            }, void 0, false)]
          }, void 0, true), _jsxDEV("div", {
            className: "form-group",
            children: [_jsxDEV("label", { className: "form-label", children: "Escuela vinculada (cuando ya se dio de alta en el sistema)" }, void 0, false),
            _jsxDEV("select", {
              className: "form-select", value: form.escuela_id,
              onChange: e => setForm(f => ({ ...f, escuela_id: e.target.value })),
              children: [_jsxDEV("option", { value: "", children: "— Sin vincular —" }, "", false),
                ...(data.escuelas || []).filter(e => !e.es_plantel).map(e => _jsxDEV("option", { value: e.id, children: e.nombre }, e.id, false))]
            }, void 0, false)]
          }, void 0, true), _jsxDEV("div", {
            className: "form-group",
            children: [_jsxDEV("label", { className: "form-label", children: "Alumnos (si no hay escuela vinculada aún)" }, void 0, false),
            _jsxDEV("input", {
              className: "form-input", type: "number", value: form.num_alumnos,
              onChange: e => setForm(f => ({ ...f, num_alumnos: e.target.value }))
            }, void 0, false)]
          }, void 0, true), _jsxDEV("div", {
            className: "form-group",
            children: [_jsxDEV("label", { className: "form-label", children: "Notas" }, void 0, false),
            _jsxDEV("input", {
              className: "form-input", value: form.notas,
              onChange: e => setForm(f => ({ ...f, notas: e.target.value }))
            }, void 0, false)]
          }, void 0, true), errForm && _jsxDEV("div", { style: { color: 'var(--red)', fontSize: 12.5 }, children: errForm }, void 0, false)]
        }, void 0, true), _jsxDEV("div", {
          className: "modal-footer",
          children: [_jsxDEV("button", { className: "btn btn-secondary", onClick: () => setModal(null), children: "Cancelar" }, void 0, false),
          _jsxDEV("button", { className: "btn btn-primary", disabled: guardando, onClick: guardar, children: guardando ? 'Guardando…' : 'Guardar' }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}
