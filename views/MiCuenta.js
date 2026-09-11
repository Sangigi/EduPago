/* views/MiCuenta.jsx — Vista para el admin del colegio:
 * 1) Datos fiscales básicos (persona física/moral, razón social, régimen)
 *    para poder facturar (CFDI).
 * 2) Formulario COMPLETO de alta de comercio de Cobroscontarjeta.com
 *    (11-sep-2026, tal cual lo pide el proveedor): titular, representante
 *    legal, datos de la empresa, identificación oficial y datos BANCARIOS.
 *    Vive en su propia tabla (escuela_datos_pago) y sus propios endpoints
 *    (escuela_obtener_datos_pago / escuela_guardar_datos_pago) -- NUNCA en
 *    `escuelas`, que cargar_datos.php manda completa a todos los roles del
 *    colegio, incluida familia.
 * 3) Documentos (identificación, estado de cuenta, comprobante de
 *    domicilio, constancia fiscal) que ese mismo formulario exige subir.
 *
 * Antes no existía ninguna pantalla donde un admin pudiera tocar nada de
 * esto de su propia escuela — editar_escuela.php es solo-superadmin.
 */
var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};

const MC_TIPOS_DOCUMENTO = [
  { tipo: 'identificacion_frente',   label: 'Identificación dueño del negocio (Frente)' },
  { tipo: 'identificacion_reverso',  label: 'Identificación dueño del negocio (Reverso)' },
  { tipo: 'estado_cuenta_bancario',  label: 'Portada del estado de cuenta bancario' },
  { tipo: 'comprobante_domicilio',   label: 'Comprobante de domicilio' },
  { tipo: 'constancia_fiscal',       label: 'Constancia Fiscal' },
];

const MC_ESTADO_DOC = {
  pendiente: { label: 'En revisión', clase: 'badge-amber' },
  aprobado:  { label: 'Aprobado',    clase: 'badge-green' },
  rechazado: { label: 'Rechazado',   clase: 'badge-red' },
};

const MC_ESTADO_ESCUELA = {
  sin_enviar:  { label: 'Sin documentos', clase: 'badge-gray' },
  en_revision: { label: 'En revisión',    clase: 'badge-amber' },
  aprobada:    { label: 'Documentación aprobada', clase: 'badge-green' },
  rechazada:   { label: 'Documentación rechazada', clase: 'badge-red' },
};

// Campos del formulario de alta de comercio, agrupados igual que lo pide
// Cobroscontarjeta.com. `requerido` es solo visual (asterisco) -- la
// validación dura de los campos realmente indispensables la hace el propio
// proveedor al recibir la solicitud; aquí no se bloquea el guardado
// parcial, porque el admin puede ir llenándolo en varias sesiones.
const MC_GRUPOS_DATOS_PAGO = [
  {
    titulo: 'Datos generales del titular',
    campos: [
      ['titular_nombre', 'Nombre del titular (como aparece en el estado de cuenta)', true],
      ['nombre_comercio', 'Nombre de sucursal (nombre del comercio)', true],
      ['titular_correo', 'Correo', true, 'email'],
      ['giro', 'Actividad o giro', false],
      ['rfc', 'R.F.C.', false],
      ['calle_numero', 'Calle y número exterior', true],
      ['numero_interior', 'Número Interior', false],
      ['colonia', 'Colonia', true],
      ['delegacion_municipio', 'Delegación o municipio', false],
      ['cp', 'Código postal', true],
      ['ciudad', 'Ciudad', true],
      ['estado_direccion', 'Estado', true],
      ['pais', 'País', true],
      ['telefono_oficina', 'Teléfono oficina', false, 'tel'],
      ['telefono_celular', 'Teléfono celular', true, 'tel'],
      ['nombre_vendedor', 'Nombre vendedor', false],
    ],
  },
  {
    titulo: 'Datos del representante legal',
    campos: [
      ['rep_legal_nombre', 'Nombre completo', false],
      ['rep_legal_escritura', 'Número y fecha de escritura', false],
      ['rep_legal_notaria_numero', 'Notaria número', false],
      ['rep_legal_notario_nombre', 'Nombre del notario', false],
      ['rep_legal_ciudad', 'Ciudad', false],
    ],
  },
  {
    titulo: 'Datos de la empresa',
    soloMoral: true,
    campos: [
      ['empresa_escritura', 'Número de escritura y fecha', false],
      ['empresa_folio_rpc', 'Folio del registro público del comercio', false],
      ['empresa_ciudad', 'Ciudad', false],
      ['empresa_notario_nombre', 'Nombre del notario', false],
      ['empresa_notaria_numero', 'Notaria número', false],
    ],
  },
  {
    titulo: 'Datos del documento del titular o representante legal',
    campos: [
      ['id_tipo', 'Tipo de identificación', true],
      ['id_numero', 'Número', true],
      ['id_fecha_expedicion', 'Fecha expedición', true, 'date'],
      ['id_vigencia', 'Vigencia', true, 'date'],
    ],
  },
  {
    titulo: 'Datos bancarios',
    campos: [
      ['banco', 'Banco', true],
      ['plaza', 'Plaza', false],
      ['sucursal_bancaria', 'Sucursal', true],
      ['cuenta_cheques', 'Cuenta cheques', true],
      ['cuenta_clabe', 'Cuenta CLABE', true],
    ],
  },
];

