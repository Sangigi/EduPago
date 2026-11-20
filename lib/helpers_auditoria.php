<?php
// lib/helpers_auditoria.php
//
// [OF-7c] BITÁCORA DE AUDITORÍA CON ANTES Y DESPUÉS (20-nov-2026).
//
// logs_sistema ya dice "qué pasó" en una frase ("Cobro #5 cancelado"). Esto guarda ADEMÁS
// cómo estaba y cómo quedó la fila, solo en los campos que cambiaron: "cambió el precio a
// $999" no sirve si nadie recuerda cuánto era. Tabla `auditoria` (migración de OF-7c).
//
// DOS REGLAS QUE MANDAN SOBRE TODO LO DEMÁS (heredadas de OF-LIBERTYFIN)
//   1. auditar() NUNCA lanza ni tumba la operación. Si la tabla no existe (migración sin
//      correr), si el JSON no cabe, si el disco falla: deja UNA línea en api_log y sigue.
//      Un sistema donde no se puede cobrar porque falló la bitácora es peor que uno sin
//      bitácora. Por eso se llama SIEMPRE después del commit, nunca dentro de la transacción.
//   2. Solo se guarda lo que alguien podría necesitar reconstruir, y NUNCA un secreto:
//      password_hash, nip_hash, tokens, llaves, tarjetas y demás salen como "[oculto]";
//      la CLABE se enmascara (solo los últimos 4); y de los datos médicos solo queda el
//      NOMBRE del campo ("[dato médico]"), nunca su contenido. Ver auditoria_valor_seguro().
//
// QUÉ QUEDA ANOTADO CUANDO ES UNA SESIÓN DE "VER COMO"
//   usuario_id = el usuario objetivo (a cuyo nombre se hizo) y suplantado_por = quien lo
//   hizo en realidad. El inicio y el fin de cada "ver como" también se anotan.
//
// Todo lo puro (diferencia, enmascarado, JSON) se prueba en herramientas/pruebas.php.

/** Lo que se audita y cómo se lee. La clave es la que se guarda en auditoria.accion. */
const AUDITORIA_ACCIONES = [
    'cobro.cancelar'          => 'Canceló un cobro',
    'cfdi.cancelar'           => 'Pidió cancelar una factura',
    'alumno.estatus'          => 'Cambió el estatus de un alumno',
    'producto.editar'         => 'Editó un concepto de pago',
    'beca.guardar'            => 'Creó o editó una beca',
    'beca.estado'             => 'Activó o dio de baja una beca',
    'monedero.ajuste'         => 'Ajustó el saldo de un monedero',
    'inventario.ajuste'       => 'Ajustó la existencia de un producto',
    'inventario.conteo'       => 'Capturó un conteo físico de inventario',
    'usuario.crear'           => 'Creó un usuario',
    'usuario.editar'          => 'Editó un usuario',
    'usuario.activo'          => 'Activó o desactivó un usuario',
    'escuela.editar'          => 'Editó los datos de un colegio',
    'escuela.seccion'         => 'Encendió o apagó una sección de un colegio',
    'escuela.metodo_pago'     => 'Encendió o apagó un método de pago de un colegio',
    'escuela.demo'            => 'Cambió el modo demo de un colegio',
    'global.seccion'          => 'Encendió o apagó una sección en todos los colegios',
    'global.metodo_pago'      => 'Encendió o apagó un método de pago en todos los colegios',
    'escuela.contrato'        => 'Cambió el estado del contrato de un colegio',
    'importacion.aplicar'     => 'Aplicó una importación de adeudos',
    'importacion.deshacer'    => 'Deshizo una importación de adeudos',
    'suplantar.inicio'        => 'Entró a "Ver como" otro usuario',
    'suplantar.fin'           => 'Salió de "Ver como"',
    'cita.crear'              => 'Creó una cita',
    'cita.editar'             => 'Editó una cita',
    'cita.estado'             => 'Cambió el estado de una cita',
];

/** Las entidades que existen, para el filtro de la pantalla. */
const AUDITORIA_ENTIDADES = [
    'cobro' => 'Cobro', 'cfdi' => 'Factura', 'alumno' => 'Alumno', 'producto' => 'Concepto de pago',
    'beca' => 'Beca', 'monedero' => 'Monedero', 'inventario' => 'Inventario', 'usuario' => 'Usuario',
    'escuela' => 'Colegio', 'importacion' => 'Importación', 'cita' => 'Cita',
];

const AUDITORIA_MAX_CAMPOS = 60;
const AUDITORIA_MAX_VALOR  = 300;

/** ¿Existe la tabla `auditoria`? (migración de OF-7c). Se pregunta una vez por petición. */
function auditoria_lista(PDO $pdo): bool
{
    static $listo = null;
    if ($listo !== null) return $listo;
    try {
        $pdo->query("SELECT 1 FROM auditoria LIMIT 0");
        $listo = true;
    } catch (\Throwable $e) {
        $listo = false;
    }
    return $listo;
}

