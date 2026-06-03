/* views/Productos.jsx v2 */
function Productos({ data, setData, escuela_id }) {
  const { useState } = React;
  const CATS = ['colegiatura','anualidad','inscripcion','examen','uniforme','material','transporte','comedor','extracurricular','beca','otro'];
  const EMPTY = { nombre:'', categoria:'colegiatura', precio:0, emoji:'📚', activo:true };
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState(EMPTY);
  const [q, setQ]         = useState('');

  const lista = data.productos.filter(p =>
    !q || p.nombre.toLowerCase().includes(q.toLowerCase()) || p.categoria.toLowerCase().includes(q.toLowerCase())
  );

  const guardar = () => {
    if (!form.nombre || form.precio === undefined) return;
    let newProductos;
    if (form.id) {
      newProductos = data.productos.map(p => p.id === form.id ? { ...p, ...form } : p);
    } else {
      const nuevo = { ...form, id: AppModel.nextId(data.productos), escuela_id };
      newProductos = [...data.productos, nuevo];
    }
    const newData = { ...data, productos: newProductos };
    setData(newData);
    AppModel.save(newData);
    setModal(null);
    setForm(EMPTY);
  };

  const toggleActivo = id => {
    const newData = { ...data, productos: data.productos.map(p => p.id === id ? { ...p, activo: !p.activo } : p) };
    setData(newData);
    AppModel.save(newData);
  };

  const CAT_LABELS = {
    colegiatura:'Colegiatura', anualidad:'Anualidad', inscripcion:'Inscripción',
    examen:'Examen', uniforme:'Uniforme', material:'Material', transporte:'Transporte',
    comedor:'Comedor', extracurricular:'Extracurricular', beca:'Beca / Descuento', otro:'Otro'
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Conceptos de pago</div>
            <div className="card-sub">{data.productos.filter(p=>p.activo).length} activos</div>
          </div>
          <button className="btn btn-primary" onClick={()=>{setForm(EMPTY);setModal('form');}}>
            + Nuevo concepto
          </button>
        </div>

        <div className="search-bar" style={{marginBottom:16}}>
          <span className="search-icon">🔍</span>
          <input placeholder="Buscar conceptos…" value={q} onChange={e=>setQ(e.target.value)}/>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12}}>
          {lista.length === 0 && (
            <div className="empty-state" style={{gridColumn:'1/-1'}}>
              <div className="empty-icon">💡</div>
              <div className="empty-text">Sin conceptos</div>
              <div className="empty-sub">Crea los conceptos de pago de esta escuela</div>
            </div>
          )}
          {lista.map(p => (
            <div key={p.id} style={{
              background:'var(--glass-light)', border:'1px solid var(--border-glow)',
              borderRadius:'var(--radius)', padding:'14px 16px',
              opacity: p.activo ? 1 : .5, transition:'all .2s'
            }}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <div style={{
                  width:38,height:38,borderRadius:10,
                  background:'var(--accent-glow)',border:'1px solid var(--border-active)',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0
                }}>{p.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.nombre}</div>
                  <div style={{fontSize:11,color:'var(--ink-4)',marginTop:1}}>{CAT_LABELS[p.categoria]||p.categoria}</div>
                </div>
              </div>
              <div style={{
                fontFamily:'var(--mono)',fontSize:p.precio<0?16:18,fontWeight:700,
                color:p.precio<0?'var(--amber)':p.precio===0?'var(--ink-4)':'var(--green)',
                marginBottom:10
              }}>
                {p.precio<0?'-':''}{fmt(Math.abs(p.precio))}
                {p.precio<0 && <span style={{fontSize:12,fontFamily:'var(--font)',color:'var(--ink-4)',marginLeft:4}}>descuento</span>}
              </div>
              <div style={{display:'flex',gap:6}}>
                <button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={()=>{setForm({...p});setModal('form');}}>✏️ Editar</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>toggleActivo(p.id)}>{p.activo?'🔒':'🔓'}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal === 'form' && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{form.id?'Editar':'Nuevo'} concepto</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:12,alignItems:'start',marginBottom:12}}>
                <div className="form-group">
                  <label className="form-label">Emoji</label>
                  <input className="form-input" value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))} style={{width:60,fontSize:22,textAlign:'center'}}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre del concepto *</label>
                  <input className="form-input" placeholder="Ej: Colegiatura Mensual" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <select className="form-select" value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))}>
                    {CATS.map(c=><option key={c} value={c}>{CAT_LABELS[c]||c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Precio (negativo = descuento)</label>
                  <input className="form-input" type="number" placeholder="0.00" value={form.precio}
                    onChange={e=>setForm(f=>({...f,precio:parseFloat(e.target.value)||0}))}
                    style={{fontFamily:'var(--mono)'}}/>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={!form.nombre}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
