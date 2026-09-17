<?php
// db.php
require_once __DIR__ . '/../config.php';

try {
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
} catch (\PDOException $e) {
    // Loguear el error internamente, no mostrar al cliente
    file_put_contents(defined('API_LOG_FILE') ? API_LOG_FILE : (__DIR__ . '/../api_log.txt'), date('Y-m-d H:i:s') . " | DB ERROR: " . $e->getMessage() . "\n", FILE_APPEND);
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(['success' => false, 'error' => 'Error de conexión a la base de datos']);
    exit;
}
?>