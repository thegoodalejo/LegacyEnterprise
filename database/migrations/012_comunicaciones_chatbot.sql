-- 012_comunicaciones_chatbot.sql — Comunicaciones (E3): flujos del chatbot y sus palabras de activación.
-- Idempotente. Diseño: docs/modulos/comunicaciones.md → «Chatbot».
--
-- El grafo de cada flujo (nodos con posición y datos + conexiones por puerto) se guarda entero en JSON: el editor lo guarda de una vez y el
-- servidor lo valida con una sola función (_com_bot.php). Los disparadores van en tabla porque se consultan entre flujos.

CREATE TABLE IF NOT EXISTS com_flujos (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_sede      INT UNSIGNED    NOT NULL,
  nombre       VARCHAR(100)    NOT NULL,
  descripcion  VARCHAR(255)    NULL,
  activo       TINYINT(1)      NOT NULL DEFAULT 0,      -- encendido: responde a sus disparadores (y se puede saltar a él)
  borrado      TINYINT(1)      NOT NULL DEFAULT 0,      -- eliminado (lógico)
  grafo        LONGTEXT        NOT NULL CHECK (JSON_VALID(grafo)),
  version      INT UNSIGNED    NOT NULL DEFAULT 1,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by   INT UNSIGNED    NULL,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by   INT UNSIGNED    NULL,
  KEY idx_com_flujo_sede (id_sede, borrado, activo),
  CONSTRAINT fk_com_flujo_sede FOREIGN KEY (id_sede)    REFERENCES le_sedes(id),
  CONSTRAINT fk_com_flujo_cby  FOREIGN KEY (created_by) REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_com_flujo_uby  FOREIGN KEY (updated_by) REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Palabras de activación: exacta (el mensaje completo), empieza (primeras palabras) o contiene (palabra o frase completa en cualquier parte).
-- texto_norm = sin tildes, minúsculas y sin signos (comNormalizar). Gana la mayor prioridad; luego exacta > empieza > contiene y el texto más largo.
CREATE TABLE IF NOT EXISTS com_flujo_disparadores (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_flujo    BIGINT UNSIGNED NOT NULL,
  id_sede     INT UNSIGNED    NOT NULL,
  tipo        ENUM('exacta','empieza','contiene') NOT NULL DEFAULT 'exacta',
  texto       VARCHAR(100)    NOT NULL,
  texto_norm  VARCHAR(100)    NOT NULL,
  prioridad   SMALLINT        NOT NULL DEFAULT 0,
  id_linea    INT UNSIGNED    NULL,                     -- solo en esa línea (NULL = todas las de la sede)
  KEY idx_com_disp_sede (id_sede, texto_norm),
  KEY idx_com_disp_flujo (id_flujo),
  CONSTRAINT fk_com_disp_flujo FOREIGN KEY (id_flujo) REFERENCES com_flujos(id) ON DELETE CASCADE,
  CONSTRAINT fk_com_disp_linea FOREIGN KEY (id_linea) REFERENCES com_lineas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE com_config_sede ADD CONSTRAINT fk_com_cfg_flujo FOREIGN KEY IF NOT EXISTS (id_flujo_respaldo) REFERENCES com_flujos(id) ON DELETE SET NULL;
ALTER TABLE com_conversaciones ADD CONSTRAINT fk_com_conv_flujo FOREIGN KEY IF NOT EXISTS (id_flujo) REFERENCES com_flujos(id) ON DELETE SET NULL;
