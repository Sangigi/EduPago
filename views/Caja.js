var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
/* views/Caja.jsx — Sistema de cobros completo v2 */
function Caja({
  data,
  setData,
  user,
  escuela
}) {
  const {
    useState,
    useEffect,
    useRef
  } = React;
  const [carrito, setCarrito] = useState([]);
  const [clienteSel, setClienteSel] = useState(null);
  const [metodo, setMetodo] = useState('TC');
  // Candado de corte de caja: el POS exige un turno abierto (cajero/admin) —
  // antes se podía cobrar todo el día sin abrir caja nunca, y aunque se
  // abriera, las ventas no quedaban ligadas a ella (ver caja_id en cobrar()).
  const [cajaEstadoCargando, setCajaEstadoCargando] = useState(true);
  const [sucursalId, setSucursalId] = useState(null);
  const [cajaAbierta, setCajaAbierta] = useState(null);
  const [montoApertura, setMontoApertura] = useState('');
  const [abriendoCaja, setAbriendoCaja] = useState(false);
  const [errorCaja, setErrorCaja] = useState(null);
  const requiereCajaAbierta = user?.rol === 'cajero' || user?.rol === 'admin';
  const [q, setQ] = useState('');
  const [clasificacion, setClasificacion] = useState('todos');
  const [qCliente, setQCliente] = useState('');
  const [modal, setModal] = useState(null); // null | 'cliente' | 'spei' | 'codi' | 'ticket' | 'tc'
  const [cobroActivo, setCobroActivo] = useState(null);
  const [copiedCLABE, setCopiedCLABE] = useState(false);
  const [speiStatus, setSpeiStatus] = useState('esperando'); // esperando | verificando | confirmado
  const [speiError, setSpeiError] = useState(null);
  const [codiStatus, setCodiStatus] = useState('esperando'); // esperando | escaneado | pagado | expirado
  const [codiTimer, setCodiTimer] = useState(300); // 5 minutos
  const [tcInfo, setTcInfo] = useState(null); // { url, qr_url, referencia }
  const [tcLoading, setTcLoading] = useState(false);
  const [tcError, setTcError] = useState(null);
  const [speiBloqueo, setSpeiBloqueo] = useState(null); // mensaje de error SPEI en pantalla
  // Efectivo con referencia (OXXO / terceros vía Cobroscontarjeta.com)
  const [efvRefInfo, setEfvRefInfo] = useState(null); // { referencia, barcode_url, payformat_url, vencimiento }
  const [efvRefLoading, setEfvRefLoading] = useState(false);
  const [efvRefError, setEfvRefError] = useState(null);
  // Cheque
  const [chequeInfo, setChequeInfo] = useState({
    banco: '',
    num_cuenta: '',
    num_cheque: '',
    fecha_cheque: '',
    titular: ''
  });
  // Facturar compra (desde la pantalla de "Cobro completado")
  const [facturaPanel, setFacturaPanel] = useState(null); // null | 'form'
  const [facturaForm, setFacturaForm] = useState({
    rfc: '', razon_social: '', cp_receptor: '', domicilio: '', regimen: '616', uso_cfdi: 'D10', email: ''
  });
  const [facturaLoading, setFacturaLoading] = useState(false);
  const [facturaError, setFacturaError] = useState(null);
  const [correoDestino, setCorreoDestino] = useState('');
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);
  const [correoMsg, setCorreoMsg] = useState(null); // { ok: bool, texto: string }
  const intervalRef = useRef(null);
  const timerRef = useRef(null);
  const speiPollRef = useRef(null);
  const tcPollRef = useRef(null);
  const efvRefPollRef = useRef(null);
  const CATS_PERIODICAS = ['colegiatura', 'anualidad', 'inscripcion'];
  const CAT_LABELS_CAJA = {
    colegiatura: 'Colegiatura', anualidad: 'Anualidad', inscripcion: 'Inscripción',
    examen: 'Examen', uniforme: 'Uniforme', material: 'Material',
    transporte: 'Transporte', comedor: 'Comedor', extracurricular: 'Extracurricular',
    beca: 'Beca / Descuento', otro: 'Otro'
  };
  const productosBase = data.productos.filter(p =>
    p.activo && p.tipo !== 'recurrente' && (!q || p.nombre.toLowerCase().includes(q.toLowerCase()))
  );
  // Aplica clasificación seleccionada
  const productosFiltrados = (() => {
    switch (clasificacion) {
      case 'descuentos':
        return productosBase.filter(p => p.precio < 0 || p.categoria === 'beca');
      case 'periodicos':
        return productosBase.filter(p => CATS_PERIODICAS.includes(p.categoria));
      case 'unicos':
        return productosBase.filter(p => !CATS_PERIODICAS.includes(p.categoria) && p.precio >= 0 && p.categoria !== 'beca');
      case 'mayor_precio':
        return [...productosBase].sort((a, b) => Math.abs(b.precio) - Math.abs(a.precio));
      case 'menor_precio':
        return [...productosBase].sort((a, b) => Math.abs(a.precio) - Math.abs(b.precio));
      case 'alfabetico':
        return [...productosBase].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      default:
        return productosBase;
    }
  })();
  // Para la vista agrupada por categoría
  const productosPorCategoria = (() => {
    if (clasificacion !== 'por_categoria') return null;
    const grupos = {};
    productosBase.forEach(p => {
      const cat = p.categoria || 'otro';
      if (!grupos[cat]) grupos[cat] = [];
      grupos[cat].push(p);
    });
    return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0], 'es'));
  })();
  const clientesFiltradosTotal = data.clientes.filter(c => {
    if (!c.activo) return false;
    if (!qCliente) return true;
    const fam = c.familia_id ? data.familias.find(f => f.id === c.familia_id) : null;
    const texto = [c.nombre, c.matricula, c.grado, fam?.nombre].filter(Boolean).join(' ').toLowerCase();
    return texto.includes(qCliente.toLowerCase());
  }).map(c => {
    const busq = qCliente.trim().toLowerCase();
    const exacto = busq !== '' && (c.nombre.toLowerCase() === busq || (c.matricula || '').toLowerCase() === busq);
    return { c, exacto };
  }).sort((a, b) => (b.exacto - a.exacto)).map(x => x.c);
  // Tope defensivo: sin buscar nada, un colegio con cientos de alumnos
  // renderizaba la lista completa dentro del modal — se corta a 40 y se pide
  // escribir para acotar, igual que el buscador de familia en Alumnos.js.
  const CLIENTES_CAP = 40;
  const clientesFiltrados = clientesFiltradosTotal.slice(0, CLIENTES_CAP);
  const clientesFiltradosExactos = new Set(
    clientesFiltrados.filter(c => {
      const busq = qCliente.trim().toLowerCase();
      return busq !== '' && (c.nombre.toLowerCase() === busq || (c.matricula || '').toLowerCase() === busq);
    }).map(c => c.id)
  );
  const subtotal = carrito.reduce((a, i) => a + i.precio * i.qty, 0);
  const total = subtotal;

  /* ── HELPER: actualizar saldo_pendiente de un cliente en el estado global ── */
  const actualizarSaldoCliente = (res) => {
    if (res && res.cliente_id != null) {
      setData(prev => ({
        ...prev,
        clientes: prev.clientes.map(c =>
          c.id === res.cliente_id ? { ...c, saldo_pendiente: res.nuevo_saldo ?? 0 } : c
        )
      }));
    }
  };

  /* ── CANDADO DE CAJA: cargar sucursal + turno abierto al entrar al POS ── */
  useEffect(() => {
    if (!requiereCajaAbierta || !escuela?.id) {
      setCajaEstadoCargando(false);
      return;
    }
    let cancelado = false;
    (async () => {
      setCajaEstadoCargando(true);
      setErrorCaja(null);
      try {
        const sucursales = await CajaController.listarSucursales(escuela.id);
        const sid = sucursales?.[0]?.id || null;
        if (cancelado) return;
        setSucursalId(sid);
        if (sid) {
          const caja = await CajaController.estadoActual(sid);
          if (!cancelado) setCajaAbierta(caja);
        }
      } catch (e) {
        if (!cancelado) setErrorCaja(e.message);
      } finally {
        if (!cancelado) setCajaEstadoCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [requiereCajaAbierta, escuela?.id]);

  const abrirMiCaja = async () => {
    const monto = parseFloat(montoApertura);
    if (isNaN(monto) || monto < 0) { setErrorCaja('Ingresa un monto de apertura válido.'); return; }
    setAbriendoCaja(true);
    setErrorCaja(null);
    try {
      const caja = await CajaController.abrir({ sucursal_id: sucursalId, monto_apertura: monto, observaciones: '' });
      setCajaAbierta(caja);
      setMontoApertura('');
    } catch (e) {
      setErrorCaja(e.message);
    } finally {
      setAbriendoCaja(false);
    }
  };

  /* ── CARRITO ── */
  const addItem = p => {
    setCarrito(prev => {
      const ex = prev.find(i => i.id === p.id);
      return ex ? prev.map(i => i.id === p.id ? {
        ...i,
        qty: i.qty + 1
      } : i) : [...prev, {
        ...p,
        qty: 1
      }];
    });
  };
  const setQty = (id, qty) => qty < 1 ? setCarrito(prev => prev.filter(i => i.id !== id)) : setCarrito(prev => prev.map(i => i.id === id ? {
    ...i,
    qty
  } : i));
  const removeItem = id => setCarrito(prev => prev.filter(i => i.id !== id));

  /* ── INICIAR COBRO ── */
  const cobrar = async () => {
    if (!carrito.length) return;
    if (requiereCajaAbierta && !cajaAbierta) {
      alert('No tienes una caja abierta. Abre tu turno antes de cobrar.');
      return;
    }

    // Validar SPEI antes de crear el cobro
    if (metodo === 'SPEI') {
      if (!clienteSel) {
        setSpeiBloqueo({ tipo: 'sin_alumno', msg: 'Selecciona un alumno o familia para cobrar por SPEI.' });
        return;
      }
      const tieneClabe = clienteSel.clabe_individual && clienteSel.clabe_individual_estado === 'activa';
      if (!tieneClabe) {
        const motivo = !clienteSel.clabe_individual
          ? 'no tiene CLABE SPEI asignada'
          : `su CLABE está ${clienteSel.clabe_individual_estado || 'inactiva'}`;
        setSpeiBloqueo({ tipo: 'sin_clabe', alumno: clienteSel.nombre, clabe: clienteSel.clabe_individual, estado: clienteSel.clabe_individual_estado, msg: `${clienteSel.nombre} ${motivo}.` });
        return;
      }
      setSpeiBloqueo(null);
    }
    const escuela_id = escuela?.id ?? data.escuelas?.[0]?.id ?? 1;
    let cobro;
    try {
      cobro = await CobroController.iniciarCobro({ carrito, cliente: clienteSel, metodo, escuela_id, caja_id: cajaAbierta?.id, sucursal_id: sucursalId });
    } catch(err) {
      alert('Error al crear cobro: ' + err.message);
      return;
    }
    setCobroActivo(cobro);
    // Actualizar saldo_pendiente del cliente si el API lo devolvió
    if (cobro._nuevo_saldo != null && cobro._cliente_id != null) {
      setData(prev => ({
        ...prev,
        clientes: prev.clientes.map(c => c.id === cobro._cliente_id ? { ...c, saldo_pendiente: cobro._nuevo_saldo } : c)
      }));
    }
    const newData = { ...data, cobros: [...(data.cobros || []), cobro] };
    if (metodo === 'SPEI') {
      setSpeiStatus('generando');
      setSpeiError(null);
      setData(newData);
      setModal('spei');
      try {
        // CLABE INDIVIDUAL: usa la CLABE individual activa del alumno.
        // Si no tiene CLABE asignada, lanza error y no procede.
        const spei = await CobroController.iniciarSPEI(cobro, escuela, clienteSel);
        // Guardar info SPEI en el cobro
        const cobrosActualizados = newData.cobros.map(c => c.id === cobro.id ? {
          ...c,
          clabe: spei.clabe,
          banco: spei.banco,
          beneficiario: spei.beneficiario,
          referencia_spei: spei.referencia,
          instruccion: spei.instruccion,
          clabe_es_individual: !!spei.esIndividual
        } : c);
        const dataConClabe = {
          ...newData,
          cobros: cobrosActualizados
        };
        setData(dataConClabe);
        setCobroActivo(prev => ({
          ...prev,
          clabe: spei.clabe,
          referencia_spei: spei.referencia,
          instruccion: spei.instruccion,
          banco: spei.banco,
          beneficiario: spei.beneficiario,
          clabe_es_individual: !!spei.esIndividual
        }));
        setSpeiStatus('esperando');
        AppModel.save(dataConClabe);

        // Polling automático: verificar cada 10 segundos por referencia y/o CLABE individual
        speiPollRef.current = setInterval(async () => {
          try {
            const ver = await CobroController.verificarSPEI(spei.referencia, spei.clabe, cobro.id);
            if (ver.pagado) {
              clearInterval(speiPollRef.current);
              CobroController.confirmarPago(cobro.id, { transaccion: ver.transaccion }).then(res => {
                actualizarSaldoCliente(res);
              }).catch(()=>{});
              setData(prev => {
                const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobro.id ? { ...c, estado: 'pagado', auth_code: ver.transaccion } : c) };
                AppModel.save(upd);
                return upd;
              });
              setSpeiStatus('confirmado');
            }
          } catch (e) {/* continuar polling */}
        }, 10000);
      } catch (err) {
        setSpeiError(err.message);
        setSpeiStatus('error');
      }
    } else if (metodo === 'CoDi') {
      // CoDi: se mantiene igual (no hay API real disponible)
      setCodiStatus('esperando');
      setCodiTimer(300);
      setData(newData);
      setModal('codi');
      let t = 300;
      timerRef.current = setInterval(() => {
        t--;
        setCodiTimer(t);
        if (t <= 0) {
          clearInterval(timerRef.current);
          setCodiStatus('expirado');
        }
      }, 1000);
    } else if (metodo === 'TC') {
      // TC: generar liga de pago real con Pagadetodo
      setTcLoading(true);
      setTcError(null);
      setTcInfo(null);
      setData(newData);
      setModal('tc');
      try {
        const liga = await CobroController.iniciarTC(cobro);
        setTcInfo(liga);

        // Polling automático: igual que SPEI, revisa cada 10s si
        // webhook_liga.php ya marcó este cobro (por su ID exacto, nunca por
        // referencia compartida) como pagado, para no dejar al cajero
        // esperando frente a un modal que nunca se actualiza solo.
        if (tcPollRef.current) clearInterval(tcPollRef.current);
        tcPollRef.current = setInterval(async () => {
          try {
            const ver = await CobroController.verificarCobro(cobro.id);
            if (ver.pagado) {
              clearInterval(tcPollRef.current);
              const res = await CobroController.confirmarPago(cobro.id, { auth_code: String(ver.autorizacion || '') }).catch(() => null);
              if (res) actualizarSaldoCliente(res);
              setData(prev => {
                const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobro.id ? { ...c, estado: 'pagado', auth_code: String(ver.autorizacion || c.auth_code || '') } : c) };
                AppModel.save(upd);
                return upd;
              });
              setModal('ticket');
              resetCarrito();
            }
          } catch (e) {/* continuar polling */}
        }, 10000);
      } catch (err) {
        setTcError(err.message);
      } finally {
        setTcLoading(false);
      }
    } else if (metodo === 'Cheque') {
      // Cheque: mostrar modal para capturar datos del cheque antes de confirmar
      setData(newData);
      setChequeInfo({
        banco: '',
        num_cuenta: '',
        num_cheque: '',
        fecha_cheque: new Date().toISOString().slice(0, 10),
        titular: ''
      });
      setModal('cheque');
    } else if (metodo === 'EfectivoRef') {
      // Efectivo por referencia (OXXO / terceros): NO se cobra de inmediato.
      // Se genera la referencia con Cobroscontarjeta.com y el cobro queda
      // 'pendiente' hasta que el cliente pague en tienda y llegue el webhook
      // de pago_referencia.php.
      setEfvRefLoading(true);
      setEfvRefError(null);
      setEfvRefInfo(null);
      setData(newData);
      setModal('efectivoRef');
      try {
        const ref = await CobroController.iniciarEfectivoRef(cobro);
        setEfvRefInfo(ref);

        // Polling automático: igual que SPEI/TC, revisa cada 10s si el
        // webhook de pago_referencia.php ya marcó este cobro como pagado,
        // para no dejar al cajero esperando frente a un modal que nunca se
        // actualiza solo.
        if (efvRefPollRef.current) clearInterval(efvRefPollRef.current);
        efvRefPollRef.current = setInterval(async () => {
          try {
            const ver = await CobroController.verificarCobro(cobro.id);
            if (ver.pagado) {
              clearInterval(efvRefPollRef.current);
              const res = await CobroController.confirmarPago(cobro.id, { auth_code: String(ver.autorizacion || '') }).catch(() => null);
              if (res) actualizarSaldoCliente(res);
              setData(prev => {
                const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobro.id ? { ...c, estado: 'pagado', auth_code: String(ver.autorizacion || c.auth_code || '') } : c) };
                AppModel.save(upd);
                return upd;
              });
              setModal('ticket');
              resetCarrito();
            }
          } catch (e) {/* continuar polling */}
        }, 10000);
      } catch (err) {
        setEfvRefError(err.message);
      } finally {
        setEfvRefLoading(false);
      }
    } else if (metodo === 'CAI') {
      // Cargo automático (CAI): cobro inmediato con la tarjeta ya
      // domiciliada del alumno — a diferencia de TC/SPEI/EfectivoRef, no hay
      // nada que esperar: el proveedor aprueba o rechaza el cargo al
      // instante, no hace falta ningún modal de polling.
      setData(newData);
      try {
        const res = await CobroController.cobrarCAI(cobro);
        setData(prev => {
          const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobro.id ? { ...c, estado: 'pagado', metodo: 'TC', auth_code: res.autorizacion || '' } : c) };
          AppModel.save(upd);
          return upd;
        });
        const resSaldo = await CobroController.confirmarPago(cobro.id, { auth_code: res.autorizacion || '' }).catch(() => null);
        if (resSaldo) actualizarSaldoCliente(resSaldo);
        setModal('ticket');
        resetCarrito();
      } catch (err) {
        alert('No se pudo cobrar con la tarjeta guardada: ' + err.message);
      }
    } else {
      // Efectivo en caja: el cajero recibe el dinero en el momento, cobro
      // inmediato y se imprime el ticket. Distinto de "Efectivo por
      // referencia" (OXXO), que deja el cobro pendiente hasta el pago real.
      setData(newData);
      AppModel.save(newData);
      setModal('ticket');
      resetCarrito();
    }
  };

  /* ── CONFIRMAR TC MANUALMENTE (cliente ya pagó en el link) ── */
  const confirmarTC = async () => {
    try { const res = await CobroController.confirmarPago(cobroActivo.id, { auth_code: tcInfo?.referencia }); actualizarSaldoCliente(res); } catch(e) {}
    setData(prev => {
      const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobroActivo.id ? { ...c, estado: 'pagado', auth_code: tcInfo?.referencia } : c) };
      AppModel.save(upd);
      return upd;
    });
    setModal('ticket');
    resetCarrito();
  };

  /* ── CONFIRMAR SPEI MANUAL (botón de "ya pagué") ── */
  const confirmarSPEI = async () => {
    if (speiStatus === 'confirmado') {
      setModal('ticket');
      resetCarrito();
      return;
    }
    setSpeiStatus('verificando');
    try {
      const refSpei = cobroActivo?.referencia_spei || cobroActivo?.referencia || cobroActivo?.clabe;
      const clabeActiva = cobroActivo?.clabe;
      if (refSpei || clabeActiva) {
        const ver = await CobroController.verificarSPEI(refSpei, clabeActiva, cobroActivo?.id);
        if (ver.pagado) {
          clearInterval(speiPollRef.current);
          try { const res = await CobroController.confirmarPago(cobroActivo.id, { transaccion: ver.transaccion }); actualizarSaldoCliente(res); } catch(e) {}
          setData(prev => {
            const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobroActivo.id ? { ...c, estado: 'pagado', auth_code: ver.transaccion } : c) };
            AppModel.save(upd);
            return upd;
          });
          setSpeiStatus('confirmado');
          return;
        }
      }
      // Si no se verificó, confirmar manualmente de todas formas
      try { const res = await CobroController.confirmarPago(cobroActivo.id); actualizarSaldoCliente(res); } catch(e) {}
      setData(prev => {
        const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobroActivo.id ? { ...c, estado: 'pagado' } : c) };
        AppModel.save(upd); return upd;
      });
      setSpeiStatus('confirmado');
    } catch (e) {
      try { const res = await CobroController.confirmarPago(cobroActivo.id); actualizarSaldoCliente(res); } catch(e2) {}
      setData(prev => {
        const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobroActivo.id ? { ...c, estado: 'pagado' } : c) };
        AppModel.save(upd); return upd;
      });
      setSpeiStatus('confirmado');
    }
  };

  /* ── CONFIRMAR CODI MANUAL ── */
  const confirmarCoDi = async () => {
    clearInterval(timerRef.current);
    try { const res = await CobroController.confirmarPago(cobroActivo.id); actualizarSaldoCliente(res); } catch(e) {}
    setData(prev => {
      const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobroActivo.id ? { ...c, estado: 'pagado' } : c) };
      AppModel.save(upd); return upd;
    });
    setCodiStatus('pagado');
    setTimeout(() => {
      setModal('ticket');
      resetCarrito();
    }, 1200);
  };
  const resetCarrito = () => {
    setCarrito([]);
    setClienteSel(null);
    setTcInfo(null);
    setTcError(null);
    setEfvRefInfo(null);
    setEfvRefError(null);
    setChequeInfo({
      banco: '',
      num_cuenta: '',
      num_cheque: '',
      fecha_cheque: '',
      titular: ''
    });
    setFacturaPanel(null);
    setFacturaError(null);
    setCorreoDestino('');
    setCorreoMsg(null);
  };

  /* ── FACTURAR COMPRA (desde el ticket) ── */
  // Resuelve el cliente/familia del cobro directamente desde `data`, sin
  // depender de `clienteSel` (que ya se limpió en varios flujos de cobro
  // automático antes de que el usuario llegue a ver el ticket).
  const resolverClienteFactura = () => {
    if (!cobroActivo) return { cliente: null, familia: null };
    const cliente = data.clientes.find(c => c.id === cobroActivo.cliente_id) || null;
    const familia = cliente?.familia_id ? data.familias.find(f => f.id === cliente.familia_id) : null;
    return { cliente, familia };
  };
  const abrirFacturar = () => {
    const { cliente, familia } = resolverClienteFactura();
    // Los datos fiscales viven en la familia (tutor) cuando el alumno
    // pertenece a una; si no, se usa el respaldo a nivel alumno (clientes
    // "generales" sin familia asociada).
    const fiscal = familia?.rfc_factura ? familia : cliente;
    setFacturaForm({
      rfc: fiscal?.rfc_factura || '',
      razon_social: fiscal?.razon_social_factura || '',
      cp_receptor: fiscal?.cp_factura || '',
      domicilio: fiscal?.domicilio_factura || '',
      regimen: fiscal?.regimen_factura || '616',
      uso_cfdi: fiscal?.uso_cfdi_defecto || 'D10',
      email: familia?.email || cliente?.email || '',
    });
    setCorreoDestino(familia?.email || cliente?.email || '');
    setFacturaError(null);
    setFacturaPanel('form');
  };
  const generarFactura = async () => {
    if (!facturaForm.rfc || !facturaForm.razon_social || !facturaForm.cp_receptor) {
      setFacturaError('RFC, razón social y código postal son obligatorios.');
      return;
    }
    setFacturaLoading(true);
    setFacturaError(null);
    const { cliente } = resolverClienteFactura();
    try {
      const res = await CobroController.generarCFDI({
        cobro_id: cobroActivo.id,
        rfc: facturaForm.rfc,
        razon_social: facturaForm.razon_social,
        cp_receptor: facturaForm.cp_receptor,
        domicilio: facturaForm.domicilio,
        regimen: facturaForm.regimen,
        uso_cfdi: facturaForm.uso_cfdi,
        email: facturaForm.email,
        total: cobroActivo.total,
        descripcion: (cobroActivo.items || []).map(i => i.nombre).filter(Boolean).join(', ') || 'Servicios educativos',
        nombre_alumno: cliente?.nombre || '',
        curp_alumno: cliente?.curp || '',
        nivel_educativo: cliente?.nivel_educativo_sat || '',
        rvoe: escuela?.rvoe || '',
      });
      const cobroConFactura = { ...cobroActivo, factura: true, facturapi_id: res.facturapi_id, uuid: res.uuid, folio_fiscal: res.folio_fiscal };
      setCobroActivo(cobroConFactura);
      setData(prev => {
        const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobroActivo.id ? { ...c, factura: true, facturapi_id: res.facturapi_id } : c) };
        AppModel.save(upd);
        return upd;
      });
      setFacturaPanel(null);
    } catch (e) {
      setFacturaError(e.message);
    } finally {
      setFacturaLoading(false);
    }
  };
  const enviarCorreoFactura = async () => {
    if (!correoDestino) return;
    setEnviandoCorreo(true);
    setCorreoMsg(null);
    try {
      await CobroController.enviarFacturaCorreo(cobroActivo.id, correoDestino);
      setCorreoMsg({ ok: true, texto: 'Factura enviada a ' + correoDestino });
    } catch (e) {
      setCorreoMsg({ ok: false, texto: e.message });
    } finally {
      setEnviandoCorreo(false);
    }
  };
  const cerrarModal = () => {
    if (intervalRef.current) clearTimeout(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (speiPollRef.current) clearInterval(speiPollRef.current);
    if (tcPollRef.current) clearInterval(tcPollRef.current);
    if (efvRefPollRef.current) clearInterval(efvRefPollRef.current);
    setModal(null);
  };

  /* ── COPIAR CLABE ── */
  const copiarCLABE = () => {
    if (cobroActivo?.clabe) {
      navigator.clipboard.writeText(cobroActivo.clabe).catch(() => {});
      setCopiedCLABE(true);
      setTimeout(() => setCopiedCLABE(false), 2000);
    }
  };

  /* ── FORMATO CLABE ── */
  const fmtCLABE = clabe => clabe ? clabe.match(/.{1,4}/g).join(' ') : '—';

  /* ── Número a letras (para el comprobante de pago en efectivo) ── */
  const numeroALetras = monto => {
    const entero = Math.floor(monto);
    const centavos = Math.round((monto - entero) * 100);
    const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const DIEC = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const VEINT = ['VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
    const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
    const menorMil = n => {
      if (n === 0) return '';
      if (n === 100) return 'CIEN';
      let out = '';
      const c = Math.floor(n / 100), resto = n % 100;
      if (c > 0) out += CENTENAS[c] + ' ';
      if (resto > 0) {
        if (resto < 10) out += UNIDADES[resto];
        else if (resto < 20) out += DIEC[resto - 10];
        else if (resto < 30) out += VEINT[resto - 20];
        else {
          const d = Math.floor(resto / 10), u = resto % 10;
          out += DECENAS[d] + (u > 0 ? ' Y ' + UNIDADES[u] : '');
        }
      }
      return out.trim();
    };
    const convertir = n => {
      if (n === 0) return 'CERO';
      let out = '';
      const millones = Math.floor(n / 1000000);
      const miles = Math.floor((n % 1000000) / 1000);
      const resto = n % 1000;
      if (millones > 0) out += (millones === 1 ? 'UN MILLÓN ' : menorMil(millones) + ' MILLONES ');
      if (miles > 0) out += (miles === 1 ? 'MIL ' : menorMil(miles) + ' MIL ');
      if (resto > 0) out += menorMil(resto);
      return out.trim();
    };
    return `${convertir(entero)} PESOS ${String(centavos).padStart(2, '0')}/100 M.N.`;
  };

  /* ── Comprobante de pago en efectivo (propio, con marca de la escuela) ──
     Antes el botón "Ver / imprimir formato de pago (PDF)" abría el formato
     genérico que hospeda el proveedor (Cobroscontarjeta.com/Pagadetodo,
     con SU logo) — este abre una página propia, con el logo real de la
     escuela, lista para imprimir/guardar como PDF desde el navegador. No
     hay ninguna librería de PDF en el proyecto (ver ExcelExport.js), así
     que el mecanismo es el mismo usado ahí: una página HTML autocontenida,
     aquí pensada para imprimirse en vez de para Excel. */
  const TIENDAS_PARTICIPANTES = [
    { nombre: '7-Eleven', archivo: '7eleven.png' },
    { nombre: 'Soriana', archivo: 'soriana.png' },
    { nombre: 'Farmacias del Ahorro', archivo: 'farmacias-del-ahorro.png' },
    { nombre: 'Farmacias Benavides', archivo: 'benavides.png' },
    { nombre: 'City Club', archivo: 'city-club.png' },
    { nombre: 'Extra', archivo: 'extra.png' },
    { nombre: 'Walmart', archivo: 'walmart.png' },
    { nombre: 'Bodega Aurrerá', archivo: 'bodega-aurrera.png' },
    { nombre: 'Suburbia', archivo: 'suburbia.png' },
    { nombre: "Sam's Club", archivo: 'sams-club.png' },
    { nombre: 'Circle K', archivo: 'circle-k.png' },
    { nombre: 'Abarrotes Monterrey', archivo: 'abarrotes-monterrey.png' },
  ];
  // Rutas esperadas: assets/tiendas/<archivo> — coloca ahí los logos con
  // autorización/convenio de cada cadena. Si falta el archivo, se
  // oculta la imagen y solo se ve el nombre (ver onerror abajo).
  const abrirComprobanteEfectivo = () => {
    if (!efvRefInfo || !cobroActivo) return;
    const cliente = (data.clientes || []).find(c => c.id === cobroActivo.cliente_id) || null;
    const familia = cliente?.familia_id ? (data.familias || []).find(f => f.id === cliente.familia_id) : null;
    const total = Number(cobroActivo.total || 0);
    const logo = escuela?.logo_url || 'assets/logo.jpeg';
    const nombreEscuela = escuela?.nombre || 'Paga la Escuela';
    const hoy = new Date();
    const fechaEmision = hoy.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const vencimiento = efvRefInfo.vencimiento
      ? new Date(efvRefInfo.vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      : '';
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Formato de pago — ${esc(cobroActivo.folio || '')}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #eef0f5; font-family: 'Segoe UI', Arial, sans-serif; color: #1e2430; }
  .voucher { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.12); }
  .v-top { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 12px; border-bottom: 3px solid #282d65; }
  .v-top img { height: 48px; max-width: 200px; object-fit: contain; }
  .v-titulo { text-align: right; }
  .v-titulo h1 { margin: 0; font-size: 20px; color: #282d65; }
  .v-titulo span { font-size: 11px; color: #6b7280; }
  .v-body { padding: 18px 24px; }
  .v-cliente { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; margin-bottom: 14px; }
  .v-cliente .lbl { color: #6b7280; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  .v-concepto { background: #f4f5f9; border-radius: 10px; padding: 10px 14px; font-size: 12.5px; margin-bottom: 16px; }
  .v-total-row { display: flex; align-items: center; justify-content: space-between; background: #282d65; color: #fff; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; }
  .v-total-row .lbl { font-size: 11px; opacity: .85; text-transform: uppercase; letter-spacing: .5px; }
  .v-total-row .monto { font-size: 26px; font-weight: 800; }
  .v-letras { font-size: 10.5px; color: #6b7280; text-align: right; margin: -10px 0 16px; }
  .v-barcode { text-align: center; margin-bottom: 6px; }
  .v-barcode img { max-width: 100%; height: 64px; }
  .v-ref { text-align: center; font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; letter-spacing: 1px; word-break: break-all; margin-bottom: 18px; }
  .v-venc { text-align: center; font-size: 11.5px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px; margin-bottom: 18px; }
  .v-instr h3 { font-size: 12.5px; margin: 0 0 8px; color: #282d65; }
  .v-instr ol, .v-instr ul { margin: 0 0 16px; padding-left: 20px; font-size: 12px; color: #374151; line-height: 1.6; }
  .v-tiendas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
  .v-tienda { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 4px; padding: 8px 6px; border-radius: 10px; background: #f4f5f9; border: 1px solid #e5e7eb; font-size: 9.5px; font-weight: 700; color: #282d65; line-height: 1.2; min-height: 48px; }
  .v-tienda img { max-width: 100%; max-height: 26px; object-fit: contain; }
  .v-foot { text-align: center; font-size: 10.5px; color: #9ca3af; padding: 14px 24px; border-top: 1px solid #e5e7eb; }
  @media print {
    body { background: #fff; padding: 0; }
    .voucher { box-shadow: none; max-width: 100%; }
    .v-noprint { display: none; }
  }
</style>
</head><body>
  <div class="voucher">
    <div class="v-top">
      <img src="${esc(logo)}" alt="${esc(nombreEscuela)}" onerror="this.style.display='none'">
      <div class="v-titulo"><h1>Formato de Pago</h1><span>${esc(nombreEscuela)}</span></div>
    </div>
    <div class="v-body">
      <div class="v-cliente">
        <div><div class="lbl">Alumno</div>${esc(cliente?.nombre || 'Cliente general')}</div>
        ${familia ? `<div style="text-align:right"><div class="lbl">Contacto</div>${esc(familia.contacto || familia.nombre || '')}${familia.email ? `<br>${esc(familia.email)}` : ''}</div>` : ''}
      </div>
      <div class="v-concepto">
        <strong>Concepto:</strong> ${esc(cobroActivo.descripcion || cobroActivo.items?.map(i => i.nombre).filter(Boolean).join(', ') || 'Pago escolar')}<br>
        <strong>Folio:</strong> ${esc(cobroActivo.folio || '')} &nbsp;·&nbsp; <strong>Fecha de emisión:</strong> ${esc(fechaEmision)}
      </div>
      <div class="v-total-row">
        <span class="lbl">Total a pagar</span>
        <span class="monto">${fmt(total)}</span>
      </div>
      <div class="v-letras">(${esc(numeroALetras(total))})</div>
      ${efvRefInfo.barcode_url ? `<div class="v-barcode"><img src="${esc(efvRefInfo.barcode_url)}" alt="Código de barras"></div>` : ''}
      <div class="v-ref">${esc(efvRefInfo.referencia || '')}</div>
      ${vencimiento ? `<div class="v-venc">Acude a pagar antes del ${esc(vencimiento)}</div>` : ''}
      <div class="v-instr">
        <h3>Tiendas participantes</h3>
        <div class="v-tiendas">
          ${TIENDAS_PARTICIPANTES.map(t => `<div class="v-tienda"><img src="assets/tiendas/${esc(t.archivo)}" alt="${esc(t.nombre)}" onerror="this.style.display='none'">${esc(t.nombre)}</div>`).join('')}
        </div>
        <h3>Instrucciones para realizar tu pago</h3>
        <ul>
          <li>Acude a cualquier tienda de conveniencia o farmacia participante que reciba pagos de servicios.</li>
          <li>Solicita hacer un pago de servicios y proporciona el código de barras o el número de referencia de este formato.</li>
          <li>Realiza tu pago en efectivo. La tienda te entregará un ticket como comprobante — consérvalo por cualquier aclaración.</li>
          <li>Tu pago se reflejará automáticamente en ${esc(nombreEscuela)} en cuanto la tienda lo confirme.</li>
        </ul>
      </div>
      <button class="v-noprint" onclick="window.print()" style="width:100%; padding:12px; border:none; border-radius:10px; background:#bdcf00; color:#1a1a1a; font-weight:700; font-size:13px; cursor:pointer;">Imprimir / Guardar como PDF</button>
    </div>
    <div class="v-foot">Cualquier duda sobre tu pago, contacta a la administración de ${esc(nombreEscuela)}.</div>
  </div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Tu navegador bloqueó la ventana emergente. Habilítala para ver el comprobante.'); return; }
    w.document.write(html);
    w.document.close();
  };

  /* ── QR CODI (SVG simple) ── */
  const QRSimple = ({
    value
  }) => {
    // QR placeholder visual (pattern basado en value hash)
    const hash = value ? [...value].reduce((a, c) => a + c.charCodeAt(0), 0) : 42;
    const cells = 21;
    const grid = Array.from({
      length: cells
    }, (_, r) => Array.from({
      length: cells
    }, (_, c) => {
      // Corner finder patterns
      if (r < 7 && c < 7 || r < 7 && c >= cells - 7 || r >= cells - 7 && c < 7) return 1;
      // Data pattern based on hash
      return hash * (r + 1) * (c + 1) % 7 < 3 ? 1 : 0;
    }));
    const size = 160;
    const cellSize = size / cells;
    return /*#__PURE__*/_jsxDEV("svg", {
      width: size,
      height: size,
      viewBox: `0 0 ${size} ${size}`,
      xmlns: "http://www.w3.org/2000/svg",
      children: [/*#__PURE__*/_jsxDEV("rect", {
        width: size,
        height: size,
        fill: "#fff"
      }, void 0, false), grid.map((row, r) => row.map((cell, c) => cell ? /*#__PURE__*/_jsxDEV("rect", {
        x: c * cellSize,
        y: r * cellSize,
        width: cellSize,
        height: cellSize,
        fill: "#000"
      }, `${r}-${c}`, false) : null))]
    }, void 0, true);
  };
  const REGIMENES_FACTURA = [
    { value: '616', label: '616 — Sin obligaciones fiscales (personas físicas)' },
    { value: '601', label: '601 — General Personas Morales' },
    { value: '612', label: '612 — Personas Físicas con Actividades Empresariales' },
    { value: '626', label: '626 — RESICO' },
  ];
  const USOS_CFDI_FACTURA = [
    { value: 'D10', label: 'D10 — Pagos por servicios educativos (recomendado)' },
    { value: 'G01', label: 'G01 — Adquisición de mercancías' },
    { value: 'G03', label: 'G03 — Gastos en general' },
    { value: 'S01', label: 'S01 — Sin efectos fiscales' },
  ];
  const METODOS = [{
    id: 'TC',
    label: 'Tarjeta',
    icon: 'card'
  }, {
    id: 'SPEI',
    label: 'SPEI',
    icon: 'bank'
  }, {
    id: 'EfectivoRef',
    label: 'Efectivo (tienda)',
    icon: 'pay'
  }, {
    id: 'Cheque',
    label: 'Cheque',
    icon: 'reportes'
  }];
  // Cargo automático (CAI): solo aparece si el alumno seleccionado ya tiene
  // una tarjeta domiciliada activa de un pago anterior — no pide tarjeta de
  // nuevo, cobra directo con el token guardado.
  const metodosDisponibles = clienteSel?.token_tarjeta_estado === 'activo'
    ? [...METODOS, { id: 'CAI', label: 'Tarjeta guardada', icon: 'card' }]
    : METODOS;
  if (requiereCajaAbierta && cajaEstadoCargando) {
    return /*#__PURE__*/_jsxDEV("div", {
      className: "empty-state",
      style: { padding: 60 },
      children: [/*#__PURE__*/_jsxDEV("span", { className: "spinner" }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "empty-text", style: { marginTop: 14 }, children: "Cargando estado de caja…"
      }, void 0, false)]
    }, void 0, true);
  }
  if (requiereCajaAbierta && !cajaAbierta) {
    return /*#__PURE__*/_jsxDEV("div", {
      style: { maxWidth: 420, margin: '60px auto', textAlign: 'center' },
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "empty-icon", children: /*#__PURE__*/_jsxDEV(Icon, { name: "caja", size: 40, color: "currentColor" }, void 0, false)
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        style: { fontSize: 16, fontWeight: 700, marginBottom: 6, marginTop: 10 },
        children: "No tienes una caja abierta"
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 18 },
        children: "Antes de cobrar, abre tu turno de caja con el fondo inicial de efectivo."
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "form-group",
        children: [/*#__PURE__*/_jsxDEV("label", { className: "form-label", children: "Fondo de apertura" }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
          className: "form-input", type: "number", placeholder: "0.00", value: montoApertura,
          onChange: e => setMontoApertura(e.target.value), style: { fontFamily: 'var(--mono)', textAlign: 'center' }
        }, void 0, false)]
      }, void 0, true), errorCaja && /*#__PURE__*/_jsxDEV("div", {
        style: { fontSize: 12.5, color: 'var(--red)', margin: '10px 0' }, children: errorCaja
      }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
        className: "btn btn-primary", style: { width: '100%', marginTop: 10 },
        disabled: abriendoCaja, onClick: abrirMiCaja,
        children: abriendoCaja ? 'Abriendo…' : 'Abrir caja'
      }, void 0, false)]
    }, void 0, true);
  }
  return /*#__PURE__*/_jsxDEV("div", {
    className: "pos-layout",
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "pos-products",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "pos-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' },
          children: [/*#__PURE__*/_jsxDEV("span", {
            style: { fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 },
            children: [/*#__PURE__*/_jsxDEV(Icon, { name: "productos", size: 15, color: "currentColor" }, void 0, false), " Conceptos"]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "search-bar",
            style: { flex: 1, minWidth: 120 },
            children: [/*#__PURE__*/_jsxDEV("span", {
              className: "search-icon",
              children: /*#__PURE__*/_jsxDEV(Icon, { name: "search", size: 15, color: "currentColor" }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              placeholder: "Buscar concepto…",
              value: q,
              onChange: e => setQ(e.target.value)
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: { display: 'flex', gap: 5, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--glass-light)', marginTop: 4 },
          children: [
            { id: 'todos',        label: 'Todos',        icon: 'productos' },
            { id: 'por_categoria',label: 'Por categoría',icon: 'cobros' },
            { id: 'descuentos',   label: 'Descuentos',   icon: 'check' },
            { id: 'periodicos',   label: 'Periódicos',   icon: 'history' },
            { id: 'unicos',       label: 'Conceptos únicos', icon: 'pay' },
            { id: 'mayor_precio', label: 'Mayor precio', icon: 'reportes' },
            { id: 'menor_precio', label: 'Menor precio', icon: 'download' },
            { id: 'alfabetico',   label: 'A–Z',          icon: 'search' },
          ].map(tab => /*#__PURE__*/_jsxDEV("button", {
            onClick: () => setClasificacion(tab.id),
            style: {
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11.5,
              fontFamily: 'var(--font)', cursor: 'pointer', border: '1px solid',
              transition: 'all .15s',
              background: clasificacion === tab.id ? 'var(--accent)' : 'var(--bg-surface-2)',
              borderColor: clasificacion === tab.id ? 'var(--accent)' : 'var(--border-glow)',
              color: clasificacion === tab.id ? 'var(--on-accent)' : 'var(--ink-3)',
              fontWeight: clasificacion === tab.id ? 700 : 400,
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, { name: tab.icon, size: 12, color: "currentColor" }, void 0, false), tab.label]
          }, tab.id, true))
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "pos-products-grid",
        children: [productosPorCategoria ? productosPorCategoria.map(([cat, prods]) => /*#__PURE__*/_jsxDEV(_Fragment, {
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              gridColumn: '1/-1', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.6px', color: 'var(--ink-4)', padding: '8px 2px 4px',
              borderBottom: '1px solid var(--glass-light)', marginBottom: 2
            },
            children: CAT_LABELS_CAJA[cat] || cat
          }, void 0, false), prods.map(p => /*#__PURE__*/_jsxDEV("div", {
            className: "product-card",
            onClick: () => addItem(p),
            children: [/*#__PURE__*/_jsxDEV("div", { className: "product-emoji", children: p.emoji }, void 0, false),
              /*#__PURE__*/_jsxDEV("div", { className: "product-name", children: p.nombre }, void 0, false),
              /*#__PURE__*/_jsxDEV("div", { className: "product-type", children: CAT_LABELS_CAJA[p.categoria] || p.categoria }, void 0, false),
              /*#__PURE__*/_jsxDEV("div", { className: "product-price", style: { color: p.precio < 0 ? 'var(--green)' : 'var(--accent)' }, children: fmt(p.precio) }, void 0, false)]
          }, p.id, true))]
        }, cat, true)) : productosFiltrados.length === 0 ? /*#__PURE__*/_jsxDEV("div", {
          className: "empty-state",
          style: { gridColumn: '1/-1' },
          children: [/*#__PURE__*/_jsxDEV("div", { className: "empty-icon", children: /*#__PURE__*/_jsxDEV(Icon, { name: "search", size: 36, color: "currentColor" }, void 0, false) }, void 0, false),
            /*#__PURE__*/_jsxDEV("div", { className: "empty-text", children: "Sin resultados" }, void 0, false)]
        }, void 0, true) : productosFiltrados.map(p => /*#__PURE__*/_jsxDEV("div", {
          className: "product-card",
          onClick: () => addItem(p),
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "product-emoji",
            children: p.emoji
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "product-name",
            children: p.nombre
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "product-type",
            children: p.categoria
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "product-price",
            style: {
              color: p.precio < 0 ? 'var(--green)' : 'var(--accent)'
            },
            children: fmt(p.precio)
          }, void 0, false)]
        }, p.id, true))]
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      className: "pos-cart",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "cart-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            fontWeight: 600,
            fontSize: 13.5,
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 7
          },
          children: [/*#__PURE__*/_jsxDEV(Icon, {
            name: "cobros",
            size: 15,
            color: "currentColor"
          }, void 0, false), " Cobro en curso"]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "cart-customer",
          onClick: () => { setQCliente(''); setModal('cliente'); },
          children: [/*#__PURE__*/_jsxDEV(Icon, {
            name: clienteSel ? 'alumnos' : 'familias',
            size: 18,
            color: "var(--ink-3)"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              flex: 1,
              minWidth: 0
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--accent)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              },
              children: clienteSel?.nombre || 'Seleccionar alumno/familia'
            }, void 0, false), clienteSel && /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-3)'
              },
              children: [clienteSel.tipo, " · ", clienteSel.grado]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
            style: {
              fontSize: 12,
              color: 'var(--accent)'
            },
            children: "›"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "cart-items",
        children: [carrito.length === 0 && /*#__PURE__*/_jsxDEV("div", {
          className: "empty-state",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "empty-icon",
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "caja",
              size: 36,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "empty-text",
            children: "Sin conceptos"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "empty-sub",
            children: "Selecciona conceptos de la izquierda"
          }, void 0, false)]
        }, void 0, true), carrito.map(item => /*#__PURE__*/_jsxDEV("div", {
          className: "cart-item",
          children: [/*#__PURE__*/_jsxDEV("span", {
            style: {
              fontSize: 20
            },
            children: item.emoji
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "cart-item-info",
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "cart-item-name",
              children: item.nombre
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "cart-item-qty",
              children: [/*#__PURE__*/_jsxDEV("button", {
                className: "qty-btn",
                onClick: () => setQty(item.id, item.qty - 1),
                children: "−"
              }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                className: "qty-num",
                children: item.qty
              }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                className: "qty-btn",
                onClick: () => setQty(item.id, item.qty + 1),
                children: "+"
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              textAlign: 'right'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "cart-item-price",
              children: fmt(item.precio * item.qty)
            }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
              className: "cart-remove",
              onClick: () => removeItem(item.id),
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "close",
                size: 15,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false)]
          }, void 0, true)]
        }, item.id, true))]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "cart-totals",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "totals-row",
          children: [/*#__PURE__*/_jsxDEV("span", {
            children: "Subtotal"
          }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
            className: "text-mono",
            children: fmt(subtotal)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "totals-row",
          style: {
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--ink)',
            marginTop: 6
          },
          children: [/*#__PURE__*/_jsxDEV("span", {
            children: "Total"
          }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
            className: "totals-total",
            children: fmt(total)
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "payment-methods",
        children: metodosDisponibles.map(m => /*#__PURE__*/_jsxDEV("div", {
          className: `pay-method ${metodo === m.id ? 'selected' : ''}`,
          onClick: () => { setMetodo(m.id); setSpeiBloqueo(null); },
          children: [/*#__PURE__*/_jsxDEV("span", {
            className: "pm-icon",
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: m.icon,
              size: 18,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false), m.label]
        }, m.id, true))
      }, void 0, false), speiBloqueo && metodo === 'SPEI' && /*#__PURE__*/_jsxDEV("div", {
        style: {
          margin: '0 0 10px',
          padding: '12px 14px',
          background: 'rgba(239,68,68,.08)',
          border: '1px solid rgba(239,68,68,.3)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12.5,
          color: 'var(--red)',
          lineHeight: 1.5,
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 },
          children: [/*#__PURE__*/_jsxDEV(Icon, { name: "warning", size: 14, color: "currentColor" }, void 0, false),
            speiBloqueo.tipo === 'sin_alumno' ? 'Alumno requerido' : 'CLABE SPEI no disponible']
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: { color: 'var(--ink-2)' },
          children: speiBloqueo.msg
        }, void 0, false), speiBloqueo.tipo === 'sin_clabe' && /*#__PURE__*/_jsxDEV("div", {
          style: { marginTop: 6, fontSize: 11.5, color: 'var(--ink-3)' },
          children: "Asigna una CLABE individual desde Alumnos → ficha del alumno → sección SPEI."
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
        className: "checkout-btn",
        onClick: cobrar,
        disabled: !carrito.length || total === 0,
        children: ["Cobrar ", fmt(total)]
      }, void 0, true)]
    }, void 0, true), modal === 'cliente' && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            children: "Seleccionar alumno o familia"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setModal(null),
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "close",
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "search-bar",
          style: {
            margin: '10px 18px 0'
          },
          children: [/*#__PURE__*/_jsxDEV("span", {
            className: "search-icon",
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "search",
              size: 15,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
            placeholder: "Buscar por nombre, matrícula, grado o familia…",
            value: qCliente,
            onChange: e => setQCliente(e.target.value),
            autoFocus: true
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          style: {
            padding: '10px 18px'
          },
          children: [clientesFiltrados.length === 0 && /*#__PURE__*/_jsxDEV("div", {
            className: "empty-state",
            children: /*#__PURE__*/_jsxDEV("div", {
              className: "empty-text",
              children: "Sin resultados para esa búsqueda"
            }, void 0, false)
          }, void 0, false), clientesFiltrados.map(c => {
            const fam = c.familia_id ? data.familias.find(f => f.id === c.familia_id) : null;
            return /*#__PURE__*/_jsxDEV("div", {
              onClick: () => {
                setClienteSel(c);
                setSpeiBloqueo(null);
                setModal(null);
              },
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 8px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                borderBottom: '1px solid var(--glass-light)',
                transition: 'background .15s'
              },
              onMouseEnter: e => e.currentTarget.style.background = 'var(--glass-light)',
              onMouseLeave: e => e.currentTarget.style.background = 'transparent',
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "avatar avatar-admin",
                children: c.nombre.charAt(0)
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  flex: 1,
                  minWidth: 0
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontWeight: 500,
                    fontSize: 13,
                    color: 'var(--ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5
                  },
                  children: [clientesFiltradosExactos.has(c.id) && /*#__PURE__*/_jsxDEV(Icon, {
                    name: "escuelas",
                    size: 14,
                    color: "var(--lime)",
                    style: { display: 'inline', flexShrink: 0 }
                  }, void 0, false), c.nombre]
                }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap'
                  },
                  children: [/*#__PURE__*/_jsxDEV("span", {
                    children: c.grado
                  }, void 0, false), c.matricula && /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      fontFamily: 'var(--mono)'
                    },
                    children: ["· ", c.matricula]
                  }, void 0, true), fam && /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5
                    },
                    children: ["· ", /*#__PURE__*/_jsxDEV(Icon, {
                      name: "familias",
                      size: 13,
                      color: "currentColor"
                    }, void 0, false), " ", fam.nombre.split(' ').slice(1, 3).join(' ')]
                  }, void 0, true)]
                }, void 0, true)]
              }, void 0, true), c.saldo_pendiente > 0 && /*#__PURE__*/_jsxDEV("span", {
                style: {
                  color: 'var(--amber)',
                  fontSize: 12,
                  fontFamily: 'var(--mono)',
                  fontWeight: 600,
                  flexShrink: 0
                },
                children: fmt(c.saldo_pendiente)
              }, void 0, false)]
            }, c.id, true);
          }), clientesFiltradosTotal.length > CLIENTES_CAP && /*#__PURE__*/_jsxDEV("div", {
            style: { fontSize: 11.5, color: 'var(--ink-4)', padding: '8px 4px', textAlign: 'center' },
            children: `Mostrando ${CLIENTES_CAP} de ${clientesFiltradosTotal.length} — escribe para acotar la búsqueda`
          }, void 0, false)]
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost",
            onClick: () => {
              setClienteSel(null);
              setModal(null);
            },
            children: "Sin cliente específico"
          }, void 0, false)
        }, void 0, false)]
      }, void 0, true)
    }, void 0, false), modal === 'spei' && cobroActivo && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "bank",
              size: 18,
              color: "currentColor"
            }, void 0, false), " Pago por Transferencia SPEI"]
          }, void 0, true), speiStatus === 'confirmado' && /*#__PURE__*/_jsxDEV("span", {
            className: "badge badge-green",
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "check",
              size: 11,
              color: "currentColor"
            }, void 0, false), " Confirmado"]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [speiStatus !== 'confirmado' && /*#__PURE__*/_jsxDEV(_Fragment, {
            children: [speiStatus === 'generando' && /*#__PURE__*/_jsxDEV("div", {
              className: "verif-row",
              style: {
                justifyContent: 'center',
                padding: '20px 0'
              },
              children: [/*#__PURE__*/_jsxDEV("span", {
                className: "spinner",
                style: {
                  borderTopColor: 'var(--accent)'
                }
              }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 13,
                  color: 'var(--ink-2)',
                  marginLeft: 10
                },
                children: "Cargando CLABE de pago…"
              }, void 0, false)]
            }, void 0, true), speiStatus === 'error' && /*#__PURE__*/_jsxDEV("div", {
              style: {
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: 'var(--radius)',
                padding: '14px 16px',
                marginBottom: 14
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 600,
                  color: 'var(--red)',
                  marginBottom: 4
                },
                children: [/*#__PURE__*/_jsxDEV(Icon, {
                  name: "warning",
                  size: 15,
                  color: "var(--red)"
                }, void 0, false), " Error al obtener CLABE"]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 12,
                  color: 'var(--ink-2)'
                },
                children: speiError
              }, void 0, false)]
            }, void 0, true), (speiStatus === 'esperando' || speiStatus === 'verificando') && /*#__PURE__*/_jsxDEV("div", {
              className: "spei-box",
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'rgba(255,255,255,.5)',
                  marginBottom: 4,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  letterSpacing: '.5px'
                },
                children: cobroActivo?.clabe_es_individual ? `CLABE Individual · ${cobroActivo?.cliente || 'Alumno'}` : 'CLABE Interbancaria Fija · STP'
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                className: "clabe-display",
                children: fmtCLABE(cobroActivo?.clabe)
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginBottom: 12
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  className: "spei-info-row",
                  style: {
                    flexDirection: 'column',
                    gap: 2,
                    alignItems: 'flex-start'
                  },
                  children: [/*#__PURE__*/_jsxDEV("span", {
                    className: "spei-label",
                    children: "Beneficiario"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                    className: "spei-value",
                    style: {
                      fontSize: 12
                    },
                    children: cobroActivo?.beneficiario || escuela?.nombre || 'Escuela'
                  }, void 0, false)]
                }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                  className: "spei-info-row",
                  style: {
                    flexDirection: 'column',
                    gap: 2,
                    alignItems: 'flex-start'
                  },
                  children: [/*#__PURE__*/_jsxDEV("span", {
                    className: "spei-label",
                    children: "Monto exacto"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                    className: "spei-value",
                    style: {
                      fontSize: 16
                    },
                    children: fmt(cobroActivo?.total)
                  }, void 0, false)]
                }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                  className: "spei-info-row",
                  style: {
                    flexDirection: 'column',
                    gap: 2,
                    alignItems: 'flex-start',
                    gridColumn: '1/-1'
                  },
                  children: [/*#__PURE__*/_jsxDEV("span", {
                    className: "spei-label",
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5
                    },
                    children: [/*#__PURE__*/_jsxDEV(Icon, {
                      name: "warning",
                      size: 12,
                      color: "currentColor"
                    }, void 0, false), cobroActivo?.clabe_es_individual ? 'Concepto (opcional, recomendado)' : 'Concepto obligatorio (copiar exacto)']
                  }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
                    className: "spei-value",
                    style: {
                      fontFamily: 'var(--mono)',
                      letterSpacing: 1,
                      color: '#fbbf24',
                      fontSize: 15
                    },
                    children: cobroActivo?.referencia_spei || cobroActivo?.referencia || cobroActivo?.folio
                  }, void 0, false)]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
                className: `copy-btn ${copiedCLABE ? 'copied' : ''}`,
                onClick: copiarCLABE,
                children: copiedCLABE ? 'CLABE copiada' : 'Copiar CLABE al portapapeles'
              }, void 0, false)]
            }, void 0, true), (speiStatus === 'esperando' || speiStatus === 'verificando') && /*#__PURE__*/_jsxDEV("div", {
              className: "verif-row",
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "verif-dot pulse",
                style: {
                  background: speiStatus === 'verificando' ? 'var(--amber)' : 'var(--accent)'
                }
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 12.5,
                  color: 'var(--ink-2)'
                },
                children: speiStatus === 'esperando' ? 'Esperando transferencia… verificación automática cada 10s' : 'Verificando pago…'
              }, void 0, false), speiStatus === 'verificando' && /*#__PURE__*/_jsxDEV("span", {
                className: "spinner",
                style: {
                  marginLeft: 'auto'
                }
              }, void 0, false)]
            }, void 0, true), (speiStatus === 'esperando' || speiStatus === 'verificando') && /*#__PURE__*/_jsxDEV("p", {
              style: {
                fontSize: 11.5,
                color: 'var(--ink-4)',
                marginTop: 10,
                lineHeight: 1.5
              },
              children: cobroActivo?.clabe_es_individual ? /*#__PURE__*/_jsxDEV(_Fragment, {
                children: ["ℹ Esta CLABE pertenece exclusivamente a ", cobroActivo?.cliente || 'este alumno', ". Cualquier transferencia recibida aquí se identificará automáticamente, sin importar el concepto."]
              }, void 0, true) : /*#__PURE__*/_jsxDEV(_Fragment, {
                children: "ℹ Transfiere a esta CLABE individual. El pago se confirmará automáticamente."
              }, void 0, false)
            }, void 0, false)]
          }, void 0, true), speiStatus === 'confirmado' && /*#__PURE__*/_jsxDEV("div", {
            style: {
              textAlign: 'center',
              padding: '10px 0'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'center',
                marginBottom: 12
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "check",
                size: 52,
                color: "var(--green)"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--ink)',
                marginBottom: 6
              },
              children: "¡Pago recibido!"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 13.5,
                color: 'var(--ink-3)',
                marginBottom: 4
              },
              children: ["Transferencia verificada · ", cobroActivo.folio]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 22,
                fontWeight: 800,
                color: 'var(--green)',
                fontFamily: 'var(--mono)'
              },
              children: fmt(cobroActivo.total)
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => {
              cerrarModal();
            },
            children: speiStatus === 'confirmado' ? 'Cerrar' : 'Dejar pendiente'
          }, void 0, false), speiStatus !== 'confirmado' && /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: confirmarSPEI,
            disabled: speiStatus === 'verificando' || speiStatus === 'generando',
            children: speiStatus === 'verificando' ? /*#__PURE__*/_jsxDEV(_Fragment, {
              children: [/*#__PURE__*/_jsxDEV("span", {
                className: "spinner"
              }, void 0, false), " Verificando…"]
            }, void 0, true) : speiStatus === 'generando' ? /*#__PURE__*/_jsxDEV(_Fragment, {
              children: [/*#__PURE__*/_jsxDEV("span", {
                className: "spinner"
              }, void 0, false), " Generando…"]
            }, void 0, true) : 'Confirmar pago recibido'
          }, void 0, false), speiStatus === 'confirmado' && /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-success",
            onClick: () => {
              cerrarModal();
              setModal('ticket');
            },
            children: "Ver ticket"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modal === 'codi' && cobroActivo && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "phone",
              size: 18,
              color: "currentColor"
            }, void 0, false), " Pago con CoDi"]
          }, void 0, true), codiStatus === 'pagado' && /*#__PURE__*/_jsxDEV("span", {
            className: "badge badge-green",
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "check",
              size: 11,
              color: "currentColor"
            }, void 0, false), " Pagado"]
          }, void 0, true), codiStatus === 'expirado' && /*#__PURE__*/_jsxDEV("span", {
            className: "badge badge-red",
            children: "Expirado"
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          style: {
            textAlign: 'center'
          },
          children: [codiStatus !== 'pagado' && codiStatus !== 'expirado' && /*#__PURE__*/_jsxDEV(_Fragment, {
            children: [/*#__PURE__*/_jsxDEV("p", {
              style: {
                fontSize: 13,
                color: 'var(--ink-3)',
                marginBottom: 14
              },
              children: codiStatus === 'esperando' ? 'Muestra este código QR al cliente para pagar desde su app bancaria' : '¡Código escaneado! Esperando confirmación del banco…'
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "codi-qr",
              style: {
                opacity: codiStatus === 'escaneado' ? .6 : 1,
                transition: 'opacity .3s'
              },
              children: /*#__PURE__*/_jsxDEV(QRSimple, {
                value: cobroActivo.codi_payload
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 24,
                fontWeight: 800,
                color: 'var(--accent)',
                fontFamily: 'var(--mono)',
                margin: '14px 0 4px'
              },
              children: fmt(cobroActivo.total)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--ink-3)',
                marginBottom: 12
              },
              children: cobroActivo.folio
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 13,
                color: codiTimer < 60 ? 'var(--red)' : 'var(--ink-3)',
                fontFamily: 'var(--mono)',
                marginBottom: 10
              },
              children: ["Expira en ", Math.floor(codiTimer / 60), ":", String(codiTimer % 60).padStart(2, '0')]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "progress-bar",
              style: {
                marginBottom: 14
              },
              children: /*#__PURE__*/_jsxDEV("div", {
                className: "progress-fill",
                style: {
                  width: codiTimer / 300 * 100 + '%',
                  background: codiTimer < 60 ? 'var(--red)' : 'var(--accent)',
                  transition: 'width 1s linear, background .5s'
                }
              }, void 0, false)
            }, void 0, false), codiStatus === 'escaneado' && /*#__PURE__*/_jsxDEV("div", {
              className: "verif-row",
              style: {
                justifyContent: 'center'
              },
              children: [/*#__PURE__*/_jsxDEV("span", {
                className: "spinner",
                style: {
                  borderTopColor: 'var(--accent)'
                }
              }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 12.5,
                  color: 'var(--ink-2)'
                },
                children: "Confirmando pago con el banco del cliente…"
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), codiStatus === 'pagado' && /*#__PURE__*/_jsxDEV("div", {
            style: {
              padding: '10px 0'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'center',
                marginBottom: 10
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "check",
                size: 52,
                color: "var(--green)"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--ink)',
                marginBottom: 4
              },
              children: "¡Pago CoDi confirmado!"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 22,
                fontWeight: 800,
                color: 'var(--green)',
                fontFamily: 'var(--mono)'
              },
              children: fmt(cobroActivo.total)
            }, void 0, false)]
          }, void 0, true), codiStatus === 'expirado' && /*#__PURE__*/_jsxDEV("div", {
            style: {
              padding: '10px 0'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'center',
                marginBottom: 10
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "history",
                size: 46,
                color: "var(--amber)"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--red)',
                marginBottom: 6
              },
              children: "Código expirado"
            }, void 0, false), /*#__PURE__*/_jsxDEV("p", {
              style: {
                fontSize: 13,
                color: 'var(--ink-3)'
              },
              children: "El código QR ha vencido. Puedes confirmar manualmente si el cliente ya pagó."
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: cerrarModal,
            children: "Cancelar"
          }, void 0, false), (codiStatus === 'esperando' || codiStatus === 'escaneado' || codiStatus === 'expirado') && /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: confirmarCoDi,
            children: "Confirmar pago manualmente"
          }, void 0, false), codiStatus === 'pagado' && /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-success",
            onClick: () => {
              cerrarModal();
              setModal('ticket');
            },
            children: "Ver ticket"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modal === 'tc' && cobroActivo && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "card",
              size: 18,
              color: "currentColor"
            }, void 0, false), " Cobro con Tarjeta"]
          }, void 0, true), tcInfo && /*#__PURE__*/_jsxDEV("span", {
            className: "badge badge-green",
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "check",
              size: 11,
              color: "currentColor"
            }, void 0, false), " Liga generada"]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              background: 'linear-gradient(135deg,#1c2050,#282d65)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px 20px',
              marginBottom: 18
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'rgba(255,255,255,.6)',
                marginBottom: 4
              },
              children: "Total a cobrar"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 26,
                fontWeight: 800,
                color: '#fff',
                fontFamily: 'var(--mono)'
              },
              children: fmt(cobroActivo.total)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'rgba(255,255,255,.6)',
                marginTop: 4
              },
              children: [cobroActivo.folio, " · ", cobroActivo.cliente]
            }, void 0, true)]
          }, void 0, true), tcLoading && /*#__PURE__*/_jsxDEV("div", {
            className: "verif-row",
            style: {
              justifyContent: 'center',
              padding: '20px 0'
            },
            children: [/*#__PURE__*/_jsxDEV("span", {
              className: "spinner",
              style: {
                borderTopColor: 'var(--accent)'
              }
            }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
              style: {
                fontSize: 13,
                color: 'var(--ink-2)',
                marginLeft: 10
              },
              children: "Generando liga de pago con Pagadetodo…"
            }, void 0, false)]
          }, void 0, true), tcError && !tcLoading && /*#__PURE__*/_jsxDEV("div", {
            style: {
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
              marginBottom: 14
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontWeight: 600,
                color: 'var(--red)',
                marginBottom: 4
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "warning",
                size: 15,
                color: "var(--red)"
              }, void 0, false), " Error al generar liga de pago"]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--ink-2)'
              },
              children: tcError
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-3)',
                marginTop: 8
              },
              children: "Puedes confirmar el cobro manualmente si el cliente pagó por otro medio."
            }, void 0, false)]
          }, void 0, true), tcInfo && !tcLoading && /*#__PURE__*/_jsxDEV(_Fragment, {
            children: [/*#__PURE__*/_jsxDEV("p", {
              style: {
                fontSize: 13,
                color: 'var(--ink-3)',
                marginBottom: 14
              },
              children: "Comparte el enlace o muestra el QR al cliente para que complete el pago con su tarjeta de crédito o débito."
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: 18
              },
              children: [/*#__PURE__*/_jsxDEV("img", {
                src: tcInfo.qr_url,
                alt: "QR de pago",
                style: {
                  width: 200,
                  height: 200,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: '#fff',
                  padding: 8
                },
                onError: e => e.target.style.display = 'none'
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  marginTop: 8
                },
                children: "Escanear con cualquier app de banco"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                marginBottom: 12
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  marginBottom: 4
                },
                children: "Enlace de pago"
              }, void 0, false), /*#__PURE__*/_jsxDEV("a", {
                href: tcInfo.url,
                target: "_blank",
                rel: "noreferrer",
                style: {
                  fontSize: 12,
                  color: 'var(--accent)',
                  wordBreak: 'break-all',
                  fontFamily: 'var(--mono)'
                },
                children: tcInfo.url
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
              className: "copy-btn",
              onClick: () => {
                navigator.clipboard.writeText(tcInfo.url).catch(() => {});
              },
              style: {
                width: '100%',
                marginBottom: 10
              },
              children: "Copiar enlace de pago"
            }, void 0, false), tcInfo.con_cai === false && /*#__PURE__*/_jsxDEV("div", {
              style: {
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                borderRadius: 'var(--radius)',
                padding: '10px 12px',
                marginBottom: 10,
                fontSize: 11.5,
                color: '#92400e'
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, { name: "warning", size: 13, color: "#92400e" }, void 0, false), " Domiciliación (CAI) no disponible en este momento con Cobroscontarjeta.com — el pago se procesará normal, pero la tarjeta no quedará guardada para cargos automáticos futuros."]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "verif-row",
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "verif-dot pulse"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 12,
                  color: 'var(--ink-2)'
                },
                children: ["Esperando confirmación de pago — Ref: ", tcInfo.referencia]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("p", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                marginTop: 10
              },
              children: "ℹ Una vez que el cliente complete el pago en el enlace, confirma el cobro con el botón de abajo."
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: cerrarModal,
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: confirmarTC,
            children: "Confirmar pago recibido"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modal === 'efectivoRef' && cobroActivo && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "pay",
              size: 18,
              color: "currentColor"
            }, void 0, false), " Pago en efectivo (tienda)"]
          }, void 0, true), efvRefInfo && /*#__PURE__*/_jsxDEV("span", {
            className: "badge badge-green",
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "check",
              size: 11,
              color: "currentColor"
            }, void 0, false), " Referencia generada"]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              background: 'linear-gradient(135deg,#1c2050,#282d65)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px 20px',
              marginBottom: 18
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'rgba(255,255,255,.6)',
                marginBottom: 4
              },
              children: "Total a cobrar"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 26,
                fontWeight: 800,
                color: '#fff',
                fontFamily: 'var(--mono)'
              },
              children: fmt(cobroActivo.total)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'rgba(255,255,255,.6)',
                marginTop: 4
              },
              children: [cobroActivo.folio, " · ", cobroActivo.cliente]
            }, void 0, true)]
          }, void 0, true), efvRefLoading && /*#__PURE__*/_jsxDEV("div", {
            className: "verif-row",
            style: {
              justifyContent: 'center',
              padding: '20px 0'
            },
            children: [/*#__PURE__*/_jsxDEV("span", {
              className: "spinner",
              style: {
                borderTopColor: 'var(--accent)'
              }
            }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
              style: {
                fontSize: 13,
                color: 'var(--ink-2)',
                marginLeft: 10
              },
              children: "Generando referencia de pago con Pagadetodo…"
            }, void 0, false)]
          }, void 0, true), efvRefError && !efvRefLoading && /*#__PURE__*/_jsxDEV("div", {
            style: {
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
              marginBottom: 14
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontWeight: 600,
                color: 'var(--red)',
                marginBottom: 4
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "warning",
                size: 15,
                color: "var(--red)"
              }, void 0, false), " Error al generar la referencia"]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--ink-2)'
              },
              children: efvRefError
            }, void 0, false)]
          }, void 0, true), efvRefInfo && !efvRefLoading && /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                textAlign: 'center',
                marginBottom: 14
              },
              children: efvRefInfo.barcode_url ? /*#__PURE__*/_jsxDEV("img", {
                src: efvRefInfo.barcode_url,
                alt: "Código de barras",
                style: {
                  maxWidth: '100%',
                  height: 70,
                  background: '#fff',
                  padding: 8,
                  borderRadius: 'var(--radius)'
                }
              }, void 0, false) : null
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                marginBottom: 4
              },
              children: "Referencia de pago"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontFamily: 'var(--mono)',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 1,
                wordBreak: 'break-all',
                marginBottom: 10
              },
              children: efvRefInfo.referencia
            }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
              className: "copy-btn",
              onClick: () => {
                navigator.clipboard.writeText(efvRefInfo.referencia).catch(() => {});
              },
              style: {
                width: '100%',
                marginBottom: 10
              },
              children: "Copiar referencia"
            }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
              type: "button",
              onClick: abrirComprobanteEfectivo,
              className: "btn btn-secondary",
              style: {
                width: '100%',
                display: 'block',
                textAlign: 'center',
                marginBottom: 10,
                boxSizing: 'border-box'
              },
              children: "Ver / imprimir comprobante de pago"
            }, void 0, false), efvRefInfo.vencimiento && /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--ink-2)',
                marginBottom: 10
              },
              children: ["Vigente hasta: ", efvRefInfo.vencimiento]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "verif-row",
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "verif-dot pulse"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 12,
                  color: 'var(--ink-2)'
                },
                children: "El cobro queda pendiente hasta que el cliente pague en tienda. Se confirmará automáticamente."
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("p", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                marginTop: 10
              },
              children: "ℹ Entrega esta referencia (o el PDF) al padre de familia. No es necesario que esperes en pantalla: el saldo se actualizará solo cuando Cobroscontarjeta.com confirme el pago."
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: () => {
              cerrarModal();
              resetCarrito();
            },
            children: "Cerrar"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modal === 'ticket' && cobroActivo && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: /*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "check",
              size: 17,
              color: "var(--green)"
            }, void 0, false), " Cobro completado"]
          }, void 0, true)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "ticket",
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                textAlign: 'center',
                marginBottom: 10
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 17,
                  fontWeight: 800
                },
                children: "ESCUELA EDUPAGO"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10,
                  color: '#555'
                },
                children: "Sistema de Cobros Escolar"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10
                },
                children: ["Folio: ", cobroActivo.folio]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10
                },
                children: fmtDate(cobroActivo.fecha)
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("hr", {
              className: "ticket-divider"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                marginBottom: 4
              },
              children: ["Cliente: ", /*#__PURE__*/_jsxDEV("strong", {
                children: cobroActivo.cliente
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                marginBottom: 6
              },
              children: ["Método: ", /*#__PURE__*/_jsxDEV("strong", {
                children: cobroActivo.metodo
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("hr", {
              className: "ticket-divider"
            }, void 0, false), (cobroActivo.items || []).map((it, i) => /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                marginBottom: 3
              },
              children: [/*#__PURE__*/_jsxDEV("span", {
                children: [it.nombre, " x", it.qty]
              }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
                children: fmt(it.precio * it.qty)
              }, void 0, false)]
            }, i, true)), /*#__PURE__*/_jsxDEV("hr", {
              className: "ticket-divider"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 800,
                fontSize: 14
              },
              children: [/*#__PURE__*/_jsxDEV("span", {
                children: "TOTAL"
              }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                children: fmt(cobroActivo.total)
              }, void 0, false)]
            }, void 0, true), cobroActivo.auth_code && /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 10,
                color: '#666',
                marginTop: 6
              },
              children: ["Auth: ", cobroActivo.auth_code]
            }, void 0, true), /*#__PURE__*/_jsxDEV("hr", {
              className: "ticket-divider"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                textAlign: 'center',
                fontSize: 10,
                marginTop: 6
              },
              children: "¡Gracias por su pago!"
            }, void 0, false)]
          }, void 0, true), facturaPanel === 'form' ? /*#__PURE__*/_jsxDEV("div", {
            style: { marginTop: 14, padding: 14, background: 'var(--glass-light)', borderRadius: 'var(--radius)', border: '1px solid var(--border-glow)' },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: { fontWeight: 600, fontSize: 13, marginBottom: 10 },
              children: "Datos fiscales para la factura"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 },
              children: [/*#__PURE__*/_jsxDEV("input", {
                className: "form-input", placeholder: "RFC *", value: facturaForm.rfc,
                onChange: e => setFacturaForm(f => ({ ...f, rfc: e.target.value.toUpperCase() })),
                style: { fontFamily: 'var(--mono)' }
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input", placeholder: "Razón social *", value: facturaForm.razon_social,
                onChange: e => setFacturaForm(f => ({ ...f, razon_social: e.target.value }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 8 },
              children: [/*#__PURE__*/_jsxDEV("input", {
                className: "form-input", placeholder: "C.P. *", value: facturaForm.cp_receptor,
                onChange: e => setFacturaForm(f => ({ ...f, cp_receptor: e.target.value }))
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input", placeholder: "Domicilio fiscal", value: facturaForm.domicilio,
                onChange: e => setFacturaForm(f => ({ ...f, domicilio: e.target.value }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 },
              children: [/*#__PURE__*/_jsxDEV("select", {
                className: "form-select", value: facturaForm.regimen,
                onChange: e => setFacturaForm(f => ({ ...f, regimen: e.target.value })),
                children: REGIMENES_FACTURA.map(r => /*#__PURE__*/_jsxDEV("option", { value: r.value, children: r.label }, r.value, false))
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                className: "form-select", value: facturaForm.uso_cfdi,
                onChange: e => setFacturaForm(f => ({ ...f, uso_cfdi: e.target.value })),
                children: USOS_CFDI_FACTURA.map(u => /*#__PURE__*/_jsxDEV("option", { value: u.value, children: u.label }, u.value, false))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input", placeholder: "Correo para enviarla (opcional)", value: facturaForm.email,
              onChange: e => setFacturaForm(f => ({ ...f, email: e.target.value })),
              style: { width: '100%', marginBottom: 8 }
            }, void 0, false), facturaError && /*#__PURE__*/_jsxDEV("div", {
              style: { fontSize: 12, color: 'var(--red)', marginBottom: 8 },
              children: facturaError
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: { display: 'flex', gap: 8 },
              children: [/*#__PURE__*/_jsxDEV("button", {
                className: "btn btn-secondary btn-sm",
                onClick: () => setFacturaPanel(null),
                children: "Cancelar"
              }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                className: "btn btn-primary btn-sm",
                disabled: facturaLoading,
                onClick: generarFactura,
                children: facturaLoading ? 'Generando…' : 'Generar factura'
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true) : cobroActivo.factura ? /*#__PURE__*/_jsxDEV("div", {
            style: { marginTop: 14, padding: 14, background: 'var(--glass-light)', borderRadius: 'var(--radius)', border: '1px solid var(--border-glow)' },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: { fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--green)' },
              children: "✓ Factura generada"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: { fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 10 },
              children: "Ya está disponible para descarga en el portal de la familia (si el alumno tiene familia asociada)."
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: { display: 'flex', gap: 8, marginBottom: 8 },
              children: [/*#__PURE__*/_jsxDEV("input", {
                className: "form-input", placeholder: "Correo destino", value: correoDestino,
                onChange: e => setCorreoDestino(e.target.value),
                style: { flex: 1 }
              }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                className: "btn btn-primary btn-sm",
                disabled: enviandoCorreo || !correoDestino,
                onClick: enviarCorreoFactura,
                children: enviandoCorreo ? 'Enviando…' : 'Enviar por correo'
              }, void 0, false)]
            }, void 0, true), correoMsg && /*#__PURE__*/_jsxDEV("div", {
              style: { fontSize: 12, color: correoMsg.ok ? 'var(--green)' : 'var(--red)' },
              children: correoMsg.texto
            }, void 0, false)]
          }, void 0, true) : null]
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => window.print(),
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "download",
              size: 14,
              color: "currentColor"
            }, void 0, false), " Imprimir"]
          }, void 0, true), !cobroActivo.factura && facturaPanel !== 'form' && /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: abrirFacturar,
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "reportes",
              size: 14,
              color: "currentColor"
            }, void 0, false), " Facturar compra"]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: () => {
              setModal(null);
              setCobroActivo(null);
              resetCarrito();
            },
            children: "Nuevo cobro"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modal === 'cheque' && cobroActivo && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && cerrarModal(),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "reportes",
              size: 17,
              color: "currentColor"
            }, void 0, false), " Pago con cheque"]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: cerrarModal,
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "close",
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--accent-glow)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between'
            },
            children: [/*#__PURE__*/_jsxDEV("span", {
              style: {
                color: 'var(--ink-3)'
              },
              children: "Total a cobrar"
            }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
              style: {
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                fontSize: 15
              },
              children: fmt(cobroActivo.total)
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Banco emisor *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "Ej: BBVA, Santander, Banamex…",
              value: chequeInfo.banco,
              onChange: e => setChequeInfo(p => ({
                ...p,
                banco: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Fecha del cheque"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                type: "date",
                className: "form-input",
                value: chequeInfo.fecha_cheque || '',
                onChange: e => setChequeInfo(p => ({
                  ...p,
                  fecha_cheque: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Titular / quien firma"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "Nombre en el cheque",
                value: chequeInfo.titular || '',
                onChange: e => setChequeInfo(p => ({
                  ...p,
                  titular: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Número de cuenta"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "1234567890",
                style: {
                  fontFamily: 'var(--mono)'
                },
                value: chequeInfo.num_cuenta,
                onChange: e => setChequeInfo(p => ({
                  ...p,
                  num_cuenta: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Número de cheque"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "001234",
                style: {
                  fontFamily: 'var(--mono)'
                },
                value: chequeInfo.num_cheque,
                onChange: e => setChequeInfo(p => ({
                  ...p,
                  num_cheque: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 6,
              padding: '8px 12px',
              background: 'rgba(245,158,11,.08)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11.5,
              color: 'var(--ink-2)'
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "warning",
              size: 13,
              color: "#f59e0b"
            }, void 0, false), " El cobro se marca pagado de inmediato. Si el cheque rebota, podrás marcarlo como \"Rebotado\" desde Cobros — el saldo regresará a pendiente automáticamente."]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: cerrarModal,
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            disabled: !chequeInfo.banco,
            onClick: async () => {
              const extra = {
                banco_cheque: chequeInfo.banco,
                num_cuenta_cheque: chequeInfo.num_cuenta,
                num_cheque: chequeInfo.num_cheque,
                fecha_cheque: chequeInfo.fecha_cheque,
                titular_cheque: chequeInfo.titular
              };
              CobroController.confirmarPago(cobroActivo.id, extra).then(res => {
                actualizarSaldoCliente(res);
              }).catch(()=>{});
              setData(prev => {
                const upd = { ...prev, cobros: prev.cobros.map(c => c.id === cobroActivo.id ? { ...c, estado: 'pagado', ...extra } : c) };
                AppModel.save(upd); return upd;
              });
              setModal('ticket');
              resetCarrito();
            },
            children: "Registrar cheque"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}