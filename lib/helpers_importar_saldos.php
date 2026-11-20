<?php
/**
 * lib/helpers_importar_saldos.php — [OF-5] Importar adeudos y saldos iniciales
 * desde un archivo (CSV o XLSX), con vista previa antes de aplicar.
 *
 * QUÉ SE IMPORTA: EL SALDO PENDIENTE, NO EL HISTORIAL DE PAGOS.
 *   Por cada renglón válido se crea UN cobro 'pendiente' cuyo total es lo que
 *   aún se debe (monto − abonado). NO se crean filas en cobro_abonos: ese
 *   dinero no entró por la plataforma, así que no debe generar complementos de
 *   pago ni aparecer en el corte de caja. Lo que decía el archivo (monto
 *   original, abonado, folio externo, vencimiento) queda en
 *   importaciones_saldos_filas, ligado al cobro.
 *
 * TRES PASOS (acciones/importar_saldos_*.php)
 *   analizar : lee el archivo y devuelve el plan SIN ESCRIBIR NADA.
 *   (ajustar : lo hace la pantalla: reenvía el mismo archivo con otro mapeo de
 *              columnas / otros conceptos elegidos y pide analizar otra vez.)
 *   aplicar  : vuelve a leer y a analizar el archivo (nunca confía en filas que
 *              mande el navegador) y crea los cobros por lotes.
 *
 * IDEMPOTENCIA: cada renglón tiene una HUELLA (importar_huella) con UNIQUE
 * (escuela_id, huella) en importaciones_saldos_filas. Subir de nuevo el mismo
 * archivo, o uno que repite renglones, no duplica nada.
 *
 * Este archivo NO llama a respond() ni a api.php: lo cargan las acciones y
 * herramientas/pruebas.php (funciones puras, sin base de datos). Las funciones
 * que tocan la base reciben $pdo y se marcan en su comentario.
 *
 * Diseño de lectura inspirado en LectorHoja / ImportarVentas del otro sistema
 * del mismo dueño (OF): CSV en UTF-8 o Windows-1252, XLSX leído a mano (ZIP +
 * XML) sin librerías, columnas buscadas POR NOMBRE y no por posición.
 */

const IMPORTAR_MAX_FILAS = 5000;
const IMPORTAR_MAX_BYTES = 5242880; // 5 MB
const IMPORTAR_MAX_XML   = 31457280; // 30 MB descomprimidos por parte de un xlsx (anti zip-bomb)
const IMPORTAR_MONTO_MAX_C = 9999999999; // $99,999,999.99 (DECIMAL(12,2))
const IMPORTAR_CONCEPTO_DEFECTO = 'Saldo inicial';

/** Campos que se reconocen, en orden de prioridad. */
const IMPORTAR_CAMPOS = ['matricula', 'alumno', 'concepto', 'monto', 'abonado', 'fecha', 'vence', 'folio'];

/**
 * Nombres de encabezado reconocidos (ya normalizados: minúsculas, sin acentos,
 * sin signos). El orden dentro de cada campo es el de preferencia: si el
 * archivo trae a la vez "Total" y "Saldo", gana el que esté primero aquí.
 */
function importar_alias_encabezados(): array
{
    return [
        'matricula' => ['matricula', 'matr', 'no matricula', 'num matricula', 'numero de matricula', 'numero matricula',
                        'id alumno', 'clave alumno', 'clave de alumno', 'folio alumno', 'no de control', 'numero de control'],
        'alumno'    => ['alumno', 'nombre alumno', 'nombre del alumno', 'alumno nombre', 'nombre', 'estudiante', 'nombre completo'],
        'concepto'  => ['concepto', 'descripcion', 'detalle', 'concepto de pago', 'concepto de cobro', 'servicio', 'cargo'],
        'monto'     => ['monto', 'monto original', 'importe', 'total', 'monto total', 'adeudo', 'saldo', 'saldo pendiente',
                        'pendiente', 'monto pendiente', 'saldo inicial', 'cantidad'],
        'abonado'   => ['abonado', 'monto abonado', 'abono', 'abonos', 'pagado', 'monto pagado', 'pagos', 'pago', 'anticipo'],
        'fecha'     => ['fecha', 'fecha emision', 'fecha de emision', 'emision', 'fecha cargo', 'fecha de cargo', 'fecha de cobro'],
        'vence'     => ['vence', 'vencimiento', 'fecha vencimiento', 'fecha de vencimiento', 'fecha limite', 'vence el', 'limite'],
        'folio'     => ['folio', 'folio externo', 'no folio', 'numero de folio', 'num folio', 'documento', 'no documento',
                        'referencia', 'referencia externa', 'recibo', 'folio original'],
    ];
}

// ════════════════════════════════════════════════════════════════════════
//  TEXTO: codificación, separador, normalización
// ════════════════════════════════════════════════════════════════════════

/**
 * Convierte los bytes de un archivo de texto a UTF-8 y quita el BOM. Acepta
 * UTF-8 (con o sin BOM), UTF-16 con BOM (el "Texto Unicode" de Excel) y, si los
 * bytes no son UTF-8 válido, Windows-1252 (el CSV de Excel en Windows).
 *
 * @return array{0:string,1:string} [texto en UTF-8, codificación detectada]
 */
function importar_a_utf8(string $bytes): array
{
    if (strncmp($bytes, "\xEF\xBB\xBF", 3) === 0) return [substr($bytes, 3), 'UTF-8'];
    if (strncmp($bytes, "\xFF\xFE", 2) === 0) return [mb_convert_encoding(substr($bytes, 2), 'UTF-8', 'UTF-16LE'), 'UTF-16LE'];
    if (strncmp($bytes, "\xFE\xFF", 2) === 0) return [mb_convert_encoding(substr($bytes, 2), 'UTF-8', 'UTF-16BE'), 'UTF-16BE'];
    if (mb_check_encoding($bytes, 'UTF-8')) return [$bytes, 'UTF-8'];
    return [mb_convert_encoding($bytes, 'UTF-8', 'Windows-1252'), 'Windows-1252'];
}

/**
 * Separador de campos de un CSV: ',' ';' o tabulador. Se decide por la primera
 * línea con contenido (el encabezado), contando solo lo que está FUERA de
 * comillas. Excel en español guarda con ';'; si no hay ninguno, ','.
 */
function importar_detectar_separador(string $texto): string
{
    foreach (preg_split('/\r\n|\n|\r/', $texto) as $linea) {
        if (trim($linea) === '') continue;
        $cuenta = [',' => 0, ';' => 0, "\t" => 0];
        $dentro = false;
        $n = strlen($linea);
        for ($i = 0; $i < $n; $i++) {
            $c = $linea[$i];
            if ($c === '"') { $dentro = !$dentro; continue; }
            if (!$dentro && isset($cuenta[$c])) $cuenta[$c]++;
        }
        arsort($cuenta);
        $mejor = array_key_first($cuenta);
        return $cuenta[$mejor] > 0 ? $mejor : ',';
    }
    return ',';
}

/**
 * CSV → matriz de filas (celdas string, '' si vacía). Conserva las filas
 * vacías para que el número de fila siga siendo el del archivo.
 *
 * @return array{0:array,1:string,2:string,3:bool} [filas, separador, codificación, excede_limite]
 */
function importar_parsear_csv(string $bytes): array
{
    [$texto, $cod] = importar_a_utf8($bytes);
    $sep = importar_detectar_separador($texto);
    $f = fopen('php://memory', 'r+');
    fwrite($f, $texto);
    rewind($f);
    $filas = [];
    $excede = false;
    // El 5.º argumento ('') apaga el carácter de escape: es el comportamiento
    // RFC 4180 y evita el aviso de obsolescencia de PHP 8.4.
    while (($r = fgetcsv($f, 0, $sep, '"', '')) !== false) {
        if (count($filas) > IMPORTAR_MAX_FILAS + 1) { $excede = true; break; } // +1 encabezado, +1 para saber que sobra
        if ($r === [null]) { $filas[] = []; continue; }                       // línea en blanco
        $filas[] = array_map(function ($c) { return importar_limpiar_celda($c); }, $r);
    }
    fclose($f);
    return [$filas, $sep, $cod, $excede];
}

/** Espacios de más (incluido el duro U+00A0 y el de ancho cero) fuera. */
function importar_limpiar_celda($v): string
{
    $s = importar_celda_texto($v);
    $s = str_replace(["\xC2\xA0", "\xE2\x80\x8B", "\xEF\xBB\xBF"], ' ', $s);
    $s = preg_replace('/\s+/u', ' ', $s);
    return trim((string) $s);
}

/** Una celda (string, int, float, bool o null) como texto, sin "1.0E+25" ni ".0" sobrantes. */
function importar_celda_texto($v): string
{
    if ($v === null) return '';
    if (is_bool($v)) return $v ? '1' : '0';
    if (is_int($v)) return (string) $v;
    if (is_float($v)) {
        if ($v == floor($v) && abs($v) < 1e15) return (string) (int) $v; // la matrícula 20240001 que Excel guardó como número
        return rtrim(rtrim(sprintf('%.10F', $v), '0'), '.');
    }
    return (string) $v;
}

