// views/components/PanelInvitaciones.js
//
// Genera enlaces de invitación (→ registro.html?t=TOKEN) para que un colegio
// se dé de alta solo, llenando sus propios datos, y lista/gestiona las
// invitaciones ya creadas. El backend (invitacion_crear / invitacion_ver /
// invitacion_enviar / invitacion_resolver / invitaciones_listar) y la propia
// registro.html ya existían — esto es el frontend que faltaba: antes no
// había ningún botón que llamara a invitacion_crear, así que no existía
// forma de llegar a registro.html desde la app.
//
// Uso: <PanelInvitaciones esSuperAdmin={true|false} />
// - superadmin/admin: ve y puede generar sus propias invitaciones, y ADEMÁS
//   ve y resuelve (aprobar/rechazar) las que estén en estado 'enviado' —
//   solo superadmin puede resolver (así lo exige invitacion_resolver).
// - distribuidor: ve y genera solo las suyas (el backend ya filtra por
//   creado_por), sin botones de aprobar/rechazar.

var _hPI = React.createElement;

async function _apiPostInv(action, body) {
  const res = await fetch('api.php?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AuthController.getToken() },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

var _ESTADO_INV = {
  pendiente: { label: 'Pendiente de llenar', clase: 'badge-gray' },
  enviado:   { label: 'Enviado, por revisar', clase: 'badge-amber' },
  aprobada:  { label: 'Aprobada', clase: 'badge-green' },
  rechazada: { label: 'Rechazada', clase: 'badge-red' },
  expirada:  { label: 'Expirada', clase: 'badge-gray' },
  cancelada: { label: 'Cancelada', clase: 'badge-gray' },
};

function ModalGenerarInvitacion({ onCerrar, onCreada }) {
  const { useState } = React;
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null); // { liga, expira_horas }
  const [copiado, setCopiado] = useState(false);

  const generar = async () => {
    setError('');
    if (!nombre.trim() || !email.trim()) {
      setError('Nombre y correo de contacto son obligatorios.');
      return;
    }
    setGuardando(true);
    try {
      const res = await _apiPostInv('invitacion_crear', {
        contacto_nombre: nombre.trim(),
        contacto_email: email.trim(),
        contacto_tel: tel.trim(),
        notas: notas.trim(),
      });
      if (res.success === false) {
        setError(res.error || 'No se pudo generar la invitación.');
      } else {
        setResultado(res);
        if (onCreada) onCreada();
      }
    } catch (e) {
      setError('Error de conexión: ' + e.message);
    }
    setGuardando(false);
  };

  const copiar = () => {
    if (!resultado) return;
    try {
      navigator.clipboard.writeText(resultado.liga);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) { /* clipboard no disponible; el input ya queda seleccionado al enfocarlo */ }
  };

  return _hPI('div', { className: 'modal-backdrop', onClick: onCerrar },
    _hPI('div', { className: 'modal', style: { maxWidth: 440 }, onClick: function (e) { e.stopPropagation(); } },
      _hPI('div', { key: 'h', className: 'modal-header' },
        _hPI('div', { key: 't', className: 'modal-title' }, 'Generar invitación para un colegio'),
        _hPI('button', { key: 'x', className: 'btn-ghost', onClick: onCerrar },
          _hPI(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      _hPI('div', { key: 'b', className: 'modal-body' },
        resultado ? [
          _hPI('div', { key: 'ok', style: { fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 } },
            'Enlace generado. Compártelo con el colegio — expira en ' + resultado.expira_horas + ' horas.'),
          _hPI('div', { key: 'liga', className: 'form-group' },
            _hPI('input', {
              className: 'form-input', readOnly: true, value: resultado.liga,
              onFocus: function (e) { e.target.select(); }
            })
          ),
          _hPI('button', { key: 'copiar', className: 'btn btn-secondary btn-sm', onClick: copiar },
            copiado ? 'Copiado ✓' : 'Copiar enlace')
        ] : [
          _hPI('div', { key: 'c1', className: 'form-group' },
            _hPI('label', { className: 'form-label' }, 'Nombre de contacto'),
            _hPI('input', {
              className: 'form-input', value: nombre, autoFocus: true,
              onChange: function (e) { setNombre(e.target.value); }
            })
          ),
          _hPI('div', { key: 'c2', className: 'form-group' },
            _hPI('label', { className: 'form-label' }, 'Correo de contacto'),
            _hPI('input', {
              className: 'form-input', type: 'email', value: email,
              onChange: function (e) { setEmail(e.target.value); }
            })
          ),
          _hPI('div', { key: 'c3', className: 'form-group' },
            _hPI('label', { className: 'form-label' }, 'Teléfono (opcional)'),
            _hPI('input', {
              className: 'form-input', value: tel,
              onChange: function (e) { setTel(e.target.value); }
            })
          ),
          _hPI('div', { key: 'c4', className: 'form-group' },
            _hPI('label', { className: 'form-label' }, 'Notas (opcional)'),
            _hPI('input', {
              className: 'form-input', value: notas,
              onChange: function (e) { setNotas(e.target.value); }
            })
          ),
          error ? _hPI('div', { key: 'err', style: { color: 'var(--red)', fontSize: 12.5, marginTop: 6 } }, error) : null
        ]
      ),
      _hPI('div', { key: 'f', className: 'modal-footer' },
        resultado
          ? _hPI('button', { key: 'listo', className: 'btn btn-primary', onClick: onCerrar }, 'Listo')
          : [
              _hPI('button', { key: 'cancel', className: 'btn btn-secondary', onClick: onCerrar }, 'Cancelar'),
              _hPI('button', {
                key: 'gen', className: 'btn btn-primary', disabled: guardando, onClick: generar
              }, guardando ? 'Generando…' : 'Generar enlace')
            ]
      )
    )
  );
}

// `datos_enviados` llega como texto JSON tal como se guardó en la BD — el
// backend no lo decodifica porque para invitaciones_listar es un valor
// opaco; aquí sí nos interesa su contenido para el detalle.
function _datosEnviadosDe(inv) {
  if (!inv.datos_enviados) return null;
  try {
    const d = typeof inv.datos_enviados === 'string' ? JSON.parse(inv.datos_enviados) : inv.datos_enviados;
    return d && typeof d === 'object' ? d : null;
  } catch (e) {
    return null;
  }
}

function ModalDetalleInvitacion({ inv, esSuperAdmin, onCerrar, onResolver, resolviendo }) {
  const d = _datosEnviadosDe(inv) || {};
  const info = _ESTADO_INV[inv.estado] || { label: inv.estado, clase: 'badge-gray' };
  const fila = function (label, valor) {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null;
    return _hPI('div', { key: label, style: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border-glow)', fontSize: 13 } },
      _hPI('span', { style: { color: 'var(--ink-3)' } }, label),
      _hPI('span', { style: { fontWeight: 600, textAlign: 'right' } }, String(valor))
    );
  };

  return _hPI('div', { className: 'modal-backdrop', onClick: onCerrar },
    _hPI('div', { className: 'modal', style: { maxWidth: 460 }, onClick: function (e) { e.stopPropagation(); } },
      _hPI('div', { key: 'h', className: 'modal-header' },
        _hPI('div', { key: 't', className: 'modal-title' }, 'Detalle de la invitación'),
        _hPI('button', { key: 'x', className: 'btn-ghost', onClick: onCerrar },
          _hPI(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      _hPI('div', { key: 'b', className: 'modal-body' },
        _hPI('div', { key: 'estado', style: { marginBottom: 10 } },
          _hPI('span', { className: 'badge ' + info.clase }, info.label)),
        Object.keys(d).length === 0
          ? _hPI('div', { key: 'sin', style: { fontSize: 12.5, color: 'var(--ink-4)' } },
              'El colegio todavía no llena su formulario — aquí aparecerán sus datos en cuanto lo haga.')
          : _hPI('div', { key: 'datos' },
              fila('Colegio', d.nombre),
              fila('Correo', d.email),
              fila('Teléfono', d.telefono),
              fila('Número de alumnos', d.num_alumnos),
              fila('RFC', d.rfc),
              fila('RVOE', d.rvoe),
              fila('Dirección', d.direccion)
            ),
        _hPI('div', { key: 'sep', style: { margin: '14px 0', borderTop: '1px solid var(--border-glow)' } }),
        fila('Contacto original', inv.contacto_nombre),
        fila('Correo de contacto', inv.contacto_email),
        fila('Teléfono de contacto', inv.contacto_tel),
        esSuperAdmin ? fila('Generado por', inv.creado_por_nombre ? (inv.creado_por_nombre + (inv.creado_por_rol ? ' · ' + inv.creado_por_rol : '')) : '—') : null,
        fila('Creada', String(inv.fecha_alta || '').slice(0, 10))
      ),
      (esSuperAdmin && inv.estado === 'enviado')
        ? _hPI('div', { key: 'f', className: 'modal-footer' },
            _hPI('button', {
              key: 'r', className: 'btn btn-secondary', disabled: resolviendo,
              onClick: function () { onResolver(inv.id, 'rechazar'); }
            }, 'Rechazar'),
            _hPI('button', {
              key: 'a', className: 'btn btn-primary', disabled: resolviendo,
              onClick: function () { onResolver(inv.id, 'aprobar'); }
            }, resolviendo ? 'Aprobando…' : 'Aprobar y crear colegio')
          )
        : null
    )
  );
}

function PanelInvitaciones({ esSuperAdmin }) {
  const { useState, useEffect, useMemo } = React;
  const [invitaciones, setInvitaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [detalleId, setDetalleId] = useState(null);
  const [resolviendo, setResolviendo] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await _apiPostInv('invitaciones_listar', {});
      if (res.success) setInvitaciones(res.invitaciones || []);
    } catch (e) { /* sin red: se deja la lista como estaba */ }
    setCargando(false);
  };

  useEffect(function () { cargar(); }, []);

  const resolver = async (id, accion) => {
    if (accion === 'rechazar' && !confirm('¿Rechazar esta invitación?')) return;
    setResolviendo(id);
    try {
      const res = await _apiPostInv('invitacion_resolver', { id: id, accion: accion });
      if (res.success === false) alert(res.error || 'No se pudo resolver la invitación.');
      else { setDetalleId(null); await cargar(); }
    } catch (e) {
      alert('Error de conexión: ' + e.message);
    }
    setResolviendo(null);
  };

  // Con esto un superadmin puede ver de un vistazo lo generado por un
  // distribuidor en particular, sin necesitar una pantalla aparte.
  const lista = useMemo(function () {
    const q = busqueda.trim().toLowerCase();
    if (!q || !esSuperAdmin) return invitaciones;
    return invitaciones.filter(function (inv) {
      return [inv.creado_por_nombre, inv.contacto_nombre, inv.contacto_email]
        .some(function (v) { return String(v || '').toLowerCase().includes(q); });
    });
  }, [invitaciones, busqueda, esSuperAdmin]);

  const detalle = detalleId ? invitaciones.find(function (inv) { return inv.id === detalleId; }) : null;

  return _hPI('div', { className: 'card', style: { marginTop: 20 } },
    _hPI('div', { key: 'h', className: 'card-header' },
      _hPI('div', { key: 't' },
        _hPI('div', { className: 'card-title' }, 'Invitaciones a colegios'),
        _hPI('div', { className: 'card-sub' }, 'Genera un enlace para que un colegio se dé de alta llenando sus propios datos.')
      ),
      _hPI('button', { key: 'b', className: 'btn btn-primary btn-sm', onClick: function () { setModalAbierto(true); } },
        '+ Generar invitación')
    ),
    (esSuperAdmin && invitaciones.length > 0) ? _hPI('input', {
      key: 'buscar', className: 'form-input', style: { marginBottom: 12, maxWidth: 280 },
      placeholder: 'Buscar por distribuidor o contacto…',
      value: busqueda, onChange: function (e) { setBusqueda(e.target.value); }
    }) : null,
    cargando
      ? _hPI('div', { key: 'load', className: 'empty-state' }, _hPI('div', { className: 'empty-text' }, 'Cargando…'))
      : invitaciones.length === 0
        ? _hPI('div', { key: 'vacio', className: 'empty-state' }, _hPI('div', { className: 'empty-text' }, 'Aún no has generado ninguna invitación.'))
        : lista.length === 0
          ? _hPI('div', { key: 'sinres', className: 'empty-state' }, _hPI('div', { className: 'empty-text' }, 'Nada coincide con esa búsqueda.'))
          : _hPI('div', { key: 'tabla', className: 'table-wrap' },
            _hPI('table', {},
              _hPI('thead', {},
                _hPI('tr', {},
                  _hPI('th', {}, 'Contacto'),
                  _hPI('th', {}, 'Correo'),
                  esSuperAdmin ? _hPI('th', {}, 'Generado por') : null,
                  _hPI('th', {}, 'Estado'),
                  _hPI('th', {}, 'Creada'),
                  _hPI('th', {}, 'Detalle')
                )
              ),
              _hPI('tbody', {},
                lista.map(function (inv) {
                  const info = _ESTADO_INV[inv.estado] || { label: inv.estado, clase: 'badge-gray' };
                  return _hPI('tr', { key: inv.id },
                    _hPI('td', {}, inv.contacto_nombre),
                    _hPI('td', {}, inv.contacto_email),
                    esSuperAdmin ? _hPI('td', {}, inv.creado_por_nombre || '—') : null,
                    _hPI('td', {}, _hPI('span', { className: 'badge ' + info.clase }, info.label)),
                    _hPI('td', {}, String(inv.fecha_alta || '').slice(0, 10)),
                    _hPI('td', {},
                      _hPI('button', {
                        className: 'btn btn-secondary btn-sm',
                        onClick: function () { setDetalleId(inv.id); }
                      }, inv.estado === 'enviado' && esSuperAdmin ? 'Revisar' : 'Ver')
                    )
                  );
                })
              )
            )
          ),
    modalAbierto ? _hPI(ModalGenerarInvitacion, {
      key: 'modal', onCerrar: function () { setModalAbierto(false); }, onCreada: cargar
    }) : null,
    detalle ? _hPI(ModalDetalleInvitacion, {
      key: 'detalle', inv: detalle, esSuperAdmin: esSuperAdmin,
      resolviendo: resolviendo === detalle.id,
      onCerrar: function () { setDetalleId(null); }, onResolver: resolver
    }) : null
  );
}
