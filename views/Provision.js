// views/Provision.js — Panel del rol 'provision'
//
// Cola de colegios cuyos documentos YA aprobó el contador y a los que falta
// capturarles el identificador que Cobroscontarjeta.com asigna después de esa
// aprobación (el que, según el proveedor, habilita a ese colegio para cobrar
// por SPEI).
//
// Mismo patrón que Contador.js y Distribuidor.js: panel autónomo que NO
// depende de cargar_datos.php — este rol no tiene escuela propia y trae sus
// datos con su propia acción (provision_listar_pendientes).
//
// Se usa React.createElement directo, como MenuPerfil.js, en vez del shim
// _jsxDEV de las vistas transpiladas: el shim exige que los hijos vayan en
// props.children y trata el 3er argumento posicional como key, que es una
// fuente conocida de errores al escribir a mano.

var _hPR = React.createElement;

// menuPerfil llega ya armado desde assets/js/app.js: incluye "Editar mi perfil",
// "Cambiar contraseña" y "Cerrar sesión" — el camino que esta pantalla no tenía.
function Provision({ user, onLogout, menuPerfil }) {
  const { useState, useEffect, useCallback } = React;

  const [escuelas, setEscuelas]   = useState([]);
  // Arranca en 'por_revisar': desde el 29-sep-2026 provisión también valida
  // la documentación, y ese es el trabajo que llega primero. Si abriera en
  // 'pendientes' (capturar id), los colegios recién subidos no se verían.
  const [filtro, setFiltro]       = useState('por_revisar');
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [busqueda, setBusqueda]   = useState('');
  // { [escuela_id]: valor escrito } — el borrador por fila, para que escribir
  // en un colegio no toque el campo de otro.
  const [borrador, setBorrador]   = useState({});
  const [guardando, setGuardando] = useState(null);
  const [aviso, setAviso]         = useState(null);
  // Revisión de documentos desde este panel (23-sep-2026). Provisión es quien
  // hace el trámite con el proveedor, así que es quien descubre que un
  // documento no sirve para ese trámite aunque el contador ya lo hubiera dado
  // por bueno. Antes la única salida era pedirle al contador que lo rechazara.
  const [docsEsc, setDocsEsc]         = useState(null); // { escuela, documentos[] }
  const [docsCargando, setDocsCargando] = useState(false);
  const [revisandoDoc, setRevisandoDoc] = useState(null);
  // Datos que capturó el colegio en su formulario de alta de comercio (solo
  // lectura): folio del RPC, correos de contacto, escrituras, etc.
  const [datosForm, setDatosForm]     = useState(null);

  const pedir = useCallback(async (accion, payload) => {
    const token = AuthController.getToken ? AuthController.getToken() : '';
    const r = await fetch('api.php?action=' + accion, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token ? 'Bearer ' + token : '' },
      body: JSON.stringify(payload || {}),
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'Error inesperado');
    return j;
  }, []);

  const cargar = useCallback(async (f) => {
    setCargando(true);
    setError('');
    try {
      const j = await pedir('provision_listar_pendientes', { filtro: f });
      setEscuelas(j.escuelas || []);
    } catch (e) {
      setError(e.message);
      setEscuelas([]);
    }
    setCargando(false);
  }, [pedir]);

  useEffect(() => { cargar(filtro); }, [filtro, cargar]);

  const guardar = async (esc) => {
    const valor = (borrador[esc.id] || '').trim();
    if (!valor) { setAviso({ tipo: 'error', txt: 'Escribe el identificador antes de guardar.' }); return; }
    setGuardando(esc.id);
    setAviso(null);
    try {
      const j = await pedir('provision_asignar_id', { escuela_id: esc.id, proveedor_school_id: valor });
      setAviso({ tipo: 'ok', txt: esc.nombre + ': ' + (j.mensaje || 'Guardado.') });
      setBorrador(b => { const n = { ...b }; delete n[esc.id]; return n; });
      await cargar(filtro);
    } catch (e) {
      setAviso({ tipo: 'error', txt: esc.nombre + ': ' + e.message });
    }
    setGuardando(null);
  };

  const [enviandoContrato, setEnviandoContrato] = useState(null);
  // Modal "Solicitar firmas": { esc, archivo, correo, mensaje, efirma, simple }
  const [firmaModal, setFirmaModal] = useState(null);
  // Sube el PDF (o reenvía el ya guardado si archivo es null). El servidor lo
  // manda por correo al contacto de firma y deja el estatus en 'enviado'.
  const enviarContrato = async (esc, archivo, extra) => {
    setEnviandoContrato(esc.id);
    setAviso(null);
    try {
      const fd = new FormData();
      fd.append('escuela_id', esc.id);
      if (archivo) fd.append('archivo', archivo);
      if (extra) {
        if (extra.correo)  fd.append('correo', extra.correo);
        if (extra.mensaje) fd.append('mensaje', extra.mensaje);
        if (extra.efirma)  fd.append('firma_efirma', '1');
        if (extra.simple)  fd.append('firma_simple', '1');
      }
      const token = AuthController.getToken ? AuthController.getToken() : '';
      const r = await fetch('api.php?action=enviar_contrato_escuela', {
        method: 'POST',
        headers: { 'Authorization': token ? 'Bearer ' + token : '' },
        body: fd,
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'No se pudo enviar el contrato');
      setAviso({ tipo: 'ok', txt: esc.nombre + ': ' + j.mensaje });
      setFirmaModal(null);
      await cargar(filtro);
    } catch (e) {
      setAviso({ tipo: 'error', txt: esc.nombre + ': ' + e.message });
    }
    setEnviandoContrato(null);
  };

  const abrirFirma = (esc) => setFirmaModal({
    esc, archivo: null, correo: esc.contacto_contrato_correo || '',
    mensaje: '', efirma: true, simple: false,
  });

  const cambiarContrato = async (esc, estado) => {
    setAviso(null);
    try {
      await pedir('escuela_set_contrato_estado', { id: esc.id, estado });
      setEscuelas(lista => lista.map(x => x.id === esc.id ? { ...x, contrato_estado: estado } : x));
    } catch (e) {
      setAviso({ tipo: 'error', txt: esc.nombre + ': ' + e.message });
    }
  };

  // Etiquetas legibles. Deben coincidir con MC_TIPOS_DOCUMENTO (MiCuenta.js) y
  // CT_TIPOS_DOCUMENTO (Contador.js): la misma lista vive hoy en tres vistas.
  const PR_DOCS = {
    identificacion_frente:  'Identificación dueño del negocio (Frente)',
    identificacion_reverso: 'Identificación dueño del negocio (Reverso)',
    estado_cuenta_bancario: 'Documento con la CLABE interbancaria',
    comprobante_domicilio:  'Comprobante de domicilio',
    constancia_fiscal:      'Constancia Fiscal',
    acta_constitutiva:      'Acta constitutiva',
  };
  // Datos del formulario de Mi cuenta que provisión necesita ver. Las claves
  // son las de escuela_datos_pago (+ rfc y cp que vienen de escuelas).
  const PR_GRUPOS_FORM = [
    { titulo: 'Personas de contacto', campos: [
      ['contacto_contrato_nombre', 'Firma del contrato: nombre'],
      ['contacto_contrato_correo', 'Firma del contrato: correo'],
      ['contacto_facturas_nombre', 'Recibe facturas: nombre'],
      ['contacto_facturas_correo', 'Recibe facturas: correo'],
      ['contacto_pagos_nombre',    'Atiende pagos: nombre'],
      ['contacto_pagos_correo',    'Atiende pagos: correo'],
    ]},
    { titulo: 'Datos de la empresa (acta constitutiva)', campos: [
      ['empresa_folio_rpc',        'Folio del registro público de comercio'],
      ['empresa_escritura_numero', 'Número de escritura'],
      ['empresa_escritura_fecha',  'Fecha de la escritura'],
      ['empresa_notaria_numero',   'Notaría número'],
      ['empresa_notario_nombre',   'Notario'],
      ['empresa_ciudad',           'Ciudad'],
    ]},
    { titulo: 'Representante legal', campos: [
      ['rep_legal_nombre',            'Nombre'],
      ['rep_legal_escritura_numero',  'Número de escritura'],
      ['rep_legal_escritura_fecha',   'Fecha de la escritura'],
      ['rep_legal_notaria_numero',    'Notaría número'],
      ['rep_legal_notario_nombre',    'Notario'],
      ['rep_legal_ciudad',            'Ciudad'],
    ]},
    { titulo: 'Titular y domicilio', campos: [
      ['titular_nombre',  'Titular'],
      ['nombre_comercio', 'Nombre de sucursal'],
      ['titular_correo',  'Correo'],
      ['rfc',             'R.F.C.'],
      ['giro',            'Actividad o giro'],
      ['calle_numero',    'Calle y número'],
      ['colonia',         'Colonia'],
      ['cp',              'C.P.'],
      ['ciudad',          'Ciudad'],
      ['estado_direccion','Estado'],
      ['telefono_celular','Teléfono celular'],
      ['telefono_oficina','Teléfono oficina'],
    ]},
    { titulo: 'Identificación y datos bancarios', campos: [
      ['id_tipo',            'Tipo de identificación'],
      ['id_numero',          'Número'],
      ['id_fecha_expedicion','Fecha expedición'],
      ['id_vigencia',        'Vigencia'],
      ['banco',              'Banco'],
      ['sucursal_bancaria',  'Sucursal'],
      ['cuenta_cheques',     'Cuenta cheques'],
      ['cuenta_clabe',       'CLABE'],
    ]},
  ];

  const PR_ESTADO_DOC = {
    pendiente: { label: 'En revisión', color: 'var(--amber)' },
    aprobado:  { label: 'Aprobado',    color: 'var(--green)' },
    rechazado: { label: 'Rechazado',   color: 'var(--red)' },
  };

  const abrirDocs = async (esc) => {
    setDocsEsc({ escuela: esc, documentos: [] });
    setDatosForm(null);
    setDocsCargando(true);
    try {
      const j = await pedir('listar_documentos_escuela', { escuela_id: esc.id });
      setDocsEsc({ escuela: esc, documentos: j.documentos || [] });
      // Los datos del formulario son informativos: si fallan, los documentos
      // se siguen mostrando.
      try {
        const jd = await pedir('escuela_obtener_datos_pago', { escuela_id: esc.id });
        setDatosForm(jd.datos_pago || {});
      } catch (_) { setDatosForm({}); }
    } catch (e) {
      setAviso({ tipo: 'error', txt: 'No se pudieron cargar los documentos: ' + e.message });
      setDocsEsc(null);
    }
    setDocsCargando(false);
  };

  // Ver abrirDocumentoPrivado en views/components/Comprobantes.js: abre la
  // pestaña dentro del gesto del clic para que el bloqueador de pop-ups no la
  // mate, avisa si aun así la bloquea, y libera el blob.
  const descargarDoc = (doc) =>
    abrirDocumentoPrivado(
      'api.php?action=descargar_documento_escuela&documento_id=' + doc.id,
      AuthController.getToken ? AuthController.getToken() : '',
      doc.nombre_original,
      (m) => setAviso({ tipo: 'error', txt: m })
    );

  const revisarDoc = async (doc, accion) => {
    let motivo = '';
    if (accion === 'rechazar') {
      // El backend exige motivo al rechazar, y ese texto se le manda tal cual
      // al colegio por correo — es lo único que le dice qué corregir.
      motivo = (window.prompt('¿Por qué se rechaza "' + (PR_DOCS[doc.tipo] || doc.tipo) + '"?\n\nEste texto se le envía al colegio por correo.') || '').trim();
      if (!motivo) return;
    }
    setRevisandoDoc(doc.id);
    setAviso(null);
    try {
      await pedir('revisar_documento_escuela', { documento_id: doc.id, accion, motivo });
      setAviso({ tipo: 'ok', txt: (PR_DOCS[doc.tipo] || doc.tipo) + ': ' + (accion === 'aprobar' ? 'aprobado.' : 'rechazado, se le avisó al colegio.') });
      await abrirDocs(docsEsc.escuela);
      // Rechazar saca al colegio de la cola (documentacion_estado deja de ser
      // 'aprobada'), así que la lista de atrás tiene que refrescarse.
      await cargar(filtro);
    } catch (e) {
      setAviso({ tipo: 'error', txt: e.message });
    }
    setRevisandoDoc(null);
  };

  const visibles = escuelas.filter(e => {
    if (!busqueda.trim()) return true;
    const q = busqueda.trim().toLowerCase();
    return (e.nombre || '').toLowerCase().includes(q)
        || (e.clave || '').toLowerCase().includes(q)
        || (e.razon_social || '').toLowerCase().includes(q)
        || (e.proveedor_school_id || '').toLowerCase().includes(q);
  });

  const FILTROS = [
    { id: 'por_revisar', label: 'Por revisar' },
    { id: 'pendientes', label: 'Por provisionar' },
    { id: 'listas',     label: 'Ya provisionadas' },
    { id: 'todas',      label: 'Todas' },
  ];

  // minHeight dejaba crecer el div pero NADA lo podía desplazar: esta pantalla
  // cuelga de #root (altura fija) con html/body en overflow:hidden, así que todo
  // lo que pasaba del alto de la ventana quedaba inalcanzable. Mismo patrón que
  // views/PortalFamilia.js, que ya documenta la trampa. maxHeight en dvh para que
  // en móvil el fondo no quede debajo de la barra del navegador.
  return _hPR('div', { className: 'app-shell', style: { height: '100vh', maxHeight: '100dvh', overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg-main)' } },

    /* ── Barra superior ── */
    _hPR('div', {
      key: 'top',
      style: {
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap',
        padding: '14px 20px', borderBottom: '1px solid var(--border-glow)',
        background: 'var(--bg-surface)'
      }
    },
      _hPR('div', { key: 't', style: { fontWeight: 800, fontSize: 16, color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' } }, 'Provisión de colegios'),
      // (Se quitó el <div> con el nombre: menuPerfil ya lo muestra y salía duplicado.)
      _hPR('div', { key: 'menu', style: { marginLeft: 'auto', flexShrink: 0 } }, menuPerfil || _hPR('button', { className: 'btn btn-ghost btn-sm', onClick: onLogout }, 'Cerrar sesión'))
    ),

    _hPR('div', { key: 'body', style: { padding: 20, maxWidth: 1100, margin: '0 auto' } },

      /* ── Qué es esto ── */
      _hPR('div', {
        key: 'expl',
        style: {
          padding: '12px 14px', marginBottom: 16, fontSize: 12.5, lineHeight: 1.55,
          background: 'var(--accent-glow)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)', color: 'var(--ink-2)'
        }
      },
        'Aquí aparecen los colegios cuya documentación ya aprobó el contador. ',
        'Captura el identificador que te dé el proveedor para cada uno: al guardarlo, ',
        'el colegio pasa a ', _hPR('b', { key: 'b' }, 'activo'), ' en el embudo comercial.'
      ),

      /* ── Resumen ──
       *
       * Las cifras salen de lo que YA está cargado, no de un conteo global:
       * `cargar(filtro)` pide al servidor solo el subconjunto del filtro
       * activo, así que sumar aquí "todos los colegios" sería inventar. Por
       * eso la etiqueta dice "en esta vista" — una cifra que miente es peor
       * que no tenerla, sobre todo en la pantalla donde se decide qué falta.
       */
      _hPR('div', { key: 'stats', className: 'stats-grid' },
        [
          { label: 'Colegios en esta vista', val: escuelas.length, meta: FILTROS.filter(f => f.id === filtro).map(f => f.label)[0] || '' },
          { label: 'Con ID del proveedor',   val: escuelas.filter(e => (e.proveedor_school_id || '').trim()).length, meta: 'Ya provisionados' },
          { label: 'Sin ID todavía',         val: escuelas.filter(e => !(e.proveedor_school_id || '').trim()).length, meta: 'Esperan tu captura' },
        ].map(function (s, i) {
          return _hPR('div', { key: i, className: 'stat-card' },
            _hPR('div', { key: 'v', className: 'stat-value' }, s.val),
            _hPR('div', { key: 'l', className: 'stat-label' }, s.label),
            _hPR('div', { key: 'm', className: 'stat-meta' }, s.meta)
          );
        })
      ),
      /* ── Filtros + búsqueda ── */
      _hPR('div', {
        key: 'ctr',
        style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }
      },
        FILTROS.map(f => _hPR('button', {
          key: f.id,
          className: 'btn btn-sm ' + (filtro === f.id ? 'btn-primary' : 'btn-ghost'),
          onClick: () => setFiltro(f.id)
        }, f.label)),
        _hPR('input', {
          key: 'q',
          className: 'form-input',
          style: { maxWidth: 260, marginLeft: 'auto' },
          placeholder: 'Buscar colegio…',
          value: busqueda,
          onChange: e => setBusqueda(e.target.value)
        })
      ),

      /* ── Aviso de resultado ── */
      aviso ? _hPR('div', {
        key: 'av',
        style: {
          padding: '10px 14px', marginBottom: 14, fontSize: 12.5, borderRadius: 'var(--radius-sm)',
          background: aviso.tipo === 'ok' ? 'var(--green-glow)' : 'var(--red-glow)',
          border: '1px solid ' + (aviso.tipo === 'ok' ? 'var(--green)' : 'var(--red)'),
          color: aviso.tipo === 'ok' ? 'var(--green)' : 'var(--red)'
        }
      }, aviso.txt) : null,

      error ? _hPR('div', {
        key: 'err',
        style: {
          padding: '12px 14px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.5,
          background: 'var(--red-glow)', border: '1px solid var(--red)',
          borderRadius: 'var(--radius-sm)', color: 'var(--red)'
        }
      }, error) : null,

      /* ── Lista ── */
      cargando
        ? _hPR('div', { key: 'load', style: { padding: 40, textAlign: 'center', color: 'var(--ink-3)' } }, 'Cargando…')
        : (visibles.length === 0
            ? _hPR('div', {
                key: 'vacio',
                className: 'empty-state'
              },
                _hPR('div', { key: 'i', className: 'empty-icon' },
                  _hPR(Icon, { key: 'ic', name: (filtro === 'pendientes' || filtro === 'por_revisar') ? 'check' : 'search', size: 34, color: 'currentColor' })),
                _hPR('div', { key: 't', className: 'empty-text' },
                  filtro === 'por_revisar'
                    ? 'No hay documentación esperando revisión. Todo al corriente.'
                    : (filtro === 'pendientes'
                        ? 'No hay colegios esperando provisión. Todo al corriente.'
                        : 'Ningún colegio coincide.'))
              )
            : _hPR('div', { key: 'lista', style: { display: 'grid', gap: 10 } },
                visibles.map(esc => _hPR('div', {
                  key: esc.id,
                  className: 'card',
                  style: { padding: 14, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }
                },
                  _hPR('div', { key: 'info', style: { flex: '1 1 440px', minWidth: 0 } },
                    _hPR('div', { key: 'n', style: { fontWeight: 700, fontSize: 14, color: 'var(--ink)' } }, esc.nombre),
                    _hPR('div', {
                      key: 'm',
                      style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }
                    },
                      (esc.clave ? esc.clave + ' · ' : '')
                      + (esc.razon_social || esc.tipo_persona || '')
                      + ' · ' + esc.documentos_aprobados + ' documentos aprobados'
                    ),
                    _hPR('div', {
                      key: 'ct',
                      style: {
                        marginTop: 10, padding: '12px', display: 'grid', boxSizing: 'border-box',
                        gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 12,
                        width: '100%', maxWidth: 560,
                        border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-sm)',
                        background: 'rgba(40,45,101,.04)'
                      }
                    },
                      _hPR('div', { key: 'izq', style: { display: 'grid', gap: 8, minWidth: 0 } },
                        _hPR('select', {
                          key: 'sel',
                          className: 'form-input',
                          style: { fontSize: 12, padding: '6px 8px', width: '100%' },
                          title: 'Estatus del contrato',
                          value: esc.contrato_estado || 'sin_enviar',
                          onChange: e => cambiarContrato(esc, e.target.value)
                        },
                          _hPR('option', { key: 'a', value: 'sin_enviar' }, 'Contrato sin enviar'),
                          _hPR('option', { key: 'b', value: 'enviado' }, 'Contrato enviado'),
                          _hPR('option', { key: 'c', value: 'firmado' }, 'Contrato firmado')
                        ),
                        esc.contacto_contrato_correo ? _hPR('span', {
                          key: 'dest',
                          style: { fontSize: 11.5, color: 'var(--ink-3)', wordBreak: 'break-word' }
                        }, 'Firma: ' + (esc.contacto_contrato_nombre || '') + ' <' + esc.contacto_contrato_correo + '>')
                          : _hPR('span', { key: 'sinc', style: { fontSize: 11.5, color: 'var(--amber)' } }, 'Falta el correo de firma del colegio')
                      ),
                      _hPR('div', { key: 'der', style: { display: 'grid', gap: 8, justifyItems: 'stretch', width: 170 } },
                        esc.contrato_firmado_nombre ? _hPR('button', {
                        key: 'vfirm',
                        className: 'btn btn-secondary btn-sm',
                        style: { width: '100%' },
                        title: 'Ver el contrato firmado que subió el colegio',
                        onClick: () => abrirDocumentoPrivado(
                          'api.php?action=descargar_contrato_firmado&escuela_id=' + esc.id,
                          AuthController.getToken ? AuthController.getToken() : '',
                          esc.contrato_firmado_nombre,
                          (m) => setAviso({ tipo: 'error', txt: m })
                        )
                      }, 'Ver contrato firmado') : null,
                        _hPR('button', {
                          key: 'solfirma',
                          className: 'btn btn-primary',
                          style: { width: '100%' },
                          disabled: enviandoContrato === esc.id,
                          title: 'Elige el contrato, confirma el correo del firmante y solicita las firmas',
                          onClick: () => abrirFirma(esc)
                        }, esc.contrato_nombre ? 'Solicitar firmas / reenviar' : 'Solicitar firmas')
                      )
                    ),
                    esc.tiene_id ? _hPR('div', {
                      key: 'ya',
                      style: { fontSize: 11.5, color: 'var(--green)', marginTop: 4, fontWeight: 600 }
                    }, 'ID actual: ' + esc.proveedor_school_id
                       + (esc.capturado_por_nombre ? ' · lo capturó ' + esc.capturado_por_nombre : '')) : null
                  ),
                  _hPR('div', { key: 'acc', style: { flex: '0 0 320px', maxWidth: '100%', display: 'grid', gap: 8 } },
                    _hPR('input', {
                      key: 'in',
                      className: 'form-input',
                      style: { width: '100%', boxSizing: 'border-box', fontFamily: 'var(--mono)' },
                      placeholder: esc.tiene_id ? 'Reemplazar ID…' : 'ID del proveedor',
                      value: borrador[esc.id] !== undefined ? borrador[esc.id] : '',
                      onChange: e => setBorrador(b => ({ ...b, [esc.id]: e.target.value })),
                      onKeyDown: e => { if (e.key === 'Enter') guardar(esc); }
                    }),
                    _hPR('div', { key: 'bt', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
                      _hPR('button', {
                        key: 'btn',
                        className: 'btn btn-primary btn-sm',
                        disabled: guardando === esc.id,
                        onClick: () => guardar(esc)
                      }, guardando === esc.id ? 'Guardando…' : (esc.tiene_id ? 'Reemplazar' : 'Guardar')),
                      _hPR('button', {
                        key: 'docs',
                        className: 'btn btn-secondary btn-sm',
                        onClick: () => abrirDocs(esc),
                        title: 'Ver los documentos que subió este colegio'
                      }, 'Ver documentos')
                    )
                  )
                ))
              )
          ),

      /* ── Modal "Solicitar firmas" ── */
      firmaModal ? _hPR('div', {
        key: 'modfirma',
        className: 'modal-backdrop',
        onClick: e => { if (e.target === e.currentTarget && enviandoContrato !== firmaModal.esc.id) setFirmaModal(null); }
      },
        _hPR('div', { className: 'modal', style: { maxWidth: 480 } },
          _hPR('div', { key: 'h', className: 'modal-header' },
            _hPR('div', { key: 't', className: 'modal-title' }, 'Solicitar firmas · ' + firmaModal.esc.nombre),
            _hPR('button', { key: 'x', className: 'btn btn-ghost btn-sm', disabled: enviandoContrato === firmaModal.esc.id, onClick: () => setFirmaModal(null) }, 'Cerrar')
          ),
          _hPR('div', { key: 'b', className: 'modal-body', style: { display: 'grid', gap: 14 } },
            _hPR('div', { key: 'doc' },
              _hPR('div', { key: 'l', style: { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 6 } }, 'Documento'),
              _hPR('label', { key: 'f', className: 'btn btn-ghost btn-sm', style: { cursor: 'pointer', marginBottom: 0 } },
                firmaModal.archivo ? firmaModal.archivo.name
                  : (firmaModal.esc.contrato_nombre ? firmaModal.esc.contrato_nombre + ' (cambiar PDF)' : 'Elegir PDF del contrato'),
                _hPR('input', {
                  key: 'in', type: 'file', accept: 'application/pdf,.pdf', style: { display: 'none' },
                  onChange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) setFirmaModal(m => ({ ...m, archivo: f })); }
                })
              )
            ),
            _hPR('div', { key: 'mail' },
              _hPR('div', { key: 'l', style: { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 6 } }, 'Correo electrónico del firmante'),
              _hPR('input', {
                key: 'i', className: 'form-input', type: 'email', placeholder: 'correo@colegio.com',
                value: firmaModal.correo,
                onChange: e => { const v = e.target.value; setFirmaModal(m => ({ ...m, correo: v })); }
              }),
              (firmaModal.esc.contacto_contrato_nombre ? _hPR('div', { key: 'n', style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 } }, 'Contacto de firma del colegio: ' + firmaModal.esc.contacto_contrato_nombre) : null)
            ),
            _hPR('div', { key: 'met' },
              _hPR('div', { key: 'l', style: { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 6 } }, 'Método de firma permitido'),
              _hPR('label', { key: 'e', style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 6, cursor: 'pointer' } },
                _hPR('input', { key: 'c', type: 'checkbox', checked: firmaModal.efirma, onChange: e => { const v = e.target.checked; setFirmaModal(m => ({ ...m, efirma: v })); } }),
                'Firma electrónica avanzada (e.firma)'),
              _hPR('label', { key: 's', style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' } },
                _hPR('input', { key: 'c', type: 'checkbox', checked: firmaModal.simple, onChange: e => { const v = e.target.checked; setFirmaModal(m => ({ ...m, simple: v })); } }),
                'Firma electrónica simple')
            ),
            _hPR('div', { key: 'msg' },
              _hPR('div', { key: 'l', style: { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 6 } }, 'Mensaje para firmantes'),
              _hPR('input', {
                key: 'i', className: 'form-input', maxLength: 1000, value: firmaModal.mensaje,
                onChange: e => { const v = e.target.value; setFirmaModal(m => ({ ...m, mensaje: v })); }
              })
            ),
            _hPR('button', {
              key: 'go', className: 'btn btn-primary', style: { width: '100%' },
              disabled: enviandoContrato === firmaModal.esc.id || !firmaModal.correo.trim() || (!firmaModal.archivo && !firmaModal.esc.contrato_nombre),
              onClick: () => enviarContrato(firmaModal.esc, firmaModal.archivo, {
                correo: firmaModal.correo.trim(), mensaje: firmaModal.mensaje.trim(),
                efirma: firmaModal.efirma, simple: firmaModal.simple
              })
            }, enviandoContrato === firmaModal.esc.id ? 'Enviando…' : 'Solicitar firmas')
          )
        )
      ) : null,

      /* ── Modal de documentos ── */
      docsEsc ? _hPR('div', {
        key: 'moddocs',
        className: 'modal-backdrop',
        onClick: e => { if (e.target === e.currentTarget) setDocsEsc(null); }
      },
        _hPR('div', { className: 'modal modal-lg' },
          _hPR('div', { key: 'h', className: 'modal-header' },
            _hPR('div', { key: 't', className: 'modal-title' }, 'Documentos · ' + docsEsc.escuela.nombre),
            _hPR('button', {
              key: 'x', className: 'btn btn-ghost btn-sm', onClick: () => setDocsEsc(null)
            }, 'Cerrar')
          ),
          _hPR('div', { key: 'b', className: 'modal-body' },
            _hPR('div', {
              key: 'nota',
              style: { fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 12 }
            }, 'El contador ya revisó estos documentos. Puedes rechazar alguno si no te sirve para el trámite con el proveedor: al hacerlo, el colegio recibe un correo con el motivo y este colegio sale de la cola hasta que lo corrija.'),

            // Datos que capturó el colegio en el formulario (solo lectura).
            (datosForm && !docsCargando) ? _hPR('div', { key: 'dform', style: { marginBottom: 16, display: 'grid', gap: 12 } },
              PR_GRUPOS_FORM.map((g, gi) => _hPR('div', { key: 'g' + gi },
                _hPR('div', {
                  key: 't',
                  style: { fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: .3, marginBottom: 6 }
                }, g.titulo),
                _hPR('div', { key: 'c', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 } },
                  g.campos.map(([k, etiqueta]) => {
                    const v = datosForm[k];
                    const vacio = v === null || v === undefined || String(v).trim() === '';
                    return _hPR('div', { key: k, style: { fontSize: 12.5, minWidth: 0 } },
                      _hPR('div', { key: 'e', style: { color: 'var(--ink-3)', fontSize: 11 } }, etiqueta),
                      _hPR('div', {
                        key: 'v',
                        style: { color: vacio ? 'var(--amber)' : 'var(--ink)', fontWeight: vacio ? 400 : 600, wordBreak: 'break-word' }
                      }, vacio ? 'Sin capturar' : String(v))
                    );
                  })
                )
              ))
            ) : null,

            docsCargando
              ? _hPR('div', { key: 'l', style: { padding: 24, textAlign: 'center', color: 'var(--ink-3)' } }, 'Cargando…')
              : (docsEsc.documentos.length === 0
                  ? _hPR('div', { key: 'v', style: { padding: 24, textAlign: 'center', color: 'var(--ink-3)' } }, 'Este colegio no tiene documentos subidos.')
                  : _hPR('div', { key: 'lst', style: { display: 'grid', gap: 8 } },
                      docsEsc.documentos.map(doc => {
                        const est = PR_ESTADO_DOC[doc.estado] || { label: doc.estado, color: 'var(--ink-3)' };
                        return _hPR('div', {
                          key: doc.id,
                          style: {
                            padding: 10, border: '1px solid var(--border-glow)',
                            borderRadius: 'var(--radius-sm)', display: 'flex',
                            gap: 10, alignItems: 'center', flexWrap: 'wrap'
                          }
                        },
                          _hPR('div', { key: 'i', style: { flex: '1 1 200px', minWidth: 0 } },
                            _hPR('div', { key: 'n', style: { fontSize: 13, fontWeight: 600, color: 'var(--ink)' } },
                              PR_DOCS[doc.tipo] || doc.tipo),
                            _hPR('div', { key: 'e', style: { fontSize: 11.5, color: est.color, fontWeight: 700, marginTop: 2 } },
                              est.label + (doc.motivo_rechazo ? ' — ' + doc.motivo_rechazo : ''))
                          ),
                          _hPR('button', {
                            key: 'd', className: 'btn btn-ghost btn-sm',
                            onClick: () => descargarDoc(doc)
                          }, 'Ver'),
                          // 'Rechazar' se muestra TAMBIÉN para documentos ya
                          // aprobados, y es deliberado: desde el 23-sep el
                          // colegio no puede reemplazar un documento aprobado,
                          // así que rechazarlo es la ÚNICA forma de
                          // desbloquearlo si se aprobó por error. Sin esto, un
                          // documento mal aprobado quedaría congelado para
                          // siempre.
                          doc.estado !== 'rechazado' ? _hPR('button', {
                            key: 'r', className: 'btn btn-ghost btn-sm',
                            style: { color: 'var(--red)' },
                            disabled: revisandoDoc === doc.id,
                            onClick: () => revisarDoc(doc, 'rechazar')
                          }, revisandoDoc === doc.id ? '…' : 'Rechazar') : null,
                          doc.estado === 'pendiente' ? _hPR('button', {
                            key: 'a', className: 'btn btn-primary btn-sm',
                            disabled: revisandoDoc === doc.id,
                            onClick: () => revisarDoc(doc, 'aprobar')
                          }, revisandoDoc === doc.id ? '…' : 'Aprobar') : null
                        );
                      })
                    )
                )
          )
        )
      ) : null
    )
  );
}