/* views/Login.jsx v2 */
function Login({ onLogin }) {
  const { useState } = React;
  const [u, setU]           = useState('');
  const [p, setP]           = useState('');
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);

  const submit = e => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const result = AuthController.login(u, p);
      if (result.ok) onLogin(result.user);
      else { setErr(result.error); setLoading(false); }
    }, 500);
  };

  const demos = [
    { label:'👑 Super Admin',   email:'superadmin@pagalaescuela.mx', pass:'SuperAdmin2026!' },
    { label:'🏛️ Admin ITM',     email:'admin@itm.edu.mx',            pass:'admin123' },
    { label:'🧾 Cajero ITM',    email:'cajero@itm.edu.mx',           pass:'cajero123' },
    { label:'🏫 Admin CEC',     email:'admin@cec.edu.mx',            pass:'admin123' },
    { label:'⚡ Admin EME',     email:'admin@eme.edu.mx',            pass:'admin123' },
  ];

  return (
    <div className="login-screen">
      <div className="login-card" style={{maxWidth:400, width:'100%'}}>
        <div className="login-logo">
          <div style={{fontSize:44, marginBottom:10}}>🎓</div>
          <div className="login-brand">EduPago</div>
          <div className="login-tagline">Sistema de Cobros Escolar · Multi-institución</div>
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="login-label">Correo electrónico</label>
            <input className="login-input" type="email" value={u}
              onChange={e=>{setU(e.target.value);setErr('');}}
              placeholder="usuario@escuela.mx" required autoFocus/>
          </div>
          <div className="form-group">
            <label className="login-label">Contraseña</label>
            <input className="login-input" type="password" value={p}
              onChange={e=>{setP(e.target.value);setErr('');}}
              placeholder="••••••••" required/>
          </div>
          {err && <div className="login-error">⚠ {err}</div>}
          <button className="login-btn" type="submit" disabled={loading}>
            {loading
              ? <><span className="spinner" style={{borderColor:'rgba(255,255,255,.3)',borderTopColor:'#fff',marginRight:8}}></span>Verificando…</>
              : 'Entrar al sistema'}
          </button>
        </form>

        <div style={{marginTop:18}}>
          <div style={{fontSize:11, color:'var(--ink-4)', textAlign:'center', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px'}}>
            Accesos rápidos demo
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
            {demos.map(d => (
              <div key={d.email} className="demo-pill"
                onClick={()=>{setU(d.email);setP(d.pass);setErr('');}}>
                {d.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
