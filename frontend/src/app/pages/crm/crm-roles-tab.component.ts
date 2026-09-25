import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { CrmService, RolVinculo } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-rol-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatInput, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (r ? 'crm.config.edit_role' : 'crm.config.new_role') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.role_name' | translate }}</mat-label>
          <input matInput id="rol-nombre" [(ngModel)]="nombre" maxlength="60" required />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'crm.config.order' | translate }}</mat-label>
          <input matInput type="number" [(ngModel)]="orden" />
        </mat-form-field>
        <mat-slide-toggle [(ngModel)]="activo">{{ 'common.active' | translate }}</mat-slide-toggle>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-rol" (click)="save()" [disabled]="saving() || !nombre.trim()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class RolDialogComponent {
  readonly r = inject<RolVinculo | null>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<RolDialogComponent, boolean>);
  private crm = inject(CrmService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly saving = signal(false);
  nombre = this.r?.nombre ?? '';
  orden = this.r?.orden ?? 0;
  activo = this.r?.activo ?? true;

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const res = await this.crm.saveRol({ id: this.r?.id ?? 0, nombre: this.nombre.trim(), orden: this.orden ?? 0, activo: this.activo ? 1 : 0 });
      if (!res.action) { await this.dialogs.error({ title: this.i18n.t('crm.config.save_error'), message: res.mensaje }); return; }
      this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }
}

/** Pestaña «Roles»: lista por empresa de los roles que puede tener quien atiende por una organización. */
@Component({
  selector: 'app-crm-roles-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIconButton, MatIcon, TranslatePipe],
  template: `
    <div class="tab">
      <div class="head">
        <p class="muted">{{ 'crm.config.roles_hint' | translate }}</p>
        <button mat-flat-button id="btn-new-rol" (click)="edit(null)"><mat-icon>add</mat-icon>{{ 'crm.config.new_role' | translate }}</button>
      </div>
      <section class="block">
        @for (r of roles(); track r.id) {
          <div class="row" [class.off]="!r.activo">
            <strong class="name">{{ r.nombre }}</strong>
            @if (!r.activo) { <span class="pill off">{{ 'common.inactive' | translate }}</span> }
            <button mat-icon-button (click)="edit(r)" [attr.aria-label]="'common.edit' | translate"><mat-icon>edit</mat-icon></button>
          </div>
        } @empty { <p class="muted">{{ 'crm.config.no_roles' | translate }}</p> }
      </section>
    </div>
  `,
  styles: `
    .tab { padding: 20px 0; display: flex; flex-direction: column; gap: 16px; }
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; p { margin: 0; } }
    .block { display: flex; flex-direction: column; padding: 8px 16px; border-radius: 16px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); &:last-child { border: none; } &.off { opacity: 0.6; } }
    .name { flex: 1 1 160px; min-width: 0; overflow-wrap: anywhere; }
    .pill { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-on-surface-variant); }
  `,
})
export class CrmRolesTabComponent {
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private matDialog = inject(MatDialog);

  readonly roles = signal<RolVinculo[]>([]);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const r = await this.loading.wrap(() => this.crm.listRoles(false));
    if (r.action && r.data) this.roles.set(r.data.roles);
  }

  edit(r: RolVinculo | null): void {
    this.matDialog.open(RolDialogComponent, { ...dialogSize('480px'), data: r, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(saved => { if (saved) void this.load(); });
  }
}
