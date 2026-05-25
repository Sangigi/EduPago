/**
 * MODEL — AppModel
 * Estado central de la aplicación con persistencia en localStorage.
 * Sigue el patrón MVC: el modelo maneja solo datos, sin lógica de UI.
 */
const AppModel = (() => {
  const KEY = 'edupago_data_v2';

  const INITIAL_STATE = {
    clientes: [
      { id:1, tipo:'alumno', nombre:'Ana García López', grado:'3° Primaria', curp:'GALA090315MDFPNB08', email:'familia.garcia@mail.com', tel:'5512345678', saldo_pendiente:2800, activo:true },
      { id:2, tipo:'alumno', nombre:'Luis Martínez Ramos', grado:'5° Primaria', curp:'MARL050820HDFRMB04', email:'martinez.ramos@mail.com', tel:'5598765432', saldo_pendiente:0, activo:true },
      { id:3, tipo:'familia', nombre:'Familia Hernández Torres', grado:'—', curp:'', email:'hernandez.t@mail.com', tel:'5567891234', saldo_pendiente:5600, activo:true },
      { id:4, tipo:'alumno', nombre:'Sofía Ruiz Pérez', grado:'1° Secundaria', curp:'RUPS100201MDFZFB06', email:'sofia.ruiz@mail.com', tel:'5543219876', saldo_pendiente:1200, activo:true },
      { id:5, tipo:'alumno', nombre:'Diego López Castro', grado:'6° Primaria', curp:'LOCD090930HDFPSD01', email:'lopez.castro@mail.com', tel:'5534567890', saldo_pendiente:0, activo:false },
    ],
    productos: [
      { id:1, nombre:'Colegiatura Mensual', categoria:'colegiatura', precio:2800, descripcion:'Pago mensual de colegiatura', emoji:'📚', activo:true },
      { id:2, nombre:'Anualidad Primaria', categoria:'anualidad', precio:28000, descripcion:'Pago anual con 2 meses de descuento', emoji:'🎯', activo:true },
      { id:3, nombre:'Beca Excelencia 25%', categoria:'beca', precio:-700, descripcion:'Descuento 25% en colegiatura', emoji:'🏆', activo:true },
      { id:4, nombre:'Inscripción', categoria:'inscripcion', precio:3500, descripcion:'Pago único de inscripción', emoji:'✏️', activo:true },
      { id:5, nombre:'Uniforme Completo', categoria:'uniforme', precio:1800, descripcion:'Juego completo de uniforme escolar', emoji:'👕', activo:true },
      { id:6, nombre:'Material Didáctico', categoria:'material', precio:950, descripcion:'Paquete de útiles y libros', emoji:'📖', activo:true },
      { id:7, nombre:'Transporte Mensual', categoria:'transporte', precio:1400, descripcion:'Servicio de transporte escolar', emoji:'🚌', activo:true },
      { id:8, nombre:'Comedor Mensual', categoria:'comedor', precio:1100, descripcion:'Servicio de comedor escolar', emoji:'🍽️', activo:true },
    ],
    cobros: [
      { id:1, folio:'COB-0001', cliente_id:1, cliente:'Ana García López', items:[{nombre:'Colegiatura Mensual',qty:1,precio:2800}], total:2800, metodo:'TC', estado:'pagado', fecha:'2026-05-01', factura:true, referencia:'REF-001' },
      { id:2, folio:'COB-0002', cliente_id:3, cliente:'Familia Hernández Torres', items:[{nombre:'Colegiatura Mensual',qty:2,precio:2800}], total:5600, metodo:'SPEI', estado:'pendiente', fecha:'2026-05-03', factura:false, referencia:'CLABE-7100700000000042', clabe:'710070000000004200' },
      { id:3, folio:'COB-0003', cliente_id:2, cliente:'Luis Martínez Ramos', items:[{nombre:'Inscripción',qty:1,precio:3500},{nombre:'Uniforme Completo',qty:1,precio:1800}], total:5300, metodo:'TC', estado:'pagado', fecha:'2026-05-05', factura:true, referencia:'REF-003' },
      { id:4, folio:'COB-0004', cliente_id:4, cliente:'Sofía Ruiz Pérez', items:[{nombre:'Material Didáctico',qty:1,precio:950},{nombre:'Transporte Mensual',qty:1,precio:1400}], total:2350, metodo:'CoDi', estado:'pagado', fecha:'2026-05-10', factura:false, referencia:'CODI-004' },
      { id:5, folio:'COB-0005', cliente_id:1, cliente:'Ana García López', items:[{nombre:'Comedor Mensual',qty:1,precio:1100}], total:1100, metodo:'Efectivo', estado:'pendiente', fecha:'2026-05-12', factura:false, referencia:'EFE-005' },
    ],
    emails: [
      { id:1, tipo:'enviado', asunto:'Recordatorio de pago — Colegiatura Mayo', para:'familia.garcia@mail.com', fecha:'2026-05-14', estado:'entregado' },
      { id:2, tipo:'enviado', asunto:'Comprobante de pago COB-0003', para:'martinez.ramos@mail.com', fecha:'2026-05-05', estado:'entregado' },
      { id:3, tipo:'recibido', asunto:'Consulta sobre beca', de:'hernandez.t@mail.com', fecha:'2026-05-13', leido:false },
      { id:4, tipo:'recibido', asunto:'Solicitud de factura', de:'sofia.ruiz@mail.com', fecha:'2026-05-11', leido:true },
    ],
  };

  /** Carga datos desde localStorage o devuelve el estado inicial */
  function load() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return JSON.parse(JSON.stringify(INITIAL_STATE));
  }

  /** Guarda datos en localStorage */
  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch(e) {}
  }

  /** Helpers de ID y folio */
  function nextId(arr) {
    return arr.length === 0 ? 1 : Math.max(...arr.map(x => x.id)) + 1;
  }

  function nextFolio(cobros) {
    const n = nextId(cobros);
    return 'COB-' + String(n).padStart(4, '0');
  }

  /** Genera una CLABE interbancaria única de 18 dígitos */
  function generarCLABE(importe, referencia) {
    // Simulación de CLABE dinámica tipo STP/Pagadetodo
    const base = '710070000000'; // banco Azteca + ciudad
    const ref = String(referencia).padStart(4, '0').slice(-4);
    const rand = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    const clabe16 = base + ref + rand;
    // Dígito verificador CLABE (algoritmo oficial)
    const pesos = [3,7,1,3,7,1,3,7,1,3,7,1,3,7,1,3,7];
    let suma = 0;
    for(let i = 0; i < 17; i++) {
      suma += parseInt(clabe16[i]) * pesos[i];
    }
    const dv = (10 - (suma % 10)) % 10;
    return clabe16 + String(dv);
  }

  /** Genera QR CoDi (URL de string que representa el pago) */
  function generarCodiPayload(cobro) {
    return `CODI|${cobro.folio}|${cobro.total}|${cobro.cliente}|EDUPAGO|${Date.now()}`;
  }

  return { load, save, nextId, nextFolio, generarCLABE, generarCodiPayload, INITIAL_STATE };
})();