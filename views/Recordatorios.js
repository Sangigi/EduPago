var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
// views/Recordatorios.jsx * Reemplaza el módulo de "Correos" por un sistema de RECORDATORIOS de pagos, * inspirado en el mecanismo de recordatorios/renovaciones de Seguros Lux * (App/Cron/CronRenovaciones.php y App/Cron/TelegramRecordatorio.php): * en vez de enviar correos manuales, se listan los cobros pendientes/vencidos * agrupados por urgencia y se pueden marcar como "recordado".
function Recordatorios({
  data,
  setData,
  escuela
}) {
  const {
    useState,
    useMemo
  } = React;
  const [filtro, setFiltro] = useState('todos'); // todos | vencidos | proximos | recordados

  // Medianoche local de hoy (no new Date() a secas): compara día calendario
  // contra día calendario, sin la hora del momento metiendo ruido.
  const hoy = new Date(new Date().toDateString());
  const diasDiff = fechaStr => {
    if (!fechaStr) return null;
    // "YYYY-MM-DD" + T00:00:00 fuerza a que el navegador lo lea en hora LOCAL.
    // Sin esto, new Date("2026-08-20") se interpreta como medianoche UTC, que
    // en México (UTC-6) ya son las 6pm del día 19 — un cobro de HOY aparecía
    // "vencido hace 1 día".
    const f = new Date(fechaStr.slice(0, 10) + 'T00:00:00');
    return Math.round((hoy - f) / (1000 * 60 * 60 * 24));
  };

  const pendientes = useMemo(() => {
    return (data.cobros || [])
      .filter(c => c.estado === 'pendiente')
      .map(c => {
        const dias = diasDiff(c.fecha_vencimiento || c.fecha);
        let urgencia = 'proximo';
        if (dias !== null && dias > 0) urgencia = 'vencido';
        else if (dias !== null && dias >= -3) urgencia = 'urgente';
        return { ...c, dias_vencido: dias, urgencia };
      })
      .sort((a, b) => (b.dias_vencido || 0) - (a.dias_vencido || 0));
  }, [data.cobros]);

  const recordatoriosEnviados = data.recordatorios || [];

  const yaRecordadoHoy = cobroId => {
    const hoyStr = hoy.toISOString().slice(0, 10);
    return recordatoriosEnviados.some(r => r.cobro_id === cobroId && r.fecha === hoyStr);
  };

  const [guardandoId, setGuardandoId] = useState(null);

  const marcarRecordado = async cobro => {
    if (guardandoId) return;
    setGuardandoId(cobro.id);
    const hoyStr = hoy.toISOString().slice(0, 10);
    // Optimista: se refleja de inmediato; si falla, se revierte.
    const nuevo = {
      id: AppModel.nextId(recordatoriosEnviados),
      cobro_id: cobro.id,
      cliente: cobro.cliente,
      escuela_id: cobro.escuela_id || (escuela ? escuela.id : null),
      fecha: hoyStr,
      canal: 'manual'
    };
    const newData = { ...data, recordatorios: [...recordatoriosEnviados, nuevo] };
    setData(newData);
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=marcar_recordatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ cobro_id: cobro.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo guardar');
      // Persistimos también en cache local por si se pierde la conexión luego
      AppModel.save(newData);
    } catch (e) {
      // Revertir el optimista si la API falló de verdad
      setData(data);
      alert('No se pudo guardar el recordatorio: ' + (e.message || 'intenta de nuevo'));
    } finally {
      setGuardandoId(null);
    }
  };

  const listaFiltrada = pendientes.filter(c => {
    if (filtro === 'vencidos') return c.urgencia === 'vencido';
    if (filtro === 'proximos') return c.urgencia === 'proximo' || c.urgencia === 'urgente';
    if (filtro === 'recordados') return yaRecordadoHoy(c.id);
    return true;
  });

  const FILTROS = [
    { id: 'todos', label: 'Todos' },
    { id: 'vencidos', label: 'Vencidos' },
    { id: 'proximos', label: 'Próximos a vencer' },
    { id: 'recordados', label: 'Recordados hoy' }
  ];

  const colorUrgencia = u => u === 'vencido' ? 'var(--red, #e5484d)' : u === 'urgente' ? '#e0a930' : 'var(--ink-3)';
  const labelUrgencia = c => {
    if (c.dias_vencido === null) return 'Sin fecha de vencimiento';
    if (c.dias_vencido > 0) return `Vencido hace ${c.dias_vencido} día(s)`;
    if (c.dias_vencido === 0) return 'Vence hoy';
    return `Vence en ${Math.abs(c.dias_vencido)} día(s)`;
  };

  return _jsxDEV("div", {
    children: [
      _jsxDEV("div", {
        className: "stats-grid",
        children: (() => {
          const nVenc = pendientes.filter(c => c.urgencia === 'vencido').length;
          const nUrg  = pendientes.filter(c => c.urgencia === 'urgente').length;
          const nProx = pendientes.filter(c => c.urgencia === 'proximo').length;
          const nRec  = pendientes.filter(c => yaRecordadoHoy(c.id)).length;
          const monto = pendientes.reduce((a, c) => a + (Number(c.total) || 0), 0);
          const tarjetas = [
            { destacada: true, tinte: '', icono: 'history', valor: fmt(monto), etiqueta: 'Monto por recuperar', meta: pendientes.length + ' cobros pendientes' },
            { tinte: 'tint-red',   icono: 'warning',  valor: nVenc, etiqueta: 'Vencidos', meta: 'Requieren contacto inmediato' },
            { tinte: 'tint-amber', icono: 'history', valor: nUrg + nProx, etiqueta: 'Próximos a vencer', meta: nUrg + ' urgentes en 3 días' },
            { tinte: 'tint-green', icono: 'check',   valor: nRec, etiqueta: 'Recordados hoy', meta: 'Seguimiento manual del día' }
          ];
          return tarjetas.map(t => _jsxDEV("div", {
            className: "stat-card" + (t.destacada ? " is-featured" : ""),
            children: [
              _jsxDEV("div", { className: "stat-icon" + (t.tinte ? " " + t.tinte : ""),
                children: _jsxDEV(Icon, { name: t.icono, size: 19, color: "currentColor" }, void 0, false) }, void 0, false),
              _jsxDEV("div", { className: "stat-value", children: t.valor }, void 0, false),
              _jsxDEV("div", { className: "stat-label", children: t.etiqueta }, void 0, false),
              _jsxDEV("div", { className: "stat-meta", children: t.meta }, void 0, false)
            ]
          }, t.etiqueta, true));
        })()
      }, void 0, false),
      _jsxDEV("div", {
        style: { marginBottom: 18, color: 'var(--ink-3)', fontSize: 12.5, lineHeight: 1.6 },
        children: "Cobros pendientes o vencidos. El sistema ya envía un correo automático a la familia 3 días antes de vencer, el día que vence, y 1 día después de vencido (cron_recordatorios.php). Usa este panel para dar seguimiento manual adicional y marcar a quién ya le diste seguimiento tú."
      }, void 0, false),
      _jsxDEV("div", {
        className: "pill-group",
        style: { marginBottom: 18 },
        children: FILTROS.map(f => _jsxDEV("button", {
          onClick: () => setFiltro(f.id),
          className: "pill" + (filtro === f.id ? " active" : ""),
          children: f.label
        }, f.id, false))
      }, void 0, false),
      listaFiltrada.length === 0 ? _jsxDEV("div", {
        style: { opacity: .6, padding: 24, textAlign: 'center' },
        children: "No hay cobros que coincidan con este filtro."
      }, void 0, false) : _jsxDEV("div", {
        style: { display: 'flex', flexDirection: 'column', gap: 10 },
        children: listaFiltrada.map(c => _jsxDEV("div", {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid var(--border, #2a2a2a)',
            borderLeft: `4px solid ${colorUrgencia(c.urgencia)}`
          },
          children: [
            _jsxDEV("div", {
              children: [
                _jsxDEV("div", { style: { fontWeight: 600 }, children: c.cliente || 'Sin nombre' }, void 0, false),
                _jsxDEV("div", { style: { fontSize: 12, opacity: .7 }, children: labelUrgencia(c) }, void 0, false)
              ]
            }, void 0, true),
            _jsxDEV("div", {
              style: { display: 'flex', alignItems: 'center', gap: 12 },
              children: [
                _jsxDEV("div", { style: { fontFamily: 'monospace', fontSize: 14 }, children: c.total ? '$' + parseFloat(c.total).toLocaleString('es-MX') : '' }, void 0, false),
                yaRecordadoHoy(c.id) ? _jsxDEV("span", {
                  style: { fontSize: 12, color: 'var(--accent, #bdcf00)' },
                  children: '✓ Recordado hoy'
                }, void 0, false) : _jsxDEV("button", {
                  onClick: () => marcarRecordado(c),
                  disabled: guardandoId === c.id,
                  style: {
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent, #bdcf00)',
                    color: '#111',
                    cursor: guardandoId === c.id ? 'default' : 'pointer',
                    opacity: guardandoId === c.id ? .6 : 1,
                    fontSize: 12,
                    fontWeight: 600
                  },
                  children: guardandoId === c.id ? 'Guardando…' : 'Marcar recordado'
                }, void 0, false)
              ]
            }, void 0, true)
          ]
        }, c.id, true))
      }, void 0, false)
    ]
  }, void 0, true);
}
