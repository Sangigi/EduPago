/* views/Productos.jsx */
function Productos({ data, setData }) {
  const { useState } = React;
  const EMOJIS = ['📚','🎯','🏆','✏️','👕','📖','🚌','🍽️','🖊️','🎒','🏫','💻','🎨','⚽'];
  const CATEGORIAS = ['colegiatura','anualidad','inscripcion','uniforme','material','transporte','comedor','beca','otro'];
  const EMPTY = { nombre:'', categoria:'colegiatura', precio:'', descripcion:'', emoji:'📚' };
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const guardar = () => {
    if (!form.nombre || form.precio === '') return;
    const prod = { ...form, precio: parseFloat(form.precio) };
    let newData;
    if (form.id) {
      newData = ProductoController.editar(data, prod);
    } else {
      newData = ProductoController.agregar(data, prod);
    }
    setData(newData);
    AppModel.save(newData);
    setModal(null);
    setForm(EMPTY);
  };

  const toggle = id => {
    const newData = ProductoController.toggleActivo(data, id);
    setData(newData);
    AppModel.save(newData);
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Conceptos de cobro</div>
            <div className="card-sub">{data.productos.filter(p=>p.activo).length} activos</div>
          </div>
          <button className="btn btn-primary" onClick={()=>{setForm(EMPTY);setModal('form');}}>+ Nuevo concepto</button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:14}}>
          {data.productos.map(p=>(
            <div key={p.id} className="card" style={{padding:16,opacity:p.activo?1:.5,transition:'opacity .2s'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:10}}>
                <div style={{fontSize:28}}>{p.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13.5,fontWeight:600,color:'var(--ink)',lineHeight:1.3}}>{p.nombre}</div>
                  <span className={`badge ${p.precio<0?'badge-green':'badge-blue'}`} style={{marginTop:4}}>{p.categoria}</span>
                </div>
              </div>
              <div style={{fontSize:22,fontWeight:800,fontFamily:'var(--mono)',color:p.precio<0?'var(--green)':'var(--accent)',marginBottom:6}}>
                {fmt(p.precio)}
              </div>
              <div style={{fontSize:12,color:'var(--ink-3)',marginBottom:12,lineHeight:1.4}}>{p.descripcion}</div>
              <div style={{display:'flex',gap:6}}>
                <button className="btn btn-secondary btn-sm" style={{flex:1}} onClick={()=>{setForm({...p,precio:String(p.precio)});setModal('form');}}>✏️ Editar</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>toggle(p.id)}>{p.activo?'🔒':'🔓'}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal==='form' && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{form.id?'Editar':'Nuevo'} concepto</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Emoji / Ícono</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {EMOJIS.map(e=>(
                    <div key={e} onClick={()=>setForm(f=>({...f,emoji:e}))}
                      style={{fontSize:22,padding:'4px 6px',borderRadius:6,cursor:'pointer',
                        background:form.emoji===e?'var(--accent-glow)':'var(--glass-light)',
                        border:`1px solid ${form.emoji===e?'var(--accent)':'var(--border-glow)'}`}}>
                      {e}
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Nombre del concepto *</label>
                <input className="form-input" placeholder="Ej: Colegiatura Mensual" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <select className="form-select" value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))}>
                    {CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Precio (MXN) *</label>
                  <input className="form-input" type="number" placeholder="2800" value={form.precio} onChange={e=>setForm(f=>({...f,precio:e.target.value}))} style={{fontFamily:'var(--mono)'}}/>
                  <div style={{fontSize:11,color:'var(--ink-3)',marginTop:3}}>Usa negativos para descuentos</div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input className="form-input" placeholder="Descripción breve" value={form.descripcion} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={!form.nombre||form.precio===''}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
