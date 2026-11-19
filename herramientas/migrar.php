<?php
// herramientas/migrar.php — migraciones de base de datos (solo CLI).
//
//   php herramientas/migrar.php            Muestra el estado de cada paso. NO cambia nada.
//   php herramientas/migrar.php --aplicar  Aplica los pasos pendientes.
//   php herramientas/migrar.php --todo     Con el estado, lista TAMBIÉN los pasos ya registrados.
//
// Códigos de salida: 0 = todo bien (o al consultar, nada pendiente);
// 1 = error al aplicar o al conectar; 2 = al solo consultar, quedan pasos
// pendientes (útil en scripts de despliegue).
//
// Ver docs/mejoras-of/of4-migraciones.md y herramientas/LEEME.md.

require_once __DIR__ . '/_conexion.php';
require_once __DIR__ . '/../lib/migraciones.php';

$aplicar = in_array('--aplicar', $argv, true);
$todo    = in_array('--todo', $argv, true);

try {
    $pdo = herramientas_conectar();
    $nombre_bd = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
} catch (Throwable $e) {
    fwrite(STDERR, "No se pudo conectar a la base de datos: " . $e->getMessage() . "\n");
    exit(1);
}

echo "Base de datos: {$nombre_bd}\n\n";

if (!$aplicar) {
    $est = migraciones_estado($pdo);
    $marca = [
        'aplicada' => 'aplicada', 'ya_existia' => 'ya existia', 'pendiente' => 'PENDIENTE',
        'por_registrar' => 'por anotar', 'bloqueada' => 'BLOQUEADA',
    ];
    foreach ($est['pasos'] as $p) {
        $mostrar = $todo || in_array($p['estado'], ['pendiente', 'bloqueada'], true);
        if (!$mostrar) continue;
        printf("  [%-10s] %s\n               %s%s\n", $marca[$p['estado']] ?? $p['estado'], $p['id'], $p['descripcion'],
            $p['estado'] === 'bloqueada' && $p['detalle'] ? "\n               >> " . $p['detalle'] : '');
    }
    echo "Total de pasos: {$est['total']}\n";
    echo "Pendientes (harian cambios): {$est['pendientes']}";
    if ($est['bloqueadas']) echo " (de ellos {$est['bloqueadas']} bloqueados)";
    echo "\nPor anotar (ya existen, solo se registran): {$est['por_registrar']}\n";
    if ($est['pendientes'] > 0) {
        echo "\nNo se cambio nada. Para aplicar:  php herramientas/migrar.php --aplicar\n";
        exit(2);
    }
    if ($est['por_registrar'] > 0) {
        echo "\nNada que cambiar. Corre --aplicar una vez para anotar lo que ya existia.\n";
    } else {
        echo "\nLa base esta al dia.\n";
    }
    exit(0);
}

echo "Aplicando migraciones pendientes...\n\n";
$res = migraciones_aplicar($pdo, function (array $p) {
    printf("  %-10s %s  (%d ms)\n             %s\n", strtoupper($p['resultado']), $p['id'], $p['duracion_ms'], $p['detalle']);
});
echo "\n";
if ($res['aplicadas'] + $res['ya_existian'] + $res['avisos'] === 0 && $res['ok']) {
    echo "No habia nada que hacer: la base esta al dia.\n";
}
echo "Aplicadas: {$res['aplicadas']} | Ya existian: {$res['ya_existian']} | Avisos: {$res['avisos']} | {$res['duracion_ms']} ms\n";
if (!$res['ok']) {
    fwrite(STDERR, "\nERROR en " . ($res['error']['id'] ?? '-') . ": " . $res['error']['mensaje'] . "\nSe detuvo aqui; los pasos anteriores quedaron registrados. Corrige y vuelve a correr --aplicar.\n");
    exit(1);
}
exit(0);
