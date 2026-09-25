<?php
// lib/planes.php
//
// FUENTE ÚNICA DE VERDAD DE LOS PLANES DE SUSCRIPCIÓN (25-sep-2026).
//
// POR QUÉ EXISTE ESTE ARCHIVO
//
// Hasta hoy la tabla de planes estaba copiada en CUATRO lugares: api.php
// (PLANES_LIMITES), cron_recordatorios.php ($PLAN_INFO), views/MiSuscripcion.js
// (PLANES_INFO_MS) y assets/js/registro.js (PLANES). Cada copia traía un
// comentario pidiendo mantenerlas sincronizadas a mano, y no funcionó: al
// revisar el 25-sep las copias YA estaban desincronizadas entre sí.
//
//   api.php               -> basico 50, avanzado 55, pro 60
//   cron_recordatorios.php-> basico 50, avanzado 50, pro 50   <-- distinto
//   correo real recibido  -> pro 3,000                        <-- otro más
//
// Un colegio en pantalla veía "$50.00" y por correo le llegaba "$3,000.00 MXN
// + IVA" el mismo día, por el mismo plan. Eso no es un descuido: es lo que
// pasa siempre que el mismo número vive en varios archivos.
//
// A partir de aquí, los precios se cambian EN UN SOLO SITIO: la constante
// PLANES_USAR_PRECIOS_PRUEBA de abajo. El PHP lee de aquí, y el JavaScript lo
// recibe desde la API (cargar_datos e invitacion_ver mandan `planes`), así que
// las pantallas ya no tienen su propia copia.

// ── EL INTERRUPTOR ───────────────────────────────────────────────────────
//
// true  = precios de PRUEBA. Bajados al mínimo que acepta Cobroscontarjeta.com
//         ($50.00) para poder probar el cobro real de suscripciones sin gastar.
// false = precios REALES de venta.
//
// CAMBIAR ESTO A false ANTES DE DAR DE ALTA COLEGIOS DE VERDAD.
// Es lo único que hay que tocar: no hay ninguna otra copia que actualizar.
const PLANES_USAR_PRECIOS_PRUEBA = true;

const PLANES_PRECIOS_REALES = [
    'basico'   => 999.00,
    'avanzado' => 1500.00,
    'pro'      => 3000.00,
];

const PLANES_PRECIOS_PRUEBA = [
    'basico'   => 50.00,
    'avanzado' => 55.00,
    'pro'      => 60.00,
];

// Los límites NO dependen del interruptor: son los mismos se cobre lo que se
// cobre. max_alumnos / max_planteles = null significa "sin límite".
const PLANES_CARACTERISTICAS = [
    'basico'   => ['label' => 'Básico',   'max_alumnos' => 400,  'max_planteles' => 1,    'detalle' => 'Hasta 400 alumnos, 1 plantel'],
    'avanzado' => ['label' => 'Avanzado', 'max_alumnos' => 800,  'max_planteles' => 1,    'detalle' => 'Hasta 800 alumnos, 1 plantel'],
    'pro'      => ['label' => 'Pro',      'max_alumnos' => null, 'max_planteles' => null, 'detalle' => 'Alumnos y planteles ilimitados'],
];

// Plan de respaldo si `escuelas.plan` trae un valor no reconocido (un typo, o
// un dato viejo tipo 'free' que ya no existe como plan real). Se usa el MÁS
// RESTRICTIVO a propósito: equivocarse hacia "sin límite" regalaría el
// producto; equivocarse hacia 'basico' como mucho molesta y se nota enseguida.
const PLAN_FALLBACK = 'basico';

/**
 * La tabla completa de planes, ya con el precio que toca según el interruptor.
 * Es lo que antes era la constante PLANES_LIMITES de api.php, y conserva
 * exactamente la misma forma para no romper a nadie que ya la use
 * (acciones/crear_escuela.php, cambiar_plan_escuela.php, crear_cliente.php,
 * crear_plantel.php, editar_escuela.php, escuela_generar_pago_renovacion.php,
 * invitacion_enviar.php).
 */
function planes_tabla() {
    static $tabla = null;
    if ($tabla !== null) return $tabla;

    $precios = PLANES_USAR_PRECIOS_PRUEBA ? PLANES_PRECIOS_PRUEBA : PLANES_PRECIOS_REALES;
    $tabla = [];
    foreach (PLANES_CARACTERISTICAS as $clave => $car) {
        $tabla[$clave] = [
            'precio'        => $precios[$clave] ?? $precios[PLAN_FALLBACK],
            'max_alumnos'   => $car['max_alumnos'],
            'max_planteles' => $car['max_planteles'],
            'label'         => $car['label'],
            'detalle'       => $car['detalle'],
        ];
    }
    return $tabla;
}

/** Los límites de un plan, cayendo al más restrictivo si no se reconoce. */
function limitesDelPlan($nombrePlan) {
    $t = planes_tabla();
    return $t[$nombrePlan] ?? $t[PLAN_FALLBACK];
}

/** El precio mensual (sin IVA) de un plan. */
function precioDelPlan($nombrePlan) {
    return floatval(limitesDelPlan($nombrePlan)['precio']);
}

/**
 * La tabla tal como la consume el navegador. Es lo que se manda en las
 * respuestas de cargar_datos e invitacion_ver para que las pantallas dejen de
 * tener su propia copia de los precios.
 */
function planes_para_frontend() {
    return ['planes' => planes_tabla(), 'precios_de_prueba' => PLANES_USAR_PRECIOS_PRUEBA];
}

// ── Compatibilidad hacia atrás ───────────────────────────────────────────
//
// PLANES_LIMITES era una constante definida en api.php y la usan 8 archivos
// (crear_escuela, cambiar_plan_escuela, crear_cliente, crear_plantel,
// editar_escuela, escuela_generar_pago_renovacion, invitacion_enviar). Se
// redefine aquí con el MISMO nombre y la MISMA forma para no tener que editar
// ocho archivos — que es precisamente el tipo de cambio disperso que este
// archivo viene a eliminar.
//
// Se usa define() y no const porque el valor se calcula en tiempo de
// ejecución (depende del interruptor de arriba) y const no admite llamadas
// a función.
if (!defined('PLANES_LIMITES')) define('PLANES_LIMITES', planes_tabla());