/** Minúsculas, sin acentos, solo letras/números/espacios simples. Para comparar. */
function importar_normalizar_texto($s): string
{
    $s = mb_strtolower(trim((string) $s), 'UTF-8');
    $s = strtr($s, [
        'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'ã' => 'a', 'å' => 'a',
        'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
        'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o', 'õ' => 'o',
        'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u',
        'ñ' => 'n', 'ç' => 'c',
    ]);
    $s = preg_replace('/[^a-z0-9]+/', ' ', $s);
    return trim((string) $s);
}

/** Encabezado normalizado (igual que importar_normalizar_texto). */
function importar_normalizar_encabezado($s): string
{
    return importar_normalizar_texto($s);
}

/**
 * Qué campo es un encabezado (según el nombre), o null.
 */
function importar_campo_de_encabezado($encabezado): ?string
{
    $n = importar_normalizar_encabezado($encabezado);
    if ($n === '') return null;
    foreach (importar_alias_encabezados() as $campo => $alias) {
        if (in_array($n, $alias, true)) return $campo;
    }
    return null;
}

/**
 * Detecta las columnas por NOMBRE de encabezado. Una columna se usa para un solo
 * campo; si dos columnas son candidatas para el mismo campo gana la de alias de
 * mayor preferencia (p. ej. "Total" antes que "Saldo" para `monto`).
 *
 * @param string[] $encabezados  los encabezados tal como vienen
 * @return array<string,int|null> campo => índice de columna (0-based) o null
 */
function importar_detectar_columnas(array $encabezados): array
{
    $mapeo = array_fill_keys(IMPORTAR_CAMPOS, null);
    $usadas = [];
    $norm = [];
    foreach ($encabezados as $i => $h) $norm[$i] = importar_normalizar_encabezado($h);
    foreach (importar_alias_encabezados() as $campo => $alias) {
        foreach ($alias as $a) {
            $idx = array_search($a, $norm, true);
            if ($idx !== false && !isset($usadas[$idx])) {
                $mapeo[$campo] = (int) $idx;
                $usadas[$idx] = true;
                break;
            }
        }
    }
    return $mapeo;
}

/**
 * Valida un mapeo mandado por el navegador: solo campos conocidos, índices
 * enteros dentro del rango y sin repetir columna. Un valor vacío/-1 = sin mapear.
 *
 * @return array{0:array<string,int|null>,1:?string} [mapeo limpio, error]
 */
function importar_limpiar_mapeo($crudo, int $n_columnas): array
{
    $mapeo = array_fill_keys(IMPORTAR_CAMPOS, null);
    if (!is_array($crudo)) return [$mapeo, null];
    $usadas = [];
    foreach (IMPORTAR_CAMPOS as $campo) {
        if (!array_key_exists($campo, $crudo)) continue;
        $v = $crudo[$campo];
        if ($v === null || $v === '' || $v === false || (is_string($v) && !ctype_digit(ltrim($v, '-')))) continue;
        $i = intval($v);
        if ($i < 0) continue;
        if ($i >= $n_columnas) return [$mapeo, "La columna elegida para \"{$campo}\" no existe en el archivo."];
        if (isset($usadas[$i])) return [$mapeo, 'No puedes usar la misma columna para dos campos distintos.'];
        $usadas[$i] = true;
        $mapeo[$campo] = $i;
    }
    return [$mapeo, null];
}

// ════════════════════════════════════════════════════════════════════════
//  VALORES: dinero, fechas, matrícula, huella, pendiente
// ════════════════════════════════════════════════════════════════════════

/**
 * Dinero escrito por una persona → centavos enteros.
 *
 * Acepta: 1500, 1500.5, "$1,500.00", "1 500,50", "1.500,50", "MXN 1500", un
 * número (de XLSX). Reglas del separador:
 *   · si aparecen los dos (',' y '.'), el ÚLTIMO es el decimal;
 *   · si solo aparece uno y se repite, es de miles;
 *   · si aparece una vez: con exactamente 3 dígitos detrás y 1-3 delante (y el
 *     de delante no es "0") es de miles ("1,500" → 1500); si no, es decimal.
 * Negativos, texto sin número o más de 2 decimales con valor → null (inválido).
 *
 * @param mixed $v
 * @return int|null null = no es un monto válido; ''/null → null también
 */
function importar_monto_a_centavos($v): ?int
{
    if ($v === null) return null;
    if (is_int($v)) return $v < 0 ? null : $v * 100;
    if (is_float($v)) {
        if ($v < 0 || is_nan($v) || is_infinite($v)) return null;
        // Un número de Excel con más de 2 decimales (12.345) no es dinero: no se redondea en silencio.
        if (abs($v * 100 - round($v * 100)) > 0.0001) return null;
        return (int) round($v * 100);
    }
    $s = trim((string) $v);
    if ($s === '') return null;
    $s = str_ireplace(['mxn', 'pesos', 'peso', 'm.n.', 'mn'], '', $s);
    $s = str_replace(['$', "\xC2\xA0", ' '], '', $s);
    if ($s === '' || preg_match('/[^0-9.,\-]/', $s)) return null;
    if (strpos($s, '-') !== false) return null;              // negativos: no se aceptan
    if (!preg_match('/\d/', $s)) return null;

    $nComas = substr_count($s, ',');
    $nPuntos = substr_count($s, '.');
    $dec = null; // el separador decimal, si lo hay
    if ($nComas && $nPuntos) {
        $dec = strrpos($s, ',') > strrpos($s, '.') ? ',' : '.';
    } elseif ($nComas || $nPuntos) {
        $sep = $nComas ? ',' : '.';
        $cuantos = max($nComas, $nPuntos);
        if ($cuantos > 1) {
            $dec = null; // miles (si hubiera un decimal ya estaría el otro separador)
        } else {
            $p = strpos($s, $sep);
            $antes = substr($s, 0, $p);
            $despues = substr($s, $p + 1);
            $miles = strlen($despues) === 3 && strlen($antes) >= 1 && strlen($antes) <= 3 && $antes !== '0';
            $dec = $miles ? null : $sep;
        }
    }
    if ($dec === null) {
        $limpio = str_replace([',', '.'], '', $s);
        if (!ctype_digit($limpio)) return null;
        $c = (int) $limpio * 100;
    } else {
        $p = strrpos($s, $dec);
        $ent = str_replace([',', '.'], '', substr($s, 0, $p));
        $fra = substr($s, $p + 1);
        if (($ent !== '' && !ctype_digit($ent)) || ($fra !== '' && !ctype_digit($fra))) return null;
        if (strlen($fra) > 2) {
            if (rtrim(substr($fra, 2), '0') !== '') return null; // 12.345: no es dinero
            $fra = substr($fra, 0, 2);
        }
        $c = (int) ($ent === '' ? '0' : $ent) * 100 + (int) str_pad($fra, 2, '0');
    }
    return $c;
}

/**
 * Fecha escrita por una persona → 'Y-m-d' o null. Día primero (México):
 * 31/12/2026, 31-12-26, 2026-12-31, 2026/12/31, "2026-12-31 00:00:00" (XLSX).
 */
function importar_fecha_iso($v): ?string
{
    $s = trim((string) $v);
    if ($s === '') return null;
    $a = $m = $d = null;
    if (preg_match('/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/', $s, $x)) {
        [$a, $m, $d] = [intval($x[1]), intval($x[2]), intval($x[3])];
    } elseif (preg_match('/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/', $s, $x)) {
        [$d, $m, $a] = [intval($x[1]), intval($x[2]), intval($x[3])];
        if ($a < 100) $a += 2000;
    } else {
        return null;
    }
    if ($a < 2000 || $a > 2100 || !checkdate($m, $d, $a)) return null;
    return sprintf('%04d-%02d-%02d', $a, $m, $d);
}

/** Matrícula para comparar: mayúsculas, sin espacios. */
function importar_normalizar_matricula($s): string
{
    return mb_strtoupper(preg_replace('/\s+/u', '', trim((string) $s)), 'UTF-8');
}

/**
 * Huella de un renglón (idempotencia). Mismo renglón → misma huella, aunque se
 * suba otro día: la FECHA que entra es la que TRAÍA el archivo (vacía si no
 * traía), NO la de "hoy" con la que se completa; si no, el mismo archivo subido
 * mañana se importaría otra vez.
 *
 * Entra el MONTO ORIGINAL de la columna (no el pendiente): si el archivo se
 * corrige solo en "abonado" y se vuelve a subir, sigue siendo el mismo renglón.
 *
 * @param int    $alumno_id  alumno ya resuelto (por matrícula o por nombre: así
 *                           "0123", "123" y el nombre dan la misma huella)
 * @param string $fecha_archivo 'Y-m-d' o '' si el archivo no traía fecha
 */
function importar_huella(int $escuela_id, int $alumno_id, string $concepto, int $monto_centavos, string $fecha_archivo, string $folio_externo): string
{
    return sha1(implode('|', [
        'of5v1', $escuela_id, $alumno_id,
        importar_normalizar_texto($concepto),
        $monto_centavos,
        $fecha_archivo,
        mb_strtoupper(trim($folio_externo), 'UTF-8'),
    ]));
}

/**
 * Lo que aún se debe: monto − abonado, en centavos.
 *
 * @return array{0:int,1:?string} [pendiente_centavos, código de error o null]
 *         códigos: 'abonado_mayor' (abonado > monto)
 *         pendiente 0 NO es error: la pantalla y aplicar lo omiten ("saldo 0").
 */
