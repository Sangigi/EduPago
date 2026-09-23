<?php
// acciones/guia_marcar_vista.php
//
// Marca la guía de primer uso como ya vista para el usuario en sesión, para
// que no se le vuelva a interrumpir en cada login.
//
// Es de autoservicio: cada quien marca la SUYA. No recibe usuario_id — se usa
// el de la sesión — así que no hay forma de marcarle la guía a otra persona.
// Por eso no lleva requerir_rol con una lista de roles: la guía es de
// cualquiera que entre, incluidos los roles de plataforma.
//
// Ver migracion_2026_09_23_guia_primer_uso.sql.

$uid_guia = intval($usuario_actual['user_id'] ?? 0);
if (!$uid_guia) respond(['success' => false, 'error' => 'Sesión no válida']);

try {
    // Solo si sigue en NULL: así la fecha guardada es la de la PRIMERA vez que
    // la cerró, no la de la última. Si se sobrescribiera, se perdería el dato
    // de cuánto tardó un colegio en arrancar.
    $pdo->prepare("UPDATE usuarios SET guia_vista_en = NOW() WHERE id = ? AND guia_vista_en IS NULL")
        ->execute([$uid_guia]);
} catch (\PDOException $e) {
    // Si la migración del 23-sep todavía no corrió, la columna no existe. No
    // es motivo para tumbar nada: la guía simplemente se volverá a mostrar en
    // el siguiente login, que es molesto pero inofensivo.
    log_api('guia_marcar_vista: no se pudo marcar (¿falta migracion_2026_09_23_guia_primer_uso.sql?) -> ' . $e->getMessage());
    respond(['success' => true, 'persistido' => false]);
}

respond(['success' => true, 'persistido' => true]);
