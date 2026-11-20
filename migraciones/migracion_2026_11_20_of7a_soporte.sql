-- migracion_2026_11_20_of7a_soporte.sql  (OF-7a, 20-nov-2026)
-- Tickets de soporte dentro de la plataforma + Ayuda (artículos y novedades).
--
-- DOCUMENTACIÓN. Desde OF-4a esto lo aplica solo lib/migraciones.php (ids 2026_11_20_of7a_01 .. 07):
--     php herramientas/migrar.php --aplicar        o   Diagnóstico → Base de datos → Aplicar pendientes
-- Pegarlo a mano en phpMyAdmin también sirve y es seguro repetirlo: todo es CREATE TABLE IF NOT EXISTS
-- y la siembra solo corre si ayuda_articulos está vacía.
--
-- MySQL 5.7+ (DATETIME(3) pide >= 5.6.4). Sin FOREIGN KEY, InnoDB utf8mb4, como el resto del esquema.
-- config.php no se toca. El código tolera que esto no haya corrido: muestra "el soporte aún no está
-- instalado" y el menú no se rompe.

SET NAMES utf8mb4;

-- Tabla soporte_tickets (tickets de soporte de los colegios)
CREATE TABLE IF NOT EXISTS soporte_tickets (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id        INT UNSIGNED NOT NULL,
  creado_por        INT UNSIGNED NOT NULL,
  asunto            VARCHAR(150) NOT NULL,
  categoria         VARCHAR(20)  NOT NULL DEFAULT 'otro',
  estado            VARCHAR(20)  NOT NULL DEFAULT 'abierto',
  prioridad         VARCHAR(10)  NOT NULL DEFAULT 'normal',
  asignado_a        INT UNSIGNED NULL DEFAULT NULL,
  ultimo_autor      VARCHAR(10)  NOT NULL DEFAULT 'colegio',
  ultimo_mensaje_en DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  creado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cerrado_en        DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_sop_escuela (escuela_id, estado, ultimo_mensaje_en),
  KEY idx_sop_bandeja (estado, ultimo_autor, ultimo_mensaje_en),
  KEY idx_sop_asignado (asignado_a)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla soporte_mensajes (conversación; interno = 1 es nota interna que el colegio nunca ve)
CREATE TABLE IF NOT EXISTS soporte_mensajes (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id  INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NULL DEFAULT NULL,
  rol_autor  VARCHAR(20)  NOT NULL,
  texto      TEXT         NOT NULL,
  interno    TINYINT(1)   NOT NULL DEFAULT 0,
  creado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sopm_ticket (ticket_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla soporte_adjuntos (archivos de un mensaje; viven en uploads_privados/)
CREATE TABLE IF NOT EXISTS soporte_adjuntos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id       INT UNSIGNED NOT NULL,
  mensaje_id      INT UNSIGNED NOT NULL,
  nombre_original VARCHAR(255) NULL DEFAULT NULL,
  ruta_archivo    VARCHAR(255) NOT NULL,
  mime_real       VARCHAR(100) NULL DEFAULT NULL,
  tamano_bytes    INT UNSIGNED NOT NULL DEFAULT 0,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sopa_ticket (ticket_id),
  KEY idx_sopa_mensaje (mensaje_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla soporte_lecturas (marca de leído por usuario y ticket)
CREATE TABLE IF NOT EXISTS soporte_lecturas (
  ticket_id  INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  leido_en   DATETIME(3)  NOT NULL,
  PRIMARY KEY (ticket_id, usuario_id),
  KEY idx_sopl_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla ayuda_articulos (artículos y novedades de Ayuda)
CREATE TABLE IF NOT EXISTS ayuda_articulos (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo           VARCHAR(10)  NOT NULL DEFAULT 'articulo',
  titulo         VARCHAR(200) NOT NULL,
  cuerpo         TEXT         NOT NULL,
  roles_visibles VARCHAR(100) NOT NULL DEFAULT '["admin","cajero"]',
  publicado      TINYINT(1)   NOT NULL DEFAULT 0,
  publicado_en   DATETIME     NULL DEFAULT NULL,
  creado_por     INT UNSIGNED NULL DEFAULT NULL,
  creado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ayuda_tipo (tipo, publicado, publicado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla ayuda_usuario (última vez que cada usuario vio las novedades)
CREATE TABLE IF NOT EXISTS ayuda_usuario (
  usuario_id          INT UNSIGNED NOT NULL,
  novedades_vistas_en DATETIME     NOT NULL,
  PRIMARY KEY (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 07. Siembra: 4 artículos útiles, SOLO si la tabla está vacía. Un solo INSERT (con cuatro, el primero
-- dejaría la tabla con filas y los otros tres ya no cumplirían la condición).
INSERT INTO ayuda_articulos (tipo, titulo, cuerpo, roles_visibles, publicado, publicado_en, creado_en)
SELECT t.tipo, t.titulo, t.cuerpo, t.roles, 1, NOW(), NOW() FROM (
SELECT 'articulo' AS tipo, 'Cómo registrar un cobro en Caja' AS titulo,
'La pantalla **Ingresos** es donde se cobra en mostrador. Para cobrar necesitas tener una caja abierta.

**Paso a paso**

- **Abre tu caja.** Si no tienes una abierta, Ingresos te pide el fondo de apertura (el efectivo con el que empiezas el turno). Captúralo y abre.
- **Elige a quién le cobras.** En "Cobro en curso" toca el recuadro del cliente y busca al alumno o a la familia por nombre. Si el alumno tiene una beca vigente, se aplica sola como un renglón de descuento; puedes quitarla con la ✕ si no corresponde.
- **Agrega los conceptos.** Toca los conceptos de la lista (colegiatura, inscripción, uniforme...). Con + y − cambias la cantidad. Abajo ves el subtotal y el total.
- **Elige el método de pago.** Efectivo, tarjeta, SPEI, efectivo en tienda o cheque.
- **Toca "Cobrar".** Con efectivo escribes el monto recibido y el sistema te dice el cambio a devolver.

**Qué pasa según el método**

- **Efectivo y cheque** se registran al momento. El cheque pide los datos del banco y del titular.
- **SPEI:** se muestra la CLABE del alumno y el monto exacto. El cobro queda esperando y se confirma solo cuando llega el depósito. Si el alumno no tiene CLABE, asígnala antes desde su ficha en Alumnos.
- **Tarjeta y efectivo en tienda:** el sistema genera una liga o una referencia para que la familia pague. No hace falta esperar en pantalla: el cobro se confirma solo cuando se paga.

Al terminar el cobro puedes usar **Ver ticket** para imprimirlo o **Facturar compra** si la familia pidió factura. Al terminar tu turno, haz tu **Corte de caja**.' AS cuerpo,
'["admin","cajero"]' AS roles
UNION ALL
SELECT 'articulo' AS tipo, 'Cómo funcionan los abonos parciales' AS titulo,
'Un cobro no tiene que pagarse de una sola vez. Cada pago que se recibe se registra como un **abono**, y el cobro sigue pendiente hasta que los abonos suman el total.

**Cómo se ve**

- En **Historial cobros**, un cobro con abonos que aún no se completa muestra en ámbar cuánto **falta**.
- Al abrir el cobro, si tiene más de un abono, aparece **Pagado en N exhibiciones**: la fecha, el método y el monto de cada uno, cada uno con su propio folio (por ejemplo COL-0123-01, COL-0123-02) y lo que **falta por pagar**.
- Cuando los abonos cubren el total, el cobro pasa a **pagado** solo.

**Qué hay que saber**

- Si la familia deposita por SPEI un importe distinto al del cobro, el depósito se aplica como abono: no se pierde ni se rechaza.
- El total del cobro nunca cambia: es la deuda original. Lo que se debe es el total menos lo abonado, y el saldo del alumno refleja solo lo que falta.
- Si el cobro ya se facturó a crédito (PPD), cada abono necesita su **complemento de pago**. En **Facturación** están los complementos pendientes.
- **Cancelar un cobro con abonos no devuelve el dinero.** El sistema te lo avisa y deja anotado cuánto se había recibido, para que la devolución se haga por fuera. Por eso, al dar de baja a un alumno, los cobros con abonos no se pueden cancelar desde ahí.' AS cuerpo,
'["admin","cajero"]' AS roles
UNION ALL
SELECT 'articulo' AS tipo, 'Cómo dar de baja a un alumno' AS titulo,
'En **Alumnos**, el botón de **Cambiar estatus** del alumno te permite registrar una baja, un egreso o un traslado, y también reactivarlo. No se borra al alumno: queda su historial.

**Los estatus**

- **Baja temporal:** el alumno se ausenta pero puede volver.
- **Baja definitiva:** el alumno ya no continuará.
- **Egresado:** terminó su nivel.
- **Traslado:** se va a otra escuela.

**Paso a paso**

- Elige el **nuevo estatus** y la **fecha efectiva**.
- Escribe el **motivo**: es obligatorio y queda en el historial del alumno (al reactivar no se pide).
- Decide si lo **sacas de sus grupos**. Se cierran sus inscripciones; el historial académico se conserva.
- Revisa los **adeudos pendientes**. Por defecto **se conservan todos** como deuda de la familia. Marca solo los que quieras cancelar. Los cobros con abonos no se pueden cancelar desde aquí.
- Elige qué pasa con su **CLABE SPEI**: conservarla (la familia puede seguir pagando adeudos por SPEI) o liberarla (regresa al pool y los depósitos posteriores ya no se ligan al alumno).

El cambio se aplica completo o no se aplica: si algo falla, no queda a medias. Para **reactivar**, usa el mismo botón y elige "Activo".' AS cuerpo,
'["admin"]' AS roles
UNION ALL
SELECT 'articulo' AS tipo, 'Cómo configurar el IVA de un concepto de pago' AS titulo,
'Cada concepto de pago tiene su propio **IVA**, que sirve para desglosar la factura (CFDI). Se configura en **Conceptos de pago**, al crear o editar un concepto, en el bloque **Facturación (CFDI)**.

**Los campos**

- **IVA:** Exento, Tasa 0% o 16% (incluido en el precio).
- **Unidad:** E48 (servicio), H87 (pieza) u otra clave.
- **Clave SAT:** 8 dígitos. Por defecto 86101800 (servicios educativos).

**Lo importante**

- **El precio que capturas es siempre el precio final.** El IVA se desglosa dentro de ese precio, no se suma encima. Lo que paga la familia no cambia.
- Al **crear** un concepto, la categoría sugiere un valor (por ejemplo, colegiatura e inscripción sugieren Exento y uniforme sugiere 16%). Es solo una sugerencia: puedes cambiarla.
- **Qué tasa le corresponde a cada concepto lo decide el contador del colegio.** El sistema solo te permite configurarla; consúltalo antes de cambiar nada.
- Los conceptos que ya existían quedan en 16% hasta que los edites.
- Cada cobro guarda la tasa que tenía el concepto **al momento de cobrar**. Cambiar un concepto después no modifica los cobros ya creados ni sus facturas.' AS cuerpo,
'["admin"]' AS roles
) t
WHERE NOT EXISTS (SELECT 1 FROM ayuda_articulos);
