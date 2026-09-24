# LegacyEnterprise — estado del arranque y pendientes del dueño

Actualizado: 2026-09-24. Identidad, dominios, contenedores y buckets: [infraestructura.md](infraestructura.md).

## Estado por fase

| Fase | Estado | Cómo se verificó |
|---|---|---|
| 0. Preflight | ✅ | Decisiones en `infraestructura.md`; buckets R2 creados y comprobados (privados sin URL pública) |
| 1. Shell + UI | ✅ | `ng build` + `ng lint` + Playwright a 375/1280: sin scroll horizontal, 0 errores de consola, marca blanca y tema oscuro |
| 2. Auth + sedes | ✅ local · ⏳ login real | 24/24 pruebas e2e contra backend local (guard, popup de Google, onboarding con código, panel L5, soporte con marca, accesos L4, gateo por módulo). Falta **tu login real con Google** |
| 3. Backend + BD | ✅ local · ⏳ VPS | MariaDB 10.11 local: migraciones idempotentes, todo en `utf8mb4_unicode_ci`, 60/60 pruebas `curl` positivas y negativas. Falta crear QA en la VPS (necesita `sudo`) |
| 4. Archivos + notificaciones | ✅ parcial · ⏳ credenciales | Notificaciones in-app completas (20/20 + UI) y guardia de entorno de R2. Faltan tokens S3 de R2 y clave VAPID para probar subida real y push |
| 5. CI/CD | ✅ archivos · ⏳ secretos | `ci.yml` (dev/PR), `deploy-qa.yml`, `deploy-pdn.yml` validados; llave de deploy generada. Faltan secretos de GitHub y primer push |
| 6. Hosting + PWA | ✅ config · ⏳ deploy | `firebase.json` probado con el emulador (rewrite, manifest, íconos, bundle apunta solo a la API de PDN). Falta el primer deploy (lo hace el CI de `pdn`) |

Nada está commiteado todavía (rama local `dev`, remoto vacío).

## Tus acciones pendientes, en orden

### 1. Revisar y autorizar el primer commit
Revisa el código y dime si hago el commit inicial en `dev` y el push al repo.

### 2. Crear QA en la VPS (necesita tu contraseña de `sudo`, una sola vez)
```bash
ssh -t legacy-vps '/opt/vps-tools/new-app.sh legacyenterprise qa qa.legacyenterprise.legacysoftware.cloud'
```
Después, desde la raíz del repo (o pídemelo y lo corro yo):
```bash
bash infra/bootstrap-env.sh qa
```
Instala el compose con R2/FCM, completa el `.env`, copia `migrate.sh`/`db-guard.sh` a `/opt/vps-tools` **solo si no existen**, sube backend y migraciones, levanta contenedores y aplica migraciones.

### 3. Proxy Host en NPM para QA
Túnel: `ssh -L 8181:127.0.0.1:8181 legacy-vps` → abrir `http://localhost:8181`.
Proxy Hosts → Add: dominio `qa.legacyenterprise.legacysoftware.cloud`, `http` → `legacyenterprise_php_qa` : `80`,
Block Common Exploits ✔, pestaña SSL: Let's Encrypt + Force SSL + HTTP/2.
Prueba: `curl https://qa.legacyenterprise.legacysoftware.cloud/app_global_status.php`.

### 4. Tu primer login y marcarte L5 (plataforma)
1. En tu máquina: `cd frontend && npm start` → `http://localhost:4200` (apunta a la API de QA) → **Continuar con Google**.
2. Te marca como dueño de la plataforma (solo por SQL, nunca desde la UI):
```bash
ssh legacy-vps "docker exec -i legacyenterprise_db_qa sh -c 'MYSQL_PWD=\$MYSQL_ROOT_PASSWORD mariadb -uroot \$MYSQL_DATABASE'" \
  <<< "UPDATE le_usuarios SET is_platform_admin = 1 WHERE email = '<tu-email-de-google>';"
```
3. Recarga: verás el panel de **Empresas** y **Sedes**. La sede semilla es `Sede Principal` (código `SEED0001`, todos los módulos habilitados).

### 5. Tokens S3 de R2 (separados de Kingdom)
Cloudflare → R2 → **Manage API tokens** → **Create Account API token**, permiso **Object Read & Write**, *Apply to specific buckets only*:
- `legacyenterprise-r2-qa` → `legacyenterprise-qa`, `legacyenterprise-qa-private`
- `legacyenterprise-r2-prod` → `legacyenterprise-prod`, `legacyenterprise-prod-private`

Guarda cada par en un archivo local (no en el chat), p. ej. `~/r2-qa.env`:
```
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
```
y cárgalo (reemplaza las líneas vacías y recrea el contenedor: un `reload` no toma variables nuevas):
```bash
E=/opt/legacyenterprise/qa/.env
ssh legacy-vps "sed -i '/^R2_ACCESS_KEY=/d;/^R2_SECRET_KEY=/d' $E && cat >> $E" < ~/r2-qa.env
ssh legacy-vps 'cd /opt/legacyenterprise/qa && docker compose up -d'
rm ~/r2-qa.env
```