function importar_pendiente_centavos(int $monto_c, int $abonado_c): array
{
    if ($abonado_c > $monto_c) return [0, 'abonado_mayor'];
    return [$monto_c - $abonado_c, null];
}

// ════════════════════════════════════════════════════════════════════════
//  SUGERENCIA DE PRODUCTO (hereda IVA / clave SAT de OF-2)
// ════════════════════════════════════════════════════════════════════════

/**
 * Producto existente que mejor encaja con el texto de un concepto, o null.
 *
 * Puntúa: nombre igual (100) > un nombre contiene al otro (60-90) > palabras en
 * común (≥ 60 % de las del producto) > categoría ("colegiatura septiembre" →
 * un producto de categoría colegiatura; 40, y avisa si hay varios). Es solo una
 * SUGERENCIA: la pantalla la deja elegir o quitar.
 *
 * @param array $productos filas de productos: id, nombre, categoria, [activo]
 * @return array{producto_id:int,nombre:string,categoria:string,puntos:int,motivo:string}|null
 */
function importar_sugerir_producto(string $concepto, array $productos): ?array
{
    $n = importar_normalizar_texto($concepto);
    if ($n === '' || $n === importar_normalizar_texto(IMPORTAR_CONCEPTO_DEFECTO)) return null;
    $tokens = array_values(array_filter(explode(' ', $n), function ($t) { return strlen($t) >= 3; }));
    $mejor = null;
    $cat_matches = [];
    foreach ($productos as $p) {
        if (isset($p['activo']) && !intval($p['activo'])) continue; // un concepto dado de baja no se sugiere
        $pn = importar_normalizar_texto($p['nombre'] ?? '');
        $cat = importar_normalizar_texto($p['categoria'] ?? '');
        $puntos = 0; $motivo = '';
        if ($pn !== '' && $pn === $n) {
            $puntos = 100; $motivo = 'mismo nombre';
        } elseif ($pn !== '' && strlen($pn) >= 4 && strlen($n) >= 4 && (strpos($n, $pn) !== false || strpos($pn, $n) !== false)) {
            $puntos = 60 + (int) round(30 * min(strlen($pn), strlen($n)) / max(strlen($pn), strlen($n)));
            $motivo = 'nombre parecido';
        } elseif ($pn !== '') {
            $ptok = array_values(array_filter(explode(' ', $pn), function ($t) { return strlen($t) >= 3; }));
            if ($ptok) {
                $comunes = count(array_intersect($ptok, $tokens));
                if ($comunes >= 1 && $comunes / count($ptok) >= 0.6) {
                    $puntos = 50 + (int) round(9 * $comunes / count($ptok));
                    $motivo = 'palabras en común';
                }
            }
        }
        if ($puntos === 0 && $cat !== '' && $cat !== 'otro' && $cat !== 'beca' && in_array($cat, $tokens, true)) {
            $puntos = 40; $motivo = 'categoría';
            $cat_matches[] = $p;
        }
        if ($puntos > 0 && ($mejor === null || $puntos > $mejor['puntos']
            || ($puntos === $mejor['puntos'] && intval($p['id']) < $mejor['producto_id']))) {
            $mejor = ['producto_id' => intval($p['id']), 'nombre' => (string) ($p['nombre'] ?? ''),
                      'categoria' => (string) ($p['categoria'] ?? ''), 'puntos' => $puntos, 'motivo' => $motivo];
        }
    }
    if ($mejor && $mejor['motivo'] === 'categoría' && count($cat_matches) > 1) {
        $mejor['motivo'] = 'categoría (hay ' . count($cat_matches) . ' conceptos de esa categoría: revisa cuál es)';
    }
    return $mejor;
}

// ════════════════════════════════════════════════════════════════════════
//  PLAN (el "analizar"): función pura, sin base de datos
// ════════════════════════════════════════════════════════════════════════

/**
 * Índices para buscar alumnos: por matrícula exacta (normalizada), por matrícula
 * sin ceros a la izquierda (Excel se los quita) y por nombre normalizado. Un
 * valor que corresponde a más de un alumno queda marcado como ambiguo (-1).
 *
 * @param array $alumnos filas: id, nombre, matricula, activo
 */
function importar_indexar_alumnos(array $alumnos): array
{
    $idx = ['mat' => [], 'mat0' => [], 'nom' => [], 'por_id' => []];
    $poner = function (array &$m, string $k, int $id) {
        if ($k === '') return;
        $m[$k] = (isset($m[$k]) && $m[$k] !== $id) ? -1 : $id;
    };
    foreach ($alumnos as $a) {
        $id = intval($a['id']);
        $idx['por_id'][$id] = $a;
        $mat = importar_normalizar_matricula($a['matricula'] ?? '');
        $poner($idx['mat'], $mat, $id);
        if ($mat !== '' && ctype_digit($mat)) $poner($idx['mat0'], ltrim($mat, '0'), $id);
        $poner($idx['nom'], importar_normalizar_texto($a['nombre'] ?? ''), $id);
    }
    return $idx;
}

/**
 * Busca el alumno de un renglón. Primero por matrícula; si no hay matrícula (o
 * no existe) y el renglón trae el nombre, por nombre exacto.
 *
 * @return array{0:?int,1:string,2:array} [alumno_id|null, error|'' , advertencias]
 */
function importar_buscar_alumno(array $idx, string $matricula, string $nombre): array
{
    $adv = [];
    $mat = importar_normalizar_matricula($matricula);
    if ($mat !== '') {
        $id = $idx['mat'][$mat] ?? null;
        if ($id === null && ctype_digit($mat)) $id = $idx['mat0'][ltrim($mat, '0')] ?? null;
        if ($id === -1) return [null, "La matrícula {$matricula} está repetida en el colegio: no se sabe a qué alumno corresponde.", $adv];
        if ($id !== null) {
            if ($nombre !== '') {
                $nA = importar_normalizar_texto($idx['por_id'][$id]['nombre'] ?? '');
                $nF = importar_normalizar_texto($nombre);
                if ($nA !== $nF && strpos($nA, $nF) === false && strpos($nF, $nA) === false) {
                    $adv[] = 'El nombre del archivo ("' . $nombre . '") no coincide con el del alumno encontrado por matrícula ("' . ($idx['por_id'][$id]['nombre'] ?? '') . '"). Revisa.';
                }
            }
            return [$id, '', $adv];
        }
        if ($nombre === '') return [null, "Alumno no encontrado: no hay ninguno con la matrícula {$matricula}.", $adv];
        // Matrícula que no existe pero con nombre: se intenta por nombre y se avisa.
        $adv[] = "La matrícula {$matricula} no existe; el alumno se ubicó por nombre.";
    } elseif ($nombre === '') {
        return [null, 'El renglón no trae matrícula ni nombre del alumno.', $adv];
    }
    $nn = importar_normalizar_texto($nombre);
    $id = $idx['nom'][$nn] ?? null;
    if ($id === -1) return [null, "Hay más de un alumno llamado \"{$nombre}\": usa la matrícula para distinguirlos.", []];
    if ($id === null) return [null, "Alumno no encontrado: no hay ninguno llamado \"{$nombre}\".", []];
    return [$id, '', $adv];
}

/**
 * Convierte una tabla leída en el PLAN de importación. No toca la base.
 *
 * @param array    $tabla    ['encabezados' => [..], 'filas' => [[numero_en_archivo, [celdas]], ...]]
 * @param array    $mapeo    campo => índice de columna|null (ver importar_detectar_columnas)
 * @param array    $alumnos  alumnos DE ESTA ESCUELA (id, nombre, matricula, activo)
 * @param array    $productos productos de la escuela (id, nombre, categoria, activo)
 * @param array    $eleccion mapa [concepto_normalizado => producto_id | 0 (sin concepto ligado)]
 * @param callable $huellas_existentes fn(string[] $huellas): array<string,true> con las que ya están importadas
 * @param string   $hoy      'Y-m-d' (fecha de emisión por omisión)
 * @return array{
 *   filas:array, conceptos:array, totales:array, columnas_faltantes:array, error:?string
 * }
 *
 * Estado de cada renglón: 'ok' (se importará, quizá con advertencias),
 * 'omitida' (motivo: saldo_cero | repetida | ya_importada) o 'error'.
 */
