# LegacyEnterprise — Monorepo

Suite empresarial multi-sede con módulos contratables (CRM, Agenda, Servicios, Pedidos, Integraciones,
Gerencia) y app switcher estilo Google. Arrancada con la skill `legacy-claude-skills:bootstrap-app`.

- **Frontend:** Angular 22 (standalone, zoneless, Signals) + Material 22 — `frontend/`
- **Backend:** PHP 8.3 sin framework + MariaDB 10.11 — `backend/`; esquema solo por migraciones en `database/migrations/`
- **Infra:** `infra/<env>/` (compose + variables extra), `infra/bootstrap-env.sh` (primer deploy manual), `infra/scripts/` (→ `/opt/vps-tools`)
- **Identidad, modelo multi-cliente, dominios, contenedores, BD, buckets:** [docs/infraestructura.md](docs/infraestructura.md) — fuente de verdad, no duplicar aquí.

## Estado

Detalle y **acciones pendientes del dueño** (comandos exactos): [docs/pendientes.md](docs/pendientes.md).

**Fundación en producción desde el 2026-09-24:**
- Producción: **https://legacyenterprise.web.app** (Firebase Hosting, sitio `legacyenterprise`) · API `https://api.legacyenterprise.legacysoftware.cloud`
- QA: API `https://qa.legacyenterprise.legacysoftware.cloud` (frontend local con `npm start`)

| Fase | Estado |
|---|---|
| 0. Preflight | ✅ |
| 1. Shell + UI | ✅ build + lint + Playwright 375/1280 sin errores de consola |
| 2. Auth + sedes | ✅ e2e local + login real con Google contra QA (dueño marcado L5 en QA) |
| 3. Backend + BD | ✅ QA y PDN en `legacy-vps`, migraciones 001–002, NPM + Let's Encrypt (hosts 6 y 7) |
| 4. Archivos + notificaciones | ✅ R2 y FCM verificados de verdad en QA y PDN (tokens aislados por entorno) |
| 5. CI/CD | ✅ `dev`/`qa`/`pdn` con deploy automático; copia PDN → QA probada en CI |
| 6. Hosting + PWA | ✅ publicado por CI, `no-cache` verificado, bundle apunta solo a la API de PDN |

Cierre pendiente del dueño (limpieza de llaves y del usuario temporal de NPM): [docs/pendientes.md](docs/pendientes.md).
El siguiente trabajo ya es de producto (módulos: CRM, Agenda, …). **CRM v1 de contactos** (Persona/Organización con jerarquía y roles,
campos personalizados, etiquetas, historial, filtros, acciones en lote, vocabulario por empresa y plantillas por nicho) y **reportes PDF/Excel con
la marca del cliente** (exportar contactos): definición, decisiones, hoja de ruta (oportunidades → ventas importadas → metas) y pendientes en [docs/modulos/crm.md](docs/modulos/crm.md).

## Gitflow

| Rama | Significado | Push dispara |
|---|---|---|
| `dev` (default) | integrar | `ci.yml`: `php -l`, `ng lint`, build de producción |
| `qa` | **probar** | `deploy-qa.yml`: backend a QA + **BD de QA = copia saneada de PDN** (`reset-qa-from-prod.sh`) + migraciones nuevas + reload |
| `pdn` | **desplegar** | `deploy-pdn.yml`: build → backend + migraciones a PDN → Firebase Hosting → verifica versión y `no-cache` |

- Promoción fast-forward: `git push origin dev:qa`, luego `git push origin refs/remotes/origin/qa:refs/heads/pdn`
  (este último solo con confirmación explícita del dueño; sin rama `qa` local, se promueve desde `origin/qa`).
- Si un push no trae cambios fuera de `docs/**`/`*.md` (o la rama queda idéntica a `dev`), el deploy no se dispara:
  lanzarlo a mano con `gh workflow run "Deploy QA" --ref qa` / `gh workflow run "Deploy Production" --ref pdn`
  (la guardia del workflow impide desplegar otra rama).
- Lo creado a mano en QA se pierde en el siguiente push a `qa` (wipe intencional). Saneo propio: `database/qa-sanitize.sql`.
- **No crear commits ni push sin que el dueño lo pida.**

## Frontend — convenciones

- Reglas visuales de la skill (`references/ui-standards.md`): loader con `LoadingService.wrap()`, diálogos con
  `DialogService` (ESLint `no-alert`), formularios con `.form-grid` y hints de una línea (`subscriptSizing="dynamic"` si no cabe),
  diálogos con `dialogSize()`, tablas dentro de `.table-scroll`.
- **Colores:** solo `var(--md-sys-color-*)`. Se definen en `src/styles/_tokens.scss`, **generado** con `npm run theme`
  desde `DEFAULT_BRAND` (`src/app/theme/brand-scheme.ts`). Los `--mat-sys-*` de Material apuntan a esos tokens
  (mixin `mat-sys-bridge`), así la marca blanca recolorea Material y componentes propios por igual.
- **Marca blanca:** `BrandingService.apply({ nombre, logoUrl, seeds })` regenera los tokens claro/oscuro en runtime con
  el mismo algoritmo (`@material/material-color-utilities`) y cambia el logo de barra, loader y splash.
- **Módulos:** catálogo en `src/app/modules/app-modules.ts` (código, ícono, tono, navegación). El app switcher recibe la
  lista ya filtrada (habilitados en la sede ∩ permitidos al usuario); no decide acceso.
- **i18n:** `public/i18n/{es,en}.json`, `'clave' | translate`. `TranslationService.setGlobals()` publica variables para todos los
  textos (el CRM las usa para el vocabulario de la empresa: `{persona}`, `{Personas}`…): esos textos se redactan sin artículos ni
  adjetivos que dependan del género.
