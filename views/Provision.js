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
  const [filtro, setFiltro]       = useState('pendientes');
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

  // Etiquetas legibles. Deben coincidir con MC_TIPOS_DOCUMENTO (MiCuenta.js) y
  // CT_TIPOS_DOCUMENTO (Contador.js): la misma lista vive hoy en tres vistas.
  const PR_DOCS = {
    identificacion_frente:  'Identificación dueño del negocio (Frente)',
    identificacion_reverso: 'Identificación dueño del negocio (Reverso)',
    estado_cuenta_bancario: 'Portada del estado de cuenta bancario',
    comprobante_domicilio:  'Comprobante de domicilio',
    constancia_fiscal:      'Constancia Fiscal',
    acta_constitutiva:      'Acta constitutiva',
  };
  const PR_ESTADO_DOC = {
    pendiente: { label: 'En revisión', color: 'var(--amber)' },
    aprobado:  { label: 'Aprobado',    color: 'var(--green)' },
    rechazado: { label: 'Rechazado',   color: 'var(--red)' },
  };

  const abrirDocs = async (esc) => {
    setDocsEsc({ escuela: esc, documentos: [] });
    setDocsCargando(true);
    try {
      const j = await pedir('listar_documentos_escuela', { escuela_id: esc.id });
      setDocsEsc({ escuela: esc, documentos: j.documentos || [] });
    } catch (e) {
      setAviso({ tipo: 'error', txt: 'No se pudieron cargar los documentos: ' + e.message });
      setDocsEsc(null);
    }
    setDocsCargando(false);
  };

  const descargarDoc = async (doc) => {
    try {
      const token = AuthController.getToken ? AuthController.getToken() : '';
      const r = await fetch('api.php?action=descargar_documento_escuela&documento_id=' + doc.id, {
        headers: { Authorization: token ? 'Bearer ' + token : '' },
      });
      if (!r.ok) throw new Error('No se pudo descargar');
      const url = URL.createObjectURL(await r.blob());
      window.open(url, '_blank');
      // Ver la nota en views/Contador.js: sin esto el Blob queda retenido en la
      // pestaña hasta cerrarla y el panel se degrada con el uso.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setAviso({ tipo: 'error', txt: e.message });
    }
  };

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
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '14px 20px', borderBottom: '1px solid var(--border-glow)',
        background: 'var(--bg-surface)'
      }
    },
      _hPR('div', { key: 't', style: { fontWeight: 800, fontSize: 16, color: 'var(--ink)' } }, 'Provisión de colegios'),
      _hPR('div', { key: 'u', style: { marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' } }, user?.nombre || ''),
      menuPerfil || _hPR('button', {
        key: 'out', className: 'btn btn-ghost btn-sm', onClick: onLogout
      }, 'Cerrar sesión')
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
                style: { padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }
              }, filtro === 'pendientes'
                   ? 'No hay colegios esperando provisión. Todo al corriente.'
                   : 'Ningún colegio coincide.')
            : _hPR('div', { key: 'lista', style: { display: 'grid', gap: 10 } },
                visibles.map(esc => _hPR('div', {
                  key: esc.id,
                  className: 'card',
                  style: { padding: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }
                },
                  _hPR('div', { key: 'info', style: { flex: '1 1 220px', minWidth: 0 } },
                    _hPR('div', { key: 'n', style: { fontWeight: 700, fontSize: 14, color: 'var(--ink)' } }, esc.nombre),
                    _hPR('div', {
                      key: 'm',
                      style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }
                    },
                      (esc.clave ? esc.clave + ' · ' : '')
                      + (esc.razon_social || esc.tipo_persona || '')
                      + ' · ' + esc.documentos_aprobados + ' documentos aprobados'
                    ),
                    esc.tiene_id ? _hPR('div', {
                      key: 'ya',
                      style: { fontSize: 11.5, color: 'var(--green)', marginTop: 4, fontWeight: 600 }
                    }, 'ID actual: ' + esc.proveedor_school_id
                       + (esc.capturado_por_nombre ? ' · lo capturó ' + esc.capturado_por_nombre : '')) : null
                  ),
                  _hPR('input', {
                    key: 'in',
                    className: 'form-input',
                    style: { flex: '0 1 200px', fontFamily: 'var(--mono)' },
                    placeholder: esc.tiene_id ? 'Reemplazar ID…' : 'ID del proveedor',
                    value: borrador[esc.id] !== undefined ? borrador[esc.id] : '',
                    onChange: e => setBorrador(b => ({ ...b, [esc.id]: e.target.value })),
                    onKeyDown: e => { if (e.key === 'Enter') guardar(esc); }
                  }),
                  _hPR('button', {
                    key: 'btn',
                    className: 'btn btn-primary btn-sm',
                    disabled: guardando === esc.id,
                    onClick: () => guardar(esc)
                  }, guardando === esc.id ? 'Guardando…' : (esc.tiene_id ? 'Reemplazar' : 'Guardar')),
                  _hPR('button', {
                    key: 'docs',
                    className: 'btn btn-ghost btn-sm',
                    onClick: () => abrirDocs(esc),
                    title: 'Ver los documentos que subió este colegio'
                  }, 'Ver documentos')
                ))
              )
          ),

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