function importar_construir_plan(array $tabla, array $mapeo, int $escuela_id, array $alumnos, array $productos,
                                 array $eleccion, callable $huellas_existentes, string $hoy): array
{
    $plan = ['filas' => [], 'conceptos' => [], 'totales' => [], 'columnas_faltantes' => [], 'error' => null];

    // Se necesita al menos matrícula o alumno, y monto.
    if ($mapeo['matricula'] === null && $mapeo['alumno'] === null) $plan['columnas_faltantes'][] = 'matricula';
    if ($mapeo['monto'] === null) $plan['columnas_faltantes'][] = 'monto';
    if ($plan['columnas_faltantes']) {
        $plan['error'] = 'Faltan columnas obligatorias: ' . implode(', ', array_map(function ($c) {
            return $c === 'matricula' ? 'matrícula (o el nombre del alumno)' : $c;
        }, $plan['columnas_faltantes'])) . '. Elige a qué columna corresponde cada campo.';
        $plan['totales'] = importar_totales([]);
        return $plan;
    }

    $idx = importar_indexar_alumnos($alumnos);
    $celda = function (array $cells, string $campo) use ($mapeo): string {
        $i = $mapeo[$campo];
        return $i === null ? '' : importar_limpiar_celda($cells[$i] ?? '');
    };

    // Valor tal cual (int/float si vino de un XLSX numérico), o el texto si no era número.
    $crudo = function (array $cells, string $campo, string $texto) use ($mapeo) {
        $i = $mapeo[$campo];
        $v = $i === null ? null : ($cells[$i] ?? null);
        return (is_int($v) || is_float($v)) ? $v : $texto;
    };

    // Pasada 1: leer y validar cada renglón.
    $filas = [];
    foreach ($tabla['filas'] as [$num, $cells]) {
        if (!array_filter($cells, function ($c) { return importar_limpiar_celda($c) !== ''; })) continue; // renglón en blanco
        $matricula = $celda($cells, 'matricula');
        $nombre    = $celda($cells, 'alumno');
        $concepto  = $celda($cells, 'concepto');
        $monto_t   = $celda($cells, 'monto');
        $abon_t    = $celda($cells, 'abonado');
        $fecha_t   = $celda($cells, 'fecha');
        $vence_t   = $celda($cells, 'vence');
        $folio     = $celda($cells, 'folio');

        $f = [
            'fila' => $num, 'estado' => 'ok', 'motivo' => null, 'errores' => [], 'advertencias' => [],
            'matricula' => $matricula, 'alumno_archivo' => $nombre,
            'alumno_id' => null, 'alumno_nombre' => null, 'alumno_activo' => null, 'alumno_matricula' => null,
            'concepto' => $concepto !== '' ? mb_substr($concepto, 0, 190) : IMPORTAR_CONCEPTO_DEFECTO,
            'concepto_clave' => '', 'producto_id' => null,
            'monto_original_c' => null, 'abonado_c' => 0, 'pendiente_c' => null,
            'fecha' => $fecha_t, 'fecha_emision' => null, 'vence' => null, 'folio_externo' => mb_substr($folio, 0, 60),
            'huella' => null, 'duplicada_de' => null,
        ];
        $f['concepto_clave'] = importar_normalizar_texto($f['concepto']);
        if ($concepto !== '' && mb_strlen($concepto) > 190) $f['advertencias'][] = 'El concepto se recortó a 190 caracteres.';
        if ($folio !== '' && mb_strlen($folio) > 60) $f['advertencias'][] = 'El folio externo se recortó a 60 caracteres.';

        // Alumno.
        [$aid, $err, $adv] = importar_buscar_alumno($idx, $matricula, $nombre);
        foreach ($adv as $a) $f['advertencias'][] = $a;
        if ($err !== '') {
            $f['errores'][] = $err;
        } else {
            $al = $idx['por_id'][$aid];
            $f['alumno_id'] = $aid;
            $f['alumno_nombre'] = $al['nombre'];
            $f['alumno_matricula'] = $al['matricula'] ?? '';
            $f['alumno_activo'] = (bool) intval($al['activo'] ?? 1);
            if (!$f['alumno_activo']) $f['advertencias'][] = 'El alumno está inactivo (baja, egreso o traslado). El adeudo se importa igual.';
        }

        // Monto y abonado.
        $m = null;
        if ($monto_t === '') {
            $f['errores'][] = 'Monto vacío.';
        } else {
            // Los números de XLSX llegan como int/float: se leen directo (no como texto "12.345").
            $m = importar_monto_a_centavos($crudo($cells, 'monto', $monto_t));
            if ($m === null) $f['errores'][] = 'Monto inválido: "' . $monto_t . '" (debe ser un número positivo).';
            elseif ($m > IMPORTAR_MONTO_MAX_C) { $f['errores'][] = 'Monto demasiado grande.'; $m = null; }
        }
        $a = 0;
        if ($abon_t !== '') {
            $a = importar_monto_a_centavos($crudo($cells, 'abonado', $abon_t));
            if ($a === null) { $f['errores'][] = 'Abonado inválido: "' . $abon_t . '" (debe ser un número positivo o quedar vacío).'; $a = 0; }
        }
        if ($m !== null) {
            $f['monto_original_c'] = $m;
            $f['abonado_c'] = $a;
            [$pend, $e] = importar_pendiente_centavos($m, $a);
            if ($e === 'abonado_mayor') $f['errores'][] = 'El abonado ($' . number_format($a / 100, 2) . ') es mayor que el monto ($' . number_format($m / 100, 2) . ').';
            else $f['pendiente_c'] = $pend;
        }

        // Fechas.
        if ($fecha_t === '') {
            $f['fecha_emision'] = $hoy;
        } else {
            $fi = importar_fecha_iso($fecha_t);
            if ($fi === null) $f['errores'][] = 'Fecha inválida: "' . $fecha_t . '" (usa día/mes/año o año-mes-día).';
            else {
                $f['fecha_emision'] = $fi;
                $f['fecha'] = $fi;
                if ($fi > $hoy) $f['advertencias'][] = 'La fecha de emisión es posterior a hoy.';
            }
        }
        if ($vence_t !== '') {
            $vi = importar_fecha_iso($vence_t);
            if ($vi === null) $f['advertencias'][] = 'Vencimiento ilegible ("' . $vence_t . '"): se ignora.';
            else {
                $f['vence'] = $vi;
                if ($f['fecha_emision'] && $vi < $f['fecha_emision']) $f['advertencias'][] = 'El vencimiento es anterior a la fecha de emisión.';
            }
        }

        if ($f['errores']) {
            $f['estado'] = 'error';
        } elseif ($f['pendiente_c'] === 0) {
            $f['estado'] = 'omitida'; $f['motivo'] = 'saldo_cero';
            $f['advertencias'][] = 'Saldo 0 (ya está pagado): se omite.';
        } else {
            $f['huella'] = importar_huella($escuela_id, $f['alumno_id'], $f['concepto'], $f['monto_original_c'],
                                           $fecha_t !== '' ? (string) $f['fecha_emision'] : '', $folio);
        }
        $filas[] = $f;
    }

    // Pasada 2: repetidos dentro del archivo y ya importados antes.
    $vistas = [];
    foreach ($filas as $k => $f) {
        if ($f['estado'] !== 'ok') continue;
        if (isset($vistas[$f['huella']])) {
            $filas[$k]['estado'] = 'omitida'; $filas[$k]['motivo'] = 'repetida';
            $filas[$k]['duplicada_de'] = $vistas[$f['huella']];
            $filas[$k]['advertencias'][] = 'Renglón repetido: es igual al renglón ' . $vistas[$f['huella']]
                . ' del archivo (mismo alumno, concepto, monto, fecha y folio). Si de verdad son dos cargos, agrega un folio que los distinga.';
        } else {
            $vistas[$f['huella']] = $f['fila'];
        }
    }
    $candidatas = array_keys($vistas);
    $ya = $candidatas ? $huellas_existentes($candidatas) : [];
    foreach ($filas as $k => $f) {
        if ($f['estado'] === 'ok' && isset($ya[$f['huella']])) {
            $filas[$k]['estado'] = 'omitida'; $filas[$k]['motivo'] = 'ya_importada';
            $filas[$k]['advertencias'][] = 'Ya importado antes: este renglón ya generó un cobro en una importación anterior.';
        }
    }

    // Pasada 3: conceptos distintos y producto elegido.
    $conceptos = [];
    foreach ($filas as $k => $f) {
        if ($f['estado'] !== 'ok') continue;
        $c = $f['concepto_clave'];
        if (!isset($conceptos[$c])) {
            $conceptos[$c] = ['clave' => $c, 'concepto' => $f['concepto'], 'filas' => 0, 'monto_c' => 0, 'sugerencia' => null, 'producto_id' => null];
        }
        $conceptos[$c]['filas']++;
        $conceptos[$c]['monto_c'] += $f['pendiente_c'];
    }
    $validos = [];
    foreach ($productos as $p) $validos[intval($p['id'])] = true;
    foreach ($conceptos as $c => $info) {
        $conceptos[$c]['sugerencia'] = importar_sugerir_producto($info['concepto'], $productos);
        $pid = isset($eleccion[$c]) ? intval($eleccion[$c]) : 0;
        $conceptos[$c]['producto_id'] = ($pid > 0 && isset($validos[$pid])) ? $pid : null;
    }
    foreach ($filas as $k => $f) {
        if ($f['estado'] === 'ok') $filas[$k]['producto_id'] = $conceptos[$f['concepto_clave']]['producto_id'];
    }

    $plan['filas'] = $filas;
    $plan['conceptos'] = array_values($conceptos);
    $plan['totales'] = importar_totales($filas);
    return $plan;
}