/** ¿La columna logs_sistema.suplantado_por ya existe? (para el listado de logs). */
function auditoria_logs_tiene_suplantado(PDO $pdo): bool
{
    static $r = null;
    if ($r !== null) return $r;
    try {
        $pdo->query("SELECT suplantado_por FROM logs_sistema LIMIT 0");
        $r = true;
    } catch (\Throwable $e) {
        $r = false;
    }
    return $r;
}

// ── Lo PURO ─────────────────────────────────────────────────────────────

/** Campos cuyo VALOR nunca se guarda (se anota solo que cambiaron). */
function auditoria_campo_secreto(string $campo): bool
{
    return (bool) preg_match('/pass|pwd|contrase|(^|_)nip(_|$)|token|secret|api_?key|llave|hash|tarjeta|(^|_)card|cvv|webhook|(^|_)otp(_|$)/i', $campo);
}

/** Campos cuyo contenido es médico: solo se anota el NOMBRE del campo. */
function auditoria_campo_medico(string $campo): bool
{
    return (bool) preg_match('/alerg|medic|enferm|padecim|discapac|diagnost|(^|_)salud|sangre|tratamient|condicion_m|necesidades_esp|vacuna|lesion|cirug/i', $campo);
}

/** La CLABE solo deja ver los últimos 4 dígitos. */
function auditoria_campo_clabe(string $campo): bool
{
    return (bool) preg_match('/clabe/i', $campo);
}

/**
 * El valor de un campo, listo para guardarse. Normaliza (bool → 0/1, números sin ceros
 * de más, texto recortado) y aplica las tres reglas de privacidad. PURA.
 */
