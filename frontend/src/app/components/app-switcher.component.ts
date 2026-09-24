import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { RouterLink } from '@angular/router';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { AppModule } from '../modules/app-modules';
import { TranslatePipe } from '../services/translation.service';

/**
 * App switcher estilo Google: botón de cuadrícula en la barra superior que abre un panel con los
 * módulos disponibles. Recibe la lista YA filtrada (habilitados en la sede ∩ permitidos al usuario):
 * este componente no decide acceso, solo lo muestra.
 */
@Component({
  selector: 'app-app-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, CdkTrapFocus, RouterLink, MatIconButton, MatIcon, MatTooltip, TranslatePipe],
  template: `
    <button
      mat-icon-button
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      class="trigger"
      [class.open]="open()"
      (click)="open.set(!open())"
      [matTooltip]="'switcher.title' | translate"
      [attr.aria-label]="'switcher.title' | translate"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
    >
      <mat-icon>apps</mat-icon>
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      [cdkConnectedOverlayViewportMargin]="8"
      [cdkConnectedOverlayPush]="true"
      (backdropClick)="close()"
      (detach)="close()"
      (overlayKeydown)="onKeydown($event)"
    >
      <div class="panel" role="dialog" [attr.aria-label]="'switcher.title' | translate" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
        @if (modules().length) {
          <nav class="grid">
            @for (m of modules(); track m.code) {
              <a class="tile" [routerLink]="'/m/' + m.code" (click)="close()" [class.active]="m.code === active()"
                 [attr.aria-current]="m.code === active() ? 'page' : null">
                <span class="badge" [attr.data-tone]="m.tone"><mat-icon>{{ m.icon }}</mat-icon></span>
                <span class="label">{{ m.label | translate }}</span>
              </a>
            }
          </nav>
        } @else {
          <p class="empty">{{ 'switcher.empty' | translate }}</p>
        }
        <a class="home-link" routerLink="/home" (click)="close()">
          <mat-icon>home</mat-icon>{{ 'nav.home' | translate }}
        </a>
      </div>
    </ng-template>
  `,
  styles: `
    .trigger.open { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
    .panel {
      width: min(336px, calc(100vw - 16px));
      max-height: calc(100vh - 88px);
      overflow-y: auto;
      padding: 16px;
      box-sizing: border-box;
      border-radius: 24px;
      background: var(--md-sys-color-surface-container-high);
      color: var(--md-sys-color-on-surface);
      box-shadow: 0 8px 28px color-mix(in srgb, var(--md-sys-color-shadow) 22%, transparent);
      animation: pop 140ms ease-out;
    }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
    .tile {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 14px 4px 12px; border-radius: 16px;
      color: inherit; text-decoration: none; text-align: center;
      outline: none;
      &:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }
      &:focus-visible { box-shadow: inset 0 0 0 2px var(--md-sys-color-primary); }
      &.active { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
    }
    .badge {
      width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center;
      mat-icon { font-size: 26px; width: 26px; height: 26px; }
      &[data-tone='primary'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-tone='secondary'] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
      &[data-tone='tertiary'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    }
    // label-medium: "Integraciones" cabe entero en 3 columnas; nunca partir una palabra a la mitad.
    .label { font: var(--mat-sys-label-medium); line-height: 1.25; overflow-wrap: break-word; hyphens: auto; }
    .empty { margin: 8px; color: var(--md-sys-color-on-surface-variant); text-align: center; }
    .home-link {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      margin-top: 12px; padding: 10px; border-radius: 999px;
      color: var(--md-sys-color-primary); text-decoration: none; font: var(--mat-sys-label-large);
      border: 1px solid var(--md-sys-color-outline-variant);
      &:hover { background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent); }
    }
    @keyframes pop { from { opacity: 0; transform: translateY(-6px) scale(0.98); } }
    @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
  `,
})
export class AppSwitcherComponent {
  readonly modules = input.required<readonly AppModule[]>();
  readonly active = input<string | null>(null);
  readonly open = signal(false);

  readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];

  close(): void {
    this.open.set(false);
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.close();
  }
}
