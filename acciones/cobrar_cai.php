<?php
        // Cargo automático: acción de staff (cobrar dinero de una tarjeta ya
        // domiciliada), no autoservicio de familia — antes no exigía ningún rol.
        $rolCai = $usuario_actual['rol'] ?? '';
        requerir_rol($rolCai, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para cobrar cargos automáticos.');
        $cliente_id = intval($input['cliente_id'] ?? 0);
        $folio      = trim($input['folio'] ?? '');
        if (!$cliente_id || !$folio) respond(['success' => false, 'error' => 'cliente_id y folio son requeridos']);
        $stmtCli = $pdo->prepare("SELECT escuela_id, token_tarjeta, token_tarjeta_expmes, token_tarjeta_expanio, token_tarjeta_estado FROM clientes WHERE id = ?");
        $stmtCli->execute([$cliente_id]);
        $cli = $stmtCli->fetch();
        if (!$cli) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        // Antes no se validaba que el alumno perteneciera a la escuela del
        // usuario — un admin de otra escuela podía cobrar la tarjeta de
        // cualquier alumno del sistema.
        requerir_escuela_propia($rolCai, $cli['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
        requerir_seccion_habilitada($pdo, $rolCai, $cli['escuela_id'], ['caja']);
        requerir_metodo_pago_habilitado($pdo, $cli['escuela_id'], 'CAI', 'Domiciliación');
        if ($cli['token_tarjeta_estado'] !== 'activo' || !$cli['token_tarjeta']) {
            respond(['success' => false, 'error' => 'El alumno no tiene una tarjeta domiciliada activa. Debe pagar una liga primero para tokenizar.']);
        }
        // El cobro debe pertenecer a ESTE mismo alumno — antes solo se
        // validaba folio+pendiente, permitiendo saldar el adeudo de un alumno
        // cobrando la tarjeta domiciliada de otro completamente distinto.
        $stmtCob = $pdo->prepare("SELECT id, total FROM cobros WHERE folio = ? AND estado = 'pendiente' AND cliente_id = ?");
        $stmtCob->execute([$folio, $cliente_id]);
        $cobroRow = $stmtCob->fetch();
        if (!$cobroRow) respond(['success' => false, 'error' => 'No existe un cobro pendiente con ese folio para este alumno']);
        // El monto a cobrar sale del total real del cobro, nunca del request
        // — antes $total venía de $input y se mandaba tal cual a la pasarela,
        // desligado por completo de lo que el cobro realmente debía.
        $total = floatval($cobroRow['total']);
        // cobrar_via_token (lib/helpers_pagos.php) arma el payload, llama al
        // proveedor y ya recalcula saldo_pendiente — compartida con el cobro
        // automático de recurrentes en cron_recordatorios.php, para no
        // duplicar la llamada a Cobroscontarjeta.com en dos lugares.
        // Candado contra doble cobro. Sin esto, dos clics seguidos (o una
        // peticion reintentada) llegan aqui los dos: el segundo pasa el filtro
        // estado='pendiente' porque el primero todavia no confirmo su UPDATE,
        // y la tarjeta del padre termina con dos cargos por el mismo adeudo.
        //
        // GET_LOCK con timeout 0 no espera: si otra peticion ya esta cobrando
        // este cobro, devuelve 0 y se rechaza de inmediato en vez de encolar.
        $lockName = 'cobro_cai_' . intval($cobroRow['id']);
        $stmtLock = $pdo->prepare('SELECT GET_LOCK(?, 0) AS obtenido');
        $stmtLock->execute([$lockName]);
        $filaLock = $stmtLock->fetch();
        if (!$filaLock || intval($filaLock['obtenido']) !== 1) {
            respond(['success' => false, 'error' => 'Este cobro ya se esta procesando. Espera unos segundos y verifica antes de reintentar.']);
        }

        // Releer el estado YA con el candado tomado: si la peticion anterior
        // alcanzo a pagarlo, aqui se detecta y no se vuelve a cobrar.
        $stmtRe = $pdo->prepare("SELECT estado FROM cobros WHERE id = ?");
        $stmtRe->execute([intval($cobroRow['id'])]);
        $reFila = $stmtRe->fetch();
        if (!$reFila || $reFila['estado'] !== 'pendiente') {
            $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([$lockName]);
            respond(['success' => false, 'error' => 'Este cobro ya fue pagado.']);
        }

        $resCai = cobrar_via_token(
            $pdo, intval($cobroRow['id']), $cliente_id, $total,
            $cli['token_tarjeta'], $cli['token_tarjeta_expmes'], $cli['token_tarjeta_expanio']
        );
        $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([$lockName]);
        if (!$resCai['success']) respond(['success' => false, 'error' => $resCai['error'], 'raw' => $resCai['raw'] ?? null]);
        registrar_log($pdo, $usuario_actual, 'cargo_automatico_cobrado', "Cobro #{$cobroRow['id']} (alumno #{$cliente_id}), folio {$folio}, total \${$total}", $cli['escuela_id']);
        respond(['success' => true, 'cobro_id' => intval($cobroRow['id']), 'autorizacion' => $resCai['auth']]);
