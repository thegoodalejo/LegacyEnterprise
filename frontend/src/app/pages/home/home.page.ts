import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { BrandingService } from '../../services/branding.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe } from '../../services/translation.service';

/** Inicio: accesos a los módulos que el usuario puede abrir en la sede activa (misma lista que el app switcher). */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIcon, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'home.welcome' | translate: { name: brand.nombre() || ('app.name' | translate) } }}</h1>
      </header>

      @if (session.isNuevo()) {
        <div class="notice" role="status">
          <mat-icon>hourglass_top</mat-icon>
          <div>
            <strong>{{ 'home.pending_title' | translate }}</strong>
            <p>{{ 'home.pending_desc' | translate: { sede: session.sedeNombre() || '' } }}</p>
          </div>
        </div>
      } @else if (session.modules().length) {
        <p class="muted intro">{{ 'home.intro' | translate }}</p>
        <div class="modules">
          @for (m of session.modules(); track m.code) {
            <a class="module-card" [routerLink]="'/m/' + m.code">
              <span class="badge" [attr.data-tone]="m.tone"><mat-icon>{{ m.icon }}</mat-icon></span>
              <span class="text">
                <strong>{{ m.label | translate }}</strong>
                <span class="muted">{{ 'modules.' + m.code + '.desc' | translate }}</span>
              </span>
            </a>
          }
        </div>
      } @else {
        <div class="empty-state">
          <mat-icon>apps_outage</mat-icon>
          <strong>{{ 'home.no_modules_title' | translate }}</strong>
          <span>{{ (session.user()?.modulos_sede?.length ? 'home.no_access_desc' : 'home.no_modules_desc') | translate }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .intro { margin: 0 0 24px; }
    .modules { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .module-card {
      display: flex; align-items: center; gap: 16px; padding: 20px; border-radius: 20px;
      background: var(--md-sys-color-surface-container-low); color: var(--md-sys-color-on-surface);
      text-decoration: none; border: 1px solid var(--md-sys-color-outline-variant);
      transition: background 120ms ease;
      &:hover { background: var(--md-sys-color-surface-container); }
      &:focus-visible { outline: 2px solid var(--md-sys-color-primary); outline-offset: 2px; }
    }
    .badge {
      width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; flex: none;
      &[data-tone='primary'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-tone='secondary'] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
      &[data-tone='tertiary'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    }
    .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .notice {
      display: flex; gap: 16px; align-items: flex-start; padding: 20px; border-radius: 20px; max-width: 640px;
      background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container);
      p { margin: 4px 0 0; }
    }
    .empty-state strong { color: var(--md-sys-color-on-surface); }
    @media (max-width: 599px) { .modules { grid-template-columns: 1fr; } }
  `,
})
export default class HomePage {
  readonly brand = inject(BrandingService);
  readonly session = inject(SessionService);
  private router = inject(Router);

  constructor() {
    // Con un solo módulo (p. ej. un cliente que compró solo Comunicaciones), la primera entrada va directo a él. Solo la primera vez en
    // la sesión de la app: si después vuelve a Inicio (logo), se queda aquí y ve los accesos de administración.
    const mods = this.session.modules();
    if (mods.length === 1 && !this.session.isNuevo() && !HomePage.yaEntro) {
      HomePage.yaEntro = true;
      void this.router.navigateByUrl('/m/' + mods[0].code, { replaceUrl: true });
    }
    HomePage.yaEntro = true;
  }
  private static yaEntro = false;
}
