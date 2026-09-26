# LegacyEnterprise — estado del arranque y pendientes del dueño

Actualizado: 2026-09-26. Identidad, dominios, contenedores y buckets: [infraestructura.md](infraestructura.md).

## Estado: fundación en producción ✅

| Fase | Estado | Cómo se verificó |
|---|---|---|
| 0. Preflight | ✅ | Decisiones en `infraestructura.md`; buckets R2 creados y comprobados (privados sin URL pública) |
| 1. Shell + UI | ✅ | `ng build` + `ng lint` + Playwright a 375/1280: sin scroll horizontal, 0 errores de consola, marca blanca y tema oscuro |
| 2. Auth + sedes | ✅ | 24/24 e2e contra backend local + **login real con Google contra QA** (usuario creado por el handshake, marcado L5 con auditoría) |
| 3. Backend + BD | ✅ | 60/60 `curl` en local; QA y PDN en `legacy-vps` con migraciones 001–002, 9 tablas `utf8mb4_unicode_ci`, HTTPS Let's Encrypt, CORS, 401/403 |
| 4. Archivos + notificaciones | ✅ | R2 real en QA y PDN (público, privado con URL firmada, **cada token recibe 403 en los buckets del otro entorno**); FCM autenticado en ambos |
| 5. CI/CD | ✅ | `dev` → CI verde; `qa` → deploy con **copia saneada PDN → QA** verificada; `pdn` → deploy completo en verde |
| 6. Hosting + PWA | ✅ | **https://legacyenterprise.web.app** 200, rutas internas 200, `no-cache` en SW/index/manifest/i18n, versión = commit, bundle solo con la API de PDN |

Código en GitHub (`dev`, `qa`, `pdn`; repo **público**: no subir secretos ni datos personales).

## Cierre: lo que queda

1. ~~**Login en producción y L5**~~ ✅ 2026-09-24: `legacysoftware.co@gmail.com` (id 1) marcado L5 en PDN, auditado en
   `le_H_admin` (`grant_platform_admin`). Llega a QA con la próxima copia saneada (push a `qa`).
   Opcional: instalar la PWA y activar notificaciones para una push de prueba.
1b. ~~**Key de Google Maps**~~ ✅ 2026-09-24: creada con `gcloud` en `fireapp-ce836` (restringida por referrer y a las APIs Maps
   JavaScript + Geocoding) y puesta en los tres `environment*.ts`. Detalle y cómo administrarla: `docs/modulos/crm.md` → *Ubicación en
   el mapa*. Pendiente (opcional): una alerta de presupuesto en la cuenta de facturación.
2. **Borrar el usuario temporal de NPM** `claudecode@…` (túnel `ssh -L 8181:127.0.0.1:81 legacy-vps` → Users).
3. **Borrar llaves ya cargadas:** `Descargas\legacyenterprise-731cb-firebase-adminsdk-*.json`,
   `Descargas\legacyenterprise-731cb-df5113a01503.json` y `C:\Users\Alejo\r2-prod.env`
   (y, fuera de este proyecto, las llaves de LegacyInSite y LegacyChats que siguen en Descargas).

## Comunicaciones (WhatsApp): lo que queda del dueño

El módulo está desplegado en QA y PDN (migraciones 010–014). Sin estos pasos todo funciona **menos** guardar apps de Meta y líneas (la
pantalla de plataforma muestra el aviso «Falta COM_SECRET_KEY») y, por tanto, recibir y enviar WhatsApp. Detalle: [modulos/comunicaciones.md](modulos/comunicaciones.md) → *Operación*.

