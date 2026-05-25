/* views/Emails.jsx */
function Emails({ data, setData }) {
  const { useState } = React;
  const TIPOS = [
    {id:'comprobante', label:'Comprobante de pago', icon:'✅'},
    {id:'recordatorio', label:'Recordatorio de pago', icon:'⏰'},
    {id:'bienvenida', label:'Bienvenida a EduPago', icon:'👋'},
  ];
  const EMPTY = { para:'', asunto:'', cuerpo:'', tipo:'comprobante' };
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('enviados'); // enviados | recibidos

  const pendientes = data.cobros.filter(c=>c.estado==='pendiente');
  const enviados = data.emails.filter(e=>e.tipo==='enviado');
  const recibidos = data.emails.filter(e=>e.tipo==='recibido');

  const enviar = () => {
    if (!form.para || !form.asunto) return;
    setSending(true);
    setTimeout(()=>{
      const email = {
        id: AppModel.nextId(data.emails),
        tipo: 'enviado',
        asunto: form.asunto,
        para: form.para,
        fecha: new Date().toISOString().slice(0,10),
        estado: 'entregado',
      };
      const newData = { ...data, emails: [...data.emails, email] };
      setData(newData);
      AppModel.save(newData);
      setSending(false);
      setModal(false);
      setForm(EMPTY);
    }, 1800);
  };

  const marcarLeido = id => {
    const newData = { ...data, emails: data.emails.map(e=>e.id===id?{...e,leido:true}:e) };
    setData(newData);
    AppModel.save(newData);
  };

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:20}}>
        {/* Panel izquierdo: inbox */}
        <div className="card">
          <div className="card-header">
            <div style={{display:'flex',gap:8}}>
              {[['enviados','📤 Enviados'],['recibidos','📥 Recibidos']].map(([k,l])=>(
                <button key={k} className={`btn ${tab===k?'btn-primary':'btn-secondary'} btn-sm`} onClick={()=>setTab(k)}>{l}</button>
              ))}
            </div>
            <button className="btn btn-primary btn-sm" onClick={()=>{setForm(EMPTY);setModal(true);}}>+ Nuevo correo</button>
          </div>

          {tab==='enviados' && (
            <div>
              {enviados.length === 0 && <div className="empty-state"><div className="empty-icon">📤</div><div className="empty-text">Sin correos enviados</div></div>}
              {[...enviados].reverse().map(e=>(
                <div key={e.id} style={{padding:'12px 0',borderBottom:'1px solid var(--glass-light)',display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:36,height:36,background:'var(--accent-glow)',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>✉</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.asunto}</div>
                    <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:2}}>Para: {e.para} · {fmtDate(e.fecha)}</div>
                  </div>
                  <span className="badge badge-green">{e.estado}</span>
                </div>
              ))}
            </div>
          )}

          {tab==='recibidos' && (
            <div>
              {recibidos.length === 0 && <div className="empty-state"><div className="empty-icon">📥</div><div className="empty-text">Sin correos recibidos</div></div>}
              {[...recibidos].reverse().map(e=>(
                <div key={e.id} onClick={()=>marcarLeido(e.id)}
                  style={{padding:'12px 0',borderBottom:'1px solid var(--glass-light)',display:'flex',alignItems:'center',gap:12,cursor:'pointer',
                    opacity:e.leido?.85:1}}>
                  <div style={{width:36,height:36,background:e.leido?'var(--glass-light)':'var(--accent-glow)',borderRadius:'var(--radius-sm)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
                    {e.leido?'📭':'📬'}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:e.leido?400:600,color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.asunto}</div>
                    <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:2}}>De: {e.de} · {fmtDate(e.fecha)}</div>
                  </div>
                  {!e.leido && <div style={{width:8,height:8,background:'var(--accent)',borderRadius:'50%',flexShrink:0}}></div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel derecho: recordatorios rápidos */}
        <div>
          <div className="card" style={{marginBottom:16}}>
            <div className="card-header">
              <div className="card-title">Cobros pendientes</div>
            </div>
            {pendientes.length === 0 && <div className="empty-state"><div className="empty-text">Sin pendientes 🎉</div></div>}
            {pendientes.map(c=>(
              <div key={c.id} style={{padding:'8px 0',borderBottom:'1px solid var(--glass-light)'}}>
                <div style={{fontSize:12.5,fontWeight:500,color:'var(--ink)'}}>{c.cliente}</div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
                  <span style={{fontSize:11.5,color:'var(--ink-3)'}}>{c.folio} · {c.metodo}</span>
                  <span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--amber)',fontWeight:600}}>{fmt(c.total)}</span>
                </div>
                <button className="btn btn-secondary btn-sm" style={{width:'100%',marginTop:6}} onClick={()=>{
                  const cli = data.clientes.find(cl=>cl.id===c.cliente_id);
                  setForm({
                    para: cli?.email||'',
                    asunto: `Recordatorio de pago — ${c.folio}`,
                    cuerpo: `Estimado/a ${c.cliente}, le recordamos que tiene un cobro pendiente por ${fmt(c.total)} (${c.folio}).`,
                    tipo: 'recordatorio',
                  });
                  setModal(true);
                }}>
                  ⏰ Enviar recordatorio
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal nuevo correo */}
      {modal && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">✉ Nuevo correo</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',gap:8,marginBottom:16}}>
                {TIPOS.map(t=>(
                  <button key={t.id} className={`btn ${form.tipo===t.id?'btn-primary':'btn-secondary'} btn-sm`}
                    onClick={()=>setForm(f=>({...f,tipo:t.id}))}>{t.icon} {t.label}</button>
                ))}
              </div>
              <div className="form-group">
                <label className="form-label">Para *</label>
                <input className="form-input" type="email" placeholder="correo@ejemplo.com" value={form.para} onChange={e=>setForm(f=>({...f,para:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Asunto *</label>
                <input className="form-input" placeholder="Asunto del correo" value={form.asunto} onChange={e=>setForm(f=>({...f,asunto:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Mensaje</label>
                <textarea className="form-input" rows={5} placeholder="Escribe el mensaje…" value={form.cuerpo}
                  onChange={e=>setForm(f=>({...f,cuerpo:e.target.value}))} style={{resize:'vertical'}}/>
              </div>
              {sending && (
                <div className="verif-row">
                  <span className="spinner" style={{borderTopColor:'var(--accent)'}}></span>
                  <span style={{fontSize:12.5}}>Enviando correo…</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(false)} disabled={sending}>Cancelar</button>
              <button className="btn btn-primary" onClick={enviar} disabled={sending||!form.para||!form.asunto}>
                {sending?<><span className="spinner"></span> Enviando…</>:'📤 Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
