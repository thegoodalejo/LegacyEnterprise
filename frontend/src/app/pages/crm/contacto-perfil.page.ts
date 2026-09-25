import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TagChipComponent } from '../../components/tag-chip.component';
import { TagPickerDialogComponent, TagPickerResult } from '../../components/tag-picker-dialog.component';
import { CampoConValor, ContactoDetalle, CrmService } from '../../services/crm.service';
import { DialogService, dialogSize } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SessionService } from '../../services/session.service';
import { TranslatePipe, TranslationService } from '../../services/translation.service';
import { ContactoDialogComponent, ContactoDialogResult } from './contacto-dialog.component';
import { formatDateTime, initials, isoToDmy } from './crm-format';
import { HistorialDialogComponent } from './historial-dialog.component';

/** Perfil de un Persona u Organización: datos, vínculos, etiquetas, campos personalizados, auditoría e historial. */
@Component({
  selector: 'app-contacto-perfil-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButton, MatIconButton, MatIcon, MatTooltip, TagChipComponent, TranslatePipe],
  template: `
    <div class="page">
      @if (d(); as det) {
        @let c = det.contacto;
        <header class="head">
          <a mat-icon-button routerLink="/m/crm/contactos" [attr.aria-label]="'crm.back' | translate"><mat-icon>arrow_back</mat-icon></a>
          <span class="avatar" [attr.data-tipo]="c.tipo" aria-hidden="true">
            @if (c.tipo === 'persona') { {{ ini() }} } @else { <mat-icon>business</mat-icon> }
          </span>
          <div class="title">
            <h1 id="contact-name">{{ c.nombre_completo }}</h1>
            <div class="badges">
              <span class="pill">{{ 'crm.tipo.' + c.tipo | translate }}</span>
              @if (!c.activo) { <span class="pill warn" id="badge-archived">{{ 'crm.filters.archived_one' | translate }}</span> }
            </div>
          </div>
          <div class="actions">
            <button mat-flat-button id="btn-edit" (click)="edit()"><mat-icon>edit</mat-icon>{{ 'common.edit' | translate }}</button>
            @if (canAudit()) {
              <button mat-icon-button id="btn-history" (click)="history()" [matTooltip]="'crm.hist.title' | translate" [attr.aria-label]="'crm.hist.title' | translate">
                <mat-icon>history</mat-icon>
              </button>
              <button mat-icon-button id="btn-delete" (click)="toggleArchived()" [matTooltip]="(c.activo ? 'crm.delete' : 'crm.restore') | translate" [attr.aria-label]="(c.activo ? 'crm.delete' : 'crm.restore') | translate">
                <mat-icon>{{ c.activo ? 'delete' : 'restore_from_trash' }}</mat-icon>
              </button>
            }
          </div>
        </header>

        <div class="grid">
          <section class="card">
            <h2>{{ 'crm.profile.data' | translate }}</h2>
            <dl>
              @if (c.tipo === 'persona') {
                @if (docLabel()) { <div><dt>{{ 'crm.form.doc_number' | translate }}</dt><dd>{{ docLabel() }}</dd></div> }
                @if (c.correo) { <div><dt>{{ 'crm.form.correo' | translate }}</dt><dd>{{ c.correo }}</dd></div> }
                @if (c.whatsapp_numero) { <div><dt>{{ 'crm.form.whatsapp' | translate }}</dt><dd>+{{ c.whatsapp_indicativo }} {{ c.whatsapp_numero }}</dd></div> }
                @if (c.fecha_nacimiento) { <div><dt>{{ 'crm.form.nacimiento' | translate }}</dt><dd>{{ fmt(c.fecha_nacimiento) }}</dd></div> }
              } @else {
                @if (docLabel()) { <div><dt>{{ 'crm.form.doc_number_org' | translate }}</dt><dd>{{ docLabel() }}</dd></div> }
                @if (c.correo_facturacion) { <div><dt>{{ 'crm.form.correo_fact' | translate }}</dt><dd>{{ c.correo_facturacion }}</dd></div> }
                @if (c.id_padre) {
                  <div id="profile-parent"><dt>{{ 'crm.profile.parent' | translate }}</dt><dd><a class="inline-link" [routerLink]="['/m/crm/contactos', c.id_padre]">{{ c.padre_nombre }}</a></dd></div>
                }
              }
              @if (c.telefono) { <div><dt>{{ 'crm.form.telefono' | translate }}</dt><dd>{{ c.telefono }}</dd></div> }
              @if (c.direccion || c.ciudad) { <div><dt>{{ 'crm.form.direccion' | translate }}</dt><dd>{{ [c.direccion, c.ciudad].filter(x => x).join(', ') }}</dd></div> }
              <div><dt>{{ 'crm.form.responsable' | translate }}</dt><dd>{{ c.responsable_nombre || '—' }}</dd></div>
            </dl>
          </section>

          <section class="card">
            <h2>{{ (c.tipo === 'organizacion' ? 'crm.profile.people' : 'crm.profile.orgs') | translate }}</h2>
            @for (v of det.vinculos; track v.id) {
              <a class="link-row" [routerLink]="['/m/crm/contactos', v.id]">
                <mat-icon>{{ c.tipo === 'organizacion' ? 'person' : 'business' }}</mat-icon>
                <span class="link-text">
                  <strong>{{ v.nombre_completo }}</strong>
                  <span class="muted small">{{ [v.rol, v.telefono, v.correo].filter(x => x).join(' · ') }}</span>
                </span>
                @if (v.principal) { <mat-icon class="star" [matTooltip]="'crm.profile.main' | translate">star</mat-icon> }
              </a>
            } @empty { <p class="muted">—</p> }
          </section>

          @if (det.hijas.length) {
            <section class="card" id="profile-children">
              <h2>{{ 'crm.profile.children' | translate }} ({{ det.hijas.length }})</h2>
              @for (h of det.hijas; track h.id) {
                <a class="link-row" [routerLink]="['/m/crm/contactos', h.id]">
                  <mat-icon>business</mat-icon>
                  <span class="link-text">
                    <strong>{{ h.nombre_completo }}</strong>
                    @if (!h.activo) { <span class="muted small">{{ 'crm.filters.archived_one' | translate }}</span> }
                  </span>
                </a>
              }
            </section>
          }

          <section class="card">
            <div class="card-head">
              <h2>{{ 'crm.form.tags' | translate }}</h2>
              <button mat-button id="btn-edit-tags" (click)="editTags()"><mat-icon>label</mat-icon>{{ 'crm.form.edit_tags' | translate }}</button>
            </div>
            <div class="chips" id="profile-tags">
              @for (t of det.tags; track t.id) { <app-tag-chip [nombre]="t.nombre" [color]="t.color" /> } @empty { <span class="muted">—</span> }
            </div>
          </section>

          @if (det.campos.length) {
            <section class="card">
              <h2>{{ 'crm.form.custom' | translate }}</h2>
              <dl id="profile-custom">
                @for (f of det.campos; track f.id) { <div><dt>{{ f.etiqueta }}</dt><dd>{{ valor(f) }}</dd></div> }
              </dl>
            </section>
          }
        </div>

        <footer class="audit muted small" id="audit-info">
          <span>{{ 'crm.profile.created' | translate: { date: fmtDt(c.created_at), user: c.creado_por_nombre || '—' } }}</span>
          <span>{{ 'crm.profile.modified' | translate: { date: fmtDt(c.updated_at), user: c.modificado_por_nombre || '—' } }}</span>
        </footer>
      } @else if (notFound()) {
        <div class="empty-state">
          <mat-icon>search_off</mat-icon><strong>{{ 'crm.profile.not_found' | translate }}</strong>
          <a mat-button routerLink="/m/crm/contactos">{{ 'crm.back' | translate }}</a>
        </div>
      }
    </div>
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
    .avatar {
      width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; flex: none; font: var(--mat-sys-title-medium);
      background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);
      &[data-tipo='organizacion'] { background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); }
    }
    .title { flex: 1 1 200px; min-width: 0; h1 { margin: 0; font: var(--mat-sys-headline-small); overflow-wrap: anywhere; } }
    .badges { display: flex; gap: 6px; margin-top: 4px; }
    .pill { padding: 2px 10px; border-radius: 8px; font: var(--mat-sys-label-medium); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
    .pill.warn { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); }
    .actions { display: flex; align-items: center; gap: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start; }
    .card { padding: 20px; border-radius: 20px; background: var(--md-sys-color-surface-container-low); border: 1px solid var(--md-sys-color-outline-variant); min-width: 0; }
    .card h2 { margin: 0 0 12px; font: var(--mat-sys-title-medium); }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; h2 { margin: 0; } }
    dl { margin: 0; display: flex; flex-direction: column; gap: 10px; }
    dl > div { display: flex; flex-direction: column; }
    dt { font: var(--mat-sys-label-medium); color: var(--md-sys-color-on-surface-variant); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .link-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; text-decoration: none; color: inherit; border-bottom: 1px solid var(--md-sys-color-outline-variant); &:last-child { border: none; } }
    .link-text { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .star { color: var(--md-sys-color-primary); font-variation-settings: 'FILL' 1; }
    .small { font: var(--mat-sys-body-small); }
    .inline-link { color: var(--md-sys-color-primary); }
    .audit { display: flex; flex-wrap: wrap; gap: 4px 24px; margin-top: 20px; }
  `,
})
export default class ContactoPerfilPage {
  /** Parámetro :id de la ruta (component input binding). */
  readonly id = input<string>();
  private crm = inject(CrmService);
  private loading = inject(LoadingService);
  private dialogs = inject(DialogService);
  private matDialog = inject(MatDialog);
  private router = inject(Router);
  private session = inject(SessionService);
  private i18n = inject(TranslationService);

