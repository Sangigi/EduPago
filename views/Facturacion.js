var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
/* views/Facturacion.jsx v3 — Facturación */
function Facturacion({
  data,
  setData,
  escuela
}) {
  const {
    useState
  } = React;
  const [tab, setTab] = useState('pendientes');
  // ── Complementos de pago pendientes (25-sep-2026) ──────────────────────
  //
  // Un cobro pagado en abonos se factura como PPD, y cada abono necesita su
  // propio CFDI de pago. Sin esta lista el pendiente no avisa: la factura
  // queda colgada para el SAT y nadie se entera hasta que el contador del
  // colegio reclama.
  const [complementos, setComplementos] = useState([]);
  const [compAviso, setCompAviso] = useState(null);
  const [emitiendoComp, setEmitiendoComp] = useState(null);

  const cargarComplementos = React.useCallback(() => {
    if (!escuela?.id) return;
    fetch('api.php?action=abonos_sin_complemento_listar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (AuthController.getToken() || '') },
      body: JSON.stringify({ escuela_id: escuela.id }),
    }).then(r => r.json()).then(j => {
      if (!j || !j.success) return;
      setComplementos(j.abonos || []);
      if (j.aviso) setCompAviso(j.aviso);
    }).catch(() => {});
  }, [escuela?.id]);

  React.useEffect(() => { cargarComplementos(); }, [cargarComplementos]);

  const emitirComplemento = async ab => {
    if (emitiendoComp) return;
    setEmitiendoComp(ab.id);
    try {
      const res = await fetch('api.php?action=generar_complemento_pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (AuthController.getToken() || '') },
        body: JSON.stringify({ abono_id: ab.id }),
      });
      const j = await res.json();
      if (!j || !j.success) { alert((j && j.error) || 'No se pudo emitir el complemento.'); return; }
      alert('Complemento emitido.\nFolio fiscal: ' + j.uuid + '\nParcialidad ' + j.parcialidad + ', saldo restante $' + Number(j.saldo_restante).toFixed(2));
      // Se recarga la lista en vez de quitar la fila a mano: así el conteo de
      // la pestaña y la tabla no pueden quedar desincronizados.
      cargarComplementos();
    } catch (e) {
      alert('No se pudo emitir el complemento: ' + e.message);
    } finally {
      setEmitiendoComp(null);
    }
  };

  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [cobroSel, setCobroSel] = useState(null);
  const [cfdiVisor, setCfdiVisor] = useState(null);
  // ── Complementos de pago YA emitidos, por cobro (28-sep-2026) ───────────
  //
  // Hasta hoy la única constancia que veía el usuario al emitir un complemento
  // era el alert() de generar_complemento_pago.php, de un solo uso: si se
  // cerraba sin copiar el UUID, ese folio fiscal quedaba solo en la base de
  // datos. Este modal reutiliza detalle_cobro (ya trae cfdi_complemento_* por
  // abono) para poder consultarlo y descargarlo cuando haga falta, no solo en
  // el instante en que se generó.
  const [complementosVisor, setComplementosVisor] = useState(null); // { cobro, abonos } | null
  const [cargandoComplementos, setCargandoComplementos] = useState(false);
  const [descargandoComplemento, setDescargandoComplemento] = useState(null);

  const verComplementosCobro = async cobro => {
    setModal(null); // por si quedaba abierto: solo un modal a la vez
    setCargandoComplementos(true);
    setComplementosVisor({ cobro, abonos: [] });
    try {
      const token = AuthController.getToken ? AuthController.getToken() : '';
      const res = await fetch('api.php?action=detalle_cobro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ cobro_id: cobro.id }),
      });
      const j = await res.json();
      setComplementosVisor({ cobro, abonos: (j && j.success) ? (j.abonos || []) : [] });
    } catch (e) {
      setComplementosVisor({ cobro, abonos: [] });
    }
    setCargandoComplementos(false);
  };

  const descargarComplemento = async (abono, tipo) => {
    const llave = abono.id + '-' + tipo;
    setDescargandoComplemento(llave);
    try {
      const token = AuthController.getToken ? AuthController.getToken() : '';
      const params = new URLSearchParams({ action: 'descargar_complemento_pago', abono_id: abono.id, tipo });
      const res = await fetch('api.php?' + params.toString(), {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' },
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('application/json')) {
        const json = await res.json().catch(() => null);
        alert('No se pudo descargar: ' + (json?.error || 'Error desconocido'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `complemento-pago-${abono.id}.${tipo}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error de conexión al descargar: ' + e.message);
    } finally {
      setDescargandoComplemento(null);
    }
  };

  // ── [OF-2] Cancelación de facturas ─────────────────────────────────────
  //
  // Cancelar la factura NO cancela el cobro ni mueve dinero: el cobro queda
  // listo para facturarse otra vez. Solo superadmin y admin del colegio (el
  // servidor lo vuelve a validar). Si el SAT pide que el receptor acepte, la
  // factura sigue vigente y aparece "Cancelación pendiente" hasta que se
  // pulse "Actualizar estado" y el receptor haya respondido.
  const rolSesion = (AuthController.getSession && (AuthController.getSession() || {}).rol) || '';
  const puedeCancelar = rolSesion === 'admin' || rolSesion === 'superadmin';
  const MOTIVOS_CANCELACION = [
    { id: '02', titulo: '02 · Comprobante emitido con errores, sin relación',
      texto: 'La factura tiene un error (datos del receptor, importe, clave...) y no la vas a sustituir con otra ya emitida. Es la opción de siempre para corregir: cancelas y después vuelves a facturar este cobro.' },
    { id: '01', titulo: '01 · Comprobante emitido con errores, con relación',
      texto: 'La factura tiene un error y YA emitiste la factura correcta que la sustituye. Necesitas el folio fiscal (UUID) de la nueva. Ojo: este sistema solo permite una factura vigente por cobro, así que normalmente solo aplica si la sustituta se emitió fuera de aquí.' },
    { id: '03', titulo: '03 · No se llevó a cabo la operación',
      texto: 'La venta o el servicio no se concretó (por ejemplo, el alumno no se inscribió) y la factura no debió existir.' },
    { id: '04', titulo: '04 · Operación nominativa relacionada en una factura global',
      texto: 'Se usa cuando una factura al público en general (global) se cancela porque el cliente pidió su factura con nombre. Casi nunca aplica a un colegio. Requiere el UUID de la factura que la sustituye.' }
  ];
  const [cancelCobro, setCancelCobro] = useState(null);
  const [cancelMotivo, setCancelMotivo] = useState('02');
  const [cancelUuid, setCancelUuid] = useState('');
  const [cancelErr, setCancelErr] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [actualizandoCanc, setActualizandoCanc] = useState(null);
  const [canceladas, setCanceladas] = useState([]);
  const [cancAviso, setCancAviso] = useState(null);
  const ESTADO_CANC = { canceled: 'Cancelada', pending: 'Pendiente de aceptación', rejected: 'Rechazada (sigue vigente)', expired: 'Vencida (sigue vigente)' };
  const llamarApi = async (accion, cuerpo) => {
    const res = await fetch('api.php?action=' + accion, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (AuthController.getToken() || '') },
      body: JSON.stringify(cuerpo)
    });
    return res.json();
  };
  const cargarCanceladas = React.useCallback(() => {
    if (!escuela?.id || !puedeCancelar) return;
    llamarApi('cfdi_cancelaciones_listar', { escuela_id: escuela.id }).then(j => {
      if (!j || !j.success) return;
      setCanceladas(j.cancelaciones || []);
      setCancAviso(j.aviso || null);
    }).catch(() => {});
  }, [escuela?.id, puedeCancelar]);
  React.useEffect(() => { cargarCanceladas(); }, [cargarCanceladas]);
  // Refleja el estado nuevo en la lista local sin recargar todo.
  const aplicarEstadoCancelacion = (cobroId, estado) => {
    const nuevos = data.cobros.map(c => {
      if (c.id !== cobroId) return c;
      if (estado === 'canceled') {
        const { factura_cfdi, ...resto } = c;
        return { ...resto, factura: false, facturapi_id: '', factura_cancelacion_estado: null };
      }
      return c.factura_cfdi ? { ...c, factura_cfdi: { ...c.factura_cfdi, cancelacion_estado: estado === 'pending' ? 'pendiente' : null } } : c;
    });
    const nd = { ...data, cobros: nuevos };
    setData(nd);
    AppModel.save(nd);
  };
  const abrirCancelar = cobro => {
    setCancelCobro(cobro);
    setCancelMotivo('02');
    setCancelUuid('');
    setCancelErr('');
    setModal(null);
    setComplementosVisor(null);
  };
  const confirmarCancelar = async () => {
    const necesitaUuid = cancelMotivo === '01' || cancelMotivo === '04';
    if (necesitaUuid && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cancelUuid.trim())) {
      setCancelErr('Con el motivo ' + cancelMotivo + ' escribe el folio fiscal (UUID) completo de la factura que sustituye a esta.');
      return;
    }
    setCancelando(true);
    setCancelErr('');
    try {
      const j = await llamarApi('cancelar_cfdi', {
        cobro_id: cancelCobro.id,
        motivo: cancelMotivo,
        uuid_sustitucion: necesitaUuid ? cancelUuid.trim() : ''
      });
      if (!j || !j.success) throw new Error((j && j.error) || 'No se pudo cancelar la factura.');
      aplicarEstadoCancelacion(cancelCobro.id, j.estado);
      cargarCanceladas();
      cargarComplementos();
      setCancelCobro(null);
      alert(j.mensaje || 'Solicitud enviada.');
    } catch (e) {
      setCancelErr(e.message);
    } finally {
      setCancelando(false);
    }
  };
  const actualizarCancelacion = async cobro => {
    setActualizandoCanc(cobro.id);
    try {
      const j = await llamarApi('cancelar_cfdi_actualizar', { cobro_id: cobro.id });
      if (!j || !j.success) { alert((j && j.error) || 'No se pudo consultar el estado.'); return; }
      aplicarEstadoCancelacion(cobro.id, j.estado);
      cargarCanceladas();
      cargarComplementos();
      alert(j.mensaje || '');
    } catch (e) {
      alert('No se pudo consultar el estado: ' + e.message);
    } finally {
      setActualizandoCanc(null);
    }
  };

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [formFact, setFormFact] = useState({
    rfc: '',
    razon_social: '',
    uso_cfdi: 'D10',
    regimen: '616',
    email: '',
    cp_receptor: '',
    domicilio: '',
    // Complemento IEDU (Instituciones Educativas Privadas) — Facturapi
    nombre_alumno: '',
    curp_alumno: '',
    nivel_educativo: '',
    rvoe: ''
  });
  // Antes el filtro era solo `c.estado === 'pagado'`, y eso dejaba FUERA de
  // Facturación todo cobro abonado parcialmente: un cobro con abonos se queda
  // en 'pendiente' hasta quedar cubierto (lib/helpers_pagos.php solo lo pasa a
  // 'pagado' cuando $cubierto; no existe un estado 'parcial'). El avance vive
  // en la columna cacheada cobros.monto_pagado y en el ledger cobro_abonos.
  //
  // Fiscalmente esos cobros SÍ deben facturarse, y el backend ya sabe hacerlo
  // solo: acciones/generar_cfdi.php emite PPD con forma de pago '99' cuando el
  // cobro no está cubierto, y PUE cuando sí. Ese camino ya existía pero era
  // inalcanzable desde la interfaz, porque el único botón de "Generar CFDI" se
  // pinta a partir de esta lista.
  //
  // El criterio de "tiene avance" es el mismo que ya usa views/Cobros.js para
  // su indicador de "Abonado X de Y".
  const cobrosEscuela = data.cobros.filter(c =>
    c.estado === 'pagado' || Number(c.monto_pagado || 0) > 0);
  const pendientesFact = cobrosEscuela.filter(c => !c.factura_cfdi);
  const emitidas = cobrosEscuela.filter(c => c.factura_cfdi);
  const USO_CFDI = {
    'D10': 'D10 — Pagos por servicios educativos (recomendado)',
    'G01': 'G01 — Adquisición de mercancias',
    'G03': 'G03 — Gastos en general',
    'D01': 'D01 — Honorarios médicos',
    'S01': 'S01 — Sin efectos fiscales'
  };
  const REGIMENES = {
    '616': '616 — Sin obligaciones fiscales (personas físicas)',
    '601': '601 — General Personas Morales',
    '612': '612 — Personas Físicas con Actividades Empresariales',
    '626': '626 — RESICO'
  };
  const NIVELES_EDUCATIVOS_SAT = ['Preescolar', 'Primaria', 'Secundaria', 'Profesional técnico', 'Bachillerato o su equivalente'];
  const abrirSolicitar = cobro => {
    // Bug fix: buscar cliente por cliente_id; si es null (cobro sin cliente),
    // intentar por nombre como fallback, y si tampoco, dejar form vacío.
    let cli = cobro.cliente_id ? data.clientes.find(c => c.id === cobro.cliente_id) : data.clientes.find(c => c.nombre === cobro.cliente);

    // El dato fiscal (RFC/razón social) vive a nivel FAMILIA (el tutor que
    // paga, compartido entre todos sus hijos), no por alumno — por eso la
    // familia tiene prioridad sobre cualquier rfc_factura que haya quedado
    // en el alumno de un timbrado antiguo (de antes de este cambio), que si
    // no se ignora, un hermano con una factura vieja "gana" sobre el dato
    // real y compartido de la familia.
    if (cli?.familia_id) {
      const fam = data.familias?.find(f => f.id === cli.familia_id);
      if (fam?.rfc_factura) {
        cli = {
          ...cli,
          ...fam
        };
      }
    }
    const tieneDatos = !!(cli?.rfc_factura && cli?.razon_social_factura && cli?.cp_factura);
    setCobroSel(cobro);
    setFormFact({
      rfc: cli?.rfc_factura || '',
      razon_social: cli?.razon_social_factura || '',
      cp_receptor: cli?.cp_factura || '',
      domicilio: cli?.domicilio_factura || '',
      regimen: cli?.regimen_factura || '616',
      uso_cfdi: cli?.uso_cfdi_defecto || 'D10',
      email: cli?.email || '',
      _preLlenado: tieneDatos, // bandera interna para mostrar/ocultar el banner
      // IEDU: se prellena con lo que ya tenga el alumno; si falta algo
      // (nivel educativo o RVOE nuevos en el catálogo), queda editable.
      nombre_alumno: cli?.nombre || '',
      curp_alumno: cli?.curp || '',
      nivel_educativo: cli?.nivel_educativo_sat || '',
      rvoe: cli?.rvoe || escuela?.rvoe || ''
    });
    setErrMsg('');
    setComplementosVisor(null); // por si quedaba abierto: solo un modal a la vez
    setModal('solicitar');
  };
  const generarCFDI = async () => {
    if (!formFact.rfc || !formFact.razon_social || !formFact.cp_receptor) {
      setErrMsg('RFC, Razón Social y Código Postal son obligatorios');
      return;
    }
    const rfcReg = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
    if (!rfcReg.test(formFact.rfc)) {
      setErrMsg('RFC inválido. Ejemplo válido: XAXX010101000');
      return;
    }
    setLoading(true);
    setErrMsg('');
    try {
      const token = AuthController.getToken ? AuthController.getToken() : '';
      const res = await fetch('api.php?action=generar_cfdi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          cobro_id: cobroSel.id,
          rfc: formFact.rfc,
          razon_social: formFact.razon_social,
          cp_receptor: formFact.cp_receptor,
          domicilio: formFact.domicilio,
          // <-- domicilio fiscal
          uso_cfdi: formFact.uso_cfdi,
          regimen: formFact.regimen,
          email: formFact.email,
          total: cobroSel.total,
          descripcion: ((cobroSel.items || []).map(i => i.nombre).filter(Boolean).join(', ')) || 'Servicios educativos',
          escuela_rfc: escuela?.rfc || 'EDU000101AAA',
          escuela_nombre: escuela?.nombre || 'EduPago S.C.',
          // Complemento IEDU — si se deja vacío el backend lo omite y timbra
          // sin complemento (evita bloquear el CFDI por un dato faltante).
          nombre_alumno: formFact.nombre_alumno,
          curp_alumno: formFact.curp_alumno,
          nivel_educativo: formFact.nivel_educativo,
          rvoe: formFact.rvoe
        })
      });
      const cfdi = await res.json();
      if (!cfdi.success) throw new Error(cfdi.error || 'Error al generar CFDI');
      if (cfdi.advertencia) alert(cfdi.advertencia); // [OF-2] total timbrado distinto al del cobro
      const newCobros = data.cobros.map(c => c.id === cobroSel.id ? {
        ...c,
        factura: true,
        factura_cfdi: {
          uuid: cfdi.uuid,
          folio_fiscal: cfdi.folio_fiscal,
          serie: cfdi.serie,
          folio: cfdi.folio,
          fecha_timbrado: cfdi.fecha_timbrado,
          subtotal: cfdi.subtotal,
          iva: cfdi.iva,
          total: cfdi.total,
          rfc_receptor: formFact.rfc,
          razon: formFact.razon_social,
          uso_cfdi: formFact.uso_cfdi,
          cp_receptor: formFact.cp_receptor,
          // <-- GUARDAR EN EL ESTADO
          email: formFact.email,
          xml: cfdi.xml,
          // Facturapi no devuelve el XML en crudo en la respuesta inicial. Te sugiero ignorar esto o cambiar el flujo de descarga (ver más abajo)
          qr_url: cfdi.qr_url,
          facturapi_id: cfdi.facturapi_id // <-- GUARDAR EL ID DE FACTURAPI
        }
      } : c);
      const newData = {
        ...data,
        cobros: newCobros
      };
      setData(newData);
      AppModel.save(newData);
      setCfdiVisor({
        ...cfdi,
        rfc_receptor: formFact.rfc,
        razon: formFact.razon_social,
        cobro: cobroSel
      });
      setComplementosVisor(null); // por si quedaba abierto: solo un modal a la vez
      setModal('visor');
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── DESCARGAR XML Y PDF DESDE FACTURAPI (vía nuestro backend, autenticado) ───
  const descargarDocumento = async (cobro, tipo) => {
    // tipo = 'xml' o 'pdf'
    if (!cobro.factura_cfdi && !cobro.facturapi_id) {
      alert("Este CFDI es simulado o antiguo y no tiene ID de Facturapi");
      return;
    }
    try {
      const token = AuthController.getToken();
      const params = new URLSearchParams({ action: 'descargar_cfdi', cobro_id: cobro.id, tipo });
      const res = await fetch('api.php?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      // Chequeo doble: por status Y por Content-Type real. Si el backend
      // regresa un error (aunque venga con HTTP 200 por accidente), el
      // Content-Type sigue siendo JSON — así nunca se descarga un JSON de
      // error disfrazado de PDF/XML.
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('application/json')) {
        const json = await res.json().catch(() => null);
        alert('No se pudo descargar: ' + (json?.error || 'Error desconocido'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cfdi-${cobro.folio || cobro.id}.${tipo}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error de conexión al descargar: ' + e.message);
    }
  };
  const filtrar = lista => !q ? lista : lista.filter(c => c.cliente.toLowerCase().includes(q.toLowerCase()) || c.folio.toLowerCase().includes(q.toLowerCase()));
  // Paginación de las dos listas (25-sep-2026). Con 120 cobros por facturar la
  // tabla se volvía un scroll interminable y no había forma de llegar al final
  // sin rodar. Se usa el hook que ya existe (views/components/Paginador.js),
  // el mismo que usan las demás listas locales del sistema.
  //
  // Se paginan las listas YA FILTRADAS: paginar antes de filtrar daría páginas
  // con huecos —una página de 25 que muestra 3 porque el resto no pasó el
  // filtro— y el contador de páginas mentiría.
  const pendFiltrados = filtrar(pendientesFact);
  const emitFiltradas = filtrar(emitidas);
  const pgPend = usePaginacion(pendFiltrados, 25);
  const pgEmit = usePaginacion(emitFiltradas, 25);
  // [OF-2] Vista previa del IVA del comprobante. Si los renglones del cobro
  // traen su tasa (snapshot), solo los de 16% causan IVA y las becas se
  // reparten en proporción; sin snapshot es lo de siempre (todo al 16%). Es
  // aproximado: el cálculo real, al centavo, lo hace el servidor al timbrar.
  const vistaIvaTodos16 = cobro => {
    const its = cobro.items || [];
    return !its.length || its.some(i => i.iva_tasa == null) || its.every(i => String(i.iva_tasa) === '16');
  };
  const vistaIva = cobro => {
    const its = cobro.items || [];
    if (vistaIvaTodos16(cobro)) return cobro.total - cobro.total / 1.16;
    const pos = its.filter(i => Number(i.subtotal) > 0);
    const posSuma = pos.reduce((a, i) => a + Number(i.subtotal), 0);
    const desc = its.filter(i => Number(i.subtotal) < 0).reduce((a, i) => a - Number(i.subtotal), 0);
    if (posSuma <= 0) return 0;
    const bruto16 = pos.filter(i => String(i.iva_tasa) === '16').reduce((a, i) => a + Number(i.subtotal), 0) * (1 - desc / posSuma);
    return bruto16 - bruto16 / 1.16;
  };
  // [OF-2] Modal "Cancelar factura": explica los 4 motivos del SAT en lenguaje claro.
  const cancelModalEl = cancelCobro && /*#__PURE__*/_jsxDEV("div", {
    className: "modal-backdrop",
    onClick: e => e.target === e.currentTarget && !cancelando && setCancelCobro(null),
    children: /*#__PURE__*/_jsxDEV("div", {
      className: "modal modal-lg",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "modal-header",
        children: /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", { className: "modal-title", children: "Cancelar factura" }, 't', false),
          /*#__PURE__*/_jsxDEV("div", {
            style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 },
            children: [cancelCobro.folio, ' · ', cancelCobro.cliente, ' · ', cancelCobro.factura_cfdi?.uuid]
          }, 's', true)]
        }, void 0, true)
      }, 'h', false), /*#__PURE__*/_jsxDEV("div", {
        className: "modal-body",
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: { padding: '10px 14px', marginBottom: 12, background: 'var(--bg-2, rgba(0,0,0,.04))', borderRadius: 'var(--radius-sm)', fontSize: 12.5, lineHeight: 1.5 },
          children: "Cancelar la factura ante el SAT NO cancela el cobro ni mueve dinero: el cobro queda como está y podrás facturarlo de nuevo. Según el caso, el receptor tendrá que aceptar la cancelación; mientras no lo haga, la factura sigue vigente. Si ya emitiste complementos de pago de esta factura, primero hay que cancelarlos."
        }, 'aviso', false), cancelErr && /*#__PURE__*/_jsxDEV("div", {
          style: { marginBottom: 12, padding: '10px 14px', background: 'var(--red-glow)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--red)' },
          children: cancelErr
        }, 'err', false), /*#__PURE__*/_jsxDEV("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 }, children: "¿Por qué se cancela?" }, 'q', false),
        MOTIVOS_CANCELACION.map(m => /*#__PURE__*/_jsxDEV("label", {
          style: {
            display: 'block', cursor: 'pointer', padding: '8px 10px', marginBottom: 6, borderRadius: 'var(--radius-sm)',
            border: '1px solid ' + (cancelMotivo === m.id ? 'var(--accent, #bdcf00)' : 'var(--border, #e5e7eb)')
          },
          children: [/*#__PURE__*/_jsxDEV("input", {
            type: "radio", name: "motivo_cancelacion", checked: cancelMotivo === m.id,
            onChange: () => setCancelMotivo(m.id), style: { marginRight: 8 }
          }, 'r', false), /*#__PURE__*/_jsxDEV("strong", { style: { fontSize: 13 }, children: m.titulo }, 'n', false),
          /*#__PURE__*/_jsxDEV("div", { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 3, marginLeft: 22, lineHeight: 1.45 }, children: m.texto }, 'd', false)]
        }, m.id, true)),
        (cancelMotivo === '01' || cancelMotivo === '04') && /*#__PURE__*/_jsxDEV("div", {
          className: "form-group",
          style: { marginTop: 8 },
          children: [/*#__PURE__*/_jsxDEV("label", { className: "form-label", children: "Folio fiscal (UUID) de la factura que la sustituye *" }, 'l', false),
          /*#__PURE__*/_jsxDEV("input", {
            className: "form-input", style: { fontFamily: 'var(--mono)', fontSize: 12 },
            placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            value: cancelUuid, onChange: e => setCancelUuid(e.target.value)
          }, 'i', false)]
        }, 'uuid', true)]
      }, 'b', true), /*#__PURE__*/_jsxDEV("div", {
        className: "modal-footer",
        children: [/*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-secondary", disabled: cancelando,
          onClick: () => setCancelCobro(null), children: "No cancelar"
        }, 'no', false), /*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-primary", disabled: cancelando,
          onClick: confirmarCancelar, children: cancelando ? 'Enviando al SAT…' : 'Cancelar factura'
        }, 'si', false)]
      }, 'f', true)]
    }, void 0, true)
  }, 'modal-cancelar', false);
  return /*#__PURE__*/_jsxDEV("div", {
    children: [
    // ── Franja de cabecera ───────────────────────────────────────────────
    //
    // Historia corta, porque tuvo dos intentos fallidos y conviene no repetirlos:
    //
    //   1. Original: franja con degradado azul-índigo a mano (#1e3a8a ->
    //      #312e81) y texto blanco. La ESTRUCTURA era buena —título a la
    //      izquierda, cifras a la derecha, todo en una sola banda— pero esos
    //      azules no existen en la paleta y no reaccionaban al tema: en modo
    //      claro quedaba un bloque oscuro en medio de una pantalla clara.
    //   2. Segundo intento: quitar la franja y dejar una línea de texto suelta
    //      con las cifras en stats-grid. Peor: .stats-grid estira dos tarjetas
    //      a todo el ancho (dos números chicos en dos cajas enormes) y sin la
    //      banda la pantalla perdía toda jerarquía.
    //
    // Esto conserva la estructura del original y cambia SOLO los colores por
    // tokens del tema. Las cifras se quedan: sí dicen algo que las pestañas no
    // —"cuánto llevas emitido" frente a "qué pestaña estoy viendo"— y a la
    // derecha aprovechan el ancho que antes quedaba vacío.
    /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      style: {
        marginBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16
      },
      children: [
        /*#__PURE__*/_jsxDEV("div", {
          style: { display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 },
          children: [
            // Cuadro con el acento de marca en vez del icono suelto: le da
            // peso a la franja sin recurrir a un fondo de color inventado.
            /*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 46, height: 46, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 'var(--radius)',
                background: 'var(--accent-glow, var(--glass-light))'
              },
              children: /*#__PURE__*/_jsxDEV(Icon, { name: "facturacion2", size: 24, color: "var(--accent)" }, 'ic', false)
            }, 'box', false),
            /*#__PURE__*/_jsxDEV("div", {
              style: { minWidth: 0 },
              children: [
                /*#__PURE__*/_jsxDEV("div", { style: { fontWeight: 700, fontSize: 16, color: 'var(--ink)' }, children: "Facturación" }, 't', false),
                /*#__PURE__*/_jsxDEV("div", { style: { fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }, children: "Genera y administra tus comprobantes fiscales" }, 's', false)
              ]
            }, 'tx', true)
          ]
        }, 'izq', true),
        /*#__PURE__*/_jsxDEV("div", {
          style: { display: 'flex', gap: 10, flexWrap: 'wrap' },
          children: [
            { label: 'Emitidas',    val: emitidas.length,       alerta: false },
            { label: 'Sin factura', val: pendientesFact.length, alerta: pendientesFact.length > 0 }
          ].map((s, i) => /*#__PURE__*/_jsxDEV("div", {
            style: {
              minWidth: 96, textAlign: 'center',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--glass-light)',
              border: '1px solid var(--border-glow)'
            },
            children: [
              /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)',
                  // Ámbar solo cuando de verdad hay algo sin facturar. Antes
                  // este número estaba SIEMPRE en #fbbf24, avisara o no.
                  color: s.alerta ? 'var(--amber)' : 'var(--ink)'
                },
                children: s.val
              }, 'v', false),
              /*#__PURE__*/_jsxDEV("div", {
                style: { fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 },
                children: s.label
              }, 'l', false)
            ]
          }, i, true))
        }, 'der', false)
      ]
    }, void 0, true),
    // Pestañas con las clases de botón del sistema, como en views/Comisiones.js
    // (25-sep-2026).
    //
    // Antes eran botones con esquinas redondeadas Y ADEMÁS una barra de 2px
    // debajo del activo: las dos formas se peleaban —una raya recta colgando
    // de una pastilla redonda— y encima el contenedor llevaba su propia línea
    // inferior, así que había tres bordes distintos en la misma franja.
    // Ahora el activo simplemente se llena, que es como se ve en el resto.
    /*#__PURE__*/_jsxDEV("div", {
      style: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
      children: [
        { id: 'pendientes', label: 'Por facturar', n: pendientesFact.length },
        { id: 'emitidas',   label: 'Emitidas',     n: emitidas.length },
        { id: 'complementos', label: 'Complementos pendientes', n: complementos.length },
        // [OF-2] Historial de facturas canceladas (solo admin / superadmin).
        ...(puedeCancelar ? [{ id: 'canceladas', label: 'Canceladas', n: canceladas.length }] : [])
      ].map(t => /*#__PURE__*/_jsxDEV("button", {
        className: 'btn btn-sm ' + (tab === t.id ? 'btn-primary' : 'btn-secondary'),
        onClick: () => setTab(t.id),
        children: [t.label, ' (', t.n, ')']
      }, t.id, true))
    }, void 0, false),
    tab === 'pendientes' && /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Cobros sin factura"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "card-sub",
            // "pagados" ya no describe la lista: ahora también entran los
            // cobros con abonos parciales, que se facturan como PPD.
            children: [pendientesFact.length, " cobros por facturar"]
          }, void 0, true)]
        }, void 0, true),
        typeof Paginacion !== 'undefined' ? /*#__PURE__*/_jsxDEV(Paginacion, {
          pagina: pgPend.n,
          totalPaginas: pgPend.totalPaginas,
          onCambiar: pgPend.ir,
          etiqueta: pgPend.total + ' cobros'
        }, 'pag', false) : null
      ]
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "search-bar",
        style: {
          marginBottom: 16
        },
        children: [/*#__PURE__*/_jsxDEV("span", {
          className: "search-icon",
          children: /*#__PURE__*/_jsxDEV(Icon, {
            name: "search",
            size: 15,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
          placeholder: "Buscar por folio o cliente…",
          value: q,
          onChange: e => setQ(e.target.value)
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap cards-mobile",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("th", {
                children: "Folio"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Fecha"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Cliente"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Método"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Total"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Acción"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: [pgPend.total === 0 && /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", {
                colSpan: 6,
                children: /*#__PURE__*/_jsxDEV("div", {
                  className: "empty-state",
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    className: "empty-icon",
                    children: /*#__PURE__*/_jsxDEV(Icon, {
                      name: "check",
                      size: 36,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    className: "empty-text",
                    children: "¡Todo facturado!"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)
            }, void 0, false), pgPend.pagina.map(c => /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("td", {
                "data-label": "Folio",
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  },
                  children: c.folio
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                "data-label": "Fecha",
                style: {
                  color: 'var(--ink-3)',
                  fontSize: 12
                },
                children: c.fecha
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                "data-label": "Cliente",
                style: {
                  fontSize: 13
                },
                children: c.cliente
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                "data-label": "Método",
                children: /*#__PURE__*/_jsxDEV(MetodoBadge, {
                  metodo: c.metodo
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                "data-label": "Total",
                children: [/*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontWeight: 600
                  },
                  children: fmt(c.total)
                }, 'total', false),
                // Un cobro con abonos se ve aquí IGUAL que uno pagado completo:
                // mismo importe, mismo botón. Sin esta marca no hay forma de
                // distinguirlos desde esta pantalla, y la diferencia importa,
                // porque este se timbra como PPD y después le seguirán
                // complementos de pago por cada abono. El importe que se
                // factura sigue siendo el TOTAL, no lo abonado.
                // Mismo criterio e idéntico formato que views/Cobros.js, para
                // que la marca se lea igual en las dos pantallas.
                (Number(c.monto_pagado) > 0 && c.estado !== 'pagado') ? /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 11,
                    color: 'var(--amber)',
                    fontFamily: 'var(--mono)',
                    marginTop: 2
                  },
                  title: 'Abonado ' + fmt(c.monto_pagado) + ' de ' + fmt(c.total) + ' — se facturará como PPD y cada abono necesitará su complemento de pago',
                  children: 'faltan ' + fmt(Number(c.total) - Number(c.monto_pagado)) + ' · PPD'
                }, 'abono', false) : null]
              }, void 0, true), /*#__PURE__*/_jsxDEV("td", {
                "data-label": "Acción",
                children: /*#__PURE__*/_jsxDEV("button", {
                  className: "btn btn-primary btn-sm",
                  onClick: () => abrirSolicitar(c),
                  children: "Generar CFDI"
                }, void 0, false)
              }, void 0, false)]
            }, c.id, true))]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true),
    tab === 'complementos' && /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [
        /*#__PURE__*/_jsxDEV("div", {
          className: "card-header",
          children: /*#__PURE__*/_jsxDEV("div", {
            children: [
              /*#__PURE__*/_jsxDEV("div", { className: "card-title", children: "Complementos de pago pendientes" }, 't', false),
              /*#__PURE__*/_jsxDEV("div", { className: "card-sub", children: "Abonos de facturas PPD que todavía no tienen su CFDI de pago. Mientras falten, el SAT no registra esos cobros." }, 's', false)
            ]
          }, 'h', true)
        }, 'ch', false),
        compAviso ? /*#__PURE__*/_jsxDEV("div", {
          style: { fontSize: 12.5, color: 'var(--ink-3)', padding: '10px 0' },
          children: compAviso
        }, 'av', false) : null,
        complementos.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
          className: "empty-state",
          children: [
            /*#__PURE__*/_jsxDEV("div", { className: "empty-icon", children: /*#__PURE__*/_jsxDEV(Icon, { name: "check", size: 34, color: "currentColor" }, 'i', false) }, 'ic', false),
            /*#__PURE__*/_jsxDEV("div", { className: "empty-text", children: "Todo al corriente. Ninguna factura PPD tiene pagos sin registrar." }, 't', false)
          ]
        }, 'vacio', true) : /*#__PURE__*/_jsxDEV("div", {
          className: "table-wrap cards-mobile",
          children: /*#__PURE__*/_jsxDEV("table", {
            children: [
              /*#__PURE__*/_jsxDEV("thead", {
                children: /*#__PURE__*/_jsxDEV("tr", {
                  children: [
                    /*#__PURE__*/_jsxDEV("th", { children: "Fecha" }, 'a', false),
                    /*#__PURE__*/_jsxDEV("th", { children: "Cobro" }, 'b', false),
                    /*#__PURE__*/_jsxDEV("th", { children: "Alumno" }, 'c', false),
                    /*#__PURE__*/_jsxDEV("th", { children: "Método" }, 'd', false),
                    /*#__PURE__*/_jsxDEV("th", { style: { textAlign: 'right' }, children: "Abono" }, 'e', false),
                    /*#__PURE__*/_jsxDEV("th", {}, 'f', false)
                  ]
                }, 'tr', true)
              }, 'th', false),
              /*#__PURE__*/_jsxDEV("tbody", {
                children: complementos.map(ab => /*#__PURE__*/_jsxDEV("tr", {
                  children: [
                    /*#__PURE__*/_jsxDEV("td", { "data-label": "Fecha", style: { whiteSpace: 'nowrap' }, children: String(ab.creado_en || '').slice(0, 10) }, 'a', false),
                    /*#__PURE__*/_jsxDEV("td", { "data-label": "Cobro", style: { fontFamily: 'var(--mono)', fontSize: 11.5 }, children: ab.folio || ab.cobro_folio /* [OF-3] folio propio del abono */ }, 'b', false),
                    /*#__PURE__*/_jsxDEV("td", { "data-label": "Alumno", children: ab.cliente }, 'c', false),
                    /*#__PURE__*/_jsxDEV("td", { "data-label": "Método", children: ab.metodo || '—' }, 'd', false),
                    /*#__PURE__*/_jsxDEV("td", { "data-label": "Abono", style: { textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }, children: '$' + Number(ab.monto).toFixed(2) }, 'e', false),
                    /*#__PURE__*/_jsxDEV("td", {
                      style: { textAlign: 'right' },
                      children: /*#__PURE__*/_jsxDEV("button", {
                        className: "btn btn-primary btn-sm",
                        disabled: emitiendoComp === ab.id,
                        onClick: () => emitirComplemento(ab),
                        children: emitiendoComp === ab.id ? 'Emitiendo…' : 'Emitir complemento'
                      }, 'btn', false)
                    }, 'f', false)
                  ]
                }, ab.id, true))
              }, 'tb', false)
            ]
          }, 'tbl', true)
        }, 'tabla', false)
      ]
    }, void 0, true),
    tab === 'emitidas' && /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "card-title",
          children: "CFDIs emitidos"
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "card-sub",
          children: [emitidas.length, " facturas generadas"]
        }, void 0, true),
        typeof Paginacion !== 'undefined' ? /*#__PURE__*/_jsxDEV(Paginacion, {
          pagina: pgEmit.n,
          totalPaginas: pgEmit.totalPaginas,
          onCambiar: pgEmit.ir,
          etiqueta: pgEmit.total + ' facturas'
        }, 'pag', false) : null]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap cards-mobile",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("th", {
                children: "Folio"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Cliente / RFC"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "UUID Fiscal"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Fecha"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Total"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Acciones"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: [emitidas.length === 0 && /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", {
                colSpan: 6,
                children: /*#__PURE__*/_jsxDEV("div", {
                  className: "empty-state",
                  children: /*#__PURE__*/_jsxDEV("div", {
                    className: "empty-text",
                    children: "Sin facturas emitidas aún"
                  }, void 0, false)
                }, void 0, false)
              }, void 0, false)
            }, void 0, false), pgEmit.pagina.map(c => /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("td", {
                "data-label": "Folio",
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  },
                  children: c.folio
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                "data-label": "Cliente / RFC",
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 13,
                    fontWeight: 500
                  },
                  children: c.cliente
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 11,
                    color: 'var(--ink-4)',
                    fontFamily: 'var(--mono)'
                  },
                  children: c.factura_cfdi?.rfc_receptor
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("td", {
                "data-label": "UUID Fiscal",
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 10.5,
                    color: 'var(--ink-3)'
                  },
                  children: [c.factura_cfdi?.uuid?.slice(0, 18), "…"]
                }, void 0, true)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                "data-label": "Fecha",
                style: {
                  fontSize: 12,
                  color: 'var(--ink-3)'
                },
                children: c.factura_cfdi?.fecha_timbrado?.slice(0, 10)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                "data-label": "Total",
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontWeight: 600,
                    color: 'var(--green)'
                  },
                  children: fmt(c.total)
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                "data-label": "Acciones",
                children: /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    display: 'flex',
                    gap: 5
                  },
                  children: [/*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => {
                      setCfdiVisor({
                        ...c.factura_cfdi,
                        cobro: c
                      });
                      setModal('visor');
                    },
                    children: "Ver"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => descargarDocumento(c, 'xml'),
                    children: "⬇ XML"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => descargarDocumento(c, 'pdf'),
                    children: "⬇ PDF"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => verComplementosCobro(c),
                    title: "Ver los complementos de pago (CFDI de pago) ya emitidos para los abonos de este cobro",
                    children: "Complementos"
                  }, void 0, false),
                  // [OF-2] Cancelación: pendiente → badge + actualizar; si no → botón cancelar.
                  puedeCancelar && c.factura_cfdi?.cancelacion_estado === 'pendiente' && /*#__PURE__*/_jsxDEV("span", {
                    style: { fontSize: 11, color: 'var(--amber)', alignSelf: 'center', whiteSpace: 'nowrap' },
                    title: "El SAT espera que el receptor acepte la cancelación; la factura sigue vigente.",
                    children: "Cancelación pendiente"
                  }, 'cp', false),
                  puedeCancelar && c.factura_cfdi?.cancelacion_estado === 'pendiente' && /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    disabled: actualizandoCanc === c.id,
                    onClick: () => actualizarCancelacion(c),
                    children: actualizandoCanc === c.id ? '…' : 'Actualizar estado'
                  }, 'ua', false),
                  puedeCancelar && c.factura_cfdi?.cancelacion_estado !== 'pendiente' && /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    style: { color: 'var(--red)' },
                    onClick: () => abrirCancelar(c),
                    title: "Cancela la factura ante el SAT. No cancela el cobro ni mueve dinero.",
                    children: "Cancelar factura"
                  }, 'cc', false)]
                }, void 0, true)
              }, void 0, false)]
            }, c.id, true))]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true), tab === 'canceladas' && puedeCancelar && /*#__PURE__*/_jsxDEV("div", {
      // [OF-2] Historial de facturas canceladas (incluye solicitudes pendientes).
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", { className: "card-title", children: "Facturas canceladas" }, 't', false),
        /*#__PURE__*/_jsxDEV("div", { className: "card-sub", children: "Cancelar una factura no cancela el cobro ni mueve dinero." }, 's', false)]
      }, 'h', true), cancAviso && /*#__PURE__*/_jsxDEV("div", {
        style: { padding: '8px 14px', fontSize: 12, color: 'var(--amber)' },
        children: cancAviso
      }, 'av', false), /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap cards-mobile",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: ['Fecha', 'Cobro', 'Folio fiscal', 'Receptor', 'Total', 'Motivo', 'Estado', 'Usuario']
                .map(h => /*#__PURE__*/_jsxDEV("th", { children: h }, h, false))
            }, void 0, false)
          }, 'th', false), /*#__PURE__*/_jsxDEV("tbody", {
            children: [canceladas.length === 0 && /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", {
                colSpan: 8,
                children: /*#__PURE__*/_jsxDEV("div", { className: "empty-state", children: /*#__PURE__*/_jsxDEV("div", { className: "empty-text", children: "Sin facturas canceladas" }, void 0, false) }, void 0, false)
              }, void 0, false)
            }, 'vacio', false), canceladas.map(f => /*#__PURE__*/_jsxDEV("tr", {
              children: [
                /*#__PURE__*/_jsxDEV("td", { "data-label": "Fecha", style: { fontSize: 12, color: 'var(--ink-3)' }, children: (f.cancelada_en || '').slice(0, 16) }, 'a', false),
                /*#__PURE__*/_jsxDEV("td", { "data-label": "Cobro", style: { fontFamily: 'var(--mono)', fontSize: 12 }, children: f.cobro_folio || ('#' + f.cobro_id) }, 'b', false),
                /*#__PURE__*/_jsxDEV("td", { "data-label": "Folio fiscal", style: { fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }, title: f.uuid || '', children: (f.uuid || '').slice(0, 18) + '…' }, 'c', false),
                /*#__PURE__*/_jsxDEV("td", { "data-label": "Receptor", style: { fontFamily: 'var(--mono)', fontSize: 11 }, children: f.rfc_receptor || '' }, 'd', false),
                /*#__PURE__*/_jsxDEV("td", { "data-label": "Total", style: { fontFamily: 'var(--mono)' }, children: f.total != null ? fmt(f.total) : '' }, 'e', false),
                /*#__PURE__*/_jsxDEV("td", { "data-label": "Motivo", style: { fontSize: 12 }, title: f.sustitucion_uuid ? 'Sustituida por ' + f.sustitucion_uuid : '', children: f.motivo + (f.sustitucion_uuid ? ' → ' + f.sustitucion_uuid.slice(0, 8) + '…' : '') }, 'f', false),
                /*#__PURE__*/_jsxDEV("td", { "data-label": "Estado", style: { fontSize: 12, color: f.estado === 'canceled' ? 'var(--green)' : 'var(--amber)' }, children: ESTADO_CANC[f.estado] || f.estado }, 'g', false),
                /*#__PURE__*/_jsxDEV("td", { "data-label": "Usuario", style: { fontSize: 12, color: 'var(--ink-3)' }, children: f.usuario || '' }, 'h', false)
              ]
            }, f.id, true))]
          }, 'tb', true)]
        }, void 0, true)
      }, 'tbl', false)]
    }, 'canceladas', true), modal === 'solicitar' && cobroSel && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "modal-title",
              children: "Generar factura"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--ink-3)',
                marginTop: 2
              },
              children: [cobroSel.folio, " · ", cobroSel.cliente, " · ", /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontFamily: 'var(--mono)'
                },
                children: fmt(cobroSel.total)
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setModal(null),
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "close",
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [errMsg && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--red-glow)',
              border: '1px solid var(--red)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              color: 'var(--red)'
            },
            children: errMsg
          }, void 0, false), formFact._preLlenado && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--green-glow)',
              border: '1px solid rgba(16,185,129,.25)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--green)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            },
            children: "Datos fiscales pre-llenados desde el perfil del cliente. Verifica antes de generar."
          }, void 0, false), !formFact._preLlenado && cobroSel && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--amber-glow)',
              border: '1px solid rgba(245,158,11,.25)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--amber)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            },
            children: "Este cliente no tiene datos fiscales guardados. Llena el formulario o registra sus datos en Clientes → ."
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "RFC del receptor *"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "XAXX010101000",
                value: formFact.rfc,
                onChange: e => setFormFact(f => ({
                  ...f,
                  rfc: e.target.value.toUpperCase().replace(/\s/g, '')
                })),
                style: {
                  fontFamily: 'var(--mono)',
                  letterSpacing: 1
                }
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10.5,
                  color: 'var(--ink-4)',
                  marginTop: 3
                },
                children: "Público en general: XAXX010101000"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Código Postal *"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "Ej. 97000",
                value: formFact.cp_receptor,
                onChange: e => setFormFact(f => ({
                  ...f,
                  cp_receptor: e.target.value
                })),
                style: {
                  fontFamily: 'var(--mono)'
                }
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              style: {
                gridColumn: '1/-1'
              },
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Razón social *"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "NOMBRE COMPLETO O RAZÓN SOCIAL",
                value: formFact.razon_social,
                onChange: e => setFormFact(f => ({
                  ...f,
                  razon_social: e.target.value.toUpperCase()
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              style: {
                gridColumn: '1/-1'
              },
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Domicilio fiscal"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "Calle, Número, Colonia, Ciudad, Estado, CP",
                value: formFact.domicilio,
                onChange: e => setFormFact(f => ({
                  ...f,
                  domicilio: e.target.value
                }))
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10.5,
                  color: 'var(--ink-4)',
                  marginTop: 3
                },
                children: "Opcional — se imprime en el comprobante"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Correo para envío"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                type: "email",
                placeholder: "padre@mail.com",
                value: formFact.email,
                onChange: e => setFormFact(f => ({
                  ...f,
                  email: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Uso del CFDI"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                className: "form-select",
                value: formFact.uso_cfdi,
                onChange: e => setFormFact(f => ({
                  ...f,
                  uso_cfdi: e.target.value
                })),
                children: Object.entries(USO_CFDI).map(([k, v]) => /*#__PURE__*/_jsxDEV("option", {
                  value: k,
                  children: v
                }, k, false))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Régimen fiscal del receptor"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                className: "form-select",
                value: formFact.regimen,
                onChange: e => setFormFact(f => ({
                  ...f,
                  regimen: e.target.value
                })),
                children: Object.entries(REGIMENES).map(([k, v]) => /*#__PURE__*/_jsxDEV("option", {
                  value: k,
                  children: v
                }, k, false))
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 14,
              paddingTop: 14,
              borderTop: '1px dashed var(--border-glow)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--ink-3)',
                marginBottom: 8
              },
              children: "Complemento IEDU (instituciones educativas privadas) — requerido para deducibilidad de colegiaturas"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "form-grid",
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Nombre del alumno"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "Nombre completo del alumno",
                  value: formFact.nombre_alumno,
                  onChange: e => setFormFact(f => ({
                    ...f,
                    nombre_alumno: e.target.value
                  }))
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "CURP del alumno"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "18 caracteres",
                  maxLength: 18,
                  value: formFact.curp_alumno,
                  onChange: e => setFormFact(f => ({
                    ...f,
                    curp_alumno: e.target.value.toUpperCase()
                  }))
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Nivel educativo"
                }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                  className: "form-select",
                  value: formFact.nivel_educativo,
                  onChange: e => setFormFact(f => ({
                    ...f,
                    nivel_educativo: e.target.value
                  })),
                  children: [/*#__PURE__*/_jsxDEV("option", {
                    value: "",
                    children: "— Seleccionar —"
                  }, "", false), ...NIVELES_EDUCATIVOS_SAT.map(n => /*#__PURE__*/_jsxDEV("option", {
                    value: n,
                    children: n
                  }, n, false))]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "RVOE / clave del centro de trabajo"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "Ej. 20PP0001X",
                  value: formFact.rvoe,
                  onChange: e => setFormFact(f => ({
                    ...f,
                    rvoe: e.target.value
                  }))
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 10.5,
                color: 'var(--ink-4)',
                marginTop: 6
              },
              children: "Si dejas algún campo vacío, el CFDI se timbra sin el complemento IEDU (el padre de familia no podrá deducir la colegiatura, pero el CFDI seguirá siendo válido)."
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            marginTop: 16,
            padding: '14px 16px',
            background: 'var(--glass-light)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-glow)'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 11,
              color: 'var(--ink-4)',
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 10
              },
              children: "Vista previa del comprobante"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 12
              },
              children: [{
                l: 'Subtotal',
                v: fmt(cobroSel.total - vistaIva(cobroSel))
              }, {
                l: vistaIvaTodos16(cobroSel) ? 'IVA 16%' : 'IVA (aprox.)',
                v: fmt(vistaIva(cobroSel))
              }, {
                l: 'Total',
                v: fmt(cobroSel.total),
                bold: true
              }].map(s => /*#__PURE__*/_jsxDEV("div", {
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 10.5,
                    color: 'var(--ink-4)',
                    marginBottom: 2
                  },
                  children: s.l
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 14,
                    fontWeight: s.bold ? 700 : 400,
                    color: s.bold ? 'var(--green)' : 'var(--ink)'
                  },
                  children: s.v
                }, void 0, false)]
              }, s.l, true))
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 10,
                fontSize: 11.5,
                color: 'var(--ink-3)'
              },
              children: ["Conceptos: ", (cobroSel.items || []).map(i => i.nombre).join(', ')]
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setModal(null),
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: generarCFDI,
            disabled: loading || !formFact.rfc || !formFact.razon_social || !formFact.cp_receptor,
            children: loading ? /*#__PURE__*/_jsxDEV(_Fragment, {
              children: [/*#__PURE__*/_jsxDEV("span", {
                className: "spinner",
                style: {
                  // currentColor y no '#fff': el spinner sigue al color del
                  // botón, así no hay que acordarse de cambiarlo si el botón
                  // primario deja de ser de texto blanco.
                  borderTopColor: 'currentColor',
                  marginRight: 8
                }
              }, void 0, false), "Generando…"]
            }, void 0, true) : 'Generar CFDI'
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modal === 'visor' && cfdiVisor && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "modal-title",
              style: {
                display: "flex",
                alignItems: "center",
                gap: 8
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "check",
                size: 18,
                color: "var(--green)"
              }, void 0, false), " CFDI Generado"]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--green)',
                marginTop: 2
              },
              children: "Listo para timbrado con PAC"
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setModal(null),
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "close",
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              padding: '12px 16px',
              marginBottom: 16,
              // Mismo criterio que la cabecera: fondo del tema en vez de un
              // degradado azul fijo que en modo claro queda como un bloque
              // oscuro suelto dentro de un modal claro.
              background: 'var(--glass-light)',
              border: '1px solid var(--border-glow)',
              borderRadius: 'var(--radius)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 10,
                color: 'var(--ink-3)',
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: '.5px'
              },
              children: "Folio Fiscal (UUID)"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontFamily: 'var(--mono)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ink)',
                letterSpacing: .5,
                wordBreak: 'break-all'
              },
              children: cfdiVisor.uuid || cfdiVisor.folio_fiscal
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                gap: 20,
                marginTop: 8,
                flexWrap: 'wrap'
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 10,
                    color: 'var(--ink-4)'
                  },
                  children: "Serie / Folio"
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--ink-2)'
                  },
                  children: [cfdiVisor.serie || 'A', "-", cfdiVisor.folio]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 10,
                    color: 'var(--ink-4)'
                  },
                  children: "Fecha timbrado"
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--ink-2)'
                  },
                  children: cfdiVisor.fecha_timbrado
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16
            },
            children: [{
              l: 'RFC Receptor',
              v: cfdiVisor.rfc_receptor
            }, {
              l: 'Código Postal',
              v: cfdiVisor.cp_receptor
            }, {
              l: 'Domicilio fiscal',
              v: cfdiVisor.domicilio || '—',
              col: '1/-1'
            }, {
              l: 'Uso CFDI',
              v: cfdiVisor.uso_cfdi
            }, {
              l: 'Subtotal',
              v: fmt(cfdiVisor.subtotal)
            }, {
              l: 'IVA 16%',
              v: fmt(cfdiVisor.iva)
            }, {
              l: 'Total',
              v: fmt(cfdiVisor.total),
              bold: true,
              color: 'var(--green)'
            }, {
              l: 'Correo envío',
              v: cfdiVisor.email || '—'
            }].map(s => /*#__PURE__*/_jsxDEV("div", {
              style: s.col ? {
                gridColumn: s.col
              } : {},
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10.5,
                  color: 'var(--ink-4)',
                  marginBottom: 2
                },
                children: s.l
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 13,
                  fontWeight: s.bold ? 700 : 400,
                  color: s.color || 'var(--ink)',
                  fontFamily: s.bold ? 'var(--mono)' : undefined
                },
                children: s.v
              }, void 0, false)]
            }, s.l, true))
          }, void 0, false), cfdiVisor.qr_url && /*#__PURE__*/_jsxDEV("div", {
            style: {
              textAlign: 'center',
              marginBottom: 16
            },
            children: [/*#__PURE__*/_jsxDEV("img", {
              src: cfdiVisor.qr_url,
              alt: "QR SAT",
              style: {
                width: 120,
                height: 120,
                border: '1px solid var(--border-glow)',
                borderRadius: 'var(--radius-sm)'
              },
              onError: e => e.target.style.display = 'none'
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 10.5,
                color: 'var(--ink-4)',
                marginTop: 4
              },
              children: "QR verificación SAT"
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              background: 'var(--amber-glow)',
              border: '1px solid rgba(245,158,11,.2)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              fontSize: 12,
              color: 'var(--ink-2)'
            },
            children: [/*#__PURE__*/_jsxDEV("strong", {
              style: {
                color: 'var(--amber)'
              },
              children: "Nota:"
            }, void 0, false), " El comprobante no se descarga automáticamente desde aquí. Descárgalo desde la pestaña de \"Emitidas\""]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: /*#__PURE__*/_jsxDEV("button", {
            className: "btn className=btn-secondary",
            onClick: () => setModal(null),
            children: "Cerrar"
          }, void 0, false)
        }, void 0, false)]
      }, void 0, true)
    }, void 0, false), complementosVisor && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setComplementosVisor(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "modal-title",
              children: "Complementos de pago"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 },
              children: [complementosVisor.cobro.folio, " · ", complementosVisor.cobro.cliente]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setComplementosVisor(null),
            children: /*#__PURE__*/_jsxDEV(Icon, { name: "close", size: 16, color: "currentColor" }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: cargandoComplementos ? /*#__PURE__*/_jsxDEV("div", {
            style: { textAlign: 'center', padding: '20px 0', color: 'var(--ink-3)', fontSize: 13 },
            children: "Cargando…"
          }, void 0, false) : (complementosVisor.abonos.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
            style: { textAlign: 'center', padding: '20px 0', color: 'var(--ink-3)', fontSize: 13 },
            children: "Este cobro no tiene abonos registrados."
          }, void 0, false) : /*#__PURE__*/_jsxDEV("div", {
            style: { display: 'flex', flexDirection: 'column', gap: 10 },
            children: complementosVisor.abonos.map(ab => /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', border: '1px solid var(--border-glow)',
                borderRadius: 'var(--radius-sm)', flexWrap: 'wrap', gap: 8
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: { fontSize: 13, fontWeight: 600 },
                  children: [ab.folio ? ab.folio + ' · ' : '', fmt(ab.monto), " · ", ab.metodo || '—'] // [OF-3] folio del abono
                }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                  style: { fontSize: 11, color: 'var(--ink-4)', marginTop: 2 },
                  children: ab.cfdi_complemento_uuid
                    ? ['Timbrado ', (ab.creado_en || '').slice(0, 10), ' · ', /*#__PURE__*/_jsxDEV("span", { style: { fontFamily: 'var(--mono)' }, children: ab.cfdi_complemento_uuid.slice(0, 18) + '…' }, 'u', false)]
                    : 'Todavía sin complemento de pago'
                }, void 0, true)]
              }, void 0, true), ab.cfdi_complemento_uuid ? /*#__PURE__*/_jsxDEV("div", {
                style: { display: 'flex', gap: 6 },
                children: [/*#__PURE__*/_jsxDEV("button", {
                  className: "btn btn-ghost btn-sm",
                  disabled: descargandoComplemento === ab.id + '-pdf',
                  onClick: () => descargarComplemento(ab, 'pdf'),
                  children: descargandoComplemento === ab.id + '-pdf' ? '…' : '⬇ PDF'
                }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                  className: "btn btn-ghost btn-sm",
                  disabled: descargandoComplemento === ab.id + '-xml',
                  onClick: () => descargarComplemento(ab, 'xml'),
                  children: descargandoComplemento === ab.id + '-xml' ? '…' : '⬇ XML'
                }, void 0, false)]
              }, void 0, true) : /*#__PURE__*/_jsxDEV("span", {
                style: { fontSize: 11, color: 'var(--amber)' },
                children: "pendiente"
              }, void 0, false)]
            }, ab.id, true))
          }, void 0, false))
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setComplementosVisor(null),
            children: "Cerrar"
          }, void 0, false)
        }, void 0, false)]
      }, void 0, true)
    }, void 0, false), cancelModalEl]
  }, void 0, true);
}