/** Totales del plan (centavos y conteos). */
function importar_totales(array $filas): array
{
    $t = ['filas' => count($filas), 'a_importar' => 0, 'monto_c' => 0, 'errores' => 0, 'saldo_cero' => 0,
          'repetidas' => 0, 'ya_importadas' => 0, 'con_advertencias' => 0, 'alumnos' => 0, 'inactivos' => 0,
          'abonado_c' => 0, 'original_c' => 0];
    $alumnos = []; $inactivos = [];
    foreach ($filas as $f) {
        if ($f['estado'] === 'error') { $t['errores']++; continue; }
        if ($f['estado'] === 'omitida') {
            if ($f['motivo'] === 'saldo_cero') $t['saldo_cero']++;
            elseif ($f['motivo'] === 'repetida') $t['repetidas']++;
            elseif ($f['motivo'] === 'ya_importada') $t['ya_importadas']++;
            continue;
        }
        $t['a_importar']++;
        $t['monto_c'] += $f['pendiente_c'];
        $t['abonado_c'] += $f['abonado_c'];
        $t['original_c'] += $f['monto_original_c'];
        if ($f['advertencias']) $t['con_advertencias']++;
        $alumnos[$f['alumno_id']] = true;
        if ($f['alumno_activo'] === false) $inactivos[$f['alumno_id']] = true;
    }
    $t['alumnos'] = count($alumnos);
    $t['inactivos'] = count($inactivos);
    return $t;
}

/** Nota que queda en importaciones_saldos_filas (y en la bitácora) de cada cobro importado. */
function importar_nota_saldo_inicial(int $original_c, int $abonado_c): string
{
    return 'Saldo inicial importado (original $' . number_format($original_c / 100, 2)
         . ', abonado $' . number_format($abonado_c / 100, 2) . ')';
}

// ════════════════════════════════════════════════════════════════════════
//  LECTURA DE ARCHIVOS (CSV y XLSX)
// ════════════════════════════════════════════════════════════════════════

/** ¿Se puede leer XLSX en este servidor? (algunos hostings apagan ZipArchive) */
function importar_puede_xlsx(): bool
{
    return class_exists('ZipArchive') && function_exists('simplexml_load_string');
}

/**
 * Lee un archivo subido y lo devuelve como tabla: encabezados (primera fila con
 * contenido) y filas con su número en el archivo.
 *
 * El formato se decide por el CONTENIDO (firma "PK" = xlsx), no por la extensión;
 * la extensión solo se valida contra la lista permitida (csv, txt, xlsx).
 *
 * @param string $ruta    archivo en disco
 * @param string $nombre  nombre original (para validar la extensión)
 * @param int|null $hoja  índice de hoja (xlsx); null = la primera con datos
 * @return array{ok:bool,error:?string,formato:?string,tabla:?array,hojas:array,hoja:?int,separador:?string,codificacion:?string}
 */
function importar_leer_archivo(string $ruta, string $nombre, ?int $hoja = null): array
{
    $r = ['ok' => false, 'error' => null, 'formato' => null, 'tabla' => null, 'hojas' => [], 'hoja' => null, 'separador' => null, 'codificacion' => null];
    $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
    if (!in_array($ext, ['csv', 'txt', 'xlsx'], true)) {
        $r['error'] = $ext === 'xls'
            ? 'El formato .xls (Excel antiguo) no se puede leer. Guárdalo como .xlsx o como CSV y súbelo de nuevo.'
            : 'Formato no permitido (.' . $ext . '). Sube un archivo CSV o XLSX.';
        return $r;
    }
    if (!is_readable($ruta)) { $r['error'] = 'No se pudo leer el archivo subido.'; return $r; }
    $tam = filesize($ruta);
    if ($tam === false || $tam <= 0) { $r['error'] = 'El archivo está vacío.'; return $r; }
    if ($tam > IMPORTAR_MAX_BYTES) { $r['error'] = 'El archivo pesa más de 5 MB. Divídelo en partes.'; return $r; }

    $firma = (string) file_get_contents($ruta, false, null, 0, 4);
    $es_zip = strncmp($firma, "PK\x03\x04", 4) === 0;
    if ($ext === 'xlsx' || $es_zip) {
        if (!$es_zip) { $r['error'] = 'El archivo dice ser .xlsx pero no lo es. Ábrelo en Excel y guárdalo de nuevo, o guárdalo como CSV.'; return $r; }
        if ($ext !== 'xlsx') { $r['error'] = 'El archivo es un libro de Excel con otra extensión. Renómbralo a .xlsx.'; return $r; }
        if (!importar_puede_xlsx()) {
            $r['error'] = 'Este servidor no puede abrir archivos .xlsx (falta la extensión zip de PHP). Guárdalo como CSV (en Excel: Guardar como → CSV UTF-8) y súbelo así.';
            return $r;
        }
        $x = importar_leer_xlsx($ruta, $hoja);
        if ($x['error']) { $r['error'] = $x['error']; return $r; }
        $filas = $x['filas'];
        $r['formato'] = 'xlsx'; $r['hojas'] = $x['hojas']; $r['hoja'] = $x['hoja'];
        $excede = $x['excede'];
    } else {
        $bytes = (string) file_get_contents($ruta);
        // Un binario renombrado a .csv: bytes de control = no es texto.
        if (strpos(substr($bytes, 0, 4096), "\0") !== false && strncmp($bytes, "\xFF\xFE", 2) !== 0 && strncmp($bytes, "\xFE\xFF", 2) !== 0) {
            $r['error'] = 'El archivo no es texto CSV. Guarda la hoja como CSV e inténtalo otra vez.';
            return $r;
        }
        [$filas, $sep, $cod, $excede] = importar_parsear_csv($bytes);
        $r['formato'] = 'csv'; $r['separador'] = $sep; $r['codificacion'] = $cod;
    }
    if ($excede) { $r['error'] = 'El archivo tiene más de ' . number_format(IMPORTAR_MAX_FILAS) . ' renglones. Divídelo en partes.'; return $r; }

    // Encabezado = primera fila con contenido.
    $h = null;
    foreach ($filas as $i => $cells) {
        if (array_filter($cells, function ($c) { return importar_limpiar_celda($c) !== ''; })) { $h = $i; break; }
    }
    if ($h === null) { $r['error'] = 'El archivo no trae datos.'; return $r; }
    $enc = array_map('importar_limpiar_celda', $filas[$h]);
    $ancho = count($enc);
    $datos = [];
    foreach (array_slice($filas, $h + 1, null, true) as $i => $cells) {
        $ancho = max($ancho, count($cells));
        $datos[] = [$i + 1, $cells];
    }
    if (count($datos) > IMPORTAR_MAX_FILAS) { $r['error'] = 'El archivo tiene más de ' . number_format(IMPORTAR_MAX_FILAS) . ' renglones. Divídelo en partes.'; return $r; }
    while (count($enc) < $ancho) $enc[] = '';
    $r['tabla'] = ['encabezados' => $enc, 'filas' => $datos, 'fila_encabezado' => $h + 1];
    $r['ok'] = true;
    return $r;
}

/**
 * XLSX → matriz de filas (idea de LectorHoja de OF: un .xlsx es un ZIP con XML;
 * sirve lo que hay en xl/workbook.xml, xl/sharedStrings.xml y la hoja). No
 * entiende fórmulas (lee el último valor calculado), formatos ni gráficas.
 *
 * @return array{error:?string,filas:array,hojas:array,hoja:?int,excede:bool}
 */
function importar_leer_xlsx(string $ruta, ?int $hoja = null): array
{
    $out = ['error' => null, 'filas' => [], 'hojas' => [], 'hoja' => null, 'excede' => false];
    $zip = new ZipArchive();
    if ($zip->open($ruta) !== true) { $out['error'] = 'El archivo .xlsx está dañado o no se pudo abrir.'; return $out; }
    try {
        $leer = function (string $parte) use ($zip) {
            $st = $zip->statName($parte);
            if (!$st) return false;
            if ($st['size'] > IMPORTAR_MAX_XML) throw new RuntimeException('El archivo contiene una parte demasiado grande.');
            return $zip->getFromName($parte);
        };
        $libro = $leer('xl/workbook.xml');
        if ($libro === false) { $out['error'] = 'El archivo no parece un libro de Excel (.xlsx) válido.'; return $out; }

        $rels = [];
        $xmlRels = $leer('xl/_rels/workbook.xml.rels');
        if ($xmlRels !== false) {
            $x = importar_xml($xmlRels);
            if ($x) foreach ($x->Relationship as $rel) {
                $d = (string) $rel['Target'];
                if (strncmp($d, '/xl/', 4) === 0) $d = ltrim($d, '/');
                elseif (strncmp($d, 'xl/', 3) !== 0) $d = 'xl/' . ltrim($d, '/');
                $rels[(string) $rel['Id']] = $d;
            }
        }
        $xl = importar_xml($libro);
        if (!$xl || !isset($xl->sheets)) { $out['error'] = 'No se pudo leer la lista de hojas del archivo.'; return $out; }
        $ns = $xl->getNamespaces(true);
        $hojas = []; $n = 0;
        foreach ($xl->sheets->sheet as $h) {
            $n++;
            $nombre = trim((string) $h['name']) ?: ('Hoja ' . $n);
            $id = '';
            foreach ($h->attributes($ns['r'] ?? 'http://schemas.openxmlformats.org/officeDocument/2006/relationships') as $k => $v) {
                if ($k === 'id') $id = (string) $v;
            }
            $hojas[] = ['nombre' => $nombre, 'parte' => $rels[$id] ?? ('xl/worksheets/sheet' . $n . '.xml')];
        }
        if (!$hojas) { $out['error'] = 'El archivo no tiene hojas.'; return $out; }
        $out['hojas'] = array_column($hojas, 'nombre');

        $textos = [];
        $ss = $leer('xl/sharedStrings.xml');
        if ($ss !== false && ($x = importar_xml($ss))) {
            foreach ($x->si as $si) {
                $textos[] = isset($si->t) ? (string) $si->t
                    : implode('', array_map(function ($r) { return (string) $r->t; }, iterator_to_array($si->r)));
            }
        }
        $fechas = importar_xlsx_estilos_fecha($leer('xl/styles.xml'));

        // Hoja pedida, o la primera que traiga datos.
        $orden = $hoja !== null && isset($hojas[$hoja]) ? [$hoja] : array_keys($hojas);
        foreach ($orden as $i) {
            $xml = $leer($hojas[$i]['parte']);
            if ($xml === false) continue;
            [$filas, $excede] = importar_xlsx_celdas($xml, $textos, $fechas);
            $con_datos = false;
            foreach ($filas as $f) if (array_filter($f, function ($c) { return $c !== null && $c !== ''; })) { $con_datos = true; break; }
            if ($con_datos || $hoja !== null) {
                $out['filas'] = $filas; $out['hoja'] = $i; $out['excede'] = $excede;
                return $out;
            }
        }
        $out['error'] = 'Ninguna hoja del archivo trae datos.';
        return $out;
    } catch (Throwable $e) {
        $out['error'] = 'No se pudo leer el archivo .xlsx: ' . $e->getMessage();
        return $out;
    } finally {
        $zip->close();
    }
}

