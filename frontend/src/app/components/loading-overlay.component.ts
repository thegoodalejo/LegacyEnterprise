import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoadingService } from '../services/loading.service';
import { BrandingService } from '../services/branding.service';

/**
 * Overlay global con el logo animado. Va una sola vez en app.html: <app-loading-overlay />
 * El logo es el de la marca activa (empresa o public/logo.svg por defecto), igual que el splash.
 */
@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading.visible()) {
      <div class="overlay" role="status" aria-live="polite">
        <div class="logo-wrap">
          <span class="ring"></span>
          <img class="logo" [src]="brand.logo()" alt="" />
        </div>
        @if (loading.message()) { <p class="text">{{ loading.message() }}</p> }
      </div>
    }
  `,
  styles: `
    .overlay {
      position: fixed; inset: 0; z-index: 2000;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
      background: color-mix(in srgb, var(--md-sys-color-surface) 72%, transparent);
      backdrop-filter: blur(2px);
      animation: fade-in 160ms ease-out;
    }
    .logo-wrap { position: relative; width: 96px; height: 96px; display: grid; place-items: center; }
    .logo { width: 56px; height: 56px; object-fit: contain; animation: pulse 1.4s ease-in-out infinite; }
    .ring {
      position: absolute; inset: 0; border-radius: 50%;
      border: 4px solid var(--md-sys-color-primary-container);
      border-top-color: var(--md-sys-color-primary);
      animation: spin 0.9s linear infinite;
    }
    .text { margin: 0; color: var(--md-sys-color-on-surface); font: var(--mat-sys-body-large, 500 16px/24px Roboto, sans-serif); }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { transform: scale(0.92); opacity: 0.85; } 50% { transform: scale(1.06); opacity: 1; } }
    @keyframes fade-in { from { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .logo, .ring { animation-duration: 3s; } }
  `,
})
export class LoadingOverlayComponent {
  loading = inject(LoadingService);
  brand = inject(BrandingService);
}
