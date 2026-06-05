/* views/PortalFamilia.jsx — Vista exclusiva para padres de familia */
function PortalFamilia({ data, setData, user, escuela }) {
  const { useState, useEffect } = React;

  const [misHijos, setMisHijos] = useState([]);
  const [saldoTotal, setSaldoTotal] = useState(0);
  const [metodo, setMetodo] = useState('SPEI'); // Por defecto SPEI para autogestión
  const [modal, setModal] = useState(null);
  const [cobroActivo, setCobroActivo] = useState(null);
  const [loading, setLoading] = useState(false);

  // 1. Recoger la información automáticamente al cargar
  useEffect(() => {
    if (user.familia_id) {
      // Filtrar alumnos que pertenecen a esta familia
      const hijos = data.clientes.filter(c => c.familia_id === user.familia_id && c.activo);
      // Calcular el saldo pendiente acumulado
      const saldo = hijos.reduce((a, c) => a + (c.saldo_pendiente || 0), 0);
      
      setMisHijos(hijos);
      setSaldoTotal(saldo);
    }
  }, [data, user.familia_id]);

  // 2. Procesar el pago automático (Sin que un cajero intervenga)
  const pagarSaldoTotal = async () => {
    if (saldoTotal <= 0) return;
    setLoading(true);

    // Creamos un concepto dinámico "Pago de Colegiatura / Saldo Pendiente"
    const conceptoTemporal = [{
      id: 'SALDO_GLOBAL',
      nombre: `Liquidación de saldo pendiente - ${user.nombre}`,
      precio: saldoTotal,
      qty: 1,
      emoji: '📚'
    }];

    const escuela_id = escuela?.id ?? 1;
    
    // Iniciamos el flujo usando tu controlador existente
    const { data: newData, cobro } = CobroController.iniciarCobro(data, { 
      carrito: conceptoTemporal, 
      cliente: { nombre: user.nombre, tipo: 'familia', id: user.familia_id }, 
      metodo, 
      escuela_id 
    });

    setCobroActivo(cobro);

    if (metodo === 'SPEI') {
      try {
        // Tu API de CLABE fija vinculada a la referencia/matrícula
        const spei = await CobroController.iniciarSPEI(cobro, escuela);
        const cobrosActualizados = newData.cobros.map(c =>
          c.id === cobro.id ? { ...c, clabe: spei.clabe, banco: spei.banco, referencia_spei: spei.referencia } : c
        );
        const dataConClabe = { ...newData, cobros: cobrosActualizados };
        
        setData(dataConClabe);
        AppModel.save(dataConClabe);
        
        setCobroActivo(prev => ({ ...prev, clabe: spei.clabe, referencia_spei: spei.referencia, banco: spei.banco }));
        setModal('instrucciones_spei');
      } catch (err) {
        alert("Error al generar SPEI: " + err.message);
      }
    } else if (metodo === 'TC') {
      // Generar link de Pagadetodo para que el padre pague en su propia pantalla
      try {
        const liga = await CobroController.iniciarTC(cobro);
        window.location.href = liga.url; // Redirección directa a la pasarela de pago
      } catch (err) {
        alert("Error al conectar con el procesador de tarjetas");
      }
    }
    setLoading(false);
  };

  return (
    <div className="portal-container" style={{ padding: 20 }}>
      {/* Estado de Cuenta Automático */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">👋 ¡Hola! {user.nombre}</div>
          <div className="card-sub">Resumen de cuenta familiar</div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}>
          <div className="stat-card" style={{ background: 'var(--glass-light)' }}>
            <div className="stat-label">Alumnos registrados</div>
            <div className="stat-value">{misHijos.length}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
              {misHijos.map(h => `${h.nombre} (${h.grado})`).join(', ')}
            </div>
          </div>

          <div className="stat-card" style={{ background: saldoTotal > 0 ? 'var(--red-glow)' : 'var(--green-glow)' }}>
            <div className="stat-label">Total a pagar</div>
            <div className="stat-value" style={{ color: saldoTotal > 0 ? 'var(--red)' : 'var(--green)' }}>
              {fmt(saldoTotal)}
            </div>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {saldoTotal > 0 ? '⚠️ Tienes pagos pendientes' : '✓ Al corriente'}
            </div>
          </div>
        </div>
      </div>

      {/* Sección de Pago Express */}
      {saldoTotal > 0 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Pagar en línea ahora mismo</div>
          
          <div className="payment-methods" style={{ marginBottom: 16 }}>
            <div className={`pay-method ${metodo==='SPEI'?'selected':''}`} onClick={()=>setMetodo('SPEI')}>
              <span className="pm-icon">🏦</span> Transferencia SPEI
            </div>
            <div className={`pay-method ${metodo==='TC'?'selected':''}`} onClick={()=>setMetodo('TC')}>
              <span className="pm-icon">💳</span> Tarjeta Crédito / Débito
            </div>
          </div>

          <button className="checkout-btn" onClick={pagarSaldoTotal} disabled={loading}>
            {loading ? 'Procesando...' : `Pagar ${fmt(saldoTotal)}`}
          </button>
        </div>
      )}

      {/* Modal de instrucciones SPEI auto-generado */}
      {modal === 'instrucciones_spei' && cobroActivo && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">🏦 Datos de Transferencia</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, marginBottom: 12 }}>
                Realiza la transferencia desde tu app bancaria. El sistema detectará tu pago automáticamente.
              </p>
              <div className="spei-box" style={{ background: '#1e293b', padding: 16, borderRadius: 8, color: '#fff' }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>CLABE INTERBANCARIA:</div>
                <div style={{ fontFamily: 'monospace', fontSize: 16, margin: '6px 0', letterSpacing: 1 }}>{cobroActivo.clabe}</div>
                <div style={{ fontSize: 12 }}>Banco: <strong>{cobroActivo.banco || 'STP'}</strong></div>
                <div style={{ fontSize: 12 }}>Concepto obligatorio: <strong style={{ color: '#fbbf24' }}>{cobroActivo.referencia_spei}</strong></div>
                <div style={{ fontSize: 14, marginTop: 10, textAlign: 'right' }}>Monto: <strong>{fmt(cobroActivo.total)}</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}