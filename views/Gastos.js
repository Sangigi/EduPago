/* views/Gastos.js — Pagos a proveedores (lista paginada de servidor, patrón Logs.js/Cobros.js) */
const hGas = React.createElement;

const FORMAS_PAGO_GASTO = ['Efectivo', 'Transferencia', 'Cheque', 'TarjetaEmpresarial', 'Otro'];
const FORMAS_PAGO_GASTO_LABELS = {
  Efectivo: 'Efectivo', Transferencia: 'Transferencia', Cheque: 'Cheque',
  TarjetaEmpresarial: 'Tarjeta empresarial', Otro: 'Otro'
};

function Gastos({ data, escuela_id }) {
  const { useState, useEffect, useRef } = React;
  const [gastos, setGastos] = useState([]);
  const [total, setTotal] = useState(0);
  const [sumaTotal, setSumaTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroFormaPago, setFiltroFormaPago] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const porPagina = 25;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const { pagina, setPagina, irAPagina } = usePaginaActual(totalPaginas);

  const [modal, setModal] = useState(null); // null | 'form'
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errForm, setErrForm] = useState('');
  const [confirmarEliminar, setConfirmarEliminar] = useState(null); // id | null
  const [subiendoId, setSubiendoId] = useState(null);
  const fileInputRef = useRef(null);
  const gastoParaSubirRef = useRef(null);

  const proveedoresActivos = (data.proveedores || []).filter(p => p.activo);

  const cargar = async p => {
    if (!escuela_id) return;
    setCargando(true);
    setError('');
    try {
      const token = AuthController.getToken();
      const params = new URLSearchParams({ action: 'listar_gastos', escuela_id, pagina: p, por_pagina: porPagina });
      if (filtroProveedor) params.set('proveedor_id', filtroProveedor);
      if (filtroFormaPago) params.set('forma_pago', filtroFormaPago);
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      const res = await fetch('api.php?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'No se pudieron cargar los gastos.');
        setGastos([]); setTotal(0); setSumaTotal(0);
      } else {
        setGastos(json.gastos || []);
        setTotal(json.total || 0);
        setSumaTotal(json.suma_total || 0);
      }
    } catch (e) {
      setError('Error de conexión al cargar los gastos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => { setPagina(1); cargar(1); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroProveedor, filtroFormaPago, desde, hasta, escuela_id]);

  useEffect(() => {
    cargar(pagina);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina]);

  const EMPTY_GASTO = { proveedor_id: '', concepto: '', monto: '', fecha: new Date().toISOString().slice(0, 10), forma_pago: 'Transferencia' };

  const abrirNuevo = () => { setForm(EMPTY_GASTO); setErrForm(''); setModal('form'); };
  const abrirEditar = g => {
    setForm({
      id: g.id, proveedor_id: g.proveedor_id || '', concepto: g.concepto,
      monto: g.monto, fecha: g.fecha, forma_pago: g.forma_pago
    });
    setErrForm('');
    setModal('form');
  };

  const guardar = async () => {
    setErrForm('');
    if (!form.concepto.trim()) return setErrForm('El concepto es obligatorio.');
    const montoNum = parseFloat(form.monto);
    if (!montoNum || montoNum <= 0) return setErrForm('Ingresa un monto mayor a cero.');
    setGuardando(true);
    try {
      const payload = {
        ...form, escuela_id, monto: montoNum,
        proveedor_id: form.proveedor_id ? parseInt(form.proveedor_id, 10) : null
      };
      if (form.id) await GastosController.editar(payload);
      else await GastosController.crear(payload);
      setModal(null);
      cargar(pagina);
    } catch (e) {
      setErrForm(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async id => {
    try {
      await GastosController.eliminar(id);
      setConfirmarEliminar(null);
      cargar(pagina);
    } catch (e) {
      alert('No se pudo eliminar el gasto: ' + e.message);
    }
  };

  const pedirComprobante = gastoId => {
    gastoParaSubirRef.current = gastoId;
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const onArchivoComprobante = async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    const gastoId = gastoParaSubirRef.current;
    if (!f || !gastoId) return;
    setSubiendoId(gastoId);
    try {
      const res = await GastosController.subirComprobante(gastoId, f);
      setGastos(prev => prev.map(g => g.id === gastoId ? { ...g, comprobante_url: res.comprobante_url } : g));
    } catch (err) {
      alert('No se pudo subir el comprobante: ' + err.message);
    } finally {
      setSubiendoId(null);
    }
  };

  const elModal = modal === 'form' && form && hGas('div', {
    className: 'modal-backdrop', onClick: e => e.target === e.currentTarget && setModal(null)
  },
    hGas('div', { className: 'modal' },
      hGas('div', { className: 'modal-header' },
        hGas('div', { className: 'modal-title' }, (form.id ? 'Editar' : 'Nuevo') + ' gasto'),
        hGas('button', { className: 'btn btn-ghost btn-sm', onClick: () => setModal(null) },
          hGas(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      hGas('div', { className: 'modal-body' },
        hGas('div', { className: 'form-group' },
          hGas('label', { className: 'form-label' }, 'Proveedor (opcional)'),
          hGas('select', {
            className: 'form-select', value: form.proveedor_id || '',
            onChange: e => setForm(f => ({ ...f, proveedor_id: e.target.value }))
          },
            hGas('option', { value: '' }, 'Sin proveedor'),
            proveedoresActivos.map(p => hGas('option', { key: p.id, value: p.id }, p.nombre))
          )
        ),
        hGas('div', { className: 'form-group' },
          hGas('label', { className: 'form-label' }, 'Concepto *'),
          hGas('input', {
            className: 'form-input', placeholder: 'Ej: Renta de mensual del plantel',
            value: form.concepto, onChange: e => setForm(f => ({ ...f, concepto: e.target.value }))
          })
        ),
        hGas('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          hGas('div', { className: 'form-group' },
            hGas('label', { className: 'form-label' }, 'Monto'),
            hGas('input', {
              className: 'form-input', type: 'number', min: '0.01', step: '0.01', style: { fontFamily: 'var(--mono)' },
              value: form.monto, onChange: e => setForm(f => ({ ...f, monto: e.target.value }))
            })
          ),
          hGas('div', { className: 'form-group' },
            hGas('label', { className: 'form-label' }, 'Fecha'),
            hGas('input', {
              className: 'form-input', type: 'date',
              value: form.fecha, onChange: e => setForm(f => ({ ...f, fecha: e.target.value }))
            })
          )
        ),
        hGas('div', { className: 'form-group' },
          hGas('label', { className: 'form-label' }, 'Forma de pago'),
          hGas('select', {
            className: 'form-select', value: form.forma_pago,
            onChange: e => setForm(f => ({ ...f, forma_pago: e.target.value }))
          }, FORMAS_PAGO_GASTO.map(fp => hGas('option', { key: fp, value: fp }, FORMAS_PAGO_GASTO_LABELS[fp])))
        ),
        errForm && hGas('div', { style: { marginTop: 10, fontSize: 12.5, color: 'var(--red, #e5484d)' } }, errForm)
      ),
      hGas('div', { className: 'modal-footer' },
        hGas('button', { className: 'btn btn-secondary', onClick: () => setModal(null) }, 'Cancelar'),
        hGas('button', {
          className: 'btn btn-primary', onClick: guardar, disabled: guardando
        }, guardando ? 'Guardando…' : 'Guardar')
      )
    )
  );

  return hGas('div', {},
    hGas('input', {
      ref: fileInputRef, type: 'file', accept: '.jpg,.jpeg,.png,.pdf', style: { display: 'none' },
      onChange: onArchivoComprobante
    }),
    hGas('div', { className: 'card' },
      hGas('div', { className: 'card-header' },
        hGas('div', {},
          hGas('div', { className: 'card-title' }, 'Gastos'),
          hGas('div', { className: 'card-sub' }, total + ' gastos · Total del período: ' + fmt(sumaTotal))
        ),
        hGas('button', { className: 'btn btn-primary', onClick: abrirNuevo }, '+ Nuevo gasto')
      ),
      hGas('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 } },
        hGas('select', {
          className: 'form-select', style: { width: 'auto', fontSize: 12.5 },
          value: filtroProveedor, onChange: e => setFiltroProveedor(e.target.value)
        },
          hGas('option', { value: '' }, 'Todos los proveedores'),
          proveedoresActivos.map(p => hGas('option', { key: p.id, value: p.id }, p.nombre))
        ),
        hGas('select', {
          className: 'form-select', style: { width: 'auto', fontSize: 12.5 },
          value: filtroFormaPago, onChange: e => setFiltroFormaPago(e.target.value)
        },
          hGas('option', { value: '' }, 'Todas las formas de pago'),
          FORMAS_PAGO_GASTO.map(fp => hGas('option', { key: fp, value: fp }, FORMAS_PAGO_GASTO_LABELS[fp]))
        ),
        hGas('input', { className: 'form-input', style: { width: 150 }, type: 'date', value: desde, onChange: e => setDesde(e.target.value) }),
        hGas('input', { className: 'form-input', style: { width: 150 }, type: 'date', value: hasta, onChange: e => setHasta(e.target.value) })
      ),
      error && hGas('div', { style: { padding: '12px 16px', color: 'var(--red)', fontSize: 13 } }, error),
      !error && hGas('div', { className: 'table-wrap' },
        hGas('table', {},
          hGas('thead', {}, hGas('tr', {},
            ['Fecha', 'Proveedor', 'Concepto', 'Forma de pago', 'Monto', 'Comprobante', ''].map(th => hGas('th', { key: th }, th))
          )),
          hGas('tbody', {},
            cargando
              ? hGas('tr', {}, hGas('td', { colSpan: 7, className: 'empty-text' }, 'Cargando…'))
              : gastos.length === 0
                ? hGas('tr', {}, hGas('td', { colSpan: 7, className: 'empty-text' }, 'Sin gastos registrados.'))
                : gastos.map(g => hGas('tr', { key: g.id },
                    hGas('td', { style: { fontFamily: 'var(--mono)', fontSize: 11.5, whiteSpace: 'nowrap' } }, g.fecha),
                    hGas('td', { style: { fontSize: 12.5 } }, g.proveedor_nombre),
                    hGas('td', { style: { fontSize: 12.5 } }, g.concepto),
                    hGas('td', { style: { fontSize: 12 } }, FORMAS_PAGO_GASTO_LABELS[g.forma_pago] || g.forma_pago),
                    hGas('td', { style: { fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 } }, fmt(g.monto)),
                    hGas('td', {},
                      g.comprobante_url
                        ? hGas('a', { href: g.comprobante_url, target: '_blank', rel: 'noopener', className: 'btn btn-ghost btn-sm' },
                            hGas(Icon, { name: 'download', size: 13, color: 'currentColor' }), ' Ver')
                        : hGas('button', {
                            className: 'btn btn-ghost btn-sm', disabled: subiendoId === g.id,
                            onClick: () => pedirComprobante(g.id)
                          }, subiendoId === g.id ? 'Subiendo…' : 'Subir')
                    ),
                    hGas('td', { style: { display: 'flex', gap: 6 } },
                      hGas('button', { className: 'btn btn-ghost btn-sm', onClick: () => abrirEditar(g) },
                        hGas(Icon, { name: 'edit', size: 13, color: 'currentColor' })),
                      hGas('button', { className: 'btn btn-ghost btn-sm', onClick: () => setConfirmarEliminar(g.id) },
                        hGas(Icon, { name: 'trash', size: 13, color: 'currentColor' }))
                    )
                  ))
          )
        )
      ),
      !error && totalPaginas > 1 && hGas('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', fontSize: 13, color: 'var(--ink-3)' }
      },
        hGas('span', {}, `Página ${pagina} de ${totalPaginas}`),
        hGas('button', { className: 'btn btn-ghost btn-sm', disabled: pagina <= 1, onClick: () => irAPagina(pagina - 1) }, '‹ Anterior'),
        hGas('button', { className: 'btn btn-ghost btn-sm', disabled: pagina >= totalPaginas, onClick: () => irAPagina(pagina + 1) }, 'Siguiente ›')
      )
    ),
    elModal,
    hGas(ConfirmModal, {
      abierto: !!confirmarEliminar,
      titulo: 'Eliminar gasto',
      mensaje: '¿Seguro que quieres eliminar este gasto? Esta acción no se puede deshacer.',
      textoConfirmar: 'Eliminar',
      peligroso: true,
      onConfirmar: () => eliminar(confirmarEliminar),
      onCancelar: () => setConfirmarEliminar(null),
    })
  );
}
