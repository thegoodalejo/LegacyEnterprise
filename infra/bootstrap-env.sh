#!/usr/bin/env bash
# =============================================================================
# Primer despliegue MANUAL de un entorno de LegacyEnterprise en legacy-vps (Fase 3). Después lo hace el CI.
# Se corre desde la raíz del repo, en la máquina del dueño (Git Bash), con el alias SSH `legacy-vps`.
#
#   infra/bootstrap-env.sh qa
#   infra/bootstrap-env.sh production      # solo con confirmación explícita del dueño
#
# Requisito previo (necesita sudo, lo corre el dueño una sola vez por entorno):
#   ssh -t legacy-vps '/opt/vps-tools/new-app.sh legacyenterprise qa qa.legacyenterprise.legacysoftware.cloud'
#   ssh -t legacy-vps '/opt/vps-tools/new-app.sh legacyenterprise production api.legacyenterprise.legacysoftware.cloud'
#
# Qué hace (idempotente, nunca pisa lo que ya existe en /opt/vps-tools ni secretos del .env):
#   1. Reemplaza el compose genérico por infra/<env>/docker-compose.yml (agrega R2/FCM al environment).
#   2. Agrega al .env las líneas de infra/<env>/env.extra que falten (claves vacías = se llenan aparte).
#   3. Instala en /opt/vps-tools los scripts compartidos que falten (migrate.sh, db-guard.sh, reset-qa-from-prod.sh).
#   4. rsync de backend/ → app/ y database/migrations/ → migrations/.
#   5. docker compose up -d --build, migraciones, recarga de Apache y prueba interna.
# =============================================================================
set -euo pipefail

APP=legacyenterprise
ENV_NAME="${1:-}"
case "$ENV_NAME" in
  qa)         SHORT=qa ;;
  production) SHORT=prod ;;
  *) echo "Uso: $0 <qa|production>" >&2; exit 1 ;;
esac
HOST=legacy-vps
ROOT="/opt/$APP/$ENV_NAME"
cd "$(dirname "$0")/.."

# Sube <origen> a <destino remoto> reemplazando su contenido (como rsync --delete). Git Bash en Windows no trae
# rsync: en ese caso va por tar sobre SSH. Excluye .git, .env, logs y vendor.
sync_dir() {
  local src="$1" dest="$2" ex=(--exclude=.git --exclude=.env --exclude=logs --exclude=vendor)
  if command -v rsync >/dev/null 2>&1; then
    rsync -az --delete "${ex[@]}" "$src/" "$HOST:$dest/"
  else
    tar -C "$src" "${ex[@]}" -czf - . \
      | ssh "$HOST" "mkdir -p '$dest' && find '$dest' -mindepth 1 -delete && tar -xzf - -C '$dest'"
  fi
}

echo "== [$ENV_NAME] comprobando que new-app.sh ya creó $ROOT"
ssh "$HOST" "test -f $ROOT/.env && test -f $ROOT/docker-compose.yml" \
  || { echo "No existe $ROOT: corre primero new-app.sh (ver cabecera de este script)." >&2; exit 2; }

echo "== 1. compose del entorno"
scp -q "infra/$ENV_NAME/docker-compose.yml" "$HOST:$ROOT/docker-compose.yml"

echo "== 2. variables extra en .env (solo las que falten)"
while IFS= read -r line; do
  [[ "$line" =~ ^[A-Z0-9_]+= ]] || continue
  key="${line%%=*}"
  # -n: sin él, ssh se come el stdin del while y solo se procesa la primera línea.
  ssh -n "$HOST" "grep -q '^$key=' $ROOT/.env || printf '%s\n' '$line' >> $ROOT/.env"
done < "infra/$ENV_NAME/env.extra"

echo "== 3. scripts compartidos en /opt/vps-tools (sin sobrescribir)"
for s in db-guard.sh migrate.sh reset-qa-from-prod.sh; do
  if ssh "$HOST" "test -e /opt/vps-tools/$s"; then
    echo "   $s ya existe: no se toca"
  else
    scp -q "infra/scripts/$s" "$HOST:/opt/vps-tools/$s" && ssh "$HOST" "chmod 755 /opt/vps-tools/$s" && echo "   $s instalado"
  fi
done

echo "== 4. código y migraciones"
sync_dir backend "$ROOT/app"
sync_dir database/migrations "$ROOT/migrations"
if [ "$ENV_NAME" = qa ] && [ -f database/qa-sanitize.sql ]; then
  scp -q database/qa-sanitize.sql "$HOST:$ROOT/qa-sanitize.sql"
fi

echo "== 5. contenedores, migraciones y prueba"
ssh "$HOST" "cd $ROOT && docker compose up -d --build"
ssh "$HOST" "timeout 300 /opt/vps-tools/migrate.sh $APP $ENV_NAME"
ssh "$HOST" "timeout 30 docker exec ${APP}_php_${SHORT} service apache2 reload"
ssh "$HOST" "docker exec ${APP}_php_${SHORT} curl -fsS http://localhost/app_global_status.php"
echo
echo "Listo. Falta el Proxy Host en NPM para el dominio del entorno (ver docs/pendientes.md)."
