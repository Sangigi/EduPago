var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/Alumnos.jsx — Alumnos con CLABE SPEI individual por alumno */
function Alumnos({
  data,
  setData,
  escuela_id
}) {
  const {
    useState
  } = React;
  const EMPTY = {
    tipo: 'alumno',
    nombre: '',
    grado: '',
    matricula: '',
    curp: '',
    email: '',
    tel: '',
    familia_id: null,
    // Campos extendidos (reunión jun-10)
    direccion: '',
    contacto_emergencia: '',
    tel_emergencia: '',
    doc_curp_url: '',
    doc_acta_url: '',
    doc_ine_tutor_url: ''
  };
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [q, setQ] = useState('');
  const [clabeLoadingId, setClabeLoadingId] = useState(null);
  const escuela = data.escuelas.find(e => e.id === escuela_id);
  const lista = data.clientes.filter(c => !q || c.nombre.toLowerCase().includes(q.toLowerCase()) || c.matricula && c.matricula.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase()));

  // ── Genera (o regenera) la CLABE individual de un alumno vía Pagadetodo/STP ──
  // Actualiza el alumno en el state local con la CLABE recibida de la API
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
  const guardar = async () => {
    if (!form.nombre) return;
    if (form.id) {
      // Edición: llama API y actualiza estado local
      try {
        const clienteActualizado = await ClienteController.editar(form);
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
      setForm(EMPTY);
      return;
    }

    // Alta nueva: llama API, recibe cliente con ID real de DB, luego genera CLABE
    try {
      const alumnoNuevo = await ClienteController.agregar(form, escuela_id);
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
      setForm(EMPTY);
      // Generar CLABE individual de inmediato
      await generarClabe(alumnoNuevo, newData);
    } catch (e) {
      alert('Error al dar de alta alumno: ' + e.message);
    }
  };

  // ── Activar/Desactivar alumno ──────────────────────────────────────────────
  const toggle = async cliente => {
    const eraActivo = cliente.activo;
    try {
      await ClienteController.toggleActivo(cliente.id, eraActivo);
    } catch (e) {/* API puede fallar, seguimos actualizando UI */}
    const newData = {
      ...data,
      clientes: data.clientes.map(c => c.id === cliente.id ? {
        ...c,
        activo: !eraActivo
      } : c)
    };
    setData(newData);
    AppModel.save(newData);
    if (eraActivo) {
      // Dar de baja: liberar CLABE
      if (cliente.clabe_individual) {
        try {
          await CobroController.liberarClabeIndividual({
            alumno_id: cliente.id,
            clabe: cliente.clabe_individual
          });
          const sinClabe = {
            ...newData,
            clientes: newData.clientes.map(c => c.id === cliente.id ? {
              ...c,
              clabe_individual_estado: 'liberada'
            } : c)
          };
          setData(sinClabe);
          AppModel.save(sinClabe);
        } catch (e) {/* no bloquear el flujo de baja */}
      }
    } else {
      // Reactivar: generar nueva CLABE
      const alumnoActualizado = newData.clientes.find(c => c.id === cliente.id);
      await generarClabe(alumnoActualizado, newData);
    }
  };
  const regenerarClabe = async cliente => {
    await generarClabe(cliente, data);
  };
  const familiaDeAlumno = fid => fid ? data.familias.find(f => f.id === fid)?.nombre : null;
  const fmtCLABE = clabe => clabe ? clabe.match(/.{1,4}/g).join(' ') : '—';
  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Alumnos"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "card-sub",
            children: [data.clientes.filter(c => c.activo).length, " activos de ", data.clientes.length]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-primary",
          onClick: () => {
            setForm(EMPTY);
            setModal('form');
          },
          children: "+ Alta de alumno"
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
            placeholder: "Buscar por nombre, matrícula o correo…",
            value: q,
            onChange: e => setQ(e.target.value)
          }, void 0, false)]
        }, void 0, true)
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("th", {
                children: "Nombre"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Matrícula"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Grado"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Familia"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "CLABE SPEI individual"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Saldo pendiente"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Estado"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Acciones"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: [lista.length === 0 && /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", {
                colSpan: 8,
                children: /*#__PURE__*/_jsxDEV("div", {
                  className: "empty-state",
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    className: "empty-icon",
                    children: /*#__PURE__*/_jsxDEV(Icon, {
                      name: "alumnos",
                      size: 36,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    className: "empty-text",
                    children: "Sin alumnos"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)
            }, void 0, false), lista.map(c => /*#__PURE__*/_jsxDEV("tr", {
              style: {
                opacity: c.activo ? 1 : .5
              },
              children: [/*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  },
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    className: "avatar avatar-admin",
                    style: {
                      width: 30,
                      height: 30,
                      fontSize: 11
                    },
                    children: c.nombre.charAt(0)
                  }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      fontWeight: 500
                    },
                    children: c.nombre
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  },
                  children: c.matricula || '—'
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  color: 'var(--ink-3)',
                  fontSize: 12
                },
                children: c.grado || '—'
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: c.familia_id ? /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontSize: 12,
                    color: 'var(--ink-2)'
                  },
                  children: [/*#__PURE__*/_jsxDEV(Icon, {
                    name: "familias",
                    size: 14,
                    color: "currentColor"
                  }, void 0, false), " ", familiaDeAlumno(c.familia_id)?.split(' ').slice(1).join(' ') || '—']
                }, void 0, true) : /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontSize: 12,
                    color: 'var(--ink-4)'
                  },
                  children: "—"
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: clabeLoadingId === c.id ? /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11.5,
                    color: 'var(--ink-3)'
                  },
                  children: [/*#__PURE__*/_jsxDEV("span", {
                    className: "spinner",
                    style: {
                      width: 12,
                      height: 12
                    }
                  }, void 0, false), " Generando…"]
                }, void 0, true) : c.clabe_individual_estado === 'activa' && c.clabe_individual ? /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 11.5,
                    color: 'var(--ink-2)',
                    letterSpacing: .5
                  },
                  title: `Asignada: ${c.clabe_individual_fecha || ''}`,
                  children: fmtCLABE(c.clabe_individual)
                }, void 0, false) : c.clabe_individual_estado === 'liberada' ? /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontSize: 11.5,
                    color: 'var(--ink-4)'
                  },
                  children: "Liberada"
                }, void 0, false) : c.clabe_individual_estado === 'error' ? /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  },
                  children: [/*#__PURE__*/_jsxDEV("span", {
                    style: {
                      fontSize: 11.5,
                      color: 'var(--red)'
                    },
                    children: [/*#__PURE__*/_jsxDEV(Icon, {
                      name: "warning",
                      size: 12,
                      color: "currentColor"
                    }, void 0, false), " Error"]
                  }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    style: {
                      padding: '2px 6px',
                      fontSize: 11
                    },
                    onClick: () => regenerarClabe(c),
                    children: "Reintentar"
                  }, void 0, false)]
                }, void 0, true) : c.activo ? /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontSize: 11.5,
                    color: 'var(--ink-4)'
                  },
                  children: ["Pendiente", /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    style: {
                      padding: '2px 6px',
                      fontSize: 11,
                      marginLeft: 6
                    },
                    onClick: () => regenerarClabe(c),
                    children: "Generar"
                  }, void 0, false)]
                }, void 0, true) : /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontSize: 11.5,
                    color: 'var(--ink-4)'
                  },
                  children: "—"
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: c.saldo_pendiente > 0 ? /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    color: 'var(--red)',
                    fontFamily: 'var(--mono)',
                    fontWeight: 600,
                    fontSize: 13
                  },
                  children: fmt(c.saldo_pendiente)
                }, void 0, false) : /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    color: 'var(--green)',
                    fontSize: 12
                  },
                  children: [/*#__PURE__*/_jsxDEV(Icon, {
                    name: "check",
                    size: 11,
                    color: "currentColor"
                  }, void 0, false), " Al corriente"]
                }, void 0, true)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: c.activo ? /*#__PURE__*/_jsxDEV("span", {
                  className: "badge badge-green",
                  children: "Activo"
                }, void 0, false) : /*#__PURE__*/_jsxDEV("span", {
                  className: "badge badge-gray",
                  children: "Inactivo"
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    display: 'flex',
                    gap: 5
                  },
                  children: [/*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => {
                      setForm({
                        ...EMPTY,
                        ...c
                      });
                      setModal('form');
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
                    onClick: () => toggle(c),
                    title: c.activo ? 'Dar de baja (libera su CLABE)' : 'Reactivar (genera nueva CLABE)',
                    children: c.activo ? /*#__PURE__*/_jsxDEV(Icon, {
                      name: "shield",
                      size: 14,
                      color: "currentColor"
                    }, void 0, false) : /*#__PURE__*/_jsxDEV(Icon, {
                      name: "eyeOff",
                      size: 14,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)]
            }, c.id, true))]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true), modal === 'form' && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            children: form.id ? 'Editar alumno' : 'Alta de alumno'
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
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
            style: {
              fontSize: 11,
              color: 'var(--ink-4)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.4px',
              marginBottom: 10
            },
            children: "Datos generales"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Familia (opcional)"
            }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
              className: "form-select",
              value: form.familia_id || '',
              onChange: e => setForm(f => ({
                ...f,
                familia_id: e.target.value ? parseInt(e.target.value) : null
              })),
              children: [/*#__PURE__*/_jsxDEV("option", {
                value: "",
                children: "Sin familia asignada"
              }, void 0, false), data.familias.map(fam => /*#__PURE__*/_jsxDEV("option", {
                value: fam.id,
                children: fam.nombre
              }, fam.id, false))]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Nombre completo *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "Nombre completo",
              value: form.nombre,
              onChange: e => setForm(f => ({
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
                value: form.grado,
                onChange: e => setForm(f => ({
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
                value: form.matricula,
                onChange: e => setForm(f => ({
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
              placeholder: "GALA090315MDFPNB08",
              value: form.curp,
              onChange: e => setForm(f => ({
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
                children: "Correo electrónico"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                type: "email",
                placeholder: "correo@mail.com",
                value: form.email,
                onChange: e => setForm(f => ({
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
                placeholder: "9991234567",
                value: form.tel,
                onChange: e => setForm(f => ({
                  ...f,
                  tel: e.target.value
                })),
                style: {
                  fontFamily: 'var(--mono)'
                }
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--border-glow)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 10
              },
              children: "Dirección"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Domicilio del alumno"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "Calle, Número, Colonia, Ciudad, Estado, CP",
                value: form.direccion || '',
                onChange: e => setForm(f => ({
                  ...f,
                  direccion: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--border-glow)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 10
              },
              children: "Contacto de emergencia"
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
                  children: "Nombre del contacto"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "Nombre del familiar",
                  value: form.contacto_emergencia || '',
                  onChange: e => setForm(f => ({
                    ...f,
                    contacto_emergencia: e.target.value
                  }))
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Teléfono de emergencia"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "9991234567",
                  value: form.tel_emergencia || '',
                  onChange: e => setForm(f => ({
                    ...f,
                    tel_emergencia: e.target.value
                  })),
                  style: {
                    fontFamily: 'var(--mono)'
                  }
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--border-glow)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 6
              },
              children: "Digitalización de documentos oficiales"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginBottom: 12,
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
              }, void 0, false), " Pega la URL o ruta del documento digitalizado (Google Drive, servidor, etc.)"]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: 10
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "CURP (documento PDF/imagen)"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "https://drive.google.com/…",
                  value: form.doc_curp_url || '',
                  onChange: e => setForm(f => ({
                    ...f,
                    doc_curp_url: e.target.value
                  })),
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  }
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Acta de nacimiento"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "https://drive.google.com/…",
                  value: form.doc_acta_url || '',
                  onChange: e => setForm(f => ({
                    ...f,
                    doc_acta_url: e.target.value
                  })),
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  }
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "INE / Identificación oficial del padre/tutor"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "https://drive.google.com/…",
                  value: form.doc_ine_tutor_url || '',
                  onChange: e => setForm(f => ({
                    ...f,
                    doc_ine_tutor_url: e.target.value
                  })),
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  }
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                gap: 16,
                marginTop: 6,
                flexWrap: 'wrap'
              },
              children: [form.doc_curp_url && /*#__PURE__*/_jsxDEV("a", {
                href: form.doc_curp_url,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "btn btn-ghost btn-sm",
                style: {
                  fontSize: 11
                },
                children: [/*#__PURE__*/_jsxDEV(Icon, {
                  name: "eye",
                  size: 12,
                  color: "currentColor"
                }, void 0, false), " Ver CURP"]
              }, void 0, true), form.doc_acta_url && /*#__PURE__*/_jsxDEV("a", {
                href: form.doc_acta_url,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "btn btn-ghost btn-sm",
                style: {
                  fontSize: 11
                },
                children: [/*#__PURE__*/_jsxDEV(Icon, {
                  name: "eye",
                  size: 12,
                  color: "currentColor"
                }, void 0, false), " Ver Acta"]
              }, void 0, true), form.doc_ine_tutor_url && /*#__PURE__*/_jsxDEV("a", {
                href: form.doc_ine_tutor_url,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "btn btn-ghost btn-sm",
                style: {
                  fontSize: 11
                },
                children: [/*#__PURE__*/_jsxDEV(Icon, {
                  name: "eye",
                  size: 12,
                  color: "currentColor"
                }, void 0, false), " Ver INE"]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), !form.id && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 16,
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
            onClick: guardar,
            disabled: !form.nombre,
            children: "Guardar"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}