#!/usr/bin/env bash
# /opt/vps-tools/db-guard.sh — guardia compartida para cualquier script que escriba en una BD.
# Uso (con source):
#   source /opt/vps-tools/db-guard.sh
#   assert_env <app> <production|qa>
# Deja exportadas: GUARD_ROOT, GUARD_DB_CONTAINER, GUARD_PHP_CONTAINER, GUARD_DB_NAME
# Aborta si CUALQUIER señal del entorno no coincide: .env, DB_NAME, contenedor, labels, buckets.

assert_env() {
  local app="$1" env="$2" short
  case "$env" in
    production) short=prod ;;
    qa)         short=qa ;;
    *) echo "[guard] entorno inválido: '$env' (production|qa)" >&2; exit 90 ;;
  esac
  [[ "$app" =~ ^[a-z][a-z0-9]{1,19}$ ]] || { echo "[guard] app inválida: '$app'" >&2; exit 90; }

  local root="${VPS_OPT_ROOT:-/opt}/$app/$env"   # VPS_OPT_ROOT solo para pruebas fuera del servidor
  local envfile="$root/.env"
  [ -f "$envfile" ] || { echo "[guard] no existe $envfile" >&2; exit 91; }

  local app_env db_name bucket
  app_env=$(grep -E '^APP_ENV=' "$envfile" | cut -d= -f2-)
  db_name=$(grep -E '^DB_NAME=' "$envfile" | cut -d= -f2-)
  bucket=$(grep -E '^R2_BUCKET=' "$envfile" | cut -d= -f2-)

  [ "$app_env" = "$env" ] || { echo "[guard] APP_ENV=$app_env en $envfile, se esperaba $env" >&2; exit 92; }
  [ "$db_name" = "${app}_${short}_db" ] || { echo "[guard] DB_NAME=$db_name, se esperaba ${app}_${short}_db" >&2; exit 93; }
  if [ -n "$bucket" ]; then
    if [ "$short" = qa ] && [[ "$bucket" == *-prod* ]]; then echo "[guard] QA apunta a bucket de PDN ($bucket)" >&2; exit 94; fi
    if [ "$short" = prod ] && [[ "$bucket" != *-prod* ]]; then echo "[guard] PDN apunta a bucket no-PDN ($bucket)" >&2; exit 94; fi
  fi

  local dbc="${app}_db_${short}" phpc="${app}_php_${short}"
  local label
  label=$(timeout 10 docker inspect "$dbc" --format '{{ index .Config.Labels "com.docker.compose.project" }}' 2>/dev/null) \
    || { echo "[guard] no existe el contenedor $dbc" >&2; exit 95; }
  [ "$label" = "${app}_${env}" ] || { echo "[guard] $dbc pertenece al proyecto '$label', no a ${app}_${env}" >&2; exit 96; }

  # La BD real dentro del contenedor debe ser la esperada.
  local real
  real=$(echo 'SELECT DATABASE();' | timeout 15 docker exec -i "$dbc" sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mariadb -uroot -N "$MYSQL_DATABASE"' 2>/dev/null || true)
  [ "$real" = "$db_name" ] || { echo "[guard] la BD $db_name no existe en $dbc" >&2; exit 97; }

  export GUARD_ROOT="$root" GUARD_DB_CONTAINER="$dbc" GUARD_PHP_CONTAINER="$phpc" GUARD_DB_NAME="$db_name"
  echo "[guard] OK → $app $env ($dbc / $db_name)"
}
