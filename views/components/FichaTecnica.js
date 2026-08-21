// views/components/FichaTecnica.js
// Credencial del alumno o del tutor. La foto entra por enlace externo
// (Drive, etc.), igual que doc_curp_url y doc_acta_url que ya usabas:
// nunca se sube el archivo al sistema, solo se guarda la direccion.
// Sin foto, o si el enlace falla, se dibuja un avatar generico en SVG.

const _hFT = React.createElement;

function AvatarDefecto({ tam }) {
  const s = tam || 96;
  return _hFT('svg', {
    width: s, height: s, viewBox: '0 0 96 96', style: { display: 'block' }
  },
    _hFT('rect', { key: 'bg', width: 96, height: 96, fill: 'var(--violet-soft)' }),
    _hFT('circle', { key: 'c', cx: 48, cy: 37, r: 16, fill: 'var(--violet)', opacity: 0.6 }),
    _hFT('path', {
      key: 'b', d: 'M19 90c0-16 13-29 29-29s29 13 29 29v6H19v-6z',
      fill: 'var(--violet)', opacity: 0.6
    })
  );
}

function FotoFicha({ url, tam, radio }) {
  const { useState, useEffect } = React;
  const [fallo, setFallo] = useState(false);
  useEffect(function () { setFallo(false); }, [url]);
  const s = tam || 96;
  const r = radio === undefined ? 15 : radio;
  if (!url || fallo) {
    return _hFT('div', { style: { width: s, height: s, borderRadius: r, overflow: 'hidden' } },
      _hFT(AvatarDefecto, { tam: s }));
  }
  return _hFT('img', {
    src: url, alt: '', onError: function () { setFallo(true); },
    style: { width: s, height: s, borderRadius: r, objectFit: 'cover', display: 'block',
             background: 'var(--glass-light)' }
  });
}

// Un enlace normal de Drive devuelve una pagina HTML, no la imagen.
// Esto lo convierte a la URL que si se puede incrustar en un <img>.
function normalizarEnlaceFoto(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  const d = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|thumbnail\?id=)([\w-]{20,})/);
  if (d) return 'https://drive.google.com/thumbnail?id=' + d[1] + '&sz=w512';
  return u;
}

const _PARENTESCO_LABEL = {
  hijo: 'Hijo', hija: 'Hija', hijastro: 'Hijastro', hijastra: 'Hijastra',
  sobrino: 'Sobrino', sobrina: 'Sobrina', nieto: 'Nieto', nieta: 'Nieta',
  ahijado: 'Ahijado', ahijada: 'Ahijada', hermano: 'Hermano', hermana: 'Hermana',
  tutorado: 'Bajo tutela', otro: 'Otro'
};