1. **Llave `COM_SECRET_KEY`** (una por entorno; se genera en la VPS, nunca pasa por el chat). El `docker-compose.yml` del repo ya la trae; en la
   VPS hay que agregar la línea `COM_SECRET_KEY: ${COM_SECRET_KEY}` al `environment:` del servicio `php` (o copiar el compose con `scp`):
   ```bash
   for E in production qa; do ssh legacy-vps "cd /opt/legacyenterprise/$E && sed -i '/^COM_SECRET_KEY=\$/d' .env \
     && { grep -q '^COM_SECRET_KEY=' .env || echo \"COM_SECRET_KEY=\$(openssl rand -base64 32)\" >> .env; }"; done
   scp infra/production/docker-compose.yml legacy-vps:/opt/legacyenterprise/production/docker-compose.yml
   scp infra/qa/docker-compose.yml legacy-vps:/opt/legacyenterprise/qa/docker-compose.yml
   ssh legacy-vps 'cd /opt/legacyenterprise/production && docker compose up -d && cd ../qa && docker compose up -d'
   ssh legacy-vps "docker exec legacyenterprise_php_prod php -r 'echo strlen(base64_decode(getenv(\"COM_SECRET_KEY\"))), PHP_EOL;'"   # 32
   ```
   **No cambiarla después** (lo cifrado con ella dejaría de leerse). O pídemelo y lo corro yo.
2. **Cron del worker** (crontab de `dev01`, `crontab -e`):
   ```
   * * * * * timeout 55 docker exec legacyenterprise_php_prod php /var/www/html/cron/jobs/com_worker.php >> /opt/legacyenterprise/production/logs/com_worker.log 2>&1
   * * * * * timeout 55 docker exec legacyenterprise_php_qa php /var/www/html/cron/jobs/com_worker.php >> /opt/legacyenterprise/qa/logs/com_worker.log 2>&1
   ```
   Sin cron funciona con el disparo del webhook, pero las campañas programadas, los reintentos y la espera por saldo o cupo esperan al siguiente evento.
3. **Primer cliente** (L5 en la app): contratar `comunicaciones` en la sede, recargar créditos, registrar la app de Meta (copiar su URL de webhook
   en Meta con el *verify token*), crear un usuario del sistema con token permanente y registrar la línea (se prueba y suscribe la WABA sola).
   Pasos exactos: `comunicaciones.md` → *Puesta en marcha de un cliente*. Para probar en QA: un número de prueba de Meta (se pierde en el siguiente push a `qa`).
4. **LegacyChats (E6):** confirmar para apagar su infraestructura y archivar el repositorio `F:\Proyectos\LegacyChats` (no tiene clientes ni datos
   que migrar). No se ha tocado nada de LegacyChats.

## Registro de lo hecho (referencia para producción y futuras apps)

### 1. ~~Primer commit y push~~ ✅
Hecho el 2026-09-24: `dev` en GitHub (rama por defecto) y CI en verde. `qa` y `pdn` se crean en los pasos 8 y 9
(crear la rama dispara su deploy). Gitflow: `CLAUDE.md` → *Gitflow*.

### 2. ~~Crear QA en la VPS~~ ✅
Hecho el 2026-09-24: `new-app.sh` (dueño) + `infra/bootstrap-env.sh qa` (agente). 9 tablas en `utf8mb4_unicode_ci`,
migraciones 001–002 aplicadas, `_lib/` bloqueado (403), endpoints protegidos (401). Referencia de lo que se corrió:
```bash
ssh -t legacy-vps '/opt/vps-tools/new-app.sh legacyenterprise qa qa.legacyenterprise.legacysoftware.cloud'
```
Después, desde la raíz del repo (o pídemelo y lo corro yo):
```bash
bash infra/bootstrap-env.sh qa
```
Instala el compose con R2/FCM, completa el `.env`, copia `migrate.sh`/`db-guard.sh` a `/opt/vps-tools` **solo si no existen**, sube backend y migraciones, levanta contenedores y aplica migraciones.

### 3. ~~Proxy Host en NPM para QA~~ ✅
Hecho el 2026-09-24 por API con un usuario temporal de NPM (proxy host 6, certificado Let's Encrypt 6, vence
2026-12-23, lo renueva NPM). Verificado: HTTPS 200 con HTTP/2, HTTP → 301 a HTTPS, CORS para `localhost:4200`,
401 sin token, `_lib/` 403. **Pendiente: borrar el usuario temporal `claudecode@…` de NPM.**
Configuración usada (para producción, con `api.` y `legacyenterprise_php_prod`):
Túnel: `ssh -L 8181:127.0.0.1:81 legacy-vps` (el panel de NPM escucha en el **81** del servidor; 8181 es el
puerto local) → abrir `http://localhost:8181`.
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

