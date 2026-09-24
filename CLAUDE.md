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

Cierre pendiente del dueño (login en PDN para marcarlo L5, limpieza de llaves): [docs/pendientes.md](docs/pendientes.md).
El siguiente trabajo ya es de producto (módulos: CRM, Agenda, …).

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
- **i18n:** `public/i18n/{es,en}.json`, `'clave' | translate`.
- **Íconos:** Material Symbols Outlined (fuente por defecto de `mat-icon`). Íconos PWA: `node scripts/generate-icons.mjs`
  desde `docs/brand/`.
- `/dev/ui` (solo en desarrollo): muestrario de la base visual y probador de marca blanca.

## Backend — convenciones

- Plantilla de la skill: `requireAuth()` / `requireSede()` / `requireRole()` / `requirePrivilege()` en `auth.php`, más
  **`requireModulo('crm')`** (contratado en la sede ∩ acceso del usuario) y `sessionPayload()` (sesión + marca + módulos).
- La sede SIEMPRE sale de la sesión; solo los endpoints de plataforma (L5: `empresas/`, `modulos/`, `sedes/save_sede.php`,
  `sedes/list_sedes_admin.php`) reciben `id_sede`/`id_empresa` por POST.
- Módulos: catálogo `le_modulos` + contrato `le_sede_modulos` (vigencia por fechas). L4 ve todos los contratados; L0–L3 por
  privilegio con el código del módulo. Mantener `MODULES`/`PRIVILEGES` iguales en `auth.php` y `session.service.ts`.
- `db_prepare_or_fail()` y `db_execute_or_fail()`: un fallo de BD siempre responde JSON, nunca HTML.

## Gotchas

- `@material/material-color-utilities` 0.4 usa imports sin extensión: en Node falla, por eso `npm run theme` empaqueta con esbuild.
- En esta máquina (Windows PowerShell 5.1) no editar archivos UTF-8 con `Get-Content -Raw`/`Set-Content`: los lee como ANSI y los rompe.
- `inject()` siempre antes del primer `await` en guards/funciones (NG0203).
- Conexión MariaDB con `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci`: si no, `? = ''` falla con "Illegal mix of collations".
- `firebase/messaging` solo por `import()` dinámico: estático infla el bundle inicial ~100 kB.
- `window.__leDev` (login con token de prueba) existe solo en desarrollo: `ngDevMode` lo elimina del build de producción.
  Verificar tras tocar `app.ts`: `grep -l __leDev dist/legacyenterprise/browser/*.js` debe dar vacío.
- Cambiar variables del `.env` en la VPS requiere `docker compose up -d` (recrear), no `apache2 reload`.
