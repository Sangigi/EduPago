/* views/Contador.jsx — Panel del rol 'contador' (11-sep-2026): revisa
 * documentos fiscales y datos de alta de comercio de CUALQUIER escuela, y
 * asigna el ID externo de Savala al terminar. A propósito NO tiene los
 * demás poderes de superadmin (no edita planes, no activa demo, no ve
 * reportes globales) -- solo lo necesario para esta revisión.
 */
var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};

const CT_ESTADO_ESCUELA = {
  sin_enviar:  { label: 'Sin documentos', clase: 'badge-gray' },
  en_revision: { label: 'En revisión',    clase: 'badge-amber' },
  aprobada:    { label: 'Aprobada',       clase: 'badge-green' },
  rechazada:   { label: 'Rechazada',      clase: 'badge-red' },
};

const CT_ESTADO_DOC = {
  pendiente: { label: 'En revisión', clase: 'badge-amber' },
  aprobado:  { label: 'Aprobado',    clase: 'badge-green' },
  rechazado: { label: 'Rechazado',   clase: 'badge-red' },
};

const CT_TIPOS_DOCUMENTO = [
  { tipo: 'identificacion_frente',   label: 'Identificación dueño del negocio (Frente)' },
  { tipo: 'identificacion_reverso',  label: 'Identificación dueño del negocio (Reverso)' },
  { tipo: 'estado_cuenta_bancario',  label: 'Portada del estado de cuenta bancario' },
  { tipo: 'comprobante_domicilio',   label: 'Comprobante de domicilio' },
  { tipo: 'constancia_fiscal',       label: 'Constancia Fiscal' },
];

// Solo las etiquetas más relevantes de escuela_datos_pago para verificar
// contra los documentos -- no hace falta mostrar las ~30 columnas completas.
const CT_CAMPOS_DATOS_PAGO = [
  ['titular_nombre', 'Titular'], ['nombre_comercio', 'Nombre comercial'],
  ['rfc', 'RFC'], ['banco', 'Banco'], ['cuenta_clabe', 'CLABE'],
  ['cuenta_cheques', 'Cuenta cheques'], ['id_tipo', 'Tipo de ID'], ['id_numero', 'Número de ID'],
];

