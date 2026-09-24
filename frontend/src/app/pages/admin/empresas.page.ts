import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ApiService } from '../../services/api.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { ThemeService } from '../../services/theme.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { BrandSeeds, DEFAULT_BRAND, brandTokens, isValidSeeds } from '../../theme/brand-scheme';

export interface Empresa {
  id: number; nombre: string; nit: string | null;
  color_primario: string | null; color_secundario: string | null; color_terciario: string | null;
  logo_url: string | null; activo: boolean; sedes: number;
}

/** Panel de plataforma (L5): empresas y su marca blanca (paleta + logo). */
@Component({
  selector: 'app-empresas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButton, MatIcon, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ 'admin.companies.title' | translate }}</h1>
        <div class="actions">
          <button mat-flat-button id="btn-new-company" (click)="edit(null)"><mat-icon>add</mat-icon>{{ 'admin.companies.new' | translate }}</button>
        </div>
      </header>
      <div class="grid">
        @for (e of empresas(); track e.id) {
          <article class="card" [class.inactive]="!e.activo">
            <div class="head">
              <img class="logo" [src]="e.logo_url || 'logo.svg'" alt="" />
              <div class="title">
                <strong>{{ e.nombre }}</strong>
                <span class="muted">{{ e.nit ? ('admin.companies.nit_short' | translate) + ' ' + e.nit : ('admin.companies.no_nit' | translate) }}</span>
              </div>
            </div>
            <div class="meta">
              @if (e.color_primario) {
                <span class="swatches" [attr.aria-label]="'admin.companies.custom_brand' | translate">
                  <i [style.background]="e.color_primario"></i><i [style.background]="e.color_secundario"></i><i [style.background]="e.color_terciario"></i>
                </span>
              } @else {
                <span class="muted small">{{ 'admin.companies.default_brand' | translate }}</span>
              }
              <span class="muted small">{{ 'admin.companies.sedes_count' | translate: { n: e.sedes } }}</span>
              @if (!e.activo) { <span class="muted small">· {{ 'common.inactive' | translate }}</span> }
            </div>
            <div class="card-actions">
              <a mat-button [routerLink]="'/admin/sedes'" [queryParams]="{ empresa: e.id }"><mat-icon>store</mat-icon>{{ 'nav.admin.sedes' | translate }}</a>
              <button mat-button (click)="edit(e)"><mat-icon>edit</mat-icon>{{ 'common.edit' | translate }}</button>
            </div>
          </article>
        } @empty {
          <div class="empty-state"><mat-icon>domain_add</mat-icon><span>{{ 'admin.companies.empty' | translate }}</span></div>
        }
      </div>
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .card {
      display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 20px;
      background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant);
      &.inactive { opacity: 0.6; }
    }
    .head { display: flex; gap: 14px; align-items: center; min-width: 0; }
    .logo { width: 48px; height: 48px; object-fit: contain; border-radius: 12px; background: var(--md-sys-color-surface-container-lowest); padding: 4px; flex: none; }
    .title { display: flex; flex-direction: column; min-width: 0; strong { overflow-wrap: anywhere; } }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .swatches { display: inline-flex; gap: 4px; i { width: 18px; height: 18px; border-radius: 6px; border: 1px solid var(--md-sys-color-outline-variant); } }
    .small { font: var(--mat-sys-body-small); }
    .card-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; margin-top: auto; }
    @media (max-width: 599px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export default class EmpresasPage {
  private api = inject(ApiService);
  private loading = inject(LoadingService);
  private matDialog = inject(MatDialog);
  private session = inject(SessionService);
  readonly empresas = signal<Empresa[]>([]);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const r = await this.loading.wrap(() => this.api.post<{ empresas: Empresa[] }>('empresas/list_empresas.php'));
    if (r.action && r.data) this.empresas.set(r.data.empresas);
  }

  edit(e: Empresa | null): void {
    this.matDialog.open(EmpresaDialogComponent, { ...dialogSize('720px'), data: e, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(async () => {
        // Siempre: una empresa recién creada o un logo subido cuentan aunque se cierre con Cancelar.
        await this.load();
        // Si se editó la empresa de la sede activa, la marca de la app cambia al instante.
        if (e && e.id === this.session.user()?.id_empresa) await this.session.reload();
      });
  }
}

@Component({
  selector: 'app-empresa-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButton, MatFormField, MatLabel, MatSuffix, MatInput, MatIcon, MatSlideToggle, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (id() ? 'admin.companies.edit' : 'admin.companies.new') | translate }}</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'admin.companies.name' | translate }}</mat-label>
            <input matInput id="empresa-nombre" [(ngModel)]="nombre" maxlength="150" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'admin.companies.nit' | translate }}</mat-label>
            <input matInput [(ngModel)]="nit" maxlength="30" />
          </mat-form-field>
        </div>
        <mat-slide-toggle [(ngModel)]="activo">{{ 'admin.companies.active' | translate }}</mat-slide-toggle>

        <section class="brand">
          <div class="brand-head">
            <h3>{{ 'admin.companies.brand' | translate }}</h3>
            <mat-slide-toggle id="toggle-brand" [ngModel]="custom()" (ngModelChange)="custom.set($event)">{{ 'admin.companies.custom_brand' | translate }}</mat-slide-toggle>
          </div>
          @if (custom()) {
            <div class="form-row">
              @for (k of keys; track k) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ 'admin.companies.color_' + k | translate }}</mat-label>
                  <input matInput [id]="'hex-' + k" [ngModel]="seeds()[k]" (ngModelChange)="setSeed(k, $event)" maxlength="7" />
                  <input matSuffix type="color" class="picker" [ngModel]="seeds()[k]" (ngModelChange)="setSeed(k, $event)" [attr.aria-label]="'admin.companies.color_' + k | translate" />
                </mat-form-field>
              }
            </div>
          }
          <!-- Vista previa: los mismos tokens que aplicará BrandingService, en el tema actual. -->
          <div class="preview" [style]="previewStyle()">
            <div class="pv-bar"><img [src]="logo() || 'logo.svg'" alt="" /><strong>{{ nombre || '—' }}</strong></div>
            <div class="pv-body">
              <span class="pv-btn">{{ 'admin.companies.preview_button' | translate }}</span>
              <span class="pv-chip p">CRM</span><span class="pv-chip s">{{ 'modules.agenda' | translate }}</span><span class="pv-chip t">{{ 'modules.pedidos' | translate }}</span>
            </div>
          </div>
          @if (custom() && !validSeeds()) { <p class="err">{{ 'admin.companies.invalid_colors' | translate }}</p> }

          <div class="logo-row">
            <img class="logo-preview" [src]="logo() || 'logo.svg'" alt="" />
            <div class="logo-actions">
              @if (id()) {
                <button mat-stroked-button (click)="file.click()" [disabled]="uploading()"><mat-icon>upload</mat-icon>{{ (uploading() ? 'common.saving' : 'admin.companies.upload_logo') | translate }}</button>
                @if (logo()) { <button mat-button (click)="removeLogo = true; logo.set(null)"><mat-icon>delete</mat-icon>{{ 'admin.companies.remove_logo' | translate }}</button> }
                <input #file type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" (change)="upload(file)" />
                <span class="muted small">{{ 'admin.companies.logo_hint' | translate }}</span>
              } @else {
                <span class="muted small">{{ 'admin.companies.logo_after_save' | translate }}</span>
              }
            </div>
          </div>
        </section>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button id="btn-save-company" (click)="save()" [disabled]="saving() || !nombre.trim() || (custom() && !validSeeds())">
        {{ (saving() ? 'common.saving' : 'common.save') | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    h3 { margin: 0; font: var(--mat-sys-title-medium); }
    .brand { display: flex; flex-direction: column; gap: 16px; padding-top: 8px; border-top: 1px solid var(--md-sys-color-outline-variant); }
    .brand-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
    .picker { width: 32px; height: 32px; border: none; padding: 0; margin-right: 8px; background: none; cursor: pointer; }
    .preview { border-radius: 16px; overflow: hidden; border: 1px solid var(--md-sys-color-outline-variant); background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); }
    .pv-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--md-sys-color-surface-container); img { width: 28px; height: 28px; object-fit: contain; } }
    .pv-body { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 16px 14px; }
    .pv-btn { padding: 8px 18px; border-radius: 999px; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); font: var(--mat-sys-label-large); }
    .pv-chip { padding: 6px 12px; border-radius: 10px; font: var(--mat-sys-label-medium); }
    .pv-chip.p { background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
    .pv-chip.s { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
    .pv-chip.t { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    .err { margin: 0; color: var(--md-sys-color-error); font: var(--mat-sys-body-small); }
    .logo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
    .logo-preview { width: 64px; height: 64px; object-fit: contain; border-radius: 16px; padding: 6px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); }
    .logo-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; flex: 1 1 240px; }
    .small { font: var(--mat-sys-body-small); flex-basis: 100%; }
  `,
})
export class EmpresaDialogComponent {
  private readonly e = inject<Empresa | null>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<EmpresaDialogComponent, boolean>);
  private api = inject(ApiService);
  private dialogs = inject(DialogService);
  private i18n = inject(TranslationService);
  private theme = inject(ThemeService);

  readonly keys = ['primary', 'secondary', 'tertiary'] as const;
  readonly id = signal(this.e?.id ?? 0);
  nombre = this.e?.nombre ?? '';
  nit = this.e?.nit ?? '';
  activo = this.e?.activo ?? true;
  removeLogo = false;
  readonly custom = signal(!!this.e?.color_primario);
  readonly seeds = signal<BrandSeeds>(this.e?.color_primario
    ? { primary: this.e.color_primario, secondary: this.e.color_secundario ?? '', tertiary: this.e.color_terciario ?? '' }
    : { ...DEFAULT_BRAND });
  readonly logo = signal<string | null>(this.e?.logo_url ?? null);
  readonly saving = signal(false);
  readonly uploading = signal(false);

  readonly validSeeds = computed(() => isValidSeeds(this.seeds()));
  readonly previewStyle = computed(() => {
    const seeds = this.custom() && this.validSeeds() ? this.seeds() : DEFAULT_BRAND;
    const t = brandTokens(seeds, this.theme.mode() === 'dark');
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [`--md-sys-color-${k}`, v]));
  });

  setSeed(k: keyof BrandSeeds, v: string): void {
    this.seeds.update(s => ({ ...s, [k]: (v ?? '').trim() }));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const s = this.seeds();
      const c = this.custom();
      const r = await this.api.post<Empresa>('empresas/save_empresa.php', {
        id: this.id(), nombre: this.nombre.trim(), nit: this.nit.trim(), activo: this.activo ? 1 : 0,
        color_primario: c ? s.primary : '', color_secundario: c ? s.secondary : '', color_terciario: c ? s.tertiary : '',
        quitar_logo: this.removeLogo ? 1 : 0,
      });
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('admin.companies.save_error'), message: r.mensaje }); return; }
      if (!this.id()) {
        // Recién creada: queda abierta para subir el logo.
        this.id.set(r.data.id);
        await this.dialogs.success({ title: this.i18n.t('admin.companies.created'), message: this.i18n.t('admin.companies.created_desc') });
        return;
      }
      this.ref.close(true);
    } catch {
      await this.dialogs.error({ title: this.i18n.t('admin.companies.save_error'), message: this.i18n.t('common.error') });
    } finally {
      this.saving.set(false);
    }
  }

  async upload(input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.uploading.set(true);
    try {
      const r = await this.api.post<{ logo_url: string }>('empresas/upload_logo.php', { id_empresa: this.id() }, { file: f });
      if (!r.action || !r.data) { await this.dialogs.error({ title: this.i18n.t('admin.companies.logo_error'), message: r.mensaje }); return; }
      this.logo.set(r.data.logo_url);
      this.removeLogo = false;
    } catch {
      await this.dialogs.error({ title: this.i18n.t('admin.companies.logo_error'), message: this.i18n.t('common.error') });
    } finally {
      this.uploading.set(false);
    }
  }

}
