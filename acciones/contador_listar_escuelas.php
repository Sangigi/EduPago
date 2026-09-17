<?php
// acciones/contador_listar_escuelas.php
//
// Lista todas las escuelas con su estado de documentación, para el panel
// del rol 'contador'. Deliberadamente NO reutiliza cargar_datos.php (que
// hace SELECT * de escuelas con muchos campos que contador no necesita ni
// debe ver, como datos de suscripción/plan) -- solo lo mínimo para saber
// qué escuela revisar.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'contador'], 'No tienes permiso para ver esto.');

try {
    $stmt = $pdo->query(
        "SELECT id, nombre, clave, tipo_persona, documentacion_estado, modo
           FROM escuelas WHERE es_plantel = 0
          ORDER BY FIELD(documentacion_estado, 'en_revision', 'rechazada', 'sin_enviar', 'aprobada'), nombre ASC"
    );
    $escuelas = $stmt->fetchAll();
} catch (\PDOException $e) {
    // Antes esto tronaba sin explicación clara si faltaba correr
    // migracion_2026_09_11_fase3_onboarding.sql (tipo_persona/
    // documentacion_estado) o migracion_2026_09_11_modo_demo.sql (modo) --
    // el panel de contador se quedaba vacío sin ningún error visible.
    respond(['success' => false, 'error' => '¿Falta correr migracion_2026_09_11_fase3_onboarding.sql o migracion_2026_09_11_modo_demo.sql? ' . $e->getMessage()]);
}

respond(['success' => true, 'escuelas' => $escuelas]);