/** XML sin red y sin DTD (un xlsx legítimo nunca trae DOCTYPE/ENTITY). */
function importar_xml(string $xml): ?SimpleXMLElement
{
    if (stripos($xml, '<!DOCTYPE') !== false || stripos($xml, '<!ENTITY') !== false) return null;
    $prev = libxml_use_internal_errors(true);
    $x = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    return $x ?: null;
}

/** Qué estilos de celda son de fecha (Excel guarda la fecha como número + formato). */
function importar_xlsx_estilos_fecha($xml): array
{
    if ($xml === false || !($x = importar_xml($xml))) return [];
    $de_fabrica = [14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57];
    $propios = [];
    if (isset($x->numFmts)) {
        foreach ($x->numFmts->numFmt as $f) {
            $cod = (string) $f['formatCode'];
            if (preg_match('/(^|[^"\\\\])[ymdhs]/i', preg_replace('/"[^"]*"/', '', $cod))) $propios[] = (int) $f['numFmtId'];
        }
    }
    $fecha = [];
    if (isset($x->cellXfs)) {
        $i = 0;
        foreach ($x->cellXfs->xf as $xf) {
            $id = (int) $xf['numFmtId'];
            if (in_array($id, $de_fabrica, true) || in_array($id, $propios, true)) $fecha[$i] = true;
            $i++;
        }
    }
    return $fecha;
}

/** @return array{0:array,1:bool} [filas, excede_limite] */
function importar_xlsx_celdas(string $xml, array $textos, array $fechas): array
{
    $x = importar_xml($xml);
    if (!$x || !isset($x->sheetData)) return [[], false];
    $filas = []; $excede = false;
    foreach ($x->sheetData->row as $r) {
        // El número de fila del archivo (atributo r) para que los renglones en blanco no corran la numeración.
        $nr = (int) $r['r'];
        if ($nr > 0) while (count($filas) < $nr - 1) $filas[] = [];
        if (count($filas) > IMPORTAR_MAX_FILAS + 1) { $excede = true; break; }
        $fila = [];
        foreach ($r->c as $c) {
            // La columna sale de la referencia (B7 → 1): Excel OMITE las celdas vacías.
            $col = importar_xlsx_columna((string) $c['r']);
            $fila[$col] = importar_xlsx_valor($c, $textos, $fechas);
        }
        if (!$fila) { $filas[] = []; continue; }
        $max = max(array_keys($fila));
        $plana = [];
        for ($i = 0; $i <= $max; $i++) $plana[] = $fila[$i] ?? null;
        $filas[] = $plana;
    }
    return [$filas, $excede];
}

function importar_xlsx_valor(SimpleXMLElement $c, array $textos, array $fechas)
{
    $t = (string) $c['t'];
    if ($t === 's') { $i = (int) $c->v; return isset($textos[$i]) ? $textos[$i] : null; }
    if ($t === 'inlineStr') return isset($c->is->t) ? (string) $c->is->t : null;
    if ($t === 'b') return ((string) $c->v) === '1';
    if ($t === 'e') return null;
    if (!isset($c->v) || (string) $c->v === '') return null;
    $v = (string) $c->v;
    $s = isset($c['s']) ? (int) $c['s'] : -1;
    if (isset($fechas[$s]) && is_numeric($v)) {
        $f = importar_xlsx_fecha_de_serie((float) $v);
        if ($f) return $f;
    }
    if ($t === 'str') return $v;
    return is_numeric($v) ? (0 + $v) : $v;
}

/** Número de serie de Excel → 'Y-m-d H:i:s'. El día 0 es 1899-12-30 (el error del año bisiesto de 1900). */
function importar_xlsx_fecha_de_serie(float $n): ?string
{
    if ($n < 1 || $n > 2958465) return null;
    $base = new DateTimeImmutable('1899-12-30 00:00:00');
    $dias = (int) floor($n);
    $seg = (int) round(($n - $dias) * 86400);
    return $base->modify('+' . $dias . ' days +' . $seg . ' seconds')->format('Y-m-d H:i:s');
}

/** "BC7" → 54. */
function importar_xlsx_columna(string $ref): int
{
    $n = 0;
    $len = strlen($ref);
    for ($i = 0; $i < $len; $i++) {
        $ch = strtoupper($ref[$i]);
        if ($ch < 'A' || $ch > 'Z') break;
        $n = $n * 26 + (ord($ch) - 64);
    }
    return max(0, $n - 1);
}

// ════════════════════════════════════════════════════════════════════════
//  BASE DE DATOS (todo lo que sigue recibe $pdo)
// ════════════════════════════════════════════════════════════════════════

/** ¿Existen las dos tablas de OF-5? (migracion_2026_11_20_of5_importar.sql). Una consulta por proceso. */
function importar_tablas_listas(PDO $pdo): bool
{
    static $listo = null;
    if ($listo !== null) return $listo;
    try {
        $n = $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME IN ('importaciones_saldos', 'importaciones_saldos_filas')")->fetchColumn();
        $listo = intval($n) === 2;
    } catch (Throwable $e) {
        $listo = false;
    }
    return $listo;
}

const IMPORTAR_AVISO_MIGRACION = 'Falta aplicar la migración de OF-5 (importar adeudos). Pídele al administrador de la plataforma que la aplique: Diagnóstico → Base de datos → Aplicar pendientes, o `php herramientas/migrar.php --aplicar`.';

/** Alumnos de UNA escuela (activos e inactivos). */
function importar_cargar_alumnos(PDO $pdo, int $escuela_id): array
{
    $st = $pdo->prepare("SELECT id, nombre, matricula, activo FROM clientes WHERE escuela_id = ? AND tipo = 'alumno'");
    $st->execute([$escuela_id]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** Conceptos (productos) de UNA escuela. Sin la columna activo, todos cuentan como activos. */
function importar_cargar_productos(PDO $pdo, int $escuela_id): array
{
    $st = $pdo->prepare("SELECT * FROM productos WHERE escuela_id = ? ORDER BY nombre");
    $st->execute([$escuela_id]);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $out[] = [
            'id' => intval($p['id']), 'nombre' => (string) $p['nombre'], 'categoria' => (string) ($p['categoria'] ?? ''),
            'activo' => array_key_exists('activo', $p) ? intval($p['activo']) : 1,
            'precio' => floatval($p['precio'] ?? 0),
            'iva_tasa' => $p['iva_tasa'] ?? null,
        ];
    }
    return $out;
}

/** De las huellas dadas, las que YA están importadas (y no deshechas) en esta escuela. */
function importar_huellas_existentes(PDO $pdo, int $escuela_id, array $huellas): array
{
    $ya = [];
    foreach (array_chunk($huellas, 500) as $lote) {
        $q = implode(',', array_fill(0, count($lote), '?'));
        $st = $pdo->prepare("SELECT huella FROM importaciones_saldos_filas WHERE escuela_id = ? AND huella IN ({$q})");
        $st->execute(array_merge([$escuela_id], $lote));
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $h) $ya[$h] = true;
    }
    return $ya;
}

/**
 * Lee el archivo y arma el plan completo (analizar y aplicar usan EXACTAMENTE
 * esto: lo que se aplica es lo que se vio).
 *
 * @param array $opc ['mapeo' => ?array crudo del navegador, 'eleccion' => ?array concepto_clave => producto_id, 'hoja' => ?int]
 * @return array{ok:bool,error:?string,...}
 */