function Contador({ user, onLogout }) {
  const { useState, useEffect } = React;
  const [escuelas, setEscuelas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errLista, setErrLista] = useState(null);
  const [escSel, setEscSel] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [datosPago, setDatosPago] = useState(null);
  const [adminEsc, setAdminEsc] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [revisandoDoc, setRevisandoDoc] = useState(null);
  const [idExterno, setIdExterno] = useState('');
  const [guardandoId, setGuardandoId] = useState(false);
  const [msg, setMsg] = useState(null);

  const tkn = () => AuthController.getToken();
  const apiPost = async (action, body) => {
    const r = await fetch('api.php?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tkn() },
      body: JSON.stringify(body),
    });
    return r.json();
  };

  const cargarEscuelas = async () => {
    setCargando(true);
    setErrLista(null);
    try {
      const res = await apiPost('contador_listar_escuelas', {});
      if (res.success) setEscuelas(res.escuelas || []);
      else setErrLista(res.error || 'No se pudo cargar la lista de colegios.');
    } catch (e) {
      setErrLista('Error de conexión: ' + e.message);
    }
    setCargando(false);
  };

  useEffect(() => { cargarEscuelas(); }, []);

  const abrirEscuela = async (esc) => {
    setEscSel(esc);
    setMsg(null);
    setCargandoDetalle(true);
    try {
      const [resDocs, resPago] = await Promise.all([
        apiPost('listar_documentos_escuela', { escuela_id: esc.id }),
        apiPost('escuela_obtener_datos_pago', { escuela_id: esc.id }),
      ]);
      setDocumentos(resDocs.success ? (resDocs.documentos || []) : []);
      setDatosPago(resPago.success ? resPago.datos_pago : null);
      setAdminEsc(resPago.success ? resPago.admin : null);
      setIdExterno((resPago.success && resPago.admin && resPago.admin.id_externo) || '');
    } catch (e) { /* silencioso */ }
    setCargandoDetalle(false);
  };

  const refrescarDetalle = async () => {
    if (!escSel) return;
    const resDocs = await apiPost('listar_documentos_escuela', { escuela_id: escSel.id }).catch(() => null);
    if (resDocs && resDocs.success) setDocumentos(resDocs.documentos || []);
    await cargarEscuelas();
  };

  const revisarDocumento = async (documentoId, accion) => {
    let motivo = '';
    if (accion === 'rechazar') {
      motivo = prompt('Motivo del rechazo (se le muestra al colegio):') || '';
      if (motivo.trim() === '') return;
    }
    setRevisandoDoc(documentoId);
    try {
      const res = await apiPost('revisar_documento_escuela', { documento_id: documentoId, accion, motivo: motivo.trim() });
      if (!res.success) throw new Error(res.error || 'No se pudo procesar');
      await refrescarDetalle();
    } catch (e) {
      setMsg({ ok: false, texto: e.message });
    } finally {
      setRevisandoDoc(null);
    }
  };

  const descargarDocumento = async (doc) => {
    const res = await fetch('api.php?action=descargar_documento_escuela&documento_id=' + doc.id, {
      headers: { Authorization: 'Bearer ' + tkn() },
    });
    if (!res.ok) { alert('No se pudo descargar el documento.'); return; }
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const guardarIdExterno = async () => {
    if (!adminEsc || !idExterno.trim()) return;
    setGuardandoId(true);
    setMsg(null);
    try {
      const res = await apiPost('asignar_id_externo', { usuario_id: adminEsc.id, id_externo: idExterno.trim() });
      if (!res.success) throw new Error(res.error || 'No se pudo asignar el ID externo');
      setMsg({ ok: true, texto: 'ID externo asignado.' });
      setAdminEsc(a => ({ ...a, id_externo: idExterno.trim() }));
    } catch (e) {
      setMsg({ ok: false, texto: e.message });
    } finally {
      setGuardandoId(false);
    }
  };

  const docDe = tipo => documentos.find(d => d.tipo === tipo);

  return _jsxDEV('div', {
    className: 'view-contador',
    style: { maxWidth: 960, margin: '0 auto', padding: 24 },
    children: [
      _jsxDEV('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
        children: [
          _jsxDEV('div', { style: { fontSize: 20, fontWeight: 700 }, children: 'Paga la Escuela — Revisión de cuentas' }, 't'),
          _jsxDEV('button', { className: 'btn btn-secondary btn-sm', onClick: onLogout, children: 'Salir' }, 'salir'),
        ]
      }, 'topbar'),
      _jsxDEV('div', {
        className: 'card',
        children: [
          _jsxDEV('div', {
            className: 'card-header',
            children: _jsxDEV('div', {
              children: [
                _jsxDEV('div', { className: 'card-title', children: 'Revisión de documentación' }, 't'),
                _jsxDEV('div', { className: 'card-sub', children: 'Colegios con documentos y datos de alta de comercio pendientes de revisar.' }, 's'),
              ]
            }, 'h')
          }, 'ch'),
          errLista ? _jsxDEV('div', { style: { fontSize: 13, color: 'var(--red)', marginBottom: 12 }, children: errLista }, 'errlista') : null,
          cargando ? _jsxDEV('div', { style: { fontSize: 13, color: 'var(--ink-3)' }, children: 'Cargando…' }, 'load') :
            errLista ? null :
            _jsxDEV('table', {
              className: 'data-table',
              children: [
                _jsxDEV('thead', { children: _jsxDEV('tr', { children: [
                  _jsxDEV('th', {}, 'Colegio'), _jsxDEV('th', {}, 'Clave'),
                  _jsxDEV('th', {}, 'Persona'), _jsxDEV('th', {}, 'Estado documentación'), _jsxDEV('th', {}, '')
                ] }, void 0, true) }, 'thead'),
                _jsxDEV('tbody', {
                  children: escuelas.map(esc => {
                    const info = CT_ESTADO_ESCUELA[esc.documentacion_estado] || CT_ESTADO_ESCUELA.sin_enviar;
                    return _jsxDEV('tr', {
                      children: [
                        _jsxDEV('td', {}, esc.nombre),
                        _jsxDEV('td', {}, esc.clave),
                        _jsxDEV('td', {}, esc.tipo_persona === 'moral' ? 'Moral' : esc.tipo_persona === 'fisica' ? 'Física' : '—'),
                        _jsxDEV('td', {}, _jsxDEV('span', { className: 'badge ' + info.clase, children: info.label }, void 0, false)),
                        _jsxDEV('td', {}, _jsxDEV('button', { className: 'btn btn-secondary btn-sm', onClick: () => abrirEscuela(esc), children: 'Revisar' }, void 0, false)),
                      ]
                    }, esc.id, true);
                  })
                }, 'tbody')
              ]
            }, 'tabla')
        ]
      }, 'card1'),

      escSel ? _jsxDEV('div', {
        className: 'modal-backdrop', onClick: e => e.target === e.currentTarget && setEscSel(null),
        children: _jsxDEV('div', {
          className: 'modal', style: { maxWidth: 560 },
          children: [
            _jsxDEV('div', { className: 'modal-header', children: [
              _jsxDEV('span', { className: 'modal-title', children: escSel.nombre }, 't'),
              _jsxDEV('button', { className: 'modal-close', onClick: () => setEscSel(null), children: '✕' }, 'x')
            ] }, 'h'),
            _jsxDEV('div', {
              className: 'modal-body',
              children: cargandoDetalle ? _jsxDEV('div', { style: { fontSize: 13, color: 'var(--ink-3)' }, children: 'Cargando…' }, void 0, false) : [
                _jsxDEV('div', { style: { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8, textTransform: 'uppercase' }, children: 'Documentos' }, 'th1'),
                _jsxDEV('div', {
                  style: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 },
                  children: CT_TIPOS_DOCUMENTO.map(t => {
                    const doc = docDe(t.tipo);
                    const info = doc ? (CT_ESTADO_DOC[doc.estado] || CT_ESTADO_DOC.pendiente) : null;
                    return _jsxDEV('div', {
                      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 4px', borderBottom: '1px solid var(--border-glow)' },
                      children: [
                        _jsxDEV('div', { children: [
                          _jsxDEV('div', { style: { fontSize: 12.5 }, children: t.label }, 1),
                          doc ? _jsxDEV('span', { className: 'badge ' + info.clase, children: info.label }, 2) : _jsxDEV('span', { style: { fontSize: 11, color: 'var(--ink-4)' }, children: 'Sin subir' }, 2)
                        ] }, void 0, true),
                        doc ? _jsxDEV('div', { style: { display: 'flex', gap: 4 }, children: [
                          _jsxDEV('button', { className: 'btn btn-secondary btn-sm', onClick: () => descargarDocumento(doc), children: 'Ver' }, 'ver'),
                          doc.estado === 'pendiente' ? _jsxDEV('button', { className: 'btn btn-secondary btn-sm', disabled: revisandoDoc === doc.id, onClick: () => revisarDocumento(doc.id, 'rechazar'), children: 'Rechazar' }, 'rech') : null,
                          doc.estado === 'pendiente' ? _jsxDEV('button', { className: 'btn btn-primary btn-sm', disabled: revisandoDoc === doc.id, onClick: () => revisarDocumento(doc.id, 'aprobar'), children: 'Aprobar' }, 'apr') : null,
                        ] }, void 0, true) : null
                      ]
                    }, t.tipo, true);
                  })
                }, 'docs'),
                _jsxDEV('div', { style: { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8, textTransform: 'uppercase' }, children: 'Datos de alta de comercio' }, 'th2'),
                _jsxDEV('div', {
                  style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 },
                  children: CT_CAMPOS_DATOS_PAGO.map(([key, label]) => _jsxDEV('div', {
                    style: { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border-glow)' },
                    children: [
                      _jsxDEV('span', { style: { color: 'var(--ink-3)' }, children: label }, 1),
                      _jsxDEV('span', { style: { fontWeight: 600 }, children: (datosPago && datosPago[key]) || '—' }, 2)
                    ]
                  }, key, true))
                }, 'pago'),
                _jsxDEV('div', { style: { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8, textTransform: 'uppercase' }, children: 'ID externo (Savala)' }, 'th3'),
                adminEsc ? _jsxDEV('div', {
                  style: { display: 'flex', gap: 8, alignItems: 'center' },
                  children: [
                    _jsxDEV('span', { style: { fontSize: 12, color: 'var(--ink-3)' }, children: adminEsc.nombre + ' (' + adminEsc.email + ')' }, 1),
                    _jsxDEV('input', { className: 'form-input', style: { maxWidth: 160 }, value: idExterno, onChange: e => setIdExterno(e.target.value), placeholder: 'ID de Savala' }, 2),
                    _jsxDEV('button', { className: 'btn btn-primary btn-sm', disabled: guardandoId || !idExterno.trim(), onClick: guardarIdExterno, children: guardandoId ? 'Guardando…' : 'Asignar' }, 3),
                  ]
                }, 'idext') : _jsxDEV('div', { style: { fontSize: 12, color: 'var(--ink-4)' }, children: 'Esta escuela no tiene una cuenta admin activa.' }, 'noadmin'),
                msg ? _jsxDEV('div', { style: { fontSize: 13, color: msg.ok ? 'var(--green)' : 'var(--red)', marginTop: 10 }, children: msg.texto }, 'msg') : null,
              ]
            }, 'body')
          ]
        }, void 0, true)
      }, void 0, false) : null
    ]
  }, void 0, true);
}
