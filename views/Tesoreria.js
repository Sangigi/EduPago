// views/Tesoreria.js — Panel del rol 'tesoreria'
//
// Calendario de cuentas por pagar a proveedores: qué se debe, a quién, y qué
// día vence. Es la pantalla que faltaba — el módulo de Gastos solo guardaba
// historial de dinero ya salido, así que no había dónde preguntar "¿a quién le
// tengo que pagar este mes?".
//
// Mezcla dos fuentes que se complementan:
//   · cuentas      — gastos con estado='pendiente'. Deuda concreta y con monto.
//   · recurrentes  — proveedores con dia_pago_mes a los que TODAVÍA nadie les
//                    capturó el gasto del mes. Aparecen para que el calendario
//                    no se vea vacío justo antes de cada pago recurrente.
//
// Panel autónomo (patrón Contador/Provision): no depende de cargar_datos.php.
// React.createElement directo, como MenuPerfil.js y Provision.js.

var _hTS = React.createElement;

function Tesoreria({ user, onLogout }) {
  const { useState, useEffect, useCallback } = React;

  const hoyISO = new Date().toISOString().slice(0, 10);
  const mesActual = hoyISO.slice(0, 7);

  const [mes, setMes]             = useState(mesActual);
  const [alcance, setAlcance]     = useState('mes');
  const [datos, setDatos]         = useState(null);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [moviendo, setMoviendo]   = useState(null);
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

  const cargar = useCallback(async (m, a) => {
    setCargando(true);
    setError('');
    try {
      setDatos(await pedir('tesoreria_cuentas_por_pagar', { mes: m, alcance: a }));
    } catch (e) {
      setError(e.message);
      setDatos(null);
    }
    setCargando(false);
  }, [pedir]);

  useEffect(() => { cargar(mes, alcance); }, [mes, alcance, cargar]);

  const marcar = async (c, estado) => {
    setMoviendo(c.id);
    setAviso(null);
    try {
      await pedir('tesoreria_marcar_pagado', { gasto_id: c.id, estado: estado });
      setAviso({ tipo: 'ok', txt: c.concepto + ': marcado como ' + estado + '.' });
      await cargar(mes, alcance);
    } catch (e) {
      setAviso({ tipo: 'error', txt: c.concepto + ': ' + e.message });
    }
    setMoviendo(null);
  };

  const dinero = n => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Mueve el mes mostrado. Se construye con Date para no tener que pensar en
  // el cambio de año al pasar de diciembre a enero.
  const moverMes = (delta) => {
    const d = new Date(mes + '-01T12:00:00');
    d.setMonth(d.getMonth() + delta);
    setMes(d.toISOString().slice(0, 7));
  };

  const cuentas     = (datos && datos.cuentas) || [];
  const recurrentes = (datos && datos.recurrentes) || [];

  return _hTS('div', { style: { minHeight: '100vh', background: 'var(--bg-main)' } },

    /* ── Barra superior ── */
    _hTS('div', {
      key: 'top',
      style: {
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '14px 20px', borderBottom: '1px solid var(--border-glow)',
        background: 'var(--bg-surface)'
      }
    },
      _hTS('div', { key: 't', style: { fontWeight: 800, fontSize: 16, color: 'var(--ink)' } }, 'Cuentas por pagar'),
      _hTS('div', { key: 'u', style: { marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' } }, user?.nombre || ''),
      _hTS('button', { key: 'out', className: 'btn btn-ghost btn-sm', onClick: onLogout }, 'Cerrar sesión')
    ),

    _hTS('div', { key: 'body', style: { padding: 20, maxWidth: 1100, margin: '0 auto' } },

      /* ── Selector de mes ── */
      _hTS('div', {
        key: 'nav',
        style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }
      },
        _hTS('button', { key: 'p', className: 'btn btn-ghost btn-sm', onClick: () => moverMes(-1) }, '‹ Mes anterior'),
        _hTS('div', {
          key: 'm',
          style: { fontWeight: 700, fontSize: 14, minWidth: 130, textAlign: 'center', color: 'var(--ink)' }
        }, new Date(mes + '-01T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })),
        _hTS('button', { key: 'n', className: 'btn btn-ghost btn-sm', onClick: () => moverMes(1) }, 'Mes siguiente ›'),
        _hTS('button', {
          key: 'hoy', className: 'btn btn-ghost btn-sm', onClick: () => setMes(mesActual)
        }, 'Hoy'),
        _hTS('label', {
          key: 'todo',
          style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }
        },
          _hTS('input', {
            key: 'chk', type: 'checkbox',
            checked: alcance === 'todo',
            onChange: e => setAlcance(e.target.checked ? 'todo' : 'mes')
          }),
          'Incluir vencido de meses anteriores'
        )
      ),

      /* ── Totales ── */
      datos ? _hTS('div', {
        key: 'tot',
        style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }
      },
        _hTS('div', {
          key: 'a',
          className: 'card',
          style: { padding: 14, flex: '1 1 180px' }
        },
          _hTS('div', { key: 'l', style: { fontSize: 11.5, color: 'var(--ink-3)' } }, 'Total pendiente'),
          _hTS('div', {
            key: 'v',
            style: { fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--ink)', overflowWrap: 'anywhere' }
          }, dinero(datos.total_pendiente))
        ),
        _hTS('div', {
          key: 'b',
          className: 'card',
          style: { padding: 14, flex: '1 1 180px' }
        },
          _hTS('div', { key: 'l', style: { fontSize: 11.5, color: 'var(--ink-3)' } }, 'Vencido'),
          _hTS('div', {
            key: 'v',
            style: {
              fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)',
              color: Number(datos.total_vencido) > 0 ? 'var(--red)' : 'var(--ink)',
              overflowWrap: 'anywhere'
            }
          }, dinero(datos.total_vencido))
        )
      ) : null,

      aviso ? _hTS('div', {
        key: 'av',
        style: {
          padding: '10px 14px', marginBottom: 14, fontSize: 12.5, borderRadius: 'var(--radius-sm)',
          background: aviso.tipo === 'ok' ? 'var(--green-glow)' : 'var(--red-glow)',
          border: '1px solid ' + (aviso.tipo === 'ok' ? 'var(--green)' : 'var(--red)'),
          color: aviso.tipo === 'ok' ? 'var(--green)' : 'var(--red)'
        }
      }, aviso.txt) : null,

      error ? _hTS('div', {
        key: 'err',
        style: {
          padding: '12px 14px', marginBottom: 14, fontSize: 12.5, lineHeight: 1.5,
          background: 'var(--red-glow)', border: '1px solid var(--red)',
          borderRadius: 'var(--radius-sm)', color: 'var(--red)'
        }
      }, error) : null,

      cargando ? _hTS('div', {
        key: 'load', style: { padding: 40, textAlign: 'center', color: 'var(--ink-3)' }
      }, 'Cargando…') : null,

      /* ── Cuentas pendientes ── */
      (!cargando && cuentas.length > 0) ? _hTS('div', { key: 'cts', style: { marginBottom: 22 } },
        _hTS('div', {
          key: 'h', style: { fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--ink-2)' }
        }, 'Por pagar (' + cuentas.length + ')'),
        _hTS('div', { key: 'l', style: { display: 'grid', gap: 8 } },
          cuentas.map(c => _hTS('div', {
            key: c.id,
            className: 'card',
            style: {
              padding: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
              borderLeft: '3px solid ' + (c.vencido ? 'var(--red)' : 'var(--border-glow)')
            }
          },
            _hTS('div', { key: 'i', style: { flex: '1 1 200px', minWidth: 0 } },
              _hTS('div', {
                key: 'c', style: { fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }
              }, c.concepto),
              _hTS('div', {
                key: 'm', style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }
              },
                (c.proveedor_nombre || 'Sin proveedor')
                + (c.escuela_nombre ? ' · ' + c.escuela_nombre : '')
                + (c.vence ? ' · vence ' + c.vence : '')
              ),
              c.vencido ? _hTS('div', {
                key: 'v', style: { fontSize: 11.5, color: 'var(--red)', fontWeight: 700, marginTop: 3 }
              }, 'Vencido hace ' + Math.abs(c.dias_para_vencer) + ' días') : null
            ),
            _hTS('div', {
              key: 'mo',
              style: { fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: 'var(--ink)' }
            }, dinero(c.monto)),
            _hTS('button', {
              key: 'ok',
              className: 'btn btn-primary btn-sm',
              disabled: moviendo === c.id,
              onClick: () => marcar(c, 'pagado')
            }, moviendo === c.id ? '…' : 'Marcar pagado'),
            _hTS('button', {
              key: 'x',
              className: 'btn btn-ghost btn-sm',
              disabled: moviendo === c.id,
              onClick: () => marcar(c, 'cancelado')
            }, 'Cancelar')
          ))
        )
      ) : null,

      /* ── Recurrentes sin capturar ── */
      (!cargando && recurrentes.length > 0) ? _hTS('div', { key: 'rec' },
        _hTS('div', {
          key: 'h', style: { fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--ink-2)' }
        }, 'Les toca este mes, sin gasto capturado (' + recurrentes.length + ')'),
        _hTS('div', {
          key: 'sub', style: { fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 8, lineHeight: 1.5 }
        }, 'Proveedores con día de pago fijo a los que nadie les ha capturado el gasto de este mes. Captúralo desde Gastos para que aparezca arriba con su monto.'),
        _hTS('div', { key: 'l', style: { display: 'grid', gap: 6 } },
          recurrentes.map(r => _hTS('div', {
            key: r.id,
            className: 'card',
            style: { padding: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }
          },
            _hTS('div', { key: 'n', style: { flex: '1 1 180px', fontSize: 13, color: 'var(--ink)' } }, r.nombre),
            _hTS('div', {
              key: 'e', style: { fontSize: 11.5, color: 'var(--ink-3)' }
            }, r.escuela_nombre || ''),
            _hTS('div', {
              key: 'd',
              style: { fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--amber)', fontWeight: 700 }
            }, 'día ' + r.dia_pago_mes + ' · ' + r.fecha_estimada)
          ))
        )
      ) : null,

      (!cargando && !error && cuentas.length === 0 && recurrentes.length === 0) ? _hTS('div', {
        key: 'vacio',
        style: { padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }
      }, 'Nada por pagar en este mes.') : null
    )
  );
}
