/* views/PortalFamilia.jsx — Portal para padres · v4 · SVG icons · logo real */
function PortalFamilia({ data, setData, user, escuela, onLogout }) {
  const { useState, useEffect, useRef } = React;

  const [misHijos, setMisHijos]       = useState([]);
  const [misCobros, setMisCobros]     = useState([]);
  const [saldoTotal, setSaldoTotal]   = useState(0);
  const [metodo, setMetodo]           = useState('SPEI');
  const [modal, setModal]             = useState(null);
  const [cobroActivo, setCobroActivo] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [tab, setTab]                 = useState('inicio');
  const [copied, setCopied]           = useState('');
  const [pollStatus, setPollStatus]   = useState(null);
  const pollRef = useRef(null);

  const PLC = {
    navy:   '#282d65',
    navyDk: '#1c2050',
    lime:   '#bdcf00',
    limeDk: '#9eb000',
    green:  '#49af54',
    white:  '#ffffff',
    bg:     '#f2f4f9',
    card:   '#ffffff',
    border: '#e2e8f0',
    text:   '#1e2546',
    muted:  '#64748b',
    red:    '#ef4444',
  };

  useEffect(() => {
    if (user.familia_id) {
      const hijos  = data.clientes.filter(c => c.familia_id === user.familia_id && c.activo);
      const ids    = hijos.map(h => h.id);
      const cobros = data.cobros.filter(c => ids.includes(c.cliente_id));
      const saldo  = hijos.reduce((a, c) => a + (c.saldo_pendiente || 0), 0);
      setMisHijos(hijos);
      setMisCobros(cobros);
      setSaldoTotal(saldo);
    }
  }, [data, user.familia_id]);

  const copiar = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const iniciarPolling = cobro => {
    setPollStatus('waiting');
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r    = await fetch(`api.php?action=verificar_spei&referencia=${cobro.referencia_spei || cobro.referencia}`);
        const json = await r.json();
        if (json.pagado) {
          clearInterval(pollRef.current);
          setPollStatus('confirmed');
          setData(AppModel.load());
        }
      } catch(_) {}
    }, 10000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const pagarSaldo = async () => {
    if (saldoTotal <= 0) return;
    setLoading(true);
    const conceptoTemporal = [{
      id:'SALDO_GLOBAL', nombre:`Liquidación de saldo — ${user.nombre}`,
      precio:saldoTotal, qty:1, emoji:'',
    }];
    const escuela_id = escuela?.id ?? 1;
    const { data:newData, cobro } = CobroController.iniciarCobro(data, {
      carrito: conceptoTemporal,
      cliente: { nombre:user.nombre, tipo:'familia', id:user.familia_id },
      metodo, escuela_id,
    });
    if (metodo === 'SPEI') {
      try {
        const spei = await CobroController.iniciarSPEI(cobro, escuela);
        const cobrosUp = newData.cobros.map(c =>
          c.id === cobro.id ? { ...c, clabe:spei.clabe, banco:spei.banco, referencia_spei:spei.referencia } : c
        );
        const dataFinal = { ...newData, cobros:cobrosUp };
        setData(dataFinal); AppModel.save(dataFinal);
        const cobroFinal = { ...cobro, clabe:spei.clabe, referencia_spei:spei.referencia, banco:spei.banco };
        setCobroActivo(cobroFinal);
        setModal('spei');
        iniciarPolling(cobroFinal);
      } catch(err) { alert('Error al generar instrucciones SPEI: ' + err.message); }
    } else if (metodo === 'TC') {
      try {
        setData(newData); AppModel.save(newData);
        const liga = await CobroController.iniciarTC(cobro);
        window.location.href = liga.url;
      } catch(err) { alert('Error al conectar con la pasarela de pago'); }
    }
    setLoading(false);
  };

  /* ─── helpers de estilo ─── */
  const card = (extra={}) => ({
    background:PLC.card, borderRadius:14,
    border:`1px solid ${PLC.border}`,
    boxShadow:'0 2px 12px rgba(40,45,101,.06)',
    marginBottom:18, overflow:'hidden', ...extra,
  });

  const fieldBox = (highlight=false) => ({
    background: highlight ? `rgba(189,207,0,.09)` : `rgba(40,45,101,.04)`,
    border: `1px solid ${highlight ? PLC.lime : PLC.border}`,
    borderRadius:9, padding:'10px 14px', marginBottom:10,
  });

  const badgeStyle = ok => ({
    display:'inline-flex', alignItems:'center', gap:5,
    padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600,
    background: ok ? 'rgba(73,175,84,.12)' : 'rgba(239,68,68,.09)',
    color: ok ? PLC.green : PLC.red,
  });

  const tabBtn = (id, label, iconName) => {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{
        display:'flex', alignItems:'center', gap:7,
        padding:'10px 16px', border:'none', background:'transparent',
        cursor:'pointer', fontFamily:'inherit', fontSize:13,
        fontWeight: active ? 700 : 400,
        color: active ? PLC.navy : PLC.muted,
        borderBottom:`2px solid ${active ? PLC.lime : 'transparent'}`,
        marginBottom:-2, transition:'all .15s',
      }}>
        <Icon name={iconName} size={15} color={active ? PLC.navy : PLC.muted}/>
        {label}
      </button>
    );
  };

  const cobrosHijo   = id => misCobros.filter(c => c.cliente_id === id);
  const pendientesHj = id => cobrosHijo(id).filter(c => c.estado === 'pendiente');

  return (
    <div style={{minHeight:'100vh', background:PLC.bg, fontFamily:"'DM Sans',system-ui,sans-serif"}}>

      {/* ── TOPBAR ── */}
      <div style={{
        background:PLC.navy, padding:'0 24px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        height:64, boxShadow:`0 2px 16px rgba(28,32,80,.35)`,
        position:'sticky', top:0, zIndex:100,
      }}>
        {/* Logo */}
        <img
          src="assets/logo.jpeg"
          alt="paga la escuela"
          style={{height:42, objectFit:'contain', display:'block', borderRadius:'10px'}}
          onError={e => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
        <div style={{display:'none', alignItems:'center', gap:8}}>
          <span style={{color:PLC.white, fontWeight:800, fontSize:17, letterSpacing:'-.5px'}}>paga la escuela</span>
          <span style={{color:PLC.lime, fontSize:11, fontWeight:600}}>by Libertyfin</span>
        </div>

        {/* User chip */}
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          {escuela && (
            <div style={{
              padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:600,
              background:'rgba(189,207,0,.15)', color:PLC.lime, marginRight:4,
            }}>
              {escuela.nombre}
            </div>
          )}
          <div style={{textAlign:'right', lineHeight:1.3}}>
            <div style={{color:PLC.white, fontSize:13, fontWeight:600}}>{user.nombre}</div>
            <div style={{color:'rgba(255,255,255,.5)', fontSize:11}}>Portal Familiar</div>
          </div>
          <div style={{
            width:36, height:36, borderRadius:'50%',
            background:`linear-gradient(135deg,${PLC.lime},${PLC.green})`,
            color:PLC.navy, display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:700, fontSize:14, flexShrink:0,
          }}>
            {user.nombre.charAt(0).toUpperCase()}
          </div>
          {onLogout && (
            <button onClick={onLogout} title="Cerrar sesión" style={{
              background:'rgba(255,255,255,.1)', border:'none', color:PLC.white,
              width:34, height:34, borderRadius:8, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Icon name="logout" size={16} color="currentColor"/>
            </button>
          )}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{maxWidth:880, margin:'0 auto', padding:'28px 20px 60px'}}>

        {/* ── HERO ── */}
        <div style={{
          background:`linear-gradient(135deg, ${PLC.navyDk} 0%, ${PLC.navy} 100%)`,
          borderRadius:18, padding:'28px 28px 24px',
          marginBottom:20, position:'relative', overflow:'hidden',
          border:`1px solid rgba(189,207,0,.15)`,
        }}>
          <div style={{position:'absolute', top:-40, right:-40, width:180, height:180, borderRadius:'50%', background:PLC.lime, opacity:.06, pointerEvents:'none'}}/>
          <div style={{position:'absolute', bottom:-20, right:100, width:90, height:90, borderRadius:'50%', background:PLC.green, opacity:.09, pointerEvents:'none'}}/>

          <div style={{fontSize:12, color:'rgba(255,255,255,.45)', marginBottom:3, textTransform:'uppercase', letterSpacing:.5}}>
            Bienvenido/a
          </div>
          <div style={{fontSize:22, fontWeight:700, color:PLC.white, marginBottom:22}}>
            {user.nombre}
          </div>

          <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
            {/* Alumnos */}
            <div style={{flex:1, minWidth:100, background:'rgba(255,255,255,.08)', borderRadius:10, padding:'14px 16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <Icon name="alumnos" size={14} color="rgba(255,255,255,.5)"/>
                <span style={{fontSize:10, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:.4}}>Alumnos</span>
              </div>
              <div style={{fontSize:26, fontWeight:700, color:PLC.white}}>{misHijos.length}</div>
              <div style={{fontSize:11, color:'rgba(255,255,255,.45)', marginTop:2}}>
                {misHijos.map(h=>h.nombre.split(' ')[0]).join(' · ') || '—'}
              </div>
            </div>

            {/* Saldo */}
            <div style={{flex:1, minWidth:100, background: saldoTotal>0 ? 'rgba(189,207,0,.14)' : 'rgba(73,175,84,.14)', borderRadius:10, padding:'14px 16px', border:`1px solid ${saldoTotal>0?'rgba(189,207,0,.25)':'rgba(73,175,84,.25)'}`}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <Icon name="pay" size={14} color="rgba(255,255,255,.5)"/>
                <span style={{fontSize:10, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:.4}}>Saldo total</span>
              </div>
              <div style={{fontSize:26, fontWeight:700, color: saldoTotal>0 ? PLC.lime : PLC.green}}>
                {fmt(saldoTotal)}
              </div>
              <div style={{fontSize:11, color:'rgba(255,255,255,.55)', marginTop:2}}>
                {saldoTotal>0 ? 'Pagos pendientes' : 'Todo al corriente'}
              </div>
            </div>

            {/* Cobros */}
            <div style={{flex:1, minWidth:100, background:'rgba(255,255,255,.08)', borderRadius:10, padding:'14px 16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <Icon name="cobros" size={14} color="rgba(255,255,255,.5)"/>
                <span style={{fontSize:10, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:.4}}>Cobros</span>
              </div>
              <div style={{fontSize:26, fontWeight:700, color:PLC.white}}>{misCobros.length}</div>
              <div style={{fontSize:11, color:'rgba(255,255,255,.45)', marginTop:2}}>
                {misCobros.filter(c=>c.estado==='pagado').length} pagados
              </div>
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{display:'flex', gap:2, borderBottom:`2px solid ${PLC.border}`, marginBottom:22}}>
          {tabBtn('inicio',    'Inicio',        'home')}
          {tabBtn('hijos',     'Mis hijos',     'alumnos')}
          {tabBtn('historial', 'Historial',     'history')}
          {tabBtn('pagar',     'Pagar en línea','card')}
        </div>

        {/* ════ TAB: INICIO ════ */}
        {tab==='inicio' && (
          <div>
            {saldoTotal>0 && (
              <div style={{...card(), border:`2px solid ${PLC.lime}`, background:`linear-gradient(135deg,rgba(189,207,0,.07),rgba(73,175,84,.05))`}}>
                <div style={{padding:'18px 22px', display:'flex', alignItems:'center', gap:16}}>
                  <div style={{
                    width:50, height:50, borderRadius:12, flexShrink:0,
                    background:`linear-gradient(135deg,${PLC.lime},${PLC.green})`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <Icon name="bell" size={22} color={PLC.navy}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700, fontSize:15, color:PLC.text, marginBottom:3}}>
                      Tienes {fmt(saldoTotal)} pendiente de pago
                    </div>
                    <div style={{fontSize:13, color:PLC.muted}}>
                      Paga con transferencia SPEI o tarjeta de crédito/débito de forma segura.
                    </div>
                  </div>
                  <button onClick={()=>setTab('pagar')} style={{
                    flexShrink:0, padding:'10px 18px', borderRadius:9, border:'none',
                    background:`linear-gradient(135deg,${PLC.navy},${PLC.navyDk})`,
                    color:PLC.white, fontWeight:700, fontSize:13, cursor:'pointer',
                    display:'flex', alignItems:'center', gap:7,
                  }}>
                    Pagar ahora <Icon name="arrowRight" size={15} color={PLC.white}/>
                  </button>
                </div>
              </div>
            )}

            {misHijos.map(hijo => {
              const pends = pendientesHj(hijo.id);
              return (
                <div key={hijo.id} style={card()}>
                  <div style={{padding:'16px 20px', borderBottom:`1px solid ${PLC.border}`, display:'flex', alignItems:'center', gap:13}}>
                    <div style={{
                      width:44, height:44, borderRadius:11, flexShrink:0,
                      background:`rgba(40,45,101,.08)`, border:`2px solid rgba(40,45,101,.12)`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      <Icon name="alumnos" size={20} color={PLC.navy}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700, fontSize:14, color:PLC.text}}>{hijo.nombre}</div>
                      <div style={{fontSize:12, color:PLC.muted}}>{hijo.grado} · Mat: <code style={{fontSize:11}}>{hijo.matricula||'—'}</code></div>
                    </div>
                    <div style={badgeStyle(hijo.saldo_pendiente===0)}>
                      <Icon name={hijo.saldo_pendiente===0?'check':'warning'} size={11} color="currentColor"/>
                      {hijo.saldo_pendiente===0 ? 'Al corriente' : fmt(hijo.saldo_pendiente)}
                    </div>
                  </div>
                  {pends.length>0 && (
                    <div style={{padding:'14px 20px'}}>
                      <div style={{fontSize:11, color:PLC.muted, fontWeight:600, textTransform:'uppercase', letterSpacing:.4, marginBottom:10}}>
                        Cobros pendientes
                      </div>
                      {pends.map(cob => (
                        <div key={cob.id} style={{
                          display:'flex', alignItems:'center', gap:12, padding:'10px 12px',
                          borderRadius:8, marginBottom:6,
                          background:'rgba(40,45,101,.04)', border:`1px solid ${PLC.border}`,
                        }}>
                          <Icon name="cobros" size={16} color={PLC.muted}/>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13, fontWeight:500, color:PLC.text}}>
                              {cob.items.map(i=>i.nombre).join(', ')}
                            </div>
                            <div style={{fontSize:11, color:PLC.muted, marginTop:2}}>
                              Folio: <code style={{fontSize:11}}>{cob.folio}</code> · {cob.fecha}
                            </div>
                          </div>
                          <div style={{fontFamily:'monospace', fontWeight:700, color:PLC.navy, fontSize:14}}>
                            {fmt(cob.total)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {misHijos.length===0 && (
              <div style={{...card(), padding:40, textAlign:'center'}}>
                <Icon name="escuelas" size={44} color={PLC.muted} style={{margin:'0 auto 14px', opacity:.4}}/>
                <div style={{fontSize:15, fontWeight:600, color:PLC.text, marginBottom:6}}>Sin alumnos asignados</div>
                <div style={{fontSize:13, color:PLC.muted}}>Comunícate con la administración de tu escuela.</div>
              </div>
            )}
          </div>
        )}

        {/* ════ TAB: MIS HIJOS ════ */}
        {tab==='hijos' && (
          <div>
            {misHijos.map(hijo => (
              <div key={hijo.id} style={card()}>
                <div style={{padding:'16px 20px', borderBottom:`1px solid ${PLC.border}`, display:'flex', alignItems:'center', gap:13, background:`rgba(40,45,101,.03)`}}>
                  <div style={{
                    width:50, height:50, borderRadius:12, flexShrink:0,
                    background:`linear-gradient(135deg,${PLC.navy},${PLC.navyDk})`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <Icon name="alumnos" size={22} color={PLC.white}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700, fontSize:15, color:PLC.text}}>{hijo.nombre}</div>
                    <div style={{fontSize:12, color:PLC.muted, marginTop:2}}>{hijo.grado}</div>
                  </div>
                  <div style={badgeStyle(hijo.saldo_pendiente===0)}>
                    <Icon name={hijo.saldo_pendiente===0?'check':'warning'} size={11} color="currentColor"/>
                    {hijo.saldo_pendiente===0 ? 'Al corriente' : fmt(hijo.saldo_pendiente)}
                  </div>
                </div>
                <div style={{padding:'16px 20px'}}>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                    {[
                      { l:'Matrícula',      v:hijo.matricula||'—',   mono:true },
                      { l:'CURP',           v:hijo.curp||'—',        mono:true },
                      { l:'Correo',         v:hijo.email||'—' },
                      { l:'Teléfono',       v:hijo.tel||'—',         mono:true },
                      { l:'Saldo pendiente',v:fmt(hijo.saldo_pendiente), color:hijo.saldo_pendiente>0?PLC.red:PLC.green },
                      { l:'Cobros totales', v:cobrosHijo(hijo.id).length+' cobros' },
                    ].map(row => (
                      <div key={row.l} style={{padding:'10px 12px', background:'rgba(40,45,101,.03)', borderRadius:8, border:`1px solid ${PLC.border}`}}>
                        <div style={{fontSize:10.5, color:PLC.muted, marginBottom:3, textTransform:'uppercase', letterSpacing:.4}}>{row.l}</div>
                        <div style={{fontSize:13, fontWeight:500, color:row.color||PLC.text, fontFamily:row.mono?'monospace':'inherit'}}>{row.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ════ TAB: HISTORIAL ════ */}
        {tab==='historial' && (
          <div style={card()}>
            <div style={{padding:'16px 20px', borderBottom:`1px solid ${PLC.border}`, display:'flex', alignItems:'center', gap:12}}>
              <Icon name="history" size={20} color={PLC.navy}/>
              <div>
                <div style={{fontWeight:700, fontSize:14, color:PLC.text}}>Historial de cobros</div>
                <div style={{fontSize:12, color:PLC.muted}}>{misCobros.length} registros</div>
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                <thead>
                  <tr style={{borderBottom:`2px solid ${PLC.border}`}}>
                    {['Folio','Alumno','Concepto','Método','Total','Estado','Fecha'].map(h => (
                      <th key={h} style={{padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:PLC.muted, textTransform:'uppercase', letterSpacing:.4, whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {misCobros.length===0 && (
                    <tr><td colSpan={7} style={{padding:40, textAlign:'center', color:PLC.muted}}>Sin cobros registrados</td></tr>
                  )}
                  {misCobros.map((cob,i) => (
                    <tr key={cob.id} style={{borderBottom:`1px solid ${PLC.border}`, background:i%2===0?'transparent':'rgba(40,45,101,.02)'}}>
                      <td style={{padding:'11px 16px', fontFamily:'monospace', fontSize:12, color:PLC.muted}}>{cob.folio}</td>
                      <td style={{padding:'11px 16px', fontWeight:500, color:PLC.text}}>{cob.cliente}</td>
                      <td style={{padding:'11px 16px', color:PLC.muted, maxWidth:180}}>{cob.items.map(i=>i.nombre).join(', ')}</td>
                      <td style={{padding:'11px 16px'}}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 9px',borderRadius:20,fontSize:11,fontWeight:600,background:'rgba(40,45,101,.08)',color:PLC.navy}}>
                          <Icon name={cob.metodo==='SPEI'?'bank':'card'} size={11} color="currentColor"/>
                          {cob.metodo}
                        </span>
                      </td>
                      <td style={{padding:'11px 16px', fontFamily:'monospace', fontWeight:700, color:PLC.navy}}>{fmt(cob.total)}</td>
                      <td style={{padding:'11px 16px'}}>
                        <span style={badgeStyle(cob.estado==='pagado')}>
                          <Icon name={cob.estado==='pagado'?'check':'warning'} size={11} color="currentColor"/>
                          {cob.estado==='pagado'?'Pagado':'Pendiente'}
                        </span>
                      </td>
                      <td style={{padding:'11px 16px', color:PLC.muted, fontSize:12, whiteSpace:'nowrap'}}>{cob.fecha}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════ TAB: PAGAR ════ */}
        {tab==='pagar' && (
          <div>
            {saldoTotal<=0 ? (
              <div style={{...card(), padding:50, textAlign:'center'}}>
                <div style={{width:64,height:64,borderRadius:'50%',background:`rgba(73,175,84,.12)`,margin:'0 auto 16px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <Icon name="check" size={32} color={PLC.green}/>
                </div>
                <div style={{fontSize:18, fontWeight:700, color:PLC.green, marginBottom:8}}>¡Todo al corriente!</div>
                <div style={{fontSize:14, color:PLC.muted}}>No tienes pagos pendientes en este momento.</div>
              </div>
            ) : (
              <>
                {/* Resumen */}
                <div style={card()}>
                  <div style={{padding:'16px 20px', borderBottom:`1px solid ${PLC.border}`, display:'flex', alignItems:'center', gap:12}}>
                    <Icon name="cobros" size={20} color={PLC.navy}/>
                    <div style={{fontWeight:700, fontSize:14, color:PLC.text}}>Resumen de pago</div>
                  </div>
                  <div style={{padding:'16px 20px'}}>
                    {misHijos.filter(h=>h.saldo_pendiente>0).map(h => (
                      <div key={h.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:`1px solid ${PLC.border}`}}>
                        <div>
                          <div style={{fontWeight:500, color:PLC.text}}>{h.nombre}</div>
                          <div style={{fontSize:12, color:PLC.muted}}>{h.grado}</div>
                        </div>
                        <div style={{fontFamily:'monospace', fontWeight:700, color:PLC.red}}>{fmt(h.saldo_pendiente)}</div>
                      </div>
                    ))}
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0 0'}}>
                      <div style={{fontWeight:700, fontSize:15, color:PLC.text}}>Total a pagar</div>
                      <div style={{fontFamily:'monospace', fontWeight:800, fontSize:20, color:PLC.navy}}>{fmt(saldoTotal)}</div>
                    </div>
                  </div>
                </div>

                {/* Método */}
                <div style={card()}>
                  <div style={{padding:'16px 20px', borderBottom:`1px solid ${PLC.border}`, display:'flex', alignItems:'center', gap:12}}>
                    <Icon name="card" size={20} color={PLC.navy}/>
                    <div style={{fontWeight:700, fontSize:14, color:PLC.text}}>Método de pago</div>
                  </div>
                  <div style={{padding:'20px'}}>
                    <div style={{display:'flex', gap:12, marginBottom:22}}>
                      {/* SPEI */}
                      <div onClick={()=>setMetodo('SPEI')} style={{
                        flex:1, padding:'14px 16px', borderRadius:10, cursor:'pointer',
                        border:`2px solid ${metodo==='SPEI'?PLC.navy:PLC.border}`,
                        background: metodo==='SPEI' ? 'rgba(40,45,101,.05)' : 'transparent',
                        display:'flex', alignItems:'center', gap:12, transition:'all .15s',
                      }}>
                        <div style={{width:40,height:40,borderRadius:9,background:metodo==='SPEI'?PLC.navy:'#f0f2f8',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s',flexShrink:0}}>
                          <Icon name="bank" size={20} color={metodo==='SPEI'?PLC.white:PLC.muted}/>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600, fontSize:13, color:PLC.text}}>Transferencia SPEI</div>
                          <div style={{fontSize:11, color:PLC.muted}}>Sin comisión adicional</div>
                        </div>
                        {metodo==='SPEI' && <Icon name="check" size={18} color={PLC.green}/>}
                      </div>

                      {/* TC */}
                      <div onClick={()=>setMetodo('TC')} style={{
                        flex:1, padding:'14px 16px', borderRadius:10, cursor:'pointer',
                        border:`2px solid ${metodo==='TC'?PLC.navy:PLC.border}`,
                        background: metodo==='TC' ? 'rgba(40,45,101,.05)' : 'transparent',
                        display:'flex', alignItems:'center', gap:12, transition:'all .15s',
                      }}>
                        <div style={{width:40,height:40,borderRadius:9,background:metodo==='TC'?PLC.navy:'#f0f2f8',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s',flexShrink:0}}>
                          <Icon name="card" size={20} color={metodo==='TC'?PLC.white:PLC.muted}/>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600, fontSize:13, color:PLC.text}}>Tarjeta Crédito / Débito</div>
                          <div style={{fontSize:11, color:PLC.muted}}>Visa, Mastercard, Amex</div>
                        </div>
                        {metodo==='TC' && <Icon name="check" size={18} color={PLC.green}/>}
                      </div>
                    </div>

                    <button
                      onClick={pagarSaldo} disabled={loading}
                      style={{
                        width:'100%', padding:'14px 0', borderRadius:10, border:'none',
                        background:`linear-gradient(135deg,${PLC.lime},${PLC.green})`,
                        color:PLC.navy, fontWeight:800, fontSize:15, cursor:loading?'not-allowed':'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                        opacity: loading ? .7 : 1, transition:'all .18s',
                        fontFamily:'inherit', letterSpacing:.2,
                      }}
                    >
                      {loading ? (
                        <><span className="spinner" style={{borderColor:'rgba(40,45,101,.25)',borderTopColor:PLC.navy,width:18,height:18}}></span>Procesando…</>
                      ) : (
                        <><Icon name="pay" size={18} color={PLC.navy}/>Pagar {fmt(saldoTotal)} con {metodo==='SPEI'?'SPEI':'Tarjeta'}</>
                      )}
                    </button>

                    <div style={{marginTop:14, fontSize:11.5, color:PLC.muted, textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
                      <Icon name="shield" size={13} color={PLC.muted}/>
                      Pago seguro procesado por Pagadetodo.mx · Powered by STP
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ════ MODAL: SPEI ════ */}
      {modal==='spei' && cobroActivo && (
        <div
          style={{position:'fixed',inset:0,background:'rgba(28,32,80,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}}
          onClick={e => e.target===e.currentTarget && setModal(null)}
        >
          <div style={{background:PLC.card, borderRadius:18, width:'100%', maxWidth:460, boxShadow:`0 28px 70px rgba(28,32,80,.35)`, overflow:'hidden'}}>

            {/* Header */}
            <div style={{background:`linear-gradient(135deg,${PLC.navyDk},${PLC.navy})`, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <div style={{width:38,height:38,borderRadius:10,background:'rgba(189,207,0,.18)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <Icon name="bank" size={20} color={PLC.lime}/>
                </div>
                <div>
                  <div style={{fontWeight:700, fontSize:16, color:PLC.white}}>Datos para transferir</div>
                  <div style={{fontSize:11.5, color:'rgba(255,255,255,.5)', marginTop:2}}>Incluye el concepto exacto</div>
                </div>
              </div>
              <button onClick={()=>setModal(null)} style={{background:'rgba(255,255,255,.1)',border:'none',color:PLC.white,width:32,height:32,borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <Icon name="close" size={18} color="currentColor"/>
              </button>
            </div>

            <div style={{padding:24}}>
              {pollStatus==='confirmed' ? (
                <div style={{textAlign:'center', padding:'20px 0'}}>
                  <div style={{width:64,height:64,borderRadius:'50%',background:`rgba(73,175,84,.12)`,margin:'0 auto 14px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <Icon name="check" size={32} color={PLC.green}/>
                  </div>
                  <div style={{fontSize:18, fontWeight:700, color:PLC.green, marginBottom:8}}>¡Pago confirmado!</div>
                  <div style={{fontSize:13, color:PLC.muted}}>Tu pago fue recibido y procesado. Gracias.</div>
                  <button onClick={()=>{setModal(null);setPollStatus(null);}} style={{marginTop:20,padding:'10px 28px',borderRadius:9,border:'none',background:PLC.navy,color:PLC.white,fontWeight:700,cursor:'pointer',fontSize:13}}>
                    Cerrar
                  </button>
                </div>
              ) : (
                <>
                  <div style={{marginBottom:14,padding:'10px 14px',background:`rgba(189,207,0,.09)`,borderRadius:9,fontSize:12.5,color:PLC.navy,border:`1px solid rgba(189,207,0,.3)`,display:'flex',alignItems:'flex-start',gap:8}}>
                    <Icon name="warning" size={16} color={PLC.limeDk} style={{flexShrink:0,marginTop:1}}/>
                    El <strong>concepto es obligatorio</strong> — sin él tu pago no se confirma automáticamente
                  </div>

                  {/* CLABE */}
                  <div style={fieldBox()}>
                    <div style={{fontSize:10, color:PLC.muted, textTransform:'uppercase', letterSpacing:.4, marginBottom:5}}>CLABE interbancaria</div>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <div style={{fontFamily:'monospace', fontSize:15, fontWeight:600, color:PLC.text, letterSpacing:.5, flex:1}}>
                        {cobroActivo.clabe || '646180633010000055'}
                      </div>
                      <button onClick={()=>copiar(cobroActivo.clabe||'646180633010000055','clabe')} style={{
                        display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:7,
                        border:`1px solid ${PLC.border}`,background:'white',fontSize:11,cursor:'pointer',color:PLC.muted,flexShrink:0,
                        color: copied==='clabe' ? PLC.green : PLC.muted,
                        borderColor: copied==='clabe' ? PLC.green : PLC.border,
                      }}>
                        <Icon name={copied==='clabe'?'check':'copy'} size={13} color="currentColor"/>
                        {copied==='clabe'?'Copiado':'Copiar'}
                      </button>
                    </div>
                    <div style={{fontSize:11, color:PLC.muted, marginTop:4}}>
                      Banco: <strong>{cobroActivo.banco||'STP'}</strong>
                    </div>
                  </div>

                  {/* Referencia — destacada */}
                  <div style={fieldBox(true)}>
                    <div style={{fontSize:10, color:PLC.limeDk, textTransform:'uppercase', letterSpacing:.4, marginBottom:5, fontWeight:700}}>
                      Concepto / Referencia (obligatorio)
                    </div>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <div style={{fontFamily:'monospace', fontSize:18, fontWeight:700, color:PLC.navy, flex:1, letterSpacing:.5}}>
                        {cobroActivo.referencia_spei || cobroActivo.referencia}
                      </div>
                      <button onClick={()=>copiar(cobroActivo.referencia_spei||cobroActivo.referencia,'ref')} style={{
                        display:'flex',alignItems:'center',gap:5,padding:'6px 12px',borderRadius:7,
                        border:`2px solid ${copied==='ref'?PLC.green:PLC.lime}`,
                        background: copied==='ref' ? `rgba(73,175,84,.12)` : PLC.lime,
                        color: copied==='ref' ? PLC.green : PLC.navy,
                        fontWeight:700,fontSize:12,cursor:'pointer',flexShrink:0,
                      }}>
                        <Icon name={copied==='ref'?'check':'copy'} size={13} color="currentColor"/>
                        {copied==='ref'?'Copiado':'Copiar'}
                      </button>
                    </div>
                  </div>

                  {/* Monto */}
                  <div style={fieldBox()}>
                    <div style={{fontSize:10, color:PLC.muted, textTransform:'uppercase', letterSpacing:.4, marginBottom:5}}>Monto exacto</div>
                    <div style={{fontFamily:'monospace', fontSize:19, fontWeight:700, color:PLC.navy}}>{fmt(cobroActivo.total)}</div>
                  </div>

                  {pollStatus==='waiting' && (
                    <div style={{marginTop:14,padding:'10px 14px',background:'rgba(40,45,101,.05)',borderRadius:9,fontSize:12,color:PLC.muted,textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                      <span className="spinner" style={{borderColor:'rgba(40,45,101,.2)',borderTopColor:PLC.navy,width:14,height:14}}></span>
                      Verificando pago automáticamente cada 10 segundos…
                    </div>
                  )}

                  <div style={{marginTop:16,fontSize:11.5,color:PLC.muted,lineHeight:1.6,textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                    <Icon name="shield" size={13} color={PLC.muted}/>
                    El sistema detectará tu transferencia automáticamente.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
