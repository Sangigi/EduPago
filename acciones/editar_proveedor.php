<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para editar proveedores.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmtChk = $pdo->prepare("SELECT escuela_id FROM proveedores WHERE id = ?");
        $stmtChk->execute([$id]);
        $provActual = $stmtChk->fetch();
        if (!$provActual) respond(['success' => false, 'error' => 'Proveedor no encontrado']);
        requerir_escuela_propia($rol_actual, $provActual['escuela_id'], $usuario_actual, 'No tienes permiso para editar proveedores de esa escuela.');
        $campos = ['nombre', 'categoria', 'rfc', 'contacto_nombre', 'contacto_telefono', 'contacto_email', 'activo'];
        $sets = []; $vals = [];
        foreach ($campos as $c) {
            if (!array_key_exists($c, $input)) continue;
            $sets[] = "`$c` = ?";
            if ($c === 'activo')             $vals[] = (bool)$input[$c] ? 1 : 0;
            elseif ($c === 'contacto_email') $vals[] = validar_email_opcional($input[$c]);
            else                             $vals[] = trim($input[$c]) ?: null;
        }
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        $vals[] = $id;
        $pdo->prepare("UPDATE proveedores SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
        $stmt2 = $pdo->prepare("SELECT * FROM proveedores WHERE id = ?");
        $stmt2->execute([$id]);
        $provActualizado = $stmt2->fetch();
        $provActualizado['activo'] = (bool)$provActualizado['activo'];
        registrar_log($pdo, $usuario_actual, 'proveedor_editado', "Proveedor #{$id} editado", $provActual['escuela_id']);
        respond(['success' => true, 'proveedor' => $provActualizado]);
