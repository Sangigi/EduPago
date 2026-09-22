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

function Provision({ user, onLogout }) {
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

  return _hPR('div', { className: 'app-shell', style: { minHeight: '100vh', background: 'var(--bg-main)' } },

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
      _hPR('button', {
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
                  }, guardando === esc.id ? 'Guardando…' : (esc.tiene_id ? 'Reemplazar' : 'Guardar'))
                ))
              )
          )
    )
  );
}
