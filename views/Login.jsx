/* views/Login.jsx — Pagalaescuela branding · v3 */
function Login({ onLogin }) {
  const { useState } = React;
  const [u, setU]         = useState('');
  const [p, setP]         = useState('');
  const [err, setErr]     = useState('');
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

  const PLC = {
    navy:  '#282d65',
    lime:  '#bdcf00',
    green: '#49af54',
  };

  return (
    <div className="login-screen">
      <div style={{width:'100%', maxWidth:400, padding:'0 16px'}}>

        {/* Logo / branding */}
        <div style={{textAlign:'center', marginBottom:28}}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:64, height:64, borderRadius:16,
            background:`linear-gradient(135deg, ${PLC.lime} 0%, ${PLC.green} 100%)`,
            boxShadow:`0 8px 28px rgba(189,207,0,.35)`,
            marginBottom:14,
          }}>
            <span style={{fontSize:30}}>🎓</span>
          </div>
          <div style={{fontSize:30, fontWeight:800, color:'#f1f5f9', letterSpacing:'-1px', lineHeight:1}}>
            EduPago
          </div>
          <div style={{fontSize:12, color:PLC.lime, marginTop:6, fontWeight:600, letterSpacing:'.4px'}}>
            Powered by Pagalaescuela.com
          </div>
        </div>

        {/* Card */}
        <div className="login-card" style={{padding:'32px 30px'}}>
          <form onSubmit={submit}>
            <div className="form-group">
              <label className="login-label">Correo electrónico</label>
              <input
                className="login-input"
                type="email" value={u} autoFocus required
                onChange={e => { setU(e.target.value); setErr(''); }}
                placeholder="usuario@escuela.mx"
              />
            </div>

            <div className="form-group" style={{position:'relative'}}>
              <label className="login-label">Contraseña</label>
              <input
                className="login-input"
                type={showPass ? 'text' : 'password'}
                value={p} required
                onChange={e => { setP(e.target.value); setErr(''); }}
                placeholder="••••••••"
                style={{paddingRight:44}}
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={{
                  position:'absolute', right:12, bottom:11,
                  background:'none', border:'none', cursor:'pointer',
                  fontSize:16, color:'var(--ink-4)', padding:2,
                }}
                tabIndex={-1}
              >{showPass ? '🙈' : '👁️'}</button>
            </div>

            {err && (
              <div style={{
                display:'flex', alignItems:'center', gap:7,
                background:'rgba(239,68,68,.10)', border:'1px solid rgba(239,68,68,.2)',
                borderRadius:'var(--radius-sm)', padding:'9px 12px', marginBottom:12,
              }}>
                <span style={{fontSize:14}}>⚠️</span>
                <span style={{fontSize:12.5, color:'#f87171'}}>{err}</span>
              </div>
            )}

            <button className="login-btn" type="submit" disabled={loading}>
              {loading
                ? <><span className="spinner" style={{borderColor:'rgba(40,45,101,.3)',borderTopColor:PLC.navy,marginRight:8}}></span>Verificando…</>
                : 'Entrar al sistema →'}
            </button>
          </form>

          {/* Separador */}
          <div style={{display:'flex', alignItems:'center', gap:10, margin:'20px 0 14px'}}>
            <div style={{flex:1, height:1, background:'var(--border-glow)'}}/>
            <span style={{fontSize:11, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'.5px'}}>Acceso rápido demo</span>
            <div style={{flex:1, height:1, background:'var(--border-glow)'}}/>
          </div>

          {/* Demo pills — 3 cols */}
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

        {/* Footer */}
        <div style={{textAlign:'center', marginTop:18, fontSize:11, color:'var(--ink-4)'}}>
          © 2026 Pagalaescuela.com · Todos los derechos reservados
        </div>
      </div>
    </div>
  );
}
