<?php
        // Lista del grupo para pasar asistencia en una fecha: cada alumno con
        // el estado ya capturado ese día (o null si todavía no se pasa lista).
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, array_merge(ESCOLAR_ROLES_LECTURA, ['docente']), ['escolar_asistencias']);
        $g = escolar_grupo($pdo, $ctx, $input['grupo_id'] ?? 0);
        $fecha = escolar_fecha($input['fecha'] ?? date('Y-m-d'));

        $alumnos = escolar_alumnos_grupo($pdo, $g['id']);
        $st = $pdo->prepare("SELECT cliente_id, estado, observacion FROM asistencias WHERE grupo_id = ? AND fecha = ?");
        $st->execute([intval($g['id']), $fecha]);
        $reg = [];
        foreach ($st->fetchAll() as $r) $reg[intval($r['cliente_id'])] = $r;
        foreach ($alumnos as &$a) {
            $a['estado'] = $reg[$a['id']]['estado'] ?? null;
            $a['observacion'] = $reg[$a['id']]['observacion'] ?? '';
        }
        unset($a);
        respond([
            'success'   => true,
            'grupo'     => ['id' => intval($g['id']), 'nombre' => $g['nombre']],
            'fecha'     => $fecha,
            'capturada' => count($reg) > 0,
            'alumnos'   => $alumnos,
        ]);
