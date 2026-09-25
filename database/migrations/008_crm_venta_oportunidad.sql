-- 008_crm_venta_oportunidad.sql — CRM: una venta puede venir de una oportunidad ganada («Registrar venta» desde la oportunidad).
-- Idempotente. Diseño y decisiones: docs/modulos/crm.md («Ventas → Venta desde una oportunidad ganada»).
--
-- id_oportunidad: la oportunidad ganada de la que se registró la venta. Regla de la app (no UNIQUE, porque una venta anulada o reemplazada
-- conserva el vínculo): como mucho UNA venta ACTIVA por oportunidad. Si una importación con «reemplazar» desactiva esa venta, el vínculo pasa
-- a la venta importada que la reemplaza. ON DELETE SET NULL por simetría con el resto (las oportunidades no se borran: se archivan).

ALTER TABLE crm_ventas ADD COLUMN IF NOT EXISTS id_oportunidad BIGINT UNSIGNED NULL AFTER id_importacion;
ALTER TABLE crm_ventas ADD INDEX IF NOT EXISTS idx_crm_ven_op (id_oportunidad, activo);
ALTER TABLE crm_ventas ADD CONSTRAINT fk_crm_ven_op FOREIGN KEY IF NOT EXISTS (id_oportunidad) REFERENCES crm_oportunidades(id) ON DELETE SET NULL;
