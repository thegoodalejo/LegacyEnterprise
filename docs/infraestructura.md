# LegacyEnterprise — infraestructura y decisiones de arranque

Fuente de verdad de identidad, dominios, contenedores, BD y buckets. Sin secretos.
Arranque con la skill `legacy-claude-skills:bootstrap-app` (versión `3c933438f90a`). Fase 0 cerrada el 2026-09-24.

## Producto

Suite empresarial con módulos contratables: **CRM, Agenda, Servicios, Pedidos, Integraciones**, más
**Gerencia** (información ejecutiva agregada a nivel empresa). Una sola app; los módulos se cambian con
un **app switcher** estilo Google (cuadrícula en la barra superior).

## Identidad

| Dato | Valor |
|---|---|
| Nombre visible | Legacy Enterprise |
| Slug | `legacyenterprise` |
| Prefijo de tablas | `le_` |
| Idiomas | `es` (default), `en` |
| Logo | `docs/brand/logo.svg` (marca) y `docs/brand/icon.svg` (ícono PWA/maskable). Propio, cuadrícula 2×2 de módulos |
| Paleta por defecto | primary Índigo `#3949AB` · secondary Grafito azulado `#546E7A` · tertiary Turquesa `#00A08A` |
| Tipografía | Inter |

## Modelo multi-cliente (desvíos respecto del estándar de la skill)

El estándar de la skill es "cada sede es un cliente, sin capa superior". Aquí se agrega **Empresa** a propósito:

```
Plataforma (L5 = dueño/soporte, is_platform_admin)
 └─ le_empresas            marca blanca (paleta + logo), módulos de gerencia agregados
     └─ le_sedes           id_empresa NOT NULL; cada sede opera sus datos aislada (id_sede en todo)
         ├─ le_sede_modulos      módulos contratados (los habilita L5, no la sede)
         └─ le_usuario_sedes     rol Nuevo/L0–L4 + privilegios por (usuario, sede)
```

- **Datos de negocio:** siempre `id_sede` NOT NULL y filtrados por la sede activa. Solo los módulos de
  Gerencia leen agregado sobre las sedes de una empresa.
- **Módulos por contrato:** catálogo `le_modulos` (código, nombre, ícono, orden) + `le_sede_modulos`
  (id_sede, módulo, activo, vigencia). Los administra solo L5 desde `/admin/sedes`.
- **Acceso efectivo a un módulo** = habilitado en la sede activa **y** permitido al usuario por
  rol/privilegio. El switcher muestra exactamente eso; el guard de ruta (`data.modulo`) y el backend
  (`requireModulo()`) validan lo mismo.
- **Usuarios en varias sedes:** sí (selector de sede de la skill). L5 entra a cualquiera como soporte.
- **Alta de usuarios:** estándar de la skill: código de 8 caracteres / QR → rol `Nuevo` → un L4 lo aprueba.
- **Roles y privilegios:** `L0–L4` sin significado de negocio todavía (se define al construir cada
  módulo). Privilegios iniciales: `usuarios`, `archivos`; los de cada módulo se agregan con el módulo.

### Marca blanca

- Cada empresa puede definir su paleta (3 colores semilla) y su logo (R2 público). `NULL` = marca Legacy Enterprise.
- La marca que se ve es la de la empresa de la **sede activa** (cambia al cambiar de sede; L5 en soporte
  ve la marca del cliente + distintivo "Soporte").
- Implementación: tokens por defecto en `styles.scss` a nivel de compilación; en runtime un `BrandingService`
  genera el esquema M3 claro/oscuro desde la semilla (`@material/material-color-utilities`) y sobrescribe
  los tokens en `:root`. Funciona porque ningún componente usa hexadecimales (regla de la skill).
- El logo de la empresa reemplaza el de la barra, el loader y el splash (el splash usa la última marca
  vista en ese dispositivo).
- **Límite conocido:** el nombre/ícono de la PWA instalada, el manifest y el ícono de las push siguen
  siendo Legacy Enterprise (un solo dominio, manifest estático). Marca blanca completa = dominio propio
  por empresa (a futuro).

### Pendiente de definir (no bloquea la fundación)

- Quién administra una empresa además de L5 (rol de "admin de empresa") y cómo se da acceso a Gerencia.
- Si Gerencia se contrata por empresa o por sede.

## Infraestructura