function MiCuenta({ escuela, user }) {
  const { useState, useEffect } = React;
  const [tipoPersona, setTipoPersona]     = useState(escuela?.tipo_persona || '');
  const [razonSocial, setRazonSocial]     = useState(escuela?.razon_social || '');
  const [regimenFiscal, setRegimenFiscal] = useState(escuela?.regimen_fiscal || '');
  const [guardando, setGuardando]         = useState(false);
  const [msgFiscal, setMsgFiscal]         = useState(null);

  const [datosPago, setDatosPago] = useState({});
  const [cargandoPago, setCargandoPago] = useState(true);
  const [aceptaClausulado, setAceptaClausulado] = useState(false);
  const [yaAcepto, setYaAcepto] = useState(false);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [msgPago, setMsgPago] = useState(null);
  const [verClausulado, setVerClausulado] = useState(false);

  const [documentos, setDocumentos] = useState([]);
  const [cargandoDocs, setCargandoDocs] = useState(true);
  const [subiendoTipo, setSubiendoTipo] = useState(null);
  const [msgDocs, setMsgDocs] = useState(null);

  const tkn = () => AuthController.getToken();
  const apiPost = async (action, body) => {
    const r = await fetch('api.php?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tkn() },
      body: JSON.stringify(body),
    });
    return r.json();
  };

  const cargarDocumentos = async () => {
    if (!escuela?.id) return;
    setCargandoDocs(true);
    try {
      const res = await apiPost('listar_documentos_escuela', { escuela_id: escuela.id });
      if (res.success) setDocumentos(res.documentos || []);
    } catch (e) { /* silencioso — la tabla no bloquea el resto de la pantalla */ }
    setCargandoDocs(false);
  };

  const cargarDatosPago = async () => {
    if (!escuela?.id) return;
    setCargandoPago(true);
    try {
      const res = await apiPost('escuela_obtener_datos_pago', { escuela_id: escuela.id });
      if (res.success && res.datos_pago) {
        setDatosPago(res.datos_pago);
        setYaAcepto(!!res.datos_pago.clausulado_aceptado_en);
      }
    } catch (e) { /* silencioso */ }
    setCargandoPago(false);
  };

  useEffect(() => { cargarDocumentos(); cargarDatosPago(); }, [escuela?.id]);

  const guardarFiscal = async () => {
    setGuardando(true);
    setMsgFiscal(null);
    try {
      const res = await apiPost('escuela_editar_propia', {
        escuela_id: escuela.id, tipo_persona: tipoPersona,
        razon_social: razonSocial, regimen_fiscal: regimenFiscal,
      });
      if (!res.success) throw new Error(res.error || 'No se pudo guardar');
      setMsgFiscal({ ok: true, texto: 'Datos fiscales guardados.' });
    } catch (e) {
      setMsgFiscal({ ok: false, texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  const guardarDatosPago = async () => {
    if (!yaAcepto && !aceptaClausulado) {
      setMsgPago({ ok: false, texto: 'Debes aceptar el clausulado del contrato de procesamiento de transacciones para enviar esta información.' });
      return;
    }
    setGuardandoPago(true);
    setMsgPago(null);
    try {
      const res = await apiPost('escuela_guardar_datos_pago', {
        escuela_id: escuela.id, tipo_persona: tipoPersona,
        acepta_clausulado: aceptaClausulado || yaAcepto,
        ...datosPago,
      });
      if (!res.success) throw new Error(res.error || 'No se pudo guardar');
      setYaAcepto(true);
      setMsgPago({ ok: true, texto: 'Datos de alta de comercio guardados.' });
    } catch (e) {
      setMsgPago({ ok: false, texto: e.message });
    } finally {
      setGuardandoPago(false);
    }
  };

  const subirDocumento = async (tipo, archivo) => {
    if (!archivo) return;
    setSubiendoTipo(tipo);
    setMsgDocs(null);
    try {
      const fd = new FormData();
      fd.append('escuela_id', escuela.id);
      fd.append('tipo', tipo);
      fd.append('archivo', archivo);
      const r = await fetch('api.php?action=subir_documento_escuela', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tkn() },
        body: fd,
      });
      const res = await r.json();
      if (!res.success) throw new Error(res.error || 'No se pudo subir el documento');
      await cargarDocumentos();
    } catch (e) {
      setMsgDocs({ ok: false, texto: e.message });
    } finally {
      setSubiendoTipo(null);
    }
  };

  const docDe = tipo => documentos.find(d => d.tipo === tipo);
  const estadoEscuela = MC_ESTADO_ESCUELA[escuela?.documentacion_estado] || MC_ESTADO_ESCUELA.sin_enviar;

  const campoPago = (key, label, requerido, tipo) => _jsxDEV('div', {
    children: [
      _jsxDEV('label', { style: { fontSize: 12, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }, children: label + (requerido ? ' *' : '') }, 1),
      _jsxDEV('input', {
        className: 'form-input', type: tipo || 'text', value: datosPago[key] || '',
        onChange: e => setDatosPago(d => ({ ...d, [key]: e.target.value }))
      }, 2)
    ]
  }, key);

  return _jsxDEV('div', {
    className: 'view-mi-cuenta',
    children: [
      // ── Datos fiscales básicos (CFDI) ──────────────────────────────────
      _jsxDEV('div', {
        className: 'card', style: { marginBottom: 20 },
        children: [
          _jsxDEV('div', {
            className: 'card-header',
            children: _jsxDEV('div', {
              children: [
                _jsxDEV('div', { className: 'card-title', children: 'Datos fiscales' }, 't'),
                _jsxDEV('div', { className: 'card-sub', children: 'Necesarios para poder facturar los cobros de ' + (escuela?.nombre || 'tu colegio') }, 's'),
              ]
            }, 'h')
          }, 'ch'),
          _jsxDEV('div', {
            style: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 },
            children: [
              _jsxDEV('div', {
                children: [
                  _jsxDEV('label', { style: { fontSize: 12, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }, children: 'Tipo de persona' }, 1),
                  _jsxDEV('select', {
                    className: 'form-input', value: tipoPersona,
                    onChange: e => setTipoPersona(e.target.value),
                    children: [
                      _jsxDEV('option', { value: '', children: 'Sin definir' }, 'op0'),
                      _jsxDEV('option', { value: 'fisica', children: 'Persona física' }, 'op1'),
                      _jsxDEV('option', { value: 'moral', children: 'Persona moral' }, 'op2'),
                    ]
                  }, 2)
                ]
              }, 'tp'),
              _jsxDEV('div', {
                children: [
                  _jsxDEV('label', { style: { fontSize: 12, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }, children: 'Razón social' }, 1),
                  _jsxDEV('input', { className: 'form-input', value: razonSocial, onChange: e => setRazonSocial(e.target.value), placeholder: 'Nombre legal completo' }, 2)
                ]
              }, 'rs'),
              _jsxDEV('div', {
                children: [
                  _jsxDEV('label', { style: { fontSize: 12, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }, children: 'Régimen fiscal (clave SAT)' }, 1),
                  _jsxDEV('input', { className: 'form-input', value: regimenFiscal, onChange: e => setRegimenFiscal(e.target.value), placeholder: '601, 612, 626…' }, 2)
                ]
              }, 'rf'),
              _jsxDEV('button', {
                className: 'btn btn-primary', style: { alignSelf: 'flex-start' },
                disabled: guardando, onClick: guardarFiscal,
                children: guardando ? 'Guardando…' : 'Guardar datos fiscales'
              }, 'guardar'),
              msgFiscal ? _jsxDEV('div', {
                style: { fontSize: 13, color: msgFiscal.ok ? 'var(--green)' : 'var(--red)' },
                children: msgFiscal.texto
              }, 'msg') : null
            ]
          }, 'form')
        ]
      }, 'card1'),

      // ── Alta de comercio para cobrar de verdad (Cobroscontarjeta.com) ──
      _jsxDEV('div', {
        className: 'card', style: { marginBottom: 20 },
        children: [
          _jsxDEV('div', {
            className: 'card-header',
            children: _jsxDEV('div', {
              children: [
                _jsxDEV('div', { className: 'card-title', children: 'Datos para procesar pagos reales' }, 't'),
                _jsxDEV('div', { className: 'card-sub', children: 'Formulario de alta de comercio de Cobroscontarjeta.com. Necesario para que las familias puedan pagarte de verdad.' }, 's'),
              ]
            }, 'h')
          }, 'ch'),
          cargandoPago ? _jsxDEV('div', { style: { fontSize: 13, color: 'var(--ink-3)' }, children: 'Cargando…' }, 'load') : _jsxDEV('div', {
            children: [
              ...MC_GRUPOS_DATOS_PAGO.filter(g => !g.soloMoral || tipoPersona === 'moral').map((g, gi) => _jsxDEV('div', {
                style: { marginBottom: 18 },
                children: [
                  _jsxDEV('div', { style: { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: .3 }, children: g.titulo }, 't'),
                  _jsxDEV('div', {
                    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
                    children: g.campos.map(([key, label, requerido, tipo]) => campoPago(key, label, requerido, tipo))
                  }, 'g')
                ]
              }, gi)),
              _jsxDEV('div', {
                style: { padding: '12px 14px', background: 'rgba(40,45,101,.04)', borderRadius: 'var(--radius-sm)', marginBottom: 14 },
                children: [
                  _jsxDEV('label', {
                    style: { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: yaAcepto ? 'default' : 'pointer' },
                    children: [
                      _jsxDEV('input', {
                        type: 'checkbox', checked: aceptaClausulado || yaAcepto, disabled: yaAcepto,
                        onChange: e => setAceptaClausulado(e.target.checked), style: { marginTop: 2 }
                      }, 1),
                      _jsxDEV('span', { children: 'Acepto que he leído y estoy de acuerdo con el clausulado del contrato de procesamiento de transacciones. (Indispensable aceptarlo para mandar la información)' }, 2)
                    ]
                  }, 'chk'),
                  _jsxDEV('button', {
                    type: 'button', className: 'btn-link', style: { fontSize: 12, marginTop: 6, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 },
                    onClick: () => setVerClausulado(true),
                    children: 'Ver Clausulado'
                  }, 'verlink')
                ]
              }, 'clausulado'),
              _jsxDEV('button', {
                className: 'btn btn-primary', disabled: guardandoPago, onClick: guardarDatosPago,
                children: guardandoPago ? 'Guardando…' : 'Guardar datos de alta de comercio'
              }, 'guardarpago'),
              msgPago ? _jsxDEV('div', {
                style: { fontSize: 13, color: msgPago.ok ? 'var(--green)' : 'var(--red)', marginTop: 8 },
                children: msgPago.texto
              }, 'msgp') : null
            ]
          }, 'formpago'),
          verClausulado ? _jsxDEV('div', {
            className: 'modal-backdrop', onClick: e => e.target === e.currentTarget && setVerClausulado(false),
            children: _jsxDEV('div', {
              className: 'modal', style: { maxWidth: 520 },
              children: [
                _jsxDEV('div', { className: 'modal-header', children: [
                  _jsxDEV('span', { className: 'modal-title', children: 'Clausulado del contrato' }, 't'),
                  _jsxDEV('button', { className: 'modal-close', onClick: () => setVerClausulado(false), children: '✕' }, 'x')
                ] }, 'h'),
                _jsxDEV('div', {
                  className: 'modal-body', style: { fontSize: 13, color: 'var(--ink-2)' },
                  children: 'Pendiente: aquí va el texto real del clausulado del contrato de procesamiento de transacciones de Cobroscontarjeta.com (o la liga oficial a su aviso legal). Pídeselo a tu contacto en Cobroscontarjeta.com/Savala y se agrega aquí.'
                }, 'b')
              ]
            }, void 0, true)
          }, void 0, false) : null
        ]
      }, 'card2'),

      // ── Documentos ──────────────────────────────────────────────────────
      _jsxDEV('div', {
        className: 'card',
        children: [
          _jsxDEV('div', {
            className: 'card-header',
            children: _jsxDEV('div', {
              children: [
                _jsxDEV('div', { className: 'card-title', children: 'Selección de documentos' }, 't'),
                _jsxDEV('div', { className: 'card-sub', children: 'JPG, PNG o PDF, peso máximo 10MB. Un superadmin los revisa en 24-72 horas.' }, 's'),
              ]
            }, 'h')
          }, 'ch'),
          _jsxDEV('div', { style: { marginBottom: 14 }, children: _jsxDEV('span', { className: 'badge ' + estadoEscuela.clase, children: estadoEscuela.label }, void 0, false) }, 'estado'),
          cargandoDocs ? _jsxDEV('div', { style: { fontSize: 13, color: 'var(--ink-3)' }, children: 'Cargando…' }, 'load') :
            _jsxDEV('div', {
              style: { display: 'flex', flexDirection: 'column', gap: 10 },
              children: MC_TIPOS_DOCUMENTO.map(t => {
                const doc = docDe(t.tipo);
                const info = doc ? (MC_ESTADO_DOC[doc.estado] || MC_ESTADO_DOC.pendiente) : null;
                const subiendo = subiendoTipo === t.tipo;
                return _jsxDEV('div', {
                  style: {
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glow)',
                  },
                  children: [
                    _jsxDEV('div', {
                      children: [
                        _jsxDEV('div', { style: { fontSize: 13.5, fontWeight: 600 }, children: t.label }, 1),
                        doc ? _jsxDEV('div', { style: { marginTop: 4 }, children: [
                          _jsxDEV('span', { className: 'badge ' + info.clase, children: info.label }, 'b'),
                          doc.estado === 'rechazado' && doc.motivo_rechazo ? _jsxDEV('span', { style: { fontSize: 12, color: 'var(--red)', marginLeft: 8 }, children: doc.motivo_rechazo }, 'm') : null
                        ] }, 2) : null
                      ]
                    }, 'info'),
                    _jsxDEV('label', {
                      className: 'btn btn-secondary btn-sm', style: { cursor: subiendo ? 'not-allowed' : 'pointer', opacity: subiendo ? .6 : 1 },
                      children: [
                        subiendo ? 'Subiendo…' : (doc ? 'Volver a subir' : 'Subir'),
                        _jsxDEV('input', {
                          type: 'file', accept: '.jpg,.jpeg,.png,.pdf', style: { display: 'none' },
                          disabled: subiendo,
                          onChange: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) subirDocumento(t.tipo, f); }
                        }, 'input')
                      ]
                    }, 'up')
                  ]
                }, t.tipo);
              })
            }, 'lista'),
          msgDocs ? _jsxDEV('div', { style: { fontSize: 13, color: 'var(--red)', marginTop: 10 }, children: msgDocs.texto }, 'msgd') : null
        ]
      }, 'card3')
    ]
  }, void 0, true);
}
