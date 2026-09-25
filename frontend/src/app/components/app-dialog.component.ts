import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '../services/translation.service';

export interface AppDialogData {
  variant: 'info' | 'success' | 'error' | 'confirm';
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** Acción destructiva: botón en color de error. */
  danger?: boolean;
  /** Palabra que hay que escribir para habilitar Confirmar (solo `confirm`); se compara sin mayúsculas ni espacios de más. */
  confirmWord?: string;
}

const ICONS: Record<AppDialogData['variant'], string> = {
  info: 'info', success: 'check_circle', error: 'error', confirm: 'help',
};

/** Único diálogo de mensajes/confirmaciones de la app. Se abre solo vía DialogService. */
@Component({
  selector: 'app-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, TranslatePipe],
  template: `
    <div class="head" [class]="d.danger ? 'danger' : d.variant">
      <mat-icon>{{ d.danger ? 'warning' : icon }}</mat-icon>
      <h2 mat-dialog-title>{{ d.title }}</h2>
    </div>
    <mat-dialog-content>
      <p class="msg">{{ d.message }}</p>
      @if (d.confirmWord) {
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="word">
          <mat-label>{{ 'dialog.type_to_confirm' | translate: { word: d.confirmWord } }}</mat-label>
          <input matInput id="confirm-word" [ngModel]="typed()" (ngModelChange)="typed.set($event)" autocomplete="off" autocapitalize="off" spellcheck="false" />
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (d.variant === 'confirm') {
        <button mat-button [mat-dialog-close]="false">{{ d.cancelText || ('common.cancel' | translate) }}</button>
        <button mat-flat-button id="btn-confirm" [class.danger-btn]="d.danger" [mat-dialog-close]="true" [disabled]="!wordOk()" cdkFocusInitial>
          {{ d.confirmText || ('common.confirm' | translate) }}
        </button>
      } @else {
        <button mat-flat-button [mat-dialog-close]="true" cdkFocusInitial>{{ d.confirmText || ('common.ok' | translate) }}</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 12px; padding: 20px 24px 0; }
    .head h2 { margin: 0; padding: 0; }
    .head mat-icon { flex: none; }
    .info mat-icon, .confirm mat-icon { color: var(--md-sys-color-primary); }
    .success mat-icon { color: var(--md-sys-color-tertiary); }
    .error mat-icon, .danger mat-icon { color: var(--md-sys-color-error); }
    .msg { margin: 0; white-space: pre-line; color: var(--md-sys-color-on-surface-variant); }
    .danger-btn {
      --mat-button-filled-container-color: var(--md-sys-color-error); --mat-button-filled-label-text-color: var(--md-sys-color-on-error);
      background: var(--md-sys-color-error); color: var(--md-sys-color-on-error);
    }
    .danger-btn[disabled] { opacity: 0.38; }
    .word { margin-top: 16px; }
  `,
})
export class AppDialogComponent {
  d = inject<AppDialogData>(MAT_DIALOG_DATA);
  icon = ICONS[this.d.variant];
  readonly typed = signal('');
  readonly wordOk = computed(() => !this.d.confirmWord || this.typed().trim().toLowerCase() === this.d.confirmWord.trim().toLowerCase());
}
