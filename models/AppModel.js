const AppModel = (() => {
  const KEY = 'edupago_data_v3';

  const INITIAL_STATE = {
    // ── Escuelas ──────────────────────────────────────────────────────────────
    escuelas: [
      {
        id: 1,
        nombre: 'Instituto Tecnológico Mérida',
        clave: 'ITM',
        rfc: 'ITM9301015XA',
        telefono: '9991234567',
        email: 'admin@itm.edu.mx',
        direccion: 'Calle 20 #120, Col. García Ginerés, Mérida, Yuc.',
        logo_emoji: '🏛️',
        activa: true,
        plan: 'pro',       // free | pro | enterprise
        fecha_alta: '2026-01-15',
        clabe_fija: '646180633010000055',
        color: '#282d65',
        permite_planteles: true,
      },
      {
        id: 2,
        nombre: 'Colegio Español de Cancún',
        clave: 'CEC',
        rfc: 'CEC050820AB1',
        telefono: '9981234567',
        email: 'pagos@cec.edu.mx',
        direccion: 'Av. Tulum #55, SM-22, Cancún, Q.Roo.',
        logo_emoji: '🏫',
        activa: true,
        plan: 'pro',
        fecha_alta: '2026-02-01',
        clabe_fija: '646180633010000056',
        color: '#10b981',
        permite_planteles: true,
      },
      {
        id: 3,
        nombre: 'Escuela Mexicana de Electricidad',
        clave: 'EME',
        rfc: 'EME030610HG5',
        telefono: '5512349876',
        email: 'controlescolar@eme.edu.mx',
        direccion: 'Calzada de los Misterios #43, CDMX.',
        logo_emoji: '⚡',
        activa: true,
        plan: 'free',
        fecha_alta: '2026-03-11',
        clabe_fija: '646180633010000057',
        color: '#f59e0b',
        permite_planteles: false,
      },
    ],

    // ── Planteles (sucursales/campus de una misma escuela) ─────────────────────
    planteles: [
      { id:1, escuela_id:1, nombre:'Campus Norte',   direccion:'Calle 20 #120, García Ginerés, Mérida, Yuc.', responsable:'Lic. Ramona Castillo', tel:'9991234560', activo:true },
      { id:2, escuela_id:1, nombre:'Campus Sur',     direccion:'Calle 60 #350, Itzimná, Mérida, Yuc.',        responsable:'Mtro. Ernesto Vargas',  tel:'9991234561', activo:true },
      { id:3, escuela_id:2, nombre:'Plantel Central',direccion:'Av. Tulum #55, SM-22, Cancún, Q.Roo.',        responsable:'Lic. Carlos Méndez',    tel:'9981112200', activo:true },
    ],

    // ── Familias (agrupan alumnos de la misma unidad familiar) ───────────────
    familias: [
      { id: 1, escuela_id: 1, nombre: 'Familia García López',    contacto: 'Roberto García', tel: '9991234500', email: 'garcia.fam@mail.com', activa: true },
      { id: 2, escuela_id: 1, nombre: 'Familia Hernández Torres', contacto: 'Lucia Hernández', tel: '9997654321', email: 'hernandez.t@mail.com', activa: true },
      { id: 3, escuela_id: 2, nombre: 'Familia Méndez Ortiz',    contacto: 'Carlos Méndez', tel: '9981112233', email: 'mendez.c@mail.com', activa: true },
    ],

    // ── Alumnos / Clientes ────────────────────────────────────────────────────
    clientes: [
      // Escuela 1 — ITM
      { id:1,  escuela_id:1, plantel_id:1, familia_id:1, tipo:'alumno', nombre:'Ana García López',       grado:'3° Primaria',  matricula:'ITM-2024-001', curp:'GALA090315MDFPNB08', email:'familia.garcia@mail.com', tel:'9991234567', saldo_pendiente:2800, activo:true  },
      { id:2,  escuela_id:1, plantel_id:1, familia_id:1, tipo:'alumno', nombre:'Pedro García López',     grado:'1° Primaria',  matricula:'ITM-2024-002', curp:'GALP100820HDFPNB01', email:'familia.garcia@mail.com', tel:'9991234567', saldo_pendiente:0,    activo:true  },
      { id:3,  escuela_id:1, plantel_id:2, familia_id:2, tipo:'alumno', nombre:'Luis Hernández Torres',  grado:'5° Primaria',  matricula:'ITM-2023-018', curp:'HETL050101HMCRNB04', email:'hernandez.t@mail.com',   tel:'9997654321', saldo_pendiente:5600, activo:true  },
      { id:4,  escuela_id:1, plantel_id:2, familia_id:2, tipo:'alumno', nombre:'Sofía Hernández Torres', grado:'3° Primaria',  matricula:'ITM-2024-019', curp:'HETS100201MDFZFB06', email:'hernandez.t@mail.com',   tel:'9997654321', saldo_pendiente:2800, activo:true  },
      { id:5,  escuela_id:1, familia_id:null, tipo:'alumno', nombre:'Diego López Castro', grado:'6° Primaria', matricula:'ITM-2021-044', curp:'LOCD090930HDFPSD01', email:'lopez.castro@mail.com',   tel:'9995678901', saldo_pendiente:0,    activo:false },
      // Escuela 2 — CEC
      { id:6,  escuela_id:2, familia_id:3, tipo:'alumno', nombre:'Valentina Méndez Ortiz', grado:'2° Secundaria', matricula:'CEC-2024-007', curp:'MEOV100415MQRNZB02', email:'mendez.c@mail.com',     tel:'9981112233', saldo_pendiente:3200, activo:true  },
      { id:7,  escuela_id:2, familia_id:3, tipo:'alumno', nombre:'Rodrigo Méndez Ortiz',   grado:'4° Primaria',   matricula:'CEC-2024-008', curp:'MEOR080910HQRNZB01', email:'mendez.c@mail.com',     tel:'9981112233', saldo_pendiente:0,    activo:true  },
      { id:8,  escuela_id:2, familia_id:null, tipo:'alumno', nombre:'Isabella Torres Reyes', grado:'1° Secundaria', matricula:'CEC-2025-003', curp:'TORI110203MQRRSB04', email:'torres.reyes@mail.com', tel:'9989876543', saldo_pendiente:1500, activo:true },
      // Escuela 3 — EME
      { id:9,  escuela_id:3, familia_id:null, tipo:'alumno', nombre:'Enoch Aguirre Aguilera', grado:'Técnico Electricista', matricula:'EME-2025-411', curp:'AUAE900411HMCGRB08', email:'aguirre@mail.com', tel:'5512349876', saldo_pendiente:2619, activo:true },
    ],

    // ── Productos/Conceptos por escuela ───────────────────────────────────────
    productos: [
      // ITM (escuela_id:1)
      { id:1,  escuela_id:1, nombre:'Colegiatura Mensual',   categoria:'colegiatura', precio:2800,  emoji:'📚', activo:true },
      { id:2,  escuela_id:1, nombre:'Anualidad Primaria',    categoria:'anualidad',   precio:28000, emoji:'🎯', activo:true },
      { id:3,  escuela_id:1, nombre:'Beca Excelencia 25%',   categoria:'beca',        precio:-700,  emoji:'🏆', activo:true },
      { id:4,  escuela_id:1, nombre:'Inscripción',           categoria:'inscripcion', precio:3500,  emoji:'✏️', activo:true },
      { id:5,  escuela_id:1, nombre:'Uniforme Completo',     categoria:'uniforme',    precio:1800,  emoji:'👕', activo:true },
      { id:6,  escuela_id:1, nombre:'Material Didáctico',    categoria:'material',    precio:950,   emoji:'📖', activo:true },
      { id:7,  escuela_id:1, nombre:'Transporte Mensual',    categoria:'transporte',  precio:1400,  emoji:'🚌', activo:true },
      { id:8,  escuela_id:1, nombre:'Comedor Mensual',       categoria:'comedor',     precio:1100,  emoji:'🍽️', activo:true },
      // CEC (escuela_id:2)
      { id:9,  escuela_id:2, nombre:'Colegiatura Mensual',   categoria:'colegiatura', precio:3200,  emoji:'📚', activo:true },
      { id:10, escuela_id:2, nombre:'Inscripción Anual',     categoria:'inscripcion', precio:4500,  emoji:'✏️', activo:true },
      { id:11, escuela_id:2, nombre:'Taller de Idiomas',     categoria:'extracurricular', precio:800, emoji:'🌍', activo:true },
      // EME (escuela_id:3)
      { id:12, escuela_id:3, nombre:'Colegiatura Mensual',   categoria:'colegiatura', precio:2619,  emoji:'📚', activo:true },
      { id:13, escuela_id:3, nombre:'Material de Taller',    categoria:'material',    precio:1200,  emoji:'🔧', activo:true },
      { id:14, escuela_id:3, nombre:'Examen de Certificación', categoria:'examen',   precio:1500,  emoji:'📋', activo:true },
    ],

    // ── Cobros ────────────────────────────────────────────────────────────────
    cobros: [
      // ITM
      { id:1,  escuela_id:1, folio:'ITM-0001', cliente_id:1,  cliente:'Ana García López',        items:[{nombre:'Colegiatura Mensual',qty:1,precio:2800}],              total:2800, metodo:'TC',       estado:'pagado',   fecha:'2026-04-01', factura:true,  referencia:'ITM-2024-001', auth_code:'TC-441231' },
      { id:2,  escuela_id:1, folio:'ITM-0002', cliente_id:3,  cliente:'Luis Hernández Torres',   items:[{nombre:'Colegiatura Mensual',qty:1,precio:2800}],              total:2800, metodo:'SPEI',     estado:'pendiente', fecha:'2026-05-03', factura:false, referencia:'ITM-2023-018' },
      { id:3,  escuela_id:1, folio:'ITM-0003', cliente_id:4,  cliente:'Sofía Hernández Torres',  items:[{nombre:'Colegiatura Mensual',qty:1,precio:2800}],              total:2800, metodo:'SPEI',     estado:'pendiente', fecha:'2026-05-03', factura:false, referencia:'ITM-2024-019' },
      { id:4,  escuela_id:1, folio:'ITM-0004', cliente_id:2,  cliente:'Pedro García López',      items:[{nombre:'Colegiatura Mensual',qty:1,precio:2800},{nombre:'Inscripción',qty:1,precio:3500}], total:6300, metodo:'TC', estado:'pagado', fecha:'2026-05-05', factura:true, referencia:'ITM-2024-002', auth_code:'TC-551122' },
      { id:5,  escuela_id:1, folio:'ITM-0005', cliente_id:1,  cliente:'Ana García López',        items:[{nombre:'Comedor Mensual',qty:1,precio:1100}],                 total:1100, metodo:'Efectivo', estado:'pagado',   fecha:'2026-05-12', factura:false, referencia:'EFE-001' },
      // CEC
      { id:6,  escuela_id:2, folio:'CEC-0001', cliente_id:6,  cliente:'Valentina Méndez Ortiz',  items:[{nombre:'Colegiatura Mensual',qty:1,precio:3200}],              total:3200, metodo:'TC',       estado:'pagado',   fecha:'2026-05-01', factura:true,  referencia:'CEC-2024-007', auth_code:'TC-661233' },
      { id:7,  escuela_id:2, folio:'CEC-0002', cliente_id:7,  cliente:'Rodrigo Méndez Ortiz',    items:[{nombre:'Colegiatura Mensual',qty:1,precio:3200}],              total:3200, metodo:'SPEI',     estado:'pagado',   fecha:'2026-05-02', factura:false, referencia:'CEC-2024-008', auth_code:'SPEI-77712' },
      { id:8,  escuela_id:2, folio:'CEC-0003', cliente_id:8,  cliente:'Isabella Torres Reyes',   items:[{nombre:'Colegiatura Mensual',qty:1,precio:3200},{nombre:'Taller de Idiomas',qty:1,precio:800}], total:4000, metodo:'SPEI', estado:'pendiente', fecha:'2026-05-10', factura:false, referencia:'CEC-2025-003' },
      // EME
      { id:9,  escuela_id:3, folio:'EME-0001', cliente_id:9,  cliente:'Enoch Aguirre Aguilera',  items:[{nombre:'Colegiatura Mensual',qty:1,precio:2619}],              total:2619, metodo:'TC',       estado:'pagado',   fecha:'2026-05-01', factura:false, referencia:'EME-2025-411', auth_code:'TC-281906' },
    ],

    // ── Recordatorios ────────────────────────────────────────────────────────
    // Reemplaza al antiguo módulo de "Correos": registro de recordatorios de
    // cobros pendientes/vencidos que se marcan manualmente desde el panel.
    recordatorios: [],
  };

  function load() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return JSON.parse(JSON.stringify(INITIAL_STATE));
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch(e) {}
  }

  function nextId(arr) {
    return arr.length === 0 ? 1 : Math.max(...arr.map(x => x.id)) + 1;
  }

  function nextFolio(cobros, clave) {
    const propios = cobros.filter(c => c.folio && c.folio.startsWith(clave + '-'));
    const n = propios.length + 1;
    return clave + '-' + String(n).padStart(4, '0');
  }

  // Estadísticas globales (super-admin)
  function getEstadisticasGlobales(data) {
    const { escuelas, cobros, clientes } = data;
    // Las escuelas-plantel (es_plantel:true) no se listan por separado en las
    // métricas globales: sus cobros/alumnos se suman dentro de la escuela
    // principal (escuela_padre_id), para que aparezcan asociadas a ella.
    const principales = escuelas.filter(e => !e.es_plantel);
    return principales.map(esc => {
      const idsGrupo = [esc.id, ...escuelas.filter(e => e.es_plantel && e.escuela_padre_id === esc.id).map(e => e.id)];
      const cobroEsc  = cobros.filter(c => idsGrupo.includes(c.escuela_id));
      const alumnosEsc = clientes.filter(c => idsGrupo.includes(c.escuela_id) && c.activo);
      const pagados   = cobroEsc.filter(c => c.estado === 'pagado');
      const pendientes = cobroEsc.filter(c => c.estado === 'pendiente');
      return {
        escuela_id:     esc.id,
        nombre:         esc.nombre,
        clave:          esc.clave,
        emoji:          esc.logo_emoji,
        color:          esc.color,
        plan:           esc.plan,
        activa:         !!esc.activa,
        numPlanteles:   idsGrupo.length - 1,
        totalCobrado:   pagados.reduce((a,c)=>a+c.total,0),
        totalPendiente: pendientes.reduce((a,c)=>a+c.total,0),
        numCobros:      cobroEsc.length,
        numAlumnos:     alumnosEsc.length,
        porMetodo: {
          TC:       pagados.filter(c=>c.metodo==='TC').reduce((a,c)=>a+c.total,0),
          SPEI:     pagados.filter(c=>c.metodo==='SPEI').reduce((a,c)=>a+c.total,0),
          CoDi:     pagados.filter(c=>c.metodo==='CoDi').reduce((a,c)=>a+c.total,0),
          Efectivo: pagados.filter(c=>c.metodo==='Efectivo').reduce((a,c)=>a+c.total,0),
        },
      };
    });
  }

  // Estadísticas de una sola escuela
  function getEstadisticas(cobros) {
    const hoy = new Date().toISOString().slice(0, 10);
    return {
      totalCobrado:   cobros.filter(c=>c.estado==='pagado').reduce((a,c)=>a+c.total,0),
      totalPendiente: cobros.filter(c=>c.estado==='pendiente').reduce((a,c)=>a+c.total,0),
      cobrosHoy:      cobros.filter(c=>c.fecha===hoy&&c.estado==='pagado').reduce((a,c)=>a+c.total,0),
      totalCobros:    cobros.length,
      cobradosPorMetodo: {
        TC:       cobros.filter(c=>c.metodo==='TC'&&c.estado==='pagado').reduce((a,c)=>a+c.total,0),
        SPEI:     cobros.filter(c=>c.metodo==='SPEI'&&c.estado==='pagado').reduce((a,c)=>a+c.total,0),
        CoDi:     cobros.filter(c=>c.metodo==='CoDi'&&c.estado==='pagado').reduce((a,c)=>a+c.total,0),
        Efectivo: cobros.filter(c=>c.metodo==='Efectivo'&&c.estado==='pagado').reduce((a,c)=>a+c.total,0),
      },
    };
  }

  return { load, save, nextId, nextFolio, getEstadisticas, getEstadisticasGlobales, INITIAL_STATE };
})();
