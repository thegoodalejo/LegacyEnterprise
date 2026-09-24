import { Injectable, computed, signal } from '@angular/core';
import { BrandSeeds, DEFAULT_BRAND, brandCss, isValidSeeds } from '../theme/brand-scheme';

/** Marca de la empresa de la sede activa. Campos en null = marca Legacy Enterprise. */
export interface Brand {
  nombre: string | null;
  logoUrl: string | null;
  seeds: BrandSeeds | null;
}

const DEFAULT_LOGO = 'logo.svg';
const CACHE_KEY = 'le_brand';
const STYLE_ID = 'brand-tokens';

/**
 * Marca blanca: paleta y logo de la empresa.
 * - Colores: genera los tokens M3 desde las 3 semillas (mismo algoritmo que la paleta por defecto)
 *   y los inyecta en un <style> al final del <head>, que gana a styles/_tokens.scss por orden.
 * - Logo: `logo()` lo usan la barra, el loader y el splash (este último vía localStorage).
 * La sesión (Fase 2) llama a `apply()` con la marca de la empresa de la sede activa y `reset()` al salir.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private brand = signal<Brand>({ nombre: null, logoUrl: null, seeds: null });

  readonly logo = computed(() => this.brand().logoUrl || DEFAULT_LOGO);
  readonly nombre = computed(() => this.brand().nombre);
  readonly isCustom = computed(() => !!this.brand().logoUrl || !!this.brand().seeds);

  apply(brand: Brand): void {
    const seeds = isValidSeeds(brand.seeds) ? brand.seeds : null;
    this.brand.set({ ...brand, seeds });
    this.writeTokens(seeds);
    this.cache(brand.logoUrl, seeds);
  }

  reset(): void {
    this.apply({ nombre: null, logoUrl: null, seeds: null });
  }

  private writeTokens(seeds: BrandSeeds | null): void {
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    const isDefault = !seeds || (seeds.primary === DEFAULT_BRAND.primary && seeds.secondary === DEFAULT_BRAND.secondary
      && seeds.tertiary === DEFAULT_BRAND.tertiary);
    if (isDefault) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = brandCss(seeds);
  }

  /** Para el splash de index.html: la próxima carga arranca ya con esta marca. */
  private cache(logoUrl: string | null, seeds: BrandSeeds | null): void {
    try {
      if (!logoUrl && !seeds) localStorage.removeItem(CACHE_KEY);
      else localStorage.setItem(CACHE_KEY, JSON.stringify({ logo: logoUrl, primary: seeds?.primary ?? null }));
    } catch { /* sin storage: el splash usa la marca por defecto */ }
  }
}
