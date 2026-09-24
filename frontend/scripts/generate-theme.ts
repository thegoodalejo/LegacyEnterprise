// Genera src/styles/_tokens.scss (paleta por defecto de Legacy Enterprise) con el mismo algoritmo
// que usa BrandingService para la marca blanca. Correr tras cambiar DEFAULT_BRAND:
//   npm run theme   (empaqueta con esbuild: la librería de color usa imports sin extensión que Node no resuelve)
import { writeFileSync } from 'node:fs';
import { DEFAULT_BRAND, brandCss, tokenNames } from '../src/app/theme/brand-scheme.ts';

const header = `// GENERADO por scripts/generate-theme.ts — no editar a mano.
// Semillas: primary ${DEFAULT_BRAND.primary} · secondary ${DEFAULT_BRAND.secondary} · tertiary ${DEFAULT_BRAND.tertiary}
// Única definición de colores de la app. La marca blanca de cada empresa los sobrescribe en runtime.

`;

// Angular Material lee --mat-sys-*; se redirigen a los tokens propios para que un solo cambio
// (la marca de la empresa) recoloree componentes de Material y propios por igual.
const bridge = `\n// Puente Angular Material → tokens propios.\n@mixin mat-sys-bridge {\n${tokenNames()
  .map(n => `  --mat-sys-${n}: var(--md-sys-color-${n});`)
  .join('\n')}\n}\n`;

writeFileSync('src/styles/_tokens.scss', header + brandCss(DEFAULT_BRAND) + bridge);
console.log('src/styles/_tokens.scss generado');
