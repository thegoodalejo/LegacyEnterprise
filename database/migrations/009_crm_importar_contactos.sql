-- 009_crm_importar_contactos.sql — CRM: importar contactos (Personas u Organizaciones) desde Excel/CSV, por lotes revertibles.
-- Idempotente. Diseño y decisiones: docs/modulos/crm.md («Importar contactos»).
--
-- Reutiliza los lotes y las plantillas de la importación de ventas (migración 006): crm_importaciones y crm_import_plantillas ganan el tipo
-- «contactos». Cada contacto creado por una importación guarda su lote (crm_contactos.id_importacion) para poder revertirla: revertir ARCHIVA
-- (activo = 0, restaurable) los contactos que ese lote creó; los que solo actualizó no se tocan.

-- ─── Lotes: tipo y contadores de contactos ─────────────────────────────────────────────────────────────────────────
ALTER TABLE crm_importaciones MODIFY tipo ENUM('ventas','contactos') NOT NULL DEFAULT 'ventas';
ALTER TABLE crm_importaciones
  ADD COLUMN IF NOT EXISTS contactos_nuevos       INT UNSIGNED NOT NULL DEFAULT 0 AFTER items_creados,        -- creados del tipo importado
  ADD COLUMN IF NOT EXISTS contactos_actualizados INT UNSIGNED NOT NULL DEFAULT 0 AFTER contactos_nuevos,     -- ya existían y cambió algo
  ADD COLUMN IF NOT EXISTS contactos_omitidos     INT UNSIGNED NOT NULL DEFAULT 0 AFTER contactos_actualizados, -- ya existían y quedaron igual
  ADD COLUMN IF NOT EXISTS personas_creadas       INT UNSIGNED NOT NULL DEFAULT 0 AFTER contactos_omitidos,   -- personas de referencia creadas (organizaciones)
  ADD COLUMN IF NOT EXISTS vinculos_creados       INT UNSIGNED NOT NULL DEFAULT 0 AFTER personas_creadas;     -- vínculos persona ↔ organización nuevos
ALTER TABLE crm_importaciones ADD INDEX IF NOT EXISTS idx_crm_imp_tipo (id_sede, tipo, created_at);

-- ─── Plantillas de mapeo: también para contactos ───────────────────────────────────────────────────────────────────
ALTER TABLE crm_import_plantillas MODIFY tipo ENUM('ventas','contactos') NOT NULL DEFAULT 'ventas';

-- ─── Contactos: de qué lote vinieron ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE crm_contactos ADD COLUMN IF NOT EXISTS id_importacion BIGINT UNSIGNED NULL AFTER id_responsable;
ALTER TABLE crm_contactos ADD INDEX IF NOT EXISTS idx_crm_c_imp (id_importacion);
ALTER TABLE crm_contactos ADD CONSTRAINT fk_crm_c_imp FOREIGN KEY IF NOT EXISTS (id_importacion) REFERENCES crm_importaciones(id) ON DELETE SET NULL;