function auditoria_valor_seguro(string $campo, $valor)
{
    if (auditoria_campo_secreto($campo)) return $valor === null || $valor === '' ? null : '[oculto]';
    if (auditoria_campo_medico($campo))  return $valor === null || $valor === '' ? null : '[dato médico]';
    if (auditoria_campo_clabe($campo)) {
        $d = preg_replace('/\D/', '', (string) $valor);
        if ($d === '') return null;
        return str_repeat('•', max(0, strlen($d) - 4)) . substr($d, -4);
    }
    if (is_bool($valor)) return $valor ? 1 : 0;
    if ($valor === null) return null;
    if (is_array($valor) || is_object($valor)) {
        $j = json_encode($valor, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
        return mb_substr((string) $j, 0, AUDITORIA_MAX_VALOR);
    }
    if (is_int($valor)) return $valor;
    if (is_float($valor)) return round($valor, 4);
    return mb_substr((string) $valor, 0, AUDITORIA_MAX_VALOR);
}

/** ¿Dos valores crudos son "lo mismo" para efectos de auditoría? ('12.00' = 12, null = ''). */
function auditoria_son_iguales($a, $b): bool
{
    if (is_bool($a)) $a = $a ? 1 : 0;
    if (is_bool($b)) $b = $b ? 1 : 0;
    if (($a === null || $a === '') && ($b === null || $b === '')) return true;
    if (is_array($a) || is_array($b)) {
        return json_encode($a) === json_encode($b);
    }
    if (is_numeric($a) && is_numeric($b)) return abs((float) $a - (float) $b) < 0.0000001;
    return (string) $a === (string) $b;
}

/**
 * Compara dos filas y devuelve [antes, despues] con SOLO los campos que cambiaron, ya
 * sanitizados (ver auditoria_valor_seguro). Un campo que solo existe en $despues (alta)
 * aparece con antes = null; uno que solo existe en $antes (baja) con despues = null.
 * Un campo secreto/médico que cambió aparece con su marcador; si su valor no cambió, no
 * aparece. $solo, si se manda, limita la comparación a esas llaves. PURA.
 */
function auditoria_diferencia(array $antes, array $despues, ?array $solo = null): array
{
    $llaves = $solo ?? array_values(array_unique(array_merge(array_keys($antes), array_keys($despues))));
    $a = []; $d = [];
    foreach ($llaves as $k) {
        $k = (string) $k;
        $ea = array_key_exists($k, $antes); $ed = array_key_exists($k, $despues);
        if (!$ea && !$ed) continue;
        $va = $ea ? $antes[$k] : null; $vd = $ed ? $despues[$k] : null;
        if (auditoria_son_iguales($va, $vd)) continue;
        $a[$k] = auditoria_valor_seguro($k, $va);
        $d[$k] = auditoria_valor_seguro($k, $vd);
        if (count($a) >= AUDITORIA_MAX_CAMPOS) break;
    }
    return [$a, $d];
}

/** Arreglo → JSON para la columna TEXT; null si está vacío. Nunca lanza. PURA. */
function auditoria_json(array $campos): ?string
{
    if (!$campos) return null;
    $j = json_encode($campos, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($j === false) return null;
    if (strlen($j) > 60000) $j = json_encode(['_recortado' => 'El detalle era demasiado largo para guardarse completo.'], JSON_UNESCAPED_UNICODE);
    return $j;
}

// ── Escribir ────────────────────────────────────────────────────────────

/**
 * Anota un cambio. NUNCA lanza (regla 1). Devuelve true si escribió.
 *
 * @param array       $usuario_actual  el de api.php (user_id, escuela_id, suplantado_por…)
 * @param string      $accion          una clave de AUDITORIA_ACCIONES
 * @param string      $entidad         'cobro', 'usuario', 'escuela'…
 * @param int|null    $entidad_id
 * @param array       $antes           la fila ANTES (o [] en un alta)
 * @param array       $despues         la fila DESPUÉS (o [] en una baja)
 * @param int|null    $escuela_id      el colegio al que pertenece lo tocado (null = plataforma)
 * @param array       $opc             ['usuario_id' => forzar quién, 'suplantado_por' => forzar, 'solo' => llaves]
 */
function auditar($pdo, $usuario_actual, $accion, $entidad, $entidad_id, array $antes, array $despues, $escuela_id = null, array $opc = []): bool
{
    try {
        if (!($pdo instanceof PDO)) return false;
        if (!auditoria_lista($pdo)) {
            // Una línea en api_log (una vez por petición) para que se note que falta la migración.
            static $avisada = false;
            if (!$avisada && function_exists('log_api')) { $avisada = true; log_api("auditar({$accion}) omitido: falta la tabla auditoria (php herramientas/migrar.php --aplicar)"); }
            return false;
        }
        [$a, $d] = auditoria_diferencia($antes, $despues, $opc['solo'] ?? null);
        // Sin cambios reales no hay nada que anotar, salvo que sea un evento (inicio/fin de
        // "ver como", una cancelación...) que se anota aunque no traiga campos.
        if (!$a && !$d && empty($opc['evento'])) return false;
        $uid = array_key_exists('usuario_id', $opc) ? $opc['usuario_id'] : ($usuario_actual['user_id'] ?? null);
        $sup = array_key_exists('suplantado_por', $opc) ? $opc['suplantado_por'] : ($usuario_actual['suplantado_por'] ?? null);
        $pdo->prepare(
            "INSERT INTO auditoria (escuela_id, usuario_id, suplantado_por, accion, entidad, entidad_id, antes, despues, ip, creado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())"
        )->execute([
            $escuela_id !== null && intval($escuela_id) > 0 ? intval($escuela_id) : null,
            $uid ? intval($uid) : null,
            $sup ? intval($sup) : null,
            mb_substr((string) $accion, 0, 40),
            mb_substr((string) $entidad, 0, 30),
            $entidad_id !== null && $entidad_id !== '' ? intval($entidad_id) : null,
            auditoria_json($a),
            auditoria_json($d),
            mb_substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45) ?: null,
        ]);
        return true;
    } catch (\Throwable $e) {
        // Regla 1: se anota y se sigue. Sin tabla no se repite el aviso en cada petición.
        if (function_exists('log_api')) log_api("auditar({$accion}) falló y se omitió: " . $e->getMessage());
        return false;
    }
}

/**
 * Lee una fila (columnas elegidas) para compararla antes/después. Nunca lanza: si falla
 * devuelve []. $cols es una lista de nombres de columna de confianza (código, no input).
 */
function auditoria_fila($pdo, string $tabla, array $cols, $id, string $pk = 'id'): array
{
    try {
        $lista = implode(', ', array_map(function ($c) { return '`' . str_replace('`', '', $c) . '`'; }, $cols));
        $st = $pdo->prepare("SELECT {$lista} FROM `" . str_replace('`', '', $tabla) . "` WHERE `" . str_replace('`', '', $pk) . "` = ?");
        $st->execute([$id]);
        $f = $st->fetch(PDO::FETCH_ASSOC);
        return $f ?: [];
    } catch (\Throwable $e) {
        // Una columna que aún no existe (migración pendiente) no debe tumbar nada: se
        // reintenta con SELECT * y se queda con las que sí estén.
        try {
            $st = $pdo->prepare("SELECT * FROM `" . str_replace('`', '', $tabla) . "` WHERE `" . str_replace('`', '', $pk) . "` = ?");
            $st->execute([$id]);
            $f = $st->fetch(PDO::FETCH_ASSOC);
            return $f ? array_intersect_key($f, array_flip($cols)) : [];
        } catch (\Throwable $e2) {
            return [];
        }
    }
}