function importar_analizar_archivo(PDO $pdo, int $escuela_id, string $ruta, string $nombre, array $opc = []): array
{
    $lec = importar_leer_archivo($ruta, $nombre, isset($opc['hoja']) && $opc['hoja'] !== '' ? intval($opc['hoja']) : null);
    if (!$lec['ok']) return ['ok' => false, 'error' => $lec['error']];
    $tabla = $lec['tabla'];

    $detectado = importar_detectar_columnas($tabla['encabezados']);
    $mapeo = $detectado;
    $manual = false;
    if (isset($opc['mapeo']) && is_array($opc['mapeo'])) {
        [$mapeo, $e] = importar_limpiar_mapeo($opc['mapeo'], count($tabla['encabezados']));
        if ($e) return ['ok' => false, 'error' => $e];
        $manual = true;
    }

    $eleccion = [];
    if (isset($opc['eleccion']) && is_array($opc['eleccion'])) {
        foreach ($opc['eleccion'] as $clave => $pid) $eleccion[(string) $clave] = intval($pid);
    }

    $plan = importar_construir_plan(
        $tabla, $mapeo, $escuela_id,
        importar_cargar_alumnos($pdo, $escuela_id),
        $productos = importar_cargar_productos($pdo, $escuela_id),
        $eleccion,
        function (array $huellas) use ($pdo, $escuela_id) { return importar_huellas_existentes($pdo, $escuela_id, $huellas); },
        date('Y-m-d')
    );
    $plan['ok'] = true;
    $plan['archivo'] = [
        'nombre' => $nombre, 'formato' => $lec['formato'], 'separador' => $lec['separador'], 'codificacion' => $lec['codificacion'],
        'hojas' => $lec['hojas'], 'hoja' => $lec['hoja'], 'hash' => sha1_file($ruta),
    ];
    $plan['encabezados'] = $tabla['encabezados'];
    $plan['mapeo'] = $mapeo;
    $plan['mapeo_detectado'] = $detectado;
    $plan['mapeo_manual'] = $manual;
    $plan['productos'] = array_map(function ($p) {
        return ['id' => $p['id'], 'nombre' => $p['nombre'], 'categoria' => $p['categoria'], 'activo' => (bool) $p['activo'], 'iva_tasa' => $p['iva_tasa']];
    }, $productos);
    return $plan;
}

/**
 * Siguiente número de folio libre de la escuela: el MAYOR entre (cuántos cobros
 * hay + 1), que es como numera crear_cobro, y (el número más alto ya usado + 1),
 * por si hubo cobros borrados y el conteo se quedó corto.
 */
function importar_siguiente_numero_folio(PDO $pdo, int $escuela_id, string $clave): int
{
    $st = $pdo->prepare("SELECT COUNT(*) FROM cobros WHERE escuela_id = ?");
    $st->execute([$escuela_id]);
    $n = intval($st->fetchColumn()) + 1;
    $pref = $clave . '-';
    try {
        $st = $pdo->prepare("SELECT MAX(CAST(SUBSTRING(folio, ?) AS UNSIGNED)) FROM cobros
                              WHERE escuela_id = ? AND folio LIKE ? AND SUBSTRING(folio, ?) REGEXP '^[0-9]+$'");
        $st->execute([strlen($pref) + 1, $escuela_id, str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $pref) . '%', strlen($pref) + 1]);
        $max = intval($st->fetchColumn());
        if ($max + 1 > $n) $n = $max + 1;
    } catch (Throwable $e) { /* se queda con el conteo */ }
    return $n;
}

/**
 * Aplica el plan: crea los cobros por lotes (una transacción por lote) y deja
 * el registro de la importación. Quien llama debe tener el candado de la
 * escuela y haber construido el plan DESPUÉS de tomarlo.
 *
 * Por renglón: cobro 'pendiente' (metodo 'Pendiente', como los cobros del cron
 * de recurrentes) con total = pendiente, cobro_items vía impuestos_insertar_item
 * (hereda IVA y clave SAT del producto elegido), y su fila en
 * importaciones_saldos_filas con la huella. Después, recalcular_saldo_pendiente
 * por alumno. NO toca cobro_abonos.
 *
 * Si un lote falla, ese lote se revierte; los anteriores ya quedaron y la
 * importación queda registrada con lo que sí se creó. Volver a subir el mismo
 * archivo importa solo lo que falte (huellas).
 *
 * @return array{importacion_id:int,cobros_creados:int,monto_total_c:int,lotes:int,error:?string}
 */
function importar_aplicar_plan(PDO $pdo, int $escuela_id, array $plan, array $archivo, ?int $usuario_id, int $tam_lote = 200): array
{
    require_once __DIR__ . '/helpers_impuestos.php';
    $a_importar = array_values(array_filter($plan['filas'], function ($f) { return $f['estado'] === 'ok'; }));
    $res = ['importacion_id' => 0, 'cobros_creados' => 0, 'monto_total_c' => 0, 'lotes' => 0, 'error' => null];

    $st = $pdo->prepare("SELECT clave FROM escuelas WHERE id = ?");
    $st->execute([$escuela_id]);
    $clave = (string) ($st->fetchColumn() ?: 'ESC');

    $omitidas = count($plan['filas']) - count($a_importar);
    $pdo->prepare(
        "INSERT INTO importaciones_saldos (escuela_id, archivo_nombre, archivo_hash, usuario_id, filas_total, cobros_creados, monto_total, filas_omitidas, estado)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'aplicada')"
    )->execute([$escuela_id, mb_substr((string) ($archivo['nombre'] ?? ''), 0, 255), (string) ($archivo['hash'] ?? ''),
                $usuario_id, count($plan['filas']), $omitidas]);
    $imp_id = intval($pdo->lastInsertId());
    $res['importacion_id'] = $imp_id;

    $insCobro = $pdo->prepare(
        "INSERT INTO cobros (escuela_id, cliente_id, folio, total, metodo, estado, fecha)
         VALUES (?, ?, ?, ?, 'Pendiente', 'pendiente', ?)"
    );
    $insFila = $pdo->prepare(
        "INSERT INTO importaciones_saldos_filas
            (importacion_id, escuela_id, cobro_id, cliente_id, fila_archivo, huella, concepto, monto_original, abonado, pendiente,
             fecha_emision, fecha_vence, folio_externo, producto_id, nota)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $upImp = $pdo->prepare("UPDATE importaciones_saldos SET cobros_creados = cobros_creados + ?, monto_total = monto_total + ? WHERE id = ?");

    foreach (array_chunk($a_importar, max(1, $tam_lote)) as $lote) {
        $creados = 0; $monto_c = 0; $clientes = [];
        try {
            $pdo->beginTransaction();
            $n = importar_siguiente_numero_folio($pdo, $escuela_id, $clave);
            foreach ($lote as $f) {
                $folio = $clave . '-' . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
                $n++;
                $pend = $f['pendiente_c'] / 100;
                $insCobro->execute([$escuela_id, $f['alumno_id'], $folio, $pend, $f['fecha_emision']]);
                $cobro_id = intval($pdo->lastInsertId());
                // cobro_items es opcional (como en crear_cobro): sin la tabla el cobro NO debe fallar.
                // Pero un error de SQL dentro de la transacción no la envenena en MySQL, así que se puede seguir.
                try {
                    impuestos_insertar_item($pdo, $escuela_id, $cobro_id, $f['producto_id'], $f['concepto'], 1, $pend, $pend);
                } catch (PDOException $e) {
                    if (function_exists('log_api')) log_api('importar_saldos: cobro_items no disponible: ' . $e->getMessage());
                }
                $insFila->execute([
                    $imp_id, $escuela_id, $cobro_id, $f['alumno_id'], $f['fila'], $f['huella'], $f['concepto'],
                    $f['monto_original_c'] / 100, $f['abonado_c'] / 100, $pend,
                    $f['fecha'] !== '' ? $f['fecha_emision'] : null, $f['vence'], $f['folio_externo'] !== '' ? $f['folio_externo'] : null,
                    $f['producto_id'], importar_nota_saldo_inicial($f['monto_original_c'], $f['abonado_c']),
                ]);
                $creados++; $monto_c += $f['pendiente_c']; $clientes[$f['alumno_id']] = true;
            }
            foreach (array_keys($clientes) as $cid) recalcular_saldo_pendiente($pdo, intval($cid));
            $upImp->execute([$creados, $monto_c / 100, $imp_id]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if (function_exists('log_api')) log_api('importar_saldos: lote falló (importación #' . $imp_id . '): ' . $e->getMessage());
            $res['error'] = $res['lotes'] === 0
                ? 'No se pudo guardar el primer lote: no se creó ningún cobro. Vuelve a intentar; si el problema sigue, avisa a soporte.'
                : 'Se detuvo en el lote ' . ($res['lotes'] + 1) . ': los ' . $res['cobros_creados'] . ' cobros de los lotes anteriores sí se guardaron. Vuelve a subir el mismo archivo y solo se importará lo que falte.';
            return $res;
        }
        $res['cobros_creados'] += $creados;
        $res['monto_total_c'] += $monto_c;
        $res['lotes']++;
    }
    return $res;
}

/**
 * Qué impide deshacer una importación: cobros con dinero recibido o que ya no
 * están pendientes ni cancelados. Lee con el cobro bloqueado si se pide.
 *
 * @return array{bloqueantes:array,cancelables:array,ya_cancelados:int}
 */
function importar_revisar_deshacer(PDO $pdo, int $importacion_id, bool $bloquear = false): array
{
    $sql = "SELECT f.id AS fila_id, f.cobro_id, c.folio, c.estado, c.monto_pagado, c.total, cl.nombre AS alumno
              FROM importaciones_saldos_filas f
              JOIN cobros c ON c.id = f.cobro_id
              LEFT JOIN clientes cl ON cl.id = f.cliente_id
             WHERE f.importacion_id = ? AND f.deshecha = 0
             ORDER BY f.id" . ($bloquear ? ' FOR UPDATE' : '');
    $st = $pdo->prepare($sql);
    $st->execute([$importacion_id]);
    $r = ['bloqueantes' => [], 'cancelables' => [], 'ya_cancelados' => 0];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $x) {
        if ($x['estado'] === 'cancelado') { $r['ya_cancelados']++; $r['cancelables'][] = $x; continue; }
        $pagado_c = intval(round(floatval($x['monto_pagado']) * 100));
        if ($pagado_c > 0) {
            $x['motivo'] = 'Ya recibió pagos ($' . number_format($pagado_c / 100, 2) . ')';
            $r['bloqueantes'][] = $x;
        } elseif ($x['estado'] !== 'pendiente') {
            $x['motivo'] = 'Ya no está pendiente (estado: ' . $x['estado'] . ')';
            $r['bloqueantes'][] = $x;
        } else {
            $r['cancelables'][] = $x;
        }
    }
    return $r;
}

// ════════════════════════════════════════════════════════════════════════
//  PARA LAS ACCIONES (estas SÍ usan respond() de api.php: no se llaman desde pruebas ni cron)
// ════════════════════════════════════════════════════════════════════════

/**
 * Valida rol y escuela de las acciones importar_saldos_*: solo admin y
 * superadmin. El admin SIEMPRE opera sobre su propia escuela (se ignora el
 * escuela_id que mande el navegador); el superadmin la indica y debe existir.
 * Responde 403/error y termina si algo no cuadra. Devuelve el escuela_id.
 *
 * @param mixed $escuela_pedida el escuela_id de $_POST / $input
 */
function importar_contexto_o_responder(PDO $pdo, array $usuario_actual, $escuela_pedida, string $mensaje_rol): int
{
    $rol = $usuario_actual['rol'] ?? '';
    requerir_rol($rol, ['superadmin', 'admin'], $mensaje_rol);
    $escuela_id = $rol === 'admin' ? intval($usuario_actual['escuela_id'] ?? 0) : intval($escuela_pedida);
    if ($escuela_id <= 0) respond(['success' => false, 'error' => 'Selecciona una escuela antes de importar adeudos.']);
    requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No puedes importar adeudos en otro colegio.');
    $st = $pdo->prepare("SELECT id FROM escuelas WHERE id = ?");
    $st->execute([$escuela_id]);
    if (!$st->fetch()) respond(['success' => false, 'error' => 'Escuela no encontrada.']);
    requerir_seccion_habilitada($pdo, $rol, $escuela_id, ['cobros']);
    return $escuela_id;
}

/**
 * Valida el archivo de $_FILES['archivo']: error de subida, que sea una subida
 * real, tamaño (5 MB), extensión y MIME REAL (leído de los bytes con finfo, no
 * el que dice el navegador). Devuelve [ruta temporal, nombre original] o
 * responde con el error.
 */
function importar_archivo_subido_o_responder(): array
{
    if (empty($_FILES['archivo']) || !is_array($_FILES['archivo'])) {
        respond(['success' => false, 'error' => 'No se recibió ningún archivo. Elige un CSV o un XLSX.']);
    }
    $f = $_FILES['archivo'];
    $err = $f['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($err !== UPLOAD_ERR_OK) {
        $msg = ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE)
            ? 'El archivo es demasiado grande (máximo 5 MB).'
            : (function_exists('uploads_error_texto') ? (uploads_error_texto($err) ?: 'No se pudo subir el archivo.') : 'No se pudo subir el archivo.');
        respond(['success' => false, 'error' => $msg]);
    }
    if (!is_uploaded_file($f['tmp_name'])) respond(['success' => false, 'error' => 'Subida inválida.']);
    if (($f['size'] ?? 0) > IMPORTAR_MAX_BYTES) respond(['success' => false, 'error' => 'El archivo pesa más de 5 MB. Divídelo en partes.']);
    $nombre = (string) ($f['name'] ?? '');
    $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
    $e = importar_validar_mime($f['tmp_name'], $ext);
    if ($e !== null) respond(['success' => false, 'error' => $e]);
    return [$f['tmp_name'], $nombre];
}

