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
  basico:   { label: 'Básico',   precio: 999,  max_alumnos: 400, max_planteles: 1,    color: 'var(--ink-3)' },
  avanzado: { label: 'Avanzado', precio: 1500, max_alumnos: 800, max_planteles: 1,    color: 'var(--accent, #bdcf00)' },
  pro:      { label: 'Pro',      precio: 3000, max_alumnos: null, max_planteles: null, color: 'var(--lime)' },
};
// Fallback seguro: un plan no reconocido en escuelas.plan (typo, dato viejo)
// se trata como el MÁS restrictivo, nunca como "sin límite" (antes cualquier
// valor no mapeado caía en PLANES_INFO.pro por accidente).
const PLAN_INFO_FALLBACK = 'basico';

function Suscripciones({ data, setData }) {
  const { useState, useEffect } = React;
  const [cambiandoPlanId, setCambiandoPlanId] = useState(null);
  const [renovandoId, setRenovandoId] = useState(null);

  // ── Invitaciones de colegios en proceso de registro ──────────────────────
  // Antes no existía ninguna pantalla para esto: invitacion_resolver.php
  // (aprobar/rechazar) y invitaciones_listar.php ya existían en el backend,
  // pero nada en el frontend los consumía — un colegio podía pagar su
  // suscripción y quedarse esperando indefinidamente sin que nadie tuviera
  // dónde aprobarlo.
  const [invitaciones, setInvitaciones] = useState([]);
  const [cargandoInv, setCargandoInv] = useState(true);
  const [resolviendoId, setResolviendoId] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState({}); // { [id]: texto }

  const cargarInvitaciones = async () => {
    setCargandoInv(true);
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=invitaciones_listar', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const json = await res.json();
      if (json.success) setInvitaciones(json.invitaciones || []);
    } catch (e) {
      // sin red: la lista se queda como estaba, no se rompe la pantalla
    } finally {
      setCargandoInv(false);
    }
  };

  useEffect(() => { cargarInvitaciones(); }, []);

  // motivoOverride: se recibe directo como parámetro en vez de leerse del
  // estado — setMotivoRechazo() es asíncrono y llamar a esta función justo
  // después (mismo evento de clic) mandaba el motivo VACÍO, un evento
  // atrás, porque React aún no había aplicado el setState.
  const resolverInvitacion = async (id, accionResolver, motivoOverride) => {
    setResolviendoId(id);
    try {
      const token = AuthController.getToken();
      const body = { id, accion: accionResolver };
      if (accionResolver === 'rechazar') body.motivo = motivoOverride ?? (motivoRechazo[id] || '');
      const res = await fetch('api.php?action=invitacion_resolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo procesar la invitación');

      if (accionResolver === 'aprobar' && json.escuela_id) {
        // La escuela nueva aún no vive en `data.escuelas` (se creó en el
        // backend apenas ahora) — se recarga la página para traerla, en
        // vez de intentar reconstruir a mano el objeto completo aquí.
        alert(
          'Colegio aprobado y activado.' +
          (json.usuario_creado
            ? (json.correo_enviado
                ? ' Se envió un correo de activación a ' + json.email_login + '.'
                : ' No se pudo enviar el correo de activación — copia esta liga y envíasela al colegio: ' + json.activacion_liga)
            : ' El correo ya tenía una cuenta existente; no se creó una nueva.')
        );
      }
      await cargarInvitaciones();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setResolviendoId(null);
    }
  };

  const renovarSuscripcion = async (escuelaId) => {
    setRenovandoId(escuelaId);
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=renovar_suscripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ id: escuelaId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo renovar la suscripción');
      setData({ ...data, escuelas: data.escuelas.map(e => e.id === escuelaId ? { ...e, fecha_vencimiento_plan: json.fecha_vencimiento_plan } : e) });
    } catch (e) {
      alert('No se pudo renovar la suscripción: ' + e.message);
    } finally {
      setRenovandoId(null);
    }
  };

  const cambiarPlan = async (escuelaId, nuevoPlan) => {
    const anterior = data.escuelas.find(e => e.id === escuelaId)?.plan;
    setCambiandoPlanId(escuelaId);
    // Optimista
    setData({ ...data, escuelas: data.escuelas.map(e => e.id === escuelaId ? { ...e, plan: nuevoPlan } : e) });
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=cambiar_plan_escuela', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ id: escuelaId, plan: nuevoPlan }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo cambiar el plan');
    } catch (e) {
      // Revertir si falló de verdad
      setData({ ...data, escuelas: data.escuelas.map(x => x.id === escuelaId ? { ...x, plan: anterior } : x) });
      alert('No se pudo cambiar el plan: ' + e.message);
    } finally {
      setCambiandoPlanId(null);
    }
  };
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
    const diasVencimiento = esc.fecha_vencimiento_plan
      ? Math.round((new Date(esc.fecha_vencimiento_plan + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000)
      : null;
    return { esc, info, planKey, planReconocido, numPlanteles, totalAlumnos, pctAlumnos, excedido, excedidoPlanteles, diasVencimiento };
  });

  const ingresoMensualEstimado = filas.reduce((a, f) => a + f.info.precio, 0);
  const excedidos = filas.filter(f => f.excedido || f.excedidoPlanteles);

  // Tendencia de altas por mes (usa fecha_alta, que ya viene en cada escuela;
  // no requiere backend nuevo). Últimos 6 meses.
  const altasPorMes = (() => {
    const hoy = new Date();
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      meses.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('es-MX', { month: 'short' }), count: 0 });
    }
    principales.forEach(esc => {
      if (!esc.fecha_alta) return;
      const key = esc.fecha_alta.slice(0, 7);
      const m = meses.find(m => m.key === key);
      if (m) m.count++;
    });
    return meses;
  })();
  const maxAltas = Math.max(1, ...altasPorMes.map(m => m.count));

  const invPendientes = invitaciones.filter(i => i.estado === 'enviado' || i.estado === 'pagado');
  const PLAN_LABEL = { basico: 'Básico', avanzado: 'Avanzado', pro: 'Pro' };

  const panelInvitaciones = (invPendientes.length > 0 || cargandoInv) && _jsxDEV("div", {
    className: "card",
    style: { marginBottom: 20, padding: 0, overflow: 'hidden' },
    children: [
      _jsxDEV("div", {
        style: { padding: '16px 20px', borderBottom: '1px solid var(--border-glow)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        children: [
          _jsxDEV("div", {
            children: [
              _jsxDEV("div", { style: { fontWeight: 700, fontSize: 15 }, children: "Colegios en proceso de registro" }, void 0, false),
              _jsxDEV("div", { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 },
                children: "Solicitudes que ya pagaron su suscripción y esperan tu revisión antes de activarse." }, void 0, false)
            ]
          }, void 0, true),
          cargandoInv ? _jsxDEV("span", { className: "spinner", style: { width: 16, height: 16 } }, void 0, false) : null
        ]
      }, 'h', true),
      invPendientes.length === 0 ? _jsxDEV("div", {
        style: { padding: '20px', color: 'var(--ink-3)', fontSize: 13 },
        children: "Sin solicitudes pendientes por ahora."
      }, void 0, false) : _jsxDEV("div", {
        children: invPendientes.map(inv => {
          const datos = (() => { try { return JSON.parse(inv.datos_enviados || '{}'); } catch (e) { return {}; } })();
          const yaPagado = inv.estado === 'pagado';
          return _jsxDEV("div", {
            style: { padding: '14px 20px', borderBottom: '1px solid var(--border-glow)' },
            children: [
              _jsxDEV("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
                children: [
                  _jsxDEV("div", {
                    children: [
                      _jsxDEV("div", { style: { fontWeight: 600, fontSize: 14 }, children: datos.nombre || '(sin nombre)' }, void 0, false),
                      _jsxDEV("div", { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 },
                        children: [datos.email || inv.contacto_email, ' · ', inv.contacto_nombre] }, void 0, true),
                      _jsxDEV("div", { style: { fontSize: 12, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
                        children: [
                          _jsxDEV("span", {
                            style: { padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                     background: yaPagado ? 'rgba(73,175,84,.12)' : 'rgba(217,119,6,.12)',
                                     color: yaPagado ? 'var(--green)' : 'var(--amber, #d97706)' },
                            children: yaPagado ? 'Pago confirmado' : 'Esperando pago'
                          }, void 0, false),
                          inv.plan_elegido ? _jsxDEV("span", { style: { color: 'var(--ink-2)' },
                            children: (PLAN_LABEL[inv.plan_elegido] || inv.plan_elegido) + ' · $' + Number(inv.monto_suscripcion || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
                          }, void 0, false) : null
                        ]
                      }, void 0, true)
                    ]
                  }, void 0, true),
                  yaPagado ? _jsxDEV("div", { style: { display: 'flex', gap: 8, flexShrink: 0 },
                    children: [
                      _jsxDEV("button", {
                        className: "btn btn-primary btn-sm",
                        disabled: resolviendoId === inv.id,
                        onClick: () => resolverInvitacion(inv.id, 'aprobar'),
                        children: resolviendoId === inv.id ? 'Procesando…' : 'Aprobar y activar'
                      }, void 0, false),
                      _jsxDEV("button", {
                        className: "btn btn-secondary btn-sm",
                        disabled: resolviendoId === inv.id,
                        onClick: () => {
                          const motivo = prompt('¿Por qué se rechaza esta solicitud? (se le puede compartir al colegio)');
                          if (motivo === null) return;
                          resolverInvitacion(inv.id, 'rechazar', motivo);
                        },
                        children: 'Rechazar'
                      }, void 0, false)
                    ]
                  }, void 0, true) : null
                ]
              }, void 0, true)
            ]
          }, inv.id, true);
        })
      }, void 0, false)
    ]
  }, void 0, true);

  return /*#__PURE__*/_jsxDEV("div", {
    children: [panelInvitaciones, excedidos.length > 0 && /*#__PURE__*/_jsxDEV("div", {
      style: {
        marginBottom: 16,
        padding: '12px 16px',
        background: 'rgba(239,68,68,.08)',
        border: '1px solid rgba(239,68,68,.3)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      },
      children: [/*#__PURE__*/_jsxDEV(Icon, { name: "warning", size: 16, color: "var(--red)" }, void 0, false),
      /*#__PURE__*/_jsxDEV("div", {
        style: { fontSize: 13, color: 'var(--ink-2)' },
        children: [/*#__PURE__*/_jsxDEV("strong", { children: [excedidos.length, ' colegio' + (excedidos.length > 1 ? 's' : '') + ' '] }, void 0, true),
        excedidos.length > 1 ? 'superaron' : 'superó', ' su límite de plan: ',
        excedidos.map(f => f.esc.nombre).join(', '), '.']
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
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
      style: { marginBottom: 20, padding: '16px 18px' },
      children: [/*#__PURE__*/_jsxDEV("div", {
        style: { fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 12 },
        children: "Colegios nuevos por mes"
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        style: { display: 'flex', alignItems: 'flex-end', gap: 10, height: 90 },
        children: altasPorMes.map(m => /*#__PURE__*/_jsxDEV("div", {
          style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: { fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' },
            children: m.count || ''
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              width: '100%',
              maxWidth: 32,
              height: Math.max(4, (m.count / maxAltas) * 60),
              background: m.count > 0 ? 'var(--lime)' : 'var(--glass-light)',
              borderRadius: 4,
            }
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: { fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'capitalize' },
            children: m.label
          }, void 0, false)]
        }, m.key, true))
      }, void 0, false)]
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
                /*#__PURE__*/_jsxDEV("th", { children: "Vencimiento" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Planteles" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Alumnos vs límite" }, void 0, false),
              ]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: filas.length === 0 ? /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", { colSpan: 6, className: "empty-text", children: "Sin colegios registrados." }, void 0, false)
            }, void 0, false) : filas.map(({ esc, info, planKey, planReconocido, numPlanteles, totalAlumnos, pctAlumnos, excedido, excedidoPlanteles, diasVencimiento }) => /*#__PURE__*/_jsxDEV("tr", {
              children: [
                /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("div", {
                    style: { display: 'flex', alignItems: 'center', gap: 8 },
                    children: [/*#__PURE__*/_jsxDEV("span", { style: { fontSize: 16 }, children: esc.logo_emoji }, void 0, false),
                    /*#__PURE__*/_jsxDEV("span", { style: { fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap' }, children: esc.nombre }, void 0, false)]
                  }, void 0, true)
                }, void 0, false),
                /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("select", {
                    className: "form-select",
                    value: planKey,
                    disabled: cambiandoPlanId === esc.id,
                    style: { fontSize: 12, fontWeight: 600, color: info.color, padding: '4px 8px', width: 'auto' },
                    title: planReconocido ? undefined : `Valor de plan no reconocido: "${esc.plan}" — se aplicaron límites de ${info.label} por seguridad`,
                    onChange: e => cambiarPlan(esc.id, e.target.value),
                    children: Object.entries(PLANES_INFO).map(([k, v]) => /*#__PURE__*/_jsxDEV("option", {
                      value: k,
                      children: v.label
                    }, k, false))
                  }, void 0, false)
                }, void 0, false),
                /*#__PURE__*/_jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontSize: 12.5 }, children: fmt(info.precio) + ' + IVA' }, void 0, false),
                /*#__PURE__*/_jsxDEV("td", {
                  children: !esc.fecha_vencimiento_plan ? /*#__PURE__*/_jsxDEV("span", { style: { fontSize: 12, color: 'var(--ink-4)' }, children: "Sin definir" }, void 0, false) : /*#__PURE__*/_jsxDEV("div", {
                    style: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' },
                    children: [
                      /*#__PURE__*/_jsxDEV("span", {
                        style: {
                          fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600,
                          color: diasVencimiento < 0 ? 'var(--red)' : diasVencimiento <= 7 ? '#e0a930' : 'var(--ink-2)',
                        },
                        children: diasVencimiento < 0
                          ? `Venció hace ${Math.abs(diasVencimiento)} día(s)`
                          : diasVencimiento === 0
                            ? 'Vence hoy'
                            : `Vence en ${diasVencimiento} día(s)`
                      }, void 0, false),
                      /*#__PURE__*/_jsxDEV("span", { style: { fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }, children: esc.fecha_vencimiento_plan }, void 0, false),
                      /*#__PURE__*/_jsxDEV("button", {
                        className: "btn btn-ghost btn-sm",
                        disabled: renovandoId === esc.id,
                        style: { fontSize: 11, padding: '2px 8px' },
                        onClick: () => renovarSuscripcion(esc.id),
                        children: renovandoId === esc.id ? 'Renovando…' : 'Marcar como renovado'
                      }, void 0, false),
                    ]
                  }, void 0, true)
                }, void 0, false),
                /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("span", {
                    style: { fontSize: 12.5, whiteSpace: 'nowrap', color: excedidoPlanteles ? 'var(--red)' : 'var(--ink-3)' },
                    children: info.max_planteles === null
                      ? `${numPlanteles} (sin límite)`
                      : [numPlanteles, " / ", info.max_planteles, excedidoPlanteles && ' ⚠']
                  }, void 0, false)
                }, void 0, false),
                /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("div", {
                    children: [/*#__PURE__*/_jsxDEV("span", {
                      style: { fontSize: 12.5, whiteSpace: 'nowrap', color: excedido ? 'var(--red)' : 'var(--ink-2)', fontWeight: excedido ? 600 : 400 },
                      children: info.max_alumnos === null
                        ? `${totalAlumnos} alumnos (sin límite)`
                        : [totalAlumnos, " / ", info.max_alumnos, " alumnos", excedido && ' — supera el límite']
                    }, void 0, false), pctAlumnos !== null && /*#__PURE__*/_jsxDEV("div", {
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
