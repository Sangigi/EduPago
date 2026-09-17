<?php
        // Independiente de escuela_id_ver / cargar_datos: el panel "Ver
        // planteles" en Escuelas.js puede abrirse para cualquier escuela sin
        // importar cuál esté seleccionada en el nav global.
        $escuela_id_pe = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        if (!$escuela_id_pe) respond(['success' => false, 'error' => 'escuela_id requerido']);
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'admin'], 'No tienes permiso para ver planteles.');
        requerir_escuela_propia($usuario_actual['rol'] ?? '', $escuela_id_pe, $usuario_actual, 'No tienes permiso para ver planteles de esa escuela.');
        $stmt = $pdo->prepare("SELECT * FROM planteles WHERE escuela_id = ? ORDER BY id");
        $stmt->execute([$escuela_id_pe]);
        $planteles_pe = array_map(function($p) {
            $p['activo'] = (bool)$p['activo'];
            return $p;
        }, $stmt->fetchAll());
        respond(['success' => true, 'planteles' => $planteles_pe, 'escuela_id' => $escuela_id_pe]);
