-- migracion_2026_08_28_autorizacion_firmada_cai.sql
--
-- Corre esto UNA VEZ en phpMyAdmin antes de usar el código que la acompaña.
--
-- Motivo: Cobroscontarjeta.com (o el banco emisor) rechaza domiciliaciones
-- autorizadas solo con un checkbox de "acepto términos y condiciones" — piden
-- una autorización firmada de verdad (autógrafa o por una plataforma de firma
-- electrónica legalmente válida, ej. DocuSign). Estas columnas rastrean ese
-- proceso de firma por alumno, independiente de token_tarjeta_estado (que
-- solo dice si HAY una tarjeta guardada, no si su uso para cargos automáticos
-- está autorizado por escrito).

ALTER TABLE clientes
  ADD COLUMN autorizacion_cai_estado ENUM('sin_solicitar','enviada','firmada','rechazada')
      NOT NULL DEFAULT 'sin_solicitar' AFTER token_tarjeta_tipo,
  ADD COLUMN autorizacion_cai_envelope_id  VARCHAR(100) NULL AFTER autorizacion_cai_estado,
  ADD COLUMN autorizacion_cai_fecha_envio  DATETIME     NULL AFTER autorizacion_cai_envelope_id,
  ADD COLUMN autorizacion_cai_fecha_firma  DATETIME     NULL AFTER autorizacion_cai_fecha_envio,
  ADD COLUMN autorizacion_cai_documento_url VARCHAR(500) NULL AFTER autorizacion_cai_fecha_firma;
