<?php
// acciones/contador_listar_escuelas.php
//
// Lista todas las escuelas con su estado de documentación, para el panel
// del rol 'contador'. Deliberadamente NO reutiliza cargar_datos.php (que
// hace SELECT * de escuelas con muchos campos que contador no necesita ni
// debe ver, como datos de suscripción/plan) -- solo lo mínimo para saber
// qué escuela revisar.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'contador'], 'No tienes permiso para ver esto.');

$stmt = $pdo->query(
    "SELECT id, nombre, clave, tipo_persona, documentacion_estado, modo
       FROM escuelas WHERE es_plantel = 0
      ORDER BY FIELD(documentacion_estado, 'en_revision', 'rechazada', 'sin_enviar', 'aprobada'), nombre ASC"
);
$escuelas = $stmt->fetchAll();

respond(['success' => true, 'escuelas' => $escuelas]);