  readonly d = signal<ContactoDetalle | null>(null);
  readonly notFound = signal(false);
  readonly canAudit = computed(() => this.session.hasMinRole('L2'));
  readonly ini = computed(() => initials(this.d()?.contacto.nombre_completo ?? ''));
  readonly docLabel = computed(() => {
    const c = this.d()?.contacto;
    return c?.documento_numero ? [c.documento_tipo, c.documento_numero].filter(x => x).join(' ') : '';
  });

  constructor() {
    effect(() => {
      const id = Number(this.id());
      // untracked: load() usa LoadingService.wrap(), que lee sus propias señales; sin esto el efecto se re-dispararía
      // con cada carga de cualquier otra pantalla o diálogo (bucle de recargas con el overlay siempre visible).
      if (id > 0) untracked(() => void this.load(id));
    });
  }

  async load(id = Number(this.id())): Promise<void> {
    this.notFound.set(false);
    const r = await this.loading.wrap(() => this.crm.getContacto(id));
    if (r.action && r.data) this.d.set(r.data);
    else { this.d.set(null); this.notFound.set(true); }
  }

  fmt(iso: string): string { return isoToDmy(iso); }
  fmtDt(s: string): string { return formatDateTime(s); }

  valor(f: CampoConValor): string {
    const v = f.valor;
    if (v === null || v === '') return '—';
    if (typeof v === 'boolean') return this.i18n.t(v ? 'common.yes' : 'common.no');
    return f.tipo_dato === 'fecha' ? isoToDmy(String(v)) : String(v);
  }

