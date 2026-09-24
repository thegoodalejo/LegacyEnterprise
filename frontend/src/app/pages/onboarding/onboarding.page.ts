import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { SedePickerDialogComponent } from '../../components/sede-switcher.component';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { BrandingService } from '../../services/branding.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService, SessionUser } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

/**
 * Usuario sin sede: se une con el código de 8 caracteres (o el QR, que abre /onboarding?codigo=XXXX).
 * L5 sin sede: elige una sede como soporte o va al panel de plataforma.
 */
@Component({
  selector: 'app-onboarding-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, MatButton, MatFormField, MatLabel, MatHint, MatInput, MatIcon, TranslatePipe],
  template: `
    <main class="wrap">
      <section class="card">
        <img class="logo" [src]="brand.logo()" alt="" />
        <h1>{{ 'onboarding.title' | translate: { name: session.user()?.nombre || '' } }}</h1>

        @if (session.isPlatformAdmin()) {
          <p class="muted">{{ 'onboarding.platform_desc' | translate }}</p>
          <div class="actions">
            <button mat-flat-button (click)="pickSede()"><mat-icon>support_agent</mat-icon>{{ 'onboarding.pick_sede' | translate }}</button>
            <a mat-stroked-button routerLink="/admin/sedes"><mat-icon>store</mat-icon>{{ 'nav.admin.sedes' | translate }}</a>
          </div>
        } @else {
          <p class="muted">{{ 'onboarding.desc' | translate }}</p>
          <form class="form-grid" (ngSubmit)="join()">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ 'onboarding.code' | translate }}</mat-label>
              <input matInput id="codigo" name="codigo" [(ngModel)]="code" maxlength="8" autocomplete="off"
                     autocapitalize="characters" spellcheck="false" class="code-input" />
              <mat-hint>{{ 'onboarding.code_hint' | translate }}</mat-hint>
            </mat-form-field>
            <button mat-flat-button type="submit" [disabled]="busy() || code.trim().length !== 8">
              {{ 'onboarding.join' | translate }}
            </button>
          </form>
        }
        <button mat-button class="logout" (click)="logout()"><mat-icon>logout</mat-icon>{{ 'shell.logout' | translate }}</button>
      </section>
    </main>
  `,
  styles: `
    .wrap { min-height: 100%; display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: var(--md-sys-color-surface-container-low); }
    .card {
      width: 100%; max-width: 440px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px;
      padding: 32px; border-radius: 28px; background: var(--md-sys-color-surface-container-lowest);
      box-shadow: 0 8px 32px color-mix(in srgb, var(--md-sys-color-shadow) 10%, transparent);
    }
    .logo { width: 56px; height: 56px; object-fit: contain; }
    h1 { margin: 0; font: var(--mat-sys-headline-small); }
    .muted { margin: 0 0 8px; }
    .code-input { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; letter-spacing: 0.15em; text-transform: uppercase; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .logout { align-self: flex-start; margin-top: 8px; }
    @media (max-width: 599px) { .card { padding: 24px 20px; } }
  `,
})
export default class OnboardingPage implements OnInit {
  /** ?codigo=XXXX desde el QR (withComponentInputBinding). */
  readonly codigo = input<string>();

  readonly session = inject(SessionService);
  readonly brand = inject(BrandingService);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private router = inject(Router);
  private i18n = inject(TranslationService);

  code = '';
  readonly busy = signal(false);

  ngOnInit(): void {
    const c = (this.codigo() ?? '').trim().toUpperCase();
    if (/^[A-Z0-9]{8}$/.test(c)) {
      this.code = c;
      void this.join();
    }
  }

  async join(): Promise<void> {
    const codigo = this.code.trim().toUpperCase();
    if (codigo.length !== 8) return;
    this.busy.set(true);
    try {
      const r = await this.loading.wrap(() => this.api.post<SessionUser>('sedes/join_sede.php', { codigo }));
      if (!r.action || !r.data) {
        await this.dialogs.error({ title: this.i18n.t('onboarding.error_title'), message: r.mensaje });
        return;
      }
      this.session.set(r.data);
      await this.router.navigateByUrl('/home');
    } catch {
      // LoadingService ya mostró el error genérico.
    } finally {
      this.busy.set(false);
    }
  }

  pickSede(): void {
    this.matDialog.open(SedePickerDialogComponent, { ...dialogSize('560px'), autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(async (id?: number) => {
        if (!id) return;
        const err = await this.loading.wrap(() => this.session.switchSede(id));
        if (err) await this.dialogs.error({ title: this.i18n.t('sede.switch_error'), message: err });
      });
  }

  logout(): void {
    void this.auth.logout();
  }
}