/**
 * ¿Los bytes coinciden con la extensión? null = bien; texto = el error.
 * csv/txt: texto; xlsx: ZIP/Office. (Sin la extensión fileinfo no se puede, y
 * entonces importar_leer_archivo igual revisa la firma "PK" y el contenido.)
 */
function importar_validar_mime(string $ruta, string $ext): ?string
{
    if (!in_array($ext, ['csv', 'txt', 'xlsx'], true)) {
        return $ext === 'xls'
            ? 'El formato .xls (Excel antiguo) no se puede leer. Guárdalo como .xlsx o como CSV.'
            : 'Formato no permitido. Sube un archivo CSV o XLSX.';
    }
    if (!function_exists('finfo_open')) return null;
    $fi = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $fi ? finfo_file($fi, $ruta) : false;
    if ($fi) finfo_close($fi);
    if (!$mime) return null;
    if ($ext === 'xlsx') {
        $ok = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/x-zip-compressed',
               'application/x-zip', 'application/octet-stream'];
        return in_array($mime, $ok, true) ? null : 'El archivo no es un libro de Excel (.xlsx) válido.';
    }
    $cabeza = (string) file_get_contents($ruta, false, null, 0, 2);
    $utf16 = $cabeza === "\xFF\xFE" || $cabeza === "\xFE\xFF";
    if (strpos($mime, 'text/') === 0 || in_array($mime, ['application/csv', 'application/vnd.ms-excel', 'inode/x-empty'], true) || $utf16) return null;
    return 'El archivo no es un CSV de texto. Guarda la hoja como CSV e inténtalo de nuevo.';
}

/** Un JSON mandado en un campo multipart (mapeo, eleccion) → arreglo o null. */
function importar_json_post(string $campo): ?array
{
    $v = $_POST[$campo] ?? null;
    if ($v === null || $v === '') return null;
    $j = json_decode((string) $v, true);
    return is_array($j) ? $j : null;
}

/** Centavos → pesos (float con 2 decimales) para la respuesta JSON. */
function importar_pesos($c): ?float
{
    return $c === null ? null : round($c / 100, 2);
}

/**
 * El plan listo para el navegador: dinero en pesos (no centavos), sin la
 * huella. Siempre van TODOS los renglones (el archivo tiene a lo más 5,000).
 */
function importar_plan_a_respuesta(array $plan): array
{
    $filas = [];
    foreach ($plan['filas'] as $f) {
        $filas[] = [
            'fila' => $f['fila'], 'estado' => $f['estado'], 'motivo' => $f['motivo'],
            'errores' => $f['errores'], 'advertencias' => $f['advertencias'],
            'matricula' => $f['matricula'], 'alumno_archivo' => $f['alumno_archivo'],
            'alumno_id' => $f['alumno_id'], 'alumno_nombre' => $f['alumno_nombre'],
            'alumno_matricula' => $f['alumno_matricula'], 'alumno_activo' => $f['alumno_activo'],
            'concepto' => $f['concepto'], 'concepto_clave' => $f['concepto_clave'], 'producto_id' => $f['producto_id'],
            'monto_original' => importar_pesos($f['monto_original_c']), 'abonado' => importar_pesos($f['abonado_c']),
            'pendiente' => importar_pesos($f['pendiente_c']),
            'fecha_emision' => $f['fecha_emision'], 'vence' => $f['vence'], 'folio_externo' => $f['folio_externo'],
        ];
    }
    $t = $plan['totales'];
    $totales = $t;
    foreach (['monto_c' => 'monto', 'abonado_c' => 'abonado', 'original_c' => 'original'] as $c => $p) {
        unset($totales[$c]);
        $totales[$p] = importar_pesos($t[$c]);
    }
    $conceptos = [];
    foreach ($plan['conceptos'] as $c) {
        $conceptos[] = ['clave' => $c['clave'], 'concepto' => $c['concepto'], 'filas' => $c['filas'],
                        'monto' => importar_pesos($c['monto_c']), 'sugerencia' => $c['sugerencia'], 'producto_id' => $c['producto_id']];
    }
    return [
        'success' => true, 'error' => $plan['error'], 'columnas_faltantes' => $plan['columnas_faltantes'],
        'archivo' => $plan['archivo'] ?? null, 'encabezados' => $plan['encabezados'] ?? [],
        'mapeo' => $plan['mapeo'] ?? null, 'mapeo_detectado' => $plan['mapeo_detectado'] ?? null, 'mapeo_manual' => $plan['mapeo_manual'] ?? false,
        'totales' => $totales, 'conceptos' => $conceptos, 'filas' => $filas,
        'productos' => $plan['productos'] ?? [],
        'limites' => ['max_filas' => IMPORTAR_MAX_FILAS, 'max_mb' => 5, 'xlsx' => importar_puede_xlsx()],
    ];
}
