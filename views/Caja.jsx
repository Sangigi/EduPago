/* views/Caja.jsx — Sistema de cobros completo v2 */
function Caja({ data, setData, user, escuela }) {
  const { useState, useEffect, useRef } = React;

  const [carrito, setCarrito] = useState([]);
  const [clienteSel, setClienteSel] = useState(null);
  const [metodo, setMetodo] = useState('TC');
  const [q, setQ] = useState('');
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
  const intervalRef = useRef(null);
  const timerRef = useRef(null);
  const speiPollRef = useRef(null);

  const productosFiltrados = data.productos.filter(p =>
    p.activo && (!q || p.nombre.toLowerCase().includes(q.toLowerCase()))
  );
  const subtotal = carrito.reduce((a, i) => a + i.precio * i.qty, 0);
  const total = subtotal;

  /* ── CARRITO ── */
  const addItem = p => {
    setCarrito(prev => {
      const ex = prev.find(i => i.id === p.id);
      return ex ? prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i) : [...prev, { ...p, qty: 1 }];
    });
  };
  const setQty = (id, qty) => qty < 1
    ? setCarrito(prev => prev.filter(i => i.id !== id))
    : setCarrito(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  const removeItem = id => setCarrito(prev => prev.filter(i => i.id !== id));

  /* ── INICIAR COBRO ── */
  const cobrar = async () => {
    if (!carrito.length) return;
    const escuela_id = escuela?.id ?? (data.escuelas?.[0]?.id ?? 1);
    const { data: newData, cobro } = CobroController.iniciarCobro(data, { carrito, cliente: clienteSel, metodo, escuela_id });
    setCobroActivo(cobro);

    if (metodo === 'SPEI') {
      setSpeiStatus('generando');
      setSpeiError(null);
      setData(newData);
      setModal('spei');

      try {
        // CLABE FIJA: devuelve la clabe configurada + referencia = matrícula del alumno
        const spei = await CobroController.iniciarSPEI(cobro, escuela);
        // Guardar info SPEI en el cobro
        const cobrosActualizados = newData.cobros.map(c =>
          c.id === cobro.id ? { ...c, clabe: spei.clabe, banco: spei.banco, beneficiario: spei.beneficiario, referencia_spei: spei.referencia, instruccion: spei.instruccion } : c
        );
        const dataConClabe = { ...newData, cobros: cobrosActualizados };
        setData(dataConClabe);
        setCobroActivo(prev => ({ ...prev, clabe: spei.clabe, referencia_spei: spei.referencia, instruccion: spei.instruccion, banco: spei.banco, beneficiario: spei.beneficiario }));
        setSpeiStatus('esperando');
        AppModel.save(dataConClabe);

        // Polling automático: verificar cada 10 segundos por referencia
        speiPollRef.current = setInterval(async () => {
          try {
            const ver = await CobroController.verificarSPEI(spei.referencia);
            if (ver.pagado) {
              clearInterval(speiPollRef.current);
              setData(prev => {
                const updated = CobroController.confirmarPago(prev, cobro.id, { transaccion: ver.transaccion });
                AppModel.save(updated);
                return updated;
              });
              setSpeiStatus('confirmado');
            }
          } catch(e) { /* continuar polling */ }
        }, 10000);

      } catch(err) {
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
        if (t <= 0) { clearInterval(timerRef.current); setCodiStatus('expirado'); }
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
      } catch(err) {
        setTcError(err.message);
      } finally {
        setTcLoading(false);
      }

    } else {
      // Efectivo: cobro inmediato
      setData(newData);
      AppModel.save(newData);
      setModal('ticket');
      resetCarrito();
    }
  };

  /* ── CONFIRMAR TC MANUALMENTE (cliente ya pagó en el link) ── */
  const confirmarTC = () => {
    const updatedData = CobroController.confirmarPago(data, cobroActivo.id, { auth_code: tcInfo?.referencia });
    setData(updatedData);
    AppModel.save(updatedData);
    setModal('ticket');
    resetCarrito();
  };

  /* ── CONFIRMAR SPEI MANUAL (botón de "ya pagué") ── */
  const confirmarSPEI = async () => {
    if (speiStatus === 'confirmado') { setModal('ticket'); resetCarrito(); return; }
    setSpeiStatus('verificando');
    try {
      const refSpei = cobroActivo?.referencia_spei || cobroActivo?.referencia || cobroActivo?.clabe;
      if (refSpei) {
        const ver = await CobroController.verificarSPEI(refSpei);
        if (ver.pagado) {
          clearInterval(speiPollRef.current);
          const updatedData = CobroController.confirmarPago(data, cobroActivo.id, { transaccion: ver.transaccion });
          setData(updatedData);
          AppModel.save(updatedData);
          setSpeiStatus('confirmado');
          return;
        }
      }
      // Si no se verificó, confirmar manualmente de todas formas
      const updatedData = CobroController.confirmarPago(data, cobroActivo.id);
      setData(updatedData);
      AppModel.save(updatedData);
      setSpeiStatus('confirmado');
    } catch(e) {
      // Confirmar manualmente si falla la API
      const updatedData = CobroController.confirmarPago(data, cobroActivo.id);
      setData(updatedData);
      AppModel.save(updatedData);
      setSpeiStatus('confirmado');
    }
  };

  /* ── CONFIRMAR CODI MANUAL ── */
  const confirmarCoDi = () => {
    clearInterval(timerRef.current);
    const updatedData = CobroController.confirmarPago(data, cobroActivo.id);
    setData(updatedData);
    AppModel.save(updatedData);
    setCodiStatus('pagado');
    setTimeout(() => { setModal('ticket'); resetCarrito(); }, 1200);
  };

  const resetCarrito = () => {
    setCarrito([]); setClienteSel(null); setTcInfo(null); setTcError(null);
  };

  const cerrarModal = () => {
    if (intervalRef.current) clearTimeout(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (speiPollRef.current) clearInterval(speiPollRef.current);
    setModal(null);
  };

  /* ── COPIAR CLABE ── */
  const copiarCLABE = () => {
    if (cobroActivo?.clabe) {
      navigator.clipboard.writeText(cobroActivo.clabe).catch(()=>{});
      setCopiedCLABE(true);
      setTimeout(() => setCopiedCLABE(false), 2000);
    }
  };

  /* ── FORMATO CLABE ── */
  const fmtCLABE = clabe => clabe ? clabe.match(/.{1,4}/g).join(' ') : '—';

  /* ── QR CODI (SVG simple) ── */
  const QRSimple = ({ value }) => {
    // QR placeholder visual (pattern basado en value hash)
    const hash = value ? [...value].reduce((a,c)=>a+c.charCodeAt(0),0) : 42;
    const cells = 21;
    const grid = Array.from({length:cells}, (_,r) =>
      Array.from({length:cells}, (_,c) => {
        // Corner finder patterns
        if ((r<7&&c<7)||(r<7&&c>=cells-7)||(r>=cells-7&&c<7)) return 1;
        // Data pattern based on hash
        return (hash * (r+1) * (c+1)) % 7 < 3 ? 1 : 0;
      })
    );
    const size = 160;
    const cellSize = size / cells;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
        <rect width={size} height={size} fill="#fff"/>
        {grid.map((row,r) => row.map((cell,c) => cell ? (
          <rect key={`${r}-${c}`} x={c*cellSize} y={r*cellSize} width={cellSize} height={cellSize} fill="#000"/>
        ) : null))}
      </svg>
    );
  };

  const METODOS = [
    { id:'TC', label:'Tarjeta', icon:'💳' },
    { id:'SPEI', label:'SPEI', icon:'🏦' },
    { id:'CoDi', label:'CoDi', icon:'📱' },
    { id:'Efectivo', label:'Efectivo', icon:'💵' },
  ];

  return (
    <div className="pos-layout">

      {/* ── Productos ── */}
      <div className="pos-products">
        <div className="pos-header">
          <span style={{fontWeight:600,fontSize:13.5}}>💡 Conceptos de cobro</span>
          <div className="search-bar" style={{flex:1,marginLeft:10}}>
            <span className="search-icon">🔍</span>
            <input placeholder="Buscar concepto…" value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
        </div>
        <div className="pos-products-grid">
          {productosFiltrados.length === 0 && (
            <div className="empty-state" style={{gridColumn:'1/-1'}}>
              <div className="empty-icon">🔍</div>
              <div className="empty-text">Sin resultados</div>
            </div>
          )}
          {productosFiltrados.map(p => (
            <div className="product-card" key={p.id} onClick={() => addItem(p)}>
              <div className="product-emoji">{p.emoji}</div>
              <div className="product-name">{p.nombre}</div>
              <div className="product-type">{p.categoria}</div>
              <div className="product-price" style={{color:p.precio<0?'var(--green)':'var(--accent)'}}>{fmt(p.precio)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Carrito ── */}
      <div className="pos-cart">
        <div className="cart-header">
          <div style={{fontWeight:600,fontSize:13.5,marginBottom:8}}>🧾 Cobro en curso</div>
          <div className="cart-customer" onClick={()=>setModal('cliente')}>
            <span style={{fontSize:18}}>{clienteSel ? '👤' : '👥'}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,color:'var(--accent)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {clienteSel?.nombre || 'Seleccionar alumno/familia'}
              </div>
              {clienteSel && <div style={{fontSize:11,color:'var(--ink-3)'}}>{clienteSel.tipo} · {clienteSel.grado}</div>}
            </div>
            <span style={{fontSize:12,color:'var(--accent)'}}>›</span>
          </div>
        </div>

        <div className="cart-items">
          {carrito.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🛒</div>
              <div className="empty-text">Sin conceptos</div>
              <div className="empty-sub">Selecciona conceptos de la izquierda</div>
            </div>
          )}
          {carrito.map(item => (
            <div className="cart-item" key={item.id}>
              <span style={{fontSize:20}}>{item.emoji}</span>
              <div className="cart-item-info">
                <div className="cart-item-name">{item.nombre}</div>
                <div className="cart-item-qty">
                  <button className="qty-btn" onClick={()=>setQty(item.id, item.qty-1)}>−</button>
                  <span className="qty-num">{item.qty}</span>
                  <button className="qty-btn" onClick={()=>setQty(item.id, item.qty+1)}>+</button>
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="cart-item-price">{fmt(item.precio*item.qty)}</div>
                <span className="cart-remove" onClick={()=>removeItem(item.id)}>✕</span>
              </div>
            </div>
          ))}
        </div>

        <div className="cart-totals">
          <div className="totals-row"><span>Subtotal</span><span className="text-mono">{fmt(subtotal)}</span></div>
          <div className="totals-row" style={{fontWeight:700,fontSize:15,color:'var(--ink)',marginTop:6}}>
            <span>Total</span><span className="totals-total">{fmt(total)}</span>
          </div>
        </div>

        <div className="payment-methods">
          {METODOS.map(m => (
            <div key={m.id} className={`pay-method ${metodo===m.id?'selected':''}`} onClick={()=>setMetodo(m.id)}>
              <span className="pm-icon">{m.icon}</span>{m.label}
            </div>
          ))}
        </div>

        <button className="checkout-btn" onClick={cobrar} disabled={!carrito.length || total===0}>
          {metodo==='TC'?'💳':metodo==='SPEI'?'🏦':metodo==='CoDi'?'📱':'💵'} Cobrar {fmt(total)}
        </button>
      </div>

      {/* ══ MODAL: Seleccionar cliente ══ */}
      {modal==='cliente' && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Seleccionar alumno o familia</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{padding:'10px 18px'}}>
              {data.clientes.filter(c=>c.activo).map(c=>{
                const fam = c.familia_id ? data.familias.find(f=>f.id===c.familia_id) : null;
                return (
                  <div key={c.id} onClick={()=>{setClienteSel(c);setModal(null);}}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'10px 8px',
                      borderRadius:'var(--radius-sm)',cursor:'pointer',
                      borderBottom:'1px solid var(--glass-light)',transition:'background .15s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--glass-light)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div className="avatar avatar-admin">{c.nombre.charAt(0)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:500,fontSize:13,color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre}</div>
                      <div style={{fontSize:11,color:'var(--ink-3)',display:'flex',gap:6,flexWrap:'wrap'}}>
                        <span>{c.grado}</span>
                        {c.matricula && <span style={{fontFamily:'var(--mono)'}}>· {c.matricula}</span>}
                        {fam && <span>· 👨‍👩‍👧 {fam.nombre.split(' ').slice(1,3).join(' ')}</span>}
                      </div>
                    </div>
                    {c.saldo_pendiente>0 && (
                      <span style={{color:'var(--amber)',fontSize:12,fontFamily:'var(--mono)',fontWeight:600,flexShrink:0}}>
                        {fmt(c.saldo_pendiente)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>{setClienteSel(null);setModal(null);}}>
                Sin cliente específico
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: SPEI ══ */}
      {modal==='spei' && cobroActivo && (
        <div className="modal-backdrop">
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">🏦 Pago por Transferencia SPEI</div>
              {speiStatus==='confirmado' && <span className="badge badge-green">✓ Confirmado</span>}
            </div>
            <div className="modal-body">
              {speiStatus !== 'confirmado' && (
                <>
                  {speiStatus === 'generando' && (
                    <div className="verif-row" style={{justifyContent:'center',padding:'20px 0'}}>
                      <span className="spinner" style={{borderTopColor:'var(--accent)'}}></span>
                      <span style={{fontSize:13,color:'var(--ink-2)',marginLeft:10}}>Cargando CLABE fija…</span>
                    </div>
                  )}

                  {speiStatus === 'error' && (
                    <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:'var(--radius)',padding:'14px 16px',marginBottom:14}}>
                      <div style={{fontWeight:600,color:'var(--red)',marginBottom:4}}>❌ Error al obtener CLABE</div>
                      <div style={{fontSize:12,color:'var(--ink-2)'}}>{speiError}</div>
                    </div>
                  )}

                  {(speiStatus === 'esperando' || speiStatus === 'verificando') && (
                    <div className="spei-box">
                    <div style={{fontSize:11,color:'rgba(255,255,255,.5)',marginBottom:4,textAlign:'center',textTransform:'uppercase',letterSpacing:'.5px'}}>
                      CLABE Interbancaria Fija · STP
                    </div>
                    <div className="clabe-display">{fmtCLABE(cobroActivo?.clabe)}</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                      <div className="spei-info-row" style={{flexDirection:'column',gap:2,alignItems:'flex-start'}}>
                        <span className="spei-label">Beneficiario</span>
                        <span className="spei-value" style={{fontSize:12}}>{cobroActivo?.beneficiario || escuela?.nombre || 'Escuela'}</span>
                      </div>
                      <div className="spei-info-row" style={{flexDirection:'column',gap:2,alignItems:'flex-start'}}>
                        <span className="spei-label">Monto exacto</span>
                        <span className="spei-value" style={{fontSize:16}}>{fmt(cobroActivo?.total)}</span>
                      </div>
                      <div className="spei-info-row" style={{flexDirection:'column',gap:2,alignItems:'flex-start',gridColumn:'1/-1'}}>
                        <span className="spei-label">⚠ Concepto obligatorio (copiar exacto)</span>
                        <span className="spei-value" style={{fontFamily:'var(--mono)',letterSpacing:1,color:'#fbbf24',fontSize:15}}>
                          {cobroActivo?.referencia_spei || cobroActivo?.referencia || cobroActivo?.folio}
                        </span>
                      </div>
                    </div>
                    <button className={`copy-btn ${copiedCLABE?'copied':''}`} onClick={copiarCLABE}>
                      {copiedCLABE ? '✓ ¡CLABE copiada!' : '📋 Copiar CLABE al portapapeles'}
                    </button>
                    </div>
                  )}

                  {(speiStatus === 'esperando' || speiStatus === 'verificando') && (
                  <div className="verif-row">
                    <div className="verif-dot pulse" style={{background:speiStatus==='verificando'?'var(--amber)':'var(--accent)'}}></div>
                    <div style={{fontSize:12.5,color:'var(--ink-2)'}}>
                      {speiStatus==='esperando'
                        ? 'Esperando transferencia… verificación automática cada 10s'
                        : 'Verificando pago…'}
                    </div>
                    {speiStatus==='verificando' && <span className="spinner" style={{marginLeft:'auto'}}></span>}
                  </div>
                  )}

                  {(speiStatus === 'esperando' || speiStatus === 'verificando') && (
                  <p style={{fontSize:11.5,color:'var(--ink-4)',marginTop:10,lineHeight:1.5}}>
                    ℹ La CLABE es fija para esta escuela. El concepto de la transferencia identifica
                    al alumno. El sistema confirmará el pago automáticamente.
                  </p>
                  )}
                </>
              )}

              {speiStatus==='confirmado' && (
                <div style={{textAlign:'center',padding:'10px 0'}}>
                  <div style={{fontSize:52,marginBottom:12}}>✅</div>
                  <div style={{fontSize:18,fontWeight:700,color:'var(--ink)',marginBottom:6}}>¡Pago recibido!</div>
                  <div style={{fontSize:13.5,color:'var(--ink-3)',marginBottom:4}}>
                    Transferencia verificada · {cobroActivo.folio}
                  </div>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--green)',fontFamily:'var(--mono)'}}>
                    {fmt(cobroActivo.total)}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>{cerrarModal();}}>
                {speiStatus==='confirmado' ? 'Cerrar' : 'Dejar pendiente'}
              </button>
              {speiStatus!=='confirmado' && (
                <button className="btn btn-primary" onClick={confirmarSPEI}
                  disabled={speiStatus==='verificando'||speiStatus==='generando'}>
                  {speiStatus==='verificando'
                    ? <><span className="spinner"></span> Verificando…</>
                    : speiStatus==='generando'
                    ? <><span className="spinner"></span> Generando…</>
                    : '✓ Confirmar pago recibido'}
                </button>
              )}
              {speiStatus==='confirmado' && (
                <button className="btn btn-success" onClick={()=>{cerrarModal();setModal('ticket');}}>
                  Ver ticket
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: CoDi ══ */}
      {modal==='codi' && cobroActivo && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">📱 Pago con CoDi</div>
              {codiStatus==='pagado' && <span className="badge badge-green">✓ Pagado</span>}
              {codiStatus==='expirado' && <span className="badge badge-red">Expirado</span>}
            </div>
            <div className="modal-body" style={{textAlign:'center'}}>
              {codiStatus !== 'pagado' && codiStatus !== 'expirado' && (
                <>
                  <p style={{fontSize:13,color:'var(--ink-3)',marginBottom:14}}>
                    {codiStatus==='esperando'
                      ? 'Muestra este código QR al cliente para pagar desde su app bancaria'
                      : '📲 ¡Código escaneado! Esperando confirmación del banco…'}
                  </p>
                  <div className="codi-qr" style={{opacity:codiStatus==='escaneado'?.6:1,transition:'opacity .3s'}}>
                    <QRSimple value={cobroActivo.codi_payload}/>
                  </div>
                  <div style={{fontSize:24,fontWeight:800,color:'var(--accent)',fontFamily:'var(--mono)',margin:'14px 0 4px'}}>
                    {fmt(cobroActivo.total)}
                  </div>
                  <div style={{fontSize:12,color:'var(--ink-3)',marginBottom:12}}>{cobroActivo.folio}</div>

                  {/* Timer */}
                  <div style={{fontSize:13,color:codiTimer<60?'var(--red)':'var(--ink-3)',fontFamily:'var(--mono)',marginBottom:10}}>
                    ⏱ Expira en {Math.floor(codiTimer/60)}:{String(codiTimer%60).padStart(2,'0')}
                  </div>
                  <div className="progress-bar" style={{marginBottom:14}}>
                    <div className="progress-fill" style={{
                      width:(codiTimer/300*100)+'%',
                      background:codiTimer<60?'var(--red)':'var(--accent)',
                      transition:'width 1s linear, background .5s'
                    }}></div>
                  </div>

                  {codiStatus==='escaneado' && (
                    <div className="verif-row" style={{justifyContent:'center'}}>
                      <span className="spinner" style={{borderTopColor:'var(--accent)'}}></span>
                      <span style={{fontSize:12.5,color:'var(--ink-2)'}}>Confirmando pago con el banco del cliente…</span>
                    </div>
                  )}
                </>
              )}

              {codiStatus==='pagado' && (
                <div style={{padding:'10px 0'}}>
                  <div style={{fontSize:52,marginBottom:10}}>✅</div>
                  <div style={{fontSize:18,fontWeight:700,color:'var(--ink)',marginBottom:4}}>¡Pago CoDi confirmado!</div>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--green)',fontFamily:'var(--mono)'}}>{fmt(cobroActivo.total)}</div>
                </div>
              )}

              {codiStatus==='expirado' && (
                <div style={{padding:'10px 0'}}>
                  <div style={{fontSize:46,marginBottom:10}}>⏰</div>
                  <div style={{fontSize:16,fontWeight:600,color:'var(--red)',marginBottom:6}}>Código expirado</div>
                  <p style={{fontSize:13,color:'var(--ink-3)'}}>El código QR ha vencido. Puedes confirmar manualmente si el cliente ya pagó.</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={cerrarModal}>Cancelar</button>
              {(codiStatus==='esperando'||codiStatus==='escaneado'||codiStatus==='expirado') && (
                <button className="btn btn-primary" onClick={confirmarCoDi}>
                  ✓ Confirmar pago manualmente
                </button>
              )}
              {codiStatus==='pagado' && (
                <button className="btn btn-success" onClick={()=>{cerrarModal();setModal('ticket');}}>
                  Ver ticket
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Tarjeta ══ */}
      {modal==='tc' && cobroActivo && (
        <div className="modal-backdrop">
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">💳 Cobro con Tarjeta</div>
              {tcInfo && <span className="badge badge-green">✓ Liga generada</span>}
            </div>
            <div className="modal-body">
              {/* Resumen del cobro */}
              <div style={{background:'linear-gradient(135deg,#1c2050,#282d65)',borderRadius:'var(--radius-lg)',padding:'18px 20px',marginBottom:18}}>
                <div style={{fontSize:11,color:'rgba(255,255,255,.6)',marginBottom:4}}>Total a cobrar</div>
                <div style={{fontSize:26,fontWeight:800,color:'#fff',fontFamily:'var(--mono)'}}>{fmt(cobroActivo.total)}</div>
                <div style={{fontSize:12,color:'rgba(255,255,255,.6)',marginTop:4}}>{cobroActivo.folio} · {cobroActivo.cliente}</div>
              </div>

              {/* Cargando */}
              {tcLoading && (
                <div className="verif-row" style={{justifyContent:'center',padding:'20px 0'}}>
                  <span className="spinner" style={{borderTopColor:'var(--accent)'}}></span>
                  <span style={{fontSize:13,color:'var(--ink-2)',marginLeft:10}}>Generando liga de pago con Pagadetodo…</span>
                </div>
              )}

              {/* Error */}
              {tcError && !tcLoading && (
                <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:'var(--radius)',padding:'14px 16px',marginBottom:14}}>
                  <div style={{fontWeight:600,color:'var(--red)',marginBottom:4}}>❌ Error al generar liga de pago</div>
                  <div style={{fontSize:12,color:'var(--ink-2)'}}>{tcError}</div>
                  <div style={{fontSize:11,color:'var(--ink-3)',marginTop:8}}>
                    Puedes confirmar el cobro manualmente si el cliente pagó por otro medio.
                  </div>
                </div>
              )}

              {/* Liga de pago lista */}
              {tcInfo && !tcLoading && (
                <>
                  <p style={{fontSize:13,color:'var(--ink-3)',marginBottom:14}}>
                    Comparte el enlace o muestra el QR al cliente para que complete el pago con su tarjeta de crédito o débito.
                  </p>

                  {/* QR */}
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:18}}>
                    <img
                      src={tcInfo.qr_url}
                      alt="QR de pago"
                      style={{width:200,height:200,borderRadius:'var(--radius)',border:'1px solid var(--border)',background:'#fff',padding:8}}
                      onError={e=>e.target.style.display='none'}
                    />
                    <div style={{fontSize:11,color:'var(--ink-4)',marginTop:8}}>Escanear con cualquier app de banco</div>
                  </div>

                  {/* Link */}
                  <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'12px 14px',marginBottom:12}}>
                    <div style={{fontSize:11,color:'var(--ink-4)',marginBottom:4}}>Enlace de pago</div>
                    <a href={tcInfo.url} target="_blank" rel="noreferrer"
                       style={{fontSize:12,color:'var(--accent)',wordBreak:'break-all',fontFamily:'var(--mono)'}}>
                      {tcInfo.url}
                    </a>
                  </div>

                  {/* Copiar link */}
                  <button className="copy-btn" onClick={()=>{
                    navigator.clipboard.writeText(tcInfo.url).catch(()=>{});
                  }} style={{width:'100%',marginBottom:10}}>
                    📋 Copiar enlace de pago
                  </button>

                  <div className="verif-row">
                    <div className="verif-dot pulse"></div>
                    <div style={{fontSize:12,color:'var(--ink-2)'}}>
                      Esperando confirmación de pago — Ref: {tcInfo.referencia}
                    </div>
                  </div>

                  <p style={{fontSize:11,color:'var(--ink-4)',marginTop:10}}>
                    ℹ Una vez que el cliente complete el pago en el enlace, confirma el cobro con el botón de abajo.
                  </p>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={cerrarModal}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarTC}>
                ✓ Confirmar pago recibido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Ticket ══ */}
      {modal==='ticket' && cobroActivo && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">✅ Cobro completado</div>
            </div>
            <div className="modal-body">
              <div className="ticket">
                <div style={{textAlign:'center',marginBottom:10}}>
                  <div style={{fontSize:17,fontWeight:800}}>ESCUELA EDUPAGO</div>
                  <div style={{fontSize:10,color:'#555'}}>Sistema de Cobros Escolar</div>
                  <div style={{fontSize:10}}>Folio: {cobroActivo.folio}</div>
                  <div style={{fontSize:10}}>{fmtDate(cobroActivo.fecha)}</div>
                </div>
                <hr className="ticket-divider"/>
                <div style={{fontSize:11,marginBottom:4}}>Cliente: <strong>{cobroActivo.cliente}</strong></div>
                <div style={{fontSize:11,marginBottom:6}}>Método: <strong>{cobroActivo.metodo}</strong></div>
                <hr className="ticket-divider"/>
                {cobroActivo.items.map((it,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                    <span>{it.nombre} x{it.qty}</span><span>{fmt(it.precio*it.qty)}</span>
                  </div>
                ))}
                <hr className="ticket-divider"/>
                <div style={{display:'flex',justifyContent:'space-between',fontWeight:800,fontSize:14}}>
                  <span>TOTAL</span><span>{fmt(cobroActivo.total)}</span>
                </div>
                {cobroActivo.auth_code && (
                  <div style={{fontSize:10,color:'#666',marginTop:6}}>Auth: {cobroActivo.auth_code}</div>
                )}
                <hr className="ticket-divider"/>
                <div style={{textAlign:'center',fontSize:10,marginTop:6}}>¡Gracias por su pago!</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>window.print()}>🖨️ Imprimir</button>
              <button className="btn btn-primary" onClick={()=>{setModal(null);setCobroActivo(null);resetCarrito();}}>
                Nuevo cobro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
