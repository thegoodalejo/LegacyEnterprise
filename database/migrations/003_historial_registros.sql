-- 003_historial_registros.sql — historial genérico de cambios de registros de negocio (cualquier módulo).
-- Idempotente. Complementa a le_H_admin (acciones sensibles de plataforma): esta guarda "quién cambió qué y cuándo"
-- de un registro puntual (un contacto del CRM, luego una cita, un pedido…) para mostrarlo en su perfil.
--
-- Es solo de inserción: una fila nunca se modifica, por eso lleva created_at y no updated_at.
-- Convención: (modulo, tabla, id_registro) identifica el registro; el historial de un contacto incluye también lo de
-- sus tags, vínculos y campos personalizados bajo el mismo id_registro (una sola consulta por índice).
-- Sin FKs, igual que le_H_admin: el historial no debe impedir ni arrastrar borrados de otras tablas.
-- detalle (JSON): {"cambios":[{"campo":"telefono","antes":"…","despues":"…"}], "lote":"<uuid>"} — lote solo en acciones masivas.

CREATE TABLE IF NOT EXISTS le_H_registros (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede      INT UNSIGNED    NOT NULL,
  modulo       VARCHAR(30)     NOT NULL,                -- código de módulo: crm, agenda…
  tabla        VARCHAR(60)     NOT NULL,                -- ej. crm_contactos
  id_registro  BIGINT UNSIGNED NOT NULL,
  id_usuario   INT UNSIGNED    NOT NULL,                -- quién hizo la acción
  accion       VARCHAR(40)     NOT NULL,                -- ej. creado, actualizado, archivado, tag_agregado
  detalle      JSON            NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_le_hreg_registro (modulo, tabla, id_registro, created_at),
  KEY idx_le_hreg_sede (id_sede, created_at),
  KEY idx_le_hreg_usuario (id_usuario, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
