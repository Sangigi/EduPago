/* views/PortalFamilia.jsx — Portal para padres de familia · Pagalaescuela branding */
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
  const [copied, setCopied]           = useState(false);
  const [pollStatus, setPollStatus]   = useState(null); // null | 'waiting' | 'confirmed'
  const pollRef = useRef(null);

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

  const copiarTexto = text => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Polling SPEI en el portal de familia
  const iniciarPolling = (cobro) => {
    setPollStatus('waiting');
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`api.php?action=verificar_spei&referencia=${cobro.referencia_spei || cobro.referencia}`);
        const json = await r.json();
        if (json.pagado) {
          clearInterval(pollRef.current);
          setPollStatus('confirmed');
          const reloaded = AppModel.load();
          setData(reloaded);
        }
      } catch(_) {}
    }, 10000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const pagarSaldo = async () => {
    if (saldoTotal <= 0) return;
    setLoading(true);
    const conceptoTemporal = [{
      id: 'SALDO_GLOBAL',
      nombre: `Liquidación de saldo — ${user.nombre}`,
      precio: saldoTotal, qty: 1, emoji: '📚'
    }];
    const escuela_id = escuela?.id ?? 1;
    const { data: newData, cobro } = CobroController.iniciarCobro(data, {
      carrito: conceptoTemporal,
      cliente: { nombre: user.nombre, tipo: 'familia', id: user.familia_id },
      metodo, escuela_id
    });

    if (metodo === 'SPEI') {
      try {
        const spei = await CobroController.iniciarSPEI(cobro, escuela);
        const cobrosActualizados = newData.cobros.map(c =>
          c.id === cobro.id ? { ...c, clabe: spei.clabe, banco: spei.banco, referencia_spei: spei.referencia } : c
        );
        const dataConClabe = { ...newData, cobros: cobrosActualizados };
        setData(dataConClabe);
        AppModel.save(dataConClabe);
        const cobroFinal = { ...cobro, clabe: spei.clabe, referencia_spei: spei.referencia, banco: spei.banco };
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

  // ──────────────────────────────
  // Estilos del portal (inline, independientes del sistema admin)
  const PLC = {
    navy:   '#282d65',
    lime:   '#bdcf00',
    green:  '#49af54',
    white:  '#ffffff',
    bg:     '#f4f6fb',
    card:   '#ffffff',
    border: '#e2e8f0',
    text:   '#1e2546',
    muted:  '#6b7280',
    red:    '#ef4444',
  };

  const s = {
    wrap: {
      minHeight: '100vh', background: PLC.bg,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    },
    topbar: {
      background: PLC.navy, padding: '0 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 64, boxShadow: '0 2px 12px rgba(40,45,101,.25)',
    },
    logo: {
      height: 38, objectFit: 'contain',
    },
    userChip: {
      display: 'flex', alignItems: 'center', gap: 10,
    },
    avatar: {
      width: 36, height: 36, borderRadius: '50%',
      background: PLC.lime, color: PLC.navy,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: 14,
    },
    userName: { color: PLC.white, fontSize: 13, fontWeight: 500 },
    escuelaNombre: { color: 'rgba(255,255,255,.55)', fontSize: 11 },
    content: { maxWidth: 860, margin: '0 auto', padding: '28px 20px 60px' },
    tabs: {
      display: 'flex', gap: 4, marginBottom: 24,
      borderBottom: `2px solid ${PLC.border}`, paddingBottom: 0,
    },
    card: {
      background: PLC.card, borderRadius: 14,
      border: `1px solid ${PLC.border}`,
      boxShadow: '0 2px 12px rgba(40,45,101,.06)',
      marginBottom: 20, overflow: 'hidden',
    },
    cardHeader: {
      padding: '18px 22px', borderBottom: `1px solid ${PLC.border}`,
      display: 'flex', alignItems: 'center', gap: 12,
    },
    cardBody: { padding: '18px 22px' },
    heroCard: {
      background: `linear-gradient(135deg, ${PLC.navy} 0%, #1a1f52 100%)`,
      borderRadius: 16, padding: '28px 28px 24px',
      marginBottom: 20, position: 'relative', overflow: 'hidden',
    },
    statBox: {
      background: 'rgba(255,255,255,.09)', borderRadius: 10,
      padding: '14px 18px', flex: 1, minWidth: 0,
    },
    payBtn: {
      width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
      fontWeight: 700, fontSize: 16, cursor: 'pointer', transition: 'all .18s',
      background: `linear-gradient(135deg, ${PLC.lime} 0%, ${PLC.green} 100%)`,
      color: PLC.navy, letterSpacing: .3,
    },
    methodCard: active => ({
      flex: 1, padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
      border: `2px solid ${active ? PLC.navy : PLC.border}`,
      background: active ? `rgba(40,45,101,.05)` : 'transparent',
      display: 'flex', alignItems: 'center', gap: 10, transition: 'all .15s',
    }),
    badge: ok => ({
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: ok ? 'rgba(73,175,84,.12)' : 'rgba(239,68,68,.09)',
      color: ok ? PLC.green : PLC.red,
    }),
    speiField: {
      background: 'rgba(40,45,101,.05)', borderRadius: 8,
      padding: '10px 14px', marginBottom: 10,
    },
    speiLabel: { fontSize: 10.5, color: PLC.muted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: .4 },
    speiValue: { fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 600, color: PLC.text, letterSpacing: .5 },
  };

  const tabBtn = (id, label, icon) => {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{
        padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 400,
        color: active ? PLC.navy : PLC.muted,
        borderBottom: `2px solid ${active ? PLC.navy : 'transparent'}`,
        marginBottom: -2, transition: 'all .15s',
      }}>
        {icon} {label}
      </button>
    );
  };

  const cobrosHijo = hijoId => misCobros.filter(c => c.cliente_id === hijoId);
  const pendientesHijo = hijoId => cobrosHijo(hijoId).filter(c => c.estado === 'pendiente');

  return (
    <div style={s.wrap}>
      {/* ── Barra superior ── */}
      <div style={s.topbar}>
        {/* Logo Pagalaescuela */}
        <img
          src="/mnt/user-data/uploads/logo.jpeg"
          alt="paga la escuela"
          style={s.logo}
          onError={e => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
        <div style={{ display:'none', alignItems:'center', gap:8 }}>
          <div style={{ width:32, height:32, borderRadius:8, background: PLC.lime, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>✓</div>
          <span style={{ color: PLC.white, fontWeight:700, fontSize:15 }}>paga la escuela</span>
        </div>

        <div style={s.userChip}>
          <div style={{ textAlign:'right', marginRight:6 }}>
            <div style={s.userName}>{user.nombre}</div>
            <div style={s.escuelaNombre}>{escuela?.nombre || 'Portal Familiar'}</div>
          </div>
          <div style={s.avatar}>{user.nombre.charAt(0).toUpperCase()}</div>
          {onLogout && (
            <button onClick={onLogout} title="Cerrar sesión" style={{
              marginLeft:6, background:'rgba(255,255,255,.12)', border:'none',
              color: PLC.white, width:32, height:32, borderRadius:8,
              cursor:'pointer', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center'
            }}>⏻</button>
          )}
        </div>
      </div>

      {/* ── Contenido ── */}
      <div style={s.content}>

        {/* ── Hero card ── */}
        <div style={s.heroCard}>
          {/* Decoración geométrica */}
          <div style={{ position:'absolute', top:-30, right:-30, width:160, height:160, borderRadius:'50%', background: PLC.lime, opacity:.07 }}/>
          <div style={{ position:'absolute', bottom:-20, right:80, width:80, height:80, borderRadius:'50%', background: PLC.green, opacity:.1 }}/>

          <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginBottom:4, textTransform:'uppercase', letterSpacing:.5 }}>
            Bienvenido/a
          </div>
          <div style={{ fontSize:22, fontWeight:700, color: PLC.white, marginBottom:20 }}>
            {user.nombre} 👋
          </div>

          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <div style={s.statBox}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginBottom:4 }}>ALUMNOS</div>
              <div style={{ fontSize:26, fontWeight:700, color: PLC.white }}>{misHijos.length}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginTop:2 }}>
                {misHijos.map(h=>h.nombre.split(' ')[0]).join(', ')}
              </div>
            </div>
            <div style={{ ...s.statBox, background: saldoTotal > 0 ? 'rgba(189,207,0,.15)' : 'rgba(73,175,84,.15)' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginBottom:4 }}>SALDO TOTAL</div>
              <div style={{ fontSize:26, fontWeight:700, color: saldoTotal > 0 ? PLC.lime : PLC.green }}>
                {fmt(saldoTotal)}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.6)', marginTop:2 }}>
                {saldoTotal > 0 ? '⚠ Pagos pendientes' : '✓ Todo al corriente'}
              </div>
            </div>
            <div style={s.statBox}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginBottom:4 }}>COBROS</div>
              <div style={{ fontSize:26, fontWeight:700, color: PLC.white }}>{misCobros.length}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginTop:2 }}>
                {misCobros.filter(c=>c.estado==='pagado').length} pagados
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={s.tabs}>
          {tabBtn('inicio',   'Inicio',         '🏠')}
          {tabBtn('hijos',    'Mis hijos',       '🎒')}
          {tabBtn('historial','Historial',       '🧾')}
          {tabBtn('pagar',    'Pagar en línea',  '💳')}
        </div>

        {/* ─────────── TAB: Inicio ─────────── */}
        {tab === 'inicio' && (
          <div>
            {/* Alerta de pago si hay saldo pendiente */}
            {saldoTotal > 0 && (
              <div style={{
                ...s.card, border: `2px solid ${PLC.lime}`,
                background: `linear-gradient(135deg, rgba(189,207,0,.08) 0%, rgba(73,175,84,.06) 100%)`
              }}>
                <div style={s.cardBody}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:48, height:48, borderRadius:12, background: `linear-gradient(135deg, ${PLC.lime}, ${PLC.green})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
                      💰
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:15, color: PLC.text, marginBottom:4 }}>
                        Tienes {fmt(saldoTotal)} pendiente de pago
                      </div>
                      <div style={{ fontSize:13, color: PLC.muted }}>
                        Puedes pagar con transferencia SPEI o tarjeta de crédito/débito
                      </div>
                    </div>
                    <button onClick={() => setTab('pagar')} style={{
                      padding: '10px 20px', borderRadius:8, border:'none', cursor:'pointer',
                      background: `linear-gradient(135deg, ${PLC.navy}, #1a1f52)`,
                      color: PLC.white, fontWeight:700, fontSize:13, flexShrink:0,
                    }}>
                      Pagar ahora →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Resumen por hijo */}
            {misHijos.map(hijo => {
              const pendientes = pendientesHijo(hijo.id);
              return (
                <div key={hijo.id} style={s.card}>
                  <div style={s.cardHeader}>
                    <div style={{
                      width:42, height:42, borderRadius:10,
                      background: `linear-gradient(135deg, ${PLC.navy}22, ${PLC.navy}11)`,
                      border: `2px solid ${PLC.navy}20`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:18, flexShrink:0
                    }}>🎒</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:14, color: PLC.text }}>{hijo.nombre}</div>
                      <div style={{ fontSize:12, color: PLC.muted }}>{hijo.grado} · Matrícula: <span style={{fontFamily:'monospace'}}>{hijo.matricula || '—'}</span></div>
                    </div>
                    <div style={s.badge(hijo.saldo_pendiente===0)}>
                      {hijo.saldo_pendiente === 0 ? '✓ Al corriente' : `⚠ ${fmt(hijo.saldo_pendiente)}`}
                    </div>
                  </div>
                  {pendientes.length > 0 && (
                    <div style={s.cardBody}>
                      <div style={{ fontSize:11, color: PLC.muted, fontWeight:600, textTransform:'uppercase', letterSpacing:.4, marginBottom:10 }}>
                        Cobros pendientes
                      </div>
                      {pendientes.map(cob => (
                        <div key={cob.id} style={{
                          display:'flex', alignItems:'center', gap:12,
                          padding:'10px 12px', borderRadius:8, marginBottom:6,
                          background: 'rgba(40,45,101,.04)', border:`1px solid ${PLC.border}`
                        }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:500, color: PLC.text }}>
                              {cob.items.map(i=>i.nombre).join(', ')}
                            </div>
                            <div style={{ fontSize:11, color: PLC.muted, marginTop:2 }}>
                              Folio: <span style={{fontFamily:'monospace'}}>{cob.folio}</span> · {cob.fecha}
                            </div>
                          </div>
                          <div style={{ fontFamily:'monospace', fontWeight:700, color: PLC.navy, fontSize:14 }}>
                            {fmt(cob.total)}
                          </div>
                          <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:'rgba(40,45,101,.08)', color: PLC.navy }}>
                            {cob.metodo}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {misHijos.length === 0 && (
              <div style={{ ...s.card, textAlign:'center', padding:40 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🏫</div>
                <div style={{ fontSize:15, fontWeight:600, color: PLC.text, marginBottom:6 }}>Sin alumnos asignados</div>
                <div style={{ fontSize:13, color: PLC.muted }}>Comunícate con la administración de la escuela</div>
              </div>
            )}
          </div>
        )}

        {/* ─────────── TAB: Mis hijos ─────────── */}
        {tab === 'hijos' && (
          <div>
            {misHijos.map(hijo => (
              <div key={hijo.id} style={s.card}>
                <div style={{ ...s.cardHeader, background:`linear-gradient(135deg, ${PLC.navy}08, ${PLC.navy}04)` }}>
                  <div style={{ width:50, height:50, borderRadius:12, background:`linear-gradient(135deg, ${PLC.navy}, #1a1f52)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
                    {hijo.nombre.charAt(0)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:15, color: PLC.text }}>{hijo.nombre}</div>
                    <div style={{ fontSize:12, color: PLC.muted, marginTop:2 }}>{hijo.grado}</div>
                  </div>
                  <div style={s.badge(hijo.saldo_pendiente===0)}>
                    {hijo.saldo_pendiente === 0 ? '✓ Al corriente' : fmt(hijo.saldo_pendiente)}
                  </div>
                </div>
                <div style={s.cardBody}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    {[
                      { l:'Matrícula',   v: hijo.matricula || '—',    mono: true },
                      { l:'CURP',        v: hijo.curp || '—',         mono: true },
                      { l:'Correo',      v: hijo.email || '—' },
                      { l:'Teléfono',    v: hijo.tel || '—',          mono: true },
                      { l:'Saldo pendiente', v: fmt(hijo.saldo_pendiente), color: hijo.saldo_pendiente>0 ? PLC.red : PLC.green },
                      { l:'Cobros totales',  v: cobrosHijo(hijo.id).length + ' cobros' },
                    ].map(row => (
                      <div key={row.l} style={{ padding:'10px 12px', background:'rgba(40,45,101,.03)', borderRadius:8, border:`1px solid ${PLC.border}` }}>
                        <div style={{ fontSize:10.5, color: PLC.muted, marginBottom:3, textTransform:'uppercase', letterSpacing:.4 }}>{row.l}</div>
                        <div style={{ fontSize:13, fontWeight:500, color: row.color || PLC.text, fontFamily: row.mono ? 'JetBrains Mono, monospace' : 'inherit' }}>{row.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─────────── TAB: Historial ─────────── */}
        {tab === 'historial' && (
          <div style={s.card}>
            <div style={s.cardHeader}>
              <span style={{ fontSize:20 }}>🧾</span>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color: PLC.text }}>Historial de cobros</div>
                <div style={{ fontSize:12, color: PLC.muted }}>{misCobros.length} registros</div>
              </div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:`2px solid ${PLC.border}` }}>
                    {['Folio','Alumno','Concepto','Método','Total','Estado','Fecha'].map(h => (
                      <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:600, color: PLC.muted, textTransform:'uppercase', letterSpacing:.4, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {misCobros.length === 0 && (
                    <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color: PLC.muted }}>Sin cobros registrados</td></tr>
                  )}
                  {misCobros.map((cob, i) => (
                    <tr key={cob.id} style={{ borderBottom:`1px solid ${PLC.border}`, background: i%2===0 ? 'transparent' : 'rgba(40,45,101,.02)' }}>
                      <td style={{ padding:'12px 16px', fontFamily:'monospace', fontSize:12, color: PLC.muted }}>{cob.folio}</td>
                      <td style={{ padding:'12px 16px', fontWeight:500, color: PLC.text }}>{cob.cliente}</td>
                      <td style={{ padding:'12px 16px', color: PLC.muted, maxWidth:180 }}>{cob.items.map(i=>i.nombre).join(', ')}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600, background:'rgba(40,45,101,.08)', color: PLC.navy }}>{cob.metodo}</span>
                      </td>
                      <td style={{ padding:'12px 16px', fontFamily:'monospace', fontWeight:700, color: PLC.navy }}>{fmt(cob.total)}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={s.badge(cob.estado==='pagado')}>
                          {cob.estado === 'pagado' ? '✓ Pagado' : '⏳ Pendiente'}
                        </span>
                      </td>
                      <td style={{ padding:'12px 16px', color: PLC.muted, fontSize:12 }}>{cob.fecha}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─────────── TAB: Pagar en línea ─────────── */}
        {tab === 'pagar' && (
          <div>
            {saldoTotal <= 0 ? (
              <div style={{ ...s.card, padding:40, textAlign:'center' }}>
                <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
                <div style={{ fontSize:18, fontWeight:700, color: PLC.green, marginBottom:8 }}>¡Todo al corriente!</div>
                <div style={{ fontSize:14, color: PLC.muted }}>No tienes pagos pendientes en este momento.</div>
              </div>
            ) : (
              <>
                {/* Resumen de pago */}
                <div style={s.card}>
                  <div style={s.cardHeader}>
                    <span style={{ fontSize:20 }}>💰</span>
                    <div style={{ fontWeight:700, fontSize:14, color: PLC.text }}>Resumen de pago</div>
                  </div>
                  <div style={s.cardBody}>
                    {misHijos.filter(h=>h.saldo_pendiente>0).map(h => (
                      <div key={h.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:`1px solid ${PLC.border}` }}>
                        <div>
                          <div style={{ fontWeight:500, color: PLC.text }}>{h.nombre}</div>
                          <div style={{ fontSize:12, color: PLC.muted }}>{h.grado}</div>
                        </div>
                        <div style={{ fontFamily:'monospace', fontWeight:700, color: PLC.red }}>{fmt(h.saldo_pendiente)}</div>
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0 0', marginTop:4 }}>
                      <div style={{ fontWeight:700, fontSize:15, color: PLC.text }}>Total a pagar</div>
                      <div style={{ fontFamily:'monospace', fontWeight:700, fontSize:20, color: PLC.navy }}>{fmt(saldoTotal)}</div>
                    </div>
                  </div>
                </div>

                {/* Método de pago */}
                <div style={s.card}>
                  <div style={s.cardHeader}>
                    <span style={{ fontSize:20 }}>💳</span>
                    <div style={{ fontWeight:700, fontSize:14, color: PLC.text }}>Método de pago</div>
                  </div>
                  <div style={s.cardBody}>
                    <div style={{ display:'flex', gap:12, marginBottom:22 }}>
                      <div style={s.methodCard(metodo==='SPEI')} onClick={() => setMetodo('SPEI')}>
                        <div style={{ width:38, height:38, borderRadius:8, background: metodo==='SPEI' ? PLC.navy : '#f0f2f8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, transition:'all .15s' }}>🏦</div>
                        <div>
                          <div style={{ fontWeight:600, fontSize:13, color: PLC.text }}>Transferencia SPEI</div>
                          <div style={{ fontSize:11, color: PLC.muted }}>Sin comisión adicional</div>
                        </div>
                        {metodo==='SPEI' && <div style={{ marginLeft:'auto', width:18, height:18, borderRadius:'50%', background: PLC.green, flexShrink:0 }}>✓</div>}
                      </div>
                      <div style={s.methodCard(metodo==='TC')} onClick={() => setMetodo('TC')}>
                        <div style={{ width:38, height:38, borderRadius:8, background: metodo==='TC' ? PLC.navy : '#f0f2f8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, transition:'all .15s' }}>💳</div>
                        <div>
                          <div style={{ fontWeight:600, fontSize:13, color: PLC.text }}>Tarjeta Crédito / Débito</div>
                          <div style={{ fontSize:11, color: PLC.muted }}>Visa, Mastercard, Amex</div>
                        </div>
                        {metodo==='TC' && <div style={{ marginLeft:'auto', width:18, height:18, borderRadius:'50%', background: PLC.green, flexShrink:0 }}>✓</div>}
                      </div>
                    </div>

                    <button style={{
                      ...s.payBtn,
                      opacity: loading ? .7 : 1,
                      transform: loading ? 'scale(.99)' : 'scale(1)',
                    }}
                      onClick={pagarSaldo}
                      disabled={loading}
                    >
                      {loading
                        ? '⏳ Procesando...'
                        : `Pagar ${fmt(saldoTotal)} con ${metodo === 'SPEI' ? 'SPEI' : 'Tarjeta'}`}
                    </button>

                    <div style={{ marginTop:14, fontSize:12, color: PLC.muted, textAlign:'center', lineHeight:1.6 }}>
                      🔒 Pago seguro procesado por Pagadetodo.mx · Powered by STP
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Instrucciones SPEI ── */}
      {modal === 'spei' && cobroActivo && (
        <div style={{ position:'fixed', inset:0, background:'rgba(40,45,101,.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}
          onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{ background: PLC.white, borderRadius:16, width:'100%', maxWidth:460, boxShadow:'0 24px 60px rgba(40,45,101,.3)', overflow:'hidden' }}>
            {/* Header modal */}
            <div style={{ background:`linear-gradient(135deg, ${PLC.navy}, #1a1f52)`, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontWeight:700, fontSize:16, color: PLC.white }}>🏦 Datos para transferir</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.6)', marginTop:2 }}>Pega o copia el concepto exacto</div>
              </div>
              <button onClick={() => setModal(null)} style={{ background:'rgba(255,255,255,.12)', border:'none', color: PLC.white, width:32, height:32, borderRadius:8, cursor:'pointer', fontSize:16 }}>✕</button>
            </div>
            <div style={{ padding:24 }}>
              {pollStatus === 'confirmed' ? (
                <div style={{ textAlign:'center', padding:'20px 0' }}>
                  <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
                  <div style={{ fontSize:18, fontWeight:700, color: PLC.green, marginBottom:8 }}>¡Pago confirmado!</div>
                  <div style={{ fontSize:13, color: PLC.muted }}>Tu pago fue recibido y procesado. Gracias.</div>
                  <button onClick={() => { setModal(null); setPollStatus(null); }} style={{ marginTop:20, padding:'10px 24px', borderRadius:8, border:'none', background: PLC.navy, color: PLC.white, fontWeight:600, cursor:'pointer' }}>
                    Cerrar
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom:14, padding:'10px 14px', background:'rgba(189,207,0,.1)', borderRadius:8, fontSize:12, color: PLC.navy, border:`1px solid rgba(189,207,0,.3)` }}>
                    ⚠️ El <strong>concepto es obligatorio</strong> — sin él tu pago no se confirma automáticamente
                  </div>

                  <div style={s.speiField}>
                    <div style={s.speiLabel}>CLABE interbancaria</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={s.speiValue}>{cobroActivo.clabe || '646180633010000055'}</div>
                      <button onClick={() => copiarTexto(cobroActivo.clabe || '646180633010000055')} style={{ marginLeft:'auto', padding:'4px 10px', borderRadius:6, border:`1px solid ${PLC.border}`, background:'white', fontSize:11, cursor:'pointer', color: PLC.muted, flexShrink:0 }}>
                        {copied ? '✓ Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <div style={{ fontSize:11, color: PLC.muted, marginTop:4 }}>Banco: <strong>{cobroActivo.banco || 'STP'}</strong></div>
                  </div>

                  <div style={{ ...s.speiField, border:`2px solid ${PLC.lime}`, background:'rgba(189,207,0,.08)' }}>
                    <div style={s.speiLabel}>⚡ Concepto / Referencia (obligatorio)</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ ...s.speiValue, color: PLC.navy, fontSize:17 }}>{cobroActivo.referencia_spei || cobroActivo.referencia}</div>
                      <button onClick={() => copiarTexto(cobroActivo.referencia_spei || cobroActivo.referencia)} style={{ marginLeft:'auto', padding:'4px 10px', borderRadius:6, border:`2px solid ${PLC.lime}`, background: PLC.lime, fontSize:11, cursor:'pointer', color: PLC.navy, fontWeight:700, flexShrink:0 }}>
                        Copiar
                      </button>
                    </div>
                  </div>

                  <div style={s.speiField}>
                    <div style={s.speiLabel}>Monto exacto</div>
                    <div style={{ ...s.speiValue, fontSize:18, color: PLC.navy }}>{fmt(cobroActivo.total)}</div>
                  </div>

                  {pollStatus === 'waiting' && (
                    <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(40,45,101,.05)', borderRadius:8, fontSize:12, color: PLC.muted, textAlign:'center' }}>
                      ⏳ Verificando pago automáticamente cada 10 segundos…
                    </div>
                  )}

                  <div style={{ marginTop:16, fontSize:11, color: PLC.muted, lineHeight:1.6, textAlign:'center' }}>
                    Una vez realizada la transferencia, el sistema la detectará automáticamente.<br/>
                    También puedes cerrar esta ventana — el pago se procesará en segundo plano.
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