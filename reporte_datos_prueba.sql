-- reporte_datos_prueba.sql
-- SOLO CONSULTAS DE LECTURA — no borra nada. Córrelo en phpMyAdmin y revisa
-- cada bloque para decidir qué sí quieres borrar antes de generar
-- limpieza_datos_prueba.sql con los DELETE correspondientes.

-- ══════════════════════════════════════════════════════════════════════════
-- 1) Usuarios de prueba (cuentas demo usadas para probar el sistema)
-- ══════════════════════════════════════════════════════════════════════════
SELECT id, nombre, email, rol, escuela_id, familia_id, fecha_alta
FROM usuarios
WHERE nombre LIKE '%Prueba%'
   OR nombre LIKE '%prueba%'
   OR email LIKE '%dummy%'
   OR email LIKE '123@%'
ORDER BY id;

-- ══════════════════════════════════════════════════════════════════════════
-- 2) Alumnos con nombre/matrícula/CURP de relleno obvio (1-3 caracteres,
--    o literalmente "123"/"q") — candidatos claros a datos de prueba
-- ══════════════════════════════════════════════════════════════════════════
SELECT id, escuela_id, familia_id, nombre, matricula, curp, email
FROM clientes
WHERE CHAR_LENGTH(TRIM(nombre)) <= 3
   OR nombre = '123'
   OR matricula = 'Q'
   OR curp = 'Q'
ORDER BY escuela_id, id;

-- ══════════════════════════════════════════════════════════════════════════
-- 3) Alumnos/familias con correo @example.com — usados para probar el cron
--    de recordatorios/pagos recurrentes (nunca deberían recibir correo real)
-- ══════════════════════════════════════════════════════════════════════════
SELECT id, escuela_id, familia_id, nombre, email
FROM clientes
WHERE email LIKE '%@example.com'
ORDER BY escuela_id, id;

SELECT id, escuela_id, nombre, contacto, email
FROM familias
WHERE email LIKE '%@example.com'
ORDER BY escuela_id, id;

-- ══════════════════════════════════════════════════════════════════════════
-- 4) Familias con nombre de relleno obvio
-- ══════════════════════════════════════════════════════════════════════════
SELECT id, escuela_id, nombre, contacto, email
FROM familias
WHERE CHAR_LENGTH(TRIM(nombre)) <= 3
   OR nombre = '123'
ORDER BY escuela_id, id;

-- ══════════════════════════════════════════════════════════════════════════
-- 5) Colegios de prueba (clave/nombre de relleno, o ya sin alumnos/cobros —
--    candidatos a colegio de prueba que nunca se usó de verdad)
-- ══════════════════════════════════════════════════════════════════════════
SELECT e.id, e.nombre, e.clave, e.activa, e.fecha_alta,
       (SELECT COUNT(*) FROM clientes c WHERE c.escuela_id = e.id) AS num_alumnos,
       (SELECT COUNT(*) FROM cobros co WHERE co.escuela_id = e.id) AS num_cobros
FROM escuelas e
WHERE e.es_plantel = 0
  AND (CHAR_LENGTH(TRIM(e.clave)) <= 3 OR e.nombre = '2' OR e.clave = '123')
ORDER BY e.id;

-- ══════════════════════════════════════════════════════════════════════════
-- 6) Cobros de montos claramente de prueba ($0.01) — el mínimo real de
--    Cobroscontarjeta.com es $50, así que NO se incluyen cobros de $50 aquí
--    (esos pueden ser pruebas reales de integración, no basura obvia)
-- ══════════════════════════════════════════════════════════════════════════
SELECT id, escuela_id, cliente_id, folio, total, metodo, estado, fecha
FROM cobros
WHERE total = 0.01
ORDER BY id;

-- ══════════════════════════════════════════════════════════════════════════
-- 7) Cobros ligados a los alumnos/familias de prueba de los bloques 2-4
--    (para saber qué historial de cobros se iría junto con ellos si los borras)
-- ══════════════════════════════════════════════════════════════════════════
SELECT co.id, co.escuela_id, co.cliente_id, cl.nombre AS alumno, co.folio, co.total, co.metodo, co.estado, co.fecha
FROM cobros co
JOIN clientes cl ON cl.id = co.cliente_id
WHERE cl.email LIKE '%@example.com'
   OR CHAR_LENGTH(TRIM(cl.nombre)) <= 3
ORDER BY co.escuela_id, co.id;
