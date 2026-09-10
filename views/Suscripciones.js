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
  // Id de la escuela para la que se está generando una liga de renovación
  // (con cobro real, a diferencia del botón "Marcar como renovado", que
  // solo mueve la fecha sin que exista ningún pago de por medio).
  const [generandoRenovId, setGenerandoRenovId] = useState(null);

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

  // ── Mantenimiento global y métodos de pago globales ──────────────────────
  // Antes solo existía el apagado por escuela individual. Esto complementa
  // con un interruptor que afecta a TODAS las escuelas a la vez.
  const SECCIONES_MANT_CATALOGO = [
    { id: 'dashboard', label: 'Dashboard' }, { id: 'caja', label: 'Ingresos' },
    { id: 'corte_caja', label: 'Corte de caja' }, { id: 'cobros', label: 'Historial de cobros' },
    { id: 'gastos', label: 'Gastos' }, { id: 'alumnos', label: 'Alumnos' },
    { id: 'familias', label: 'Familias' }, { id: 'productos', label: 'Conceptos de pago' },
    { id: 'proveedores', label: 'Proveedores' }, { id: 'facturacion', label: 'Facturación' },
    { id: 'recordatorios', label: 'Recordatorios' }, { id: 'reportes', label: 'Reportes' },
  ];
  const METODOS_PAGO_GLOBAL_CATALOGO = [
    { id: 'TC', label: 'Tarjeta' }, { id: 'SPEI', label: 'SPEI' },
    { id: 'Efectivo', label: 'Efectivo (caja)' }, { id: 'EfectivoRef', label: 'Efectivo (tienda)' },
    { id: 'Cheque', label: 'Cheque' }, { id: 'CAI', label: 'Domiciliación' },
  ];
  // Mismo catálogo que Escuelas.js (apagado por escuela) -- esto es el
  // apagado GLOBAL simple, sin motivo/ventana de tiempo (eso es "mantenimiento",
  // arriba). Para que un admin/cajero pierda acceso hace falta CUALQUIERA de
  // los dos: mantenimiento activo O este interruptor encendido.
  const SECCIONES_GLOBAL_CATALOGO = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'caja', label: 'Ingresos' },
    { id: 'corte_caja', label: 'Corte de caja' },
    { id: 'cobros', label: 'Historial de cobros' },
    { id: 'gastos', label: 'Gastos' },
    { id: 'alumnos', label: 'Alumnos' },
    { id: 'familias', label: 'Familias' },
    { id: 'productos', label: 'Conceptos de pago' },
    { id: 'proveedores', label: 'Proveedores' },
    { id: 'facturacion', label: 'Facturación' },
    { id: 'recordatorios', label: 'Recordatorios' },
    { id: 'reportes', label: 'Reportes' },
    { id: 'miequipo', label: 'Mi equipo' },
  ];

  const [mantEstado, setMantEstado] = useState(null); // { secciones, motivo, inicio, fin } | null
  const [metodosGlobalDeshab, setMetodosGlobalDeshab] = useState([]);
  const [seccionesGlobalDeshab, setSeccionesGlobalDeshab] = useState([]);
  const [cargandoMant, setCargandoMant] = useState(true);
  const [modalMant, setModalMant] = useState(false);
  const [formSecciones, setFormSecciones] = useState([]);
  const [formMotivo, setFormMotivo] = useState('');
  const [formFin, setFormFin] = useState(''); // datetime-local string, vacío = indefinido
  const [guardandoMant, setGuardandoMant] = useState(false);
  const [guardandoMetodoGlobal, setGuardandoMetodoGlobal] = useState(null);
  const [guardandoSeccionGlobal, setGuardandoSeccionGlobal] = useState(null);

  const cargarMantenimiento = async () => {
    setCargandoMant(true);
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=mantenimiento_estado', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const json = await res.json();
      if (json.success) {
        setMantEstado(json.mantenimiento);
        setMetodosGlobalDeshab(json.metodos_pago_global || []);
        setSeccionesGlobalDeshab(json.secciones_deshabilitadas_global || []);
      }
    } catch (e) {
      // sin red: se queda como estaba
    } finally {
      setCargandoMant(false);
    }
  };
  useEffect(() => { cargarMantenimiento(); }, []);

  const abrirModalMant = () => {
    setFormSecciones(mantEstado?.secciones || []);
    setFormMotivo(mantEstado?.motivo || '');
    setFormFin(mantEstado?.fin ? mantEstado.fin.slice(0, 16).replace(' ', 'T') : '');
    setModalMant(true);
  };

  const activarMantenimiento = async () => {
    if (formSecciones.length < 1) { alert('Elige al menos una sección.'); return; }
    setGuardandoMant(true);
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=mantenimiento_activar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ secciones: formSecciones, motivo: formMotivo, fin: formFin || '' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo activar el mantenimiento');
      setMantEstado(json.mantenimiento);
      setModalMant(false);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setGuardandoMant(false);
    }
  };

  const desactivarMantenimiento = async () => {
    if (!confirm('¿Desactivar el modo mantenimiento global ahora mismo?')) return;
    setGuardandoMant(true);
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=mantenimiento_desactivar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo desactivar');
      setMantEstado(null);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setGuardandoMant(false);
    }
  };

  const toggleMetodoGlobal = async metodoId => {
    setGuardandoMetodoGlobal(metodoId);
    const anterior = metodosGlobalDeshab;
    const nuevos = anterior.includes(metodoId) ? anterior.filter(m => m !== metodoId) : [...anterior, metodoId];
    setMetodosGlobalDeshab(nuevos); // optimista
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=superadmin_toggle_metodo_global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ metodo: metodoId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo actualizar');
    } catch (e) {
      setMetodosGlobalDeshab(anterior); // revertir
      alert('No se pudo actualizar el método de pago global: ' + e.message);
    } finally {
      setGuardandoMetodoGlobal(null);
    }
  };

  const toggleSeccionGlobal = async seccionId => {
    setGuardandoSeccionGlobal(seccionId);
    const anterior = seccionesGlobalDeshab;
    const nuevas = anterior.includes(seccionId) ? anterior.filter(s => s !== seccionId) : [...anterior, seccionId];
    setSeccionesGlobalDeshab(nuevas); // optimista
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=superadmin_toggle_seccion_global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ seccion: seccionId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo actualizar');
    } catch (e) {
      setSeccionesGlobalDeshab(anterior); // revertir
      alert('No se pudo actualizar la sección global: ' + e.message);
    } finally {
      setGuardandoSeccionGlobal(null);
    }
  };



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

  // Genera un cobro REAL de renovación (Tarjeta o Efectivo) usando la misma
  // pasarela que ya cobra a cualquier colegio. A diferencia de
  // renovarSuscripcion() de arriba, aquí no se mueve la fecha directamente:
  // el webhook la extiende solo en cuanto detecta el pago confirmado.
  const generarLigaRenovacion = async (escuelaId, metodo) => {
    setGenerandoRenovId(escuelaId);
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=escuela_generar_pago_renovacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ escuela_id: escuelaId, metodo }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo generar la liga de renovación');
      if (metodo === 'TC') {
        // Se copia la liga para que el superadmin la mande al colegio (por
        // correo/WhatsApp) — no tiene sentido abrirla aquí mismo, ya que
        // quien debe pagar es el colegio, no el superadmin.
        try {
          await navigator.clipboard.writeText(json.url);
          alert('Liga de pago copiada al portapapeles. Compártela con el colegio:\n\n' + json.url);
        } catch (e) {
          alert('Liga de pago generada:\n\n' + json.url);
        }
      } else {
        alert(
          'Referencia de pago en efectivo generada: ' + json.referencia +
          '\nVence: ' + json.vencimiento +
          '\n\nCompártela con el colegio para que pague en cualquier tienda participante.'
        );
      }
    } catch (e) {
      alert('No se pudo generar la liga de renovación: ' + e.message);
    } finally {
      setGenerandoRenovId(null);
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

  const fechaCorta = iso => iso ? new Date(iso.replace(' ', 'T')).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const panelMantenimiento = _jsxDEV("div", {
    className: "card", style: { marginBottom: 20 },
    children: [
      _jsxDEV("div", {
        className: "card-header",
        children: _jsxDEV("div", {
          children: [
            _jsxDEV("div", { className: "card-title", children: "Mantenimiento y métodos de pago" }, 't'),
            _jsxDEV("div", { className: "card-sub", children: "Afecta a TODAS las escuelas a la vez. Para una sola escuela, usa el botón de secciones en su fila." }, 's')
          ]
        }, 'h')
      }, 'ch'),

      // Estado del mantenimiento
      mantEstado ? _jsxDEV("div", {
        style: { padding: '12px 14px', borderRadius: 'var(--radius)', background: 'var(--amber-glow)', marginBottom: 16 },
        children: [
          _jsxDEV("div", { style: { fontWeight: 700, fontSize: 13.5, color: 'var(--amber)' },
            children: "Mantenimiento activo: " + (mantEstado.secciones || []).join(', ')
          }, 1),
          _jsxDEV("div", { style: { fontSize: 12, color: 'var(--ink-2)', marginTop: 4 },
            children: (mantEstado.motivo || '') + ' · desde ' + fechaCorta(mantEstado.inicio) + (mantEstado.fin ? ' · hasta ' + fechaCorta(mantEstado.fin) : ' · indefinido')
          }, 2),
          _jsxDEV("div", { style: { display: 'flex', gap: 8, marginTop: 10 },
            children: [
              _jsxDEV("button", { className: "btn btn-secondary btn-sm", onClick: abrirModalMant, children: "Editar" }, 'e'),
              _jsxDEV("button", { className: "btn btn-ghost btn-sm", disabled: guardandoMant, onClick: desactivarMantenimiento, children: "Desactivar ahora" }, 'd'),
            ]
          }, 3),
        ]
      }, 'activo') : _jsxDEV("div", { style: { marginBottom: 16 },
        children: [
          _jsxDEV("div", { style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 8 }, children: "Sin mantenimiento activo." }, 1),
          _jsxDEV("button", { className: "btn btn-secondary btn-sm", onClick: abrirModalMant, children: "Activar mantenimiento" }, 'act'),
        ]
      }, 'inactivo'),

      // Métodos de pago globales
      _jsxDEV("div", { style: { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .3 },
        children: "Métodos de pago (todas las escuelas)"
      }, 'lbl'),
      _jsxDEV("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 8 },
        children: METODOS_PAGO_GLOBAL_CATALOGO.map(met => {
          const apagado = metodosGlobalDeshab.includes(met.id);
          return _jsxDEV("button", {
            key: met.id,
            className: 'btn btn-sm ' + (apagado ? 'btn-secondary' : 'btn-ghost'),
            disabled: guardandoMetodoGlobal === met.id,
            style: apagado ? { color: 'var(--red)', borderColor: 'var(--red)' } : {},
            onClick: () => toggleMetodoGlobal(met.id),
            children: (apagado ? '🚫 ' : '') + met.label
          }, met.id, false);
        })
      }, 'metodos'),

      // Secciones apagadas globalmente (permanente, no-mantenimiento)
      _jsxDEV("div", { style: { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: .3 },
        children: "Secciones (todas las escuelas)"
      }, 'lblSec'),
      _jsxDEV("div", { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 },
        children: "Apaga una sección para todo el sistema de forma permanente, sin el aviso de mantenimiento ni ventana de tiempo."
      }, 'subSec'),
      _jsxDEV("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 8 },
        children: SECCIONES_GLOBAL_CATALOGO.map(sec => {
          const apagada = seccionesGlobalDeshab.includes(sec.id);
          return _jsxDEV("button", {
            key: sec.id,
            className: 'btn btn-sm ' + (apagada ? 'btn-secondary' : 'btn-ghost'),
            disabled: guardandoSeccionGlobal === sec.id,
            style: apagada ? { color: 'var(--red)', borderColor: 'var(--red)' } : {},
            onClick: () => toggleSeccionGlobal(sec.id),
            children: (apagada ? '🚫 ' : '') + sec.label
          }, sec.id, false);
        })
      }, 'secciones'),
    ]
  }, 'panelMant');

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
    children: [panelMantenimiento, panelInvitaciones, excedidos.length > 0 && /*#__PURE__*/_jsxDEV("div", {
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
                        title: "Mueve la fecha sin generar ningún cobro",
                        children: renovandoId === esc.id ? 'Renovando…' : 'Marcar como renovado'
                      }, void 0, false),
                      /*#__PURE__*/_jsxDEV("button", {
                        className: "btn btn-secondary btn-sm",
                        disabled: generandoRenovId === esc.id,
                        style: { fontSize: 11, padding: '2px 8px' },
                        title: "Genera un cobro real con tarjeta; la fecha se extiende sola cuando se confirme el pago",
                        onClick: () => generarLigaRenovacion(esc.id, 'TC'),
                        children: generandoRenovId === esc.id ? 'Generando…' : 'Liga de pago (tarjeta)'
                      }, void 0, false),
                      /*#__PURE__*/_jsxDEV("button", {
                        className: "btn btn-secondary btn-sm",
                        disabled: generandoRenovId === esc.id,
                        style: { fontSize: 11, padding: '2px 8px' },
                        title: "Genera una referencia para pagar en efectivo; la fecha se extiende sola cuando se confirme el pago",
                        onClick: () => generarLigaRenovacion(esc.id, 'Efectivo'),
                        children: generandoRenovId === esc.id ? 'Generando…' : 'Referencia (efectivo)'
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
    }, void 0, true), modalMant && _jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModalMant(false),
      children: _jsxDEV("div", {
        className: "modal", style: { maxWidth: 480 },
        children: [
          _jsxDEV("div", { className: "modal-header",
            children: [
              _jsxDEV("span", { className: "modal-title", children: "Activar mantenimiento global" }, void 0, false),
              _jsxDEV("button", { className: "modal-close", onClick: () => setModalMant(false), children: "✕" }, void 0, false)
            ]
          }, void 0, true),
          _jsxDEV("div", { className: "modal-body",
            children: [
              _jsxDEV("div", { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 14 },
                children: "Se apaga para TODAS las escuelas, sin importar su configuración individual. Útil para mantenimiento programado."
              }, void 0, false),
              _jsxDEV("div", { style: { fontSize: 12.5, fontWeight: 600, marginBottom: 6 }, children: "Secciones a apagar" }, void 0, false),
              _jsxDEV("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
                children: SECCIONES_MANT_CATALOGO.map(sec => {
                  const elegido = formSecciones.includes(sec.id);
                  return _jsxDEV("button", {
                    key: sec.id, type: "button",
                    className: 'btn btn-sm ' + (elegido ? 'btn-primary' : 'btn-secondary'),
                    onClick: () => setFormSecciones(prev => elegido ? prev.filter(s => s !== sec.id) : [...prev, sec.id]),
                    children: sec.label
                  }, sec.id, false);
                })
              }, void 0, true),
              _jsxDEV("label", { style: { fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }, children: "Motivo" }, void 0, false),
              _jsxDEV("input", {
                type: "text", className: "form-input", style: { width: '100%', marginBottom: 14 },
                placeholder: "Ej. Mantenimiento programado del servidor",
                value: formMotivo, onChange: e => setFormMotivo(e.target.value)
              }, void 0, false),
              _jsxDEV("label", { style: { fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }, children: "Termina automáticamente el (opcional)" }, void 0, false),
              _jsxDEV("input", {
                type: "datetime-local", className: "form-input", style: { width: '100%' },
                value: formFin, onChange: e => setFormFin(e.target.value)
              }, void 0, false),
              _jsxDEV("div", { style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 },
                children: "Si lo dejas vacío, el mantenimiento queda activo hasta que lo desactives manualmente."
              }, void 0, false),
            ]
          }, void 0, true),
          _jsxDEV("div", { className: "modal-footer",
            children: [
              _jsxDEV("button", { className: "btn btn-secondary", onClick: () => setModalMant(false), children: "Cancelar" }, void 0, false),
              _jsxDEV("button", { className: "btn btn-primary", disabled: guardandoMant, onClick: activarMantenimiento,
                children: guardandoMant ? 'Activando…' : 'Activar mantenimiento' }, void 0, false),
            ]
          }, void 0, true),
        ]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}
