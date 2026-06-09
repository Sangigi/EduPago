/* views/Login.jsx — Pagalaescuela branding · v4 · SVG icons */
function Login({ onLogin }) {
  const { useState } = React;
  const [u, setU]           = useState('');
  const [p, setP]           = useState('');
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = e => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const result = AuthController.login(u, p);
      if (result.ok) onLogin(result.user);
      else { setErr(result.error); setLoading(false); }
    }, 480);
  };

  const demos = AuthController.DEMO_USERS;

  return (
    <div className="login-screen">
      <div style={{width:'100%', maxWidth:420, padding:'0 16px'}}>

        {/* Logo Pagalaescuela */}
        <div style={{textAlign:'center', marginBottom:28}}>
          <img
            src="assets/logo.jpeg"
            alt="paga la escuela"
            style={{
              height:90, maxWidth:280,
              objectFit:'contain',
              borderRadius:14,
              display:'inline-block',
            }}
            onError={e => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'block';
            }}
          />
          {/* Fallback texto */}
          <div style={{display:'none'}}>
            <div style={{
              fontSize:30, fontWeight:800, color:'#f1f5f9',
              letterSpacing:'-1px', lineHeight:1
            }}>paga la escuela</div>
            <div style={{fontSize:12, color:'#bdcf00', marginTop:6, fontWeight:600}}>
              by Libertyfin
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="login-card">

          <div style={{marginBottom:22}}>
            <div style={{fontSize:18, fontWeight:700, color:'var(--ink)', letterSpacing:'-.3px'}}>
              Iniciar sesión
            </div>
            <div style={{fontSize:12.5, color:'var(--ink-3)', marginTop:3}}>
              Sistema de cobros escolar · Multi-institución
            </div>
          </div>

          <form onSubmit={submit}>
            <div className="form-group">
              <label className="login-label">Correo electrónico</label>
              <div style={{position:'relative'}}>
                <Icon name="emails" size={16} color="var(--ink-4)"
                  style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}/>
                <input
                  className="login-input"
                  type="email" value={u} autoFocus required
                  onChange={e => { setU(e.target.value); setErr(''); }}
                  placeholder="usuario@escuela.mx"
                  style={{paddingLeft:38}}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="login-label">Contraseña</label>
              <div style={{position:'relative'}}>
                <Icon name="shield" size={16} color="var(--ink-4)"
                  style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}/>
                <input
                  className="login-input"
                  type={showPass ? 'text' : 'password'}
                  value={p} required
                  onChange={e => { setP(e.target.value); setErr(''); }}
                  placeholder="••••••••"
                  style={{paddingLeft:38, paddingRight:42}}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  style={{
                    position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                    background:'none', border:'none', cursor:'pointer', padding:4,
                    color:'var(--ink-4)', display:'flex', alignItems:'center',
                  }}
                  tabIndex={-1}
                >
                  <Icon name={showPass ? 'eyeOff' : 'eye'} size={17} color="currentColor"/>
                </button>
              </div>
            </div>

            {err && (
              <div style={{
                display:'flex', alignItems:'center', gap:8,
                background:'rgba(239,68,68,.10)', border:'1px solid rgba(239,68,68,.22)',
                borderRadius:'var(--radius-sm)', padding:'9px 12px', marginBottom:14,
              }}>
                <Icon name="warning" size={15} color="#f87171"/>
                <span style={{fontSize:12.5, color:'#f87171'}}>{err}</span>
              </div>
            )}

            <button className="login-btn" type="submit" disabled={loading}
              style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {loading ? (
                <><span className="spinner" style={{borderColor:'rgba(40,45,101,.25)',borderTopColor:'#282d65',width:16,height:16}}></span>Verificando…</>
              ) : (
                <>Entrar al sistema <Icon name="arrowRight" size={16} color="var(--navy)"/></>
              )}
            </button>
          </form>

          {/* Separador */}
          <div style={{display:'flex', alignItems:'center', gap:10, margin:'20px 0 14px'}}>
            <div style={{flex:1, height:1, background:'var(--border-glow)'}}/>
            <span style={{fontSize:10.5, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'.6px', whiteSpace:'nowrap'}}>
              Acceso rápido demo
            </span>
            <div style={{flex:1, height:1, background:'var(--border-glow)'}}/>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6}}>
            {demos.map(d => (
              <div key={d.email} className="demo-pill"
                onClick={() => { setU(d.email); setP(d.pass); setErr(''); }}
              >
                {d.label}
              </div>
            ))}
          </div>
        </div>

        <div style={{textAlign:'center', marginTop:16, fontSize:11, color:'var(--ink-4)'}}>
          © 2026 Pagalaescuela.com · by Libertyfin · Todos los derechos reservados
        </div>
      </div>
    </div>
  );
}
