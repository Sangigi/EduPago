# Pruebas manuales por rol — gestión de estudiantes

Lista para recorrer después de desplegar (ver `PRODUCCION.md` → *Gestión de estudiantes*). Cada punto remite al paso detallado en el documento de su fase (`fN §k` = `docs/estudiantes/fN.md`, paso k de su sección de pruebas).

**Prepara antes:**
- Un colegio de pruebas, o alumnos de prueba dentro de un colegio real. Nunca des de baja ni promuevas alumnos reales para probar: la baja ofrece cancelar sus adeudos y la promoción los cambia de grado.
- Un usuario de cada rol: admin, cajero, familia (con dos hijos), control escolar, dirección, docente, alumno y tiendita.
- Un segundo colegio con su admin, para las pruebas de "otro colegio".
- La pestaña Red del navegador abierta (F12), para ver qué responde el servidor.

Las pruebas marcadas **[seguridad]** deben responder 403. Si alguna deja pasar la petición, para y repórtalo antes de seguir.

---

## Admin

- [ ] Alumnos, Familias, Caja e Historial de cobros cargan igual que antes.
- [ ] **Estatus del alumno** (f1 §1–§8): baja temporal sin cancelar nada; motivo obligatorio; baja definitiva cancelando un cobro sin abonos (el que tiene abonos aparece deshabilitado); reactivar; egresar; historial al pie de la ficha; filtro por estatus.
- [ ] **Expediente** (f2 §1–§6): datos médicos, CURP inválida rechazada, tutores, subir y eliminar documentos, tipos de archivo no permitidos.
- [ ] **Datos médicos fuera de `cargar_datos`** (f2 §3): la respuesta no trae `padecimientos`, `medicamentos`, `seguro_medico` ni `observaciones`.
- [ ] **Archivo privado** (f2 §7): abrir directo `https://<dominio>/uploads_privados/...` responde 403.
- [ ] **Grados y promoción** (f3 §1–§6): cargar el catálogo, ligar alumnos, publicar y despublicar un periodo, cerrar el ciclo y promover en vista previa antes de aplicar. Volver a promover los marca "Ya procesado".
- [ ] **Colegiatura por grado o grupo** (f5 §1–§8): un concepto existente sigue "para todos"; vista previa de alcance; aviso de cobro doble; el cron solo genera a los alumnos del alcance.
- [ ] **Crear los roles nuevos** (f4 §1): control escolar, dirección y la cuenta "Acceso del alumno". Un alumno no puede tener dos cuentas activas.
- [ ] **Monedero** (f6): ver `f6.md`. Primero actívalo en *Monedero → Configuración*.

## Cajero

- [ ] Ingresos y Corte de caja cargan; solo ve y mueve su propia caja (F0).
- [ ] **[seguridad]** No ve el botón Expediente; `alumno_expediente_obtener` con su token responde 403 (f2 §9).
- [ ] No ve el historial de movimientos del alumno (f1 §7).

## Familia

- [ ] El portal carga adeudos, pagos y la pestaña Escolar igual que antes.
- [ ] **Aviso de privacidad** (f2 §10): aparece por hijo; aceptar uno no acepta el otro.
- [ ] **Calificaciones** (f3 §4): solo ve periodos publicados.
- [ ] **Kárdex** (f3 §7): solo de sus hijos.
- [ ] **[seguridad]** `alumno_aviso_privacidad_aceptar` con el `cliente_id` de un alumno de otra familia responde 403 (f2 §10).
- [ ] Después de unos días: `grep FAMILIA_FUERA_ALLOWLIST api_log.txt` en el servidor. Cada línea es una acción que el portal llamó fuera de su lista. Ver `PRODUCCION.md` para pasar al modo estricto.

## Control escolar

- [ ] Aterriza en Alumnos. El menú no tiene caja, cobros, gastos, productos ni facturación (f4 §2).
- [ ] Alumnos sin columnas de CLABE ni saldo. Puede dar de alta (sin CLABE automática), editar, cambiar estatus (el modal no ofrece adeudos ni CLABE: f1 §10), abrir el expediente e importar CSV.
- [ ] Mi equipo: solo ve docentes y cuentas de alumno; crea un docente.
- [ ] Control escolar completo, igual que admin (f3 §8).
- [ ] **[seguridad]** La respuesta de `cargar_datos` no trae `cobros`, `clabe_individual`, `saldo_pendiente`, `rfc_factura` ni `productos`.
- [ ] **[seguridad]** `alumno_cobros_pendientes` responde 403.

## Dirección

- [ ] Menú: Alumnos, Grupos, Asistencias, Calificaciones. Todo en solo lectura; el expediente se abre sin edición (f4 §3).
- [ ] Ve boletas, asistencias y kárdex (f3 §8).
- [ ] **[seguridad]** `escolar_asistencia_guardar` y `crear_cliente` responden 403.

## Docente

- [ ] Sigue entrando a su panel; pasa lista y captura calificaciones como antes (f4 §6, f3 §9).
- [ ] **[seguridad]** El kárdex responde 403 (f3 §7).

## Alumno

- [ ] Entra directo a su portal, sin menú lateral: grupo, promedio, horario, boleta (solo periodos publicados), kárdex y asistencia (f4 §4).
- [ ] Monedero: la pestaña aparece solo si su colegio lo activó, o si ya tiene saldo o movimientos (f6).
- [ ] **[seguridad]** `cargar_datos`, `escolar_catalogos`, `alumno_cobros_pendientes`, y `escolar_boleta` con el `cliente_id` de otro alumno, responden 403.
- [ ] **Cuenta desactivada** (f4 §5): al desactivarla, su sesión deja de funcionar en la siguiente petición. Al dar de baja al alumno (f1) su cuenta también se desactiva.

## Tiendita

- [ ] Entra directo al punto de venta. Ver `f6.md` para el plan completo de ventas, NIP, límites y cancelaciones.
- [ ] **[seguridad]** `cargar_datos` y cualquier acción de cobranza responden 403.

## Otro colegio [seguridad]

Con el token del admin del segundo colegio, sobre alumnos y documentos del primero:
- [ ] `alumno_expediente_obtener` y `alumno_documento_descargar` responden 403 (f2 §8).
- [ ] `editar_producto` con grupos de otro colegio es rechazado; `crear_producto` con `escuela_id` ajeno responde 403 (f5 §5).

## Cron

- [ ] `php cron_recordatorios.php` (o su URL con clave), con un alumno de baja que tenga cobros vencidos: no recibe recordatorios, recargos ni cargo CAI. Un alumno activo sí (f1 §9).
- [ ] Un concepto por grupo solo genera cobros a ese grupo, y correrlo dos veces no duplica (f5 §8).
