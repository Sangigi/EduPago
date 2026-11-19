<?php
// herramientas/_conexion.php
//
// Conexión PDO para las herramientas de línea de comandos. Solo CLI.
//
// Normal (producción y desarrollo): usa la misma base que la aplicación, leída
// de config.php a través de lib/db.php. NO imprime credenciales.
//
// Para PROBAR contra otra base (por ejemplo una base de prueba local) se pueden
// definir variables de entorno ANTES de correr la herramienta, sin tocar
// config.php:
//     EDUPAGO_DB_NAME=edupago_prueba  EDUPAGO_DB_HOST=localhost
//     EDUPAGO_DB_USER=root            EDUPAGO_DB_PASS=
//     php herramientas/migrar.php
// Si EDUPAGO_DB_NAME está definida, se usa ESA base y config.php ni se carga.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function herramientas_conectar(): PDO
{
    $nombre = getenv('EDUPAGO_DB_NAME');
    if ($nombre !== false && $nombre !== '') {
        $host = getenv('EDUPAGO_DB_HOST') ?: 'localhost';
        $user = getenv('EDUPAGO_DB_USER') ?: 'root';
        $pass = getenv('EDUPAGO_DB_PASS');
        $pass = ($pass === false) ? '' : $pass;
        return new PDO("mysql:host={$host};dbname={$nombre};charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    // lib/db.php crea $pdo (o responde 500 y hace exit si no puede conectar).
    require_once __DIR__ . '/../lib/db.php';
    /** @var PDO $pdo */
    return $pdo;
}
