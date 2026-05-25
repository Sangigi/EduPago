/* views/Login.jsx */
function Login({ onLogin }) {
  const { useState } = React;
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
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

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <div style={{fontSize:40, marginBottom:10}}>🎓</div>
          <div className="login-brand">EduPago</div>
          <div className="login-tagline">Sistema de Cobros Escolar</div>
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
            {loading ? <><span className="spinner" style={{borderColor:'rgba(255,255,255,.3)',borderTopColor:'#fff',marginRight:8}}></span>Verificando…</> : 'Entrar al sistema'}
          </button>
        </form>

        <div className="login-demo">
          <div className="demo-pill" onClick={()=>{setU('admin@escuela.mx');setP('admin123');setErr('');}}>
            👤 Admin demo
          </div>
          <div className="demo-pill" onClick={()=>{setU('cajero@escuela.mx');setP('cajero123');setErr('');}}>
            🧾 Cajero demo
          </div>
        </div>
        <p style={{fontSize:11,color:'var(--ink-4)',textAlign:'center',marginTop:14}}>
          Haz clic en los accesos rápidos para demo
        </p>
      </div>
    </div>
  );
}
