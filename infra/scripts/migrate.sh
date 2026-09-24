#!/usr/bin/env bash
# /opt/vps-tools/migrate.sh <app> <production|qa>
# Aplica en orden los /opt/<app>/<env>/migrations/*.sql que no estén en schema_migrations.
# Lo corre el CI después del rsync y antes de recargar Apache. Idempotente: sin pendientes, no hace nada.
set -euo pipefail
source "$(dirname "$0")/db-guard.sh"
assert_env "$1" "$2"

MIG_DIR="$GUARD_ROOT/migrations"
[ -d "$MIG_DIR" ] || { echo "[migrate] sin carpeta $MIG_DIR, nada que hacer"; exit 0; }

sql() {  # SQL por stdin; contraseña dentro del contenedor, nunca en argv
  timeout 300 docker exec -i "$GUARD_DB_CONTAINER" sh -c \
    'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mariadb -uroot --default-character-set=utf8mb4 -N "$MYSQL_DATABASE"'
}

echo "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(191) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;" | sql
applied=$(echo "SELECT version FROM schema_migrations;" | sql)

count=0
for f in $(ls -1 "$MIG_DIR"/*.sql 2>/dev/null | sort); do
  v=$(basename "$f")
  if grep -qxF "$v" <<<"$applied"; then continue; fi
  echo "[migrate] aplicando $v"
  if ! sql < "$f"; then
    echo "[migrate] FALLÓ $v — se detiene (las anteriores quedaron aplicadas)" >&2
    exit 1
  fi
  echo "INSERT INTO schema_migrations (version) VALUES ('$v');" | sql
  count=$((count + 1))
done
echo "[migrate] $count migración(es) aplicada(s) en ${GUARD_DB_NAME}"
