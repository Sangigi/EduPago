/* views/MiCuenta.jsx — Vista para el admin del colegio: datos fiscales
 * (persona física/moral, razón social, régimen, CP) y documentos (INE del
 * representante, constancia de situación fiscal, comprobante de domicilio)
 * necesarios para poder facturar de verdad. Antes no existía ninguna
 * pantalla donde un admin pudiera tocar esto de su propia escuela —
 * editar_escuela.php es solo-superadmin.
 */
var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};

const MC_TIPOS_DOCUMENTO = [
  { tipo: 'ine_representante',            label: 'INE del representante legal' },
  { tipo: 'constancia_situacion_fiscal',  label: 'Constancia de situación fiscal' },
  { tipo: 'comprobante_domicilio',        label: 'Comprobante de domicilio' },
  { tipo: 'acta_constitutiva',            label: 'Acta constitutiva', soloMoral: true },
  { tipo: 'poder_notarial',               label: 'Poder notarial del representante', soloMoral: true },
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

function MiCuenta({ escuela, user }) {
  const { useState, useEffect } = React;
  const [tipoPersona, setTipoPersona]     = useState(escuela?.tipo_persona || '');
  const [razonSocial, setRazonSocial]     = useState(escuela?.razon_social || '');
  const [regimenFiscal, setRegimenFiscal] = useState(escuela?.regimen_fiscal || '');
  const [cpFiscal, setCpFiscal]           = useState(escuela?.cp_fiscal || '');
  const [guardando, setGuardando]         = useState(false);
  const [msgFiscal, setMsgFiscal]         = useState(null);

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

  useEffect(() => { cargarDocumentos(); }, [escuela?.id]);

  const guardarFiscal = async () => {
    setGuardando(true);
    setMsgFiscal(null);
    try {
      const res = await apiPost('escuela_editar_propia', {
        escuela_id: escuela.id, tipo_persona: tipoPersona,
        razon_social: razonSocial, regimen_fiscal: regimenFiscal, cp_fiscal: cpFiscal,
      });
      if (!res.success) throw new Error(res.error || 'No se pudo guardar');
      setMsgFiscal({ ok: true, texto: 'Datos fiscales guardados.' });
    } catch (e) {
      setMsgFiscal({ ok: false, texto: e.message });
    } finally {
      setGuardando(false);
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
  const tiposVisibles = MC_TIPOS_DOCUMENTO.filter(t => !t.soloMoral || tipoPersona === 'moral');

  return _jsxDEV('div', {
    className: 'view-mi-cuenta',
    children: [
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
                style: { display: 'flex', gap: 12 },
                children: [
                  _jsxDEV('div', {
                    style: { flex: 1 },
                    children: [
                      _jsxDEV('label', { style: { fontSize: 12, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }, children: 'Régimen fiscal (clave SAT)' }, 1),
                      _jsxDEV('input', { className: 'form-input', value: regimenFiscal, onChange: e => setRegimenFiscal(e.target.value), placeholder: '601, 612, 626…' }, 2)
                    ]
                  }, 'rf'),
                  _jsxDEV('div', {
                    style: { flex: 1 },
                    children: [
                      _jsxDEV('label', { style: { fontSize: 12, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }, children: 'Código postal fiscal' }, 1),
                      _jsxDEV('input', { className: 'form-input', value: cpFiscal, onChange: e => setCpFiscal(e.target.value.replace(/\D/g, '').slice(0, 5)), placeholder: '97000' }, 2)
                    ]
                  }, 'cp')
                ]
              }, 'grid2'),
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

      _jsxDEV('div', {
        className: 'card',
        children: [
          _jsxDEV('div', {
            className: 'card-header',
            children: _jsxDEV('div', {
              children: [
                _jsxDEV('div', { className: 'card-title', children: 'Documentos para facturación' }, 't'),
                _jsxDEV('div', { className: 'card-sub', children: 'Súbelos para poder facturar de verdad. Un superadmin los revisa en 24-72 horas.' }, 's'),
              ]
            }, 'h')
          }, 'ch'),
          _jsxDEV('div', { style: { marginBottom: 14 }, children: _jsxDEV('span', { className: 'badge ' + estadoEscuela.clase, children: estadoEscuela.label }, void 0, false) }, 'estado'),
          cargandoDocs ? _jsxDEV('div', { style: { fontSize: 13, color: 'var(--ink-3)' }, children: 'Cargando…' }, 'load') :
            _jsxDEV('div', {
              style: { display: 'flex', flexDirection: 'column', gap: 10 },
              children: tiposVisibles.map(t => {
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
      }, 'card2')
    ]
  }, void 0, true);
}
