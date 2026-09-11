/* views/MiSuscripcion.jsx — Vista para el admin del colegio: ver su plan y
 * pagar su propia renovación, sin depender del superadmin.
 *
 * Antes solo el superadmin podía generar una liga de renovación (desde
 * Suscripciones.js) y tenía que compartírsela al colegio por fuera del
 * sistema. El backend (escuela_generar_pago_renovacion.php) ya aceptaba el
 * rol 'admin' restringido a su propia escuela — esta vista es lo que
 * faltaba para que ese camino sirviera de algo.
 */
var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};

// PRECIOS DE PRUEBA (10-sep-2026) -- ver el mismo aviso en PLANES_LIMITES
// (api.php). ¡Revertir a 999/1500/3000 antes de dar de alta colegios reales!
const PLANES_INFO_MS = {
  basico:   { label: 'Básico',   precio: 50,  max_alumnos: 400,  max_planteles: 1 },
  avanzado: { label: 'Avanzado', precio: 50, max_alumnos: 800,  max_planteles: 1 },
  pro:      { label: 'Pro',      precio: 50, max_alumnos: null, max_planteles: null },
};

function MiSuscripcion({ escuela, user }) {
  const { useState, useEffect } = React;
  const [generando, setGenerando] = useState(null); // 'TC' | 'Efectivo' | null
  const [resultado, setResultado] = useState(null);  // { metodo, ...datos }
  const [error, setError] = useState(null);

  const fmt = n => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const planKey = (escuela?.plan || '').toLowerCase();
  const info = PLANES_INFO_MS[planKey] || PLANES_INFO_MS.basico;

  const hoy = new Date(new Date().toDateString());
  const vencimiento = escuela?.fecha_vencimiento_plan ? new Date(escuela.fecha_vencimiento_plan + 'T00:00:00') : null;
  const diasVencimiento = vencimiento ? Math.round((vencimiento - hoy) / 86400000) : null;
  const vencida = diasVencimiento !== null && diasVencimiento < 0;
  const porVencer = diasVencimiento !== null && diasVencimiento >= 0 && diasVencimiento <= 7;

  // Modo demo (11-sep-2026, requisito de la junta): mientras la escuela está
  // en prueba, fecha_vencimiento_plan es solo un placeholder de su creación
  // -- no tiene caso mostrarlo como si fuera un vencimiento real. Se muestra
  // en su lugar fecha_fin_prueba y un aviso propio, siempre visible (no solo
  // cuando está por vencer).
  const enDemo = escuela?.modo === 'demo';
  const finPrueba = escuela?.fecha_fin_prueba ? new Date(escuela.fecha_fin_prueba + 'T00:00:00') : null;
  const diasPrueba = finPrueba ? Math.round((finPrueba - hoy) / 86400000) : null;
  const pruebaVencida = diasPrueba !== null && diasPrueba < 0;

  // Antes esta vista solo mostraba la referencia de efectivo justo después
  // de generarla (setResultado dentro de generarPago) — si el admin
  // recargaba la página o volvía después, la referencia seguía vigente en
  // `escuelas.pago_renovacion_*` (el backend ya la reutiliza en vez de
  // pedirle una nueva al proveedor, ver escuela_generar_pago_renovacion.php)
  // pero aquí no se leía de ahí, así que parecía que "no existía". TC no
  // aplica: esa liga no se guarda vencimiento porque es de un solo uso.
  useEffect(() => {
    if (!escuela?.pago_renovacion_referencia || !escuela?.pago_renovacion_vencimiento) return;
    const vencRef = new Date(escuela.pago_renovacion_vencimiento + 'T00:00:00');
    if (vencRef < hoy) return;
    setResultado({
      metodo: 'Efectivo',
      referencia: escuela.pago_renovacion_referencia,
      folio: escuela.pago_renovacion_folio,
      monto: escuela.pago_renovacion_monto,
      barcode_url: escuela.pago_renovacion_barcode_url || escuela.pago_renovacion_payformat_url || null,
      vencimiento: escuela.pago_renovacion_vencimiento,
    });
  }, [escuela?.id, escuela?.pago_renovacion_referencia, escuela?.pago_renovacion_vencimiento]);


  const generarPago = async (metodo) => {
    setGenerando(metodo);
    setError(null);
    setResultado(null);
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=escuela_generar_pago_renovacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ escuela_id: escuela.id, metodo }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo generar el pago');

      if (metodo === 'TC') {
        // A diferencia del superadmin (que comparte la liga con el colegio),
        // aquí quien la genera es quien va a pagar: se abre directo.
        window.open(json.url, '_blank');
      }
      setResultado({ metodo, ...json });
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerando(null);
    }
  };

  const verComprobanteEfectivo = () => {
    if (typeof abrirComprobanteEfectivoModulo !== 'function' || !resultado) return;
    abrirComprobanteEfectivoModulo({
      cobro: {
        folio: resultado.folio || '', total: resultado.monto,
        descripcion: 'Renovación de suscripción — ' + info.label,
        referencia: resultado.referencia, barcode_url: resultado.barcode_url, vencimiento: resultado.vencimiento
      },
      cliente: null, familia: null, escuela
    });
  };

  return _jsxDEV('div', {
    className: 'view-suscripcion',
    children: [
      _jsxDEV('div', {
        className: 'card', style: { marginBottom: 20 },
        children: [
          _jsxDEV('div', {
            className: 'card-header',
            children: _jsxDEV('div', {
              children: [
                _jsxDEV('div', { className: 'card-title', children: 'Mi suscripción' }, 't'),
                _jsxDEV('div', { className: 'card-sub', children: 'Plan y estado de pago de ' + (escuela?.nombre || 'tu colegio') }, 's')
              ]
            }, 'h')
          }, 'ch'),
          _jsxDEV('div', {
            style: { display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' },
            children: [
              _jsxDEV('div', {
                children: [
                  _jsxDEV('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }, children: 'Plan actual' }, 1),
                  _jsxDEV('div', { style: { fontSize: 20, fontWeight: 700 }, children: info.label }, 2),
                  _jsxDEV('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }, children: fmt(info.precio) + ' / mes + IVA' }, 3)
                ]
              }, 'plan'),
              _jsxDEV('div', {
                children: enDemo ? [
                  _jsxDEV('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }, children: 'Prueba gratuita' }, 1),
                  _jsxDEV('div', {
                    style: { fontSize: 20, fontWeight: 700, color: pruebaVencida ? 'var(--red)' : 'var(--accent)' },
                    children: escuela?.fecha_fin_prueba || 'Sin definir'
                  }, 2),
                  _jsxDEV('div', {
                    style: { fontSize: 13, color: pruebaVencida ? 'var(--red)' : 'var(--ink-3)', marginTop: 2 },
                    children: pruebaVencida
                      ? `Tu prueba venció hace ${Math.abs(diasPrueba)} día(s)`
                      : diasPrueba === 0 ? 'Tu prueba vence hoy'
                      : diasPrueba != null ? `Quedan ${diasPrueba} día(s) de prueba` : ''
                  }, 3)
                ] : [
                  _jsxDEV('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }, children: 'Vencimiento' }, 1),
                  _jsxDEV('div', {
                    style: { fontSize: 20, fontWeight: 700, color: vencida ? 'var(--red)' : (porVencer ? 'var(--amber)' : 'var(--ink)') },
                    children: escuela?.fecha_vencimiento_plan || 'Sin definir'
                  }, 2),
                  _jsxDEV('div', {
                    style: { fontSize: 13, color: vencida ? 'var(--red)' : 'var(--ink-3)', marginTop: 2 },
                    children: vencida
                      ? `Venció hace ${Math.abs(diasVencimiento)} día(s)`
                      : diasVencimiento === 0 ? 'Vence hoy'
                      : diasVencimiento != null ? `Vence en ${diasVencimiento} día(s)` : ''
                  }, 3)
                ]
              }, 'venc')
            ]
          }, 'grid'),
          enDemo ? _jsxDEV('div', {
            style: {
              marginTop: 16, padding: '10px 14px', borderRadius: 'var(--radius)',
              background: pruebaVencida ? 'var(--red-glow)' : 'var(--accent-glow)',
              color: pruebaVencida ? 'var(--red)' : 'var(--accent)', fontSize: 13
            },
            children: pruebaVencida
              ? 'Tu periodo de prueba venció. Activa tu suscripción para poder cobrar de verdad a las familias.'
              : 'Estás en modo de prueba: puedes usar todo el sistema, pero ningún cobro se procesa de verdad todavía. Actívate cuando quieras — tu suscripción empieza a correr desde el día en que pagues.'
          }, 'aviso') : (vencida || porVencer) ? _jsxDEV('div', {
            style: {
              marginTop: 16, padding: '10px 14px', borderRadius: 'var(--radius)',
              background: vencida ? 'var(--red-glow)' : 'var(--amber-glow)',
              color: vencida ? 'var(--red)' : 'var(--amber)', fontSize: 13
            },
            children: vencida
              ? 'Tu suscripción está vencida. Renueva para seguir usando Caja, Cobros y Recordatorios.'
              : 'Tu suscripción está por vencer. Renueva para evitar interrupciones.'
          }, 'aviso') : null
        ]
      }, 'card1'),

      _jsxDEV('div', {
        className: 'card',
        children: [
          _jsxDEV('div', {
            className: 'card-header',
            children: _jsxDEV('div', {
              children: [
                _jsxDEV('div', { className: 'card-title', children: 'Renovar suscripción' }, 't'),
                _jsxDEV('div', { className: 'card-sub', children: 'La fecha se extiende sola en cuanto se confirme tu pago — no hace falta avisarle a nadie.' }, 's')
              ]
            }, 'h')
          }, 'ch2'),
          _jsxDEV('div', {
            style: { display: 'flex', gap: 12, flexWrap: 'wrap' },
            children: [
              _jsxDEV('button', {
                className: 'btn btn-primary',
                disabled: generando !== null,
                onClick: () => generarPago('TC'),
                children: generando === 'TC' ? 'Generando…' : `Pagar ${fmt(info.precio)} con tarjeta`
              }, 'btnTC'),
              _jsxDEV('button', {
                className: 'btn btn-secondary',
                disabled: generando !== null,
                onClick: () => generarPago('Efectivo'),
                children: generando === 'Efectivo' ? 'Generando…' : 'Pagar en efectivo (tienda)'
              }, 'btnEfv')
            ]
          }, 'botones'),
          error ? _jsxDEV('div', {
            style: { marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--red-glow)', color: 'var(--red)', fontSize: 13 },
            children: error
          }, 'err') : null,
          (resultado && resultado.metodo === 'TC') ? _jsxDEV('div', {
            style: { marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--green-glow)', color: 'var(--green)', fontSize: 13 },
            children: 'Se abrió la liga de pago en una pestaña nueva. Si no la ves, revisa que tu navegador no haya bloqueado la ventana emergente.'
          }, 'okTC') : null,
          (resultado && resultado.metodo === 'Efectivo') ? _jsxDEV('div', {
            style: { marginTop: 14, padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--glass-light)' },
            children: [
              _jsxDEV('div', {
                style: { fontSize: 13, marginBottom: 8 },
                children: ['Referencia generada: ', _jsxDEV('strong', { style: { fontFamily: 'var(--mono)' }, children: resultado.referencia }, 'ref'), ' — vence el ', resultado.vencimiento]
              }, 'refline'),
              _jsxDEV('button', {
                className: 'btn btn-secondary btn-sm',
                onClick: verComprobanteEfectivo,
                children: 'Ver / imprimir formato de pago'
              }, 'verbtn')
            ]
          }, 'okEfv') : null
        ]
      }, 'card2')
    ]
  }, 'root');
}
