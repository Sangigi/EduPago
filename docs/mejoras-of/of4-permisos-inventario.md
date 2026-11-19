# OF-4b: inventario de permisos por acción

> Generado por `herramientas/inventario-permisos.php`. NO editar a mano: se regenera.
> Método y límites: ver la cabecera de ese script y `of4-permisos.md`.

- **Roles que la llaman**: roles cuyas pantallas contienen la llamada (aproximación por archivo; el `requerir_rol` manda).
- **requerir_rol interno**: roles que la acción (o su helper de contexto) admite. `(sin guardia de rol)` = no valida rol; si valida alcance por escuela se anota.
- **Listas**: en qué allowlist nueva quedó (A=admin, C=cajero, T=contador, D=distribuidor). Marcada **dudosa** cuando entró por el criterio "ante la duda, admin".

| Acción | Roles que la llaman | requerir_rol interno | Listas | Notas |
|---|---|---|---|---|
| `abonos_sin_complemento_listar` | admin, superadmin | superadmin, admin, cajero | A |  |
| `activar_cuenta_confirmar` | público (sin sesión) | — | pública |  |
| `activar_cuenta_ver` | público (sin sesión) | — | pública |  |
| `alumno_aviso_privacidad_aceptar` | admin, control_escolar, direccion, familia | familia | — |  |
| `alumno_beca_desactivar` | admin, cajero | superadmin, admin | A |  |
| `alumno_beca_guardar` | admin, cajero | superadmin, admin | A |  |
| `alumno_becas_listar` | admin, cajero, superadmin | superadmin, admin, cajero | AC |  |
| `alumno_cambiar_estatus` | admin, cajero, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `alumno_cobros_pendientes` | admin, cajero, control_escolar, direccion, superadmin | superadmin, admin | A |  |
| `alumno_documento_descargar` | admin, control_escolar, direccion, familia | superadmin, admin, control_escolar, direccion | A |  |
| `alumno_documento_eliminar` | admin, control_escolar, direccion, familia | superadmin, admin, control_escolar | A |  |
| `alumno_documento_subir` | admin, control_escolar, direccion, familia | superadmin, admin, control_escolar | A |  |
| `alumno_documentos_listar` | admin, control_escolar, direccion, familia | superadmin, admin, control_escolar, direccion | A |  |
| `alumno_expediente_guardar` | admin, control_escolar, direccion, familia | superadmin, admin, control_escolar | A |  |
| `alumno_expediente_obtener` | admin, control_escolar, direccion, familia | superadmin, admin, control_escolar, direccion | A |  |
| `alumno_movimientos_listar` | admin, cajero, control_escolar, direccion, superadmin | superadmin, admin, control_escolar, direccion | A |  |
| `alumno_resumen` | alumno | alumno | — |  |
| `alumno_tutor_eliminar` | admin, control_escolar, direccion, familia | superadmin, admin, control_escolar | A |  |
| `alumno_tutor_guardar` | admin, control_escolar, direccion, familia | superadmin, admin, control_escolar | A |  |
| `alumno_tutores_listar` | admin, cajero, control_escolar, direccion, superadmin, familia | superadmin, admin, control_escolar, direccion | A |  |
| `asignar_clabe_pool` | (nadie en el frontend) | superadmin, admin, cajero | AC (dudosa: A/C) | Sin llamador en el frontend. |
| `asignar_clabe_pool_masivo` | (nadie en el frontend) | superadmin, admin | A (dudosa: A) | Sin llamador en el frontend. |
| `asignar_id_externo` | contador | superadmin, provision | — | Contador.js todavía la invoca (guardarIdExterno) pero requerir_rol ya NO admite contador: llamada muerta que el backend rechaza. |
| `buscar_global` | superadmin, soporte | superadmin, soporte | — |  |
| `caja_abrir` | admin, cajero | superadmin, admin, cajero | AC |  |
| `caja_cerrar` | admin, cajero | superadmin, admin, cajero | AC |  |
| `caja_estado` | admin, cajero | superadmin, admin, cajero | AC |  |
| `caja_historial` | admin, cajero | superadmin, admin, cajero | AC |  |
| `caja_movimiento` | admin, cajero | superadmin, admin, cajero | AC |  |
| `caja_resumen` | admin, cajero | superadmin, admin, cajero | AC |  |
| `caja_sucursales` | admin, cajero | superadmin, admin, cajero | AC |  |
| `cambiar_password_propio` | todos los roles | (inline, revisado) cualquier rol autenticado | ACTD | Autoservicio: cualquier usuario autenticado, sobre sí mismo. |
| `cambiar_plan_escuela` | superadmin | superadmin | — |  |
| `cancelar_cai` | familia | (inline, revisado) superadmin, admin, cajero, familia | A (dudosa: A) | Solo el portal de familia la llama; admin/cajero la admiten por dentro pero ninguna vista suya la pinta. |
| `cancelar_cfdi` | admin, superadmin | superadmin, admin | A |  |
| `cancelar_cfdi_actualizar` | admin, superadmin | superadmin, admin | A |  |
| `cancelar_cobro` | admin, cajero | superadmin, admin, cajero | AC |  |
| `cargar_datos` | todos los roles | (inline, revisado) superadmin, admin, cajero, soporte, familia, control_escolar, direccion | AC | No la piden los roles de plataforma (ROLES_SIN_CARGAR_DATOS en app.js). |
| `cerrar_sesiones_usuario` | admin, superadmin | superadmin, admin | A |  |
| `cfdi_cancelaciones_listar` | admin, superadmin | superadmin, admin | A |  |
| `cobrar_cai` | admin, cajero, familia | superadmin, admin, cajero | AC |  |
| `comisiones_cerrar_periodo` | (nadie en el frontend) | superadmin | — | Sin llamador en el frontend. |
| `comisiones_estado_cuenta` | (nadie en el frontend) | superadmin, tesoreria | — | Sin llamador en el frontend. |
| `comisiones_historial_tasas` | (nadie en el frontend) | superadmin, distribuidor | D (dudosa: D) | Sin llamador en el frontend; el backend admite distribuidor. DUDOSA (se incluye en distribuidor). Sin llamador en el frontend. |
| `comisiones_registrar_pago` | (nadie en el frontend) | superadmin, tesoreria | — | Sin llamador en el frontend. |
| `compromisos_pago_listar` | admin, cajero | superadmin, admin, cajero | AC |  |
| `confirmar_pago` | admin, cajero, familia, superadmin, soporte | superadmin, admin, cajero, familia | AC |  |
| `contador_listar_escuelas` | contador | superadmin, contador | T |  |
| `crear_cliente` | admin, cajero, control_escolar | superadmin, admin, cajero, control_escolar | AC |  |
| `crear_cobro` | admin, cajero | superadmin, admin, cajero, familia | AC |  |
| `crear_escuela` | superadmin | superadmin | — |  |
| `crear_familia` | superadmin, admin, control_escolar | superadmin, admin, control_escolar | A |  |
| `crear_gasto` | admin | superadmin, admin | A |  |
| `crear_plantel` | superadmin | superadmin, admin | A (dudosa: A) |  |
| `crear_producto` | admin | superadmin, admin | A |  |
| `crear_proveedor` | admin | superadmin, admin | A |  |
| `crear_usuario` | admin, cajero, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `crear_zona` | superadmin | superadmin | — |  |
| `descargar_cfdi` | admin, superadmin, familia | (inline, revisado) superadmin, admin, cajero, familia | A |  |
| `descargar_complemento_pago` | admin, superadmin, familia | (inline, revisado) superadmin, admin, cajero, familia | A |  |
| `descargar_contrato_firmado` | provision | superadmin, admin, provision | A (dudosa: A) |  |
| `descargar_documento_escuela` | contador, superadmin, provision, soporte | superadmin, admin, contador, provision | AT (dudosa: A) |  |
| `detalle_cobro` | admin, cajero, superadmin, familia | (sin guardia de rol) · valida escuela | AC | Sin requerir_rol: valida escuela y, para familia, que el cobro sea suyo. |
| `distribuidor_comisiones` | distribuidor | distribuidor | D |  |
| `distribuidor_datos` | distribuidor | distribuidor | D |  |
| `distribuidor_datos_pago` | distribuidor | distribuidor | D |  |
| `distribuidor_guardar_datos_pago` | distribuidor | distribuidor | D |  |
| `distribuidor_invitar_colegio` | distribuidor | distribuidor | D |  |
| `editar_cliente` | familia, admin, control_escolar | (inline, revisado) superadmin, admin, control_escolar, familia | A |  |
| `editar_escuela` | superadmin | superadmin | — |  |
| `editar_familia` | admin, control_escolar, superadmin, familia | (inline, revisado) superadmin, admin, control_escolar, familia | A |  |
| `editar_gasto` | admin | superadmin, admin | A |  |
| `editar_logo_escuela` | todos los roles | (inline, revisado) superadmin, admin | A | Guardia inline: superadmin o admin de esa escuela. |
| `editar_plantel` | superadmin | superadmin, admin | A (dudosa: A) |  |
| `editar_producto` | admin | superadmin, admin | A |  |
| `editar_proveedor` | admin | superadmin, admin | A |  |
| `editar_usuario` | todos los roles | (inline, revisado) cualquier rol autenticado | ACTD | Autoservicio (cualquier rol sobre su propio perfil); admin/superadmin sobre otros. |
| `editar_zona` | superadmin | superadmin | — |  |
| `eliminar_clabes_pool` | superadmin | superadmin, admin | A (dudosa: A) |  |
| `eliminar_escuela` | superadmin | superadmin | — |  |
| `eliminar_gasto` | admin | superadmin, admin | A |  |
| `eliminar_plantel` | superadmin | superadmin, admin | A (dudosa: A) |  |
| `eliminar_usuario` | admin, superadmin | superadmin, admin | A |  |
| `enviar_contrato_escuela` | provision | superadmin, provision | — |  |
| `enviar_factura_correo` | admin, cajero | (inline, revisado) superadmin, admin, cajero, familia | AC |  |
| `enviar_recordatorio_correo` | admin | superadmin, admin, cajero | A |  |
| `escolar_asistencia_guardar` | admin, control_escolar, direccion, superadmin | docente, superadmin, admin, control_escolar | A |  |
| `escolar_asistencia_obtener` | admin, control_escolar, direccion, superadmin | docente, superadmin, admin, control_escolar, direccion | A |  |
| `escolar_asistencia_reporte` | admin, control_escolar, direccion, superadmin | docente, superadmin, admin, control_escolar, direccion | A |  |
| `escolar_baja_alumno_grupo` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_boleta` | admin, control_escolar, direccion, superadmin, alumno | docente, familia, alumno, superadmin, admin, control_escolar, direccion | A |  |
| `escolar_buscar_alumnos` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_calificaciones_guardar` | admin, control_escolar, direccion, superadmin | docente, superadmin, admin, control_escolar | A |  |
| `escolar_calificaciones_obtener` | admin, control_escolar, direccion, superadmin | docente, superadmin, admin, control_escolar, direccion | A |  |
| `escolar_cargar_catalogo_grados` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_catalogos` | admin, control_escolar, direccion, superadmin | docente, superadmin, admin, control_escolar, direccion | A |  |
| `escolar_cerrar_ciclo` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_cerrar_periodo` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_familia_resumen` | familia | familia | — |  |
| `escolar_grupo_detalle` | admin, control_escolar, direccion, superadmin | docente, superadmin, admin, control_escolar, direccion | A |  |
| `escolar_guardar_aula` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_guardar_ciclo` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_guardar_grado` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_guardar_grupo` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_guardar_grupo_materia` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_guardar_horario` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_guardar_materia` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_horario_docente` | admin, control_escolar, direccion, superadmin | docente, superadmin, admin, control_escolar, direccion | A |  |
| `escolar_inscribir_alumnos` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_kardex` | admin, control_escolar, direccion, superadmin | familia, alumno, superadmin, admin, control_escolar, direccion | A |  |
| `escolar_mapear_grados` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_promover` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_publicar_periodo` | admin, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `escolar_resumen_grupo` | admin, control_escolar, direccion, superadmin | docente, superadmin, admin, control_escolar, direccion | A |  |
| `escuela_editar_propia` | admin | admin, superadmin | A |  |
| `escuela_generar_pago_renovacion` | admin, superadmin | superadmin, admin | A |  |
| `escuela_guardar_datos_pago` | admin | admin, superadmin | A |  |
| `escuela_obtener_datos_pago` | contador, admin, provision, superadmin, soporte | admin, superadmin, contador, provision | AT |  |
| `escuela_set_contrato_estado` | superadmin, provision | superadmin, provision | — |  |
| `familia_nota_cumplida` | admin, cajero | superadmin, admin, cajero | AC |  |
| `familia_nota_eliminar` | admin, cajero | superadmin, admin, cajero | AC |  |
| `familia_nota_guardar` | admin, cajero | superadmin, admin, cajero | AC |  |
| `familia_notas_listar` | admin, cajero | superadmin, admin, cajero | AC | Su guardia vive en notas_familia_autorizada() (NOTA_ROLES). |
| `generar_cfdi` | admin, superadmin, cajero | superadmin, admin, cajero | AC |  |
| `generar_clabe_individual` | admin, cajero, control_escolar, direccion, superadmin | superadmin, admin, cajero | AC |  |
| `generar_clabes_individual_masivo` | admin, cajero, control_escolar, direccion, superadmin | superadmin, admin | A |  |
| `generar_complemento_pago` | admin, superadmin | superadmin, admin, cajero | A |  |
| `generar_liga` | admin, cajero, familia | (sin guardia de rol) · valida escuela | AC | Sin requerir_rol: valida escuela; rama de familia comprueba propiedad. |
| `generar_referencia_efectivo` | admin, cajero, familia | (sin guardia de rol) · valida escuela | AC | Sin requerir_rol: valida escuela. |
| `guia_marcar_vista` | todos los roles | (inline, revisado) cualquier rol autenticado | ACTD | Autoservicio: cualquier usuario autenticado. |
| `importar_alumnos` | admin, cajero, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `importar_clabes` | superadmin | superadmin, admin | A (dudosa: A) |  |
| `iniciar_firma_cai` | (nadie en el frontend) | (inline, revisado) superadmin, admin, cajero, familia | AC (dudosa: A/C) | Sin llamador en el frontend (flujo de domiciliación en stand-by). DUDOSA. Sin llamador en el frontend. |
| `iniciar_pago_agrupado` | familia | (sin guardia de rol) · valida escuela | — | Sin requerir_rol: valida escuela; rama de familia comprueba propiedad. |
| `invitacion_crear` | superadmin, distribuidor, promotor | (inline, revisado) superadmin, admin, distribuidor, promotor | AD (dudosa: A) | Guardia inline: superadmin, admin, distribuidor, promotor. El admin no tiene pantalla para esto (PanelInvitaciones solo en Escuelas/Distribuidor/Promotor). |
| `invitacion_enviar` | público (sin sesión) | — | pública |  |
| `invitacion_generar_pago` | público (sin sesión) | — | pública |  |
| `invitacion_regenerar` | superadmin, distribuidor, promotor | (inline, revisado) superadmin, admin, distribuidor, promotor | AD (dudosa: A) | Ídem invitacion_crear. |
| `invitacion_resolver` | superadmin, distribuidor, promotor | (inline, revisado) superadmin | — |  |
| `invitacion_ver` | público (sin sesión) | — | pública |  |
| `invitaciones_listar` | superadmin, distribuidor, promotor | (inline, revisado) superadmin, admin, distribuidor, promotor | AD (dudosa: A) | Ídem invitacion_crear. |
| `liberar_clabe_individual` | (nadie en el frontend) | superadmin, admin | A (dudosa: A) | Solo la define CobroController y nadie la invoca. DUDOSA. |
| `liberar_clabe_pool` | admin, cajero, control_escolar, direccion, superadmin | superadmin, admin | A |  |
| `listar_clabes_pool` | superadmin | (sin guardia de rol) | — | SIN guardia de rol y solo la usa Escuelas.js (superadmin): hueco que cierra el modo estricto para admin/cajero. |
| `listar_cobros` | admin, cajero, superadmin | (sin guardia de rol) · valida escuela | AC | Sin requerir_rol: solo valida alcance por escuela y sección. |
| `listar_documentos_escuela` | contador, superadmin, admin, provision, soporte | superadmin, admin, contador, provision | AT |  |
| `listar_gastos` | admin, superadmin | (sin guardia de rol) · valida escuela | A | Sin requerir_rol: solo valida alcance por escuela y sección. |
| `listar_logs` | superadmin, soporte | superadmin, soporte | — |  |
| `listar_pagos_no_aplicados` | admin, cajero, superadmin | admin, superadmin, contador | A | requerir_rol admite contador pero su panel no la llama; solo Cobros.js (admin/cajero). DUDOSA para contador. |
| `listar_usuarios` | admin, control_escolar, superadmin | (sin guardia de rol) | A | SIN guardia de rol: la rama final entrega el equipo del colegio a CUALQUIER rol con escuela_id (p. ej. cajero). Su UI solo la usan admin y control_escolar (Alumnos.js la pide con puedeAccesoAlumno). Hueco que cierra el modo estricto. |
| `listar_zonas` | superadmin, admin, control_escolar | (sin guardia de rol) | A | SIN guardia de rol; Usuarios.js (admin en "Mi equipo") la pide. |
| `login` | público (sin sesión) | — | pública |  |
| `mantenimiento_activar` | superadmin | superadmin | — |  |
| `mantenimiento_desactivar` | superadmin | superadmin | — |  |
| `mantenimiento_estado` | superadmin | superadmin | — |  |
| `marcar_cheque_rebotado` | admin, cajero | superadmin, admin, cajero | AC |  |
| `marcar_recordatorio` | admin | superadmin, admin | A |  |
| `monedero_activar` | admin, cajero | admin, superadmin | A |  |
| `monedero_ajuste` | admin, cajero | admin, superadmin | A |  |
| `monedero_config_guardar` | familia | familia, admin | A (dudosa: A) |  |
| `monedero_movimientos` | alumno, familia | familia, alumno, admin, cajero, superadmin | A (dudosa: A) |  |
| `monedero_recarga_caja` | admin, cajero | admin, cajero | AC |  |
| `monedero_recargar` | familia | familia, admin | A (dudosa: A) |  |
| `monedero_reporte` | admin, cajero | admin, superadmin | A |  |
| `monedero_saldo` | alumno, familia | familia, alumno, admin, cajero, superadmin | A (dudosa: A) |  |
| `planteles_de_escuela` | superadmin | superadmin, admin | A (dudosa: A) |  |
| `producto_alcance_vista_previa` | admin, superadmin | superadmin, admin | A |  |
| `provision_asignar_id` | provision | superadmin, provision | — |  |
| `provision_listar_pendientes` | provision | superadmin, provision | — |  |
| `recuperar_password_solicitar` | público (sin sesión) | — | pública |  |
| `reenviar_credenciales` | admin, cajero, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `renovar_suscripcion` | superadmin | superadmin | — |  |
| `resolver_pago_no_aplicado` | admin, cajero, superadmin | admin, superadmin, contador | A | Igual que listar_pagos_no_aplicados: contador admitido en backend, sin pantalla. DUDOSA para contador. |
| `revisar_documento_escuela` | superadmin, provision | superadmin, provision | — |  |
| `simular_spei` | (nadie en el frontend) | superadmin | — | Sin llamador en el frontend. |
| `subir_comprobante_gasto` | admin | superadmin, admin | A |  |
| `subir_contrato_firmado` | admin | superadmin, admin | A |  |
| `subir_documento_escuela` | admin | superadmin, admin | A |  |
| `subir_foto_cliente` | admin, control_escolar, familia | superadmin, admin, familia, control_escolar | A |  |
| `superadmin_editar_referido` | superadmin | superadmin | — |  |
| `superadmin_listar_referidos` | superadmin | superadmin | — |  |
| `superadmin_toggle_metodo_escuela` | superadmin | superadmin | — |  |
| `superadmin_toggle_metodo_global` | superadmin | superadmin | — |  |
| `superadmin_toggle_modo_demo` | superadmin | superadmin | — |  |
| `superadmin_toggle_seccion_escuela` | superadmin | superadmin | — |  |
| `superadmin_toggle_seccion_global` | superadmin | superadmin | — |  |
| `suscripcion_pagos_listar` | admin, superadmin, soporte | superadmin, admin, soporte | A |  |
| `tendencia_cobranza` | admin, cajero, superadmin, soporte | (sin guardia de rol) · valida escuela | AC | Sin requerir_rol: solo valida alcance por escuela. |
| `tesoreria_cuentas_por_pagar` | tesoreria | superadmin, tesoreria | — |  |
| `tesoreria_marcar_pagado` | tesoreria | superadmin, tesoreria | — |  |
| `tienda_buscar_alumno` | admin, cajero, tienda | tienda, admin, cajero | AC |  |
| `tienda_cancelar_venta` | tienda, admin | tienda, admin | A |  |
| `tienda_producto_guardar` | admin, cajero | admin | A |  |
| `tienda_productos_listar` | admin, cajero, tienda | tienda, admin | A |  |
| `tienda_vender` | tienda, admin | tienda, admin | A |  |
| `tienda_ventas_dia` | tienda, admin | tienda, admin | A |  |
| `toggle_cliente_activo` | admin, control_escolar | superadmin, admin, control_escolar | A |  |
| `toggle_escuela` | superadmin | superadmin | — |  |
| `toggle_plantel` | superadmin | superadmin, admin | A (dudosa: A) |  |
| `toggle_producto_activo` | admin | superadmin, admin | A |  |
| `toggle_proveedor_activo` | admin | superadmin, admin | A |  |
| `toggle_usuario` | admin, cajero, control_escolar, direccion, superadmin | superadmin, admin, control_escolar | A |  |
| `verificar_saldo_alumno` | familia | (sin guardia de rol) · valida escuela | — | Sin requerir_rol: valida escuela; rama de familia comprueba propiedad. |
| `verificar_spei` | admin, cajero, familia, superadmin, soporte | (sin guardia de rol) · valida escuela | AC | Sin requerir_rol: valida escuela; rama de familia comprueba propiedad. |

_204 acciones._
