import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import { BrandingService } from '../../services/branding.service';
import { DialogService } from '../../services/dialog.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

/** Login con Google (popup de Firebase) + handshake con el backend. */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIcon, TranslatePipe],
  template: `
    <main class="wrap">
      <section class="card">
        <img class="logo" [src]="brand.logo()" alt="" />
        <h1>{{ brand.nombre() || ('app.name' | translate) }}</h1>
        <p class="tagline">{{ 'login.tagline' | translate }}</p>
        <button mat-flat-button class="google" id="btn-google" (click)="login()" [disabled]="busy()">
          <mat-icon>login</mat-icon>{{ (busy() ? 'login.signing_in' : 'login.google') | translate }}
        </button>
        <p class="legal">{{ 'login.legal' | translate }}</p>
      </section>
    </main>
  `,
  styles: `
    .wrap {
      min-height: 100%; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
      background:
        radial-gradient(circle at 15% 20%, color-mix(in srgb, var(--md-sys-color-primary-container) 70%, transparent), transparent 45%),
        radial-gradient(circle at 85% 80%, color-mix(in srgb, var(--md-sys-color-tertiary-container) 60%, transparent), transparent 45%),
        var(--md-sys-color-surface);
    }
    .card {
      width: 100%; max-width: 400px; box-sizing: border-box;
      display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center;
      padding: 40px 32px 28px; border-radius: 28px;
      background: var(--md-sys-color-surface-container-lowest);
      box-shadow: 0 8px 32px color-mix(in srgb, var(--md-sys-color-shadow) 12%, transparent);
    }
    .logo { width: 72px; height: 72px; object-fit: contain; margin-bottom: 4px; }
    h1 { margin: 0; font: var(--mat-sys-headline-small); font-weight: 600; }
    .tagline { margin: 0 0 16px; color: var(--md-sys-color-on-surface-variant); }
    .google { width: 100%; height: 48px; }
    .legal { margin: 12px 0 0; font: var(--mat-sys-body-small); color: var(--md-sys-color-on-surface-variant); }
    @media (max-width: 599px) { .card { padding: 32px 20px 24px; } }
  `,
})
export default class LoginPage {
  readonly brand = inject(BrandingService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  readonly busy = signal(false);

  async login(): Promise<void> {
    this.busy.set(true);
    try {
      const ok = await this.auth.loginWithGoogle();
      if (!ok) {
        await this.dialogs.error({ title: this.i18n.t('login.error_title'), message: this.i18n.t('login.error_backend') });
        return;
      }
      // El guard decide el destino final: sin sede → /onboarding.
      await this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('r') || '/home');
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      await this.dialogs.error({
        title: this.i18n.t('login.error_title'),
        message: code === 'auth/popup-blocked' ? this.i18n.t('login.error_popup') : this.i18n.t('login.error_generic'),
      });
    } finally {
      this.busy.set(false);
    }
  }
}
