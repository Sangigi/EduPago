var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
/* views/PortalFamilia.jsx — Portal para padres · v4 · SVG icons · logo real */
function PortalFamilia({
  data,
  setData,
  user,
  escuela,
  onLogout
}) {
  const {
    useState,
    useEffect,
    useRef
  } = React;
  const [misHijos, setMisHijos] = useState([]);
  const [misCobros, setMisCobros] = useState([]);
  const [saldoTotal, setSaldoTotal] = useState(0);
  const [metodo, setMetodo] = useState('SPEI');
  // Consentimiento explícito para domiciliar la tarjeta (Cargo Automático).
  // Desde que generar_liga.php migró a PLE_URL_LIGA_TOKEN, CUALQUIER pago con
  // tarjeta que apruebe el proveedor devuelve un token y lo guarda — sin este
  // checkbox el padre de familia nunca decidía si quería eso, quedaba
  // domiciliado de forma implícita solo por pagar. Se resetea a false cada
  // vez que se cambia de alumno o de método para no arrastrar el consentimiento
  // de un pago anterior a uno nuevo.
  const [autorizoCargoAutomatico, setAutorizoCargoAutomatico] = useState(false);
  // El pago siempre es de UN alumno a la vez (un cobro necesita un cliente_id
  // real de `clientes`; antes se mandaba el saldo combinado de la familia con
  // el id de `familias` como cliente_id, lo que nunca actualizaba el saldo del
  // alumno correcto — o corrompía el de uno ajeno con el mismo id numérico).
  const [hijoPagoId, setHijoPagoId] = useState(null);
  const [speiBloqueoFamilia, setSpeiBloqueoFamilia] = useState(null);
  const [modal, setModal] = useState(null);
  const [cobroActivo, setCobroActivo] = useState(null);
  const [loading, setLoading] = useState(false);
  // Id del cobro para el que se está generando la referencia de efectivo
  // desde el Historial (pago pendiente). Antes solo existía el flujo de
  // Efectivo desde Caja — el padre no tenía forma de pagar en efectivo un
  // cobro pendiente sin llamar a la escuela.
  const [generandoEfvId, setGenerandoEfvId] = useState(null);
  const [tab, setTab] = useState('inicio');
  // Ficha técnica que se está viendo: { registro, tipo }
  const [ficha, setFicha] = useState(null);

  // Para ALUMNO, la foto ya se subió como archivo real vía
  // subir_foto_cliente.php (llamado desde dentro de FichaTecnica) antes de
  // invocar esto — aquí solo se sincroniza el estado local, sin volver a
  // escribir en el servidor. Para TUTOR sigue siendo un enlace externo, así
  // que aquí sí se hace el POST a editar_familia como antes.
  const guardarFotoFicha = async (url) => {
    const f = ficha;
    if (!f) return { success: false, error: 'Sin selección' };
    const esAlumno = f.tipo !== 'tutor';
    if (esAlumno) {
      setFicha(prev => prev ? { ...prev, registro: { ...prev.registro, foto_url: url } } : prev);
      setMisHijos(prev => prev.map(h => h.id === f.registro.id ? { ...h, foto_url: url } : h));
      return { success: true };
    }
    try {
      const res = await fetch('api.php?action=editar_familia', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + AuthController.getToken()
        },
        body: JSON.stringify({ id: f.registro.id, foto_url: url })
      });
      const json = await res.json();
      if (json && json.success !== false) {
        setFicha(prev => prev ? { ...prev, registro: { ...prev.registro, foto_url: url } } : prev);
      }
      return json;
    } catch (e) {
      return { success: false, error: 'Error de conexión: ' + e.message };
    }
  };

  // Tema del portal: 'claro', 'oscuro' o 'auto' (sigue al sistema).
  // Se guarda con la misma llave que el resto de la plataforma, así la
  // preferencia es una sola en todo el sistema.
  const [modoTema, setModoTema] = useState(() => {
    try {
      const g = localStorage.getItem('edupago_theme');
      if (g === 'dark') return 'oscuro';
      if (g === 'light') return 'claro';
    } catch (e) { /* storage bloqueado */ }
    return 'auto';
  });

  const sistemaPrefiereOscuro = () => {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) { return false; }
  };

  const temaOscuro = modoTema === 'oscuro' || (modoTema === 'auto' && sistemaPrefiereOscuro());

  useEffect(() => {
    const aplicar = () => {
      const oscuro = modoTema === 'oscuro' || (modoTema === 'auto' && sistemaPrefiereOscuro());
      document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : '');
    };
    aplicar();
    try {
      if (modoTema === 'auto') localStorage.removeItem('edupago_theme');
      else localStorage.setItem('edupago_theme', modoTema === 'oscuro' ? 'dark' : 'light');
    } catch (e) { /* storage bloqueado */ }

    // En modo automático hay que reaccionar si el sistema cambia mientras
    // la página está abierta (por ejemplo al anochecer en el teléfono).
    if (modoTema !== 'auto') return;
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) { mq.addEventListener('change', aplicar); return () => mq.removeEventListener('change', aplicar); }
      if (mq.addListener) { mq.addListener(aplicar); return () => mq.removeListener(aplicar); }
    } catch (e) { /* navegador sin soporte */ }
  }, [modoTema]);

  // El botón de la barra alterna entre claro y oscuro de forma explícita
  const alternarTema = () => setModoTema(temaOscuro ? 'claro' : 'oscuro');
  const [copied, setCopied] = useState('');
  const [pollStatus, setPollStatus] = useState(null);
  const pollRef = useRef(null);
  const [editandoHijoId, setEditandoHijoId] = useState(null);

  // ── Facturas ──
  const [descargandoFactura, setDescargandoFactura] = useState(null);

  // ── Paginación: cobros pendientes en Inicio (por hijo) e Historial ──
  const PEND_POR_PAGINA = 5;
  const HIST_POR_PAGINA = 10;
  const [paginaPends, setPaginaPends] = useState({}); // { [hijoId]: numeroPagina }
  const totalPaginasHistorial = Math.max(1, Math.ceil(misCobros.length / HIST_POR_PAGINA));
  const { pagina: paginaHistorial, setPagina: setPaginaHistorial, irAPagina: irAPaginaHistorial } = usePaginaActual(totalPaginasHistorial);

  // ── Configuración: datos fiscales de la familia (del tutor que paga, no ──
  // ── de cada hijo — un solo RFC/razón social por familia, no uno por hijo) ──
  const [editandoFiscal, setEditandoFiscal] = useState(false);
  const [formFiscal, setFormFiscal] = useState({});
  const [guardandoFiscal, setGuardandoFiscal] = useState(false);
  const [errorFiscal, setErrorFiscal] = useState('');

  // ── Configuración: tarjeta guardada ──
  const [eliminandoTarjetaId, setEliminandoTarjetaId] = useState(null);

  // ── Configuración: cambiar contraseña ──
  const [formPass, setFormPass] = useState({ actual: '', nueva: '', confirmar: '' });
  const [guardandoPass, setGuardandoPass] = useState(false);
  const [errorPass, setErrorPass] = useState('');
  const [okPass, setOkPass] = useState('');

  // ── Configuración: mis datos (tutor de la cuenta) ──
  const [editandoMisDatos, setEditandoMisDatos] = useState(false);
  const [formMisDatos, setFormMisDatos] = useState({ nombre: '', email: '', telefono: '', contacto: '' });
  const [guardandoMisDatos, setGuardandoMisDatos] = useState(false);
  const [errorMisDatos, setErrorMisDatos] = useState('');
  const [okMisDatos, setOkMisDatos] = useState('');
  const [userOverride, setUserOverride] = useState(null);
  const userEfectivo = userOverride ? { ...user, ...userOverride } : user;
  const miFamilia = data.familias?.find(f => f.id === user.familia_id) || null;
  // Antes estas cuatro opciones de pago siempre aparecian, sin importar si
  // el superadmin las habia apagado (globalmente o para esta escuela). El
  // apagado real ya se valida tambien en el backend; esto es lo que evita
  // que la familia ni siquiera vea la opcion.
  const metodosApagadosFamilia = escuela?.metodos_pago_deshabilitados || [];

  const REGIMENES_SAT = [
    { value: '', label: 'Sin especificar' },
    { value: '605', label: '605 - Sueldos y salarios' },
    { value: '606', label: '606 - Arrendamiento' },
    { value: '608', label: '608 - Demás ingresos' },
    { value: '612', label: '612 - Personas físicas con actividad empresarial' },
    { value: '616', label: '616 - Sin obligaciones fiscales' },
    { value: '621', label: '621 - Incorporación fiscal' },
  ];
  const USOS_CFDI = [
    { value: '', label: 'Sin especificar' },
    { value: 'G03', label: 'G03 - Gastos en general' },
    { value: 'D10', label: 'D10 - Pagos por servicios educativos (colegiaturas)' },
    { value: 'S01', label: 'S01 - Sin efectos fiscales' },
  ];

  const abrirFiscal = () => {
    setEditandoFiscal(true);
    setErrorFiscal('');
    setFormFiscal({
      rfc_factura: miFamilia?.rfc_factura || '',
      razon_social_factura: miFamilia?.razon_social_factura || '',
      cp_factura: miFamilia?.cp_factura || '',
      domicilio_factura: miFamilia?.domicilio_factura || '',
      regimen_factura: miFamilia?.regimen_factura || '',
      uso_cfdi_defecto: miFamilia?.uso_cfdi_defecto || '',
    });
  };

  const guardarFiscal = async () => {
    if (!user.familia_id) { setErrorFiscal('Tu cuenta no está ligada a una familia.'); return; }
    setGuardandoFiscal(true);
    setErrorFiscal('');
    try {
      const res = await fetch('api.php?action=editar_familia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + user.token },
        body: JSON.stringify({ id: user.familia_id, ...formFiscal }),
      });
      const json = await res.json();
      if (!json.success) {
        setErrorFiscal(json.error || 'No se pudo guardar');
        setGuardandoFiscal(false);
        return;
      }
      setData({ ...data, familias: data.familias.map(f => f.id === user.familia_id ? { ...f, ...json.familia } : f) });
      setEditandoFiscal(false);
    } catch (e) {
      setErrorFiscal('Error de conexión: ' + e.message);
    }
    setGuardandoFiscal(false);
  };

  const abrirMisDatos = () => {
    setEditandoMisDatos(true);
    setErrorMisDatos('');
    setOkMisDatos('');
    setFormMisDatos({
      nombre: userEfectivo.nombre || '',
      email: userEfectivo.email || '',
      telefono: miFamilia?.telefono || '',
      contacto: miFamilia?.contacto || '',
    });
  };

  const guardarMisDatos = async () => {
    setGuardandoMisDatos(true);
    setErrorMisDatos('');
    setOkMisDatos('');
    try {
      const resUsuario = await fetch('api.php?action=editar_usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + user.token },
        body: JSON.stringify({ id: user.id, nombre: formMisDatos.nombre, email: formMisDatos.email }),
      });
      const jsonUsuario = await resUsuario.json();
      if (!jsonUsuario.success) {
        setErrorMisDatos(jsonUsuario.error || 'No se pudo guardar tu perfil');
        setGuardandoMisDatos(false);
        return;
      }
      setUserOverride(prev => ({ ...prev, nombre: jsonUsuario.usuario.nombre, email: jsonUsuario.usuario.email }));
      if (user.familia_id) {
        const resFamilia = await fetch('api.php?action=editar_familia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + user.token },
          body: JSON.stringify({ id: user.familia_id, telefono: formMisDatos.telefono, contacto: formMisDatos.contacto }),
        });
        const jsonFamilia = await resFamilia.json();
        if (!jsonFamilia.success) {
          setErrorMisDatos(jsonFamilia.error || 'Se guardó tu perfil, pero no el teléfono de contacto');
          setGuardandoMisDatos(false);
          return;
        }
        setData({ ...data, familias: data.familias.map(f => f.id === user.familia_id ? { ...f, ...jsonFamilia.familia } : f) });
      }
      setOkMisDatos('Datos guardados');
      setEditandoMisDatos(false);
    } catch (e) {
      setErrorMisDatos('Error de conexión: ' + e.message);
    }
    setGuardandoMisDatos(false);
  };

  const eliminarTarjeta = async hijoId => {
    if (!confirm('¿Eliminar la tarjeta guardada de este alumno? Tendrás que capturarla de nuevo en el próximo pago con tarjeta.')) return;
    setEliminandoTarjetaId(hijoId);
    try {
      // cancelar_cai (no eliminar_tarjeta_guardada) — este sí le avisa al
      // proveedor que cancele la domiciliación real de la tarjeta; el otro
      // solo borraba el token de la BD local, dejando la tarjeta viva del
      // lado de Cobroscontarjeta.com aunque aquí ya dijera "cancelada".
      const res = await fetch('api.php?action=cancelar_cai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + user.token },
        body: JSON.stringify({ cliente_id: hijoId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo eliminar');
      setData({ ...data, clientes: data.clientes.map(c => c.id === hijoId ? { ...c, token_tarjeta: null, token_tarjeta_estado: 'cancelado' } : c) });
    } catch (e) {
      alert('No se pudo eliminar la tarjeta: ' + e.message);
    }
    setEliminandoTarjetaId(null);
  };

  const cambiarPassword = async () => {
    setErrorPass(''); setOkPass('');
    if (formPass.nueva !== formPass.confirmar) {
      setErrorPass('La nueva contraseña y su confirmación no coinciden.');
      return;
    }
    if (formPass.nueva.length < 8) {
      setErrorPass('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setGuardandoPass(true);
    try {
      const res = await fetch('api.php?action=cambiar_password_propio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + user.token },
        body: JSON.stringify({ password_actual: formPass.actual, password_nueva: formPass.nueva }),
      });
      const json = await res.json();
      if (!json.success) {
        setErrorPass(json.error || 'No se pudo cambiar la contraseña');
        setGuardandoPass(false);
        return;
      }
      setOkPass('Contraseña actualizada correctamente.');
      setFormPass({ actual: '', nueva: '', confirmar: '' });
    } catch (e) {
      setErrorPass('Error de conexión: ' + e.message);
    }
    setGuardandoPass(false);
  };

  const descargarFactura = async (cobro, tipo) => {
    setDescargandoFactura(cobro.id + '-' + tipo);
    try {
      const params = new URLSearchParams({ action: 'descargar_cfdi', cobro_id: cobro.id, tipo });
      const res = await fetch('api.php?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + user.token },
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('application/json')) {
        const json = await res.json().catch(() => null);
        alert('No se pudo descargar: ' + (json?.error || 'Error desconocido'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factura-${cobro.folio || cobro.id}.${tipo}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error de conexión al descargar: ' + e.message);
    }
    setDescargandoFactura(null);
  };
  const [formEditHijo, setFormEditHijo] = useState({});
  const [guardandoHijo, setGuardandoHijo] = useState(false);
  const [errorEditHijo, setErrorEditHijo] = useState('');

  const abrirEdicionHijo = hijo => {
    setEditandoHijoId(hijo.id);
    setErrorEditHijo('');
    setFormEditHijo({
      telefono: hijo.tel || '',
      email: hijo.email || '',
      direccion: hijo.direccion || '',
      contacto_emergencia: hijo.contacto_emergencia || '',
      tel_emergencia: hijo.tel_emergencia || '',
    });
  };

  const guardarEdicionHijo = async hijoId => {
    setGuardandoHijo(true);
    setErrorEditHijo('');
    try {
      const res = await fetch('api.php?action=editar_cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + user.token },
        body: JSON.stringify({ id: hijoId, ...formEditHijo }),
      });
      const json = await res.json();
      if (!json.success) {
        setErrorEditHijo(json.error || 'No se pudo guardar');
        setGuardandoHijo(false);
        return;
      }
      const nuevaData = {
        ...data,
        clientes: data.clientes.map(c => c.id === hijoId ? { ...c, ...json.cliente } : c),
      };
      setData(nuevaData);
      setEditandoHijoId(null);
    } catch (e) {
      setErrorEditHijo('Error de conexión: ' + e.message);
    }
    setGuardandoHijo(false);
  };
  // Antes esta paleta estaba hardcodeada, por eso el portal quedaba fuera del
  // rediseño y del modo oscuro. Ahora apunta a los tokens del CSS: cambia sola
  // con el tema y con la marca.
  const PLC = {
    navy: 'var(--violet)',
    navyDk: 'var(--violet-dark)',
    lime: 'var(--cyan)',
    limeDk: 'var(--violet-dark)',
    green: 'var(--green)',
    white: '#ffffff',
    bg: 'var(--bg-main)',
    card: 'var(--bg-surface)',
    border: 'var(--border-glow)',
    text: 'var(--ink)',
    muted: 'var(--ink-3)',
    red: 'var(--red)'
  };
  useEffect(() => {
    if (user.familia_id) {
      const hijos = data.clientes.filter(c => c.familia_id === user.familia_id && c.activo);
      const ids = hijos.map(h => h.id);
      const cobros = data.cobros.filter(c => ids.includes(c.cliente_id));
      const saldo = hijos.reduce((a, c) => a + (c.saldo_pendiente || 0), 0);
      setMisHijos(hijos);
      setMisCobros(cobros);
      setSaldoTotal(saldo);
    }
  }, [data, user.familia_id]);
  const copiar = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };
  // Ya no se crea un cobro sintético para SPEI (ver pagarSaldo), así que no
  // hay un cobro_id que verificar — en su lugar se revisa directamente si el
  // saldo_pendiente REAL del alumno bajó desde que se abrió el modal.
  const iniciarPollingSaldo = (clienteId, saldoAlAbrir) => {
    setPollStatus('waiting');
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const token = AuthController.getToken ? AuthController.getToken() : '';
        const r = await fetch('api.php?action=verificar_saldo_alumno', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' },
          body: JSON.stringify({ cliente_id: clienteId }),
        });
        const json = await r.json();
        if (json.success && json.saldo_pendiente < saldoAlAbrir - 0.01) {
          clearInterval(pollRef.current);
          setPollStatus('confirmed');
          setData(prev => ({
            ...prev,
            clientes: prev.clientes.map(c => c.id === clienteId ? { ...c, saldo_pendiente: json.saldo_pendiente } : c),
          }));
        }
      } catch (_) {}
    }, 10000);
  };
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);
  const hijosConSaldo = misHijos.filter(h => h.saldo_pendiente > 0);
  const hijoSeleccionado = hijosConSaldo.find(h => h.id === hijoPagoId) || hijosConSaldo[0] || null;
  // Si el método quedó en "Tarjeta guardada" y luego se cambia de alumno a
  // uno sin tarjeta domiciliada activa, no dejar el formulario atorado en un
  // método que ya no aplica para él.
  useEffect(() => {
    if (metodo === 'CAI' && hijoSeleccionado?.token_tarjeta_estado !== 'activo') setMetodo('SPEI');
  }, [hijoSeleccionado?.id]);

  // Cargo directo con la tarjeta ya domiciliada del alumno (CAI) — a
  // diferencia de TC, es una respuesta síncrona del proveedor: no hay
  // ninguna liga que abrir ni tarjeta que volver a capturar, y no hace
  // falta el checkbox de autorización (esa tarjeta ya se autorizó en un
  // pago anterior).
  const cobrarConTarjetaGuardada = async () => {
    if (!hijoSeleccionado) return;
    const cobrosPendientesHijo = misCobros.filter(c => c.cliente_id === hijoSeleccionado.id && c.estado === 'pendiente');
    if (cobrosPendientesHijo.length !== 1) {
      setSpeiBloqueoFamilia(cobrosPendientesHijo.length === 0
        ? 'No se encontró el cobro pendiente de este alumno. Recarga la página e intenta de nuevo.'
        : `${hijoSeleccionado.nombre} tiene ${cobrosPendientesHijo.length} conceptos pendientes por separado. Con la tarjeta guardada solo se puede cobrar uno a la vez — usa SPEI para pagarlos juntos.`);
      return;
    }
    setLoading(true);
    setSpeiBloqueoFamilia(null);
    try {
      const cobro = { ...cobrosPendientesHijo[0], _cliente_id: hijoSeleccionado.id };
      const res = await CobroController.cobrarCAI(cobro);
      const token = AuthController.getToken ? AuthController.getToken() : '';
      const rSaldo = await fetch('api.php?action=verificar_saldo_alumno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ cliente_id: hijoSeleccionado.id }),
      });
      const jSaldo = await rSaldo.json().catch(() => ({}));
      setData(prev => ({
        ...prev,
        clientes: prev.clientes.map(c => c.id === hijoSeleccionado.id
          ? { ...c, saldo_pendiente: jSaldo.success ? jSaldo.saldo_pendiente : Math.max(0, (c.saldo_pendiente || 0) - cobro.total) }
          : c),
        cobros: prev.cobros.map(c => c.id === cobro.id ? { ...c, estado: 'pagado', metodo: 'TC', auth_code: res.autorizacion || '' } : c),
      }));
      setModal(null);
      alert(`Pago aplicado con tu tarjeta guardada. Autorización: ${res.autorizacion || ''}`);
    } catch (err) {
      setSpeiBloqueoFamilia('No se pudo cobrar con la tarjeta guardada: ' + err.message + ' Puedes intentar pagando con otra tarjeta.');
    }
    setLoading(false);
  };

  const pagarSaldo = async () => {
    if (!hijoSeleccionado || hijoSeleccionado.saldo_pendiente <= 0) return;
    if (!escuela?.id) { alert('No se pudo determinar tu escuela. Recarga la página e intenta de nuevo.'); return; }
    setSpeiBloqueoFamilia(null);

    if (metodo === 'SPEI') {
      const tieneClabe = hijoSeleccionado.clabe_individual && hijoSeleccionado.clabe_individual_estado === 'activa';
      if (!tieneClabe) {
        setSpeiBloqueoFamilia(`${hijoSeleccionado.nombre} no tiene una CLABE SPEI activa asignada. Pídele al colegio que te asigne una, o paga con tarjeta.`);
        return;
      }
      // SPEI ya NO crea ningún cobro nuevo: la CLABE del alumno es fija y
      // pago_clabe.php cobra automáticamente TODO lo que esté realmente
      // pendiente en cuanto llega la transferencia. Antes se creaba aquí un
      // cobro sintético "Liquidación de saldo" cada vez que se abría este
      // modal, usando el saldo que tuviera el navegador en ese momento — si
      // ese saldo ya estaba desactualizado (ej. justo después de haberse
      // pagado, antes de que la pantalla se refrescara), el resultado era
      // cobrar la misma deuda dos veces.
      setLoading(true);
      try {
        const spei = await CobroController.iniciarSPEI({ referencia: '' }, escuela, hijoSeleccionado);
        const cobroFinal = {
          cliente: hijoSeleccionado.nombre,
          total: hijoSeleccionado.saldo_pendiente,
          clabe: spei.clabe,
          banco: spei.banco,
          referencia_spei: spei.referencia,
          clabe_es_individual: !!spei.esIndividual,
        };
        setCobroActivo(cobroFinal);
        setModal('spei');
        iniciarPollingSaldo(hijoSeleccionado.id, hijoSeleccionado.saldo_pendiente);
      } catch (err) {
        alert('Error al generar instrucciones SPEI: ' + err.message);
      }
      setLoading(false);
      return;
    }

    // Efectivo (OXXO / tiendas participantes) y Tarjeta comparten la misma
    // limitacion real: generar_referencia_efectivo.php y generar_liga.php
    // exigen un folio de UN cobro pendiente ya existente. Antes, si el
    // alumno tenia mas de un concepto pendiente por separado, estos dos
    // metodos simplemente se negaban a pagar y mandaban al padre a "usa
    // SPEI" o a pagar uno por uno desde Historial.
    //
    // Ahora, con mas de un concepto, se agrupan en un solo pago (mismo
    // monto sumado, un solo cargo/referencia) usando
    // iniciar_pago_agrupado.php -- al confirmarse, TODOS los cobros del
    // grupo se marcan pagados a la vez. Con exactamente un concepto
    // pendiente, se sigue usando el camino de un solo cobro de siempre
    // (mas simple, y es el caso mas comun).
    if (metodo === 'Efectivo' || metodo === 'TC') {
      // El checkbox (y su exigencia) solo aplica si CAI sigue disponible
      // para esta escuela — si está apagado, no hay nada que autorizar.
      if (metodo === 'TC' && !metodosApagadosFamilia.includes('CAI') && !autorizoCargoAutomatico) {
        setSpeiBloqueoFamilia('Debes autorizar el Cargo Automático para pagar con tarjeta.');
        return;
      }
      if (metodo === 'TC' && hijoSeleccionado.saldo_pendiente > 15000) {
        setSpeiBloqueoFamilia(`El pago con tarjeta tiene un máximo de $15,000.00 por transacción. El adeudo de ${hijoSeleccionado.nombre} es mayor — paga por SPEI, o pide al colegio que lo divida en pagos parciales.`);
        return;
      }

      const cobrosPendientesHijo = misCobros.filter(c => c.cliente_id === hijoSeleccionado.id && c.estado === 'pendiente');
      if (cobrosPendientesHijo.length === 0) {
        setSpeiBloqueoFamilia('No se encontró el cobro pendiente de este alumno. Recarga la página e intenta de nuevo.');
        return;
      }

      setLoading(true);
      try {
        if (cobrosPendientesHijo.length === 1) {
          if (metodo === 'Efectivo') {
            const cobroPendiente = cobrosPendientesHijo[0];
            const ref = await CobroController.iniciarEfectivoRef({
              folio: cobroPendiente.folio, total: cobroPendiente.total,
              descripcion: cobroPendiente.items?.map(i => i.nombre).join(', ') || 'Pago escolar'
            });
            setData(prev => ({
              ...prev,
              cobros: prev.cobros.map(c => c.id === cobroPendiente.id
                ? { ...c, referencia: ref.referencia, ref_barcode_url: ref.barcode_url, ref_vencimiento: ref.vencimiento }
                : c)
            }));
            const cliente = (data.clientes || []).find(c => c.id === hijoSeleccionado.id) || { nombre: hijoSeleccionado.nombre };
            abrirComprobanteEfectivoModulo({
              cobro: {
                folio: cobroPendiente.folio, total: cobroPendiente.total,
                descripcion: cobroPendiente.items?.map(i => i.nombre).join(', '),
                referencia: ref.referencia, barcode_url: ref.barcode_url, vencimiento: ref.vencimiento
              },
              cliente, familia: miFamilia, escuela
            });
          } else {
            const liga = await CobroController.iniciarTC(cobrosPendientesHijo[0]);
            window.location.href = liga.url;
          }
        } else {
          const token = AuthController.getToken ? AuthController.getToken() : '';
          const res = await fetch('api.php?action=iniciar_pago_agrupado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' },
            body: JSON.stringify({
              cliente_id: hijoSeleccionado.id,
              cobro_ids: cobrosPendientesHijo.map(c => c.id),
              metodo: metodo === 'Efectivo' ? 'EfectivoRef' : 'TC',
            }),
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error || 'No se pudo generar el pago agrupado');

          if (metodo === 'TC') {
            window.location.href = json.url;
          } else {
            const cliente = (data.clientes || []).find(c => c.id === hijoSeleccionado.id) || { nombre: hijoSeleccionado.nombre };
            const desglose = cobrosPendientesHijo.map(c => (c.items?.map(i => i.nombre).join(', ') || c.folio) + ' — ' + fmt(c.total)).join('; ');
            abrirComprobanteEfectivoModulo({
              cobro: {
                folio: json.folio, total: json.total,
                descripcion: `Pago agrupado (${json.conceptos} conceptos): ${desglose}`,
                referencia: json.referencia, barcode_url: json.barcode_url, vencimiento: json.vencimiento
              },
              cliente, familia: miFamilia, escuela
            });
          }
        }
      } catch (err) {
        if (metodo === 'TC') alert('No se pudo iniciar el pago con tarjeta: ' + err.message);
        else setSpeiBloqueoFamilia('No se pudo generar el formato de pago: ' + err.message);
      }
      setLoading(false);
      return;
    }

    setLoading(false);
  };

  /* ─── helpers de estilo ─── */
  const card = (extra = {}) => ({
    background: PLC.card,
    borderRadius: 14,
    border: `1px solid ${PLC.border}`,
    boxShadow: '0 2px 12px rgba(40,45,101,.06)',
    marginBottom: 18,
    overflow: 'hidden',
    ...extra
  });
  const fieldBox = (highlight = false) => ({
    background: highlight ? `rgba(189,207,0,.09)` : `rgba(40,45,101,.04)`,
    border: `1px solid ${PLC.border}`,
    borderRadius: 9,
    padding: '10px 14px',
    marginBottom: 10
  });
  const badgeStyle = ok => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: ok ? 'rgba(73,175,84,.12)' : 'rgba(239,68,68,.09)',
    color: ok ? PLC.green : PLC.red
  });
  const tabBtn = (id, label, iconName) => {
    const active = tab === id;
    return _jsxDEV("button", {
      onClick: () => setTab(id),
      className: "pill" + (active ? " active" : ""),
      style: { display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0 },
      children: [
        _jsxDEV(Icon, { name: iconName, size: 14, color: "currentColor" }, void 0, false),
        label
      ]
    }, id, true);
  };
  const cobrosHijo = id => misCobros.filter(c => c.cliente_id === id);
  const pendientesHj = id => cobrosHijo(id).filter(c => c.estado === 'pendiente');
  // Serie de pagos por mes para la mini gráfica de la portada
  const seriePagos = (() => {
    const meses = [];
    const base = new Date();
    for (let k = 5; k >= 0; k--) {
      const d = new Date(base.getFullYear(), base.getMonth() - k, 1);
      meses.push({
        clave: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
        label: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][d.getMonth()],
        valor: 0
      });
    }
    //hui
    const idx = {};
    meses.forEach((m, i) => { idx[m.clave] = i; });
    misCobros.forEach(c => {
      if (c.estado !== 'pagado') return;
      const k = (c.fecha || '').slice(0, 7);
      if (idx[k] !== undefined) meses[idx[k]].valor += Number(c.total) || 0;
    });
    return meses;
  })();

  return _jsxDEV("div", {
    className: 'pf-root',
    style: {
      // body tiene overflow:hidden y #root altura fija, así que el portal
      // necesita ser su propio contenedor con scroll.
      height: '100vh',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: 'var(--bg-main)',
      fontFamily: "'DM Sans',system-ui,sans-serif",
      color: 'var(--ink)'
    },
    children: [
      // ── Barra superior: clara y ligera, no una banda sólida de color ──
      _jsxDEV("div", {
        className: 'pf-header',
        style: {
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-glow)',
          padding: '0 clamp(16px,4vw,32px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 14, height: 68, position: 'sticky', top: 0, zIndex: 100
        },
        children: [
          _jsxDEV("div", {
            style: { display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 },
            children: [
              _jsxDEV("img", {
                src: "assets/logo.jpeg",
                alt: "Paga la Escuela",
                style: {
                  height: 36, width: 'auto', maxWidth: 120, flexShrink: 0,
                  borderRadius: 8, objectFit: 'contain', objectPosition: 'left center',
                  display: 'block'
                },
                onError: e => { e.target.style.display = 'none'; }
              }, void 0, false),
              _jsxDEV("div", {
                style: { minWidth: 0 },
                children: [
                  _jsxDEV("div", {
                    style: { fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', lineHeight: 1.15,
                             whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                    children: "Paga la Escuela"
                  }, void 0, false),
                  _jsxDEV("div", {
                    style: { fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.2 },
                    children: "Portal familiar"
                  }, void 0, false)
                ]
              }, void 0, true)
            ]
          }, void 0, true),

          _jsxDEV("div", {
            className: 'pf-header-actions',
            style: { display: 'flex', alignItems: 'center', gap: 10 },
            children: [
              escuela && _jsxDEV("span", {
                className: "badge badge-blue",
                style: { textTransform: 'none', fontWeight: 600 },
                children: escuela.nombre
              }, void 0, false),

              // Cambio de tema: se guarda en el navegador y se conserva al volver
              _jsxDEV("button", {
                className: "theme-toggle",
                title: temaOscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
                aria: 'Cambiar tema',
                onClick: alternarTema,
                children: _jsxDEV(Icon, {
                  name: temaOscuro ? 'sun' : 'moon', size: 16, color: "currentColor"
                }, void 0, false)
              }, void 0, false),

              _jsxDEV("div", {
                className: 'pf-header-user',
                style: { display: 'flex', alignItems: 'center', gap: 9 },
                children: [
                  _jsxDEV("div", {
                    style: { textAlign: 'right', lineHeight: 1.2 },
                    children: [
                      _jsxDEV("div", {
                        className: 'pf-header-user-name',
                        style: { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
                        children: user.nombre
                      }, void 0, false),
                      _jsxDEV("div", {
                        className: 'pf-header-user-sub',
                        style: { fontSize: 11, color: 'var(--ink-3)' },
                        children: "Familia"
                      }, void 0, false)
                    ]
                  }, void 0, true),
                  _jsxDEV("div", {
                    style: {
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--grad-cool)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13
                    },
                    children: (user.nombre || '?').trim().charAt(0).toUpperCase()
                  }, void 0, false)
                ]
              }, void 0, true),

              _jsxDEV("button", {
                className: "btn-ghost",
                title: "Cerrar sesión",
                onClick: onLogout,
                style: { color: 'var(--ink-3)' },
                children: _jsxDEV(Icon, { name: 'logout', size: 17, color: "currentColor" }, void 0, false)
              }, void 0, false)
            ]
          }, void 0, true)
        ]
      }, void 0, true),

      // ── Cuerpo ──
      _jsxDEV("div", {
        className: 'pf-body',
        style: { maxWidth: 1120, margin: '0 auto', padding: 'clamp(18px,3vw,30px)' },
        children: [

          _jsxDEV("div", {
            className: "section-title",
            style: { marginBottom: 4 },
            children: ["Hola, ", (user.nombre || '').split(' ')[0]]
          }, void 0, true),
          _jsxDEV("div", {
            style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 },
            children: saldoTotal > 0
              ? 'Tienes pagos pendientes por revisar.'
              : 'Estás al corriente con todos los pagos.'
          }, void 0, false),

          // ── Métricas con la jerarquía del video ──
          _jsxDEV("div", {
            className: "stats-grid",
            children: [
              _jsxDEV("div", {
                className: "stat-card" + (saldoTotal > 0 ? " is-featured" : ""),
                children: [
                  _jsxDEV("div", { className: "stat-icon" + (saldoTotal > 0 ? "" : " tint-green"),
                    children: _jsxDEV(Icon, { name: 'pay', size: 19, color: "currentColor" }, void 0, false) }, void 0, false),
                  _jsxDEV("div", { className: "stat-value", children: fmt(saldoTotal) }, void 0, false),
                  _jsxDEV("div", { className: "stat-label", children: "Saldo pendiente" }, void 0, false),
                  _jsxDEV("div", { className: "stat-meta",
                    children: saldoTotal > 0
                      ? misCobros.filter(c => c.estado === 'pendiente').length + ' cobros por pagar'
                      : 'Sin adeudos' }, void 0, false),
                  (saldoTotal > 0 && seriePagos.some(m => m.valor > 0) && typeof Sparkline !== 'undefined')
                    ? _jsxDEV("div", { className: "stat-spark", style: { color: '#fff', opacity: .9 },
                        children: _jsxDEV(Sparkline, { datos: seriePagos.map(m => m.valor), alto: 32, color: '#fff' }, void 0, false) }, void 0, false)
                    : null
                ]
              }, 'saldo', true),

              _jsxDEV("div", {
                className: "stat-card",
                children: [
                  _jsxDEV("div", { className: "stat-icon tint-cyan",
                    children: _jsxDEV(Icon, { name: 'alumnos', size: 19, color: "currentColor" }, void 0, false) }, void 0, false),
                  _jsxDEV("div", { className: "stat-value", children: misHijos.length }, void 0, false),
                  _jsxDEV("div", { className: "stat-label", children: "Alumnos" }, void 0, false),
                  _jsxDEV("div", { className: "stat-meta",
                    children: misHijos.map(h => (h.nombre || '').split(' ')[0]).join(' · ') || '—' }, void 0, false)
                ]
              }, 'hijos', true),

              _jsxDEV("div", {
                className: "stat-card",
                children: [
                  _jsxDEV("div", { className: "stat-icon tint-green",
                    children: _jsxDEV(Icon, { name: 'check', size: 19, color: "currentColor" }, void 0, false) }, void 0, false),
                  _jsxDEV("div", { className: "stat-value",
                    children: fmt(misCobros.filter(c => c.estado === 'pagado').reduce((a, c) => a + (Number(c.total) || 0), 0)) }, void 0, false),
                  _jsxDEV("div", { className: "stat-label", children: "Pagado histórico" }, void 0, false),
                  _jsxDEV("div", { className: "stat-meta",
                    children: misCobros.filter(c => c.estado === 'pagado').length + ' pagos realizados' }, void 0, false)
                ]
              }, 'pagado', true),

              _jsxDEV("div", {
                className: "stat-card",
                children: [
                  _jsxDEV("div", { className: "stat-icon tint-magenta",
                    children: _jsxDEV(Icon, { name: 'cobros', size: 19, color: "currentColor" }, void 0, false) }, void 0, false),
                  _jsxDEV("div", { className: "stat-value", children: misCobros.length }, void 0, false),
                  _jsxDEV("div", { className: "stat-label", children: "Cobros totales" }, void 0, false),
                  _jsxDEV("div", { className: "stat-meta", children: "Historial completo" }, void 0, false)
                ]
              }, 'cobros', true)
            ]
          }, void 0, true),

          // ── Pestañas en píldora ──
          _jsxDEV("div", {
            className: 'pf-tabs pill-group',
            style: { marginBottom: 22, flexWrap: 'nowrap' },
            children: [
              tabBtn('inicio', 'Inicio', 'home'),
              tabBtn('hijos', 'Mis hijos', 'alumnos'),
              tabBtn('historial', 'Historial', 'history'),
              tabBtn('pagar', 'Pagar en línea', 'card'),
              tabBtn('facturas', 'Facturas', 'facturacion2'),
              tabBtn('config', 'Configuración', 'settings')
            ]
          }, void 0, true),
          tab === 'inicio' && _jsxDEV("div", {
        children: [saldoTotal > 0 && _jsxDEV("div", {
          style: {
            ...card(),
            border: '2px solid #5d1e1e',
            // Tinte rojo muy tenue sobre la superficie de la tarjeta, para que
            // el aviso se lea igual en tema claro y en oscuro.
            backgroundImage: 'linear-gradient(135deg,rgba(255,0,0,.08),rgba(57,20,20,.05))'
          },
          children: _jsxDEV("div", {
            style: {
              padding: '18px 22px',
              display: 'flex',
              alignItems: 'center',
              gap: 16
            },
            children: [_jsxDEV("div", {
              style: {
                width: 50,
                height: 50,
                borderRadius: 12,
                flexShrink: 0,
                background: 'linear-gradient(135deg, #ff0000, #391414)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              },
              children: _jsxDEV(Icon, {
                name: "bell",
                size: 22,
                color: "#fff"
              }, void 0, false)
            }, void 0, false), _jsxDEV("div", {
              style: {
                flex: 1
              },
              children: [_jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 15,
                  color: PLC.text,
                  marginBottom: 3
                },
                children: ["Tienes ", fmt(saldoTotal), " pendiente de pago"]
              }, void 0, true), _jsxDEV("div", {
                style: {
                  fontSize: 13,
                  color: PLC.muted
                },
                children: "Paga con transferencia SPEI o tarjeta de crédito/débito de forma segura."
              }, void 0, false)]
            }, void 0, true), _jsxDEV("button", {
              onClick: () => setTab('pagar'),
              style: {
                flexShrink: 0,
                padding: '10px 18px',
                borderRadius: 9,
                border: 'none',
                background: `linear-gradient(135deg,${PLC.navy},${PLC.navyDk})`,
                color: PLC.white,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 7
              },
              children: ["Pagar ahora ", _jsxDEV(Icon, {
                name: "arrowRight",
                size: 15,
                color: PLC.white
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true)
        }, void 0, false), misHijos.map(hijo => {
          const pends = pendientesHj(hijo.id);
          const pagPends = paginaPends[hijo.id] || 1;
          const totalPagPends = Math.max(1, Math.ceil(pends.length / PEND_POR_PAGINA));
          const pendsVisibles = pends.slice((pagPends - 1) * PEND_POR_PAGINA, pagPends * PEND_POR_PAGINA);
          return _jsxDEV("div", {
            style: card(),
            children: [_jsxDEV("div", {
              style: {
                padding: '16px 20px',
                borderBottom: `1px solid ${PLC.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 13
              },
              children: [_jsxDEV("div", {
                style: {
                  width: 44,
                  height: 44,
                  borderRadius: 11,
                  flexShrink: 0,
                  background: `rgba(40,45,101,.08)`,
                  border: `2px solid rgba(40,45,101,.12)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                },
                children: _jsxDEV(Icon, {
                  name: "alumnos",
                  size: 20,
                  color: PLC.navy
                }, void 0, false)
              }, void 0, false), _jsxDEV("div", {
                style: {
                  flex: 1
                },
                children: [_jsxDEV("div", {
                  style: {
                    fontWeight: 700,
                    fontSize: 14,
                    color: PLC.text
                  },
                  children: hijo.nombre
                }, void 0, false), _jsxDEV("div", {
                  style: {
                    fontSize: 12,
                    color: PLC.muted
                  },
                  children: [hijo.grado, " · Mat: ", _jsxDEV("code", {
                    style: {
                      fontSize: 11
                    },
                    children: hijo.matricula || '—'
                  }, void 0, false)]
                }, void 0, true)]
              }, void 0, true), _jsxDEV("div", {
                style: badgeStyle(hijo.saldo_pendiente === 0),
                children: [_jsxDEV(Icon, {
                  name: hijo.saldo_pendiente === 0 ? 'check' : 'warning',
                  size: 11,
                  color: "currentColor"
                }, void 0, false), hijo.saldo_pendiente === 0 ? 'Al corriente' : fmt(hijo.saldo_pendiente)]
              }, void 0, true)]
            }, void 0, true), pends.length > 0 && _jsxDEV("div", {
              style: {
                padding: '14px 20px'
              },
              children: [_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: PLC.muted,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: .4,
                  marginBottom: 10
                },
                children: "Cobros pendientes"
              }, void 0, false), pendsVisibles.map(cob => _jsxDEV("div", {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  marginBottom: 6,
                  background: 'rgba(40,45,101,.04)',
                  border: `1px solid ${PLC.border}`
                },
                children: [_jsxDEV(Icon, {
                  name: "cobros",
                  size: 16,
                  color: PLC.muted
                }, void 0, false), _jsxDEV("div", {
                  style: {
                    flex: 1
                  },
                  children: [_jsxDEV("div", {
                    style: {
                      fontSize: 13,
                      fontWeight: 500,
                      color: PLC.text
                    },
                    children: cob.items?.map(i => i.nombre).join(', ')
                  }, void 0, false), _jsxDEV("div", {
                    style: {
                      fontSize: 11,
                      color: PLC.muted,
                      marginTop: 2
                    },
                    children: ["Folio: ", _jsxDEV("code", {
                      style: {
                        fontSize: 11
                      },
                      children: cob.folio
                    }, void 0, false), " · ", cob.fecha]
                  }, void 0, true)]
                }, void 0, true), _jsxDEV("div", {
                  style: {
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: PLC.navy,
                    fontSize: 14
                  },
                  children: fmt(cob.total)
                }, void 0, false)]
              }, cob.id, true)), totalPagPends > 1 && _jsxDEV("div", {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 10,
                  marginTop: 8,
                  fontSize: 11.5,
                  color: PLC.muted
                },
                children: [_jsxDEV("span", {
                  children: `Pagina ${pagPends} de ${totalPagPends}`
                }, void 0, false), _jsxDEV("button", {
                  disabled: pagPends <= 1,
                  onClick: () => setPaginaPends(p => ({ ...p, [hijo.id]: pagPends - 1 })),
                  style: {
                    padding: '4px 10px', borderRadius: 7, border: `1px solid ${PLC.border}`,
                    background: PLC.card, color: PLC.navy, fontSize: 11.5, cursor: pagPends <= 1 ? 'default' : 'pointer',
                    opacity: pagPends <= 1 ? .5 : 1
                  },
                  children: "‹ Anterior"
                }, void 0, false), _jsxDEV("button", {
                  disabled: pagPends >= totalPagPends,
                  onClick: () => setPaginaPends(p => ({ ...p, [hijo.id]: pagPends + 1 })),
                  style: {
                    padding: '4px 10px', borderRadius: 7, border: `1px solid ${PLC.border}`,
                    background: PLC.card, color: PLC.navy, fontSize: 11.5, cursor: pagPends >= totalPagPends ? 'default' : 'pointer',
                    opacity: pagPends >= totalPagPends ? .5 : 1
                  },
                  children: "Siguiente ›"
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true)]
          }, hijo.id, true);
        }), misHijos.length === 0 && _jsxDEV("div", {
          style: {
            ...card(),
            padding: 40,
            textAlign: 'center'
          },
          children: [_jsxDEV(Icon, {
            name: "escuelas",
            size: 44,
            color: PLC.muted,
            style: {
              margin: '0 auto 14px',
              opacity: .4
            }
          }, void 0, false), _jsxDEV("div", {
            style: {
              fontSize: 15,
              fontWeight: 600,
              color: PLC.text,
              marginBottom: 6
            },
            children: "Sin alumnos asignados"
          }, void 0, false), _jsxDEV("div", {
            style: {
              fontSize: 13,
              color: PLC.muted
            },
            children: "Comunícate con la administración de tu escuela."
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), tab === 'hijos' && _jsxDEV("div", {
        children: misHijos.map(hijo => _jsxDEV("div", {
          style: { ...card(), cursor: 'pointer' },
          title: 'Ver ficha técnica',
          onClick: e => {
            if (e.target.closest('button, a, input, select, label')) return;
            setFicha({ registro: hijo, tipo: 'alumno' });
          },
          children: [_jsxDEV("div", {
            style: {
              padding: '16px 20px',
              borderBottom: `1px solid ${PLC.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              background: `rgba(40,45,101,.03)`
            },
            children: [_jsxDEV("div", {
              style: {
                width: 50,
                height: 50,
                borderRadius: 12,
                flexShrink: 0,
                background: `linear-gradient(135deg,${PLC.navy},${PLC.navyDk})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              },
              children: _jsxDEV(Icon, {
                name: "alumnos",
                size: 22,
                color: PLC.white
              }, void 0, false)
            }, void 0, false), _jsxDEV("div", {
              style: {
                flex: 1
              },
              children: [_jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 15,
                  color: PLC.text
                },
                children: hijo.nombre
              }, void 0, false), _jsxDEV("div", {
                style: {
                  fontSize: 12,
                  color: PLC.muted,
                  marginTop: 2
                },
                children: hijo.grado
              }, void 0, false)]
            }, void 0, true), _jsxDEV("div", {
              style: badgeStyle(hijo.saldo_pendiente === 0),
              children: [_jsxDEV(Icon, {
                name: hijo.saldo_pendiente === 0 ? 'check' : 'warning',
                size: 11,
                color: "currentColor"
              }, void 0, false), hijo.saldo_pendiente === 0 ? 'Al corriente' : fmt(hijo.saldo_pendiente)]
            }, void 0, true)]
          }, void 0, true), _jsxDEV("div", {
            style: {
              padding: '16px 20px'
            },
            children: [_jsxDEV("div", {
              style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
                gap: 10
              },
              children: [{
                l: 'Matrícula',
                v: hijo.matricula || '—',
                mono: true
              }, {
                l: 'CURP',
                v: hijo.curp || '—',
                mono: true
              }, {
                l: 'CLABE SPEI',
                v: hijo.clabe_individual || 'Sin asignar',
                mono: true
              }, {
                l: 'Correo',
                v: hijo.email || '—'
              }, {
                l: 'Teléfono',
                v: hijo.tel || '—',
                mono: true
              }, {
                l: 'Saldo pendiente',
                v: fmt(hijo.saldo_pendiente),
                color: hijo.saldo_pendiente > 0 ? PLC.red : PLC.green
              }, {
                l: 'Cobros totales',
                v: cobrosHijo(hijo.id).length + ' cobros'
              }].map(row => _jsxDEV("div", {
                style: {
                  padding: '10px 12px',
                  background: 'rgba(40,45,101,.03)',
                  borderRadius: 8,
                  border: `1px solid ${PLC.border}`
                },
                children: [_jsxDEV("div", {
                  style: {
                    fontSize: 10.5,
                    color: PLC.muted,
                    marginBottom: 3,
                    textTransform: 'uppercase',
                    letterSpacing: .4
                  },
                  children: row.l
                }, void 0, false), _jsxDEV("div", {
                  style: {
                    fontSize: 13,
                    fontWeight: 500,
                    color: row.color || PLC.text,
                    fontFamily: row.mono ? 'monospace' : 'inherit',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word'
                  },
                  children: row.v
                }, void 0, false)]
              }, row.l, true))
            }, void 0, false), editandoHijoId === hijo.id ? _jsxDEV("div", {
              style: { marginTop: 12, padding: 12, background: 'rgba(40,45,101,.03)', borderRadius: 8, border: `1px solid ${PLC.border}` },
              children: [
                _jsxDEV("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: PLC.text }, children: "Editar datos de contacto" }, void 0, false),
                _jsxDEV("div", { className: "pf-grid-2", style: { gap: 8, marginBottom: 8 },
                  children: [
                    _jsxDEV("input", { className: "form-input", placeholder: "Teléfono", value: formEditHijo.telefono, onChange: e => setFormEditHijo(f => ({ ...f, telefono: e.target.value })) }, void 0, false),
                    _jsxDEV("input", { className: "form-input", placeholder: "Correo", type: "email", value: formEditHijo.email, onChange: e => setFormEditHijo(f => ({ ...f, email: e.target.value })) }, void 0, false),
                  ]
                }, void 0, true),
                _jsxDEV("input", { className: "form-input", placeholder: "Dirección del alumno", value: formEditHijo.direccion, onChange: e => setFormEditHijo(f => ({ ...f, direccion: e.target.value })), style: { marginBottom: 8, width: '100%' } }, void 0, false),
                _jsxDEV("div", { className: "pf-grid-2", style: { gap: 8, marginBottom: 8 },
                  children: [
                    _jsxDEV("input", { className: "form-input", placeholder: "Contacto de emergencia (nombre)", value: formEditHijo.contacto_emergencia, onChange: e => setFormEditHijo(f => ({ ...f, contacto_emergencia: e.target.value })) }, void 0, false),
                    _jsxDEV("input", { className: "form-input", placeholder: "Teléfono de emergencia", value: formEditHijo.tel_emergencia, onChange: e => setFormEditHijo(f => ({ ...f, tel_emergencia: e.target.value })) }, void 0, false),
                  ]
                }, void 0, true),
                errorEditHijo && _jsxDEV("div", { style: { fontSize: 12, color: PLC.red, marginBottom: 8 }, children: errorEditHijo }, void 0, false),
                _jsxDEV("div", { style: { display: 'flex', gap: 8 },
                  children: [
                    _jsxDEV("button", { className: "btn btn-secondary btn-sm", onClick: () => setEditandoHijoId(null), children: "Cancelar" }, void 0, false),
                    _jsxDEV("button", { className: "btn btn-primary btn-sm", disabled: guardandoHijo, onClick: () => guardarEdicionHijo(hijo.id), children: guardandoHijo ? 'Guardando…' : 'Guardar' }, void 0, false),
                  ]
                }, void 0, true),
              ]
            }, void 0, true) : _jsxDEV("button", {
              className: "btn btn-secondary btn-sm",
              style: { marginTop: 12 },
              onClick: () => abrirEdicionHijo(hijo),
              children: "Editar datos de contacto"
            }, void 0, false)]
          }, void 0, false)]
        }, hijo.id, true))
      }, void 0, false), tab === 'historial' && _jsxDEV("div", {
        style: card(),
        children: [_jsxDEV("div", {
          style: {
            padding: '16px 20px',
            borderBottom: `1px solid ${PLC.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          },
          children: [_jsxDEV(Icon, {
            name: "history",
            size: 20,
            color: PLC.navy
          }, void 0, false), _jsxDEV("div", {
            children: [_jsxDEV("div", {
              style: {
                fontWeight: 700,
                fontSize: 14,
                color: PLC.text
              },
              children: "Historial de cobros"
            }, void 0, false), _jsxDEV("div", {
              style: {
                fontSize: 12,
                color: PLC.muted
              },
              children: [misCobros.length, " registros"]
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true), _jsxDEV("div", {
          style: {
            overflowX: 'auto'
          },
          children: _jsxDEV("table", {
            style: {
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13
            },
            children: [_jsxDEV("thead", {
              children: _jsxDEV("tr", {
                style: {
                  borderBottom: `2px solid ${PLC.border}`
                },
                children: ['Folio', 'Alumno', 'Concepto', 'Método', 'Total', 'Estado', 'Fecha', 'Comprobante'].map(h => _jsxDEV("th", {
                  style: {
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 600,
                    color: PLC.muted,
                    textTransform: 'uppercase',
                    letterSpacing: .4,
                    whiteSpace: 'nowrap'
                  },
                  children: h
                }, h, false))
              }, void 0, false)
            }, void 0, false), _jsxDEV("tbody", {
              children: [misCobros.length === 0 && _jsxDEV("tr", {
                children: _jsxDEV("td", {
                  colSpan: 7,
                  style: {
                    padding: 40,
                    textAlign: 'center',
                    color: PLC.muted
                  },
                  children: "Sin cobros registrados"
                }, void 0, false)
              }, void 0, false), misCobros.slice((paginaHistorial - 1) * HIST_POR_PAGINA, paginaHistorial * HIST_POR_PAGINA).map((cob, i) => _jsxDEV("tr", {
                style: {
                  borderBottom: `1px solid ${PLC.border}`,
                  background: i % 2 === 0 ? 'transparent' : 'rgba(40,45,101,.02)'
                },
                children: [_jsxDEV("td", {
                  style: {
                    padding: '11px 16px',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: PLC.muted
                  },
                  children: cob.folio
                }, void 0, false), _jsxDEV("td", {
                  style: {
                    padding: '11px 16px',
                    fontWeight: 500,
                    color: PLC.text
                  },
                  children: cob.cliente
                }, void 0, false), _jsxDEV("td", {
                  style: {
                    padding: '11px 16px',
                    color: PLC.muted,
                    maxWidth: 180
                  },
                  children: cob.items?.map(i => i.nombre).join(', ')
                }, void 0, false), _jsxDEV("td", {
                  style: {
                    padding: '11px 16px'
                  },
                  children: _jsxDEV("span", {
                    style: {
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '2px 9px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      background: 'rgba(40,45,101,.08)',
                      color: PLC.navy
                    },
                    children: [_jsxDEV(Icon, {
                      name: cob.metodo === 'SPEI' ? 'bank' : 'card',
                      size: 11,
                      color: "currentColor"
                    }, void 0, false), cob.metodo]
                  }, void 0, true)
                }, void 0, false), _jsxDEV("td", {
                  style: {
                    padding: '11px 16px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: PLC.navy
                  },
                  children: fmt(cob.total)
                }, void 0, false), _jsxDEV("td", {
                  style: {
                    padding: '11px 16px'
                  },
                  children: _jsxDEV("span", {
                    style: badgeStyle(cob.estado === 'pagado'),
                    children: [_jsxDEV(Icon, {
                      name: cob.estado === 'pagado' ? 'check' : 'warning',
                      size: 11,
                      color: "currentColor"
                    }, void 0, false), cob.estado === 'pagado' ? 'Pagado' : 'Pendiente']
                  }, void 0, true)
                }, void 0, false), _jsxDEV("td", {
                  style: {
                    padding: '11px 16px',
                    color: PLC.muted,
                    fontSize: 12,
                    whiteSpace: 'nowrap'
                  },
                  children: cob.fecha
                }, void 0, false), _jsxDEV("td", {
                  style: { padding: '11px 16px' },
                  // Pagado por Efectivo/SPEI -> comprobante ya emitido (ver
                  // botón). Pendiente por Efectivo -> antes no había forma de
                  // generar/ver el formato de pago desde aquí: había que
                  // llamar a la escuela para que lo generara en Caja. Ahora
                  // se genera bajo demanda y se abre igual que un
                  // comprobante ya pagado. SPEI pendiente no necesita esto:
                  // su CLABE es fija y ya vive en "Pagar en línea".
                  children: (() => {
                    const cliente = (data.clientes || []).find(c => c.id === cob.cliente_id) || { nombre: cob.cliente };
                    const esEfectivo = cob.metodo === 'Efectivo' || cob.metodo === 'EfectivoRef';

                    if (cob.estado === 'pagado' && (esEfectivo || cob.metodo === 'SPEI') && typeof abrirComprobanteEfectivoModulo !== 'undefined') {
                      return _jsxDEV("button", {
                        className: "btn-ghost",
                        title: "Ver / descargar comprobante",
                        style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '5px 10px' },
                        onClick: () => {
                          if (esEfectivo) {
                            abrirComprobanteEfectivoModulo({
                              cobro: {
                                folio: cob.folio, total: cob.total, descripcion: cob.items?.map(i => i.nombre).join(', '),
                                referencia: cob.referencia, barcode_url: cob.ref_barcode_url, vencimiento: cob.ref_vencimiento
                              },
                              cliente, familia: miFamilia, escuela
                            });
                          } else {
                            abrirComprobanteSPEIModulo({
                              cobro: {
                                folio: cob.folio, total: cob.total, descripcion: cob.items?.map(i => i.nombre).join(', '),
                                referencia_spei: cob.referencia_spei, referencia: cob.referencia, clabe: cob.clabe,
                                clabe_es_individual: cob.clabe_es_individual, banco: cob.banco, beneficiario: cob.beneficiario
                              },
                              cliente, familia: miFamilia, escuela
                            });
                          }
                        },
                        children: [_jsxDEV(Icon, { name: 'download', size: 12, color: 'currentColor' }, void 0, false), 'Ver']
                      }, void 0, true);
                    }

                    // Antes esta rama solo reconocía metodo === 'Efectivo'. En la
                    // práctica, en cuanto Caja genera una referencia el cobro
                    // queda con metodo = 'EfectivoRef' (ver
                    // generar_referencia_efectivo.php) — así que un cobro con
                    // referencia YA generada en Caja siempre mostraba "—" aquí,
                    // y el padre no tenía forma de volver a verla sin llamar
                    // a la escuela.
                    const esEfectivoPendiente = cob.estado === 'pendiente' && (cob.metodo === 'Efectivo' || cob.metodo === 'EfectivoRef');
                    if (esEfectivoPendiente && cob.referencia && typeof abrirComprobanteEfectivoModulo !== 'undefined') {
                      // Ya existe una referencia (la generó Caja, o el propio
                      // padre antes) — se muestra la misma, sin generar otra.
                      return _jsxDEV("button", {
                        className: "btn-ghost",
                        title: "Ver formato de pago en efectivo",
                        style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '5px 10px' },
                        onClick: () => {
                          abrirComprobanteEfectivoModulo({
                            cobro: {
                              folio: cob.folio, total: cob.total, descripcion: cob.items?.map(i => i.nombre).join(', '),
                              referencia: cob.referencia, barcode_url: cob.ref_barcode_url, vencimiento: cob.ref_vencimiento
                            },
                            cliente, familia: miFamilia, escuela
                          });
                        },
                        children: [_jsxDEV(Icon, { name: 'download', size: 12, color: 'currentColor' }, void 0, false), 'Ver']
                      }, void 0, true);
                    }
                    if (esEfectivoPendiente && !cob.referencia && typeof abrirComprobanteEfectivoModulo !== 'undefined') {
                      // Aún no existe ninguna referencia: se genera aquí mismo.
                      const generando = generandoEfvId === cob.id;
                      return _jsxDEV("button", {
                        className: "btn-ghost",
                        title: "Generar formato de pago en efectivo",
                        disabled: generando,
                        style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '5px 10px', color: PLC.navy, fontWeight: 600 },
                        onClick: async () => {
                          setGenerandoEfvId(cob.id);
                          try {
                            const ref = await CobroController.iniciarEfectivoRef({
                              folio: cob.folio, total: cob.total,
                              descripcion: cob.items?.map(i => i.nombre).join(', ') || 'Pago escolar'
                            });
                            setData(prev => ({
                              ...prev,
                              cobros: prev.cobros.map(c => c.id === cob.id
                                ? { ...c, metodo: 'EfectivoRef', referencia: ref.referencia, ref_barcode_url: ref.barcode_url, ref_vencimiento: ref.vencimiento }
                                : c)
                            }));
                            abrirComprobanteEfectivoModulo({
                              cobro: {
                                folio: cob.folio, total: cob.total, descripcion: cob.items?.map(i => i.nombre).join(', '),
                                referencia: ref.referencia, barcode_url: ref.barcode_url, vencimiento: ref.vencimiento
                              },
                              cliente, familia: miFamilia, escuela
                            });
                          } catch (err) {
                            alert('No se pudo generar el formato de pago: ' + err.message);
                          }
                          setGenerandoEfvId(null);
                        },
                        children: generando
                          ? [_jsxDEV("span", { className: "spinner", style: { width: 12, height: 12 } }, void 0, false), ' Generando…']
                          : [_jsxDEV(Icon, { name: 'download', size: 12, color: 'currentColor' }, void 0, false), 'Pagar']
                      }, void 0, true);
                    }

                    // SPEI pendiente: si Caja ya asignó una CLABE/referencia
                    // propia de ESTE cobro (distinta de la CLABE agregada del
                    // alumno que usa "Pagar en línea"), se muestra tal cual —
                    // antes esto se descartaba y solo quedaba el aviso genérico.
                    if (cob.estado === 'pendiente' && cob.metodo === 'SPEI' && cob.clabe && typeof abrirComprobanteSPEIModulo !== 'undefined') {
                      return _jsxDEV("button", {
                        className: "btn-ghost",
                        title: "Ver instrucciones de pago SPEI",
                        style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '5px 10px' },
                        onClick: () => {
                          abrirComprobanteSPEIModulo({
                            cobro: {
                              folio: cob.folio, total: cob.total, descripcion: cob.items?.map(i => i.nombre).join(', '),
                              referencia_spei: cob.referencia_spei, referencia: cob.referencia, clabe: cob.clabe,
                              clabe_es_individual: cob.clabe_es_individual, banco: cob.banco, beneficiario: cob.beneficiario
                            },
                            cliente, familia: miFamilia, escuela
                          });
                        },
                        children: [_jsxDEV(Icon, { name: 'download', size: 12, color: 'currentColor' }, void 0, false), 'Ver']
                      }, void 0, true);
                    }
                    if (cob.estado === 'pendiente' && cob.metodo === 'SPEI') {
                      return _jsxDEV("span", { style: { color: PLC.muted, fontSize: 11.5 }, children: 'Ver en "Pagar en línea"' }, void 0, false);
                    }

                    return _jsxDEV("span", { style: { color: PLC.muted, fontSize: 12 }, children: '—' }, void 0, false);
                  })()
                }, void 0, false)]
              }, cob.id, true))]
            }, void 0, true)]
          }, void 0, true)
        }, void 0, false)]
      }, void 0, true), tab === 'historial' && misCobros.length > HIST_POR_PAGINA && _jsxDEV("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          padding: '10px 4px 4px',
          fontSize: 12,
          color: PLC.muted
        },
        children: [_jsxDEV("span", {
          children: `Pagina ${paginaHistorial} de ${totalPaginasHistorial} · ${misCobros.length} cobros`
        }, void 0, false), _jsxDEV("button", {
          disabled: paginaHistorial <= 1,
          onClick: () => irAPaginaHistorial(paginaHistorial - 1),
          style: {
            padding: '5px 12px', borderRadius: 7, border: `1px solid ${PLC.border}`,
            background: PLC.card, color: PLC.navy, fontSize: 12, cursor: paginaHistorial <= 1 ? 'default' : 'pointer',
            opacity: paginaHistorial <= 1 ? .5 : 1
          },
          children: "‹ Anterior"
        }, void 0, false), _jsxDEV("button", {
          disabled: paginaHistorial >= totalPaginasHistorial,
          onClick: () => irAPaginaHistorial(paginaHistorial + 1),
          style: {
            padding: '5px 12px', borderRadius: 7, border: `1px solid ${PLC.border}`,
            background: PLC.card, color: PLC.navy, fontSize: 12,
            cursor: paginaHistorial >= totalPaginasHistorial ? 'default' : 'pointer',
            opacity: paginaHistorial >= totalPaginasHistorial ? .5 : 1
          },
          children: "Siguiente ›"
        }, void 0, false)]
      }, void 0, true), tab === 'pagar' && _jsxDEV("div", {
        children: saldoTotal <= 0 ? _jsxDEV("div", {
          style: {
            ...card(),
            padding: 50,
            textAlign: 'center'
          },
          children: [_jsxDEV("div", {
            style: {
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: `rgba(73,175,84,.12)`,
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            },
            children: _jsxDEV(Icon, {
              name: "check",
              size: 32,
              color: PLC.green
            }, void 0, false)
          }, void 0, false), _jsxDEV("div", {
            style: {
              fontSize: 18,
              fontWeight: 700,
              color: PLC.green,
              marginBottom: 8
            },
            children: "¡Todo al corriente!"
          }, void 0, false), _jsxDEV("div", {
            style: {
              fontSize: 14,
              color: PLC.muted
            },
            children: "No tienes pagos pendientes en este momento."
          }, void 0, false)]
        }, void 0, true) : _jsxDEV(_Fragment, {
          children: [_jsxDEV("div", {
            style: card(),
            children: [_jsxDEV("div", {
              style: {
                padding: '16px 20px',
                borderBottom: `1px solid ${PLC.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              },
              children: [_jsxDEV(Icon, {
                name: "cobros",
                size: 20,
                color: PLC.navy
              }, void 0, false), _jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 14,
                  color: PLC.text
                },
                children: "Resumen de pago"
              }, void 0, false)]
            }, void 0, true), _jsxDEV("div", {
              style: {
                padding: '16px 20px'
              },
              children: [hijosConSaldo.length > 1 && _jsxDEV("div", {
                style: { fontSize: 12, color: PLC.muted, marginBottom: 8 },
                children: "Los pagos son por alumno — selecciona a quién le vas a pagar:"
              }, void 0, false), hijosConSaldo.map(h => _jsxDEV("div", {
                onClick: () => { setHijoPagoId(h.id); setSpeiBloqueoFamilia(null); setAutorizoCargoAutomatico(false); },
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 8px',
                  marginBottom: 4,
                  borderRadius: 8,
                  cursor: hijosConSaldo.length > 1 ? 'pointer' : 'default',
                  border: hijosConSaldo.length > 1 ? `2px solid ${hijoSeleccionado?.id === h.id ? PLC.navy : PLC.border}` : 'none',
                  background: hijosConSaldo.length > 1 && hijoSeleccionado?.id === h.id ? 'rgba(40,45,101,.05)' : 'transparent',
                  borderBottom: hijosConSaldo.length > 1 ? undefined : `1px solid ${PLC.border}`
                },
                children: [_jsxDEV("div", {
                  style: { minWidth: 0, overflow: 'hidden' },
                  children: [_jsxDEV("div", {
                    style: {
                      fontWeight: 500,
                      color: PLC.text,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    },
                    children: h.nombre
                  }, void 0, false), _jsxDEV("div", {
                    style: {
                      fontSize: 12,
                      color: PLC.muted
                    },
                    children: h.grado
                  }, void 0, false)]
                }, void 0, true), _jsxDEV("div", {
                  style: {
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: PLC.red,
                    flexShrink: 0,
                    marginLeft: 8
                  },
                  children: fmt(h.saldo_pendiente)
                }, void 0, false)]
              }, h.id, true)), _jsxDEV("div", {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 0 0'
                },
                children: [_jsxDEV("div", {
                  style: {
                    fontWeight: 700,
                    fontSize: 15,
                    color: PLC.text
                  },
                  children: "A pagar ahora"
                }, void 0, false), _jsxDEV("div", {
                  style: {
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    fontSize: 20,
                    color: PLC.navy
                  },
                  children: fmt(hijoSeleccionado?.saldo_pendiente || 0)
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), _jsxDEV("div", {
            style: card(),
            children: [_jsxDEV("div", {
              style: {
                padding: '16px 20px',
                borderBottom: `1px solid ${PLC.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              },
              children: [_jsxDEV(Icon, {
                name: "card",
                size: 20,
                color: PLC.navy
              }, void 0, false), _jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 14,
                  color: PLC.text
                },
                children: "Método de pago"
              }, void 0, false)]
            }, void 0, true), _jsxDEV("div", {
              style: {
                padding: '20px'
              },
              children: [_jsxDEV("div", {
                style: {
                  display: 'flex',
                  gap: 12,
                  marginBottom: 22,
                  flexWrap: 'wrap'
                },
                children: [!metodosApagadosFamilia.includes('SPEI') && _jsxDEV("div", {
                  onClick: () => { setMetodo('SPEI'); setSpeiBloqueoFamilia(null); setAutorizoCargoAutomatico(false); },
                  style: {
                    flex: 1,
                    minWidth: 140,
                    padding: '14px 16px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: `2px solid ${metodo === 'SPEI' ? PLC.navy : PLC.border}`,
                    background: metodo === 'SPEI' ? 'rgba(40,45,101,.05)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'all .15s'
                  },
                  children: [_jsxDEV("div", {
                    style: {
                      width: 40,
                      height: 40,
                      borderRadius: 9,
                      background: metodo === 'SPEI' ? PLC.navy : 'var(--glass-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all .15s',
                      flexShrink: 0
                    },
                    children: _jsxDEV(Icon, {
                      name: "bank",
                      size: 20,
                      color: metodo === 'SPEI' ? PLC.white : PLC.muted
                    }, void 0, false)
                  }, void 0, false), _jsxDEV("div", {
                    style: {
                      flex: 1
                    },
                    children: [_jsxDEV("div", {
                      style: {
                        fontWeight: 600,
                        fontSize: 13,
                        color: PLC.text
                      },
                      children: "Transferencia SPEI"
                    }, void 0, false), _jsxDEV("div", {
                      style: {
                        fontSize: 11,
                        color: PLC.muted
                      },
                      children: "Sin comisión adicional"
                    }, void 0, false)]
                  }, void 0, true), metodo === 'SPEI' && _jsxDEV(Icon, {
                    name: "check",
                    size: 18,
                    color: PLC.green
                  }, void 0, false)]
                }, void 0, true), !metodosApagadosFamilia.includes('EfectivoRef') && _jsxDEV("div", {
                  // Antes no existia esta opcion: el padre solo podia pagar
                  // en efectivo yendo al Historial de un cobro ya generado
                  // por la escuela, o llamando para pedirlo. Ahora aparece
                  // aqui junto a los demas metodos, igual que SPEI y tarjeta.
                  onClick: () => { setMetodo('Efectivo'); setSpeiBloqueoFamilia(null); },
                  style: {
                    flex: 1,
                    minWidth: 140,
                    padding: '14px 16px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: `2px solid ${metodo === 'Efectivo' ? PLC.navy : PLC.border}`,
                    background: metodo === 'Efectivo' ? 'rgba(40,45,101,.05)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'all .15s'
                  },
                  children: [_jsxDEV("div", {
                    style: {
                      width: 40,
                      height: 40,
                      borderRadius: 9,
                      background: metodo === 'Efectivo' ? PLC.navy : 'var(--glass-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all .15s',
                      flexShrink: 0
                    },
                    children: _jsxDEV(Icon, {
                      name: "card",
                      size: 20,
                      color: metodo === 'Efectivo' ? PLC.white : PLC.muted
                    }, void 0, false)
                  }, void 0, false), _jsxDEV("div", {
                    style: {
                      flex: 1
                    },
                    children: [_jsxDEV("div", {
                      style: {
                        fontWeight: 600,
                        fontSize: 13,
                        color: PLC.text
                      },
                      children: "Efectivo en tienda"
                    }, void 0, false), _jsxDEV("div", {
                      style: {
                        fontSize: 11,
                        color: PLC.muted
                      },
                      children: "OXXO y tiendas participantes"
                    }, void 0, false)]
                  }, void 0, true), metodo === 'Efectivo' && _jsxDEV(Icon, {
                    name: "check",
                    size: 18,
                    color: PLC.green
                  }, void 0, false)]
                }, void 0, true), !metodosApagadosFamilia.includes('TC') && _jsxDEV("div", {
                  onClick: () => { setMetodo('TC'); setSpeiBloqueoFamilia(null); },
                  style: {
                    flex: 1,
                    minWidth: 140,
                    padding: '14px 16px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: `2px solid ${metodo === 'TC' ? PLC.navy : PLC.border}`,
                    background: metodo === 'TC' ? 'rgba(40,45,101,.05)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'all .15s'
                  },
                  children: [_jsxDEV("div", {
                    style: {
                      width: 40,
                      height: 40,
                      borderRadius: 9,
                      background: metodo === 'TC' ? PLC.navy : 'var(--glass-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all .15s',
                      flexShrink: 0
                    },
                    children: _jsxDEV(Icon, {
                      name: "card",
                      size: 20,
                      color: metodo === 'TC' ? PLC.white : PLC.muted
                    }, void 0, false)
                  }, void 0, false), _jsxDEV("div", {
                    style: {
                      flex: 1
                    },
                    children: [_jsxDEV("div", {
                      style: {
                        fontWeight: 600,
                        fontSize: 13,
                        color: PLC.text
                      },
                      children: "Tarjeta Crédito / Débito"
                    }, void 0, false), _jsxDEV("div", {
                      style: {
                        fontSize: 11,
                        color: PLC.muted
                      },
                      children: "Visa, Mastercard, Amex"
                    }, void 0, false)]
                  }, void 0, true), metodo === 'TC' && _jsxDEV(Icon, {
                    name: "check",
                    size: 18,
                    color: PLC.green
                  }, void 0, false)]
                }, void 0, true),
                // Solo aparece si este alumno ya tiene una tarjeta domiciliada
                // de un pago anterior — evita volver a pedirla y a pedir el
                // consentimiento de nuevo, ya se dio la primera vez.
                !metodosApagadosFamilia.includes('CAI') && hijoSeleccionado?.token_tarjeta_estado === 'activo' && _jsxDEV("div", {
                  onClick: () => { setMetodo('CAI'); setSpeiBloqueoFamilia(null); },
                  style: {
                    flex: 1,
                    minWidth: 140,
                    padding: '14px 16px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: `2px solid ${metodo === 'CAI' ? PLC.navy : PLC.border}`,
                    background: metodo === 'CAI' ? 'rgba(40,45,101,.05)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'all .15s'
                  },
                  children: [_jsxDEV("div", {
                    style: {
                      width: 40,
                      height: 40,
                      borderRadius: 9,
                      background: metodo === 'CAI' ? PLC.navy : 'var(--glass-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all .15s',
                      flexShrink: 0
                    },
                    children: _jsxDEV(Icon, {
                      name: "card",
                      size: 20,
                      color: metodo === 'CAI' ? PLC.white : PLC.muted
                    }, void 0, false)
                  }, void 0, false), _jsxDEV("div", {
                    style: { flex: 1 },
                    children: [_jsxDEV("div", {
                      style: { fontWeight: 600, fontSize: 13, color: PLC.text },
                      children: "Tarjeta guardada"
                    }, void 0, false), _jsxDEV("div", {
                      style: { fontSize: 11, color: PLC.muted },
                      children: ["Cobro inmediato · vence ", hijoSeleccionado.token_tarjeta_expmes, "/", hijoSeleccionado.token_tarjeta_expanio]
                    }, void 0, true)]
                  }, void 0, true), metodo === 'CAI' && _jsxDEV(Icon, {
                    name: "check",
                    size: 18,
                    color: PLC.green
                  }, void 0, false)]
                }, void 0, true)]
              }, void 0, true),
              // El checkbox de consentimiento solo tiene sentido si la
              // domiciliación (CAI) sigue disponible para esta escuela —
              // si el superadmin la bloqueó (o la escuela la desactivó),
              // no hay ningún Cargo Automático futuro que autorizar, y
              // mostrar el checkbox de todas formas es una promesa falsa
              // (y obliga a marcar algo que no aplica solo para poder
              // pagar con tarjeta una sola vez).
              metodo === 'TC' && !metodosApagadosFamilia.includes('CAI') && _jsxDEV("label", {
                style: {
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  marginBottom: 14,
                  padding: '12px 14px',
                  borderRadius: 9,
                  background: 'rgba(40,45,101,.04)',
                  border: `1px solid ${autorizoCargoAutomatico ? PLC.navy : PLC.border}`,
                  cursor: 'pointer',
                },
                children: [_jsxDEV("input", {
                  type: 'checkbox',
                  checked: autorizoCargoAutomatico,
                  onChange: e => { setAutorizoCargoAutomatico(e.target.checked); setSpeiBloqueoFamilia(null); },
                  style: { marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' },
                }, void 0, false), _jsxDEV("span", {
                  style: { fontSize: 12, color: PLC.text, lineHeight: 1.5 },
                  children: "Autorizo que mi tarjeta quede guardada de forma segura para futuros Cargos Automáticos (domiciliación) de los adeudos de este alumno. Podré cancelar esta autorización en cualquier momento desde \"Tarjeta guardada\"."
                }, void 0, false)]
              }, void 0, true), speiBloqueoFamilia && _jsxDEV("div", {
                style: {
                  marginBottom: 14, padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(239,68,68,.08)', border: `1px solid ${PLC.red}`,
                  fontSize: 12.5, color: PLC.text, lineHeight: 1.5
                },
                children: speiBloqueoFamilia
              }, void 0, false), _jsxDEV("button", {
                onClick: metodo === 'CAI' ? cobrarConTarjetaGuardada : pagarSaldo,
                disabled: loading || !hijoSeleccionado || (metodo === 'TC' && !metodosApagadosFamilia.includes('CAI') && !autorizoCargoAutomatico),
                style: {
                  width: '100%',
                  padding: '14px 0',
                  borderRadius: 10,
                  border: 'none',
                  background: `linear-gradient(135deg,${PLC.navy},${PLC.navyDk})`,
                  color: PLC.white,
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  opacity: loading ? .7 : 1,
                  transition: 'all .18s',
                  fontFamily: 'inherit',
                  letterSpacing: .2
                },
                children: loading ? _jsxDEV(_Fragment, {
                  children: [_jsxDEV("span", {
                    className: "spinner",
                    style: {
                      borderColor: 'rgba(255,255,255,.3)',
                      borderTopColor: PLC.white,
                      width: 18,
                      height: 18
                    }
                  }, void 0, false), "Procesando…"]
                }, void 0, true) : _jsxDEV(_Fragment, {
                  // Con Efectivo, el monto a mostrar es el del ÚNICO cobro
                  // pendiente que se va a pagar, no el saldo total del alumno
                  // — Efectivo no puede pagar varios conceptos juntos (ver
                  // pagarSaldo). Mostrar el saldo total ahí habria sido
                  // enganoso: el formato que se genera solo cubre uno.
                  children: [_jsxDEV(Icon, {
                    name: "pay",
                    size: 18,
                    color: PLC.white
                  }, void 0, false), "Pagar ", fmt(
                    // Efectivo y Tarjeta ahora agrupan TODOS los pendientes del
                    // alumno en un solo pago (ver pagarSaldo), no solo el
                    // primero que se encuentre -- antes de esto, con varios
                    // conceptos pendientes el boton mostraba solo el monto del
                    // primero, aunque el cobro real terminara sumando todos.
                    (metodo === 'Efectivo' || metodo === 'TC')
                      ? misCobros.filter(c => c.cliente_id === hijoSeleccionado?.id && c.estado === 'pendiente').reduce((a, c) => a + (c.total || 0), 0)
                      : (hijoSeleccionado?.saldo_pendiente || 0)
                  ), " con ", metodo === 'SPEI' ? 'SPEI' : metodo === 'CAI' ? 'tarjeta guardada' : metodo === 'Efectivo' ? 'Efectivo' : 'Tarjeta']
                }, void 0, true)
              }, void 0, false), _jsxDEV("div", {
                style: {
                  marginTop: 14,
                  fontSize: 11.5,
                  color: PLC.muted,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                },
                children: [_jsxDEV(Icon, {
                  name: "shield",
                  size: 13,
                  color: PLC.muted
                }, void 0, false), "Pago seguro procesado por Pagadetodo.mx · Powered by STP"]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true), modal === 'spei' && cobroActivo && _jsxDEV("div", {
      style: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,32,80,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20
      },
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: _jsxDEV("div", {
        style: {
          background: PLC.card,
          borderRadius: 18,
          width: '100%',
          maxWidth: 460,
          boxShadow: `0 28px 70px rgba(28,32,80,.35)`,
          overflow: 'hidden'
        },
        children: [_jsxDEV("div", {
          style: {
            background: `linear-gradient(135deg,${PLC.navyDk},${PLC.navy})`,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          },
          children: [_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 12
            },
            children: [_jsxDEV("div", {
              style: {
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(189,207,0,.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              },
              children: _jsxDEV(Icon, {
                name: "bank",
                size: 20,
                color: PLC.white
              }, void 0, false)
            }, void 0, false), _jsxDEV("div", {
              children: [_jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 16,
                  color: PLC.white
                },
                children: "Datos para transferir"
              }, void 0, false), _jsxDEV("div", {
                style: {
                  fontSize: 11.5,
                  color: 'rgba(255,255,255,.5)',
                  marginTop: 2
                },
                children: "Incluye el concepto exacto"
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), _jsxDEV("button", {
            onClick: () => setModal(null),
            style: {
              background: 'rgba(255,255,255,.1)',
              border: 'none',
              color: PLC.white,
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            },
            children: _jsxDEV(Icon, {
              name: "close",
              size: 18,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), _jsxDEV("div", {
          style: {
            padding: 24
          },
          children: pollStatus === 'confirmed' ? _jsxDEV("div", {
            style: {
              textAlign: 'center',
              padding: '20px 0'
            },
            children: [_jsxDEV("div", {
              style: {
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: `rgba(73,175,84,.12)`,
                margin: '0 auto 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              },
              children: _jsxDEV(Icon, {
                name: "check",
                size: 32,
                color: PLC.green
              }, void 0, false)
            }, void 0, false), _jsxDEV("div", {
              style: {
                fontSize: 18,
                fontWeight: 700,
                color: PLC.green,
                marginBottom: 8
              },
              children: "¡Pago confirmado!"
            }, void 0, false), _jsxDEV("div", {
              style: {
                fontSize: 13,
                color: PLC.muted
              },
              children: "Tu pago fue recibido y procesado. Gracias."
            }, void 0, false), _jsxDEV("button", {
              onClick: () => {
                setModal(null);
                setPollStatus(null);
              },
              style: {
                marginTop: 20,
                padding: '10px 28px',
                borderRadius: 9,
                border: 'none',
                background: PLC.navy,
                color: PLC.white,
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13
              },
              children: "Cerrar"
            }, void 0, false)]
          }, void 0, true) : _jsxDEV(_Fragment, {
            children: [_jsxDEV("div", {
              style: {
                marginBottom: 14,
                padding: '10px 14px',
                background: `rgba(189,207,0,.09)`,
                borderRadius: 9,
                fontSize: 12.5,
                color: PLC.navy,
                border: `1px solid rgba(189,207,0,.3)`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8
              },
              children: [_jsxDEV(Icon, {
                name: "warning",
                size: 16,
                color: PLC.limeDk,
                style: {
                  flexShrink: 0,
                  marginTop: 1
                }
              }, void 0, false), cobroActivo.clabe_es_individual ? _jsxDEV(_Fragment, {
                children: ["Esta CLABE es ", _jsxDEV("strong", {
                  children: "exclusiva de tu cuenta"
                }, void 0, false), " — tu pago se detecta automáticamente aunque no incluyas concepto"]
              }, void 0, true) : _jsxDEV(_Fragment, {
                children: ["El ", _jsxDEV("strong", {
                  children: "concepto es obligatorio"
                }, void 0, false), " — sin él tu pago no se confirma automáticamente"]
              }, void 0, true)]
            }, void 0, true), _jsxDEV("div", {
              style: fieldBox(),
              children: [_jsxDEV("div", {
                style: {
                  fontSize: 10,
                  color: PLC.muted,
                  textTransform: 'uppercase',
                  letterSpacing: .4,
                  marginBottom: 5
                },
                children: cobroActivo.clabe_es_individual ? 'CLABE individual de tu cuenta' : 'CLABE interbancaria'
              }, void 0, false), _jsxDEV("div", {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                },
                children: [_jsxDEV("div", {
                  style: {
                    fontFamily: 'monospace',
                    fontSize: 15,
                    fontWeight: 600,
                    color: PLC.text,
                    letterSpacing: .5,
                    flex: 1
                  },
                  children: cobroActivo.clabe || '—'
                }, void 0, false), cobroActivo.clabe && _jsxDEV("button", {
                  onClick: () => copiar(cobroActivo.clabe, 'clabe'),
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    borderRadius: 7,
                    border: `1px solid ${PLC.border}`,
                    background: 'white',
                    fontSize: 11,
                    cursor: 'pointer',
                    color: PLC.muted,
                    flexShrink: 0,
                    color: copied === 'clabe' ? PLC.green : PLC.muted,
                    borderColor: copied === 'clabe' ? PLC.green : PLC.border
                  },
                  children: [_jsxDEV(Icon, {
                    name: copied === 'clabe' ? 'check' : 'copy',
                    size: 13,
                    color: "currentColor"
                  }, void 0, false), copied === 'clabe' ? 'Copiado' : 'Copiar']
                }, void 0, true)]
              }, void 0, true), _jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: PLC.muted,
                  marginTop: 4
                },
                children: ["Banco: ", _jsxDEV("strong", {
                  children: cobroActivo.banco || 'STP'
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true), _jsxDEV("div", {
              style: fieldBox(true),
              children: [_jsxDEV("div", {
                style: {
                  fontSize: 10,
                  color: PLC.limeDk,
                  textTransform: 'uppercase',
                  letterSpacing: .4,
                  marginBottom: 5,
                  fontWeight: 700
                },
                children: cobroActivo.clabe_es_individual ? 'Concepto / Referencia (opcional)' : 'Concepto / Referencia (obligatorio)'
              }, void 0, false), _jsxDEV("div", {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                },
                children: [_jsxDEV("div", {
                  style: {
                    fontFamily: 'monospace',
                    fontSize: 18,
                    fontWeight: 700,
                    color: PLC.navy,
                    flex: 1,
                    letterSpacing: .5
                  },
                  children: cobroActivo.referencia_spei || cobroActivo.referencia
                }, void 0, false), _jsxDEV("button", {
                  onClick: () => copiar(cobroActivo.referencia_spei || cobroActivo.referencia, 'ref'),
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    borderRadius: 7,
                    border: `2px solid ${copied === 'ref' ? PLC.green : PLC.border}`,
                    background: copied === 'ref' ? `rgba(73,175,84,.12)` : PLC.white,
                    color: copied === 'ref' ? PLC.green : '#000000',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    flexShrink: 0
                  },
                  children: [_jsxDEV(Icon, {
                    name: copied === 'ref' ? 'check' : 'copy',
                    size: 13,
                    color: "currentColor"
                  }, void 0, false), copied === 'ref' ? 'Copiado' : 'Copiar']
                }, void 0, true)]
              }, void 0, true)]
            }, void 0, true), _jsxDEV("div", {
              style: fieldBox(),
              children: [_jsxDEV("div", {
                style: {
                  fontSize: 10,
                  color: PLC.muted,
                  textTransform: 'uppercase',
                  letterSpacing: .4,
                  marginBottom: 5
                },
                children: "Monto exacto"
              }, void 0, false), _jsxDEV("div", {
                style: {
                  fontFamily: 'monospace',
                  fontSize: 19,
                  fontWeight: 700,
                  color: PLC.navy
                },
                children: fmt(cobroActivo.total)
              }, void 0, false)]
            }, void 0, true), pollStatus === 'waiting' && _jsxDEV("div", {
              style: {
                marginTop: 14,
                padding: '10px 14px',
                background: 'rgba(40,45,101,.05)',
                borderRadius: 9,
                fontSize: 12,
                color: PLC.muted,
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              },
              children: [_jsxDEV("span", {
                className: "spinner",
                style: {
                  borderColor: 'rgba(40,45,101,.2)',
                  borderTopColor: PLC.navy,
                  width: 14,
                  height: 14
                }
              }, void 0, false), "Verificando pago automáticamente cada 10 segundos…"]
            }, void 0, true), _jsxDEV("div", {
              style: {
                marginTop: 16,
                fontSize: 11.5,
                color: PLC.muted,
                lineHeight: 1.6,
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              },
              children: [_jsxDEV(Icon, {
                name: "shield",
                size: 13,
                color: PLC.muted
              }, void 0, false), "El sistema detectará tu transferencia automáticamente."]
            }, void 0, true)]
          }, void 0, true)
        }, void 0, false)]
      
      }, void 0, true)
    }, void 0, false), tab === 'facturas' && _jsxDEV("div", {
        children: [_jsxDEV("div", {
          style: { fontSize: 13, color: PLC.muted, marginBottom: 14 },
          children: "Facturas (CFDI) generadas para tus pagos. Solo aparecen los cobros que ya fueron facturados."
        }, void 0, false), misCobros.filter(c => c.factura).length === 0 ? _jsxDEV("div", {
          style: { ...card(), padding: '34px 20px', textAlign: 'center', color: PLC.muted, fontSize: 13 },
          children: "Todavía no tienes facturas generadas."
        }, void 0, false) : _jsxDEV("div", {
          style: { display: 'flex', flexDirection: 'column', gap: 10 },
          children: misCobros.filter(c => c.factura).map(cob => _jsxDEV("div", {
            style: {
              ...card(),
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', flexWrap: 'wrap', gap: 8
            },
            children: [_jsxDEV("div", {
              children: [_jsxDEV("div", { style: { fontSize: 13, fontWeight: 600, color: PLC.text }, children: [cob.folio, " · ", cob.cliente] }, void 0, true),
              _jsxDEV("div", { style: { fontSize: 11.5, color: PLC.muted, marginTop: 2 }, children: [cob.fecha, " · ", fmt(cob.total)] }, void 0, true)]
            }, void 0, true), _jsxDEV("div", {
              style: { display: 'flex', gap: 8 },
              children: [_jsxDEV("button", {
                disabled: descargandoFactura === cob.id + '-pdf',
                onClick: () => descargarFactura(cob, 'pdf'),
                style: {
                  padding: '8px 14px', borderRadius: 8, border: `1px solid ${PLC.border}`,
                  background: PLC.card, color: PLC.navy, fontSize: 12.5, fontWeight: 600, cursor: 'pointer'
                },
                children: descargandoFactura === cob.id + '-pdf' ? 'Descargando…' : [
                  _jsxDEV(Icon, { name: 'download', size: 13, color: 'currentColor' }, 'pdf-ic', false),
                  ' PDF'
                ]
              }, void 0, false), _jsxDEV("button", {
                disabled: descargandoFactura === cob.id + '-xml',
                onClick: () => descargarFactura(cob, 'xml'),
                style: {
                  padding: '8px 14px', borderRadius: 8, border: `1px solid ${PLC.border}`,
                  background: PLC.card, color: PLC.navy, fontSize: 12.5, fontWeight: 600, cursor: 'pointer'
                },
                children: descargandoFactura === cob.id + '-xml' ? 'Descargando…' : [
                  _jsxDEV(Icon, { name: 'download', size: 13, color: 'currentColor' }, 'xml-ic', false),
                  ' XML'
                ]
              }, void 0, false)]
            }, void 0, true)]
          }, cob.id, true))
        }, void 0, false)]
      }, void 0, true), tab === 'config' && _jsxDEV("div", {
        style: { display: 'flex', flexDirection: 'column', gap: 18 },
        children: [_jsxDEV("div", {
          children: [
            _jsxDEV("button", {
              className: "btn btn-secondary",
              style: { marginBottom: 20 },
              onClick: () => {
                const fam = (data.familias || []).find(f => f.id === user.familia_id);
                setFicha({ registro: fam || { id: user.familia_id, nombre: user.nombre, email: user.email }, tipo: 'tutor' });
              },
              children: "Ver mi ficha de tutor"
            }, 'fichaTutor', false),
            _jsxDEV("div", { style: { fontSize: 14, fontWeight: 700, color: PLC.text, marginBottom: 10 }, children: "Apariencia" }, void 0, false),
            _jsxDEV("div", { style: { fontSize: 12, color: PLC.muted, marginBottom: 10 }, children: "Elige c\u00f3mo quieres ver el portal. Tu elecci\u00f3n se guarda en este dispositivo." }, void 0, false),
            _jsxDEV("div", {
              style: { ...card(), padding: 14 },
              children: _jsxDEV("div", {
                style: { display: 'flex', gap: 10, flexWrap: 'wrap' },
                children: [
                  { id: 'claro',  label: 'Claro',      icon: 'sun' },
                  { id: 'oscuro', label: 'Oscuro',     icon: 'moon' },
                  { id: 'auto',   label: 'Autom\u00e1tico', icon: 'settings' }
                ].map(op => _jsxDEV("button", {
                  onClick: () => setModoTema(op.id),
                  style: {
                    flex: '1 1 130px', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 7, padding: '16px 12px',
                    borderRadius: 'var(--radius)', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                    border: '2px solid ' + (modoTema === op.id ? 'var(--violet)' : 'var(--border-glow)'),
                    background: modoTema === op.id ? 'var(--violet-soft)' : 'var(--bg-surface)',
                    color: modoTema === op.id ? 'var(--violet)' : 'var(--ink-2)',
                    transition: 'all .15s'
                  },
                  children: [
                    _jsxDEV(Icon, { name: op.icon, size: 20, color: 'currentColor' }, void 0, false),
                    _jsxDEV("span", { children: op.label }, void 0, false),
                    op.id === 'auto'
                      ? _jsxDEV("span", { style: { fontSize: 10.5, fontWeight: 400, opacity: .75 }, children: "Sigue a tu dispositivo" }, void 0, false)
                      : null
                  ]
                }, op.id, true))
              }, void 0, false)
            }, void 0, false)
          ]
        }, 'apariencia', true), _jsxDEV("div", {
          children: [_jsxDEV("div", { style: { fontSize: 14, fontWeight: 700, color: PLC.text, marginBottom: 10 }, children: "Mis datos" }, void 0, false),
          _jsxDEV("div", { style: { fontSize: 12, color: PLC.muted, marginBottom: 10 }, children: "Información de contacto del tutor/a de la cuenta." }, void 0, false),
          _jsxDEV("div", {
            style: { ...card(), padding: 14 },
            children: editandoMisDatos ? _jsxDEV("div", {
              children: [_jsxDEV("div", { className: "pf-grid-2", style: { gap: 8, marginBottom: 8 },
                children: [
                  _jsxDEV("input", { className: "form-input", placeholder: "Nombre", value: formMisDatos.nombre, onChange: e => setFormMisDatos(f => ({ ...f, nombre: e.target.value })) }, void 0, false),
                  _jsxDEV("input", { className: "form-input", type: "email", placeholder: "Correo", value: formMisDatos.email, onChange: e => setFormMisDatos(f => ({ ...f, email: e.target.value })) }, void 0, false),
                ]
              }, void 0, true),
              _jsxDEV("div", { className: "pf-grid-2", style: { gap: 8, marginBottom: 8 },
                children: [
                  _jsxDEV("input", { className: "form-input", placeholder: "Teléfono", value: formMisDatos.telefono, onChange: e => setFormMisDatos(f => ({ ...f, telefono: e.target.value })) }, void 0, false),
                  _jsxDEV("input", { className: "form-input", placeholder: "Nombre de contacto (si es distinto)", value: formMisDatos.contacto, onChange: e => setFormMisDatos(f => ({ ...f, contacto: e.target.value })) }, void 0, false),
                ]
              }, void 0, true),
              errorMisDatos && _jsxDEV("div", { style: { fontSize: 12, color: PLC.red, marginBottom: 8 }, children: errorMisDatos }, void 0, false),
              _jsxDEV("div", { style: { display: 'flex', gap: 8 },
                children: [
                  _jsxDEV("button", { className: "btn btn-secondary btn-sm", onClick: () => setEditandoMisDatos(false), children: "Cancelar" }, void 0, false),
                  _jsxDEV("button", { className: "btn btn-primary btn-sm", disabled: guardandoMisDatos, onClick: guardarMisDatos, children: guardandoMisDatos ? 'Guardando…' : 'Guardar' }, void 0, false),
                ]
              }, void 0, true)]
            }, void 0, true) : _jsxDEV("div", {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
              children: [_jsxDEV("div", {
                style: { minWidth: 0 },
                children: [_jsxDEV("div", { style: { fontSize: 13, fontWeight: 600, color: PLC.text }, children: userEfectivo.nombre }, void 0, false),
                _jsxDEV("div", { style: { fontSize: 11.5, color: PLC.muted, marginTop: 2 }, children: [userEfectivo.email, miFamilia?.telefono ? ` · ${miFamilia.telefono}` : ''] }, void 0, true),
                okMisDatos && _jsxDEV("div", { style: { fontSize: 11.5, color: PLC.green, marginTop: 2 }, children: okMisDatos }, void 0, false)]
              }, void 0, true), _jsxDEV("button", { className: "btn btn-ghost btn-sm", style: { flexShrink: 0 }, onClick: abrirMisDatos, children: "Editar" }, void 0, false)]
            }, void 0, true)
          }, void 0, true)]
        }, void 0, true), _jsxDEV("div", {
          children: [_jsxDEV("div", { style: { fontSize: 14, fontWeight: 700, color: PLC.text, marginBottom: 10 }, children: "Datos fiscales" }, void 0, false),
          _jsxDEV("div", { style: { fontSize: 12, color: PLC.muted, marginBottom: 10 }, children: "Un solo RFC/razón social por familia — se usa para generar el CFDI de cualquier pago de tus hijos." }, void 0, false),
          _jsxDEV("div", {
            style: { ...card(), padding: 14 },
            children: editandoFiscal ? _jsxDEV("div", {
              children: [_jsxDEV("div", { className: "pf-grid-2", style: { gap: 8, marginBottom: 8 },
                children: [
                  _jsxDEV("input", { className: "form-input", placeholder: "RFC", value: formFiscal.rfc_factura, onChange: e => setFormFiscal(f => ({ ...f, rfc_factura: e.target.value.toUpperCase() })), style: { fontFamily: 'var(--mono)' } }, void 0, false),
                  _jsxDEV("input", { className: "form-input", placeholder: "Razón social", value: formFiscal.razon_social_factura, onChange: e => setFormFiscal(f => ({ ...f, razon_social_factura: e.target.value })) }, void 0, false),
                ]
              }, void 0, true),
              _jsxDEV("div", { className: "pf-grid-1-2", style: { gap: 8, marginBottom: 8 },
                children: [
                  _jsxDEV("input", { className: "form-input", placeholder: "C.P.", value: formFiscal.cp_factura, onChange: e => setFormFiscal(f => ({ ...f, cp_factura: e.target.value })) }, void 0, false),
                  _jsxDEV("input", { className: "form-input", placeholder: "Domicilio fiscal", value: formFiscal.domicilio_factura, onChange: e => setFormFiscal(f => ({ ...f, domicilio_factura: e.target.value })) }, void 0, false),
                ]
              }, void 0, true),
              _jsxDEV("div", { className: "pf-grid-2", style: { gap: 8, marginBottom: 8 },
                children: [
                  _jsxDEV("select", { className: "form-select", value: formFiscal.regimen_factura, onChange: e => setFormFiscal(f => ({ ...f, regimen_factura: e.target.value })),
                    children: REGIMENES_SAT.map(r => _jsxDEV("option", { value: r.value, children: r.label }, r.value, false))
                  }, void 0, false),
                  _jsxDEV("select", { className: "form-select", value: formFiscal.uso_cfdi_defecto, onChange: e => setFormFiscal(f => ({ ...f, uso_cfdi_defecto: e.target.value })),
                    children: USOS_CFDI.map(u => _jsxDEV("option", { value: u.value, children: u.label }, u.value, false))
                  }, void 0, false),
                ]
              }, void 0, true),
              errorFiscal && _jsxDEV("div", { style: { fontSize: 12, color: PLC.red, marginBottom: 8 }, children: errorFiscal }, void 0, false),
              _jsxDEV("div", { style: { display: 'flex', gap: 8 },
                children: [
                  _jsxDEV("button", { className: "btn btn-secondary btn-sm", onClick: () => setEditandoFiscal(false), children: "Cancelar" }, void 0, false),
                  _jsxDEV("button", { className: "btn btn-primary btn-sm", disabled: guardandoFiscal, onClick: guardarFiscal, children: guardandoFiscal ? 'Guardando…' : 'Guardar' }, void 0, false),
                ]
              }, void 0, true)]
            }, void 0, true) : _jsxDEV("div", {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
              children: [_jsxDEV("div", {
                style: { fontSize: 11.5, color: PLC.muted, minWidth: 0 },
                children: miFamilia?.rfc_factura ? `RFC: ${miFamilia.rfc_factura}` : 'Sin datos fiscales capturados'
              }, void 0, false), _jsxDEV("button", { className: "btn btn-ghost btn-sm", style: { flexShrink: 0 }, onClick: abrirFiscal, children: "Editar" }, void 0, false)]
            }, void 0, true)
          }, void 0, true)]
        }, void 0, true), _jsxDEV("div", {
          children: [_jsxDEV("div", { style: { fontSize: 14, fontWeight: 700, color: PLC.text, marginBottom: 10 }, children: "Tarjeta guardada" }, void 0, false),
          misHijos.filter(h => h.token_tarjeta_estado === 'activo').length === 0 ? _jsxDEV("div", {
            style: { fontSize: 12.5, color: PLC.muted }, children: "No tienes ninguna tarjeta guardada."
          }, void 0, false) : misHijos.filter(h => h.token_tarjeta_estado === 'activo').map(hijo => _jsxDEV("div", {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, ...card(), padding: 14, marginBottom: 10 },
            children: [_jsxDEV("div", {
              style: { minWidth: 0 },
              children: [_jsxDEV("div", { style: { fontSize: 13, fontWeight: 600, color: PLC.text }, children: hijo.nombre }, void 0, false),
              _jsxDEV("div", { style: { fontSize: 11.5, color: PLC.muted, marginTop: 2 }, children: ["Tarjeta guardada · vence ", hijo.token_tarjeta_expmes, "/", hijo.token_tarjeta_expanio] }, void 0, true)]
            }, void 0, true), _jsxDEV("button", {
              className: "btn btn-ghost btn-sm",
              disabled: eliminandoTarjetaId === hijo.id,
              onClick: () => eliminarTarjeta(hijo.id),
              style: { color: PLC.red, flexShrink: 0 },
              children: eliminandoTarjetaId === hijo.id ? 'Eliminando…' : 'Eliminar tarjeta'
            }, void 0, false)]
          }, hijo.id, true))]
        }, void 0, true), _jsxDEV("div", {
          children: [_jsxDEV("div", { style: { fontSize: 14, fontWeight: 700, color: PLC.text, marginBottom: 10 }, children: "Cambiar contraseña" }, void 0, false),
          _jsxDEV("input", { className: "form-input", type: "password", placeholder: "Contraseña actual", value: formPass.actual, onChange: e => setFormPass(f => ({ ...f, actual: e.target.value })), style: { marginBottom: 8, width: '100%' } }, void 0, false),
          _jsxDEV("input", { className: "form-input", type: "password", placeholder: "Nueva contraseña (mín. 8 caracteres)", value: formPass.nueva, onChange: e => setFormPass(f => ({ ...f, nueva: e.target.value })), style: { marginBottom: 8, width: '100%' } }, void 0, false),
          _jsxDEV("input", { className: "form-input", type: "password", placeholder: "Confirmar nueva contraseña", value: formPass.confirmar, onChange: e => setFormPass(f => ({ ...f, confirmar: e.target.value })), style: { marginBottom: 8, width: '100%' } }, void 0, false),
          errorPass && _jsxDEV("div", { style: { fontSize: 12, color: PLC.red, marginBottom: 8 }, children: errorPass }, void 0, false),
          okPass && _jsxDEV("div", { style: { fontSize: 12, color: PLC.green, marginBottom: 8 }, children: okPass }, void 0, false),
          _jsxDEV("button", {
            className: "btn btn-primary btn-sm",
            disabled: guardandoPass || !formPass.actual || !formPass.nueva,
            onClick: cambiarPassword,
            children: guardandoPass ? 'Guardando…' : 'Cambiar contraseña'
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true),
      ficha && typeof FichaTecnica !== 'undefined' ? _jsxDEV(FichaTecnica, {
        registro: ficha.registro,
        tipo: ficha.tipo,
        escuela: escuela,
        familia: ficha.tipo === 'tutor' ? null : { nombre: (data.familias || []).find(f => f.id === user.familia_id)?.nombre },
        puedeEditar: true,
        onCerrar: () => setFicha(null),
        onGuardarFoto: guardarFotoFicha
      }, 'ficha', false) : null
      ]
  }, void 0, true);
}
