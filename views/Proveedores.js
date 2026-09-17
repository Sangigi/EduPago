/* views/Proveedores.js — Catálogo de proveedores (mismo patrón que Productos.js) */
const hProv = React.createElement;

function Proveedores({ data, setData, escuela_id }) {
  const { useState } = React;
  const CATS_PROV = ['papeleria', 'alimentos', 'transporte', 'mantenimiento', 'tecnologia', 'servicios', 'construccion', 'uniformes', 'otro'];
  const CAT_LABELS_PROV = {
    papeleria: 'Papelería', alimentos: 'Alimentos', transporte: 'Transporte',
    mantenimiento: 'Mantenimiento', tecnologia: 'Tecnología', servicios: 'Servicios',
    construccion: 'Construcción', uniformes: 'Uniformes', otro: 'Otro'
  };
  const EMPTY_PROV = {
    nombre: '', categoria: 'otro', rfc: '', contacto_nombre: '',
    contacto_telefono: '', contacto_email: '', activo: true
  };

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_PROV);
  const [q, setQ] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errForm, setErrForm] = useState('');

  const lista = (data.proveedores || []).filter(p => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (p.nombre || '').toLowerCase().includes(t)
      || (p.categoria || '').toLowerCase().includes(t)
      || (p.rfc || '').toLowerCase().includes(t);
  });

  const guardar = async () => {
    setErrForm('');
    if (!form.nombre.trim()) return setErrForm('El nombre es obligatorio.');
    setGuardando(true);
    try {
      if (form.id) {
        const res = await ProveedoresController.editar(form);
        const newData = { ...data, proveedores: data.proveedores.map(p => p.id === form.id ? { ...p, ...res.proveedor } : p) };
        setData(newData);
        AppModel.save(newData);
      } else {
        const res = await ProveedoresController.crear({ ...form, escuela_id });
        const newData = { ...data, proveedores: [...(data.proveedores || []), res.proveedor] };
        setData(newData);
        AppModel.save(newData);
      }
      setModal(null);
      setForm(EMPTY_PROV);
    } catch (e) {
      setErrForm(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = async id => {
    try {
      const res = await ProveedoresController.toggleActivo(id);
      const newData = { ...data, proveedores: data.proveedores.map(p => p.id === id ? { ...p, activo: res.activo } : p) };
      setData(newData);
      AppModel.save(newData);
    } catch (e) {
      alert('No se pudo actualizar el proveedor: ' + e.message);
    }
  };

  const tarjeta = p => hProv('div', {
    key: p.id,
    style: {
      background: 'var(--glass-light)', border: '1px solid var(--border-glow)',
      borderRadius: 'var(--radius)', padding: '14px 16px', opacity: p.activo ? 1 : .5, transition: 'all .2s'
    }
  },
    hProv('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } },
      hProv('div', {
        style: {
          width: 38, height: 38, borderRadius: 10, background: 'var(--accent-glow)',
          border: '1px solid var(--border-active)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0
        }
      }, hProv(Icon, { name: 'bank', size: 18, color: 'currentColor' })),
      hProv('div', { style: { flex: 1, minWidth: 0 } },
        hProv('div', { style: { fontWeight: 600, fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.nombre),
        hProv('div', { style: { fontSize: 11, color: 'var(--ink-4)', marginTop: 1 } }, CAT_LABELS_PROV[p.categoria] || p.categoria)
      )
    ),
    (p.contacto_nombre || p.contacto_telefono || p.contacto_email) && hProv('div', {
      style: { fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.5 }
    }, [p.contacto_nombre, p.contacto_telefono, p.contacto_email].filter(Boolean).join(' · ')),
    hProv('div', { style: { display: 'flex', gap: 6 } },
      hProv('button', {
        className: 'btn btn-ghost btn-sm', style: { flex: 1 },
        onClick: () => { setForm({ ...EMPTY_PROV, ...p }); setErrForm(''); setModal('form'); }
      }, hProv(Icon, { name: 'edit', size: 14, color: 'currentColor' }), ' Editar'),
      hProv('button', {
        className: 'btn btn-ghost btn-sm', onClick: () => toggleActivo(p.id)
      }, hProv(Icon, { name: p.activo ? 'shield' : 'eyeOff', size: 14, color: 'currentColor' }))
    )
  );

  const elModal = modal === 'form' && hProv('div', {
    className: 'modal-backdrop', onClick: e => e.target === e.currentTarget && setModal(null)
  },
    hProv('div', { className: 'modal' },
      hProv('div', { className: 'modal-header' },
        hProv('div', { className: 'modal-title' }, (form.id ? 'Editar' : 'Nuevo') + ' proveedor'),
        hProv('button', { className: 'btn btn-ghost btn-sm', onClick: () => setModal(null) },
          hProv(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      hProv('div', { className: 'modal-body' },
        hProv('div', { className: 'form-group' },
          hProv('label', { className: 'form-label' }, 'Nombre del proveedor *'),
          hProv('input', {
            className: 'form-input', placeholder: 'Ej: Papelería El Estudiante',
            value: form.nombre, onChange: e => setForm(f => ({ ...f, nombre: e.target.value }))
          })
        ),
        hProv('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          hProv('div', { className: 'form-group' },
            hProv('label', { className: 'form-label' }, 'Categoría'),
            hProv('select', {
              className: 'form-select', value: form.categoria,
              onChange: e => setForm(f => ({ ...f, categoria: e.target.value }))
            }, CATS_PROV.map(c => hProv('option', { key: c, value: c }, CAT_LABELS_PROV[c] || c)))
          ),
          hProv('div', { className: 'form-group' },
            hProv('label', { className: 'form-label' }, 'RFC (opcional)'),
            hProv('input', {
              className: 'form-input', maxLength: 13, style: { textTransform: 'uppercase' },
              value: form.rfc || '', onChange: e => setForm(f => ({ ...f, rfc: e.target.value.toUpperCase() }))
            })
          )
        ),
        hProv('div', { className: 'form-group' },
          hProv('label', { className: 'form-label' }, 'Contacto'),
          hProv('input', {
            className: 'form-input', placeholder: 'Nombre de contacto',
            value: form.contacto_nombre || '', onChange: e => setForm(f => ({ ...f, contacto_nombre: e.target.value }))
          })
        ),
        hProv('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          hProv('div', { className: 'form-group' },
            hProv('label', { className: 'form-label' }, 'Teléfono'),
            hProv('input', {
              className: 'form-input', value: form.contacto_telefono || '',
              onChange: e => setForm(f => ({ ...f, contacto_telefono: e.target.value }))
            })
          ),
          hProv('div', { className: 'form-group' },
            hProv('label', { className: 'form-label' }, 'Correo'),
            hProv('input', {
              className: 'form-input', type: 'email', value: form.contacto_email || '',
              onChange: e => setForm(f => ({ ...f, contacto_email: e.target.value }))
            })
          )
        ),
        errForm && hProv('div', { style: { marginTop: 10, fontSize: 12.5, color: 'var(--red, #e5484d)' } }, errForm)
      ),
      hProv('div', { className: 'modal-footer' },
        hProv('button', { className: 'btn btn-secondary', onClick: () => setModal(null) }, 'Cancelar'),
        hProv('button', {
          className: 'btn btn-primary', onClick: guardar, disabled: !form.nombre.trim() || guardando
        }, guardando ? 'Guardando…' : 'Guardar')
      )
    )
  );

  return hProv('div', {},
    hProv('div', { className: 'card' },
      hProv('div', { className: 'card-header' },
        hProv('div', {},
          hProv('div', { className: 'card-title' }, 'Proveedores'),
          hProv('div', { className: 'card-sub' }, (data.proveedores || []).filter(p => p.activo).length + ' activos')
        ),
        hProv('button', {
          className: 'btn btn-primary',
          onClick: () => { setForm(EMPTY_PROV); setErrForm(''); setModal('form'); }
        }, '+ Nuevo proveedor')
      ),
      hProv('div', { className: 'search-bar', style: { marginBottom: 16 } },
        hProv('span', { className: 'search-icon' }, hProv(Icon, { name: 'search', size: 15, color: 'currentColor' })),
        hProv('input', { placeholder: 'Buscar proveedores…', value: q, onChange: e => setQ(e.target.value) })
      ),
      hProv('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 } },
        lista.length === 0
          ? hProv('div', { className: 'empty-state', style: { gridColumn: '1/-1' } },
              hProv('div', { className: 'empty-icon' }, hProv(Icon, { name: 'bank', size: 36, color: 'currentColor' })),
              hProv('div', { className: 'empty-text' }, 'Sin proveedores'),
              hProv('div', { className: 'empty-sub' }, 'Registra los proveedores de esta escuela')
            )
          : lista.map(tarjeta)
      )
    ),
    elModal
  );
}