function FichaTecnica({ registro, tipo, escuela, familia, extra, onCerrar, onGuardarFoto, puedeEditar }) {
  // `extra` es la forma que ya usan las vistas enganchadas (Alumnos):
  // { familia, saldo, saldoTexto }. Se acepta junto con las props sueltas
  // para que ambas maneras de invocar el componente funcionen.
  const _familia = familia || (extra && extra.familia) || null;
  const _saldo = (extra && typeof extra.saldo === 'number')
    ? extra.saldo : Number(registro.saldo_pendiente || 0);
  const _saldoTexto = (extra && extra.saldoTexto)
    || (typeof fmt === 'function' ? fmt(_saldo)
        : '$' + Number(_saldo).toLocaleString('es-MX', { minimumFractionDigits: 2 }));
  // Por omisión se permite editar la foto; las vistas pueden restringirlo
  const _puedeEditar = puedeEditar === undefined ? true : puedeEditar;
  const { useState } = React;
  const [editando, setEditando] = useState(false);
  const [enlace, setEnlace] = useState(registro.foto_url || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const esAlumno = tipo !== 'tutor';
  const foto = normalizarEnlaceFoto(registro.foto_url);

  const filas = esAlumno ? [
    ['Matricula', registro.matricula],
    ['Grado', registro.grado],
    ['CURP', registro.curp],
    ['Parentesco', _PARENTESCO_LABEL[registro.parentesco] || registro.parentesco],
    ['Familia', _familia && _familia.nombre],
    ['Fecha de nacimiento', registro.fecha_nac],
    ['Tipo de sangre', registro.tipo_sangre],
    ['Alergias', registro.alergias],
    ['Correo', registro.email],
    ['Telefono', registro.telefono],
    ['Contacto de emergencia', registro.contacto_emergencia],
    ['Tel. de emergencia', registro.tel_emergencia]
  ] : [
    ['Contacto', registro.contacto],
    ['Correo', registro.email],
    ['Telefono', registro.telefono],
    ['RFC', registro.rfc_factura],
    ['Razon social', registro.razon_social_factura]
  ];
  const visibles = filas.filter(function (f) {
    return f[1] !== null && f[1] !== undefined && String(f[1]).trim() !== '';
  });

  const guardarEnlace = async function () {
    setError('');
    const limpio = enlace.trim();
    if (limpio && !/^https?:\/\//i.test(limpio)) {
      return setError('El enlace debe empezar con http:// o https://');
    }
    setGuardando(true);
    try {
      const res = await onGuardarFoto(limpio || null);
      if (res && res.success === false) setError(res.error || 'No se pudo guardar.');
      else setEditando(false);
    } catch (e) {
      setError('Error de conexion: ' + e.message);
    }
    setGuardando(false);
  };

  return _hFT('div', { className: 'modal-backdrop', onClick: onCerrar },
    _hFT('div', {
      className: 'modal ficha-tecnica', style: { maxWidth: 430 },
      onClick: function (e) { e.stopPropagation(); }
    },
      _hFT('div', { key: 'top', className: 'ficha-top' },
        _hFT('button', { key: 'x', className: 'ficha-cerrar', onClick: onCerrar, title: 'Cerrar' },
          _hFT(Icon, { name: 'close', size: 15, color: 'currentColor' })),
        _hFT('div', { key: 'f', className: 'ficha-foto' },
          _hFT(FotoFicha, { url: foto, tam: 96, radio: 15 })),
        _hFT('div', { key: 'n', className: 'ficha-nombre' }, registro.nombre),
        _hFT('div', { key: 's', className: 'ficha-sub' },
          esAlumno
            ? ([registro.grado, registro.matricula].filter(Boolean).join(' \u00b7 ') || 'Alumno')
            : 'Tutor responsable'),
        escuela ? _hFT('div', { key: 'e', className: 'ficha-escuela' }, escuela.nombre) : null
      ),
      _hFT('div', { key: 'body', className: 'modal-body' },
        visibles.length === 0
          ? _hFT('div', { style: { fontSize: 12.5, color: 'var(--ink-4)' } },
              'Sin datos adicionales capturados.')
          : _hFT('div', { className: 'ficha-datos' },
              visibles.map(function (par) {
                return _hFT('div', { key: par[0], className: 'ficha-dato' },
                  _hFT('div', { key: 'k', className: 'ficha-dato-k' }, par[0]),
                  _hFT('div', { key: 'v', className: 'ficha-dato-v' }, String(par[1])));
              })),
        _saldo > 0 ? _hFT('div', {
          key: 'saldo',
          style: { marginTop: 14, padding: '10px 13px', borderRadius: 'var(--radius-sm)',
                   background: 'var(--amber-glow)', color: 'var(--amber)',
                   fontSize: 12.5, fontWeight: 600 }
        }, 'Saldo pendiente: ' + _saldoTexto) : null,
        (onGuardarFoto && _puedeEditar) ? (editando
          ? _hFT('div', { key: 'ed', style: { marginTop: 16 } },
              _hFT('label', { key: 'l', className: 'form-label' }, 'Enlace de la foto'),
              _hFT('input', {
                key: 'i', className: 'form-input', value: enlace,
                placeholder: 'https://drive.google.com/file/d/...',
                autoComplete: 'off', spellCheck: false,
                onChange: function (e) { setEnlace(e.target.value); }
              }),
              _hFT('div', { key: 'a',
                style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 5, lineHeight: 1.5 } },
                'La imagen no se sube al sistema: solo se guarda la direccion. Si usas Google Drive, comparte el archivo como "cualquiera con el enlace".'),
              error ? _hFT('div', { key: 'e',
                style: { marginTop: 9, padding: '8px 11px', borderRadius: 'var(--radius-sm)',
                         background: 'var(--red-glow)', color: 'var(--red)', fontSize: 12 } },
                error) : null,
              _hFT('div', { key: 'b', style: { display: 'flex', gap: 8, marginTop: 11 } },
                _hFT('button', { key: 'c', className: 'btn btn-secondary btn-sm',
                  onClick: function () { setEditando(false); setEnlace(registro.foto_url || ''); setError(''); } },
                  'Cancelar'),
                _hFT('button', { key: 'g', className: 'btn btn-primary btn-sm',
                  disabled: guardando, onClick: guardarEnlace },
                  guardando ? 'Guardando...' : 'Guardar foto'))
            )
          : _hFT('button', {
              key: 'ed', className: 'btn btn-secondary btn-sm', style: { marginTop: 16 },
              onClick: function () { setEditando(true); },
              children: [
                _hFT(Icon, { key: 'i', name: 'edit', size: 13, color: 'currentColor' }),
                registro.foto_url ? ' Cambiar foto' : ' Agregar foto'
              ]
            })
        ) : null
      )
    )
  );
}
