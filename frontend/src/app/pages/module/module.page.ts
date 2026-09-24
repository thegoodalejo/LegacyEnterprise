import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { findModule } from '../../modules/app-modules';
import { TranslatePipe } from '../../services/translation.service';

/** Placeholder de un módulo (/m/:code y /m/:code/:section) hasta que se construya su lógica de negocio. */
@Component({
  selector: 'app-module-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButton, MatIcon, TranslatePipe],
  template: `
    <div class="page">
      @if (module(); as m) {
        <header class="page-header">
          <h1>{{ m.label | translate }}</h1>
        </header>
        <div class="empty-state">
          <span class="badge" [attr.data-tone]="m.tone"><mat-icon>{{ m.icon }}</mat-icon></span>
          <strong>{{ 'module.soon_title' | translate }}</strong>
          <span>{{ 'modules.' + m.code + '.desc' | translate }}</span>
          <a mat-button routerLink="/home"><mat-icon>arrow_back</mat-icon>{{ 'nav.home' | translate }}</a>
        </div>
      } @else {
        <div class="empty-state">
          <mat-icon>search_off</mat-icon>
          <strong>{{ 'module.not_found' | translate }}</strong>
          <a mat-button routerLink="/home">{{ 'nav.home' | translate }}</a>
        </div>
      }
    </div>
  `,
  styles: `
    .badge {
      width: 72px; height: 72px; border-radius: 24px; display: grid; place-items: center; margin-bottom: 8px;
      mat-icon { font-size: 36px; width: 36px; height: 36px; }
      &[data-tone='primary'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-tone='secondary'] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
      &[data-tone='tertiary'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    }
    strong { color: var(--md-sys-color-on-surface); font: var(--mat-sys-title-medium); }
  `,
})
export default class ModulePage {
  readonly code = input<string>();
  readonly section = input<string>();
  readonly module = computed(() => findModule(this.code()));
}
