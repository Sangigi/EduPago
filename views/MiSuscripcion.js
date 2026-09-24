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
  avanzado: { label: 'Avanzado', precio: 55, max_alumnos: 800,  max_planteles: 1 },
  pro:      { label: 'Pro',      precio: 60, max_alumnos: null, max_planteles: null },
};

function MiSuscripcion({ escuela, user, onIrA }) {
  const { useState, useEffect } = React;
  const [generando, setGenerando] = useState(null); // 'TC' | 'Efectivo' | null
  const [resultado, setResultado] = useState(null);  // { metodo, ...datos }
  const [error, setError] = useState(null);
  // Plan que se va a pagar. Arranca en el que la escuela ya tiene, pero se
  // puede cambiar: antes solo podías pagar por el plan que elegiste al
  // registrarte, y subir o bajar requería pedírselo al superadmin.
  const [planPago, setPlanPago] = useState((escuela?.plan || 'basico').toLowerCase());
  // Si ya se leyó y aceptó la advertencia de documentación pendiente.
  const [asumeEspera, setAsumeEspera] = useState(false);

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
  // Estado de la documentación fiscal (22-sep-2026). `documentacion_estado`
  // lo recalcula revisar_documento_escuela.php a partir del estado real de
  // TODOS los documentos del colegio: sin_enviar | en_revision | aprobada |
  // rechazada. Es lo que decide si el colegio puede cobrar y facturar —
  // distinto de tener la suscripción pagada, que es lo que esta pantalla
  // cobra. Confundir las dos cosas es justo lo que la advertencia evita.
  const docEstado     = escuela?.documentacion_estado || 'sin_enviar';
  const docsListos    = docEstado === 'aprobada';
  const docsEnRevision = docEstado === 'en_revision';
  const docsRechazados = docEstado === 'rechazada';

  const enDemo = escuela?.modo === 'demo';
  const finPrueba = escuela?.fecha_fin_prueba ? new Date(escuela.fecha_fin_prueba + 'T00:00:00') : null;
  const diasPrueba = finPrueba ? Math.round((finPrueba - hoy) / 86400000) : null;
  const pruebaVencida = diasPrueba !== null && diasPrueba < 0;

  // Antes esta vista solo mostraba la referencia de efectivo justo después
  // de generarla (setResultado dentro de generarPago) — si el admin
  // recargaba la página o volvía después, la referencia seguía vigente en
  // `escuelas.pago_renovacion_*` (el backend ya la reutiliza en vez de
  // pedirle una nueva al proveedor, ver escuela_generar_pago_renovacion.php)
  // pero aquí no se leía de ahí, así que parecía que "no existía".
  //
  // El comentario anterior decía que "TC no aplica porque esa liga no guarda
  // vencimiento", y eso era engañoso: la rama de TC SÍ escribe
  // pago_renovacion_referencia, y antes tampoco limpiaba el vencimiento, así
  // que heredaba el de un intento de efectivo previo y esta pantalla pintaba
  // la referencia de la LIGA como si fuera pagable en tienda. El backend ya
  // sostiene la invariante (vencimiento no nulo ⇒ referencia de tienda real
  // emitida por el proveedor); aquí se exige además el código de barras o el
  // formato de pago, que solo existen cuando el proveedor de verdad respondió.
  useEffect(() => {
    if (!escuela?.pago_renovacion_referencia || !escuela?.pago_renovacion_vencimiento) return;
    if (!escuela?.pago_renovacion_barcode_url && !escuela?.pago_renovacion_payformat_url) return;
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
        body: JSON.stringify({ escuela_id: escuela.id, metodo, plan: planPago }),
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
                _jsxDEV('div', { className: 'card-sub', children: 'La fecha se actualizará automáticamente una vez confirmado tu pago. No necesitas realizar ninguna acción adicional.' }, 's')
              ]
            }, 'h')
          }, 'ch2'),
          /* ── Advertencia: documentación pendiente ──
             No bloquea el pago, informa. La suscripción se activa con el pago,
             pero cobrar y facturar depende de la revisión de documentos, y esa
             tarda. Callarlo significaría que el colegio pague y descubra
             después que no puede usar lo que pagó. */
          (docsListos ? null : _jsxDEV('div', {
            style: {
              marginBottom: 16, padding: '13px 15px', lineHeight: 1.55, fontSize: 12.5,
              background: 'var(--amber-glow)', border: '1px solid var(--amber)',
              borderRadius: 'var(--radius-sm)', color: 'var(--ink-2)'
            },
            children: [
              _jsxDEV('div', {
                style: { fontWeight: 800, color: 'var(--amber)', marginBottom: 6, fontSize: 13 },
                children: docsEnRevision
                  ? 'Tus documentos están en revisión'
                  : (docsRechazados ? 'Tus documentos fueron rechazados' : 'Antes de pagar: falta tu documentación')
              }, 't'),
              _jsxDEV('div', {
                children: docsEnRevision
                  ? 'Ya recibimos tus documentos y los estamos revisando. La revisión tarda entre 48 y 72 horas hábiles. Hasta que termine, tu colegio no puede cobrar ni facturar.'
                  : (docsRechazados
                      ? 'Hay al menos un documento rechazado. Revisa cuál y vuelve a subirlo desde Mi cuenta; mientras tanto, tu colegio no puede cobrar ni facturar.'
                      : 'Tu suscripción se activa en cuanto se confirme el pago, pero para que tu colegio pueda cobrar a las familias y facturar hace falta que subas los documentos fiscales y completes el formulario de datos de pago.')
              }, 'd1'),
              _jsxDEV('div', {
                style: { marginTop: 8 },
                children: 'Te recomendamos hacer eso primero. La aprobación tarda entre 48 y 72 horas hábiles, y esos días corren contra tu suscripción: si pagas ahora, es muy probable que pierdas varios días pagados sin poder usarlos todavía para cobrar.'
              }, 'd2'),
              _jsxDEV('div', {
                style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' },
                children: [
                  (typeof onIrA === 'function' ? _jsxDEV('button', {
                    className: 'btn btn-primary btn-sm',
                    onClick: () => onIrA('mi_cuenta'),
                    children: 'Ir a subir documentos'
                  }, 'ir') : null),
                  _jsxDEV('label', {
                    style: { display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12 },
                    children: [
                      _jsxDEV('input', {
                        type: 'checkbox',
                        checked: asumeEspera,
                        onChange: e => setAsumeEspera(e.target.checked)
                      }, 'chk'),
                      'Entiendo y quiero pagar de todos modos'
                    ]
                  }, 'lab')
                ]
              }, 'acc')
            ]
          }, 'advDocs')),
          /* ── Selector de plan ── */
          _jsxDEV('div', {
            style: { marginBottom: 16 },
            children: [
              _jsxDEV('div', {
                style: { fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 },
                children: '¿Con qué plan quieres renovar?'
              }, 'lbl'),
              _jsxDEV('div', {
                style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 },
                children: Object.keys(PLANES_INFO_MS).map(k => {
                  const p = PLANES_INFO_MS[k];
                  const sel = planPago === k;
                  const actual = k === planKey;
                  return _jsxDEV('button', {
                    type: 'button',
                    onClick: () => setPlanPago(k),
                    style: {
                      textAlign: 'left', cursor: 'pointer', padding: '12px 14px',
                      borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font)',
                      border: '2px solid ' + (sel ? 'var(--accent)' : 'var(--border-glow)'),
                      background: sel ? 'var(--accent-glow)' : 'var(--bg-surface)',
                      color: 'var(--ink)'
                    },
                    children: [
                      _jsxDEV('div', {
                        style: { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13.5 },
                        children: [
                          p.label,
                          actual ? _jsxDEV('span', {
                            style: {
                              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                              background: 'var(--glass-light)', color: 'var(--ink-3)'
                            },
                            children: 'actual'
                          }, 'a') : null
                        ]
                      }, 'n'),
                      _jsxDEV('div', {
                        style: { fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 18, marginTop: 4 },
                        children: fmt(p.precio)
                      }, 'p'),
                      _jsxDEV('div', {
                        style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 },
                        children: (p.max_alumnos ? `Hasta ${p.max_alumnos} alumnos` : 'Alumnos ilimitados')
                                  + ' · ' + (p.max_planteles ? `${p.max_planteles} plantel` : 'Planteles ilimitados')
                      }, 'd')
                    ]
                  }, k, true);
                })
              }, 'grid'),
              planPago !== planKey ? _jsxDEV('div', {
                style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.5 },
                children: `Estás eligiendo un plan distinto al actual (${info.label}). El cambio se aplica cuando se confirme el pago, no antes.`
              }, 'cambio') : null
            ]
          }, 'planes'),

          _jsxDEV('div', {
            style: { display: 'flex', gap: 12, flexWrap: 'wrap' },
            children: [
              _jsxDEV('button', {
                className: 'btn btn-primary',
                // Con documentación pendiente, el pago se habilita solo después
                // de marcar la casilla: obliga a que la advertencia se lea, sin
                // llegar a prohibir el pago a quien de verdad lo quiere hacer.
                disabled: generando !== null || (!docsListos && !asumeEspera),
                onClick: () => generarPago('TC'),
                children: generando === 'TC' ? 'Generando…' : `Pagar ${fmt(PLANES_INFO_MS[planPago]?.precio ?? info.precio)} con tarjeta`
              }, 'btnTC'),
              _jsxDEV('button', {
                className: 'btn btn-secondary',
                disabled: generando !== null || (!docsListos && !asumeEspera),
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
