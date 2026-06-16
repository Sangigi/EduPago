import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";
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
    uso_cfdi_defecto: 'D10'
  };
  const EMPTY_ALU = {
    tipo: 'alumno',
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
  const [expanded, setExpanded] = useState({});
  const [q, setQ] = useState('');
  const [targetFamId, setTargetFamId] = useState(null);
  const [clabeLoadingId, setClabeLoadingId] = useState(null); // id del alumno cuya CLABE se está generando

  const escuela = data.escuelas.find(e => e.id === escuela_id);
  const familias = data.familias.filter(f => !q || f.nombre.toLowerCase().includes(q.toLowerCase()) || f.contacto.toLowerCase().includes(q.toLowerCase()));
  const hijosDeFamily = fid => data.clientes.filter(c => c.familia_id === fid);
  const saldoFamily = fid => hijosDeFamily(fid).reduce((a, c) => a + (c.saldo_pendiente || 0), 0);
  const toggleExp = id => setExpanded(prev => ({
    ...prev,
    [id]: !prev[id]
  }));
  const fmtCLABE = clabe => clabe ? clabe.match(/.{1,4}/g).join(' ') : '—';

  // ── Genera (o regenera) la CLABE individual de un alumno vía Pagadetodo/STP ──
  // Queda asignada al alumno hasta que se dé de baja (salga de la escuela).
  const _aplicarClabe = (dataBase, alumnoId, clabe) => ({
    ...dataBase,
    clientes: dataBase.clientes.map(c => c.id === alumnoId ? {
      ...c,
      clabe_individual: clabe,
      clabe_individual_estado: 'activa',
      clabe_individual_fecha: new Date().toISOString().slice(0, 10)
    } : c)
  });
  const _marcarError = (dataBase, alumnoId) => ({
    ...dataBase,
    clientes: dataBase.clientes.map(c => c.id === alumnoId ? {
      ...c,
      clabe_individual_estado: 'error'
    } : c)
  });
  const generarClabe = async (alumnoActual, dataBase) => {
    if (!alumnoActual?.id) return;
    setClabeLoadingId(alumnoActual.id);
    try {
      const res = await CobroController.generarClabeIndividual({
        alumno_id: alumnoActual.id,
        matricula: alumnoActual.matricula || '',
        nombre: alumnoActual.nombre,
        email: alumnoActual.email || '',
        escuela: escuela?.nombre || ''
      });
      const conClabe = _aplicarClabe(dataBase, alumnoActual.id, res.clabe);
      setData(conClabe);
      AppModel.save(conClabe);
    } catch (e) {
      alert('Error al generar CLABE: ' + e.message);
      const conError = _marcarError(dataBase, alumnoActual.id);
      setData(conError);
      AppModel.save(conError);
    } finally {
      setClabeLoadingId(null);
    }
  };
  const regenerarClabe = async cliente => {
    await generarClabe(cliente, data);
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
        try {
          await CobroController.liberarClabeIndividual({
            alumno_id: hijo.id,
            clabe: hijo.clabe_individual
          });
          const sinClabe = {
            ...newData,
            clientes: newData.clientes.map(c => c.id === hijo.id ? {
              ...c,
              clabe_individual_estado: 'liberada'
            } : c)
          };
          setData(sinClabe);
          AppModel.save(sinClabe);
        } catch (e) {}
      }
    } else {
      const alumnoActualizado = newData.clientes.find(c => c.id === hijo.id);
      await generarClabe(alumnoActualizado, newData);
    }
  };
  const guardarFam = async () => {
    if (!formFam.nombre) return;
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
      }
    } catch (e) {
      alert('Error al guardar familia: ' + e.message);
    }
    setModal(null);
    setFormFam(EMPTY_FAM);
  };
  const guardarAlu = async () => {
    if (!formAlu.nombre) return;
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
      await generarClabe(alumnoNuevo, newData);
    } catch (e) {
      alert('Error al dar de alta alumno: ' + e.message);
    }
  };
  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Familias"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "card-sub",
            children: [data.familias.length, " familias · ", data.clientes.filter(c => c.familia_id).length, " alumnos agrupados"]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-primary",
          onClick: () => {
            setFormFam(EMPTY_FAM);
            setModal('familia');
          },
          children: "+ Nueva familia"
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        style: {
          marginBottom: 16
        },
        children: /*#__PURE__*/_jsxDEV("div", {
          className: "search-bar",
          children: [/*#__PURE__*/_jsxDEV("span", {
            className: "search-icon",
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "search",
              size: 15,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
            placeholder: "Buscar familia…",
            value: q,
            onChange: e => setQ(e.target.value)
          }, void 0, false)]
        }, void 0, true)
      }, void 0, false), familias.length === 0 && /*#__PURE__*/_jsxDEV("div", {
        className: "empty-state",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "empty-icon",
          children: /*#__PURE__*/_jsxDEV(Icon, {
            name: "familias",
            size: 36,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "empty-text",
          children: "Sin familias registradas"
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "empty-sub",
          children: "Las familias agrupan alumnos del mismo hogar"
        }, void 0, false)]
      }, void 0, true), familias.map(fam => {
        const hijos = hijosDeFamily(fam.id);
        const saldo = saldoFamily(fam.id);
        const isOpen = expanded[fam.id];
        return /*#__PURE__*/_jsxDEV("div", {
          style: {
            border: '1px solid var(--border-glow)',
            borderRadius: 'var(--radius)',
            marginBottom: 10,
            overflow: 'hidden',
            transition: 'all .2s'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
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
            children: [/*#__PURE__*/_jsxDEV("div", {
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
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "familias",
                size: 20,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                flex: 1,
                minWidth: 0
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--ink)'
                },
                children: fam.nombre
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  marginTop: 2
                },
                children: [fam.contacto, " · ", fam.email, hijos.length > 0 && /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    marginLeft: 8
                  },
                  children: ["· ", hijos.length, " alumno", hijos.length !== 1 ? 's' : '']
                }, void 0, true)]
              }, void 0, true)]
            }, void 0, true), saldo > 0 && /*#__PURE__*/_jsxDEV("span", {
              style: {
                fontFamily: 'var(--mono)',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--amber)',
                flexShrink: 0
              },
              children: [fmt(saldo), " pendiente"]
            }, void 0, true), saldo === 0 && hijos.length > 0 && /*#__PURE__*/_jsxDEV("span", {
              className: "badge badge-green",
              style: {
                flexShrink: 0
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "check",
                size: 11,
                color: "currentColor"
              }, void 0, false), " Al corriente"]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                gap: 6,
                flexShrink: 0
              },
              children: [/*#__PURE__*/_jsxDEV("button", {
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
                children: /*#__PURE__*/_jsxDEV(Icon, {
                  name: "edit",
                  size: 14,
                  color: "currentColor"
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
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
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
              style: {
                color: 'var(--ink-4)',
                fontSize: 18,
                flexShrink: 0
              },
              children: isOpen ? /*#__PURE__*/_jsxDEV(Icon, {
                name: "chevronDown",
                size: 18,
                color: "currentColor"
              }, void 0, false) : /*#__PURE__*/_jsxDEV(Icon, {
                name: "arrowRight",
                size: 16,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false)]
          }, void 0, true), isOpen && /*#__PURE__*/_jsxDEV("div", {
            style: {
              padding: '0 16px'
            },
            children: [hijos.length === 0 && /*#__PURE__*/_jsxDEV("div", {
              style: {
                padding: '16px 0',
                textAlign: 'center',
                color: 'var(--ink-4)',
                fontSize: 13
              },
              children: "Sin estudiantes agregados — haz clic en \"+ Añadir estudiante\""
            }, void 0, false), hijos.map((hijo, i) => /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 0',
                borderBottom: i < hijos.length - 1 ? '1px solid var(--glass-light)' : 'none'
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
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
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  flex: 1,
                  minWidth: 0
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--ink)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  },
                  children: [hijo.nombre, !hijo.activo && /*#__PURE__*/_jsxDEV("span", {
                    className: "badge badge-gray",
                    children: "Inactivo"
                  }, void 0, false)]
                }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 11.5,
                    color: 'var(--ink-3)',
                    marginTop: 2
                  },
                  children: [hijo.grado, " · Mat: ", /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      fontFamily: 'var(--mono)'
                    },
                    children: hijo.matricula || '—'
                  }, void 0, false)]
                }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 11,
                    color: 'var(--ink-4)',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  },
                  children: [/*#__PURE__*/_jsxDEV(Icon, {
                    name: "bank",
                    size: 11,
                    color: "currentColor"
                  }, void 0, false), clabeLoadingId === hijo.id ? /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5
                    },
                    children: [/*#__PURE__*/_jsxDEV("span", {
                      className: "spinner",
                      style: {
                        width: 10,
                        height: 10
                      }
                    }, void 0, false), " Generando CLABE…"]
                  }, void 0, true) : hijo.clabe_individual_estado === 'activa' && hijo.clabe_individual ? /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      fontFamily: 'var(--mono)',
                      letterSpacing: .4
                    },
                    children: fmtCLABE(hijo.clabe_individual)
                  }, void 0, false) : hijo.clabe_individual_estado === 'liberada' ? /*#__PURE__*/_jsxDEV("span", {
                    children: "CLABE liberada"
                  }, void 0, false) : hijo.clabe_individual_estado === 'error' ? /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      color: 'var(--red)'
                    },
                    children: ["Error al generar CLABE", /*#__PURE__*/_jsxDEV("button", {
                      className: "btn btn-ghost btn-sm",
                      style: {
                        padding: '1px 6px',
                        fontSize: 10.5
                      },
                      onClick: () => regenerarClabe(hijo),
                      children: "Reintentar"
                    }, void 0, false)]
                  }, void 0, true) : hijo.activo ? /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5
                    },
                    children: ["CLABE pendiente", /*#__PURE__*/_jsxDEV("button", {
                      className: "btn btn-ghost btn-sm",
                      style: {
                        padding: '1px 6px',
                        fontSize: 10.5
                      },
                      onClick: () => regenerarClabe(hijo),
                      children: "Generar"
                    }, void 0, false)]
                  }, void 0, true) : /*#__PURE__*/_jsxDEV("span", {
                    children: "Sin CLABE"
                  }, void 0, false)]
                }, void 0, true)]
              }, void 0, true), hijo.saldo_pendiente > 0 ? /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--red)',
                  fontWeight: 600
                },
                children: fmt(hijo.saldo_pendiente)
              }, void 0, false) : /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 12,
                  color: 'var(--green)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                },
                children: [/*#__PURE__*/_jsxDEV(Icon, {
                  name: "check",
                  size: 11,
                  color: "currentColor"
                }, void 0, false), " Al corriente"]
              }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
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
                children: /*#__PURE__*/_jsxDEV(Icon, {
                  name: "edit",
                  size: 14,
                  color: "currentColor"
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                className: "btn btn-ghost btn-sm",
                onClick: () => toggleHijo(hijo),
                title: hijo.activo ? 'Dar de baja (libera su CLABE)' : 'Reactivar (genera nueva CLABE)',
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                },
                children: hijo.activo ? /*#__PURE__*/_jsxDEV(Icon, {
                  name: "shield",
                  size: 14,
                  color: "currentColor"
                }, void 0, false) : /*#__PURE__*/_jsxDEV(Icon, {
                  name: "eyeOff",
                  size: 14,
                  color: "currentColor"
                }, void 0, false)
              }, void 0, false)]
            }, hijo.id, true))]
          }, void 0, true)]
        }, fam.id, true);
      }), (() => {
        const sinFamilia = data.clientes.filter(c => !c.familia_id && c.activo);
        if (!sinFamilia.length) return null;
        return /*#__PURE__*/_jsxDEV("div", {
          style: {
            marginTop: 24
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 11,
              color: 'var(--ink-4)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              marginBottom: 10
            },
            children: ["Alumnos sin familia asignada (", sinFamilia.length, ")"]
          }, void 0, true), sinFamilia.map(alu => /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              background: 'var(--glass-light)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 6
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
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
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                flex: 1
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 13,
                  fontWeight: 500
                },
                children: alu.nombre
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11.5,
                  color: 'var(--ink-3)'
                },
                children: [alu.grado, " · ", alu.matricula]
              }, void 0, true)]
            }, void 0, true), alu.saldo_pendiente > 0 ? /*#__PURE__*/_jsxDEV("span", {
              style: {
                fontFamily: 'var(--mono)',
                fontSize: 12,
                color: 'var(--red)'
              },
              children: fmt(alu.saldo_pendiente)
            }, void 0, false) : /*#__PURE__*/_jsxDEV("span", {
              style: {
                fontSize: 12,
                color: 'var(--green)'
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "check",
                size: 11,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false)]
          }, alu.id, true))]
        }, void 0, true);
      })()]
    }, void 0, true), modal === 'familia' && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            children: [formFam.id ? 'Editar' : 'Nueva', " familia"]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setModal(null),
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "close",
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Nombre de la familia *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "Ej: Familia García López",
              value: formFam.nombre,
              onChange: e => setFormFam(f => ({
                ...f,
                nombre: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Contacto principal"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "Nombre del papá/mamá/tutor",
              value: formFam.contacto,
              onChange: e => setFormFam(f => ({
                ...f,
                contacto: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Teléfono"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
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
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Correo electrónico"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
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
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid var(--border-glow)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 12
              },
              children: "Datos fiscales (para facturación CFDI)"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
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
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "RFC del receptor"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
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
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Código Postal fiscal"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
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
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                style: {
                  gridColumn: '1/-1'
                },
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Razón social"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "NOMBRE COMPLETO EN MAYÚSCULAS",
                  value: formFam.razon_social_factura || '',
                  onChange: e => setFormFam(f => ({
                    ...f,
                    razon_social_factura: e.target.value.toUpperCase()
                  }))
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                style: {
                  gridColumn: '1/-1'
                },
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Domicilio fiscal"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "Calle, Número, Colonia, Ciudad, Estado, CP",
                  value: formFam.domicilio_factura || '',
                  onChange: e => setFormFam(f => ({
                    ...f,
                    domicilio_factura: e.target.value
                  }))
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Régimen fiscal"
                }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                  className: "form-select",
                  value: formFam.regimen_factura || '616',
                  onChange: e => setFormFam(f => ({
                    ...f,
                    regimen_factura: e.target.value
                  })),
                  children: [/*#__PURE__*/_jsxDEV("option", {
                    value: "616",
                    children: "616 — Sin obligaciones fiscales"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                    value: "601",
                    children: "601 — General Personas Morales"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                    value: "612",
                    children: "612 — Personas Físicas con Actividades Empresariales"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                    value: "626",
                    children: "626 — RESICO"
                  }, void 0, false)]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Uso del CFDI por defecto"
                }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                  className: "form-select",
                  value: formFam.uso_cfdi_defecto || 'D10',
                  onChange: e => setFormFam(f => ({
                    ...f,
                    uso_cfdi_defecto: e.target.value
                  })),
                  children: [/*#__PURE__*/_jsxDEV("option", {
                    value: "D10",
                    children: "D10 — Servicios educativos"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                    value: "G03",
                    children: "G03 — Gastos en general"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                    value: "S01",
                    children: "S01 — Sin efectos fiscales"
                  }, void 0, false)]
                }, void 0, true)]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setModal(null),
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: guardarFam,
            disabled: !formFam.nombre,
            children: "Guardar"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modal === 'alumno' && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            children: [formAlu.id ? 'Editar' : 'Agregar', " alumno"]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setModal(null),
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "close",
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [targetFamId && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginBottom: 14,
              padding: '8px 12px',
              background: 'var(--accent-glow)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--ink-2)'
            },
            children: [/*#__PURE__*/_jsxDEV("span", {
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: 6
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "familias",
                size: 14,
                color: "currentColor"
              }, void 0, false), " Familia:"]
            }, void 0, true), " ", /*#__PURE__*/_jsxDEV("strong", {
              children: data.familias.find(f => f.id === targetFamId)?.nombre
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Nombre completo *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "Nombre del alumno",
              value: formAlu.nombre,
              onChange: e => setFormAlu(f => ({
                ...f,
                nombre: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Grado / Grupo"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "3° Primaria",
                value: formAlu.grado,
                onChange: e => setFormAlu(f => ({
                  ...f,
                  grado: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Matrícula"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
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
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "CURP"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
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
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Correo"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                type: "email",
                value: formAlu.email,
                onChange: e => setFormAlu(f => ({
                  ...f,
                  email: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Teléfono"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
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
          }, void 0, true), !formAlu.id && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 6,
              padding: '8px 12px',
              background: 'var(--accent-glow)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11.5,
              color: 'var(--ink-2)',
              lineHeight: 1.6
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "bank",
              size: 13,
              color: "currentColor"
            }, void 0, false), " Al guardar, se generará automáticamente una CLABE SPEI individual para este alumno."]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setModal(null),
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: guardarAlu,
            disabled: !formAlu.nombre,
            children: "Guardar"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}