- **Íconos:** Material Symbols Outlined (fuente por defecto de `mat-icon`). Íconos PWA: `node scripts/generate-icons.mjs`
  desde `docs/brand/`.
- **Reportes:** toda lista o panel del CRM nace con «Exportar» PDF/Excel (`app-export-menu`). Cada pantalla arma un `ReportSpec` y `ReportService.exportar()` (`src/app/services/reports/`) genera el archivo
  en el navegador con la marca del cliente (logo, empresa, sede, fecha y hora, usuario, «Generado por LegacyEnterprise»); jsPDF y ExcelJS se cargan solo al exportar (`import()`). Detalle: `docs/modulos/crm.md` → *Reportes y exportación*.
- `/dev/ui` (solo en desarrollo): muestrario de la base visual y probador de marca blanca.

## Backend — convenciones

- Plantilla de la skill: `requireAuth()` / `requireSede()` / `requireRole()` / `requirePrivilege()` en `auth.php`, más
  **`requireModulo('crm')`** (contratado en la sede ∩ acceso del usuario) y `sessionPayload()` (sesión + marca + módulos).
- La sede SIEMPRE sale de la sesión; solo los endpoints de plataforma (L5: `empresas/`, `modulos/`, `sedes/save_sede.php`,
  `sedes/list_sedes_admin.php`) reciben `id_sede`/`id_empresa` por POST.
- Módulos: catálogo `le_modulos` + contrato `le_sede_modulos` (vigencia por fechas). L4 ve todos los contratados; L0–L3 por
  privilegio con el código del módulo. Mantener `MODULES`/`PRIVILEGES` iguales en `auth.php` y `session.service.ts`.
- `db_prepare_or_fail()` y `db_execute_or_fail()`: un fallo de BD siempre responde JSON, nunca HTML.
- **Auditoría de tablas nuevas:** `created_at`/`updated_at` + `created_by`/`updated_by` (FK a `le_usuarios`, `ON DELETE SET NULL`).
  Historial de un registro de negocio: `auditRegistro()` / `auditRegistroVarios()` (`_lib/_historial.php`) → `le_H_registros`
  (genérica, para todos los módulos); `auditAdmin()` sigue siendo solo para acciones sensibles de plataforma.
- Módulo con datos personales: enmascarar en `database/qa-sanitize.sql` (tolerando tablas que aún no existan en PDN).
- Exportaciones de datos personales: la primera página deja `auditAdmin('crm_exportar')`; `reportes/get_marca.php` entrega la marca (logo como data URI leído del bucket público de R2, solo si es de esa empresa).
- Eliminación de registros de negocio: lógica (`activo = 0`) y restaurable, no `DELETE`.

## Gotchas

- `@material/material-color-utilities` 0.4 usa imports sin extensión: en Node falla, por eso `npm run theme` empaqueta con esbuild.
- En esta máquina (Windows PowerShell 5.1) no editar archivos UTF-8 con `Get-Content -Raw`/`Set-Content`: los lee como ANSI y los rompe.
- `inject()` siempre antes del primer `await` en guards/funciones (NG0203).
- **No correr `npm install <paquete>` en Windows**: poda del `package-lock.json` los binarios de Linux (`@rolldown/binding-linux-*`)
  y rompe `npm ci` en el CI. Agregar la dependencia a mano en `package.json` y a `package-lock.json` (o instalarla en Linux).
  Receta que funcionó (2026-09-25, `jspdf`/`exceljs`): copiar `package.json` y el lock a una carpeta temporal, correr ahí `npm install --package-lock-only --ignore-scripts <paquete>`,
  y **fusionar solo las entradas nuevas** en el lock original (sin tocar las existentes); comprobar que sigan los `@rolldown/binding-linux-*` y correr `npm ci` (valida que el lock y `package.json` coincidan).
  `npm ci` borra `node_modules`: con `npm start` abierto falla con EBUSY y lo deja a medias; parar antes el servidor de desarrollo.
- `googleMapsApiKey` (environments) es una key de navegador restringida por referrer (`legacyenterprise.web.app` y `localhost:4200`)
  y a Maps JavaScript + Geocoding; vive en el proyecto `fireapp-ce836`. Un puerto local distinto de 4200 o un dominio nuevo hay que
  agregarlo a la clave (`gcloud services api-keys update`); sin Maps el selector sigue con coordenadas escritas. Detalle: `docs/modulos/crm.md`.
- Un `effect()` que llama a algo con `LoadingService.wrap()` va con `untracked(...)`: `wrap` lee sus propias señales y el efecto
  se re-dispara con cada carga de otra pantalla (bucle de recargas y overlay siempre visible).
- Local en Windows: MariaDB baja a minúsculas los nombres de tabla (`le_H_admin` → `le_h_admin`); en la VPS (Linux) no.
  Escribir siempre `le_H_…` con esa mayúscula. El `php.ini` local trae `mysqli` apagado: `php -d extension_dir=… -d extension=mysqli -S …`.
- Conexión MariaDB con `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci`: si no, `? = ''` falla con "Illegal mix of collations".
- `firebase/messaging` solo por `import()` dinámico: estático infla el bundle inicial ~100 kB.
- `window.__leDev` (login con token de prueba) existe solo en desarrollo: `ngDevMode` lo elimina del build de producción.
  Verificar tras tocar `app.ts`: `grep -l __leDev dist/legacyenterprise/browser/*.js` debe dar vacío.
- Cambiar variables del `.env` en la VPS requiere `docker compose up -d` (recrear), no `apache2 reload`.
