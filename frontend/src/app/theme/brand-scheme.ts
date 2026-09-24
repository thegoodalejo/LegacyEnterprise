import { DynamicScheme, Hct, TonalPalette, Variant, argbFromHex, hexFromArgb } from '@material/material-color-utilities';

/**
 * Paleta de marca: 3 colores semilla → tokens M3 `--md-sys-color-*` (claro y oscuro).
 * La usan scripts/generate-theme.ts (paleta por defecto, compilada en src/styles/_tokens.scss) y
 * BrandingService (marca blanca de la empresa, en runtime). Mismo algoritmo en los dos lados:
 * una empresa con los colores por defecto se ve idéntica a la app sin marca.
 * Sin sintaxis que no sea "erasable" (enums, parameter properties): Node la ejecuta con type stripping.
 */
export interface BrandSeeds {
  primary: string;
  secondary: string;
  tertiary: string;
}

export const DEFAULT_BRAND: BrandSeeds = { primary: '#3949AB', secondary: '#546E7A', tertiary: '#00A08A' };

/** Roles M3 que se exportan como `--md-sys-color-<kebab>`; los mismos nombres usa Angular Material en `--mat-sys-*`. */
const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant', 'inversePrimary',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'secondaryFixed', 'secondaryFixedDim', 'onSecondaryFixed', 'onSecondaryFixedVariant',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'tertiaryFixed', 'tertiaryFixedDim', 'onTertiaryFixed', 'onTertiaryFixedVariant',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground', 'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest', 'surfaceTint',
  'inverseSurface', 'inverseOnSurface', 'outline', 'outlineVariant', 'shadow', 'scrim',
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

export function isValidSeeds(s: Partial<BrandSeeds> | null | undefined): s is BrandSeeds {
  return !!s && HEX.test(s.primary ?? '') && HEX.test(s.secondary ?? '') && HEX.test(s.tertiary ?? '');
}

/** Tokens de un modo (claro u oscuro): `{ 'primary': '#3949ab', 'on-primary': '#ffffff', … }`. */
export function brandTokens(seeds: BrandSeeds, isDark: boolean): Record<string, string> {
  const source = Hct.fromInt(argbFromHex(seeds.primary));
  const scheme = new DynamicScheme({
    sourceColorHct: source,
    variant: Variant.TONAL_SPOT,
    contrastLevel: 0,
    isDark,
    primaryPalette: TonalPalette.fromInt(argbFromHex(seeds.primary)),
    secondaryPalette: TonalPalette.fromInt(argbFromHex(seeds.secondary)),
    tertiaryPalette: TonalPalette.fromInt(argbFromHex(seeds.tertiary)),
    // Neutros con un toque del tono primario: superficies coherentes con la marca, sin teñirse.
    neutralPalette: TonalPalette.fromHueAndChroma(source.hue, 4),
    neutralVariantPalette: TonalPalette.fromHueAndChroma(source.hue, 8),
  });

  const out: Record<string, string> = {};
  for (const role of ROLES) out[kebab(role)] = hexFromArgb(scheme[role]);
  // Angular Material usa además estos dos tonos sueltos (tooltips, snackbars).
  out['neutral10'] = hexFromArgb(scheme.neutralPalette.tone(10));
  out['neutral-variant20'] = hexFromArgb(scheme.neutralVariantPalette.tone(20));
  return out;
}

/** Bloque CSS con los tokens de claro (`:root`) y oscuro (`:root.dark-theme`). */
export function brandCss(seeds: BrandSeeds): string {
  const block = (sel: string, t: Record<string, string>) =>
    `${sel} {\n${Object.entries(t).map(([k, v]) => `  --md-sys-color-${k}: ${v};`).join('\n')}\n}`;
  return `${block(':root', brandTokens(seeds, false))}\n\n${block(':root.dark-theme', brandTokens(seeds, true))}\n`;
}

/** Nombres de los tokens, para mapear `--mat-sys-*` → `--md-sys-color-*` en styles.scss. */
export function tokenNames(): string[] {
  return [...ROLES.map(kebab), 'neutral10', 'neutral-variant20'];
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
}