| Pieza | QA | Producción |
|---|---|---|
| Servidor | `legacy-vps` (`legacysoftware.cloud`) | `legacy-vps` |
| Carpeta | `/opt/legacyenterprise/qa` | `/opt/legacyenterprise/production` |
| Proyecto compose | `legacyenterprise_qa` | `legacyenterprise_production` |
| Contenedor PHP / BD | `legacyenterprise_php_qa` / `legacyenterprise_db_qa` | `legacyenterprise_php_prod` / `legacyenterprise_db_prod` |
| Base de datos / usuario | `legacyenterprise_qa_db` / `legacyenterprise_qa_user` | `legacyenterprise_prod_db` / `legacyenterprise_prod_user` |
| `APP_ENV` | `qa` | `production` |
| API | `qa.legacyenterprise.legacysoftware.cloud` | `api.legacyenterprise.legacysoftware.cloud` |
| Frontend | no se publica (`ng serve` local contra la API de QA) | Firebase Hosting, sitio `legacyenterprise` → **`https://legacyenterprise.web.app`** |
| Buckets R2 | `legacyenterprise-qa`, `legacyenterprise-qa-private` | `legacyenterprise-prod`, `legacyenterprise-prod-private` |

Nombres generados por `new-app.sh` (ver `references/vps-multiapp.md` de la skill): no cambiarlos.

## Cloudflare R2

- Cuenta Cloudflare `a9e701cae79abd58f54b1988d75088da` (la misma donde viven los buckets de Kingdom;
  el aislamiento es por **tokens separados**, no por cuenta). Endpoint S3:
  `https://a9e701cae79abd58f54b1988d75088da.r2.cloudflarestorage.com`.
- Buckets creados el 2026-09-24 (storage class Standard):

| Bucket | Acceso | URL pública |
|---|---|---|
| `legacyenterprise-prod` | público | `https://pub-f6029b766af846bc9b8718c2c1bda616.r2.dev` |
| `legacyenterprise-prod-private` | privado (solo URLs prefirmadas) | — |
| `legacyenterprise-qa` | público | `https://pub-8b147f46d4ba457c8348c08838e835af.r2.dev` |
| `legacyenterprise-qa-private` | privado (solo URLs prefirmadas) | — |

- `legacysoftware.cloud` **no** está en Cloudflare, por eso los públicos usan `r2.dev` (sin dominio propio).
- Tokens S3 (Account API Tokens, propios de LegacyEnterprise, separados de los de Kingdom):
  `legacyenterprise-r2-prod` (solo los 2 buckets prod) y `legacyenterprise-r2-qa` (solo los 2 buckets qa).
  Los crea el dueño en el panel; las claves van directo al `.env` de cada entorno en la VPS, nunca al chat ni a git.
- **Los dos tokens tienen filtro de IP: solo funcionan desde la IP de `legacy-vps`** (verificado: el contenedor PHP
  sale por esa IPv4 y no usa IPv6). Sin vencimiento. Si se migra de servidor, editar el filtro de ambos tokens:
  un 403 de R2 en las subidas después de una migración es esto. Tampoco sirven desde una PC de desarrollo.

## Firebase

- Proyecto: `legacyenterprise-731cb` (config web en `frontend/src/environments/*`, pública por diseño).
- Proveedor **Google** habilitado. Dominios autorizados (verificado): `localhost`,
  `legacyenterprise-731cb.firebaseapp.com`, `legacyenterprise-731cb.web.app`, `legacyenterprise.web.app`,
  `legacyenterprise.firebaseapp.com`. El ID del proyecto lleva sufijo (`-731cb`, lo pone Firebase y no se puede cambiar);
  la URL pública es un **segundo sitio de Hosting** `legacyenterprise` en el mismo proyecto (`"site"` en `firebase.json`).
- Pendiente (usuario, para la Fase 4): clave **VAPID**.
- Pendiente (Fase 3–5): cuenta de servicio Admin SDK → `FCM_SERVICE_ACCOUNT_B64` en el `.env` de cada
  entorno; cuenta de servicio de Hosting → secret `FIREBASE_SERVICE_ACCOUNT`.

## Repositorio y CI

- `github.com/thegoodalejo/LegacyEnterprise`. Ramas `dev` (default) → `qa` → `pdn`.
- Llave de deploy propia: `gh_actions_legacyenterprise` (se crea en la Fase 5; el `.pub` va a
  `~dev01/.ssh/authorized_keys` de `legacy-vps`).
- Sin commit ni push hasta que el dueño lo pida.
