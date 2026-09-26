-- 015_comunicaciones_webhook_linea.sql — Comunicaciones: a dónde manda Meta los eventos de cada número.
-- Idempotente. Diseño: docs/modulos/comunicaciones.md → «Convivencia con LegacyChats».
--
-- Meta permite un webhook alterno por número (prioridad número → WABA → app). Con eso una línea puede recibir aquí sus mensajes aunque la URL
-- de la app de Meta siga siendo la de otro sistema (LegacyChats, mientras convivan). Se guarda lo último que Meta reportó para mostrarlo.

ALTER TABLE com_lineas
  ADD COLUMN IF NOT EXISTS webhook_numero      VARCHAR(500) NULL COMMENT 'URL alterna del número según Meta (NULL = usa la de la WABA o la de la app)' AFTER suscrita_at,
  ADD COLUMN IF NOT EXISTS webhook_efectivo    VARCHAR(500) NULL COMMENT 'URL a la que Meta manda hoy los mensajes de este número' AFTER webhook_numero,
  ADD COLUMN IF NOT EXISTS webhook_revisado_at DATETIME     NULL AFTER webhook_efectivo;
