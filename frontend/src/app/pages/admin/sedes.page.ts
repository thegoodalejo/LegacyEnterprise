import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { InviteCodeDialogComponent, InviteCodeData } from '../../components/invite-code-dialog.component';
import { findModule } from '../../modules/app-modules';
import { ApiService } from '../../services/api.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { Empresa } from './empresas.page';

interface SedeAdmin {
  id: number; nombre: string; codigo_invitacion: string; activo: boolean;
  id_empresa: number; empresa_nombre: string; usuarios: number; modulos: string[];
}

/** Panel de plataforma (L5): sedes de todas las empresas, contrato de módulos y acceso de soporte. */
@Component({
  selector: 'app-sedes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButton, MatIconButton, MatFormField, MatLabel, MatPrefix, MatInput, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger,
    MatSelect, MatOption, MatTableModule, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'admin.sedes.title' | translate }}</h1>
        <div class="actions">
          <button mat-flat-button id="btn-new-sede" (click)="editSede(null)" [disabled]="!empresas().length"><mat-icon>add</mat-icon>{{ 'admin.sedes.new' | translate }}</button>
        </div>
      </header>

      <div class="filters form-row">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'sede.search' | translate }}</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput [ngModel]="q()" (ngModelChange)="q.set($event)" autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'admin.sedes.company' | translate }}</mat-label>
          <mat-select [ngModel]="empresaFiltro()" (ngModelChange)="empresaFiltro.set($event)">
            <mat-option [value]="0">{{ 'admin.sedes.all_companies' | translate }}</mat-option>
            @for (e of empresas(); track e.id) { <mat-option [value]="e.id">{{ e.nombre }}</mat-option> }
          </mat-select>
        </mat-form-field>
      </div>

      @if (filtered().length) {
        <div class="table-scroll">
          <table mat-table [dataSource]="filtered()">
            <ng-container matColumnDef="sede">
              <th mat-header-cell *matHeaderCellDef>{{ 'admin.sedes.sede' | translate }}</th>
              <td mat-cell *matCellDef="let s">
                <div class="who"><strong>{{ s.nombre }}</strong><span class="muted">#{{ s.id }} · {{ s.empresa_nombre }}</span></div>
              </td>
            </ng-container>
            <ng-container matColumnDef="codigo">
              <th mat-header-cell *matHeaderCellDef>{{ 'admin.sedes.code' | translate }}</th>
              <td mat-cell *matCellDef="let s"><code>{{ s.codigo_invitacion }}</code></td>
            </ng-container>
            <ng-container matColumnDef="usuarios">
              <th mat-header-cell *matHeaderCellDef>{{ 'admin.sedes.users' | translate }}</th>
              <td mat-cell *matCellDef="let s">{{ s.usuarios }}</td>
            </ng-container>
            <ng-container matColumnDef="modulos">
              <th mat-header-cell *matHeaderCellDef>{{ 'admin.sedes.modules' | translate }}</th>
              <td mat-cell *matCellDef="let s">
                <div class="chips">
                  @for (m of s.modulos; track m) { <span class="chip">{{ moduleLabel(m) | translate }}</span> }
                  @empty { <span class="muted">{{ 'admin.sedes.no_modules' | translate }}</span> }
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef>{{ 'admin.users.state' | translate }}</th>
              <td mat-cell *matCellDef="let s">{{ (s.activo ? 'common.active' : 'common.inactive') | translate }}</td>
            </ng-container>
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let s" class="row-actions">
                <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'common.more' | translate"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #menu="matMenu" xPosition="before">
                  <button mat-menu-item (click)="support(s)"><mat-icon>support_agent</mat-icon>{{ 'admin.sedes.enter_support' | translate }}</button>
                  <button mat-menu-item (click)="modules(s)"><mat-icon>apps</mat-icon>{{ 'admin.sedes.manage_modules' | translate }}</button>
                  <button mat-menu-item (click)="invite(s)"><mat-icon>qr_code_2</mat-icon>{{ 'admin.users.invite' | translate }}</button>
                  <button mat-menu-item (click)="editSede(s)"><mat-icon>edit</mat-icon>{{ 'common.edit' | translate }}</button>
                  <button mat-menu-item (click)="toggleActive(s)">
                    <mat-icon>{{ s.activo ? 'block' : 'check_circle' }}</mat-icon>{{ (s.activo ? 'admin.sedes.deactivate' : 'admin.sedes.activate') | translate }}
                  </button>
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let s; columns: columns" [class.inactive]="!s.activo" [class.current]="s.id === session.sedeId()"></tr>
          </table>
        </div>
      } @else {
        <div class="empty-state">
          <mat-icon>store</mat-icon>
          <strong>{{ (empresas().length ? 'admin.sedes.empty' : 'admin.sedes.need_company') | translate }}</strong>
        </div>
      }
    </div>
  `,
  styles: `
    .filters { margin-bottom: 16px; max-width: 720px; }
    .who { display: flex; flex-direction: column; padding: 8px 0; }
    code { font: 600 14px/1 ui-monospace, 'Cascadia Mono', Consolas, monospace; letter-spacing: 0.08em; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 0; }
    .chip { padding: 2px 8px; border-radius: 8px; background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font: var(--mat-sys-label-small); }
    tr.inactive td { opacity: 0.55; }
    tr.current td { background: color-mix(in srgb, var(--md-sys-color-tertiary-container) 40%, transparent); }
    .row-actions { text-align: right; width: 56px; }
  `,
})
export default class SedesPage implements OnInit {
  /** ?empresa=ID desde el panel de empresas. */
  readonly empresa = input<string>();

  readonly session = inject(SessionService);
  private api = inject(ApiService);
  private loading = inject(LoadingService);
  private matDialog = inject(MatDialog);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly columns = ['sede', 'codigo', 'usuarios', 'modulos', 'estado', 'acciones'];
  readonly sedes = signal<SedeAdmin[]>([]);
  readonly empresas = signal<Empresa[]>([]);
  readonly q = signal('');
  readonly empresaFiltro = signal(0);
  readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const e = this.empresaFiltro();
    return this.sedes().filter(s => (!e || s.id_empresa === e) && (!q || s.nombre.toLowerCase().includes(q) || String(s.id) === q));
  });

  ngOnInit(): void {
    this.empresaFiltro.set(Number(this.empresa() ?? 0) || 0);
    void this.load();
  }

  async load(): Promise<void> {
    const [s, e] = await this.loading.wrap(() => Promise.all([
      this.api.post<{ sedes: SedeAdmin[] }>('sedes/list_sedes_admin.php'),
      this.api.post<{ empresas: Empresa[] }>('empresas/list_empresas.php'),
    ]));
    if (s.action && s.data) this.sedes.set(s.data.sedes);
    if (e.action && e.data) this.empresas.set(e.data.empresas);
  }

  moduleLabel(code: string): string {
    return findModule(code)?.label ?? code;
  }

  async support(s: SedeAdmin): Promise<void> {
    const err = await this.loading.wrap(() => this.session.switchSede(s.id));
    if (err) await this.dialogs.error({ title: this.i18n.t('sede.switch_error'), message: err });
  }

  invite(s: SedeAdmin): void {
    const data: InviteCodeData = {
      sedeNombre: s.nombre, codigo: s.codigo_invitacion,
      regenerate: async () => {
        const r = await this.api.post<{ codigo_invitacion: string }>('sedes/save_sede.php', { id: s.id, regenerar_codigo: 1 });
        if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('common.error'), message: r.mensaje }); return null; }
        void this.load();
        return r.data.codigo_invitacion;
      },
    };
    this.matDialog.open(InviteCodeDialogComponent, { ...dialogSize('480px'), data });
  }

  async toggleActive(s: SedeAdmin): Promise<void> {
    if (s.activo && !(await this.dialogs.confirm({
      title: this.i18n.t('admin.sedes.deactivate'), message: this.i18n.t('admin.sedes.deactivate_confirm', { sede: s.nombre }),
      confirmText: this.i18n.t('admin.sedes.deactivate'), danger: true,
    }))) return;
    const r = await this.loading.wrap(() => this.api.post('sedes/save_sede.php', { id: s.id, activo: s.activo ? 0 : 1 }));
    if (!r.action) await this.dialogs.error({ title: this.i18n.t('common.error'), message: r.mensaje });
    await this.load();
  }

  editSede(s: SedeAdmin | null): void {
    this.matDialog.open(SedeDialogComponent, {
      ...dialogSize('480px'),
      data: { sede: s, empresas: this.empresas(), empresaDefault: this.empresaFiltro() || this.empresas()[0]?.id },
    }).afterClosed().subscribe(changed => { if (changed) void this.load(); });
  }

  modules(s: SedeAdmin): void {
    this.matDialog.open(SedeModulosDialogComponent, { ...dialogSize('720px'), data: s })
      .afterClosed().subscribe(async changed => {
        if (!changed) return;
        await this.load();
        if (s.id === this.session.sedeId()) await this.session.reload(); // el switcher refleja el contrato al instante
      });
  }
}

interface SedeDialogData { sede: SedeAdmin | null; empresas: Empresa[]; empresaDefault?: number }

@Component({
  selector: 'app-sede-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatHint, MatInput, MatSelect, MatOption, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (d.sede ? 'admin.sedes.edit' : 'admin.sedes.new') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'admin.sedes.name' | translate }}</mat-label>
          <input matInput id="sede-nombre" [(ngModel)]="nombre" maxlength="150" required />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'admin.sedes.company' | translate }}</mat-label>
          <mat-select [(ngModel)]="idEmpresa">
            @for (e of d.empresas; track e.id) { <mat-option [value]="e.id">{{ e.nombre }}</mat-option> }
          </mat-select>
          <mat-hint>{{ 'admin.sedes.company_hint' | translate }}</mat-hint>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-sede" (click)="save()" [disabled]="saving() || !nombre.trim() || !idEmpresa">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class SedeDialogComponent {
  readonly d = inject<SedeDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SedeDialogComponent, boolean>);
  private api = inject(ApiService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  nombre = this.d.sede?.nombre ?? '';
  idEmpresa = this.d.sede?.id_empresa ?? this.d.empresaDefault ?? 0;
  readonly saving = signal(false);

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.api.post('sedes/save_sede.php', { id: this.d.sede?.id ?? 0, nombre: this.nombre.trim(), id_empresa: this.idEmpresa });
      if (!r.action) { await this.dialogs.error({ title: this.i18n.t('admin.sedes.save_error'), message: r.mensaje }); return; }
      this.ref.close(true);
    } catch {
      await this.dialogs.error({ title: this.i18n.t('admin.sedes.save_error'), message: this.i18n.t('common.error') });
    } finally {
      this.saving.set(false);
    }
  }
}

interface ModuloContrato {
  codigo: string; nombre: string; catalogo_activo: boolean; contratado: boolean; activo: boolean; vigente: boolean;
  fecha_inicio: string | null; fecha_fin: string | null; notas: string | null;
}

@Component({
  selector: 'app-sede-modulos-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatInput, MatIcon, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'admin.sedes.modules_of' | translate: { sede: d.nombre } }}</h2>
    <mat-dialog-content>
      <p class="muted intro">{{ 'admin.sedes.modules_desc' | translate }}</p>
      @for (m of rows(); track m.codigo) {
        <div class="row" [class.on]="m.activo">
          <div class="head">
            @if (moduleDef(m.codigo); as def) {
              <span class="badge" [attr.data-tone]="def.tone"><mat-icon>{{ def.icon }}</mat-icon></span>
            }
            <strong>{{ moduleLabel(m.codigo) | translate }}</strong>
            @if (m.contratado && m.activo && !m.vigente) { <span class="warn">{{ 'admin.sedes.out_of_range' | translate }}</span> }
            <span class="spacer"></span>
            <mat-slide-toggle [ngModel]="m.activo" (ngModelChange)="patch(m.codigo, { activo: $event })" [attr.aria-label]="moduleLabel(m.codigo) | translate"></mat-slide-toggle>
          </div>
          @if (m.activo) {
            <div class="form-row">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'admin.sedes.from' | translate }}</mat-label>
                <input matInput type="date" [ngModel]="m.fecha_inicio" (ngModelChange)="patch(m.codigo, { fecha_inicio: $event || null })" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'admin.sedes.to' | translate }}</mat-label>
                <input matInput type="date" [ngModel]="m.fecha_fin" (ngModelChange)="patch(m.codigo, { fecha_fin: $event || null })" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ 'admin.sedes.notes' | translate }}</mat-label>
                <input matInput [ngModel]="m.notas" (ngModelChange)="patch(m.codigo, { notas: $event })" maxlength="255" />
              </mat-form-field>
            </div>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-modules" (click)="save()" [disabled]="saving() || !dirty().size">{{ (saving() ? 'common.saving' : 'common.save') | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .intro { margin: 0 0 12px; }
    .row { padding: 12px 0; border-top: 1px solid var(--md-sys-color-outline-variant); display: flex; flex-direction: column; gap: 12px; }
    .head { display: flex; align-items: center; gap: 12px; }
    .badge {
      width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; flex: none;
      mat-icon { font-size: 20px; width: 20px; height: 20px; }
      &[data-tone='primary'] { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
      &[data-tone='secondary'] { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
      &[data-tone='tertiary'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    }
    .row:not(.on) .badge { filter: grayscale(1); opacity: 0.6; }
    .warn { padding: 2px 8px; border-radius: 8px; background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); font: var(--mat-sys-label-small); }
  `,
})
export class SedeModulosDialogComponent {
  readonly d = inject<SedeAdmin>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SedeModulosDialogComponent, boolean>);
  private api = inject(ApiService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);

  readonly rows = signal<ModuloContrato[]>([]);
  readonly dirty = signal(new Set<string>());
  readonly saving = signal(false);

  constructor() {
    void this.loading.wrap(() => this.api.post<{ modulos: ModuloContrato[] }>('modulos/get_sede_modulos.php', { id_sede: this.d.id }))
      .then(r => { if (r.action && r.data) this.rows.set(r.data.modulos); });
  }

  moduleDef(code: string) { return findModule(code); }
  moduleLabel(code: string): string { return findModule(code)?.label ?? code; }

  patch(code: string, changes: Partial<ModuloContrato>): void {
    this.rows.update(rs => rs.map(r => (r.codigo === code ? { ...r, ...changes } : r)));
    this.dirty.update(s => new Set(s).add(code));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      for (const m of this.rows().filter(r => this.dirty().has(r.codigo))) {
        const r = await this.api.post('modulos/save_sede_modulo.php', {
          id_sede: this.d.id, codigo: m.codigo, activo: m.activo ? 1 : 0,
          fecha_inicio: m.fecha_inicio ?? '', fecha_fin: m.fecha_fin ?? '', notas: m.notas ?? '',
        });
        if (!r.action) {
          await this.dialogs.error({ title: this.i18n.t('admin.sedes.modules_error', { modulo: this.i18n.t(this.moduleLabel(m.codigo)) }), message: r.mensaje });
          return;
        }
      }
      this.ref.close(true);
    } catch {
      await this.dialogs.error({ title: this.i18n.t('common.error'), message: this.i18n.t('common.error') });
    } finally {
      this.saving.set(false);
    }
  }
}
