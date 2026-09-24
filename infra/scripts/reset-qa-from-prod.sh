#!/usr/bin/env bash
# /opt/vps-tools/reset-qa-from-prod.sh <app> [--yes] [--if-prod-exists]
# Reemplaza la BD de QA por una COPIA SANEADA de PRODUCCIÓN. Dirección FIJA: lee de <app>_prod_db y
# escribe en <app>_qa_db; no hay forma de invertirla con argumentos. Verifica ambos lados antes de tocar nada.
#
# Lo corre el CI en cada push a `qa` (gitflow: qa = probar con datos reales de PDN), ANTES de migrate.sh:
# así cada migración nueva se prueba contra una copia real de producción.
#   --yes             sin confirmación interactiva (CI)
#   --if-prod-exists  si PDN todavía no existe (primeros deploys de QA), avisa y sale con 0 sin tocar QA
#
# Saneo: (1) genérico — tokens de push y de sesión en NULL (una prueba de push en QA llegaría a
# dispositivos reales de PDN); (2) propio de la app — /opt/<app>/qa/qa-sanitize.sql si existe
# (lo sincroniza el CI desde database/qa-sanitize.sql: p.ej. apagar integraciones que escriben a clientes).
set -euo pipefail
APP="${1:?uso: reset-qa-from-prod.sh <app> [--yes] [--if-prod-exists]}"
shift
YES=0; IF_PROD=0
for a in "$@"; do
  case "$a" in
    --yes) YES=1 ;;
    --if-prod-exists) IF_PROD=1 ;;
    *) echo "[reset] opción desconocida: $a" >&2; exit 1 ;;
  esac
done
source "$(dirname "$0")/db-guard.sh"

if [ ! -f "${VPS_OPT_ROOT:-/opt}/$APP/production/.env" ]; then
  if [ "$IF_PROD" = 1 ]; then echo "[reset] PDN de $APP aún no existe: QA conserva su BD."; exit 0; fi
  echo "[reset] no existe PDN de $APP" >&2; exit 97
fi

assert_env "$APP" production
SRC_C="$GUARD_DB_CONTAINER"; SRC_DB="$GUARD_DB_NAME"
assert_env "$APP" qa
DST_C="$GUARD_DB_CONTAINER"; DST_DB="$GUARD_DB_NAME"; QA_ROOT="$GUARD_ROOT"

[ "$SRC_DB" != "$DST_DB" ] && [ "$SRC_C" != "$DST_C" ] || { echo "[reset] origen y destino coinciden, abortando" >&2; exit 98; }
[[ "$DST_DB" == *_qa_db ]] || { echo "[reset] el destino $DST_DB no es de QA, abortando" >&2; exit 99; }
[[ "$SRC_DB" != *_qa_db ]] || { echo "[reset] el origen $SRC_DB parece de QA, abortando" >&2; exit 99; }

if [ "$YES" != 1 ]; then
  read -r -p "Se REEMPLAZA $DST_DB ($DST_C) con $SRC_DB ($SRC_C). Escribe el nombre de la app para confirmar: " ans
  [ "$ans" = "$APP" ] || { echo "cancelado"; exit 1; }
fi

# SQL por stdin dentro del contenedor: la contraseña nunca pasa por argv ni sale del servidor.
sql_in() { timeout 900 docker exec -i "$1" sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mariadb -uroot -N --default-character-set=utf8mb4 "$MYSQL_DATABASE"'; }

# 1. Volcar a archivo y validarlo ANTES de tocar QA: un volcado cortado a mitad dejaría QA a medias
#    (con el pipe directo de la versión anterior, un error del dump ya había vaciado tablas de QA).
umask 077
DUMP="$(mktemp /tmp/reset-qa-XXXXXX.sql)"
trap 'rm -f "$DUMP"' EXIT
echo "[reset] volcando $SRC_C/$SRC_DB"
timeout 900 docker exec "$SRC_C" sh -c \
  'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mariadb-dump -uroot --single-transaction --routines --triggers --events --default-character-set=utf8mb4 "$MYSQL_DATABASE"' > "$DUMP"
[ -s "$DUMP" ]                                     || { echo "[reset] volcado vacío, QA intacta" >&2; exit 1; }
tail -n 3 "$DUMP" | grep -q 'Dump completed'       || { echo "[reset] volcado incompleto, QA intacta" >&2; exit 1; }
grep -q 'CREATE TABLE `schema_migrations`' "$DUMP" || { echo "[reset] el volcado no trae schema_migrations, QA intacta" >&2; exit 1; }

# 2. Importar (schema_migrations viaja con el volcado: migrate.sh aplica después solo lo nuevo).
echo "[reset] importando en $DST_C/$DST_DB"
sql_in "$DST_C" < "$DUMP"

# 3. Saneo genérico: toda columna de tokens de push o de sesión, en cualquier tabla.
echo "SELECT CONCAT('UPDATE \`', TABLE_NAME, '\` SET \`', COLUMN_NAME, '\` = NULL;') FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('fcm_token', 'auth_token_hash', 'auth_token', 'id_token') AND IS_NULLABLE = 'YES';" \
  | sql_in "$DST_C" | sql_in "$DST_C"

# 4. Saneo propio de la app (opcional; LegacyChats apaga líneas de WhatsApp y pausa campañas).
if [ -f "$QA_ROOT/qa-sanitize.sql" ]; then
  echo "[reset] aplicando qa-sanitize.sql"
  sql_in "$DST_C" < "$QA_ROOT/qa-sanitize.sql"
fi

echo "[reset] tablas: prod=$(echo 'SHOW TABLES' | sql_in "$SRC_C" | wc -l) qa=$(echo 'SHOW TABLES' | sql_in "$DST_C" | wc -l)"
echo "[reset] listo: QA es una copia saneada de PDN."
