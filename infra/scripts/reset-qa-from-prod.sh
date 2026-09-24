#!/usr/bin/env bash
# /opt/vps-tools/reset-qa-from-prod.sh <app> [--yes]
# Copia la BD de PRODUCCIÓN sobre la de QA. Dirección FIJA: lee de <app>_prod_db, escribe en <app>_qa_db.
# No hay forma de invertirla con argumentos. Verifica ambos lados antes de tocar nada.
set -euo pipefail
APP="${1:?uso: reset-qa-from-prod.sh <app> [--yes]}"
YES="${2:-}"
source "$(dirname "$0")/db-guard.sh"

assert_env "$APP" production
SRC_C="$GUARD_DB_CONTAINER"; SRC_DB="$GUARD_DB_NAME"
assert_env "$APP" qa
DST_C="$GUARD_DB_CONTAINER"; DST_DB="$GUARD_DB_NAME"

[ "$SRC_DB" != "$DST_DB" ] && [ "$SRC_C" != "$DST_C" ] || { echo "[reset] origen y destino coinciden, abortando" >&2; exit 98; }
[[ "$DST_DB" == *_qa_db ]] || { echo "[reset] el destino $DST_DB no es de QA, abortando" >&2; exit 99; }

if [ "$YES" != "--yes" ]; then
  read -r -p "Se REEMPLAZA $DST_DB ($DST_C) con $SRC_DB ($SRC_C). Escribe el nombre de la app para confirmar: " ans
  [ "$ans" = "$APP" ] || { echo "cancelado"; exit 1; }
fi

echo "[reset] $SRC_C/$SRC_DB → $DST_C/$DST_DB"
timeout 900 docker exec "$SRC_C" sh -c \
  'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mariadb-dump -uroot --single-transaction --routines --triggers --events --default-character-set=utf8mb4 "$MYSQL_DATABASE"' \
| timeout 900 docker exec -i "$DST_C" sh -c \
  'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mariadb -uroot --default-character-set=utf8mb4 "$MYSQL_DATABASE"'

echo "[reset] conteo de tablas: prod=$(echo 'SHOW TABLES' | docker exec -i "$SRC_C" sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mariadb -uroot -N "$MYSQL_DATABASE"' | wc -l) qa=$(echo 'SHOW TABLES' | docker exec -i "$DST_C" sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mariadb -uroot -N "$MYSQL_DATABASE"' | wc -l)"
# Los tokens de push copiados son de dispositivos REALES: una prueba de push en QA les llegaría a
# usuarios de producción. Se limpian en toda tabla que tenga la columna fcm_token.
echo "SELECT CONCAT('UPDATE \`', TABLE_NAME, '\` SET fcm_token = NULL;') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'fcm_token';" \
  | docker exec -i "$DST_C" sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mariadb -uroot -N "$MYSQL_DATABASE"' \
  | docker exec -i "$DST_C" sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mariadb -uroot "$MYSQL_DATABASE"'
echo "[reset] listo (fcm_token limpiado en QA)."
