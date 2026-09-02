<?php
        // Manda la carta de autorización de Cargos Automáticos a firmar por
        // DocuSign — requisito real de Cobroscontarjeta.com/el banco emisor,
        // un checkbox de "acepto términos" no es una autorización válida.
        // Ver lib/docusign_helper.php y el candado en cobrar_via_token().
        require_once __DIR__ . '/../lib/docusign_helper.php';

        $cliente_id = intval($input['cliente_id'] ?? 0);
        if (!$cliente_id) respond(['success' => false, 'error' => 'cliente_id requerido']);

        $stmtCli = $pdo->prepare("SELECT escuela_id, familia_id, autorizacion_cai_estado FROM clientes WHERE id = ?");
        $stmtCli->execute([$cliente_id]);
        $cli = $stmtCli->fetch();
        if (!$cli) respond(['success' => false, 'error' => 'Alumno no encontrado']);

        // Pertenencia: mismo patrón que cancelar_cai.php — familia solo su
        // propio hijo, admin/cajero solo alumnos de su escuela, superadmin
        // cualquiera.
        $rolFirma = $usuario_actual['rol'] ?? '';
        $puedeFirmar = $rolFirma === 'superadmin'
            || ($rolFirma === 'familia' && intval($cli['familia_id'] ?? -1) === intval($usuario_actual['familia_id'] ?? -2))
            || (in_array($rolFirma, ['admin', 'cajero'], true) && intval($cli['escuela_id']) === intval($usuario_actual['escuela_id'] ?? -1));
        if (!$puedeFirmar) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso sobre este alumno.']);
        }

        if ($cli['autorizacion_cai_estado'] === 'firmada') {
            respond(['success' => true, 'ya_firmada' => true, 'mensaje' => 'Este alumno ya tiene una autorización firmada.']);
        }

        $stmtEsc = $pdo->prepare("SELECT nombre FROM escuelas WHERE id = ?");
        $stmtEsc->execute([$cli['escuela_id']]);
        $nombreEscuela = $stmtEsc->fetch()['nombre'] ?? 'Paga la Escuela';

        $res = docusign_enviar_autorizacion_cai($pdo, $cliente_id, $nombreEscuela);
        if (!$res['success']) respond($res);

        registrar_log($pdo, $usuario_actual, 'firma_cai_solicitada', "Alumno #{$cliente_id}, envelope {$res['envelope_id']}", $cli['escuela_id']);
        respond(['success' => true, 'mensaje' => 'Se envió un correo con el enlace para firmar la autorización de cargos automáticos.']);