### 5. ~~Tokens S3 de R2~~ ✅ (QA) · ⏳ cargar el de PDN cuando exista producción
Hecho el 2026-09-24: tokens `legacyenterprise-r2-qa` y `legacyenterprise-r2-prod` (cada uno solo con sus 2 buckets,
filtro de IP de la VPS). Claves de QA cargadas en el `.env` de QA y probadas de verdad desde el contenedor: subida y
lectura pública, privado inaccesible sin firma y accesible con URL prefirmada, **el token de QA recibe 403 al
escribir en el bucket de PDN**, borrado OK. Claves de PDN guardadas en `C:\Users\Alejo\r2-prod.env` (fuera del repo)
para el paso 9. Referencia del procedimiento:
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

### 6. ~~Clave VAPID~~ ✅
Hecho el 2026-09-24: par validado (la pública deriva de la privada), pública en `environment*.ts`; la privada no se
guarda en ningún lado (el backend envía con la cuenta de servicio). Referencia:
Firebase → [Configuración → Cloud Messaging](https://console.firebase.google.com/project/legacyenterprise-731cb/settings/cloudmessaging) →
**Configuración web → Certificados push web → Generar par de claves**. Copia la clave (empieza con `B`): es pública,
puedes pegármela en el chat y la pongo en `environment*.ts`.

### 7. ~~Cuenta de servicio de FCM~~ ✅ (QA) · ⏳ PDN
Hecho el 2026-09-24 en QA: `FCM_SERVICE_ACCOUNT_B64` cargada desde
`~/Downloads/legacyenterprise-731cb-firebase-adminsdk-fbsvc-508a8fedf5.json`; verificado token OAuth y autenticación
contra FCM (un token de dispositivo inventado responde `invalid_token`). Cargar el mismo JSON en el `.env` de PDN en
el paso 9 y después borrarlo de Descargas. Referencia:
Firebase → Configuración → **Cuentas de servicio** → *Generar nueva clave privada* (descarga un JSON). Cárgalo sin pasar por el chat:
```bash
E=/opt/legacyenterprise/qa/.env
{ printf 'FCM_SERVICE_ACCOUNT_B64='; base64 -w0 ~/Downloads/legacyenterprise-731cb-firebase-adminsdk-*.json; echo; } \
  | ssh legacy-vps "sed -i '/^FCM_SERVICE_ACCOUNT_B64=/d' $E && cat >> $E"
ssh legacy-vps 'cd /opt/legacyenterprise/qa && docker compose up -d'
```
Repetir con `/opt/legacyenterprise/production/.env` cuando exista producción.

### 8. ~~CI/CD: llave de deploy y secretos de GitHub~~ ✅
Hecho el 2026-09-24: llave `gh_actions_legacyenterprise` autorizada en `dev01` (probada sola con `IdentitiesOnly`),
4 secretos cargados, rama `qa` creada. El primer deploy no se disparó con el push (rama idéntica a `dev` +
`paths-ignore`); se agregó `workflow_dispatch` con guardia de rama. Referencia:
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
Luego crear la rama `qa` (= primer deploy de QA por CI) y seguirlo:
```bash
git push origin dev:qa
gh run watch --repo $R --exit-status "$(gh run list --repo $R --workflow 'Deploy QA' --limit 1 --json databaseId -q '.[0].databaseId')"
```
Mientras no exista producción, el paso de copia dice `PDN de legacyenterprise aún no existe: QA conserva su BD`
y el deploy sigue. Cuando exista, cada push a `qa` reemplaza la BD de QA por una copia saneada de PDN.

### 9. ~~Producción~~ ✅
Hecho el 2026-09-24: `new-app.sh production` (dueño), `bootstrap-env.sh production` + R2/FCM de PDN (agente), NPM
host 7 + certificado 7, rama `pdn` desde `origin/qa` y `gh workflow run "Deploy Production" --ref pdn` → verde.
URL pública en un segundo sitio de Hosting (`legacyenterprise`), porque el ID del proyecto lleva sufijo. Referencia:
```bash
ssh -t legacy-vps '/opt/vps-tools/new-app.sh legacyenterprise production api.legacyenterprise.legacysoftware.cloud'
bash infra/bootstrap-env.sh production
```
NPM: `api.legacyenterprise.legacysoftware.cloud` → `legacyenterprise_php_prod:80` + SSL. Tokens R2 prod y FCM en su `.env`.
Crear la rama `pdn` (solo con tu OK) → despliega backend + frontend a **`https://legacyenterprise.web.app`**:
`git push origin qa:pdn`.

### 10. Verificaciones post-deploy
- `curl -sI https://legacyenterprise.web.app/ngsw-worker.js` → debe traer `cache-control: no-cache`
  (el emulador local no aplica headers; hay que confirmarlo en Hosting real).
- Login real con Google en la URL pública, instalar la PWA, activar notificaciones y recibir un push de prueba.
- Subir un logo de empresa desde **Empresas** (prueba R2 real).

## Desarrollo local (opcional)
`npm run start:local` sirve el frontend contra un backend en `http://127.0.0.1:8080`
(`php -S 127.0.0.1:8080 -t backend` con `mysqli` + MariaDB 10.11 local y las variables `DB_*`, `DB_PORT`, `APP_ENV=qa`,
`FIREBASE_PROJECT_ID`). Con QA en la VPS, lo normal es `npm start` (apunta a QA).

Receta sin Docker en Windows (usada para probar el CRM v0; todo en una carpeta temporal, sin instalar nada):
1. MariaDB portable: `https://archive.mariadb.org/mariadb-10.11.14/winx64-packages/mariadb-10.11.14-winx64.zip` →
   `bin\mariadb-install-db.exe --datadir=<dir>\data --password=…` → `bin\mariadbd.exe --defaults-file=<dir>\data\my.ini --port=3307`.
2. Crear la BD `legacyenterprise` (`utf8mb4_unicode_ci`) y un usuario; aplicar `database/migrations/*.sql` en orden y, para
   tener datos y usuarios de prueba, `database/dev-seed-crm.sql` (**solo local**) y, para Comunicaciones, `database/dev-seed-comunicaciones.sql`
   (sede solo-Comunicaciones y tokens `dev-token-com-*`).
3. Backend: `php -d extension_dir=F:/PHP/ext -d extension=mysqli -S 127.0.0.1:8080 -t backend` con `DB_HOST=127.0.0.1`,
   `DB_PORT=3307`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `APP_ENV=qa` (Comunicaciones: además `COM_SECRET_KEY` —cualquier base64 de 32 bytes— y
   `COM_GRAPH_FAKE=1` para simular a Meta).
4. Frontend: `npm run start:local`. CORS solo admite `http://localhost:4200`: si ya hay un `npm start` ahí (apunta a QA),
   pararlo, o probar con Chromium sin seguridad web (`--disable-web-security`).
5. Login de prueba (solo en dev): `window.__leDev.login('dev-token-l4')` desde la consola del navegador y `__leDev.go('/m/crm')`.

## Hallazgos fuera de este proyecto
- **LegacyInSite (producción)** sirve `ngsw-worker.js`, `index.html` y `manifest.webmanifest` con `cache-control: max-age=3600`
  (su `firebase.json` no tiene `headers`): los usuarios pueden quedar hasta 1 h en una versión vieja.
- **Plantillas de la skill `bootstrap-app`** con bugs encontrados aquí (corregidos aquí y devueltos a la skill en su v3.2, junto con el gitflow estándar):
  1. `auth.guard.ts` → `guestGuard` llama `inject()` después de `await` (NG0203: la página de login no carga).
  2. `db_connection.php` → `SET collation_connection` no alcanza: `? = ''` en `get_mis_sedes.php` falla con "Illegal mix of collations". Fix: `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci`.
  3. `ci/deploy-pdn.yml` → Node 20; Angular 22 exige Node ≥ 22.22.
  4. `firebase-core.service.ts` / `messaging.service.ts` importan `firebase/messaging` de forma estática (+100 kB al bundle inicial; con Firebase 12 el build superaba 1 MB).
  5. `firebase-messaging-sw.js` usa compat 10.14 aunque la skill usa Firebase 12.
  6. `sede-switcher.component.ts` → íconos finales sin `iconPositionEnd` (quedan antes del texto en M3).
  7. Diálogos: la etiqueta flotante del primer campo `outline` queda recortada (fix global en `_base.scss`).
  8. `badge-72x72.png` referenciado por el service worker pero no generado.
