import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatSelect, MatOption } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatTooltip } from '@angular/material/tooltip';
import { InviteCodeDialogComponent, InviteCodeData } from '../../components/invite-code-dialog.component';
import { ApiService } from '../../services/api.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { MODULE_CODES, ROLE_RANK, SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';

interface SedeUser {
  id: number; email: string; nombre: string | null; foto_url: string | null;
  rol: string; privilegios: string[]; state: boolean; created_at: string;
}
interface UsersResponse {
  usuarios: SedeUser[]; roles: string[]; privilegios: string[]; modulos_sede: string[]; codigo_invitacion: string | null;
}

/** Usuarios de la sede activa: rol, privilegios (generales y de módulos contratados) y estado. L4+ o privilegio 'usuarios'. */
@Component({
  selector: 'app-usuarios-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIconButton, MatIcon, MatTableModule, MatTooltip, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'admin.users.title' | translate: { sede: session.sedeNombre() || '' } }}</h1>
        <div class="actions">
          <button mat-flat-button (click)="invite()" [disabled]="!data()?.codigo_invitacion">
            <mat-icon>qr_code_2</mat-icon>{{ 'admin.users.invite' | translate }}
          </button>
        </div>
      </header>

      @if (error()) {
        <div class="empty-state">
          <mat-icon>error</mat-icon><span>{{ error() }}</span>
          <button mat-button (click)="load()">{{ 'common.retry' | translate }}</button>
        </div>
      } @else if (data(); as d) {
        @if (d.usuarios.length) {
          <div class="table-scroll">
            <table mat-table [dataSource]="d.usuarios">
              <ng-container matColumnDef="usuario">
                <th mat-header-cell *matHeaderCellDef>{{ 'admin.users.user' | translate }}</th>
                <td mat-cell *matCellDef="let u">
                  <div class="who">
                    <strong>{{ u.nombre || u.email }}</strong>
                    <span class="muted">{{ u.email }}</span>
                  </div>
                </td>
              </ng-container>
              <ng-container matColumnDef="rol">
                <th mat-header-cell *matHeaderCellDef>{{ 'admin.users.role' | translate }}</th>
                <td mat-cell *matCellDef="let u"><span class="pill" [class.new]="u.rol === 'Nuevo'">{{ 'roles.' + u.rol | translate }}</span></td>
              </ng-container>
              <ng-container matColumnDef="acceso">
                <th mat-header-cell *matHeaderCellDef>{{ 'admin.users.access' | translate }}</th>
                <td mat-cell *matCellDef="let u">{{ accessSummary(u) }}</td>
              </ng-container>
              <ng-container matColumnDef="estado">
                <th mat-header-cell *matHeaderCellDef>{{ 'admin.users.state' | translate }}</th>
                <td mat-cell *matCellDef="let u">{{ (u.state ? 'common.active' : 'common.inactive') | translate }}</td>
              </ng-container>
              <ng-container matColumnDef="acciones">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let u" class="row-actions">
                  <button mat-icon-button (click)="edit(u)" [disabled]="!canEdit(u)"
                          [matTooltip]="(canEdit(u) ? 'admin.users.edit' : 'admin.users.cannot_edit') | translate"
                          [attr.aria-label]="'admin.users.edit' | translate">
                    <mat-icon>manage_accounts</mat-icon>
                  </button>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let u; columns: columns" [class.inactive]="!u.state"></tr>
            </table>
          </div>
        } @else {
          <div class="empty-state">
            <mat-icon>group_add</mat-icon>
            <strong>{{ 'admin.users.empty' | translate }}</strong>
            <button mat-flat-button (click)="invite()">{{ 'admin.users.invite' | translate }}</button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .who { display: flex; flex-direction: column; padding: 8px 0; }
    .pill { padding: 2px 10px; border-radius: 8px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); white-space: nowrap; }
    .pill.new { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    tr.inactive td { opacity: 0.55; }
    .row-actions { text-align: right; width: 56px; }
  `,
})
export default class UsuariosPage {
  readonly session = inject(SessionService);
  private api = inject(ApiService);
  private loading = inject(LoadingService);
  private matDialog = inject(MatDialog);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly columns = ['usuario', 'rol', 'acceso', 'estado', 'acciones'];
  readonly data = signal<UsersResponse | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
    this.session.sedeChanged.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      const r = await this.loading.wrap(() => this.api.post<UsersResponse>('sedes/list_sede_users.php'));
      if (r.action && r.data) this.data.set(r.data);
      else this.error.set(r.mensaje);
    } catch {
      this.error.set(this.i18n.t('common.error'));
    }
  }

  /** Misma regla que update_user_access.php: nadie se edita a sí mismo; L4 solo a rangos menores. */
  canEdit(u: SedeUser): boolean {
    const me = this.session.user();
    if (!me || u.id === me.id) return false;
    if (me.is_platform_admin) return true;
    return (ROLE_RANK[u.rol] ?? 99) < (ROLE_RANK[me.rol ?? ''] ?? -1);
  }

  accessSummary(u: SedeUser): string {
    if (u.rol === 'Nuevo') return this.i18n.t('admin.users.pending');
    if ((ROLE_RANK[u.rol] ?? 0) >= ROLE_RANK['L4']) return this.i18n.t('admin.users.all_modules');
    const mods = u.privilegios.filter(p => (MODULE_CODES as readonly string[]).includes(p)).map(p => this.i18n.t('modules.' + p));
    return mods.length ? mods.join(', ') : this.i18n.t('admin.users.no_modules');
  }

  invite(): void {
    const d = this.data();
    if (!d?.codigo_invitacion) return;
    const data: InviteCodeData = {
      sedeNombre: this.session.sedeNombre() ?? '',
      codigo: d.codigo_invitacion,
      regenerate: async () => {
        const r = await this.api.post<{ codigo_invitacion: string }>('sedes/regenerar_codigo.php');
        if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('common.error'), message: r.mensaje }); return null; }
        this.data.update(x => (x ? { ...x, codigo_invitacion: r.data!.codigo_invitacion } : x));
        return r.data.codigo_invitacion;
      },
    };
    this.matDialog.open(InviteCodeDialogComponent, { ...dialogSize('480px'), data });
  }

  edit(u: SedeUser): void {
    const d = this.data();
    if (!d) return;
    const myRank = this.session.isPlatformAdmin() ? 99 : (ROLE_RANK[this.session.rol() ?? ''] ?? -1);
    this.matDialog.open(AccessDialogComponent, {
      ...dialogSize('560px'),
      data: {
        user: u,
        roles: d.roles.filter(r => (ROLE_RANK[r] ?? 99) < myRank),
        generales: d.privilegios.filter(p => !(MODULE_CODES as readonly string[]).includes(p)),
        modulos: d.modulos_sede,
      } satisfies AccessDialogData,
    }).afterClosed().subscribe(changed => { if (changed) void this.load(); });
  }
}

interface AccessDialogData { user: SedeUser; roles: string[]; generales: string[]; modulos: string[] }

@Component({
  selector: 'app-access-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatHint, MatSelect, MatOption, MatCheckbox, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ d.user.nombre || d.user.email }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'admin.users.role' | translate }}</mat-label>
          <mat-select [ngModel]="rol()" (ngModelChange)="rol.set($event)">
            @for (r of d.roles; track r) { <mat-option [value]="r">{{ 'roles.' + r | translate }}</mat-option> }
          </mat-select>
          <mat-hint>{{ 'admin.users.role_hint' | translate }}</mat-hint>
        </mat-form-field>

        <fieldset>
          <legend>{{ 'admin.users.modules' | translate }}</legend>
          @if (isAdminRole()) {
            <p class="muted small">{{ 'admin.users.admin_all_modules' | translate }}</p>
          } @else if (d.modulos.length) {
            <div class="checks">
              @for (m of d.modulos; track m) {
                <mat-checkbox [checked]="privs().has(m)" (change)="toggle(m, $event.checked)">{{ 'modules.' + m | translate }}</mat-checkbox>
              }
            </div>
          } @else {
            <p class="muted small">{{ 'admin.users.no_contracted' | translate }}</p>
          }
        </fieldset>

        <fieldset>
          <legend>{{ 'admin.users.privileges' | translate }}</legend>
          <div class="checks">
            @for (p of d.generales; track p) {
              <mat-checkbox [checked]="privs().has(p)" (change)="toggle(p, $event.checked)">{{ 'privileges.' + p | translate }}</mat-checkbox>
            }
          </div>
        </fieldset>

        <mat-slide-toggle [(ngModel)]="state">{{ 'admin.users.active_toggle' | translate }}</mat-slide-toggle>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button (click)="save()" [disabled]="saving()">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    fieldset { border: 1px solid var(--md-sys-color-outline-variant); border-radius: 12px; padding: 8px 16px 12px; margin: 0; }
    legend { padding: 0 6px; font: var(--mat-sys-label-large); color: var(--md-sys-color-on-surface-variant); }
    .checks { display: flex; flex-wrap: wrap; gap: 0 16px; }
    .small { margin: 4px 0; font: var(--mat-sys-body-small); }
  `,
})
export class AccessDialogComponent {
  readonly d = inject<AccessDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AccessDialogComponent, boolean>);
  private api = inject(ApiService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly rol = signal(this.d.roles.includes(this.d.user.rol) ? this.d.user.rol : this.d.roles[this.d.roles.length - 1]);
  state = this.d.user.state;
  readonly privs = signal(new Set(this.d.user.privilegios));
  readonly saving = signal(false);
  /** L4 ve todos los módulos contratados: no hace falta marcar privilegios de módulo. */
  readonly isAdminRole = computed(() => (ROLE_RANK[this.rol()] ?? 0) >= ROLE_RANK['L4']);

  toggle(p: string, on: boolean): void {
    this.privs.update(s => { const n = new Set(s); if (on) n.add(p); else n.delete(p); return n; });
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.api.post('sedes/update_user_access.php', {
        id_usuario: this.d.user.id, rol: this.rol(), privilegios: [...this.privs()], state: this.state ? 1 : 0,
      });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('admin.users.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } catch {
      await this.dialogs.error({ title: this.i18n.t('admin.users.save_error'), message: this.i18n.t('common.error') });
    } finally {
      this.saving.set(false);
    }
  }
}
