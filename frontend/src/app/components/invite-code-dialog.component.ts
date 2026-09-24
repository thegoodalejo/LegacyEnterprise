import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { toDataURL } from 'qrcode';
import { DialogService } from '../services/dialog.service';
import { TranslatePipe, TranslationService } from '../services/translation.service';

export interface InviteCodeData {
  sedeNombre: string;
  codigo: string;
  /** Regenera el código y devuelve el nuevo (o null si falló). Sin esto no se ofrece regenerar. */
  regenerate?: () => Promise<string | null>;
}

/** Código de invitación de una sede: 8 caracteres + QR con /onboarding?codigo=… + copiar enlace. */
@Component({
  selector: 'app-invite-code-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButton, MatIcon, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'invite.title' | translate: { sede: data.sedeNombre } }}</h2>
    <mat-dialog-content>
      <p class="muted">{{ 'invite.desc' | translate }}</p>
      <div class="code" aria-live="polite">{{ codigo() }}</div>
      @if (qr(); as src) {
        <img class="qr" [src]="src" [alt]="'invite.qr_alt' | translate" width="220" height="220" />
      }
      <p class="link">{{ link() }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.regenerate) {
        <button mat-button (click)="regenerate()" [disabled]="busy()"><mat-icon>autorenew</mat-icon>{{ 'invite.regenerate' | translate }}</button>
      }
      <button mat-button (click)="copy()"><mat-icon>content_copy</mat-icon>{{ 'invite.copy' | translate }}</button>
      <button mat-flat-button mat-dialog-close>{{ 'common.close' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .code {
      margin: 8px auto 16px; padding: 12px 20px; width: fit-content; border-radius: 16px;
      font: 600 28px/1.2 ui-monospace, 'Cascadia Mono', Consolas, monospace; letter-spacing: 0.18em;
      background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
    }
    .qr { display: block; margin: 0 auto; border-radius: 12px; background: #fff; padding: 8px; box-sizing: content-box; }
    .link { margin: 12px 0 0; text-align: center; font: var(--mat-sys-body-small); color: var(--md-sys-color-on-surface-variant); overflow-wrap: anywhere; }
  `,
})
export class InviteCodeDialogComponent {
  readonly data = inject<InviteCodeData>(MAT_DIALOG_DATA);
  private snack = inject(MatSnackBar);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly codigo = signal(this.data.codigo);
  readonly link = signal('');
  readonly qr = signal<string | null>(null);
  readonly busy = signal(false);

  constructor() {
    void this.render();
  }

  async regenerate(): Promise<void> {
    if (!this.data.regenerate) return;
    const ok = await this.dialogs.confirm({
      title: this.i18n.t('invite.regenerate'), message: this.i18n.t('invite.regenerate_confirm'), confirmText: this.i18n.t('invite.regenerate'),
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const nuevo = await this.data.regenerate();
      if (nuevo) { this.codigo.set(nuevo); await this.render(); }
    } finally {
      this.busy.set(false);
    }
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.snack.open(this.i18n.t('invite.copied'), undefined, { duration: 2500 });
    } catch {
      this.snack.open(this.link(), this.i18n.t('common.close'), { duration: 8000 });
    }
  }

  private async render(): Promise<void> {
    const url = `${location.origin}/onboarding?codigo=${this.codigo()}`;
    this.link.set(url);
    // QR siempre negro sobre blanco (máximo contraste para las cámaras), independiente del tema.
    this.qr.set(await toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: 'M' }));
  }
}
