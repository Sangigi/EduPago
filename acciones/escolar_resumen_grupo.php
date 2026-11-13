<?php
        // Reporte académico de un grupo: por alumno (promedio general,
        // materias reprobadas, % de asistencia en el ciclo) y por materia
        // (promedio del grupo, reprobados). Sirve para detectar alumnos en
        // riesgo antes de la junta de consejo técnico.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin', 'docente'], ['escolar_calificaciones', 'escolar_asistencias']);
        $eid = $ctx['escuela_id'];
        $g = escolar_grupo($pdo, $ctx, $input['grupo_id'] ?? 0);
        $ciclo = escolar_ciclo($pdo, $eid, $g['ciclo_id']);
        $aprob = floatval($ciclo['calif_aprobatoria']);

        $alumnos = escolar_alumnos_grupo($pdo, $g['id']);
        $porMateria = [];
        $filas = [];
        foreach ($alumnos as $a) {
            $b = escolar_armar_boleta($pdo, $eid, $a['id'], $ciclo);
            foreach ($b['materias'] as $m) {
                $k = $m['materia'];
                if (!isset($porMateria[$k])) $porMateria[$k] = ['materia' => $k, 'docente' => $m['docente'], 'suma' => 0, 'n' => 0, 'reprobados' => 0];
                if ($m['promedio'] !== null) {
                    $porMateria[$k]['suma'] += $m['promedio'];
                    $porMateria[$k]['n']++;
                    if ($m['promedio'] < $aprob) $porMateria[$k]['reprobados']++;
                }
            }
            $riesgo = ($b['materias_reprobadas'] > 0)
                   || ($b['asistencia']['porcentaje'] !== null && $b['asistencia']['porcentaje'] < 85);
            $filas[] = [
                'id'                  => $a['id'],
                'nombre'              => $a['nombre'],
                'matricula'           => $a['matricula'],
                'promedio_general'    => $b['promedio_general'],
                'materias_reprobadas' => $b['materias_reprobadas'],
                'asistencia'          => $b['asistencia'],
                'en_riesgo'           => $riesgo,
            ];
        }
        $materias = array_values(array_map(function ($m) {
            return [
                'materia' => $m['materia'], 'docente' => $m['docente'],
                'promedio' => $m['n'] ? round($m['suma'] / $m['n'], 1) : null,
                'evaluados' => $m['n'], 'reprobados' => $m['reprobados'],
            ];
        }, $porMateria));
        $proms = array_values(array_filter(array_column($filas, 'promedio_general'), function ($p) { return $p !== null; }));

        respond([
            'success'  => true,
            'grupo'    => ['id' => intval($g['id']), 'nombre' => $g['nombre']],
            'ciclo'    => ['id' => intval($ciclo['id']), 'nombre' => $ciclo['nombre'], 'calif_aprobatoria' => $aprob],
            'promedio_grupo' => $proms ? round(array_sum($proms) / count($proms), 1) : null,
            'en_riesgo' => count(array_filter($filas, function ($f) { return $f['en_riesgo']; })),
            'alumnos'  => $filas,
            'materias' => $materias,
        ]);
