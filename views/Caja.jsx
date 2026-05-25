/* views/Caja.jsx — Sistema de cobros completo */
function Caja({ data, setData, user }) {
  const { useState, useEffect, useRef } = React;

  const [carrito, setCarrito] = useState([]);
  const [clienteSel, setClienteSel] = useState(null);
  const [metodo, setMetodo] = useState('TC');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null); // null | 'cliente' | 'spei' | 'codi' | 'ticket' | 'tc'
  const [cobroActivo, setCobroActivo] = useState(null);
  const [copiedCLABE, setCopiedCLABE] = useState(false);
  const [speiStatus, setSpeiStatus] = useState('esperando'); // esperando | verificando | confirmado
  const [codiStatus, setCodiStatus] = useState('esperando'); // esperando | escaneado | pagado | expirado
  const [codiTimer, setCodiTimer] = useState(300); // 5 minutos
  const [tcForm, setTcForm] = useState({ numero:'', expiry:'', cvv:'', nombre:'' });
  const [tcProcessing, setTcProcessing] = useState(false);
  const intervalRef = useRef(null);
  const timerRef = useRef(null);

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
  const cobrar = () => {
    if (!carrito.length) return;
    const { data: newData, cobro } = CobroController.iniciarCobro(data, { carrito, cliente: clienteSel, metodo });
    setCobroActivo(cobro);

    if (metodo === 'SPEI') {
      setSpeiStatus('esperando');
      setData(newData);
      setModal('spei');
      // Simular webhook STP: 4-10 segundos
      intervalRef.current = CobroController.simularWebhookSPEI(newData, cobro.id, (updatedData) => {
        setData(updatedData);
        setSpeiStatus('confirmado');
        AppModel.save(updatedData);
      });
    } else if (metodo === 'CoDi') {
      setCodiStatus('esperando');
      setCodiTimer(300);
      setData(newData);
      setModal('codi');
      // Polling CoDi
      let t = 300;
      timerRef.current = setInterval(() => {
        t--;
        setCodiTimer(t);
        if (t <= 0) {
          clearInterval(timerRef.current);
          setCodiStatus('expirado');
        }
      }, 1000);
      // Simular escaneo + pago
      setTimeout(() => setCodiStatus('escaneado'), 4000 + Math.random() * 6000);
      setTimeout(() => {
        clearInterval(timerRef.current);
        const updatedData = CobroController.confirmarPago(newData, cobro.id);
        setData(updatedData);
        setCodiStatus('pagado');
        AppModel.save(updatedData);
      }, 10000 + Math.random() * 10000);
    } else if (metodo === 'TC') {
      setData(newData);
      setModal('tc');
    } else {
      // Efectivo: cobro inmediato
      setData(newData);
      AppModel.save(newData);
      setCobroActivo(cobro);
      setModal('ticket');
      resetCarrito();
    }
  };

  /* ── PROCESAR TARJETA ── */
  const procesarTC = () => {
    if (!tcForm.numero || !tcForm.expiry || !tcForm.cvv || !tcForm.nombre) return;
    setTcProcessing(true);
    setTimeout(() => {
      setTcProcessing(false);
      const updatedData = CobroController.confirmarPago(data, cobroActivo.id);
      setData(updatedData);
      AppModel.save(updatedData);
      setModal('ticket');
      resetCarrito();
    }, 2500);
  };

  /* ── CONFIRMAR SPEI MANUAL ── */
  const confirmarSPEI = () => {
    if (speiStatus === 'confirmado') {
      setModal('ticket');
      resetCarrito();
      return;
    }
    setSpeiStatus('verificando');
    setTimeout(() => {
      const updatedData = CobroController.confirmarPago(data, cobroActivo.id);
      setData(updatedData);
      AppModel.save(updatedData);
      setSpeiStatus('confirmado');
    }, 2000);
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
    setCarrito([]); setClienteSel(null); setTcForm({ numero:'', expiry:'', cvv:'', nombre:'' });
  };

  const cerrarModal = () => {
    if (intervalRef.current) clearTimeout(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
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
              {data.clientes.filter(c=>c.activo).map(c=>(
                <div key={c.id} onClick={()=>{setClienteSel(c);setModal(null);}}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'10px 8px',
                    borderRadius:'var(--radius-sm)',cursor:'pointer',
                    borderBottom:'1px solid var(--glass-light)',transition:'background .15s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--glass-light)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div className={`avatar ${c.tipo==='alumno'?'avatar-admin':'avatar-cajero'}`}>
                    {c.nombre.charAt(0)}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500,fontSize:13,color:'var(--ink)'}}>{c.nombre}</div>
                    <div style={{fontSize:11.5,color:'var(--ink-3)'}}>{c.tipo} · {c.grado} · {c.email}</div>
                  </div>
                  {c.saldo_pendiente>0 && (
                    <span style={{color:'var(--red)',fontSize:12,fontFamily:'var(--mono)',fontWeight:600}}>
                      {fmt(c.saldo_pendiente)}
                    </span>
                  )}
                </div>
              ))}
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
                  <p style={{fontSize:13,color:'var(--ink-3)',marginBottom:14}}>
                    El alumno/tutor debe realizar una transferencia a la siguiente CLABE interbancaria:
                  </p>

                  <div className="spei-box">
                    <div style={{fontSize:11.5,color:'rgba(255,255,255,.6)',marginBottom:6,textAlign:'center'}}>
                      CLABE Interbancaria · Banco Azteca · CLABE Dinámica
                    </div>
                    <div className="clabe-display">{fmtCLABE(cobroActivo.clabe)}</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                      <div className="spei-info-row" style={{flexDirection:'column',gap:2,alignItems:'flex-start'}}>
                        <span className="spei-label">Beneficiario</span>
                        <span className="spei-value">Escuela EduPago S.C.</span>
                      </div>
                      <div className="spei-info-row" style={{flexDirection:'column',gap:2,alignItems:'flex-start'}}>
                        <span className="spei-label">Monto exacto</span>
                        <span className="spei-value" style={{fontSize:16}}>{fmt(cobroActivo.total)}</span>
                      </div>
                      <div className="spei-info-row" style={{flexDirection:'column',gap:2,alignItems:'flex-start'}}>
                        <span className="spei-label">Referencia</span>
                        <span className="spei-value">{cobroActivo.folio}</span>
                      </div>
                      <div className="spei-info-row" style={{flexDirection:'column',gap:2,alignItems:'flex-start'}}>
                        <span className="spei-label">Vigencia</span>
                        <span className="spei-value">48 horas</span>
                      </div>
                    </div>
                    <button className={`copy-btn ${copiedCLABE?'copied':''}`} onClick={copiarCLABE}>
                      {copiedCLABE ? '✓ ¡CLABE copiada!' : '📋 Copiar CLABE al portapapeles'}
                    </button>
                  </div>

                  <div className="verif-row">
                    <div className="verif-dot pulse" style={{background:speiStatus==='verificando'?'var(--amber)':'var(--accent)'}}></div>
                    <div style={{fontSize:12.5,color:'var(--ink-2)'}}>
                      {speiStatus==='esperando'
                        ? 'Esperando transferencia… se verificará automáticamente vía webhook STP'
                        : 'Verificando pago con la red STP…'}
                    </div>
                    {speiStatus==='verificando' && <span className="spinner" style={{marginLeft:'auto'}}></span>}
                  </div>

                  <p style={{fontSize:11.5,color:'var(--ink-4)',marginTop:10,lineHeight:1.5}}>
                    ℹ La CLABE es única para este cobro. Una vez recibida la transferencia, 
                    el sistema marcará el cobro como pagado automáticamente.
                  </p>
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
                <button className="btn btn-primary" onClick={confirmarSPEI} disabled={speiStatus==='verificando'}>
                  {speiStatus==='verificando'
                    ? <><span className="spinner"></span> Verificando…</>
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
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">💳 Cobro con Tarjeta</div>
            </div>
            <div className="modal-body">
              <div style={{background:'linear-gradient(135deg,#1e3a8a,#4f46e5)',borderRadius:'var(--radius-lg)',padding:'18px 20px',marginBottom:18}}>
                <div style={{fontSize:11,color:'rgba(255,255,255,.6)',marginBottom:4}}>Total a cobrar</div>
                <div style={{fontSize:26,fontWeight:800,color:'#fff',fontFamily:'var(--mono)'}}>{fmt(cobroActivo.total)}</div>
                <div style={{fontSize:12,color:'rgba(255,255,255,.6)',marginTop:4}}>{cobroActivo.folio} · {cobroActivo.cliente}</div>
              </div>

              <div className="form-group">
                <label className="form-label">Número de tarjeta</label>
                <input className="form-input" placeholder="1234 5678 9012 3456" maxLength={19}
                  value={tcForm.numero} onChange={e=>{
                    const v=e.target.value.replace(/\D/g,'').slice(0,16);
                    setTcForm(f=>({...f,numero:v.replace(/(.{4})/g,'$1 ').trim()}));
                  }} style={{fontFamily:'var(--mono)',letterSpacing:2}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label className="form-label">Vencimiento</label>
                  <input className="form-input" placeholder="MM/AA" maxLength={5}
                    value={tcForm.expiry} onChange={e=>{
                      const v=e.target.value.replace(/\D/g,'').slice(0,4);
                      setTcForm(f=>({...f,expiry:v.length>2?v.slice(0,2)+'/'+v.slice(2):v}));
                    }} style={{fontFamily:'var(--mono)'}}/>
                </div>
                <div className="form-group">
                  <label className="form-label">CVV</label>
                  <input className="form-input" placeholder="123" maxLength={4} type="password"
                    value={tcForm.cvv} onChange={e=>setTcForm(f=>({...f,cvv:e.target.value.replace(/\D/g,'').slice(0,4)}))}
                    style={{fontFamily:'var(--mono)'}}/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Nombre en la tarjeta</label>
                <input className="form-input" placeholder="JUAN PÉREZ GARCÍA"
                  value={tcForm.nombre} onChange={e=>setTcForm(f=>({...f,nombre:e.target.value.toUpperCase()}))}/>
              </div>

              {tcProcessing && (
                <div className="verif-row">
                  <span className="spinner" style={{borderTopColor:'var(--accent)'}}></span>
                  <span style={{fontSize:12.5,color:'var(--ink-2)'}}>Procesando pago con la terminal…</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={cerrarModal} disabled={tcProcessing}>Cancelar</button>
              <button className="btn btn-primary" onClick={procesarTC}
                disabled={tcProcessing||!tcForm.numero||!tcForm.expiry||!tcForm.cvv||!tcForm.nombre}>
                {tcProcessing
                  ? <><span className="spinner"></span> Procesando…</>
                  : `💳 Cobrar ${fmt(cobroActivo.total)}`}
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
