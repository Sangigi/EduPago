-- EduPago — Migración: catálogo compartido de "zonas".
--
-- Antes, `usuarios.zona` (distribuidores) y `planteles.zona` (sucursales de
-- escuela) eran dos columnas de texto libre, sin relación entre sí y sin
-- catálogo — cada quien tecleaba lo que quisiera (typos, mayúsculas
-- inconsistentes, "CDMX" vs "Ciudad de México", etc.), y no había forma de
-- hacer un reporte real "por zona". Esta migración crea una tabla `zonas`
-- única y reutilizable, y migra los valores de texto ya existentes.
--
-- Aplica esto UNA VEZ en la base de datos de producción antes de subir el
-- código nuevo. Las columnas de texto libre `usuarios.zona` / `planteles.zona`
-- se DEJAN INTACTAS (no se borran) como respaldo — el código nuevo usa
-- `zona_id`, con las columnas de texto solo como referencia histórica.

CREATE TABLE zonas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  activa TINYINT(1) NOT NULL DEFAULT 1
);

ALTER TABLE usuarios ADD COLUMN zona_id INT NULL;
ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_zona FOREIGN KEY (zona_id) REFERENCES zonas(id);

ALTER TABLE planteles ADD COLUMN zona_id INT NULL;
ALTER TABLE planteles ADD CONSTRAINT fk_planteles_zona FOREIGN KEY (zona_id) REFERENCES zonas(id);

-- Poblar el catálogo con los valores de texto que ya existían en ambas tablas.
INSERT IGNORE INTO zonas (nombre)
  SELECT DISTINCT TRIM(zona) FROM usuarios WHERE zona IS NOT NULL AND TRIM(zona) <> '';
INSERT IGNORE INTO zonas (nombre)
  SELECT DISTINCT TRIM(zona) FROM planteles WHERE zona IS NOT NULL AND TRIM(zona) <> '';

-- Vincular cada fila existente a su zona ya migrada.
UPDATE usuarios u JOIN zonas z ON z.nombre = TRIM(u.zona)
  SET u.zona_id = z.id WHERE u.zona IS NOT NULL AND TRIM(u.zona) <> '';
UPDATE planteles p JOIN zonas z ON z.nombre = TRIM(p.zona)
  SET p.zona_id = z.id WHERE p.zona IS NOT NULL AND TRIM(p.zona) <> '';