### 6. Clave VAPID (push web)
Firebase → [Configuración → Cloud Messaging](https://console.firebase.google.com/project/legacyenterprise-731cb/settings/cloudmessaging) →
**Configuración web → Certificados push web → Generar par de claves**. Copia la clave (empieza con `B`): es pública,
puedes pegármela en el chat y la pongo en `environment*.ts`.

### 7. Cuenta de servicio de FCM (enviar push desde el backend)
Firebase → Configuración → **Cuentas de servicio** → *Generar nueva clave privada* (descarga un JSON). Cárgalo sin pasar por el chat:
```bash
E=/opt/legacyenterprise/qa/.env
{ printf 'FCM_SERVICE_ACCOUNT_B64='; base64 -w0 ~/Downloads/legacyenterprise-731cb-firebase-adminsdk-*.json; echo; } \
  | ssh legacy-vps "sed -i '/^FCM_SERVICE_ACCOUNT_B64=/d' $E && cat >> $E"
ssh legacy-vps 'cd /opt/legacyenterprise/qa && docker compose up -d'
```
Repetir con `/opt/legacyenterprise/production/.env` cuando exista producción.

### 8. CI/CD: llave de deploy y secretos de GitHub
La llave ya está generada en `~/.ssh/gh_actions_legacyenterprise` (propia de esta app, no compartida con otras).
```bash
ssh legacy-vps 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/gh_actions_legacyenterprise.pub
R=thegoodalejo/LegacyEnterprise
gh secret set VPS_HOST --repo $R --body "$(ssh -G legacy-vps | awk '/^hostname /{print $2}')"
gh secret set VPS_USER --repo $R --body "dev01"
gh secret set VPS_SSH_KEY --repo $R < ~/.ssh/gh_actions_legacyenterprise
gh secret set FIREBASE_SERVICE_ACCOUNT --repo $R < ~/Downloads/<cuenta-hosting>.json   # rol "Firebase Hosting Admin"
gh secret list --repo $R
```
Luego: push a `qa` → `gh run watch` → confirmar que el deploy llegó por CI.

### 9. Producción (solo con tu confirmación explícita)
```bash
ssh -t legacy-vps '/opt/vps-tools/new-app.sh legacyenterprise production api.legacyenterprise.legacysoftware.cloud'
bash infra/bootstrap-env.sh production
```
NPM: `api.legacyenterprise.legacysoftware.cloud` → `legacyenterprise_php_prod:80` + SSL. Tokens R2 prod y FCM en su `.env`.
Primer push a `pdn` → despliega backend + frontend a `https://legacyenterprise-731cb.web.app`.

### 10. Verificaciones post-deploy
- `curl -sI https://legacyenterprise-731cb.web.app/ngsw-worker.js` → debe traer `cache-control: no-cache`
  (el emulador local no aplica headers; hay que confirmarlo en Hosting real).
- Login real con Google en la URL pública, instalar la PWA, activar notificaciones y recibir un push de prueba.
- Subir un logo de empresa desde **Empresas** (prueba R2 real).

## Desarrollo local (opcional)
`npm run start:local` sirve el frontend contra un backend en `http://127.0.0.1:8080`
(`php -S 127.0.0.1:8080 -t backend` con `mysqli` + MariaDB 10.11 local y las variables `DB_*`, `DB_PORT`, `APP_ENV=qa`,
`FIREBASE_PROJECT_ID`). Con QA en la VPS, lo normal es `npm start` (apunta a QA).

## Hallazgos fuera de este proyecto
- **LegacyInSite (producción)** sirve `ngsw-worker.js`, `index.html` y `manifest.webmanifest` con `cache-control: max-age=3600`
  (su `firebase.json` no tiene `headers`): los usuarios pueden quedar hasta 1 h en una versión vieja.
- **Plantillas de la skill `bootstrap-app`** con bugs encontrados aquí (corregidos en este repo; conviene devolverlos a la skill):
  1. `auth.guard.ts` → `guestGuard` llama `inject()` después de `await` (NG0203: la página de login no carga).
  2. `db_connection.php` → `SET collation_connection` no alcanza: `? = ''` en `get_mis_sedes.php` falla con "Illegal mix of collations". Fix: `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci`.
  3. `ci/deploy-pdn.yml` → Node 20; Angular 22 exige Node ≥ 22.22.
  4. `firebase-core.service.ts` / `messaging.service.ts` importan `firebase/messaging` de forma estática (+100 kB al bundle inicial; con Firebase 12 el build superaba 1 MB).
  5. `firebase-messaging-sw.js` usa compat 10.14 aunque la skill usa Firebase 12.
  6. `sede-switcher.component.ts` → íconos finales sin `iconPositionEnd` (quedan antes del texto en M3).
  7. Diálogos: la etiqueta flotante del primer campo `outline` queda recortada (fix global en `_base.scss`).
  8. `badge-72x72.png` referenciado por el service worker pero no generado.
