// views/components/MenuPerfil.js
// Menú del usuario en el pie del sidebar: abre configuración de cuenta
// (nombre, contraseña y logo de la escuela) o cierra sesión.
//
// El logo usa `escuela.logo_url`, columna que agrega migracion_perfiles.sql.
// Si la columna aún no existe, el componente muestra las iniciales como
// siempre: funciona igual antes y después de la migración.

const _hMP = React.createElement;

// Avatar que prefiere la imagen y cae a iniciales si no hay o si falla la carga
function AvatarPerfil({ url, iniciales, tam, clase, radio }) {
  const { useState } = React;
  const [fallo, setFallo] = useState(false);
  const s = tam || 36;
  const base = {
    width: s, height: s, borderRadius: radio === undefined ? '50%' : radio,
    flexShrink: 0, objectFit: 'cover', display: 'block'
  };
  if (url && !fallo) {
    return _hMP('img', {
      src: url,
      alt: '',
      style: Object.assign({}, base, { background: 'var(--glass-light)' }),
      onError: () => setFallo(true)
    });
  }
  return _hMP('div', {
    className: clase || 'avatar',
    style: Object.assign({}, base, {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: Math.round(s * 0.36)
    })
  }, iniciales || '?');
}

function MenuPerfil({ user, escuela, onLogout, onActualizado, apiPost }) {
  const { useState, useEffect, useRef } = React;
  const [abierto, setAbierto] = useState(false);
  const [modal, setModal] = useState(null);      // 'cuenta' | 'password' | 'logo'
  const caja = useRef(null);

  // Cerrar al hacer clic fuera o con Escape
  useEffect(() => {
    if (!abierto) return;
    const fuera = e => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    const esc = e => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const iniciales = (user.nombre || '?').trim().split(/\s+/).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase();

  const rolLabel = {
    superadmin: 'Superadministrador', admin: 'Administrador',
    cajero: 'Cajero', familia: 'Familia', distribuidor: 'Distribuidor'
  }[user.rol] || user.rol;

  const opciones = [
    { id: 'cuenta',   icono: 'usuarios', label: 'Editar mi perfil' },
    { id: 'password', icono: 'shield',   label: 'Cambiar contraseña' }
  ];
  // Solo superadmin: hoy `editar_escuela` en api.php exige ese rol.
  // Para permitirlo también a admin, ver api_perfil.md.
  if (escuela && user.rol === 'superadmin') {
    opciones.push({ id: 'logo', icono: 'escuelas', label: 'Logo de la escuela' });
  }

  return _hMP('div', { ref: caja, style: { position: 'relative' } },
    _hMP('div', {
      key: 'card',
      className: 'user-card',
      style: { cursor: 'pointer' },
      title: 'Abrir opciones de cuenta',
      onClick: () => setAbierto(v => !v),
      children: [
        _hMP(AvatarPerfil, {
          key: 'av',
          url: user.foto_url || (escuela && escuela.logo_url) || null,
          iniciales: iniciales,
          tam: 36,
          clase: 'avatar avatar-' + (user.rol || 'admin')
        }),
        _hMP('div', { key: 'inf', className: 'user-info' },
          _hMP('div', { key: 'n', className: 'user-name' }, user.nombre),
          _hMP('div', { key: 'r', className: 'user-role' }, rolLabel)
        ),
        _hMP('span', {
          key: 'ch',
          style: {
            marginLeft: 'auto', display: 'inline-flex', color: 'var(--ink-4)',
            transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s'
          }
        }, _hMP(Icon, { name: 'chevronDown', size: 14, color: 'currentColor' }))
      ]
    }),

    abierto ? _hMP('div', { key: 'menu', className: 'menu-perfil' },
      opciones.map(op => _hMP('button', {
        key: op.id,
        className: 'menu-perfil-item',
        onClick: () => { setModal(op.id); setAbierto(false); },
        children: [
          _hMP(Icon, { key: 'i', name: op.icono, size: 15, color: 'currentColor' }),
          _hMP('span', { key: 'l' }, op.label)
        ]
      })),
      _hMP('div', { key: 'sep', className: 'menu-perfil-sep' }),
      _hMP('button', {
        key: 'out',
        className: 'menu-perfil-item peligro',
        onClick: () => { setAbierto(false); onLogout(); },
        children: [
          _hMP(Icon, { key: 'i', name: 'logout', size: 15, color: 'currentColor' }),
          _hMP('span', { key: 'l' }, 'Cerrar sesión')
        ]
      })
    ) : null,

    modal ? _hMP(ModalPerfil, {
      key: 'modal',
      tipo: modal,
      user: user,
      escuela: escuela,
      apiPost: apiPost,
      onCerrar: () => setModal(null),
      onActualizado: onActualizado
    }) : null
  );
}

function ModalPerfil({ tipo, user, escuela, apiPost, onCerrar, onActualizado }) {
  const { useState } = React;
  const [nombre, setNombre] = useState(user.nombre || '');
  const [email, setEmail] = useState(user.email || '');
  const [fotoUrl, setFotoUrl] = useState(user.foto_url || '');
  const [logoUrl, setLogoUrl] = useState((escuela && escuela.logo_url) || '');
  const [pwActual, setPwActual] = useState('');
  const [pwNueva, setPwNueva] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const titulos = {
    cuenta: 'Editar mi perfil',
    password: 'Cambiar contraseña',
    logo: 'Logo de la escuela'
  };

  const guardar = async () => {
    setError(''); setOk('');

    if (tipo === 'password') {
      if (!pwActual || !pwNueva) return setError('Completa ambos campos.');
      if (pwNueva.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.');
      if (pwNueva !== pwConfirm) return setError('La confirmación no coincide.');
      if (pwNueva === pwActual) return setError('La nueva contraseña debe ser distinta de la actual.');
    }
    if (tipo === 'cuenta' && !nombre.trim()) return setError('El nombre no puede quedar vacío.');

    setGuardando(true);
    try {
      let res;
      if (tipo === 'password') {
        res = await apiPost('cambiar_password_propio', {
          password_actual: pwActual,
          password_nueva: pwNueva
        });
      } else if (tipo === 'cuenta') {
        res = await apiPost('editar_usuario', {
          id: user.id,
          nombre: nombre.trim(),
          email: email.trim(),
          foto_url: fotoUrl.trim() || null
        });
      } else {
        res = await apiPost('editar_escuela', {
          id: escuela.id,
          logo_url: logoUrl.trim() || null
        });
      }

      if (res && res.success === false) {
        setError(res.error || 'No se pudo guardar.');
      } else {
        setOk('Guardado.');
        if (onActualizado) {
          onActualizado(tipo, tipo === 'password' ? {} :
            tipo === 'cuenta'
              ? { nombre: nombre.trim(), email: email.trim(), foto_url: fotoUrl.trim() || null }
              : { logo_url: logoUrl.trim() || null });
        }
        setTimeout(onCerrar, 700);
      }
    } catch (e) {
      setError('Error de conexión: ' + e.message);
    }
    setGuardando(false);
  };

  const campo = (etiqueta, valor, alCambiar, opts) => _hMP('div', {
    key: etiqueta, className: 'form-group'
  },
    _hMP('label', { key: 'l', className: 'form-label' }, etiqueta),
    _hMP('input', {
      key: 'i',
      className: 'form-input',
      type: (opts && opts.tipo) || 'text',
      value: valor,
      placeholder: opts && opts.placeholder,
      autoComplete: opts && opts.autoComplete,
      onChange: e => alCambiar(e.target.value)
    }),
    opts && opts.ayuda ? _hMP('div', {
      key: 'a', style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 5, lineHeight: 1.5 }
    }, opts.ayuda) : null
  );

  const previa = url => url ? _hMP('div', {
    style: { display: 'flex', alignItems: 'center', gap: 11, marginTop: 4 }
  },
    _hMP(AvatarPerfil, { url: url, iniciales: '?', tam: 46, radio: 12 }),
    _hMP('span', { style: { fontSize: 11.5, color: 'var(--ink-4)' } },
      'Vista previa. Si no aparece, revisa que el enlace sea público.')
  ) : null;

  return _hMP('div', { className: 'modal-backdrop', onClick: onCerrar },
    _hMP('div', {
      className: 'modal',
      style: { maxWidth: 460 },
      onClick: e => e.stopPropagation()
    },
      _hMP('div', { key: 'h', className: 'modal-header' },
        _hMP('div', { key: 't', className: 'modal-title' }, titulos[tipo]),
        _hMP('button', { key: 'x', className: 'btn-ghost', onClick: onCerrar },
          _hMP(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      _hMP('div', { key: 'b', className: 'modal-body' },
        tipo === 'cuenta' ? [
          campo('Nombre', nombre, setNombre),
          campo('Correo', email, setEmail, { tipo: 'email' }),
          campo('Foto de perfil (enlace)', fotoUrl, setFotoUrl, {
            placeholder: 'https://drive.google.com/…',
            ayuda: 'Pega el enlace público de la imagen. No se sube al sistema: solo se guarda la dirección.'
          }),
          previa(fotoUrl)
        ] : null,

        tipo === 'password' ? [
          campo('Contraseña actual', pwActual, setPwActual, { tipo: 'password', autoComplete: 'current-password' }),
          campo('Nueva contraseña', pwNueva, setPwNueva, {
            tipo: 'password', autoComplete: 'new-password', ayuda: 'Mínimo 8 caracteres.'
          }),
          campo('Confirmar nueva contraseña', pwConfirm, setPwConfirm, { tipo: 'password', autoComplete: 'new-password' })
        ] : null,

        tipo === 'logo' ? [
          campo('Logo de la escuela (enlace)', logoUrl, setLogoUrl, {
            placeholder: 'https://…/logo.png',
            ayuda: 'Aparecerá junto al nombre del perfil en lugar de las iniciales.'
          }),
          previa(logoUrl)
        ] : null,

        error ? _hMP('div', {
          key: 'err',
          style: {
            marginTop: 12, padding: '9px 12px', borderRadius: 'var(--radius-sm)',
            background: 'var(--red-glow)', color: 'var(--red)', fontSize: 12.5
          }
        }, error) : null,

        ok ? _hMP('div', {
          key: 'ok',
          style: {
            marginTop: 12, padding: '9px 12px', borderRadius: 'var(--radius-sm)',
            background: 'var(--green-glow)', color: 'var(--green-dark)', fontSize: 12.5
          }
        }, ok) : null
      ),
      _hMP('div', { key: 'f', className: 'modal-footer' },
        _hMP('button', { key: 'c', className: 'btn btn-secondary', onClick: onCerrar }, 'Cancelar'),
        _hMP('button', {
          key: 'g', className: 'btn btn-primary', disabled: guardando, onClick: guardar
        }, guardando ? 'Guardando…' : 'Guardar')
      )
    )
  );
}
