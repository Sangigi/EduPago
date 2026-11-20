<?php
// suplantar_terminar — sale de "Ver como" (OF-7c). Se llama CON el token de suplantación.
//
// El token de suplantación no se "cierra" en el servidor (es sin estado y vence solo en
// 30 minutos como máximo): esta acción deja constancia del FIN en la bitácora de auditoría
// y en logs_sistema, y el navegador suelta ese token y vuelve a su sesión propia (que
// nunca dejó de estar viva). No pide contraseña: ya se verificó al entrar.
//
// api.php la deja pasar sin importar el rol del objetivo (docente, alumno, tienda...) y aun
// con el colegio vencido, y el filtro de solo lectura tampoco la bloquea.
$ctx_sup = suplantacion_contexto($usuario_actual);
if ($ctx_sup === null) respond(['success' => false, 'error' => 'No estás viendo como otro usuario.']);
auditar($pdo, $usuario_actual, 'suplantar.fin', 'usuario', $usuario_actual['user_id'] ?? null, [],
    ['sale_de_ver_como' => 'sí', 'modo' => $ctx_sup['modo']], $usuario_actual['escuela_id'] ?? null, ['evento' => true]);
registrar_log($pdo, $usuario_actual, 'suplantar_fin',
    "Salió de ver como el usuario #" . intval($usuario_actual['user_id'] ?? 0) . " (modo {$ctx_sup['modo']})");
respond(['success' => true]);
