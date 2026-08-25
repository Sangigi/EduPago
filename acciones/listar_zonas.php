<?php
        $stmtZonas = $pdo->prepare("SELECT id, nombre, activa FROM zonas WHERE activa = 1 ORDER BY nombre");
        $stmtZonas->execute();
        respond(['success' => true, 'zonas' => array_map(function($z) {
            $z['id'] = intval($z['id']);
            $z['activa'] = (bool)$z['activa'];
            return $z;
        }, $stmtZonas->fetchAll())]);
