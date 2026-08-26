var _jsxDEV = function(type,props,key,_s,_src,_self){

  var p = Object.assign({key:key||undefined},props);

  var ch = p.children; delete p.children;

  return ch===undefined ? React.createElement(type,p)

       : Array.isArray(ch) ? React.createElement(type,p,...ch)

       : React.createElement(type,p,ch);

};

/* views/Familias.jsx — Gestión de familias con hijos agrupados y CLABE SPEI individual */

function Familias({

  data,

  setData,

  escuela_id

}) {

  const {

    useState

  } = React;

  const EMPTY_FAM = {

    nombre: '',

    contacto: '',

    tel: '',

    email: '',

    // Datos fiscales de la familia (pre-llenan CFDI de todos sus hijos)

    rfc_factura: '',

    razon_social_factura: '',

    cp_factura: '',

    domicilio_factura: '',

    regimen_factura: '616',

    uso_cfdi_defecto: 'D10',

    darAcceso: false

  };

  const EMPTY_ALU = {

    tipo: 'alumno',

    parentesco: '',

    nombre: '',

    grado: '',

    matricula: '',

    curp: '',

    email: '',

    tel: '',

    familia_id: null

  };

  const [modal, setModal] = useState(null); // null | 'familia' | 'alumno'

  const [formFam, setFormFam] = useState(EMPTY_FAM);

  const [formAlu, setFormAlu] = useState(EMPTY_ALU);

  const [avisoApellido, setAvisoApellido] = useState(null);

  const [fichaTutor, setFichaTutor] = useState(null);

  const [ligaActivacion, setLigaActivacion] = useState(null); // { liga } — solo si falló el correo al dar acceso al portal

  // Parentescos donde SÍ se espera compartir apellido con la familia.
  // En los demás el no-coincidir es lo normal y no se avisa nada.
  const PARENTESCOS = [
    { id: 'hijo',     label: 'Hijo',        esperaApellido: true },
    { id: 'hija',     label: 'Hija',        esperaApellido: true },
    { id: 'hijastro', label: 'Hijastro',    esperaApellido: false },
    { id: 'hijastra', label: 'Hijastra',    esperaApellido: false },
    { id: 'sobrino',  label: 'Sobrino',     esperaApellido: false },
    { id: 'sobrina',  label: 'Sobrina',     esperaApellido: false },
    { id: 'nieto',    label: 'Nieto',       esperaApellido: false },
    { id: 'nieta',    label: 'Nieta',       esperaApellido: false },
    { id: 'ahijado',  label: 'Ahijado',     esperaApellido: false },
    { id: 'ahijada',  label: 'Ahijada',     esperaApellido: false },
    { id: 'hermano',  label: 'Hermano',     esperaApellido: false },
    { id: 'hermana',  label: 'Hermana',     esperaApellido: false },
    { id: 'tutorado', label: 'Bajo tutela', esperaApellido: false },
    { id: 'otro',     label: 'Otro',        esperaApellido: false }
  ];

  // Normaliza para comparar: sin acentos, minusculas, solo letras
  const _norm = t => String(t || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Particulas que no son apellidos y ensucian la comparacion
  const _RUIDO = ['de', 'del', 'la', 'las', 'los', 'y', 'san', 'santa', 'von', 'da', 'di'];

  const _apellidosDe = texto => _norm(texto).split(' ')
    .filter(w => w.length > 2 && _RUIDO.indexOf(w) < 0);

  // true si comparten al menos una palabra de apellido
  const _compartenApellido = (nombreAlumno, nombreFamilia) => {
    const a = _apellidosDe(nombreAlumno);
    const f = _apellidosDe(nombreFamilia);
    if (a.length === 0 || f.length === 0) return true;  // sin datos, no molestar
    return f.some(x => a.indexOf(x) >= 0);
  };

  const [expanded, setExpanded] = useState({});

  const [q, setQ] = useState('');

  const [etiquetas, setEtiquetas] = useState([]);

  const [targetFamId, setTargetFamId] = useState(null);

  const [qVincular, setQVincular] = useState('');

  const [clabeLoadingId, setClabeLoadingId] = useState(null); // id del alumno cuya CLABE se está generando



  const escuela = data.escuelas.find(e => e.id === escuela_id);

  // Cada etiqueta debe coincidir (Y lógica). Se busca en los datos de la

  // familia y también en los de sus alumnos, para poder acotar por

  // matrícula o por nombre de un hijo.

  const camposFamilia = [

    f => f.nombre,

    f => f.contacto,

    f => f.email,

    f => f.telefono,

    f => f.etiquetas,

    f => data.clientes.filter(c => c.familia_id === f.id)

          .map(c => [c.nombre, c.matricula, c.grado].filter(Boolean).join(' ')).join(' ')

  ];

  const familias = data.familias.filter(f => coincideEtiquetas(f, etiquetas, camposFamilia));

  // Paginacion local: sin esto se pintaban todas las familias de golpe.
  const pagFam = (typeof usePaginacion === 'function')
    ? usePaginacion(familias, 25)
    : { pagina: familias, total: familias.length, totalPaginas: 1, n: 1, tam: familias.length, ir: () => {}, cambiarTam: () => {} };

  const hijosDeFamily = fid => data.clientes.filter(c => c.familia_id === fid);

  const saldoFamily = fid => hijosDeFamily(fid).reduce((a, c) => a + (c.saldo_pendiente || 0), 0);

  const toggleExp = id => setExpanded(prev => ({

    ...prev,

    [id]: !prev[id]

  }));

  const fmtCLABE = clabe => clabe ? clabe.match(/.{1,4}/g).join(' ') : '—';



  // ── CLABE Pool: asignar desde pool (igual que Alumnos) ─────────────────────

  const _tkn = () => AuthController.getToken();

  const _apiPost = async (action, body) => {

    const res = await fetch('api.php?action=' + action, {

      method: 'POST',

      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _tkn() },

      body: JSON.stringify(body),

    });

    return res.json();

  };

  const _aplicarClabe = (dataBase, alumnoId, clabe) => ({

    ...dataBase,

    clientes: dataBase.clientes.map(c => c.id === alumnoId ? {

      ...c,

      clabe_individual: clabe,

      clabe_individual_estado: 'activa',

      clabe_individual_fecha: new Date().toISOString().slice(0, 10)

    } : c)

  });

  const asignarClabeDesdePool = async (alumno, dataBase) => {

    const eid = escuela_id || dataBase.escuelas?.[0]?.id;

    if (!eid || !alumno?.id) return;

    setClabeLoadingId(alumno.id);

    try {

      const res = await _apiPost('asignar_clabe_pool', { escuela_id: eid, cliente_id: alumno.id });

      if (!res.success) {

        const upd = {

          ...dataBase,

          clientes: dataBase.clientes.map(c => c.id === alumno.id ? {

            ...c, clabe_individual_estado: 'error', clabe_individual_error_msg: res.error || 'No hay CLABEs SPEI disponibles'

          } : c)

        };

        setData(upd); AppModel.save(upd);

        return;

      }

      const conClabe = _aplicarClabe(dataBase, alumno.id, res.clabe);

      setData(conClabe);

      AppModel.save(conClabe);

    } catch (e) { console.error('Error pool CLABE:', e.message); }

    finally { setClabeLoadingId(null); }

  };

  const liberarClabePool = async (alumno, dataBase) => {

    try { await _apiPost('liberar_clabe_pool', { cliente_id: alumno.id }); } catch(e) {}

    const upd = {

      ...dataBase,

      clientes: dataBase.clientes.map(c => c.id === alumno.id ? {

        ...c, clabe_individual: null, clabe_individual_estado: 'liberada'

      } : c)

    };

    setData(upd); AppModel.save(upd);

  };

  const regenerarClabe = async cliente => {

    await asignarClabeDesdePool(cliente, data);

  };



  // ── Activar/Desactivar hijo ────────────────────────────────────────────────

  // Al dar de baja (sale de la escuela) se libera su CLABE individual; al

  // reactivar (reingreso) se solicita una CLABE nueva de inmediato.

  const toggleHijo = async hijo => {

    const eraActivo = hijo.activo;

    try {

      await ClienteController.toggleActivo(hijo.id, eraActivo);

    } catch (e) {}

    const newData = {

      ...data,

      clientes: data.clientes.map(c => c.id === hijo.id ? {

        ...c,

        activo: !eraActivo

      } : c)

    };

    setData(newData);

    AppModel.save(newData);

    if (eraActivo) {

      if (hijo.clabe_individual) {

        await liberarClabePool(hijo, newData);

      }

    } else {

      const alumnoActualizado = newData.clientes.find(c => c.id === hijo.id);

      await asignarClabeDesdePool(alumnoActualizado, newData);

    }

  };

  const guardarFam = async () => {

    if (!formFam.nombre) return;

    if (!formFam.id && formFam.darAcceso && !formFam.email) {
      alert('Falta el correo electrónico para poder crear su acceso al portal.');
      return;
    }

    try {

      let familia;

      if (formFam.id) {

        familia = await ClienteController.editarFamilia(formFam);

        const newData = {

          ...data,

          familias: data.familias.map(f => f.id === familia.id ? {

            ...f,

            ...familia

          } : f)

        };

        setData(newData);

        AppModel.save(newData);

      } else {

        familia = await ClienteController.agregarFamilia(formFam, escuela_id);

        const newData = {

          ...data,

          familias: [...data.familias, {

            ...familia,

            activa: true

          }]

        };

        setData(newData);

        AppModel.save(newData);

        // La familia ya se creó — si además se pidió darle acceso al portal,
        // se crea la cuenta ligada (enlace de activación por correo, mismo
        // criterio que Usuarios.js). Si esto falla, la familia igual queda
        // creada — no se revierte nada, solo se avisa del error.
        if (formFam.darAcceso && formFam.email) {
          try {
            const resCuenta = await ApiClient.post('crear_usuario', {
              nombre: formFam.contacto || formFam.nombre,
              email: formFam.email,
              rol: 'familia',
              escuela_id,
              familia_id: familia.id,
            });
            if (!resCuenta.success) {
              alert(`La familia se creó, pero no se pudo dar de alta su acceso: ${resCuenta.error || 'error desconocido'}`);
            } else if (resCuenta.correo_enviado === false && resCuenta.activacion_liga) {
              setLigaActivacion({ liga: resCuenta.activacion_liga });
            }
          } catch (e) {
            alert(`La familia se creó, pero no se pudo dar de alta su acceso: ${e.message}`);
          }
        }

      }

    } catch (e) {

      alert('Error al guardar familia: ' + e.message);

    }

    setModal(null);

    setFormFam(EMPTY_FAM);

  };

  const guardarAlu = async () => {

    if (!formAlu.nombre) return;

    // Verificación de apellidos: es una CONFIRMACIÓN, nunca un bloqueo.
    // Los apellidos distintos son legítimos con frecuencia (familias
    // reconstituidas, madres solteras, tutela). El aviso solo aparece cuando
    // el parentesco declarado hace esperar que coincidan.
    if (!avisoApellido) {
      const fam = data.familias.find(f => f.id === targetFamId);
      const cfg = PARENTESCOS.find(p => p.id === formAlu.parentesco);
      if (fam && cfg && cfg.esperaApellido &&
          !_compartenApellido(formAlu.nombre, fam.nombre)) {
        setAvisoApellido({
          alumno: formAlu.nombre,
          familia: fam.nombre,
          parentesco: cfg.label
        });
        return;   // se detiene aquí hasta que la persona confirme
      }
    }
    setAvisoApellido(null);

    const aluConFam = {

      ...formAlu,

      familia_id: targetFamId

    };

    if (formAlu.id) {

      // Edición: no se toca la CLABE individual ya asignada

      try {

        const clienteActualizado = await ClienteController.editar(aluConFam);

        const newData = {

          ...data,

          clientes: data.clientes.map(c => c.id === clienteActualizado.id ? {

            ...c,

            ...clienteActualizado

          } : c)

        };

        setData(newData);

        AppModel.save(newData);

      } catch (e) {

        alert('Error al editar alumno: ' + e.message);

      }

      setModal(null);

      setFormAlu(EMPTY_ALU);

      setTargetFamId(null);

      return;

    }



    // Alta nueva: registrar en API, luego generar CLABE SPEI de inmediato

    try {

      const alumnoNuevo = await ClienteController.agregar(aluConFam, escuela_id);

      const newData = {

        ...data,

        clientes: [...data.clientes, {

          ...alumnoNuevo,

          activo: true,

          saldo_pendiente: 0,

          clabe_individual_estado: 'pendiente'

        }]

      };

      setData(newData);

      AppModel.save(newData);

      setModal(null);

      setFormAlu(EMPTY_ALU);

      setTargetFamId(null);

      await asignarClabeDesdePool(alumnoNuevo, newData);

    } catch (e) {

      alert('Error al dar de alta alumno: ' + e.message);

    }

  };

  const vincularAlumnoExistente = async alumno => {

    const famDestino = data.familias.find(f => f.id === targetFamId);

    const famOrigen = alumno.familia_id ? data.familias.find(f => f.id === alumno.familia_id) : null;

    const mensaje = famOrigen ? `¿Mover a "${alumno.nombre}" de la familia "${famOrigen.nombre}" a "${famDestino?.nombre || ''}"?` : `¿Vincular a "${alumno.nombre}" a la familia "${famDestino?.nombre || ''}"?`;

    if (!confirm(mensaje)) return;

    try {

      const clienteActualizado = await ClienteController.editar({

        id: alumno.id,

        familia_id: targetFamId

      });

      const newData = {

        ...data,

        clientes: data.clientes.map(c => c.id === alumno.id ? {

          ...c,

          ...clienteActualizado

        } : c)

      };

      setData(newData);

      AppModel.save(newData);

    } catch (e) {

      alert('Error al vincular alumno: ' + e.message);

    }

    setModal(null);

    setQVincular('');

    setTargetFamId(null);

  };

  const desvincularAlumno = async alumno => {

    const fam = alumno.familia_id ? data.familias.find(f => f.id === alumno.familia_id) : null;

    if (!confirm(`¿Desvincular a "${alumno.nombre}" de la familia "${fam?.nombre || ''}"? El alumno quedará sin familia asignada, pero seguirá existiendo en el sistema.`)) return;

    try {

      const clienteActualizado = await ClienteController.editar({

        id: alumno.id,

        familia_id: null

      });

      const newData = {

        ...data,

        clientes: data.clientes.map(c => c.id === alumno.id ? {

          ...c,

          ...clienteActualizado

        } : c)

      };

      setData(newData);

      AppModel.save(newData);

    } catch (e) {

      alert('Error al desvincular alumno: ' + e.message);

    }

  };

  return _jsxDEV("div", {

    children: [

      ligaActivacion && typeof ModalLigaCopiar !== 'undefined' && _jsxDEV(ModalLigaCopiar, {
        liga: ligaActivacion.liga,
        titulo: 'No se pudo mandar el correo',
        mensaje: 'Comparte este enlace para que la familia active su cuenta y ponga su propia contraseña — expira en 72 horas.',
        onCerrar: () => setLigaActivacion(null)
      }, void 0, false),

      _jsxDEV("div", {

      className: "card",

      children: [_jsxDEV("div", {

        className: "card-header",

        children: [_jsxDEV("div", {

          children: [_jsxDEV("div", {

            className: "card-title",

            children: "Familias"

          }, void 0, false), _jsxDEV("div", {

            className: "card-sub",

            children: [data.familias.length, " familias · ", data.clientes.filter(c => c.familia_id).length, " alumnos agrupados"]

          }, void 0, true)]

        }, void 0, true), _jsxDEV("button", {

          className: "btn btn-primary",

          onClick: () => {

            setFormFam(EMPTY_FAM);

            setModal('familia');

          },

          children: "+ Nueva familia"

        }, void 0, false)]

      }, void 0, true), _jsxDEV("div", {

        style: {

          marginBottom: 16

        },

        children: _jsxDEV(BuscadorEtiquetas, {

          etiquetas: etiquetas,

          onCambio: setEtiquetas,

          placeholder: "Escribe un apellido y presiona Enter\u2026",

          sugerencias: ['apellidos', 'nombre del tutor', 'matr\u00edcula', 'tel\u00e9fono', 'correo']

        }, void 0, false)

      }, void 0, false), familias.length === 0 && _jsxDEV("div", {

        className: "empty-state",

        children: [_jsxDEV("div", {

          className: "empty-icon",

          children: _jsxDEV(Icon, {

            name: "familias",

            size: 36,

            color: "currentColor"

          }, void 0, false)

        }, void 0, false), _jsxDEV("div", {

          className: "empty-text",

          children: "Sin familias registradas"

        }, void 0, false), _jsxDEV("div", {

          className: "empty-sub",

          children: "Las familias agrupan alumnos del mismo hogar"

        }, void 0, false)]

      }, void 0, true), pagFam.pagina.map(fam => {

        const hijos = hijosDeFamily(fam.id);

        const saldo = saldoFamily(fam.id);

        const isOpen = expanded[fam.id];

        return _jsxDEV("div", {

          style: {

            border: '1px solid var(--border-glow)',

            borderRadius: 'var(--radius)',

            marginBottom: 10,

            overflow: 'hidden',

            transition: 'all .2s'

          },

          children: [_jsxDEV("div", {

            style: {

              display: 'flex',

              alignItems: 'center',

              gap: 12,

              padding: '13px 16px',

              cursor: 'pointer',

              background: isOpen ? 'var(--accent-glow)' : 'var(--glass-light)',

              borderBottom: isOpen ? '1px solid var(--border-glow)' : 'none',

              transition: 'background .2s'

            },

            onClick: () => toggleExp(fam.id),

            children: [_jsxDEV("div", {

              style: {

                width: 40,

                height: 40,

                borderRadius: 10,

                background: 'var(--accent-glow)',

                border: '1px solid var(--border-active)',

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                fontSize: 20,

                flexShrink: 0

              },

              children: _jsxDEV(Icon, {

                name: "familias",

                size: 20,

                color: "currentColor"

              }, void 0, false)

            }, void 0, false), _jsxDEV("div", {

              style: {

                flex: 1,

                minWidth: 0

              },

              children: [_jsxDEV("div", {

                style: {

                  fontWeight: 600,

                  fontSize: 14,

                  color: 'var(--ink)'

                },

                children: fam.nombre

              }, void 0, false), _jsxDEV("div", {

                style: {

                  fontSize: 12,

                  color: 'var(--ink-3)',

                  marginTop: 2

                },

                children: [fam.contacto, " · ", fam.email, hijos.length > 0 && _jsxDEV("span", {

                  style: {

                    marginLeft: 8

                  },

                  children: ["· ", hijos.length, " alumno", hijos.length !== 1 ? 's' : '']

                }, void 0, true)]

              }, void 0, true)]

            }, void 0, true), saldo > 0 && _jsxDEV("span", {

              style: {

                fontFamily: 'var(--mono)',

                fontSize: 13,

                fontWeight: 700,

                color: 'var(--amber)',

                flexShrink: 0

              },

              children: [fmt(saldo), " pendiente"]

            }, void 0, true), saldo === 0 && hijos.length > 0 && _jsxDEV("span", {

              className: "badge badge-green",

              style: {

                flexShrink: 0

              },

              children: [_jsxDEV(Icon, {

                name: "check",

                size: 11,

                color: "currentColor"

              }, void 0, false), " Al corriente"]

            }, void 0, true), _jsxDEV("div", {

              style: {

                display: 'flex',

                gap: 6,

                flexShrink: 0

              },

              children: [_jsxDEV("button", {

                className: "btn btn-ghost btn-sm",

                onClick: e => {

                  e.stopPropagation();

                  setFormFam({

                    ...fam

                  });

                  setModal('familia');

                },

                style: {

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center'

                },

                children: _jsxDEV(Icon, {

                  name: "edit",

                  size: 14,

                  color: "currentColor"

                }, void 0, false)

              }, void 0, false), _jsxDEV("button", {

                className: "btn btn-secondary btn-sm",

                onClick: e => {

                  e.stopPropagation();

                  setTargetFamId(fam.id);

                  setFormAlu({

                    ...EMPTY_ALU,

                    familia_id: fam.id

                  });

                  setModal('alumno');

                },

                children: "+ Añadir estudiante"

              }, void 0, false), _jsxDEV("button", {

                className: "btn btn-secondary btn-sm",

                title: "Ver ficha del tutor",

                onClick: () => setFichaTutor(fam),

                children: [_jsxDEV(Icon, { name: 'usuarios', size: 13, color: 'currentColor' }, 'i', false), " Ficha"]

              }, 'fichaTutor', true), _jsxDEV("button", {

                className: "btn btn-ghost btn-sm",

                onClick: e => {

                  e.stopPropagation();

                  setTargetFamId(fam.id);

                  setQVincular('');

                  setModal('vincular');

                },

                title: "Vincular un alumno que ya existe en el sistema",

                children: "🔗 Vincular existente"

              }, void 0, false)]

            }, void 0, true), _jsxDEV("span", {

              style: {

                color: 'var(--ink-4)',

                fontSize: 18,

                flexShrink: 0

              },

              children: isOpen ? _jsxDEV(Icon, {

                name: "chevronDown",

                size: 18,

                color: "currentColor"

              }, void 0, false) : _jsxDEV(Icon, {

                name: "arrowRight",

                size: 16,

                color: "currentColor"

              }, void 0, false)

            }, void 0, false)]

          }, void 0, true), isOpen && _jsxDEV("div", {

            style: {

              padding: '0 16px'

            },

            children: [hijos.length === 0 && _jsxDEV("div", {

              style: {

                padding: '16px 0',

                textAlign: 'center',

                color: 'var(--ink-4)',

                fontSize: 13

              },

              children: "Sin estudiantes agregados — haz clic en \"+ Añadir estudiante\""

            }, void 0, false), hijos.map((hijo, i) => _jsxDEV("div", {

              style: {

                display: 'flex',

                alignItems: 'center',

                gap: 12,

                padding: '11px 0',

                borderBottom: i < hijos.length - 1 ? '1px solid var(--glass-light)' : 'none'

              },

              children: [_jsxDEV("div", {

                style: {

                  width: 32,

                  height: 32,

                  borderRadius: 8,

                  background: 'var(--glass-light)',

                  border: '1px solid var(--border-glow)',

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center',

                  fontSize: 12,

                  fontWeight: 700,

                  color: 'var(--ink-3)',

                  flexShrink: 0

                },

                children: hijo.nombre.charAt(0)

              }, void 0, false), _jsxDEV("div", {

                style: {

                  flex: 1,

                  minWidth: 0

                },

                children: [_jsxDEV("div", {

                  style: {

                    fontSize: 13,

                    fontWeight: 500,

                    color: 'var(--ink)',

                    display: 'flex',

                    alignItems: 'center',

                    gap: 8

                  },

                  children: [hijo.nombre, !hijo.activo && _jsxDEV("span", {

                    className: "badge badge-gray",

                    children: "Inactivo"

                  }, void 0, false)]

                }, void 0, true), _jsxDEV("div", {

                  style: {

                    fontSize: 11.5,

                    color: 'var(--ink-3)',

                    marginTop: 2

                  },

                  children: [hijo.grado, " · Mat: ", _jsxDEV("span", {

                    style: {

                      fontFamily: 'var(--mono)'

                    },

                    children: hijo.matricula || '—'

                  }, void 0, false)]

                }, void 0, true), _jsxDEV("div", {

                  style: {

                    fontSize: 11,

                    color: 'var(--ink-4)',

                    marginTop: 2,

                    display: 'flex',

                    alignItems: 'center',

                    gap: 6

                  },

                  children: [_jsxDEV(Icon, {

                    name: "bank",

                    size: 11,

                    color: "currentColor"

                  }, void 0, false), clabeLoadingId === hijo.id ? _jsxDEV("span", {

                    style: {

                      display: 'inline-flex',

                      alignItems: 'center',

                      gap: 5

                    },

                    children: [_jsxDEV("span", {

                      className: "spinner",

                      style: {

                        width: 10,

                        height: 10

                      }

                    }, void 0, false), " Generando CLABE…"]

                  }, void 0, true) : hijo.clabe_individual_estado === 'activa' && hijo.clabe_individual ? _jsxDEV("span", {

                    style: {

                      fontFamily: 'var(--mono)',

                      letterSpacing: .4

                    },

                    children: fmtCLABE(hijo.clabe_individual)

                  }, void 0, false) : hijo.clabe_individual_estado === 'liberada' ? _jsxDEV("span", {

                    children: "CLABE liberada"

                  }, void 0, false) : hijo.clabe_individual_estado === 'error' ? _jsxDEV("span", {

                    style: {

                      display: 'inline-flex',

                      alignItems: 'center',

                      gap: 5,

                      color: 'var(--red)'

                    },

                    children: [hijo.clabe_individual_error_msg || 'No hay CLABEs SPEI disponibles', _jsxDEV("button", {

                      className: "btn btn-ghost btn-sm",

                      style: {

                        padding: '1px 6px',

                        fontSize: 10.5

                      },

                      onClick: () => regenerarClabe(hijo),

                      children: "Reintentar"

                    }, void 0, false)]

                  }, void 0, true) : hijo.activo ? _jsxDEV("span", {

                    style: {

                      display: 'inline-flex',

                      alignItems: 'center',

                      gap: 5

                    },

                    children: ["CLABE pendiente", _jsxDEV("button", {

                      className: "btn btn-ghost btn-sm",

                      style: {

                        padding: '1px 6px',

                        fontSize: 10.5

                      },

                      onClick: () => regenerarClabe(hijo),

                      children: "Generar"

                    }, void 0, false)]

                  }, void 0, true) : _jsxDEV("span", {

                    children: "Sin CLABE"

                  }, void 0, false)]

                }, void 0, true)]

              }, void 0, true), hijo.saldo_pendiente > 0 ? _jsxDEV("span", {

                style: {

                  fontFamily: 'var(--mono)',

                  fontSize: 12,

                  color: 'var(--red)',

                  fontWeight: 600

                },

                children: fmt(hijo.saldo_pendiente)

              }, void 0, false) : _jsxDEV("span", {

                style: {

                  fontSize: 12,

                  color: 'var(--green)',

                  display: 'inline-flex',

                  alignItems: 'center',

                  gap: 4

                },

                children: [_jsxDEV(Icon, {

                  name: "check",

                  size: 11,

                  color: "currentColor"

                }, void 0, false), " Al corriente"]

              }, void 0, true), _jsxDEV("button", {

                className: "btn btn-ghost btn-sm",

                onClick: () => {

                  setFormAlu({

                    ...hijo

                  });

                  setTargetFamId(hijo.familia_id);

                  setModal('alumno');

                },

                style: {

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center'

                },

                children: _jsxDEV(Icon, {

                  name: "edit",

                  size: 14,

                  color: "currentColor"

                }, void 0, false)

              }, void 0, false), _jsxDEV("button", {

                className: "btn btn-ghost btn-sm",

                onClick: () => toggleHijo(hijo),

                title: hijo.activo ? 'Dar de baja (libera su CLABE)' : 'Reactivar (genera nueva CLABE)',

                style: {

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center'

                },

                children: hijo.activo ? _jsxDEV(Icon, {

                  name: "shield",

                  size: 14,

                  color: "currentColor"

                }, void 0, false) : _jsxDEV(Icon, {

                  name: "eyeOff",

                  size: 14,

                  color: "currentColor"

                }, void 0, false)

              }, void 0, false), _jsxDEV("button", {

                className: "btn btn-ghost btn-sm",

                onClick: () => desvincularAlumno(hijo),

                title: "Desvincular de esta familia",

                style: {

                  display: 'flex',

                  alignItems: 'center',

                  justifyContent: 'center'

                },

                children: _jsxDEV(Icon, {

                  name: "close",

                  size: 14,

                  color: "currentColor"

                }, void 0, false)

              }, void 0, false)]

            }, hijo.id, true))]

          }, void 0, true)]

        }, fam.id, true);

      }), ((typeof Paginador !== 'undefined' && familias.length > 0)

        ? _jsxDEV(Paginador, { ctrl: pagFam, etiqueta: 'familias' }, 'pagfam', false)

        : null), (() => {

        const sinFamilia = data.clientes.filter(c => !c.familia_id && c.activo);

        if (!sinFamilia.length) return null;

        return _jsxDEV("div", {

          style: {

            marginTop: 24

          },

          children: [_jsxDEV("div", {

            style: {

              fontSize: 11,

              color: 'var(--ink-4)',

              fontWeight: 600,

              textTransform: 'uppercase',

              letterSpacing: '.5px',

              marginBottom: 10

            },

            children: ["Alumnos sin familia asignada (", sinFamilia.length, ")"]

          }, void 0, true), sinFamilia.map(alu => _jsxDEV("div", {

            style: {

              display: 'flex',

              alignItems: 'center',

              gap: 10,

              padding: '9px 12px',

              background: 'var(--glass-light)',

              borderRadius: 'var(--radius-sm)',

              marginBottom: 6

            },

            children: [_jsxDEV("div", {

              style: {

                width: 30,

                height: 30,

                borderRadius: 7,

                background: 'var(--glass-hover)',

                display: 'flex',

                alignItems: 'center',

                justifyContent: 'center',

                fontSize: 12,

                fontWeight: 700,

                color: 'var(--ink-3)',

                flexShrink: 0

              },

              children: alu.nombre.charAt(0)

            }, void 0, false), _jsxDEV("div", {

              style: {

                flex: 1

              },

              children: [_jsxDEV("div", {

                style: {

                  fontSize: 13,

                  fontWeight: 500

                },

                children: alu.nombre

              }, void 0, false), _jsxDEV("div", {

                style: {

                  fontSize: 11.5,

                  color: 'var(--ink-3)'

                },

                children: [alu.grado, " · ", alu.matricula]

              }, void 0, true)]

            }, void 0, true), alu.saldo_pendiente > 0 ? _jsxDEV("span", {

              style: {

                fontFamily: 'var(--mono)',

                fontSize: 12,

                color: 'var(--red)'

              },

              children: fmt(alu.saldo_pendiente)

            }, void 0, false) : _jsxDEV("span", {

              style: {

                fontSize: 12,

                color: 'var(--green)'

              },

              children: _jsxDEV(Icon, {

                name: "check",

                size: 11,

                color: "currentColor"

              }, void 0, false)

            }, void 0, false)]

          }, alu.id, true))]

        }, void 0, true);

      })()]

    }, void 0, true), modal === 'familia' && _jsxDEV("div", {

      className: "modal-backdrop",

      onClick: e => e.target === e.currentTarget && setModal(null),

      children: _jsxDEV("div", {

        className: "modal",

        children: [_jsxDEV("div", {

          className: "modal-header",

          children: [_jsxDEV("div", {

            className: "modal-title",

            children: [formFam.id ? 'Editar' : 'Nueva', " familia"]

          }, void 0, true), _jsxDEV("button", {

            className: "btn btn-ghost btn-sm",

            onClick: () => setModal(null),

            children: _jsxDEV(Icon, {

              name: "close",

              size: 16,

              color: "currentColor"

            }, void 0, false)

          }, void 0, false)]

        }, void 0, true), _jsxDEV("div", {

          className: "modal-body",

          children: [_jsxDEV("div", {

            className: "form-group",

            children: [_jsxDEV("label", {

              className: "form-label",

              children: "Nombre de la familia *"

            }, void 0, false), _jsxDEV("input", {

              className: "form-input",

              placeholder: "Ej: Familia García López",

              value: formFam.nombre,

              onChange: e => setFormFam(f => ({

                ...f,

                nombre: e.target.value

              }))

            }, void 0, false)]

          }, void 0, true), _jsxDEV("div", {

            className: "form-group",

            children: [_jsxDEV("label", {

              className: "form-label",

              children: "Contacto principal"

            }, void 0, false), _jsxDEV("input", {

              className: "form-input",

              placeholder: "Nombre del papá/mamá/tutor",

              value: formFam.contacto,

              onChange: e => setFormFam(f => ({

                ...f,

                contacto: e.target.value

              }))

            }, void 0, false)]

          }, void 0, true), _jsxDEV("div", {

            style: {

              display: 'grid',

              gridTemplateColumns: '1fr 1fr',

              gap: 12

            },

            children: [_jsxDEV("div", {

              className: "form-group",

              children: [_jsxDEV("label", {

                className: "form-label",

                children: "Teléfono"

              }, void 0, false), _jsxDEV("input", {

                className: "form-input",

                placeholder: "9991234567",

                value: formFam.tel,

                onChange: e => setFormFam(f => ({

                  ...f,

                  tel: e.target.value

                })),

                style: {

                  fontFamily: 'var(--mono)'

                }

              }, void 0, false)]

            }, void 0, true), _jsxDEV("div", {

              className: "form-group",

              children: [_jsxDEV("label", {

                className: "form-label",

                children: "Correo electrónico"

              }, void 0, false), _jsxDEV("input", {

                className: "form-input",

                type: "email",

                placeholder: "familia@mail.com",

                value: formFam.email,

                onChange: e => setFormFam(f => ({

                  ...f,

                  email: e.target.value

                }))

              }, void 0, false)]

            }, void 0, true)]

          }, void 0, true),

          !formFam.id && _jsxDEV("label", {
            style: {
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4,
              fontSize: 12.5, color: 'var(--ink-3)', cursor: 'pointer', userSelect: 'none'
            },
            children: [_jsxDEV("input", {
              type: "checkbox",
              checked: !!formFam.darAcceso,
              onChange: e => setFormFam(f => ({ ...f, darAcceso: e.target.checked }))
            }, void 0, false),
            "Darle acceso al portal a este correo (crea su cuenta y le manda un enlace para poner su contraseña)"]
          }, void 0, true),
          formFam.darAcceso && !formFam.email && _jsxDEV("div", {
            style: { fontSize: 11.5, color: 'var(--amber)', marginBottom: 8 },
            children: "Falta el correo electrónico para poder crear su acceso."
          }, void 0, false),

          _jsxDEV("div", {

            style: {

              marginTop: 18,

              paddingTop: 16,

              borderTop: '1px solid var(--border-glow)'

            },

            children: [_jsxDEV("div", {

              style: {

                fontSize: 11,

                color: 'var(--ink-4)',

                fontWeight: 600,

                textTransform: 'uppercase',

                letterSpacing: '.4px',

                marginBottom: 12

              },

              children: "Datos fiscales (para facturación CFDI)"

            }, void 0, false), _jsxDEV("div", {

              style: {

                marginBottom: 10,

                padding: '8px 12px',

                background: 'var(--accent-glow)',

                borderRadius: 'var(--radius-sm)',

                fontSize: 11.5,

                color: 'var(--ink-2)',

                lineHeight: 1.6

              },

              children: "Al registrar estos datos, el formulario de CFDI se pre-llenará automáticamente para todos los hijos de esta familia."

            }, void 0, false), _jsxDEV("div", {

              style: {

                display: 'grid',

                gridTemplateColumns: '1fr 1fr',

                gap: 12

              },

              children: [_jsxDEV("div", {

                className: "form-group",

                children: [_jsxDEV("label", {

                  className: "form-label",

                  children: "RFC del receptor"

                }, void 0, false), _jsxDEV("input", {

                  className: "form-input",

                  placeholder: "XAXX010101000",

                  value: formFam.rfc_factura || '',

                  onChange: e => setFormFam(f => ({

                    ...f,

                    rfc_factura: e.target.value.toUpperCase().replace(/\s/g, '')

                  })),

                  style: {

                    fontFamily: 'var(--mono)',

                    letterSpacing: 1

                  }

                }, void 0, false)]

              }, void 0, true), _jsxDEV("div", {

                className: "form-group",

                children: [_jsxDEV("label", {

                  className: "form-label",

                  children: "Código Postal fiscal"

                }, void 0, false), _jsxDEV("input", {

                  className: "form-input",

                  placeholder: "Ej. 97000",

                  value: formFam.cp_factura || '',

                  onChange: e => setFormFam(f => ({

                    ...f,

                    cp_factura: e.target.value

                  })),

                  style: {

                    fontFamily: 'var(--mono)'

                  }

                }, void 0, false)]

              }, void 0, true), _jsxDEV("div", {

                className: "form-group",

                style: {

                  gridColumn: '1/-1'

                },

                children: [_jsxDEV("label", {

                  className: "form-label",

                  children: "Razón social"

                }, void 0, false), _jsxDEV("input", {

                  className: "form-input",

                  placeholder: "NOMBRE COMPLETO EN MAYÚSCULAS",

                  value: formFam.razon_social_factura || '',

                  onChange: e => setFormFam(f => ({

                    ...f,

                    razon_social_factura: e.target.value.toUpperCase()

                  }))

                }, void 0, false)]

              }, void 0, true), _jsxDEV("div", {

                className: "form-group",

                style: {

                  gridColumn: '1/-1'

                },

                children: [_jsxDEV("label", {

                  className: "form-label",

                  children: "Domicilio fiscal"

                }, void 0, false), _jsxDEV("input", {

                  className: "form-input",

                  placeholder: "Calle, Número, Colonia, Ciudad, Estado, CP",

                  value: formFam.domicilio_factura || '',

                  onChange: e => setFormFam(f => ({

                    ...f,

                    domicilio_factura: e.target.value

                  }))

                }, void 0, false)]

              }, void 0, true), _jsxDEV("div", {

                className: "form-group",

                children: [_jsxDEV("label", {

                  className: "form-label",

                  children: "Régimen fiscal"

                }, void 0, false), _jsxDEV("select", {

                  className: "form-select",

                  value: formFam.regimen_factura || '616',

                  onChange: e => setFormFam(f => ({

                    ...f,

                    regimen_factura: e.target.value

                  })),

                  children: [_jsxDEV("option", {

                    value: "616",

                    children: "616 — Sin obligaciones fiscales"

                  }, void 0, false), _jsxDEV("option", {

                    value: "601",

                    children: "601 — General Personas Morales"

                  }, void 0, false), _jsxDEV("option", {

                    value: "612",

                    children: "612 — Personas Físicas con Actividades Empresariales"

                  }, void 0, false), _jsxDEV("option", {

                    value: "626",

                    children: "626 — RESICO"

                  }, void 0, false)]

                }, void 0, true)]

              }, void 0, true), _jsxDEV("div", {

                className: "form-group",

                children: [_jsxDEV("label", {

                  className: "form-label",

                  children: "Uso del CFDI por defecto"

                }, void 0, false), _jsxDEV("select", {

                  className: "form-select",

                  value: formFam.uso_cfdi_defecto || 'D10',

                  onChange: e => setFormFam(f => ({

                    ...f,

                    uso_cfdi_defecto: e.target.value

                  })),

                  children: [_jsxDEV("option", {

                    value: "D10",

                    children: "D10 — Servicios educativos"

                  }, void 0, false), _jsxDEV("option", {

                    value: "G03",

                    children: "G03 — Gastos en general"

                  }, void 0, false), _jsxDEV("option", {

                    value: "S01",

                    children: "S01 — Sin efectos fiscales"

                  }, void 0, false)]

                }, void 0, true)]

              }, void 0, true)]

            }, void 0, true)]

          }, void 0, true)]

        }, void 0, true), _jsxDEV("div", {

          className: "modal-footer",

          children: [_jsxDEV("button", {

            className: "btn btn-secondary",

            onClick: () => setModal(null),

            children: "Cancelar"

          }, void 0, false), _jsxDEV("button", {

            className: "btn btn-primary",

            onClick: guardarFam,

            disabled: !formFam.nombre,

            children: "Guardar"

          }, void 0, false)]

        }, void 0, true)]

      }, void 0, true)

    }, void 0, false), fichaTutor && typeof FichaTecnica !== 'undefined' && _jsxDEV(FichaTecnica, {

      tipo: 'tutor',

      registro: fichaTutor,

      extra: (() => {

        const hijos = data.clientes.filter(c => c.familia_id === fichaTutor.id);

        const saldo = hijos.reduce((a, c) => a + (Number(c.saldo_pendiente) || 0), 0);

        return {

          alumnos: hijos.length,

          saldo: saldo,

          saldoTexto: '$' + saldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })

        };

      })(),

      onCerrar: () => setFichaTutor(null),

      onGuardarFoto: async url => {

        const res = await fetch('api.php?action=editar_familia', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },

          body: JSON.stringify({ id: fichaTutor.id, foto_url: url })

        }).then(r => r.json());

        if (res && res.success !== false) {

          setFichaTutor(f => f ? { ...f, foto_url: url } : f);

          setData(prev => ({

            ...prev,

            familias: (prev.familias || []).map(f => f.id === fichaTutor.id ? { ...f, foto_url: url } : f)

          }));

        }

        return res;

      }

    }, 'fichaT', false), avisoApellido && _jsxDEV("div", {

      className: "modal-backdrop",

      style: { zIndex: 1100 },   // por encima del modal de alumno (1000)

      onClick: () => setAvisoApellido(null),

      children: _jsxDEV("div", {

        className: "modal",

        style: { maxWidth: 430 },

        onClick: e => e.stopPropagation(),

        children: [_jsxDEV("div", {

          className: "modal-header",

          children: _jsxDEV("div", {

            className: "modal-title",

            style: { display: 'flex', alignItems: 'center', gap: 9 },

            children: [_jsxDEV(Icon, { name: 'warning', size: 17, color: 'var(--amber)' }, 'i', false), "Revisa los apellidos"]

          }, void 0, true)

        }, 'h', false), _jsxDEV("div", {

          className: "modal-body",

          style: { fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)' },

          children: [_jsxDEV("p", {

            style: { margin: '0 0 12px' },

            children: ["Registraste a ", _jsxDEV("strong", { children: avisoApellido.alumno }, 'a', false),

                       " como ", _jsxDEV("strong", { children: avisoApellido.parentesco.toLowerCase() }, 'p', false),

                       " de la familia ", _jsxDEV("strong", { children: avisoApellido.familia }, 'f', false),

                       ", pero no comparten ning\u00fan apellido."]

          }, 'p1', true), _jsxDEV("div", {

            style: {

              padding: '10px 13px', borderRadius: 'var(--radius-sm)',

              background: 'var(--amber-glow)', color: 'var(--ink-2)', fontSize: 12.5

            },

            children: "Si es correcto, contin\u00faa. Si te equivocaste de familia o de parentesco, corr\u00edgelo antes de guardar."

          }, 'nota', false)]

        }, 'b', true), _jsxDEV("div", {

          className: "modal-footer",

          children: [_jsxDEV("button", {

            className: "btn btn-secondary",

            onClick: () => setAvisoApellido(null),

            children: "Volver y corregir"

          }, 'c', false), _jsxDEV("button", {

            className: "btn btn-primary",

            onClick: () => guardarAlu(),

            children: "S\u00ed, es correcto"

          }, 'ok', false)]

        }, 'f', true)]

      }, void 0, true)

    }, 'aviso', false), modal === 'alumno' && _jsxDEV("div", {

      className: "modal-backdrop",

      onClick: e => e.target === e.currentTarget && setModal(null),

      children: _jsxDEV("div", {

        className: "modal",

        children: [_jsxDEV("div", {

          className: "modal-header",

          children: [_jsxDEV("div", {

            className: "modal-title",

            children: [formAlu.id ? 'Editar' : 'Agregar', " alumno"]

          }, void 0, true), _jsxDEV("button", {

            className: "btn btn-ghost btn-sm",

            onClick: () => setModal(null),

            children: _jsxDEV(Icon, {

              name: "close",

              size: 16,

              color: "currentColor"

            }, void 0, false)

          }, void 0, false)]

        }, void 0, true), _jsxDEV("div", {

          className: "modal-body",

          children: [targetFamId && _jsxDEV("div", {

            className: "form-group",

            children: [_jsxDEV("label", {

              className: "form-label",

              children: "Parentesco con la familia"

            }, void 0, false), _jsxDEV("select", {

              className: "form-select",

              value: formAlu.parentesco || '',

              onChange: e => { setFormAlu({ ...formAlu, parentesco: e.target.value }); setAvisoApellido(null); },

              children: [_jsxDEV("option", { value: "", children: "Selecciona\u2026" }, 'v', false)]

                .concat(PARENTESCOS.map(p => _jsxDEV("option", { value: p.id, children: p.label }, p.id, false)))

            }, void 0, false)]

          }, 'parentesco', true), targetFamId && _jsxDEV("div", {

            style: {

              marginBottom: 14,

              padding: '8px 12px',

              background: 'var(--accent-glow)',

              borderRadius: 'var(--radius-sm)',

              fontSize: 12,

              color: 'var(--ink-2)'

            },

            children: [_jsxDEV("span", {

              style: {

                display: "inline-flex",

                alignItems: "center",

                gap: 6

              },

              children: [_jsxDEV(Icon, {

                name: "familias",

                size: 14,

                color: "currentColor"

              }, void 0, false), " Familia:"]

            }, void 0, true), " ", _jsxDEV("strong", {

              children: data.familias.find(f => f.id === targetFamId)?.nombre

            }, void 0, false)]

          }, void 0, true), _jsxDEV("div", {

            className: "form-group",

            children: [_jsxDEV("label", {

              className: "form-label",

              children: "Nombre completo *"

            }, void 0, false), _jsxDEV("input", {

              className: "form-input",

              placeholder: "Nombre del alumno",

              value: formAlu.nombre,

              onChange: e => setFormAlu(f => ({

                ...f,

                nombre: e.target.value

              }))

            }, void 0, false)]

          }, void 0, true), _jsxDEV("div", {

            style: {

              display: 'grid',

              gridTemplateColumns: '1fr 1fr',

              gap: 12

            },

            children: [_jsxDEV("div", {

              className: "form-group",

              children: [_jsxDEV("label", {

                className: "form-label",

                children: "Grado / Grupo"

              }, void 0, false), _jsxDEV("input", {

                className: "form-input",

                placeholder: "3° Primaria",

                value: formAlu.grado,

                onChange: e => setFormAlu(f => ({

                  ...f,

                  grado: e.target.value

                }))

              }, void 0, false)]

            }, void 0, true), _jsxDEV("div", {

              className: "form-group",

              children: [_jsxDEV("label", {

                className: "form-label",

                children: "Matrícula"

              }, void 0, false), _jsxDEV("input", {

                className: "form-input",

                placeholder: "ITM-2024-001",

                value: formAlu.matricula,

                onChange: e => setFormAlu(f => ({

                  ...f,

                  matricula: e.target.value.toUpperCase()

                })),

                style: {

                  fontFamily: 'var(--mono)'

                }

              }, void 0, false)]

            }, void 0, true)]

          }, void 0, true), _jsxDEV("div", {

            className: "form-group",

            children: [_jsxDEV("label", {

              className: "form-label",

              children: "CURP"

            }, void 0, false), _jsxDEV("input", {

              className: "form-input",

              placeholder: "CURP",

              value: formAlu.curp,

              onChange: e => setFormAlu(f => ({

                ...f,

                curp: e.target.value.toUpperCase()

              })),

              style: {

                fontFamily: 'var(--mono)'

              }

            }, void 0, false)]

          }, void 0, true), _jsxDEV("div", {

            style: {

              display: 'grid',

              gridTemplateColumns: '1fr 1fr',

              gap: 12

            },

            children: [_jsxDEV("div", {

              className: "form-group",

              children: [_jsxDEV("label", {

                className: "form-label",

                children: "Correo"

              }, void 0, false), _jsxDEV("input", {

                className: "form-input",

                type: "email",

                value: formAlu.email,

                onChange: e => setFormAlu(f => ({

                  ...f,

                  email: e.target.value

                }))

              }, void 0, false)]

            }, void 0, true), _jsxDEV("div", {

              className: "form-group",

              children: [_jsxDEV("label", {

                className: "form-label",

                children: "Teléfono"

              }, void 0, false), _jsxDEV("input", {

                className: "form-input",

                value: formAlu.tel,

                onChange: e => setFormAlu(f => ({

                  ...f,

                  tel: e.target.value

                })),

                style: {

                  fontFamily: 'var(--mono)'

                }

              }, void 0, false)]

            }, void 0, true)]

          }, void 0, true), !formAlu.id && _jsxDEV("div", {

            style: {

              marginTop: 6,

              padding: '8px 12px',

              background: 'var(--accent-glow)',

              borderRadius: 'var(--radius-sm)',

              fontSize: 11.5,

              color: 'var(--ink-2)',

              lineHeight: 1.6

            },

            children: [_jsxDEV(Icon, {

              name: "bank",

              size: 13,

              color: "currentColor"

            }, void 0, false), " Al guardar, se generará automáticamente una CLABE SPEI individual para este alumno."]

          }, void 0, true)]

        }, void 0, true), _jsxDEV("div", {

          className: "modal-footer",

          children: [_jsxDEV("button", {

            className: "btn btn-secondary",

            onClick: () => setModal(null),

            children: "Cancelar"

          }, void 0, false), _jsxDEV("button", {

            className: "btn btn-primary",

            onClick: guardarAlu,

            disabled: !formAlu.nombre,

            children: "Guardar"

          }, void 0, false)]

        }, void 0, true)]

      }, void 0, true)

    }, void 0, false), modal === 'vincular' && _jsxDEV("div", {

      className: "modal-backdrop",

      onClick: e => e.target === e.currentTarget && setModal(null),

      children: _jsxDEV("div", {

        className: "modal",

        children: [_jsxDEV("div", {

          className: "modal-header",

          children: [_jsxDEV("div", {

            className: "modal-title",

            children: "Vincular alumno existente"

          }, void 0, false), _jsxDEV("button", {

            className: "btn btn-ghost btn-sm",

            onClick: () => setModal(null),

            children: _jsxDEV(Icon, {

              name: "close",

              size: 16,

              color: "currentColor"

            }, void 0, false)

          }, void 0, false)]

        }, void 0, true), _jsxDEV("div", {

          className: "search-bar",

          style: {

            margin: '10px 18px 0'

          },

          children: [_jsxDEV("span", {

            className: "search-icon",

            children: _jsxDEV(Icon, {

              name: "search",

              size: 15,

              color: "currentColor"

            }, void 0, false)

          }, void 0, false), _jsxDEV("input", {

            placeholder: "Buscar por nombre, matrícula o grado…",

            value: qVincular,

            onChange: e => setQVincular(e.target.value),

            autoFocus: true

          }, void 0, false)]

        }, void 0, true), _jsxDEV("div", {

          className: "modal-body",

          style: {

            padding: '10px 18px'

          },

          children: (() => {

            const candidatos = data.clientes.filter(c => {

              if (c.tipo !== 'alumno' || !c.activo) return false;

              if (c.escuela_id !== escuela_id) return false;

              if (c.familia_id === targetFamId) return false;

              if (!qVincular) return true;

              const texto = [c.nombre, c.matricula, c.grado].filter(Boolean).join(' ').toLowerCase();

              return texto.includes(qVincular.toLowerCase());

            });

            if (candidatos.length === 0) {

              return _jsxDEV("div", {

                className: "empty-state",

                children: _jsxDEV("div", {

                  className: "empty-text",

                  children: "Sin alumnos disponibles para vincular"

                }, void 0, false)

              }, void 0, false);

            }

            return candidatos.map(c => {

              const famActual = c.familia_id ? data.familias.find(f => f.id === c.familia_id) : null;

              return _jsxDEV("div", {

                onClick: () => vincularAlumnoExistente(c),

                style: {

                  display: 'flex',

                  alignItems: 'center',

                  gap: 10,

                  padding: '10px 8px',

                  borderRadius: 'var(--radius-sm)',

                  cursor: 'pointer',

                  borderBottom: '1px solid var(--glass-light)',

                  transition: 'background .15s'

                },

                onMouseEnter: e => e.currentTarget.style.background = 'var(--glass-light)',

                onMouseLeave: e => e.currentTarget.style.background = 'transparent',

                children: [_jsxDEV("div", {

                  className: "avatar avatar-admin",

                  children: c.nombre.charAt(0)

                }, void 0, false), _jsxDEV("div", {

                  style: {

                    flex: 1,

                    minWidth: 0

                  },

                  children: [_jsxDEV("div", {

                    style: {

                      fontWeight: 500,

                      fontSize: 13,

                      color: 'var(--ink)',

                      overflow: 'hidden',

                      textOverflow: 'ellipsis',

                      whiteSpace: 'nowrap'

                    },

                    children: c.nombre

                  }, void 0, false), _jsxDEV("div", {

                    style: {

                      fontSize: 11,

                      color: 'var(--ink-3)',

                      display: 'flex',

                      gap: 6,

                      flexWrap: 'wrap'

                    },

                    children: [_jsxDEV("span", {

                      children: c.grado

                    }, void 0, false), c.matricula && _jsxDEV("span", {

                      style: {

                        fontFamily: 'var(--mono)'

                      },

                      children: ["· ", c.matricula]

                    }, void 0, true), famActual ? _jsxDEV("span", {

                      style: {

                        color: 'var(--amber)'

                      },

                      children: ["· Mover desde ", famActual.nombre]

                    }, void 0, true) : _jsxDEV("span", {

                      style: {

                        color: 'var(--ink-4)'

                      },

                      children: "· Sin familia"

                    }, void 0, false)]

                  }, void 0, true)]

                }, void 0, true)]

              }, c.id, true);

            });

          })()

        }, void 0, false), _jsxDEV("div", {

          className: "modal-footer",

          children: _jsxDEV("button", {

            className: "btn btn-ghost",

            onClick: () => setModal(null),

            children: "Cancelar"

          }, void 0, false)

        }, void 0, false)]

      }, void 0, true)

    }, void 0, false)]

  }, void 0, true);

}