  edit(): void {
    const c = this.d()?.contacto;
    if (!c) return;
    this.matDialog.open(ContactoDialogComponent, { ...dialogSize('720px'), data: { id: c.id }, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(async (r: ContactoDialogResult | undefined) => {
        if (!r) return;
        await this.load();
        const dup = r.advertencias?.find(a => a.tipo === 'documento_duplicado');
        if (dup) {
          await this.dialogs.info({
            title: this.i18n.t('crm.warn.dup_title'),
            message: this.i18n.t('crm.warn.dup_msg', { names: dup.contactos.map(x => x.nombre_completo).join(', ') }),
          });
        }
      });
  }

  editTags(): void {
    const det = this.d();
    if (!det) return;
    const actuales = det.tags.map(t => ({ id: t.id, nombre: t.nombre, color: t.color }));
    this.matDialog.open(TagPickerDialogComponent, {
      ...dialogSize('480px'), data: { seleccion: actuales.map(t => t.id), actuales, tipo: det.contacto.tipo },
    }).afterClosed().subscribe(async (r: TagPickerResult | undefined) => {
      if (!r) return;
      const res = await this.loading.wrap(() => this.crm.setTags(det.contacto.id, r.ids));
      if (!res.action) await this.dialogs.error({ title: this.i18n.t('crm.form.save_error'), message: res.mensaje });
      await this.load();
    });
  }

  history(): void {
    const c = this.d()?.contacto;
    if (c) this.matDialog.open(HistorialDialogComponent, { ...dialogSize('560px'), data: { id: c.id, nombre: c.nombre_completo } });
  }

  async toggleArchived(): Promise<void> {
    const c = this.d()?.contacto;
    if (!c) return;
    const archivar = c.activo;
    const ok = await this.dialogs.confirm({
      title: this.i18n.t(archivar ? 'crm.delete_one_title' : 'crm.restore_one_title'),
      message: this.i18n.t(archivar ? 'crm.delete_one_msg' : 'crm.restore_one_msg', { name: c.nombre_completo }),
      confirmText: this.i18n.t(archivar ? 'crm.delete' : 'crm.restore'), danger: archivar,
    });
    if (!ok) return;
    const r = await this.loading.wrap(() => this.crm.bulk(archivar ? 'archivar' : 'restaurar', { ids: [c.id] }));
    if (!r.action) { await this.dialogs.error({ title: this.i18n.t('crm.bulk.error'), message: r.mensaje }); return; }
    if (archivar) await this.router.navigateByUrl('/m/crm/contactos');
    else await this.load();
  }
}
