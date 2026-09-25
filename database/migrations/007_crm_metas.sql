-- 007_crm_metas.sql — CRM fase C: metas paramétricas (qué se mide, cuánto, de quién y en qué período) con avance calculado.
-- Idempotente. Diseño y decisiones: docs/modulos/crm.md («Metas»).
--
-- Una MÉTRICA (por empresa) dice QUÉ se mide: una fuente fija de la app (ventas en dinero, unidades, número de ventas, clientes con compra,
-- oportunidades ganadas en valor o en número, oportunidades nuevas), opcionalmente filtrada a un ítem o a una categoría del catálogo.
-- Así cada nicho mide lo suyo: «Ventas» y «Galones de vinilo» en pinturas, «Tratamientos realizados» en una clínica, «Mantenimientos» en plantas.
-- Una META dice CUÁNTO de esa métrica, en un PERÍODO (mes, trimestre, semestre, año o fechas propias) y para un ÁMBITO:
--   empresa      → suma todas las sedes de la empresa (única excepción al aislamiento por sede: se muestra solo el total);
--   sede         → la sede de la sesión;
--   organizacion → una Organización de la sede y las que dependen de ella (un grupo suma sus puntos de venta).
-- El avance (real, porcentaje, esperado a la fecha, estado) NO se guarda: se calcula al consultar desde ventas y oportunidades.
-- Nada se borra: métricas y metas se desactivan (activo = 0) y se pueden restaurar.
-- Auditoría en todas las tablas: created_at/updated_at + created_by/updated_by (FK a le_usuarios, ON DELETE SET NULL).

-- ─── Métricas (por empresa) ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_metricas (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa    INT UNSIGNED NOT NULL,
  nombre        VARCHAR(80)  NOT NULL,
  fuente        ENUM('ventas_valor','ventas_unidades','ventas_numero','clientes_compra',
                     'oportunidades_ganadas_valor','oportunidades_ganadas_numero','oportunidades_creadas') NOT NULL,
  id_item       INT UNSIGNED NULL,                                 -- filtro opcional: solo este ítem del catálogo…
  id_categoria  INT UNSIGNED NULL,                                 -- …o solo esta categoría (uno u otro, nunca ambos)
  unidad        VARCHAR(30)  NULL,                                 -- texto tras los números (galones, servicios, pacientes…); no aplica a montos
  descripcion   VARCHAR(255) NULL,
  orden         SMALLINT     NOT NULL DEFAULT 0,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    INT UNSIGNED NULL,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by    INT UNSIGNED NULL,
  UNIQUE KEY uq_crm_mtr_nombre (id_empresa, nombre),
  CONSTRAINT fk_crm_mtr_empresa FOREIGN KEY (id_empresa)   REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_mtr_item    FOREIGN KEY (id_item)      REFERENCES crm_catalogo_items(id),
  CONSTRAINT fk_crm_mtr_cat     FOREIGN KEY (id_categoria) REFERENCES crm_catalogo_categorias(id),
  CONSTRAINT fk_crm_mtr_cby     FOREIGN KEY (created_by)   REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_mtr_uby     FOREIGN KEY (updated_by)   REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Metas ──────────────────────────────────────────────────────────────────────────────────────────────────────────
-- id_sede: la sede de la meta de sede o de la organización (NULL en las de empresa). fecha_inicio/fecha_fin: el período ya resuelto
-- (la app los normaliza: un «mes» siempre va del 1 al último día). ambito_ref identifica al dueño de la meta dentro de su ámbito, para que
-- no haya dos metas iguales (misma métrica, mismo dueño, mismo período); una meta eliminada conserva su fila y se reactiva si se vuelve a crear.
CREATE TABLE IF NOT EXISTS crm_metas (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa    INT UNSIGNED    NOT NULL,
  id_metrica    INT UNSIGNED    NOT NULL,
  ambito        ENUM('empresa','sede','organizacion') NOT NULL,
  id_sede       INT UNSIGNED    NULL,
  id_contacto   BIGINT UNSIGNED NULL,                              -- la Organización (solo ámbito organizacion)
  periodo       ENUM('mes','trimestre','semestre','anio','personalizado') NOT NULL,
  fecha_inicio  DATE            NOT NULL,
  fecha_fin     DATE            NOT NULL,
  valor_meta    DECIMAL(18,4)   NOT NULL,
  nota          VARCHAR(255)    NULL,
  activo        TINYINT(1)      NOT NULL DEFAULT 1,
  ambito_ref    BIGINT UNSIGNED AS (COALESCE(id_contacto, id_sede, 0)) PERSISTENT,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    INT UNSIGNED    NULL,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by    INT UNSIGNED    NULL,
  UNIQUE KEY uq_crm_meta (id_empresa, id_metrica, ambito, ambito_ref, fecha_inicio, fecha_fin),
  KEY idx_crm_meta_sede     (id_sede, fecha_inicio, fecha_fin),
  KEY idx_crm_meta_empresa  (id_empresa, ambito, fecha_inicio, fecha_fin),
  KEY idx_crm_meta_contacto (id_contacto),
  CONSTRAINT fk_crm_meta_empresa  FOREIGN KEY (id_empresa)  REFERENCES le_empresas(id),
  CONSTRAINT fk_crm_meta_metrica  FOREIGN KEY (id_metrica)  REFERENCES crm_metricas(id),
  CONSTRAINT fk_crm_meta_sede     FOREIGN KEY (id_sede)     REFERENCES le_sedes(id),
  CONSTRAINT fk_crm_meta_contacto FOREIGN KEY (id_contacto) REFERENCES crm_contactos(id),
  CONSTRAINT fk_crm_meta_cby      FOREIGN KEY (created_by)  REFERENCES le_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_meta_uby      FOREIGN KEY (updated_by)  REFERENCES le_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- «Oportunidades ganadas» filtra por fecha de cierre real dentro de la sede: índice para no recorrer todas las ganadas.
ALTER TABLE crm_oportunidades ADD INDEX IF NOT EXISTS idx_crm_op_cierre_real (id_sede, estado, fecha_cierre_real);
